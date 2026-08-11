"""
NexaMind Backend — RAG Retrieval Pipeline

Handles the full retrieval-augmented generation flow:
  1. Query embedding via Gemini text-embedding-004
  2. Semantic search in ChromaDB (per-user collection)
  3. Score-based re-ranking and threshold filtering
  4. Metadata enrichment from MongoDB (document filename)
  5. Prompt assembly for Gemini Flash
  6. Source citation extraction from the AI response
"""

import logging
import re
from typing import Optional

from db.mongo import MongoDB
from db.vector_store import ChromaVectorStore
from models.chat import Source
from models.memory import RetrievedChunk
from utils.embedder import GeminiEmbedder

logger = logging.getLogger("nexamind.pipelines.retrieval")

# ── Constants ─────────────────────────────────────────────────────────────────

SCORE_THRESHOLD = 0.4          # Minimum relevance score to include a chunk
MAX_CHUNKS_TO_LLM = 3          # Hard cap on chunks sent to the LLM
MAX_CONTEXT_CHARS = 800        # Characters from chat history for context injection
CHUNK_PREVIEW_LEN = 150        # Characters shown as source chunkText


class RAGRetrievalPipeline:
    """
    Retrieves relevant document chunks for a given query.

    Usage::

        pipeline = RAGRetrievalPipeline()
        chunks = await pipeline.retrieve(query="...", user_id="...")
        prompt = pipeline.build_rag_prompt(query, chunks, history)
        sources = pipeline.extract_sources(chunks, response_text)
    """

    def __init__(self) -> None:
        self.embedder = GeminiEmbedder()
        self._vector_store: Optional[ChromaVectorStore] = None

    async def _get_vector_store(self) -> ChromaVectorStore:
        """Lazy-initialize the vector store singleton."""
        if self._vector_store is None:
            self._vector_store = await ChromaVectorStore.get_instance()
        return self._vector_store

    # ── Core Retrieval ────────────────────────────────────────────────────────

    async def retrieve(
        self,
        query: str,
        user_id: str,
        n_chunks: int = 5,
        filter_doc_ids: list[str] | None = None,
    ) -> list[RetrievedChunk]:
        """
        Full retrieval flow: embed → search → re-rank → enrich → return.

        Steps:
        1. Embed the query with ``embed_query()`` (retrieval_query task type).
        2. Search ChromaDB for the top ``n_chunks`` candidates.
        3. Filter out chunks below :data:`SCORE_THRESHOLD`.
        4. Enrich each chunk with the document filename from MongoDB.
        5. Return sorted by score descending, capped at :data:`MAX_CHUNKS_TO_LLM`.

        Args:
            query:          The user's search query.
            user_id:        Scope results to this user's collection.
            n_chunks:       Max candidates to fetch from ChromaDB.
            filter_doc_ids: Optional list of document IDs to restrict search.

        Returns:
            Up to :data:`MAX_CHUNKS_TO_LLM` :class:`RetrievedChunk` objects.
        """
        logger.debug("RAG retrieve: user=%s query='%s'", user_id, query[:80])

        # 1. Embed query
        try:
            query_embedding = await self.embedder.embed_query(query)
        except Exception as exc:
            logger.error("Query embedding failed: %s", exc)
            return []

        # 2. Search ChromaDB
        vs = await self._get_vector_store()
        raw_chunks = await vs.query_documents(
            user_id=user_id,
            query_embedding=query_embedding,
            n_results=n_chunks,
            filter_doc_ids=filter_doc_ids,
        )

        # 3. Filter by score threshold
        relevant = [c for c in raw_chunks if c.score >= SCORE_THRESHOLD]
        if not relevant:
            logger.debug("No chunks above threshold %.2f for user %s", SCORE_THRESHOLD, user_id)
            return []

        # 4. Enrich with filename from MongoDB
        enriched = await self._enrich_with_filenames(relevant)

        # 5. Return top MAX_CHUNKS_TO_LLM sorted by score
        return sorted(enriched, key=lambda c: c.score, reverse=True)[:MAX_CHUNKS_TO_LLM]

    async def retrieve_with_context(
        self,
        query: str,
        user_id: str,
        chat_history: list[dict],
        n_chunks: int = 5,
        filter_doc_ids: list[str] | None = None,
    ) -> list[RetrievedChunk]:
        """
        Context-aware retrieval using recent chat history.

        If there are prior user messages in ``chat_history``, prepend the last
        user message to the current query before embedding.  This handles
        follow-up questions like "explain more about that" correctly.

        Args:
            query:        Current user query.
            user_id:      Owner of the document collection.
            chat_history: Recent messages (list of dicts with ``role`` / ``content``).
            n_chunks:     Max candidates to fetch.

        Returns:
            Up to :data:`MAX_CHUNKS_TO_LLM` ranked :class:`RetrievedChunk` objects.
        """
        # Build context-enriched query
        enriched_query = query
        prev_user_msgs = [
            m["content"] for m in chat_history
            if m.get("role") == "user" and m.get("content")
        ]
        if prev_user_msgs:
            prev_context = prev_user_msgs[-1][:MAX_CONTEXT_CHARS]
            enriched_query = f"{prev_context} {query}"

        return await self.retrieve(
            query=enriched_query,
            user_id=user_id,
            n_chunks=n_chunks,
            filter_doc_ids=filter_doc_ids,
        )

    # ── Prompt Assembly ───────────────────────────────────────────────────────

    def build_rag_prompt(
        self,
        query: str,
        chunks: list[RetrievedChunk],
        chat_history: list[dict],
    ) -> str:
        """
        Assemble the full RAG prompt to send to Gemini Flash.

        Format:
        - System instruction
        - DOCUMENT CONTEXT section (one block per chunk)
        - CONVERSATION HISTORY section (last 5 messages)
        - USER QUESTION
        - Response instruction

        Args:
            query:        The user's question.
            chunks:       Retrieved and re-ranked document chunks.
            chat_history: Recent conversation messages.

        Returns:
            A formatted string prompt ready for the Gemini API.
        """
        # Build document context section
        context_parts: list[str] = []
        for chunk in chunks:
            filename = chunk.metadata.get("filename", "Unknown document")
            idx = chunk.chunkIndex
            context_parts.append(
                f"[Source: {filename}, chunk {idx}]\n{chunk.text}"
            )
        document_context = "\n\n---\n\n".join(context_parts)

        # Build conversation history section (last 5 messages)
        history_parts: list[str] = []
        for msg in chat_history[-5:]:
            role = "User" if msg.get("role") == "user" else "Assistant"
            content = msg.get("content", "")[:500]  # Truncate for prompt brevity
            history_parts.append(f"{role}: {content}")
        conversation_history = (
            "\n".join(history_parts) if history_parts else "No prior conversation."
        )

        prompt = f"""You are NexaMind, a helpful personal AI assistant.
Answer the user's question based ONLY on the provided document context.
If the context doesn't contain enough information, say so clearly.
Always cite which document your answer comes from.

DOCUMENT CONTEXT:
{document_context}

CONVERSATION HISTORY:
{conversation_history}

USER QUESTION: {query}

Respond in clear markdown. Include source references like [Source: filename] when citing information."""

        return prompt

    # ── Source Extraction ─────────────────────────────────────────────────────

    def extract_sources(
        self,
        chunks: list[RetrievedChunk],
        response_text: str,
    ) -> list[Source]:
        """
        Parse the AI response to find which document sources were actually cited.

        Matches ``[Source: <filename>]`` patterns in the response and cross-
        references against the retrieved chunks.  Only sources that scored
        above :data:`SCORE_THRESHOLD` and appear in the response are returned.

        Args:
            chunks:        The retrieved chunks passed to the LLM.
            response_text: The raw text response from Gemini.

        Returns:
            List of :class:`Source` objects for sources cited in the response.
        """
        cited_sources: list[Source] = []
        seen_doc_ids: set[str] = set()

        # Find all [Source: <filename>] references in the response
        cited_filenames: set[str] = set()
        for match in re.finditer(r"\[Source:\s*([^\]]+?)\]", response_text, re.IGNORECASE):
            cited_filenames.add(match.group(1).strip().lower())

        for chunk in chunks:
            doc_id = chunk.documentId
            if doc_id in seen_doc_ids:
                continue

            filename = chunk.metadata.get("filename", "")
            # Include if filename is cited OR if response mentions the doc
            filename_lower = filename.lower()
            is_cited = (
                filename_lower in cited_filenames
                or any(cf in filename_lower for cf in cited_filenames)
                or any(filename_lower in cf for cf in cited_filenames)
            )

            if is_cited or not cited_filenames:
                # If no explicit citations were found, include all sources
                cited_sources.append(
                    Source(
                        documentId=doc_id,
                        filename=filename or "Unknown",
                        pageNumber=chunk.metadata.get("pageNumber"),
                        chunkText=chunk.text[:CHUNK_PREVIEW_LEN],
                    )
                )
                seen_doc_ids.add(doc_id)

        return cited_sources

    # ── Private Helpers ───────────────────────────────────────────────────────

    async def _enrich_with_filenames(
        self, chunks: list[RetrievedChunk]
    ) -> list[RetrievedChunk]:
        """
        Look up document filenames from MongoDB and inject them into chunk metadata.

        Performs a single batch query for all unique document IDs.
        """
        unique_doc_ids = list({c.documentId for c in chunks})
        if not unique_doc_ids:
            return chunks

        # Batch fetch document metadata
        filename_map: dict[str, str] = {}
        try:
            from bson import ObjectId

            object_ids = []
            str_ids = []
            for doc_id in unique_doc_ids:
                try:
                    object_ids.append(ObjectId(doc_id))
                except Exception:
                    str_ids.append(doc_id)

            query_filter: dict = {}
            if object_ids and str_ids:
                query_filter = {"$or": [
                    {"_id": {"$in": object_ids}},
                    {"_id": {"$in": str_ids}},
                ]}
            elif object_ids:
                query_filter = {"_id": {"$in": object_ids}}
            else:
                query_filter = {"_id": {"$in": str_ids}}

            cursor = MongoDB.documents().find(
                query_filter,
                {"filename": 1, "_id": 1},
            )
            async for doc in cursor:
                filename_map[str(doc["_id"])] = doc.get("filename", "Unknown")
        except Exception as exc:
            logger.warning("Failed to enrich chunks with filenames: %s", exc)

        # Inject filenames into chunk metadata (mutate a copy)
        enriched: list[RetrievedChunk] = []
        for chunk in chunks:
            new_meta = dict(chunk.metadata)
            new_meta["filename"] = filename_map.get(chunk.documentId, "Unknown")
            enriched.append(
                RetrievedChunk(
                    text=chunk.text,
                    documentId=chunk.documentId,
                    chunkIndex=chunk.chunkIndex,
                    score=chunk.score,
                    metadata=new_meta,
                )
            )

        return enriched
