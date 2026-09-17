"""
NexaMind Backend — Web Search Sub-Agent (Stub)

Placeholder sub-agent for web search queries.
Full Tavily API integration will be completed in Step 11.
"""

import logging
from typing import Optional

from models.chat import AgentType

logger = logging.getLogger("nexamind.agents.web_agent")


class WebAgent:
    """
    Sub-agent responsible for real-time web searches and web synthesis.
    """

    async def handle(
        self,
        query: str,
        user_id: str,
        chat_history: list[dict],
    ) -> "AgentResult":  # type: ignore[name-defined]
        """
        Stub handler for Step 10 — returns used=False to trigger fallback.
        """
        from agents import AgentResult

        logger.info("WebAgent called for query '%s' (Stub: full Tavily integration in Step 11)", query[:50])
        return AgentResult(
            context="",
            sources=[],
            used=False,
            agentType=AgentType.WEB,
            note="Web search coming in Step 11 (Tavily integration)",
        )
