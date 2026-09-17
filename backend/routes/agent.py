"""
NexaMind Backend — Agent Chat Route

Handles conversational endpoints with:
  • Intent check & RAG retrieval via ChromaDB
  • Direct chat via Groq Llama 3.3 (fallback to Gemini Flash)
  • Short-term memory (sliding window + auto-summarization)
  • Long-term memory retrieval & user context injection
  • Knowledge graph traversal & context injection
  • Parallel background tasks: Long-term memory + Knowledge graph extraction
  • SSE token-by-token streaming (/stream) and standard JSON response (/chat)
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
import google.generativeai as genai

from config import get_settings
from db.graph_store import get_user_graph_store
from db.mongo import MongoDB
from memory.long_term import LongTermMemory
from memory.short_term import ShortTermMemory
from middleware.auth import get_current_user
from models.chat import (
    AgentType,
    ChatRequest,
    ChatResponse,
    MessageRole,
    Source,
)
from models.user import TokenPayload
from pipelines.graph import GraphPipeline
from pipelines.retrieval import RAGRetrievalPipeline
from utils.streaming import StreamingManager

logger = logging.getLogger("nexamind.routes.agent")

router = APIRouter()

# ── Gemini & Groq Setup ───────────────────────────────────────────────────────
_settings = get_settings()
genai.configure(api_key=_settings.gemini_api_key)

FLASH_MODEL = "gemini-2.5-flash"
FLASH_LITE_MODEL = "gemini-2.0-flash-lite"

try:
    from groq import AsyncGroq

    _groq_client = AsyncGroq(api_key=_settings.groq_api_key)
    GROQ_MODEL = "llama-3.3-70b-versatile"
    GROQ_AVAILABLE = True
except ImportError:
    _groq_client = None  # type: ignore[assignment]
    GROQ_AVAILABLE = False
    logger.warning("groq package not installed — direct chat will fall back to Gemini Flash")

long_term_memory = LongTermMemory()
graph_pipeline = GraphPipeline()
streaming_manager = StreamingManager()


# ═════════════════════════════════════════════════════════════════════════════
# Helper Functions: Knowledge Graph & Context Assembly
# ═════════════════════════════════════════════════════════════════════════════

async def _extract_query_entities(query: str) -> list[str]:
    """Extract 1-4 key entity names from user query using Flash-Lite."""
    prompt = (
        f"Extract 1-4 key entity names (people, projects, tools, topics, concepts, places) "
        f"mentioned in this user query. Return ONLY a valid JSON array of strings.\n"
        f'Example: ["NexaMind", "FastAPI", "Taha"]\n'
        f"If no specific entities, return [].\n\n"
        f"Query: {query}"
    )
    try:
        model = genai.GenerativeModel(
            model_name=FLASH_LITE_MODEL,
            generation_config={"response_mime_type": "application/json"},
        )
        response = await asyncio.to_thread(model.generate_content, prompt)
        raw_text = (response.text or "[]").strip()
        raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
        raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE).strip()
        data = json.loads(raw_text)
        if isinstance(data, list):
            return [str(item).strip() for item in data if str(item).strip()]
        if isinstance(data, dict) and "entities" in data:
            return [str(e.get("name", e)).strip() for e in data["entities"] if str(e).strip()]
        return []
    except Exception as exc:
        logger.debug("Entity extraction from query failed: %s", exc)
        return []


async def _get_graph_context(query: str, user_id: str) -> str:
    """
    Extracts entities from user query, traverses user's knowledge graph up to 2 hops,
    and returns formatted context string, or "" if no relevant nodes exist.
    """
    try:
        entities = await _extract_query_entities(query)
        if not entities:
            return ""

        graph_store = get_user_graph_store(user_id)
        matched_nodes: set[str] = set()

        for ent_name in entities:
            nid = graph_store.find_node(ent_name)
            if nid:
                matched_nodes.add(nid)

        if not matched_nodes:
            return ""

        all_connections: list[str] = []
        for nid in matched_nodes:
            source_data = graph_store.graph.nodes.get(nid, {})
            source_name = source_data.get("name", nid)
            source_type = source_data.get("type", "Topic")
            neighbors = graph_store.get_neighbors(nid, hops=2)

            for neighbor in neighbors:
                rel = neighbor.get("relationship", "RELATED_TO")
                target_name = neighbor.get("name", "")
                target_type = neighbor.get("type", "Topic")
                if rel.startswith("INCOMING:"):
                    actual_rel = rel.replace("INCOMING:", "")
                    all_connections.append(
                        f"- {target_name} ({target_type}) → {actual_rel} → {source_name} ({source_type})"
                    )
                else:
                    all_connections.append(
                        f"- {source_name} ({source_type}) → {rel} → {target_name} ({target_type})"
                    )

        if not all_connections:
            return ""

        # Deduplicate lines
        unique_lines = list(dict.fromkeys(all_connections))
        return "Knowledge graph context:\n" + "\n".join(unique_lines[:15])

    except Exception as exc:
        logger.error("Error retrieving graph context for user %s: %s", user_id, exc)
        return ""


async def _build_full_system_context(
    query: str,
    user_id: str,
) -> tuple[str, str]:
    """
    Gathers long-term memories and knowledge graph context for the user.
    Returns (memory_section, graph_section).
    """
    memory_section = ""
    graph_section = ""

    # 1. Long-term memory summary + relevant semantic memories
    try:
        user_summary = await long_term_memory.get_user_context_summary(user_id)
        relevant_mems = await long_term_memory.retrieve_relevant(query, user_id, n_results=5)

        mem_parts = []
        if user_summary:
            mem_parts.append(user_summary)
        if relevant_mems:
            mem_parts.append(
                "Relevant retrieved memories:\n"
                + "\n".join(f"- [{m.category}] {m.fact}" for m in relevant_mems)
            )
        memory_section = "\n\n".join(mem_parts)
    except Exception as exc:
        logger.warning("Failed to gather memory context: %s", exc)

    # 2. Knowledge graph traversal
    try:
        graph_section = await _get_graph_context(query, user_id)
    except Exception as exc:
        logger.warning("Failed to gather graph context: %s", exc)

    return memory_section, graph_section


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/v1/agent/chat — Standard Non-Streaming Endpoint
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Send a message to the AI agent",
    description="Processes user message with RAG retrieval, memories, graph context, and background extraction.",
)
async def agent_chat(
    request: ChatRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> ChatResponse:
    """Main chat endpoint — full RAG + memory + graph context flow with MongoDB persistence."""
    user_id = current_user.user_id

    # 1. Get or create chat
    chat_doc = await _get_or_create_chat(user_id, request.chatId)
    chat_id = str(chat_doc["_id"])
    is_new_chat = request.chatId is None or chat_doc.get("messageCount", 0) == 0

    # 2. Save user message BEFORE calling LLM
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

    # 3. Short-term memory (sliding window + auto-summary)
    st_memory = ShortTermMemory(chat_id, user_id)
    history = await st_memory.get_window_with_summary()

    # 4. Long-term memory & Knowledge Graph context
    memory_context, graph_context = await _build_full_system_context(request.message, user_id)

    # 5. RAG retrieval
    pipeline = RAGRetrievalPipeline()
    chunks = await pipeline.retrieve_with_context(
        query=request.message,
        user_id=user_id,
        chat_history=history,
        n_chunks=5,
        filter_doc_ids=request.attachedDocIds or None,
    )

    # 6. Route to RAG or Direct
    if chunks:
        prompt = pipeline.build_rag_prompt(request.message, chunks, history)
        # Inject memory and graph context before conversation
        injected_context = []
        if memory_context:
            injected_context.append(f"USER MEMORY PROFILE:\n{memory_context}")
        if graph_context:
            injected_context.append(graph_context)

        if injected_context:
            prompt = "\n\n".join(injected_context) + "\n\n" + prompt

        assistant_content, model_used = await _call_gemini(prompt, FLASH_MODEL)
        agent_type = AgentType.RAG
        sources = pipeline.extract_sources(chunks, assistant_content)
    else:
        assistant_content, model_used = await _call_direct(
            query=request.message,
            history=history,
            memory_context=memory_context,
            graph_context=graph_context,
        )
        agent_type = AgentType.DIRECT
        sources = []

    # 7. Save assistant message
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

    # 8. Update chat metadata
    new_count = chat_doc.get("messageCount", 0) + 2
    update: dict[str, Any] = {
        "$set": {
            "messageCount": new_count,
            "lastMessageAt": datetime.now(tz=timezone.utc),
        }
    }
    if is_new_chat or chat_doc.get("title", "New Chat") == "New Chat":
        try:
            title = await _generate_title(request.message)
            update["$set"]["title"] = title
        except Exception as exc:
            logger.warning("Title generation failed: %s", exc)

    await MongoDB.chats().update_one({"_id": ObjectId(chat_id)}, update)

    # 9. Background tasks: Memory Extraction + Knowledge Graph Extraction (Parallel)
    asyncio.create_task(
        long_term_memory.extract_and_save(
            user_message=request.message,
            assistant_message=assistant_content,
            user_id=user_id,
            chat_id=chat_id,
            message_id=assistant_msg_id,
        )
    )
    asyncio.create_task(
        graph_pipeline.process(
            user_message=request.message,
            assistant_message=assistant_content,
            user_id=user_id,
            chat_id=chat_id,
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
# GET / POST /api/v1/agent/stream — SSE Token Streaming Endpoint
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/stream")
@router.get("/stream")
async def agent_stream(
    message: str = Query(..., description="User query text"),
    chat_id: Optional[str] = Query(None, alias="chatId"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,  # type: ignore[assignment]
) -> StreamingResponse:
    """Streams chat response tokens via Server-Sent Events (SSE)."""
    user_id = current_user.user_id

    # 1. Get or create chat
    chat_doc = await _get_or_create_chat(user_id, chat_id)
    actual_chat_id = str(chat_doc["_id"])
    is_new_chat = chat_id is None or chat_doc.get("messageCount", 0) == 0

    # 2. Save user message BEFORE streaming
    user_msg_id = str(ObjectId())
    user_msg_doc = {
        "_id": ObjectId(user_msg_id),
        "chatId": actual_chat_id,
        "role": MessageRole.USER.value,
        "content": message,
        "agentType": None,
        "sources": [],
        "tokensUsed": None,
        "modelUsed": None,
        "createdAt": datetime.now(tz=timezone.utc),
    }
    await MongoDB.messages().insert_one(user_msg_doc)

    # 3. Context gathering
    st_memory = ShortTermMemory(actual_chat_id, user_id)
    history = await st_memory.get_window_with_summary()
    memory_context, graph_context = await _build_full_system_context(message, user_id)

    # 4. RAG retrieval check
    pipeline = RAGRetrievalPipeline()
    chunks = await pipeline.retrieve_with_context(
        query=message,
        user_id=user_id,
        chat_history=history,
        n_chunks=5,
    )

    async def event_generator():
        accumulated_text = []
        model_used_ref = [FLASH_MODEL]
        agent_type_ref = [AgentType.RAG if chunks else AgentType.DIRECT]
        sources_ref = []

        try:
            if chunks:
                prompt = pipeline.build_rag_prompt(message, chunks, history)
                injected = []
                if memory_context:
                    injected.append(f"USER MEMORY PROFILE:\n{memory_context}")
                if graph_context:
                    injected.append(graph_context)
                if injected:
                    prompt = "\n\n".join(injected) + "\n\n" + prompt

                sources_ref = [
                    Source(
                        documentId=c.documentId,
                        filename=c.filename,
                        pageNumber=c.pageNumber,
                        chunkText=c.chunkText[:200],
                        score=c.score,
                    )
                    for c in chunks
                ]

                async for chunk in streaming_manager.stream_gemini(
                    prompt=prompt,
                    model_name=FLASH_MODEL,
                    chat_id=actual_chat_id,
                    agent_type=agent_type_ref[0].value,
                    sources=sources_ref,
                ):
                    if chunk.type == "token":
                        accumulated_text.append(chunk.content)
                    data_str = json.dumps(chunk.model_dump())
                    yield f"data: {data_str}\n\n"

            else:
                model_used_ref[0] = GROQ_MODEL if GROQ_AVAILABLE else FLASH_MODEL
                system_instruction = (
                    "You are NexaMind, a helpful personal AI assistant. "
                    "Be concise, accurate, and friendly. Respond in clear markdown."
                )
                if memory_context:
                    system_instruction += f"\n\nUSER MEMORY:\n{memory_context}"
                if graph_context:
                    system_instruction += f"\n\n{graph_context}"

                messages_list = [{"role": "system", "content": system_instruction}]
                for m in history[-8:]:
                    messages_list.append({"role": m.get("role", "user"), "content": m.get("content", "")})
                messages_list.append({"role": "user", "content": message})

                async for chunk in streaming_manager.stream_groq(
                    messages=messages_list,
                    model_name=model_used_ref[0],
                    chat_id=actual_chat_id,
                    agent_type=agent_type_ref[0].value,
                ):
                    if chunk.type == "token":
                        accumulated_text.append(chunk.content)
                    data_str = json.dumps(chunk.model_dump())
                    yield f"data: {data_str}\n\n"

        except Exception as stream_err:
            logger.error("Streaming generator error: %s", stream_err)
            err_json = json.dumps({"type": "error", "content": str(stream_err), "metadata": {}})
            yield f"data: {err_json}\n\n"

        # On stream completion: save assistant message and fire background tasks
        full_content = "".join(accumulated_text).strip()
        if full_content:
            assistant_msg_id = str(ObjectId())
            source_docs = [s.model_dump() for s in sources_ref]
            assistant_msg_doc = {
                "_id": ObjectId(assistant_msg_id),
                "chatId": actual_chat_id,
                "role": MessageRole.ASSISTANT.value,
                "content": full_content,
                "agentType": agent_type_ref[0].value,
                "sources": source_docs,
                "tokensUsed": None,
                "modelUsed": model_used_ref[0],
                "createdAt": datetime.now(tz=timezone.utc),
            }
            await MongoDB.messages().insert_one(assistant_msg_doc)

            new_count = chat_doc.get("messageCount", 0) + 2
            update_data: dict[str, Any] = {
                "$set": {
                    "messageCount": new_count,
                    "lastMessageAt": datetime.now(tz=timezone.utc),
                }
            }
            if is_new_chat or chat_doc.get("title", "New Chat") == "New Chat":
                try:
                    title = await _generate_title(message)
                    update_data["$set"]["title"] = title
                except Exception:
                    pass
            await MongoDB.chats().update_one({"_id": ObjectId(actual_chat_id)}, update_data)

            # Fire memory and graph extractions in background
            asyncio.create_task(
                long_term_memory.extract_and_save(
                    user_message=message,
                    assistant_message=full_content,
                    user_id=user_id,
                    chat_id=actual_chat_id,
                    message_id=assistant_msg_id,
                )
            )
            asyncio.create_task(
                graph_pipeline.process(
                    user_message=message,
                    assistant_message=full_content,
                    user_id=user_id,
                    chat_id=actual_chat_id,
                )
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/chat/stream")
async def agent_chat_stream_post(
    request: ChatRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> StreamingResponse:
    """Streams chat response tokens for POST JSON payload (Next.js proxy gateway)."""
    return await agent_stream(
        message=request.message,
        chat_id=request.chatId,
        current_user=current_user,
    )


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/v1/agent/me
# ═════════════════════════════════════════════════════════════════════════════

@router.get("/me")
async def agent_me(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict[str, str]:
    """Auth smoke-test endpoint."""
    return {
        "userId": current_user.user_id,
        "email": current_user.email,
        "role": current_user.role.value,
    }


# ═════════════════════════════════════════════════════════════════════════════
# Internal Helpers
# ═════════════════════════════════════════════════════════════════════════════

async def _get_or_create_chat(user_id: str, chat_id: Optional[str]) -> dict:
    if chat_id:
        try:
            oid = ObjectId(chat_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid chat ID format",
            )
        doc = await MongoDB.chats().find_one({"_id": oid})
        if doc is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Chat not found",
            )
        if doc.get("userId") != user_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )
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
    text = response.text or ""
    return text, model_name


async def _call_direct(
    query: str,
    history: list[dict],
    memory_context: str = "",
    graph_context: str = "",
) -> tuple[str, str]:
    system_parts = [
        "You are NexaMind, a helpful personal AI assistant. "
        "Be concise, accurate, and friendly. Respond in clear markdown."
    ]
    if memory_context:
        system_parts.append(f"USER MEMORY:\n{memory_context}")
    if graph_context:
        system_parts.append(graph_context)

    system_prompt = "\n\n".join(system_parts)

    if GROQ_AVAILABLE and _groq_client is not None:
        groq_messages: list[dict] = [{"role": "system", "content": system_prompt}]
        for msg in history[-8:]:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant"):
                groq_messages.append({"role": role, "content": content})
        groq_messages.append({"role": "user", "content": query})

        try:
            response = await _groq_client.chat.completions.create(
                model=GROQ_MODEL,
                messages=groq_messages,  # type: ignore[arg-type]
                max_tokens=1024,
                temperature=0.7,
            )
            text = response.choices[0].message.content or ""
            return text, GROQ_MODEL
        except Exception as exc:
            logger.warning("Groq call failed, falling back to Gemini: %s", exc)

    history_text = "\n".join(
        f"{'User' if m.get('role') == 'user' else 'Assistant'}: {m.get('content', '')}"
        for m in history[-5:]
    )
    prompt = (
        f"{system_prompt}\n\n"
        f"CONVERSATION HISTORY:\n{history_text}\n\n"
        f"USER: {query}"
    )
    return await _call_gemini(prompt, FLASH_MODEL)


async def _generate_title(first_message: str) -> str:
    prompt = (
        f"Generate a concise chat title (maximum 5 words) for a conversation "
        f"that starts with this message. Return ONLY the title, no punctuation:\n\n"
        f"{first_message[:300]}"
    )
    try:
        text, _ = await _call_gemini(prompt, FLASH_LITE_MODEL)
        words = text.strip().split()[:5]
        return " ".join(words) or "New Chat"
    except Exception as exc:
        logger.warning("Title generation failed: %s", exc)
        title = first_message[:40].strip()
        return title if title else "New Chat"
