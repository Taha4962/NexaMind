"""
NexaMind Backend — Agent Chat Route (Refactored)

Orchestrates chat conversations by delegating routing, context gathering,
and LLM response generation to RouterAgent.

Features:
  - Validates session & user authentication.
  - Persists user messages to MongoDB BEFORE calling any LLM.
  - Passes conversation context to RouterAgent (ReAct loop: Think -> Act -> Observe -> Answer).
  - Handles SSE streaming via /chat/stream and standard responses via /chat.
  - Dispatches parallel background tasks for memory and knowledge graph extraction.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Annotated, Any, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
import google.generativeai as genai

from agents import RouterAgent
from config import get_settings
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
from utils.model_router import select_model

logger = logging.getLogger("nexamind.routes.agent")

router = APIRouter()

# ── Instantiate Agents & Pipelines ────────────────────────────────────────────
router_agent = RouterAgent()
long_term_memory = LongTermMemory()
graph_pipeline = GraphPipeline()


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/v1/agent/chat — Standard Non-Streaming Endpoint
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Send a message to the AI agent",
    description="Processes user message with RouterAgent (RAG, memory synthesis, web search, or direct LLM).",
)
async def agent_chat(
    request: ChatRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> ChatResponse:
    """Main chat endpoint — full agent orchestration flow with MongoDB persistence."""
    user_id = current_user.user_id

    # 1. Get or create chat session
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

    # 3. Retrieve short-term memory window
    st_memory = ShortTermMemory(chat_id, user_id)
    history = await st_memory.get_window_with_summary()

    # 4. Delegate to RouterAgent
    assistant_content, model_used, agent_type, sources = await router_agent.execute(
        chat_request=request,
        user_id=user_id,
        chat_history=history,
    )

    # 5. Save assistant message
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

    # 6. Update chat metadata and auto-generate title if needed
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

    # 7. Background tasks: Memory Extraction + Knowledge Graph Extraction
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
# GET / POST /api/v1/agent/chat/stream & /stream — SSE Token Streaming Endpoint
# ═════════════════════════════════════════════════════════════════════════════

@router.post("/chat/stream")
async def agent_chat_stream_post(
    request: ChatRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> StreamingResponse:
    """Streams chat response tokens for POST JSON payload (Next.js proxy gateway)."""
    return await _stream_chat_handler(
        chat_request=request,
        user_id=current_user.user_id,
    )


@router.post("/stream")
@router.get("/stream")
async def agent_stream(
    message: str = Query(..., description="User query text"),
    chat_id: Optional[str] = Query(None, alias="chatId"),
    current_user: Annotated[TokenPayload, Depends(get_current_user)] = None,  # type: ignore[assignment]
) -> StreamingResponse:
    """Streams chat response tokens for query parameter requests."""
    req = ChatRequest(message=message, chatId=chat_id)
    return await _stream_chat_handler(
        chat_request=req,
        user_id=current_user.user_id,
    )


async def _stream_chat_handler(
    chat_request: ChatRequest,
    user_id: str,
) -> StreamingResponse:
    """Internal streaming handler executing RouterAgent.route()."""
    # 1. Get or create chat session
    chat_doc = await _get_or_create_chat(user_id, chat_request.chatId)
    actual_chat_id = str(chat_doc["_id"])
    is_new_chat = chat_request.chatId is None or chat_doc.get("messageCount", 0) == 0

    # Ensure chatId is assigned in request
    chat_request.chatId = actual_chat_id

    # 2. Save user message BEFORE streaming
    user_msg_id = str(ObjectId())
    user_msg_doc = {
        "_id": ObjectId(user_msg_id),
        "chatId": actual_chat_id,
        "role": MessageRole.USER.value,
        "content": chat_request.message,
        "agentType": None,
        "sources": [],
        "tokensUsed": None,
        "modelUsed": None,
        "createdAt": datetime.now(tz=timezone.utc),
    }
    await MongoDB.messages().insert_one(user_msg_doc)

    # 3. Short-term memory window
    st_memory = ShortTermMemory(actual_chat_id, user_id)
    history = await st_memory.get_window_with_summary()

    async def event_generator():
        accumulated_text: list[str] = []
        last_metadata: dict[str, Any] = {}

        try:
            async for chunk in router_agent.route(
                chat_request=chat_request,
                user_id=user_id,
                chat_history=history,
            ):
                if chunk.type == "token":
                    accumulated_text.append(chunk.content)
                elif chunk.type == "done":
                    last_metadata = chunk.metadata or {}
                data_str = json.dumps(chunk.model_dump())
                yield f"data: {data_str}\n\n"

        except Exception as stream_err:
            logger.error("Streaming generator exception: %s", stream_err)
            err_json = json.dumps({"type": "error", "content": str(stream_err), "metadata": {}})
            yield f"data: {err_json}\n\n"

        # On stream completion: save assistant message and fire background tasks
        full_content = "".join(accumulated_text).strip()
        if full_content:
            assistant_msg_id = str(ObjectId())
            source_docs = last_metadata.get("sources", [])
            model_used = last_metadata.get("modelUsed", "gemini-2.5-flash")
            agent_type_val = last_metadata.get("agentType", AgentType.DIRECT.value)

            assistant_msg_doc = {
                "_id": ObjectId(assistant_msg_id),
                "chatId": actual_chat_id,
                "role": MessageRole.ASSISTANT.value,
                "content": full_content,
                "agentType": agent_type_val,
                "sources": source_docs,
                "tokensUsed": None,
                "modelUsed": model_used,
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
                    title = await _generate_title(chat_request.message)
                    update_data["$set"]["title"] = title
                except Exception:
                    pass
            await MongoDB.chats().update_one({"_id": ObjectId(actual_chat_id)}, update_data)

            # Fire background memory & graph extractions
            asyncio.create_task(
                long_term_memory.extract_and_save(
                    user_message=chat_request.message,
                    assistant_message=full_content,
                    user_id=user_id,
                    chat_id=actual_chat_id,
                    message_id=assistant_msg_id,
                )
            )
            asyncio.create_task(
                graph_pipeline.process(
                    user_message=chat_request.message,
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


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/v1/agent/me — Smoke Test Endpoint
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


async def _generate_title(first_message: str) -> str:
    choice = select_model("title_generation")
    prompt = (
        f"Generate a concise chat title (maximum 5 words) for a conversation "
        f"that starts with this message. Return ONLY the title, no punctuation:\n\n"
        f"{first_message[:300]}"
    )
    try:
        model = genai.GenerativeModel(choice["model"])
        response = await asyncio.to_thread(model.generate_content, prompt)
        try:
            text = response.text or ""
        except (ValueError, AttributeError):
            text = ""
        words = text.strip().split()[:5]
        return " ".join(words) or "New Chat"
    except Exception as exc:
        logger.warning("Title generation failed: %s", exc)
        title = first_message[:40].strip()
        return title if title else "New Chat"
