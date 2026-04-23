"""
NexaMind Backend — Intent Classification Router

Classifies user messages to determine which agent should handle them.
Uses LLM-based intent classification to route between:
- RAG agent: document-based questions
- Memory agent: personal context queries
- Web agent: real-time web searches
- Direct agent: general conversation
"""

import logging
from enum import Enum

from models.chat import AgentType

logger = logging.getLogger("nexamind.agents.router")


class IntentCategory(str, Enum):
    """Classified intent categories for routing."""

    DOCUMENT_QUERY = "document_query"
    PERSONAL_CONTEXT = "personal_context"
    WEB_SEARCH = "web_search"
    GENERAL = "general"


# ── Intent to Agent Mapping ──
INTENT_AGENT_MAP: dict[IntentCategory, AgentType] = {
    IntentCategory.DOCUMENT_QUERY: AgentType.RAG,
    IntentCategory.PERSONAL_CONTEXT: AgentType.MEMORY,
    IntentCategory.WEB_SEARCH: AgentType.WEB,
    IntentCategory.GENERAL: AgentType.DIRECT,
}


async def classify_intent(
    message: str,
    user_id: str,
    chat_history: list[dict[str, str]],
) -> AgentType:
    """
    Classify the intent of a user message to determine agent routing.

    Uses an LLM to analyze the message content, chat history, and user
    context to determine which agent is best suited to handle the query.

    Args:
        message: The user's input message.
        user_id: The authenticated user's ID for context retrieval.
        chat_history: Recent chat messages for contextual classification.

    Returns:
        The AgentType to route the message to.
    """
    raise NotImplementedError(
        "Intent classification — will be implemented in the agent orchestration step. "
        "Will use Gemini Flash-Lite for fast intent classification with a structured "
        "prompt that considers message content, available documents, user memories, "
        "and chat history to determine the optimal agent routing."
    )


async def route_to_agent(
    message: str,
    user_id: str,
    chat_id: str,
    agent_type: AgentType,
) -> dict[str, str]:
    """
    Route a classified message to the appropriate agent for processing.

    Args:
        message: The user's input message.
        user_id: The authenticated user's ID.
        chat_id: The chat session ID.
        agent_type: The classified agent type to handle this message.

    Returns:
        The agent's response including content, sources, and metadata.
    """
    raise NotImplementedError(
        "Agent routing — will be implemented in the agent orchestration step. "
        "Will dispatch to the appropriate agent (RAG, memory, web, or direct) "
        "and aggregate the response with source attributions."
    )
