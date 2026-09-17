"""
NexaMind Backend — Long-Term Memory Manager

Extracts, stores, searches, and deduplicates long-term user memories.
Uses Flash-Lite for structured fact extraction, ChromaDB for semantic search,
and MongoDB for persistence and metadata tracking.
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Optional

from bson import ObjectId
import google.generativeai as genai

from config import get_settings
from db.mongo import MongoDB
from db.vector_store import ChromaVectorStore
from models.memory import Memory, MemoryCategory, RetrievedMemory
from utils.embedder import GeminiEmbedder

logger = logging.getLogger("nexamind.memory.long_term")

FLASH_LITE_MODEL = "gemini-2.0-flash-lite"
DEDUP_SIMILARITY_THRESHOLD = 0.92


class LongTermMemory:
    """
    Manages persistent user memories across all sessions.
    Handles extraction, semantic deduplication, vector storage, and retrieval.
    """

    EXTRACTION_PROMPT = """
Analyze this conversation and extract durable facts, preferences, and details
about the user that are worth remembering across sessions.

Categories to extract:
- preference: likes, dislikes, habits, preferred tools/languages
- personal: name, job, location, background, goals
- project: what they are working on, tech stack, requirements, deadlines
- event: important dates, upcoming milestones, past occurrences
- knowledge: specific domain facts they established or explained
- relationship: people, colleagues, teammates they mention

Rules:
1. ONLY extract facts ABOUT THE USER. Ignore general world knowledge.
2. If nothing memorable, return {"memories": []}.
3. Each memory must be a single self-contained declarative sentence.
4. Confidence: 0.0 to 1.0 (how certain this fact is true).

Return valid JSON with format:
{
  "memories": [
    {"fact": "User is building a MERN stack application named NexaMind", "category": "project", "confidence": 0.95},
    {"fact": "User prefers concise technical responses", "category": "preference", "confidence": 0.9}
  ]
}

Conversation:
User: {user_message}
Assistant: {assistant_message}
"""

    def __init__(self) -> None:
        self.settings = get_settings()
        self.embedder = GeminiEmbedder()
        genai.configure(api_key=self.settings.gemini_api_key)

    async def _get_vector_store(self) -> ChromaVectorStore:
        return await ChromaVectorStore.get_instance()

    async def extract_and_save(
        self,
        user_message: str,
        assistant_message: str,
        user_id: str,
        chat_id: str,
        message_id: str = "",
    ) -> list[Memory]:
        """
        Background task: extracts memories via Flash-Lite, semantically deduplicates
        against existing ChromaDB memories, then saves to MongoDB + ChromaDB.
        """
        try:
            prompt = self.EXTRACTION_PROMPT.format(
                user_message=user_message,
                assistant_message=assistant_message,
            )

            model = genai.GenerativeModel(
                model_name=FLASH_LITE_MODEL,
                generation_config={"response_mime_type": "application/json"},
            )
            response = await asyncio.to_thread(model.generate_content, prompt)
            raw_text = response.text or "{}"
            raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE).strip()

            data = json.loads(raw_text)
            extracted_items = data.get("memories", [])
            if not extracted_items:
                return []

            stored_memories: list[Memory] = []
            vs = await self._get_vector_store()

            for item in extracted_items:
                fact_text = item.get("fact", "").strip()
                cat_str = item.get("category", "knowledge").lower()
                confidence = float(item.get("confidence", 0.8))

                if not fact_text:
                    continue

                try:
                    category = MemoryCategory(cat_str)
                except ValueError:
                    category = MemoryCategory.KNOWLEDGE

                # 1. Embed new fact
                try:
                    embeddings = await self.embedder.embed_chunks([fact_text])
                    fact_embedding = embeddings[0] if embeddings else None
                except Exception as emb_exc:
                    logger.warning("Failed to embed fact '%s': %s", fact_text, emb_exc)
                    fact_embedding = None

                # 2. Semantic deduplication
                if fact_embedding:
                    similar = await vs.query_memories(
                        user_id=user_id,
                        query_embedding=fact_embedding,
                        n_results=1,
                    )
                    if similar and similar[0].score >= DEDUP_SIMILARITY_THRESHOLD:
                        # Update lastAccessed on existing memory in MongoDB
                        existing_id = similar[0].memoryId
                        if ObjectId.is_valid(existing_id):
                            await MongoDB.memories().update_one(
                                {"_id": ObjectId(existing_id)},
                                {
                                    "$set": {
                                        "lastAccessed": datetime.now(tz=timezone.utc)
                                    },
                                    "$inc": {"accessCount": 1},
                                },
                            )
                        logger.info(
                            "Dedup: skipping duplicate memory (score=%.3f): %s",
                            similar[0].score,
                            fact_text,
                        )
                        continue

                # 3. Store new memory in MongoDB
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

                # 4. Save to ChromaDB
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
