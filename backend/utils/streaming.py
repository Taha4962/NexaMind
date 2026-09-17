"""
NexaMind Backend — SSE Streaming Utilities

Manages token-by-token Server-Sent Events (SSE) streaming from Gemini and Groq models.
Formats stream output as JSON-encoded StreamChunk objects.
"""

import asyncio
import json
import logging
from typing import Any, AsyncGenerator, Literal, Optional

from fastapi.responses import StreamingResponse
import google.generativeai as genai
from pydantic import BaseModel, Field

from config import get_settings

logger = logging.getLogger("nexamind.utils.streaming")

# ── SSE Event Types ──
EVENT_TOKEN = "token"
EVENT_SOURCES = "sources"
EVENT_DONE = "done"
EVENT_ERROR = "error"


class StreamChunk(BaseModel):
    """Represents a single chunk in an SSE stream."""

    type: Literal["token", "done", "error", "thinking"] = Field(
        ..., description="Event type for the stream chunk"
    )
    content: str = Field(..., description="Text content or token fragment")
    metadata: dict[str, Any] = Field(
        default_factory=dict,
        description="Metadata associated with chunk (sent on 'done' or 'error')",
    )


class StreamingManager:
    """
    Manages SSE streaming from Gemini and Groq models.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        genai.configure(api_key=self.settings.gemini_api_key)

        try:
            from groq import AsyncGroq

            self.groq_client: Optional[AsyncGroq] = AsyncGroq(
                api_key=self.settings.groq_api_key
            )
        except Exception as exc:
            logger.warning("Groq client initialization failed: %s", exc)
            self.groq_client = None

    async def stream_gemini(
        self,
        prompt: str,
        model_name: str = "gemini-2.5-flash",
        system_instruction: Optional[str] = None,
        chat_id: str = "",
        message_id: str = "",
        agent_type: str = "rag",
        sources: Optional[list] = None,
    ) -> AsyncGenerator[StreamChunk, None]:
        """Streams tokens asynchronously from Gemini.

        Handles Gemini 2.5 thinking models that emit internal reasoning chunks
        where accessing `.text` raises a ValueError — those chunks are skipped
        silently. If the model returns no output text at all, a fallback
        non-streaming call is made to ensure we never send an empty response.
        """
        sources_list = sources or []
        full_text: list[str] = []

        try:
            # Disable thinking tokens for streaming to avoid chunks where .text
            # raises ValueError (Gemini 2.5 thinking models emit thought-only
            # chunks that have no output text). The per-chunk guard below is a
            # safety net in case an older SDK doesn't support thinking_config.
            generation_config: dict = {}
            if "2.5" in model_name:
                generation_config["thinking_config"] = {"thinking_budget": 0}

            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction,
                generation_config=generation_config or None,
            )
            response = await model.generate_content_async(prompt, stream=True)

            async for chunk in response:
                # Gemini 2.5 thinking-model chunks may raise ValueError on .text
                # when they contain only internal thought tokens — skip them.
                try:
                    text = chunk.text or ""
                except (ValueError, AttributeError):
                    text = ""

                if text:
                    full_text.append(text)
                    yield StreamChunk(type="token", content=text)

            complete_content = "".join(full_text)

            # Guard: if the streaming pass returned nothing, do a synchronous
            # fallback to avoid sending an empty "done" event which causes the
            # "model output must contain either output text or tool calls" error.
            if not complete_content.strip():
                logger.warning(
                    "Gemini streaming returned empty text for model=%s. "
                    "Falling back to non-streaming call.",
                    model_name,
                )
                fallback_response = await asyncio.to_thread(
                    model.generate_content, prompt
                )
                try:
                    complete_content = fallback_response.text or "I'm sorry, I couldn't generate a response. Please try again."
                except (ValueError, AttributeError):
                    complete_content = "I'm sorry, I couldn't generate a response. Please try again."
                yield StreamChunk(type="token", content=complete_content)

            metadata = {
                "agentType": agent_type,
                "sources": [
                    s.model_dump() if hasattr(s, "model_dump") else s
                    for s in sources_list
                ],
                "modelUsed": model_name,
                "tokensUsed": None,
                "chatId": chat_id,
                "messageId": message_id,
                "fullText": complete_content,
            }
            yield StreamChunk(type="done", content="", metadata=metadata)

        except Exception as exc:
            logger.error("Gemini streaming error: %s", exc, exc_info=True)
            yield StreamChunk(
                type="error",
                content=str(exc),
                metadata={
                    "chatId": chat_id,
                    "messageId": message_id,
                    "partialText": "".join(full_text),
                },
            )

    async def stream_groq(
        self,
        messages: list[dict[str, Any]],
        model_name: str = "llama-3.3-70b-versatile",
        chat_id: str = "",
        message_id: str = "",
        agent_type: str = "direct",
    ) -> AsyncGenerator[StreamChunk, None]:
        """Streams tokens asynchronously from Groq API."""
        full_text = []

        if not self.groq_client:
            logger.warning("Groq client not available. Falling back to Gemini stream.")
            last_msg = messages[-1]["content"] if messages else ""
            async for chunk in self.stream_gemini(
                prompt=last_msg,
                model_name="gemini-2.5-flash",
                chat_id=chat_id,
                message_id=message_id,
                agent_type=agent_type,
            ):
                yield chunk
            return

        try:
            stream = await self.groq_client.chat.completions.create(
                model=model_name,
                messages=messages,
                stream=True,
                max_tokens=1024,
                temperature=0.7,
            )

            async for chunk in stream:
                if (
                    chunk.choices
                    and chunk.choices[0].delta
                    and chunk.choices[0].delta.content
                ):
                    token = chunk.choices[0].delta.content
                    full_text.append(token)
                    yield StreamChunk(type="token", content=token)

            complete_content = "".join(full_text)
            metadata = {
                "agentType": agent_type,
                "sources": [],
                "modelUsed": model_name,
                "tokensUsed": None,
                "chatId": chat_id,
                "messageId": message_id,
                "fullText": complete_content,
            }
            yield StreamChunk(type="done", content="", metadata=metadata)

        except Exception as exc:
            logger.error("Groq streaming error: %s. Falling back to Gemini.", exc)
            last_msg = messages[-1]["content"] if messages else ""
            async for chunk in self.stream_gemini(
                prompt=last_msg,
                model_name="gemini-2.5-flash",
                chat_id=chat_id,
                message_id=message_id,
                agent_type=agent_type,
            ):
                yield chunk


def format_sse_event(event_type: str, data: dict[str, Any]) -> str:
    json_data = json.dumps(data, default=str)
    return f"event: {event_type}\ndata: {json_data}\n\n"


async def create_streaming_response(
    generator: AsyncGenerator[str, None],
) -> StreamingResponse:
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
