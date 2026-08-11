"""
NexaMind Backend — Long-Term Memory (Persistent)

Extracts facts from conversations using Flash-Lite background tasks and stores them permanently.
Builds the semantic memory vector index in ChromaDB with semantic deduplication (threshold 0.92).
"""

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
import google.generativeai as genai

from db.mongo import MongoDB
from db.vector_store import ChromaVectorStore
from models.memory import Memory, MemoryCategory, RetrievedMemory
from utils.embedder import GeminiEmbedder

logger = logging.getLogger("nexamind.memory.long_term")

FLASH_LITE_MODEL = "gemini-2.0-flash-lite"
DEDUP_THRESHOLD = 0.92


class LongTermMemory:
    """
    Extracts facts from conversations and stores them permanently.
    Recalled at the start of every session and indexed in ChromaDB.
    """

    EXTRACTION_PROMPT = """
  You are a memory extraction system. Analyze this conversation exchange and
  extract factual information about the user that should be remembered long-term.

  Extract only concrete, useful facts. Skip pleasantries and filler.
  Categories: preference, personal, project, event, knowledge, relationship

  Return ONLY valid JSON array. No explanation. No markdown. Example:
  [
    {"fact": "User is building a project called NexaMind", "category": "project", "confidence": 0.95},
    {"fact": "User prefers concise responses", "category": "preference", "confidence": 0.8}
  ]

  If no memorable facts found, return empty array: []

  Conversation:
  User: {user_message}
  Assistant: {assistant_message}
  """

    def __init__(self) -> None:
        self.embedder = GeminiEmbedder()
        self._vector_store: Optional[ChromaVectorStore] = None

    async def _get_vector_store(self) -> ChromaVectorStore:
        if self._vector_store is None:
            self._vector_store = await ChromaVectorStore.get_instance()
        return self._vector_store

    async def extract_and_store(
        self,
        user_message: str,
        assistant_message: str,
        user_id: str,
        chat_id: str,
        message_id: str,
    ) -> list[Memory]:
        """
        Background task — runs after every assistant response.
        Extracts facts via Flash-Lite, checks semantic deduplication (0.92),
        saves to MongoDB & ChromaDB. Never crashes or blocks the chat flow.
        """
        stored_memories: list[Memory] = []
        try:
            prompt = self.EXTRACTION_PROMPT.format(
                user_message=user_message,
                assistant_message=assistant_message,
            )
            model = genai.GenerativeModel(FLASH_LITE_MODEL)
            response = await asyncio.to_thread(model.generate_content, prompt)
            raw_text = (response.text or "").strip().strip("```json").strip("```").strip()

            if not raw_text or raw_text == "[]":
                return []

            try:
                extracted_facts = json.loads(raw_text)
                if not isinstance(extracted_facts, list):
                    return []
            except Exception:
                logger.warning("Malformed JSON response during memory extraction: %s", raw_text)
                return []

            vs = await self._get_vector_store()

            for item in extracted_facts:
                fact_text = item.get("fact", "").strip()
                category_str = item.get("category", "knowledge").lower()
                confidence = float(item.get("confidence", 1.0))

                if not fact_text:
                    continue

                # Category normalization
                try:
                    category = MemoryCategory(category_str)
                except ValueError:
                    category = MemoryCategory.KNOWLEDGE

                # 3a. Semantic Deduplication Check (score > 0.92)
                try:
                    fact_embedding = await self.embedder.embed_query(fact_text)
                    existing_memories = await vs.query_memories(
                        user_id=user_id,
                        query_embedding=fact_embedding,
                        n_results=1,
                    )
                    if existing_memories and existing_memories[0].score >= DEDUP_THRESHOLD:
                        logger.info("Skipping duplicate memory for user %s: '%s'", user_id, fact_text)
                        continue
                except Exception as embed_exc:
                    logger.warning("Embedding error during memory dedup check: %s", embed_exc)
                    fact_embedding = []

                # 3b. Save to MongoDB
                memory_id = str(ObjectId())
                now = datetime.now(tz=timezone.utc)
                mem_doc = {
                    "_id": ObjectId(memory_id),
                    "userId": user_id,
                    "fact": fact_text,
                    "category": category.value,
                    "confidence": confidence,
                    "sourceMessageId": message_id,
                    "sourceChatId": chat_id,
                    "lastAccessed": now,
                    "accessCount": 0,
                    "createdAt": now,
                }
                await MongoDB.memories().insert_one(mem_doc)

                # 3c. Save to ChromaDB
                if fact_embedding:
                    try:
                        await vs.add_memory(
                            user_id=user_id,
                            memory_id=memory_id,
                            text=fact_text,
                            embedding=fact_embedding,
                            metadata={"category": category.value, "userId": user_id},
                        )
                    except Exception as chroma_exc:
                        logger.warning("Failed to store memory in ChromaDB: %s", chroma_exc)

                memory_obj = Memory(
                    id=memory_id,
                    userId=user_id,
                    fact=fact_text,
                    category=category,
                    confidence=confidence,
                    sourceMessageId=message_id,
                    sourceChatId=chat_id,
                    lastAccessed=now,
                    accessCount=0,
                    createdAt=now,
                )
                stored_memories.append(memory_obj)

            return stored_memories

        except Exception as exc:
            logger.error("Error in long-term memory extraction: %s", exc)
            return []

    async def retrieve_relevant(
        self,
        query: str,
        user_id: str,
        n_results: int = 8,
    ) -> list[RetrievedMemory]:
        """
        Retrieves semantically relevant memories + 3 most recent memories.
        Deduplicates and returns top n_results.
        """
        try:
            query_embedding = await self.embedder.embed_query(query)
            vs = await self._get_vector_store()
            semantic_memories = await vs.query_memories(
                user_id=user_id,
                query_embedding=query_embedding,
                n_results=n_results,
            )

            # Fetch 3 most recent memories from MongoDB
            cursor = (
                MongoDB.memories()
                .find({"userId": user_id})
                .sort("createdAt", -1)
                .limit(3)
            )
            recent_docs = await cursor.to_list(length=3)
            recent_memories = [
                RetrievedMemory(
                    memoryId=str(d["_id"]),
                    fact=d.get("fact", ""),
                    category=d.get("category", "knowledge"),
                    score=0.8,
                )
                for d in recent_docs
            ]

            # Merge and deduplicate by memoryId
            merged_dict: dict[str, RetrievedMemory] = {}
            for m in semantic_memories:
                merged_dict[m.memoryId] = m
            for m in recent_memories:
                if m.memoryId not in merged_dict:
                    merged_dict[m.memoryId] = m

            all_memories = list(merged_dict.values())
            all_memories.sort(key=lambda x: x.score, reverse=True)

            retrieved = all_memories[:n_results]
            if retrieved:
                asyncio.create_task(self.mark_accessed([m.memoryId for m in retrieved]))

            return retrieved
        except Exception as exc:
            logger.error("Error retrieving relevant memories for user %s: %s", user_id, exc)
            return []

    async def get_user_context_summary(self, user_id: str) -> str:
        """
        Builds system prompt section summarizing what we know about the user.
        Fetches top 10 highest-confidence memories.
        Returns empty string "" if no memories exist.
        """
        try:
            cursor = (
                MongoDB.memories()
                .find({"userId": user_id})
                .sort([("confidence", -1), ("lastAccessed", -1)])
                .limit(10)
            )
            docs = await cursor.to_list(length=10)
            if not docs:
                return ""

            lines = ["What you know about this user:"]
            for d in docs:
                cat = d.get("category", "knowledge")
                fact = d.get("fact", "")
                if fact:
                    lines.append(f"- [{cat}] {fact}")

            return "\n".join(lines) if len(lines) > 1 else ""
        except Exception as exc:
            logger.error("Error building user context summary for %s: %s", user_id, exc)
            return ""

    async def mark_accessed(self, memory_ids: list[str]) -> None:
        """Update lastAccessed and increment accessCount for retrieved memories."""
        if not memory_ids:
            return
        try:
            obj_ids = [ObjectId(mid) for mid in memory_ids if ObjectId.is_valid(mid)]
            if obj_ids:
                await MongoDB.memories().update_many(
                    {"_id": {"$in": obj_ids}},
                    {
                        "$set": {"lastAccessed": datetime.now(tz=timezone.utc)},
                        "$inc": {"accessCount": 1},
                    },
                )
        except Exception as exc:
            logger.warning("Failed to mark memories accessed: %s", exc)

    async def delete_memory(self, memory_id: str, user_id: str) -> bool:
        """Delete from MongoDB + ChromaDB after verifying userId ownership."""
        try:
            if not ObjectId.is_valid(memory_id):
                return False

            oid = ObjectId(memory_id)
            mem = await MongoDB.memories().find_one({"_id": oid})
            if not mem or mem.get("userId") != user_id:
                return False

            await MongoDB.memories().delete_one({"_id": oid})

            try:
                vs = await self._get_vector_store()
                collection = vs.get_memory_collection(user_id)
                await asyncio.to_thread(collection.delete, ids=[memory_id])
            except Exception as chroma_exc:
                logger.warning("Failed to delete memory vector from ChromaDB: %s", chroma_exc)

            return True
        except Exception as exc:
            logger.error("Error deleting memory %s: %s", memory_id, exc)
            return False

    async def get_all_memories(
        self, user_id: str, category: Optional[str] = None
    ) -> list[Memory]:
        """Fetch all memories for user, optionally filtered by category."""
        try:
            query_filter: dict[str, Any] = {"userId": user_id}
            if category:
                query_filter["category"] = category.lower()

            cursor = MongoDB.memories().find(query_filter).sort("createdAt", -1)
            docs = await cursor.to_list(length=200)

            result: list[Memory] = []
            for d in docs:
                try:
                    mem = Memory(
                        id=str(d["_id"]),
                        userId=d["userId"],
                        fact=d["fact"],
                        category=MemoryCategory(d.get("category", "knowledge")),
                        confidence=float(d.get("confidence", 1.0)),
                        sourceMessageId=d.get("sourceMessageId"),
                        sourceChatId=d.get("sourceChatId"),
                        lastAccessed=d.get("lastAccessed", datetime.now(tz=timezone.utc)),
                        accessCount=d.get("accessCount", 0),
                        createdAt=d.get("createdAt", datetime.now(tz=timezone.utc)),
                    )
                    result.append(mem)
                except Exception:
                    pass
            return result
        except Exception as exc:
            logger.error("Error getting all memories for user %s: %s", user_id, exc)
            return []
