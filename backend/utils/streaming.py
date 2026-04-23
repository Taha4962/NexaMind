"""
NexaMind Backend — Server-Sent Events (SSE) Streaming Helper

Provides utilities for streaming LLM responses to the frontend
using Server-Sent Events. Handles token-by-token streaming with
proper event formatting and error recovery.
"""

import json
import logging
from typing import AsyncGenerator

from fastapi.responses import StreamingResponse

logger = logging.getLogger("nexamind.utils.streaming")

# ── SSE Event Types ──
EVENT_TOKEN = "token"
EVENT_SOURCES = "sources"
EVENT_DONE = "done"
EVENT_ERROR = "error"


def format_sse_event(
    event_type: str,
    data: dict[str, object],
) -> str:
    """
    Format data as a Server-Sent Event string.

    Args:
        event_type: The SSE event type (token, sources, done, error).
        data: The event data to serialize as JSON.

    Returns:
        Formatted SSE event string with event type and data fields.
    """
    json_data = json.dumps(data, default=str)
    return f"event: {event_type}\ndata: {json_data}\n\n"


async def create_streaming_response(
    generator: AsyncGenerator[str, None],
) -> StreamingResponse:
    """
    Create a FastAPI StreamingResponse from an SSE event generator.

    Wraps an async generator of SSE-formatted strings into a proper
    StreamingResponse with correct content type headers.

    Args:
        generator: Async generator yielding SSE-formatted event strings.

    Returns:
        FastAPI StreamingResponse configured for SSE.
    """
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
