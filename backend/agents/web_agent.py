"""
NexaMind Backend — Web Search Agent

Handles queries requiring real-time web information using the
Tavily search API. Searches the web and synthesizes results
into coherent responses.
"""

import logging

from models.chat import AgentType

logger = logging.getLogger("nexamind.agents.web_agent")


async def process_web_query(
    message: str,
    user_id: str,
    chat_id: str,
    chat_history: list[dict[str, str]],
) -> dict[str, object]:
    """
    Process a query requiring real-time web search.

    Uses the Tavily search API to find relevant web results, then
    synthesizes them into a coherent response with source URLs.

    Args:
        message: The user's question requiring web search.
        user_id: The authenticated user's ID.
        chat_id: The current chat session ID.
        chat_history: Recent conversation history for context.

    Returns:
        Dictionary containing:
        - content: The synthesized response from web results
        - sources: List of web sources with URLs
        - agent_type: AgentType.WEB
    """
    raise NotImplementedError(
        "Web search agent — will be implemented in the web search step. "
        "Will use Tavily API for web search, filter and rank results, "
        "construct a synthesis prompt with search results and chat history, "
        "generate a coherent response via Gemini Flash, and return "
        "source attributions with URLs."
    )
