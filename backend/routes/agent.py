"""
NexaMind Backend — Agent Chat Route

Handles the main POST /agent/chat endpoint for processing user
messages through the multi-agent orchestrator. Routes messages
to the appropriate agent (RAG, memory, web, or direct) based
on intent classification.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Depends

from middleware.auth import get_current_user
from models.chat import AgentChatRequest, MessageResponse
from models.user import TokenPayload

logger = logging.getLogger("nexamind.routes.agent")

router = APIRouter()


@router.post(
    "/chat",
    response_model=MessageResponse,
    summary="Send a message to the AI agent",
    description="Processes a user message through the multi-agent orchestrator",
)
async def agent_chat(
    request: AgentChatRequest,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> MessageResponse:
    """
    Process a user message through the NexaMind agent orchestrator.

    The orchestrator classifies the user's intent and routes the message
    to the appropriate agent:
    - RAG agent: for document-based questions
    - Memory agent: for personal context queries
    - Web agent: for real-time web searches
    - Direct agent: for general conversation

    Args:
        request: The chat request containing the user message and optional chat_id.
        current_user: Authenticated user from JWT token.

    Returns:
        The assistant's response with source attributions and agent type.
    """
    raise NotImplementedError(
        "Agent chat endpoint — will be implemented in the agent orchestration step. "
        "Will integrate intent classification, agent routing, message persistence, "
        "and streaming response generation."
    )
