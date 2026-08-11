"""
NexaMind Backend — Agent Chat Route

Handles POST /api/v1/agent/chat — the main conversational endpoint.

Routing logic:
  • Intent check: Flash-Lite decides if documents are needed.
  • RAG path:     chunks found (score > 0.4) → Gemini Flash 2.5 with context.
  • Direct path:  no relevant docs → Groq Llama 3.3 (fast, saves Gemini quota).
  • Title gen:    Flash-Lite on first message only (never re-generated).

Persistence rules:
  1. User message saved to MongoDB BEFORE calling the LLM.
  2. Assistant message saved after LLM returns.
  3. Chat updated: messageCount++, lastMessageAt, title (first msg only).
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Annotated

import google.generativeai as genai
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

from config import get_settings
from db.mongo import MongoDB
from middleware.auth import get_current_user
from models.chat import (
    AgentType,
    ChatRequest,
    ChatResponse,
    MessageRole,
    Source,
)
from models.user import TokenPayload
from pipelines.retrieval import RAGRetrievalPipeline

logger = logging.getLogger("nexamind.routes.agent")

router = APIRouter()

# ── Gemini client setup ───────────────────────────────────────────────────────
_settings = get_settings()
genai.configure(api_key=_settings.gemini_api_key)

FLASH_MODEL = "gemini-2.5-flash"
FLASH_LITE_MODEL = "gemini-2.0-flash-lite"

# ── Groq client setup ─────────────────────────────────────────────────────────
try:
    from groq import AsyncGroq

    _groq_client = AsyncGroq(api_key=_settings.groq_api_key)
    GROQ_MODEL = "llama-3.3-70b-versatile"
    GROQ_AVAILABLE = True
except ImportError:
    _groq_client = None  # type: ignore[assignment]
    GROQ_AVAILABLE = False
    logger.warning("groq package not installed — direct chat will fall back to Gemini Flash")


# ═════════════════════════════════════════════════════════════════════════════
# POST /api/v1/agent/chat
# ═════════════════════════════════════════════════════════════════════════════

@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="Send a message to the AI agent",
    description=(
        "Processes a user message through the NexaMind orchestrator. "
        "Uses RAG when relevant document chunks are found (score > 0.4), "
        "otherwise falls back to direct Groq Llama for speed."
    ),
)
async def agent_chat(
    request: ChatRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> ChatResponse:
    """
    Main chat endpoint — full RAG + direct LLM flow with MongoDB persistence.
    """
    user_id = current_user.user_id
    settings = get_settings()

    # ── a. Get or create chat ─────────────────────────────────────────────────
    chat_doc = await _get_or_create_chat(user_id, request.chatId)
    chat_id = str(chat_doc["_id"])
    is_new_chat = request.chatId is None or chat_doc.get("messageCount", 0) == 0

    # ── b. Save user message BEFORE calling LLM ───────────────────────────────
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

    # ── c. Fetch short-term memory (last 10 messages) ─────────────────────────
    history = await _fetch_recent_messages(chat_id, limit=10)

    # ── d. RAG retrieval ──────────────────────────────────────────────────────
    pipeline = RAGRetrievalPipeline()
    chunks = await pipeline.retrieve_with_context(
        query=request.message,
        user_id=user_id,
        chat_history=history,
        n_chunks=5,
        filter_doc_ids=request.attachedDocIds or None,
    )

    # ── e / f. Route to RAG or Direct ────────────────────────────────────────
    if chunks:
        # ── RAG path (Gemini Flash 2.5) ───────────────────────────────────────
        prompt = pipeline.build_rag_prompt(request.message, chunks, history)
        assistant_content, model_used = await _call_gemini(prompt, FLASH_MODEL)
        agent_type = AgentType.RAG
        sources = pipeline.extract_sources(chunks, assistant_content)
    else:
        # ── Direct path (Groq Llama 3.3) ─────────────────────────────────────
        assistant_content, model_used = await _call_direct(request.message, history)
        agent_type = AgentType.DIRECT
        sources = []

    # ── g. Save assistant message ─────────────────────────────────────────────
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

    # ── h. Update chat metadata ───────────────────────────────────────────────
    new_count = chat_doc.get("messageCount", 0) + 2  # user + assistant
    update: dict = {
        "$set": {
            "messageCount": new_count,
            "lastMessageAt": datetime.now(tz=timezone.utc),
        },
        "$inc": {},
    }
    del update["$inc"]  # remove empty $inc

    # Auto-generate title on first message — only once, never re-generated
    if is_new_chat or chat_doc.get("title", "New Chat") == "New Chat":
        try:
            title = await _generate_title(request.message)
            update["$set"]["title"] = title
        except Exception as exc:
            logger.warning("Title generation failed: %s", exc)

    await MongoDB.chats().update_one(
        {"_id": ObjectId(chat_id)},
        update,
    )

    # ── i. Return ChatResponse ────────────────────────────────────────────────
    return ChatResponse(
        chatId=chat_id,
        messageId=assistant_msg_id,
        content=assistant_content,
        agentType=agent_type,
        sources=sources,
        modelUsed=model_used,
    )


# ═════════════════════════════════════════════════════════════════════════════
# GET /api/v1/agent/me  (auth smoke-test — unchanged)
# ═════════════════════════════════════════════════════════════════════════════

@router.get(
    "/me",
    summary="Verify JWT authentication",
    description=(
        "Returns the authenticated user's identity decoded from the JWT access token. "
        "Use this to confirm the Python backend correctly validates JWTs issued by Next.js."
    ),
    response_description="Decoded token payload: userId, email, role",
)
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
# Private helpers
# ═════════════════════════════════════════════════════════════════════════════

async def _get_or_create_chat(user_id: str, chat_id: str | None) -> dict:
    """
    Fetch an existing chat by ID (verifying ownership) or create a new one.

    Raises:
        HTTPException 404: Chat not found.
        HTTPException 403: Chat belongs to a different user.
    """
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

    # Create new chat
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


async def _fetch_recent_messages(chat_id: str, limit: int = 10) -> list[dict]:
    """
    Return the last *limit* messages for *chat_id* sorted oldest-first.

    Returns plain dicts with ``role`` and ``content`` keys.
    """
    cursor = (
        MongoDB.messages()
        .find({"chatId": chat_id}, {"role": 1, "content": 1, "_id": 0})
        .sort("createdAt", -1)
        .limit(limit)
    )
    docs = await cursor.to_list(length=limit)
    return list(reversed(docs))  # oldest first


async def _call_gemini(prompt: str, model_name: str) -> tuple[str, str]:
    """
    Call a Gemini model and return (response_text, model_used).
    """
    model = genai.GenerativeModel(model_name)
    response = await asyncio.to_thread(model.generate_content, prompt)
    text = response.text or ""
    return text, model_name


async def _call_direct(query: str, history: list[dict]) -> tuple[str, str]:
    """
    Call Groq Llama 3.3 for direct (non-RAG) conversation.

    Falls back to Gemini Flash if Groq is unavailable.

    Returns:
        Tuple of (response_text, model_used).
    """
    if GROQ_AVAILABLE and _groq_client is not None:
        # Build Groq message list
        groq_messages: list[dict] = [
            {
                "role": "system",
                "content": (
                    "You are NexaMind, a helpful personal AI assistant. "
                    "Be concise, accurate, and friendly. "
                    "Respond in clear markdown."
                ),
            }
        ]
        for msg in history[-8:]:  # last 8 messages for context
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

    # Fallback: Gemini Flash
    history_text = "\n".join(
        f"{'User' if m.get('role') == 'user' else 'Assistant'}: {m.get('content', '')}"
        for m in history[-5:]
    )
    prompt = (
        "You are NexaMind, a helpful personal AI assistant. "
        "Be concise, accurate, and friendly. Respond in clear markdown.\n\n"
        f"CONVERSATION HISTORY:\n{history_text}\n\n"
        f"USER: {query}"
    )
    return await _call_gemini(prompt, FLASH_MODEL)


async def _generate_title(first_message: str) -> str:
    """
    Use Gemini Flash-Lite to generate a short ≤5-word chat title.

    Falls back to a truncated version of the message if generation fails.
    """
    prompt = (
        f"Generate a concise chat title (maximum 5 words) for a conversation "
        f"that starts with this message. Return ONLY the title, no punctuation:\n\n"
        f"{first_message[:300]}"
    )
    try:
        text, _ = await _call_gemini(prompt, FLASH_LITE_MODEL)
        # Clean up and truncate to 5 words
        words = text.strip().split()[:5]
        return " ".join(words) or "New Chat"
    except Exception as exc:
        logger.warning("Title generation failed: %s", exc)
        # Simple fallback: first N chars of the message
        title = first_message[:40].strip()
        return title if title else "New Chat"
