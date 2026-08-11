"""
NexaMind Backend — Agent Chat & Streaming Routes with Memory Layer Integration

Handles:
  • POST /api/v1/agent/chat (non-streaming)
  • POST /api/v1/agent/chat/stream (SSE streaming with Short & Long-Term Memory)
  • GET  /api/v1/agent/me (auth verification)
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Any, AsyncGenerator

import google.generativeai as genai
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from config import get_settings
from db.mongo import MongoDB
from middleware.auth import get_current_user
from memory.long_term import LongTermMemory
from memory.short_term import ShortTermMemory
from models.chat import (
    AgentType,
    ChatRequest,
    ChatResponse,
    MessageRole,
    Source,
)
from models.user import TokenPayload
from pipelines.retrieval import RAGRetrievalPipeline
from utils.streaming import StreamChunk, StreamingManager

logger = logging.getLogger("nexamind.routes.agent")

router = APIRouter()

# ── Setup ──────────────────────────────────────────────────────────────────────
_settings = get_settings()
genai.configure(api_key=_settings.gemini_api_key)

FLASH_MODEL = "gemini-2.5-flash"
FLASH_LITE_MODEL = "gemini-2.0-flash-lite"

streaming_manager = StreamingManager()
long_term_memory = LongTermMemory()


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/v1/agent/chat (Non-streaming)
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Send a message to the AI agent (non-streaming)",
)
async def agent_chat(
    request: ChatRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> ChatResponse:
    user_id = current_user.user_id

    # a. Get or create chat
    chat_doc = await _get_or_create_chat(user_id, request.chatId)
    chat_id = str(chat_doc["_id"])
    is_new_chat = request.chatId is None or chat_doc.get("messageCount", 0) == 0

    # b. Save user message BEFORE calling LLM
    user_msg_id = str(ObjectId())
    user_msg_doc = {
        "_id": ObjectId(user_msg_id),
        "chatId": chat_id,
        "role": MessageRole.USER.value,
        "content": request.message,
        "agentType": None,
        "sources": [],
        "tokensUsed": None,
        "modelUsed": None,
        "createdAt": datetime.now(tz=timezone.utc),
    }
    await MongoDB.messages().insert_one(user_msg_doc)

    # c. Fetch short-term history & long-term memories
    short_term = ShortTermMemory(chat_id, user_id)
    history = await short_term.get_window_with_summary()
    user_context = await long_term_memory.get_user_context_summary(user_id)
    relevant_memories = await long_term_memory.retrieve_relevant(request.message, user_id, n_results=8)

    # d. RAG retrieval
    pipeline = RAGRetrievalPipeline()
    chunks = await pipeline.retrieve_with_context(
        query=request.message,
        user_id=user_id,
        chat_history=history,
        n_chunks=5,
        filter_doc_ids=request.attachedDocIds or None,
    )

    if chunks:
        prompt = _build_full_prompt(
            query=request.message,
            user_context=user_context,
            chunks=chunks,
            memories=relevant_memories,
            history=history,
            pipeline=pipeline,
        )
        assistant_content, model_used = await _call_gemini(prompt, FLASH_MODEL)
        agent_type = AgentType.RAG
        sources = pipeline.extract_sources(chunks, assistant_content)
    else:
        prompt = _build_full_prompt(
            query=request.message,
            user_context=user_context,
            chunks=[],
            memories=relevant_memories,
            history=history,
            pipeline=pipeline,
        )
        assistant_content, model_used = await _call_direct(prompt, history)
        agent_type = AgentType.DIRECT
        sources = []

    # Save assistant message
    assistant_msg_id = str(ObjectId())
    source_docs = [
        {
            "documentId": s.documentId,
            "filename": s.filename,
            "pageNumber": s.pageNumber,
            "chunkText": s.chunkText,
        }
        for s in sources
    ]
    assistant_msg_doc = {
        "_id": ObjectId(assistant_msg_id),
        "chatId": chat_id,
        "role": MessageRole.ASSISTANT.value,
        "content": assistant_content,
        "agentType": agent_type.value,
        "sources": source_docs,
        "tokensUsed": None,
        "modelUsed": model_used,
        "createdAt": datetime.now(tz=timezone.utc),
    }
    await MongoDB.messages().insert_one(assistant_msg_doc)

    # Update chat metadata
    await _update_chat_metadata(chat_doc, chat_id, is_new_chat, request.message)

    # Memory extraction (background task)
    asyncio.create_task(
        long_term_memory.extract_and_store(
            user_message=request.message,
            assistant_message=assistant_content,
            user_id=user_id,
            chat_id=chat_id,
            message_id=assistant_msg_id,
        )
    )

    return ChatResponse(
        chatId=chat_id,
        messageId=assistant_msg_id,
        content=assistant_content,
        agentType=agent_type,
        sources=sources,
        modelUsed=model_used,
    )


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/v1/agent/chat/stream (SSE Streaming with Memory Layer)
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/chat/stream",
    summary="Send a message and receive an SSE stream with Memory Context",
)
async def agent_chat_stream(
    request: ChatRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> StreamingResponse:
    user_id = current_user.user_id

    # a. Save user message to MongoDB immediately
    chat_doc = await _get_or_create_chat(user_id, request.chatId)
    chat_id = str(chat_doc["_id"])
    is_new_chat = request.chatId is None or chat_doc.get("messageCount", 0) == 0

    user_msg_id = str(ObjectId())
    user_msg_doc = {
        "_id": ObjectId(user_msg_id),
        "chatId": chat_id,
        "role": MessageRole.USER.value,
        "content": request.message,
        "agentType": None,
        "sources": [],
        "tokensUsed": None,
        "modelUsed": None,
        "createdAt": datetime.now(tz=timezone.utc),
    }
    await MongoDB.messages().insert_one(user_msg_doc)

    # b. Memory Layer: Short-term window & Long-term retrieval
    short_term = ShortTermMemory(chat_id, user_id)
    history = await short_term.get_window_with_summary()
    user_context = await long_term_memory.get_user_context_summary(user_id)
    relevant_memories = await long_term_memory.retrieve_relevant(request.message, user_id, n_results=8)

    # c. Intent classification
    intent_data = await _classify_intent(request.message, history)

    assistant_msg_id = str(ObjectId())

    async def event_generator() -> AsyncGenerator[str, None]:
        pipeline = RAGRetrievalPipeline()
        agent_type = AgentType.DIRECT
        sources: list[Source] = []
        chunks = []

        if intent_data.get("intent") == "rag" or request.attachedDocIds:
            chunks = await pipeline.retrieve_with_context(
                query=request.message,
                user_id=user_id,
                chat_history=history,
                n_chunks=5,
                filter_doc_ids=request.attachedDocIds or None,
            )

        if chunks:
            agent_type = AgentType.RAG
            prompt = _build_full_prompt(
                query=request.message,
                user_context=user_context,
                chunks=chunks,
                memories=relevant_memories,
                history=history,
                pipeline=pipeline,
            )

            async for chunk in streaming_manager.stream_gemini(
                prompt=prompt,
                model_name=FLASH_MODEL,
                chat_id=chat_id,
                message_id=assistant_msg_id,
                agent_type=agent_type.value,
                sources=chunks,
            ):
                if chunk.type == "done" and chunk.metadata.get("fullText"):
                    sources = pipeline.extract_sources(chunks, chunk.metadata["fullText"])
                    chunk.metadata["sources"] = [s.model_dump() for s in sources]
                yield f"data: {chunk.model_dump_json()}\n\n"
        else:
            agent_type = AgentType.DIRECT
            prompt = _build_full_prompt(
                query=request.message,
                user_context=user_context,
                chunks=[],
                memories=relevant_memories,
                history=history,
                pipeline=pipeline,
            )
            groq_messages = [
                {
                    "role": "system",
                    "content": f"You are NexaMind, a helpful personal AI assistant.\n{user_context}",
                },
                {"role": "user", "content": prompt},
            ]

            async for chunk in streaming_manager.stream_groq(
                messages=groq_messages,
                model_name="llama-3.3-70b-versatile",
                chat_id=chat_id,
                message_id=assistant_msg_id,
                agent_type=agent_type.value,
            ):
                yield f"data: {chunk.model_dump_json()}\n\n"

    return StreamingResponse(
        _wrap_and_persist_stream(
            generator=event_generator(),
            chat_doc=chat_doc,
            chat_id=chat_id,
            assistant_msg_id=assistant_msg_id,
            is_new_chat=is_new_chat,
            user_message=request.message,
            user_id=user_id,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/v1/agent/me
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/me", summary="Verify JWT authentication")
async def agent_me(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict[str, str]:
    return {
        "userId": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role.value,
    }


# ═════════════════════════════════════════════════════════════════════════════
# Internal Helpers
# ═════════════════════════════════════════════════════════════════════════════

def _build_full_prompt(
    query: str,
    user_context: str,
    chunks: list[Any],
    memories: list[Any],
    history: list[dict[str, str]],
    pipeline: RAGRetrievalPipeline,
) -> str:
    """Builds prompt structure with user context, RAG context, memories, and short-term window."""
    prompt_parts = ["SYSTEM:"]
    prompt_parts.append("You are NexaMind, a personal AI assistant.")
    if user_context:
        prompt_parts.append(user_context)

    if chunks:
        doc_context_parts = []
        for chunk in chunks:
            filename = chunk.metadata.get("filename", "Unknown document")
            idx = chunk.chunkIndex
            doc_context_parts.append(f"[Source: {filename}, chunk {idx}]\n{chunk.text}")
        doc_str = "\n\n---\n\n".join(doc_context_parts)
        prompt_parts.append(f"\nCONTEXT:\n{doc_str}")

    if memories:
        mem_lines = ["\nRELEVANT MEMORIES:"]
        for m in memories:
            mem_lines.append(f"- [{m.category}] {m.fact}")
        prompt_parts.append("\n".join(mem_lines))

    if history:
        hist_lines = ["\nCONVERSATION HISTORY:"]
        for msg in history[-10:]:
            role = "User" if msg.get("role") == "user" else "Assistant"
            hist_lines.append(f"{role}: {msg.get('content', '')[:400]}")
        prompt_parts.append("\n".join(hist_lines))

    prompt_parts.append(f"\nUSER: {query}")
    return "\n\n".join(prompt_parts)


async def _wrap_and_persist_stream(
    generator: AsyncGenerator[str, None],
    chat_doc: dict[str, Any],
    chat_id: str,
    assistant_msg_id: str,
    is_new_chat: bool,
    user_message: str,
    user_id: str,
) -> AsyncGenerator[str, None]:
    """Wraps SSE generator to save complete message and spawn background memory extraction."""
    accumulated_content = []
    final_metadata: dict[str, Any] = {}
    is_completed = False
    is_error = False

    try:
        async for line in generator:
            yield line

            if line.startswith("data: "):
                try:
                    payload = json.loads(line[6:].strip())
                    chunk_type = payload.get("type")
                    if chunk_type == "token":
                        accumulated_content.append(payload.get("content", ""))
                    elif chunk_type == "done":
                        is_completed = True
                        final_metadata = payload.get("metadata", {})
                    elif chunk_type == "error":
                        is_error = True
                        final_metadata = payload.get("metadata", {})
                except Exception:
                    pass

    except Exception as exc:
        logger.error("Error in stream delivery: %s", exc)
        is_error = True
        err_chunk = StreamChunk(type="error", content=str(exc))
        yield f"data: {err_chunk.model_dump_json()}\n\n"

    finally:
        full_text = final_metadata.get("fullText") or "".join(accumulated_content)
        agent_type = final_metadata.get("agentType", "direct")
        sources = final_metadata.get("sources", [])
        model_used = final_metadata.get("modelUsed", "gemini-2.5-flash")

        status_flag = "completed" if is_completed and not is_error else "partial"

        assistant_msg_doc = {
            "_id": ObjectId(assistant_msg_id),
            "chatId": chat_id,
            "role": MessageRole.ASSISTANT.value,
            "content": full_text,
            "agentType": agent_type,
            "sources": sources,
            "tokensUsed": final_metadata.get("tokensUsed"),
            "modelUsed": model_used,
            "status": status_flag,
            "createdAt": datetime.now(tz=timezone.utc),
        }

        try:
            await MongoDB.messages().insert_one(assistant_msg_doc)
            await _update_chat_metadata(chat_doc, chat_id, is_new_chat, user_message)

            # Spawn background task for memory extraction (never await in request flow)
            if full_text and status_flag == "completed":
                asyncio.create_task(
                    long_term_memory.extract_and_store(
                        user_message=user_message,
                        assistant_message=full_text,
                        user_id=user_id,
                        chat_id=chat_id,
                        message_id=assistant_msg_id,
                    )
                )
        except Exception as db_exc:
            logger.error("Failed to persist assistant message after stream: %s", db_exc)


async def _classify_intent(query: str, history: list[dict[str, Any]]) -> dict[str, Any]:
    prompt = (
        "Classify user intent for an AI agent. "
        "Respond ONLY with a JSON object: {\"intent\": \"rag\"|\"direct\", \"confidence\": float}.\n"
        "- \"rag\": user is asking about uploaded documents, files, PDFs, or specific stored content.\n"
        "- \"direct\": general question, coding, advice, casual chat.\n\n"
        f"User Query: {query}"
    )
    try:
        model = genai.GenerativeModel(FLASH_LITE_MODEL)
        res = await asyncio.to_thread(model.generate_content, prompt)
        cleaned = (res.text or "").strip().strip("```json").strip("```").strip()
        return json.loads(cleaned)
    except Exception:
        return {"intent": "direct", "confidence": 0.5}


async def _get_or_create_chat(user_id: str, chat_id: str | None) -> dict[str, Any]:
    if chat_id:
        try:
            oid = ObjectId(chat_id)
        except Exception:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid chat ID")
        doc = await MongoDB.chats().find_one({"_id": oid})
        if doc is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")
        if doc.get("userId") != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
        return doc

    new_chat_id = ObjectId()
    new_chat = {
        "_id": new_chat_id,
        "userId": user_id,
        "title": "New Chat",
        "messageCount": 0,
        "lastMessageAt": None,
        "createdAt": datetime.now(tz=timezone.utc),
    }
    await MongoDB.chats().insert_one(new_chat)
    return new_chat


async def _call_gemini(prompt: str, model_name: str) -> tuple[str, str]:
    model = genai.GenerativeModel(model_name)
    response = await asyncio.to_thread(model.generate_content, prompt)
    return response.text or "", model_name


async def _call_direct(query: str, history: list[dict[str, Any]]) -> tuple[str, str]:
    groq_messages = [
        {"role": "system", "content": "You are NexaMind, a personal AI assistant."},
        {"role": "user", "content": query},
    ]
    try:
        from groq import AsyncGroq
        groq_client = AsyncGroq(api_key=_settings.groq_api_key)
        res = await groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=groq_messages,  # type: ignore[arg-type]
            max_tokens=1024,
            temperature=0.7,
        )
        return res.choices[0].message.content or "", "llama-3.3-70b-versatile"
    except Exception:
        return await _call_gemini(query, FLASH_MODEL)


async def _update_chat_metadata(
    chat_doc: dict[str, Any], chat_id: str, is_new_chat: bool, first_message: str
) -> None:
    new_count = chat_doc.get("messageCount", 0) + 2
    update: dict[str, Any] = {
        "$set": {
            "messageCount": new_count,
            "lastMessageAt": datetime.now(tz=timezone.utc),
        }
    }

    if is_new_chat or chat_doc.get("title", "New Chat") == "New Chat":
        try:
            title_prompt = f"Generate a concise chat title (max 5 words) for:\n{first_message[:300]}"
            model = genai.GenerativeModel(FLASH_LITE_MODEL)
            res = await asyncio.to_thread(model.generate_content, title_prompt)
            title = " ".join((res.text or "").strip().split()[:5]) or "New Chat"
            update["$set"]["title"] = title
        except Exception:
            update["$set"]["title"] = first_message[:40].strip() or "New Chat"

    await MongoDB.chats().update_one({"_id": ObjectId(chat_id)}, update)
