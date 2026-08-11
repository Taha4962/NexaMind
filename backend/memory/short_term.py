"""
NexaMind Backend — Short-Term Memory (Sliding Window)

Manages the sliding window of recent messages for a chat session.
Provides window fetching, token/message count check, and Flash-Lite
summarization for older messages when conversation length exceeds MAX_MESSAGES.
"""

import asyncio
import logging
from typing import Any

import google.generativeai as genai
from db.mongo import MongoDB

logger = logging.getLogger("nexamind.memory.short_term")

MAX_MESSAGES = 20
MAX_TOKENS_APPROX = 4000
FLASH_LITE_MODEL = "gemini-2.0-flash-lite"


class ShortTermMemory:
    """
    Manages the sliding window of recent messages for a chat session.
    This is what gets injected directly into the LLM context window.
    """

    def __init__(self, chat_id: str, user_id: str) -> None:
        self.chat_id = chat_id
        self.user_id = user_id

    async def should_summarize(self) -> bool:
        """Returns True if chat has > MAX_MESSAGES messages."""
        try:
            count = await MongoDB.messages().count_documents({"chatId": self.chat_id})
            return count > MAX_MESSAGES
        except Exception as exc:
            logger.error("Error checking message count for chat %s: %s", self.chat_id, exc)
            return False

    async def get_window(self) -> list[dict[str, str]]:
        """
        Fetches last MAX_MESSAGES messages from MongoDB for this chat.
        Returns as list of { role: "user" | "assistant", content: str }.
        Filters out messages where content is empty or status is "partial".
        """
        try:
            cursor = (
                MongoDB.messages()
                .find(
                    {
                        "chatId": self.chat_id,
                        "content": {"$ne": ""},
                        "status": {"$ne": "partial"},
                    },
                    {"role": 1, "content": 1, "_id": 0},
                )
                .sort("createdAt", -1)
                .limit(MAX_MESSAGES)
            )
            raw_docs = await cursor.to_list(length=MAX_MESSAGES)
            history = list(reversed(raw_docs))
            return [
                {"role": doc.get("role", "user"), "content": doc.get("content", "")}
                for doc in history
                if doc.get("content")
            ]
        except Exception as exc:
            logger.error("Error fetching short term window for chat %s: %s", self.chat_id, exc)
            return []

    async def get_window_with_summary(self) -> list[dict[str, str]]:
        """
        If chat has > MAX_MESSAGES messages: summarize oldest messages into a single
        system message before the window, then include last MAX_MESSAGES messages.
        """
        try:
            total_count = await MongoDB.messages().count_documents({"chatId": self.chat_id})
            if total_count <= MAX_MESSAGES:
                return await self.get_window()

            # Fetch oldest messages to summarize
            skip_count = total_count - MAX_MESSAGES
            cursor_old = (
                MongoDB.messages()
                .find(
                    {
                        "chatId": self.chat_id,
                        "content": {"$ne": ""},
                        "status": {"$ne": "partial"},
                    },
                    {"role": 1, "content": 1, "_id": 0},
                )
                .sort("createdAt", 1)
                .limit(skip_count)
            )
            old_docs = await cursor_old.to_list(length=skip_count)
            old_messages_text = "\n".join(
                f"{d.get('role', 'user').capitalize()}: {d.get('content', '')}"
                for d in old_docs
            )

            # Summarize via Flash-Lite
            summary_prompt = (
                "Summarize this conversation history in 3-5 sentences, capturing "
                f"key topics, decisions, and context:\n\n{old_messages_text[:3000]}"
            )
            model = genai.GenerativeModel(FLASH_LITE_MODEL)
            response = await asyncio.to_thread(model.generate_content, summary_prompt)
            summary_text = (response.text or "").strip()

            latest_window = await self.get_window()
            if summary_text:
                summary_msg = {
                    "role": "assistant",
                    "content": f"[Summary of earlier conversation: {summary_text}]",
                }
                return [summary_msg] + latest_window

            return latest_window
        except Exception as exc:
            logger.error("Error summarizing context for chat %s: %s", self.chat_id, exc)
            return await self.get_window()

    def format_for_prompt(self, messages: list[dict[str, str]]) -> str:
        """Formats message list as readable conversation string for prompt injection."""
        lines = []
        for msg in messages:
            role = "User" if msg.get("role") == "user" else "Assistant"
            lines.append(f"{role}: {msg.get('content', '')}")
        return "\n".join(lines)
