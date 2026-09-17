"""
NexaMind Backend — Agent Orchestration Package

Exports:
  - AgentResult: Common result model for all sub-agents
  - RouterDecision: Intent classification model
  - RAGAgent: Retrieval-augmented generation sub-agent
  - MemoryAgent: Long-term memory & knowledge graph sub-agent
  - WebAgent: Web search sub-agent (stub for Step 11)
  - RouterAgent: Central orchestrator with ReAct loop
"""

from typing import Optional

from pydantic import BaseModel, Field

from models.chat import AgentType, Source


class AgentResult(BaseModel):
    """Common output returned by any sub-agent's handle() method."""

    context: str = Field(default="", description="Gathered context text or synthesis")
    sources: list[Source] = Field(default_factory=list, description="Source attributions")
    used: bool = Field(..., description="Whether the sub-agent produced actionable context")
    agentType: AgentType = Field(..., description="Agent type responsible for the result")
    modelUsed: Optional[str] = Field(default=None, description="Model identifier if generated")
    note: Optional[str] = Field(default=None, description="Optional diagnostic or fallback note")


from agents.memory_agent import MemoryAgent
from agents.rag_agent import RAGAgent
from agents.router import RouterAgent, RouterDecision
from agents.web_agent import WebAgent

__all__ = [
    "AgentResult",
    "RouterDecision",
    "RAGAgent",
    "MemoryAgent",
    "WebAgent",
    "RouterAgent",
]
