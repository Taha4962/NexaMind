"""
NexaMind Backend — Short-Term Memory (Sliding Window)

Manages the conversation context window by maintaining a sliding
window of recent messages. Ensures the LLM receives relevant
conversation history without exceeding token limits.
"""

import logging
from typing import Optional

logger = logging.getLogger("nexamind.memory.short_term")

# ── Default Window Size ──
DEFAULT_WINDOW_SIZE = 20
MAX_CONTEXT_TOKENS = 4000


async def get_chat_history(
    chat_id: str,
    user_id: str,
    window_size: int = DEFAULT_WINDOW_SIZE,
) -> list[dict[str, str]]:
    """
    Retrieve recent chat history within the sliding window.

    Fetches the most recent messages from MongoDB for the given chat,
    formatted as role/content pairs suitable for LLM context.

    Args:
        chat_id: The chat session ID.
        user_id: The user ID for ownership verification.
        window_size: Number of recent messages to include.

    Returns:
        List of message dictionaries with 'role' and 'content' keys.
    """
    raise NotImplementedError(
        "Short-term memory retrieval — will query MongoDB messages collection "
        "for the most recent N messages in the chat, format them as role/content "
        "pairs, and apply token-based truncation to stay within context limits."
    )


async def trim_to_token_limit(
    messages: list[dict[str, str]],
    max_tokens: int = MAX_CONTEXT_TOKENS,
) -> list[dict[str, str]]:
    """
    Trim message history to fit within token limits.

    Removes oldest messages first while preserving the system message
    and the most recent user message.

    Args:
        messages: List of message dictionaries to trim.
        max_tokens: Maximum token budget for the context window.

    Returns:
        Trimmed list of messages within the token budget.
    """
    raise NotImplementedError(
        "Token-based trimming — will estimate token counts per message, "
        "remove oldest messages until the total is within max_tokens, "
        "always preserving the system prompt and latest user message."
    )
