"""
NexaMind Backend — Centralized Model Router

Provides a unified mapping from task types to LLM providers and model identifiers.
Ensures consistent model selection across all agents, pipelines, and endpoints.
"""

from typing import Literal, TypedDict


class ModelChoice(TypedDict):
    provider: Literal["gemini", "groq"]
    model: str


TaskType = Literal[
    "intent",
    "rag_generation",
    "memory_synthesis",
    "web_summary",
    "entity_extraction",
    "title_generation",
    "direct_chat",
]

MODEL_MAP: dict[TaskType, ModelChoice] = {
    "intent": {"provider": "gemini", "model": "gemini-2.0-flash-lite"},
    "rag_generation": {"provider": "gemini", "model": "gemini-2.5-flash"},
    "memory_synthesis": {"provider": "gemini", "model": "gemini-2.5-flash"},
    "web_summary": {"provider": "gemini", "model": "gemini-2.0-flash-lite"},
    "entity_extraction": {"provider": "gemini", "model": "gemini-2.0-flash-lite"},
    "title_generation": {"provider": "gemini", "model": "gemini-2.0-flash-lite"},
    "direct_chat": {"provider": "groq", "model": "llama-3.3-70b-versatile"},
}


def select_model(task_type: TaskType) -> ModelChoice:
    """
    Returns the provider and model configuration for a given task type.

    Mapping:
      - intent -> gemini / gemini-2.0-flash-lite
      - rag_generation -> gemini / gemini-2.5-flash
      - memory_synthesis -> gemini / gemini-2.5-flash
      - web_summary -> gemini / gemini-2.0-flash-lite
      - entity_extraction -> gemini / gemini-2.0-flash-lite
      - title_generation -> gemini / gemini-2.0-flash-lite
      - direct_chat -> groq / llama-3.3-70b-versatile
    """
    return MODEL_MAP.get(
        task_type,
        {"provider": "gemini", "model": "gemini-2.5-flash"},
    )
