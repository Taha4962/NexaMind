"""
NexaMind Backend — SSE Streaming Utilities

Manages token-by-token Server-Sent Events (SSE) streaming from Gemini and Groq models.
Formats stream output as JSON-encoded StreamChunk objects.
"""

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
        """Streams tokens asynchronously from Gemini."""
        sources_list = sources or []
        full_text = []

        try:
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_instruction,
            )
            response = await model.generate_content_async(prompt, stream=True)

            async for chunk in response:
                text = chunk.text or ""
                if text:
                    full_text.append(text)
                    yield StreamChunk(type="token", content=text)

            complete_content = "".join(full_text)
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
