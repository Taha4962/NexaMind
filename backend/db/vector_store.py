"""
NexaMind Backend — ChromaDB Vector Store Singleton

Provides a singleton ChromaDB client with per-user collection management
for document chunks and memory embeddings. Uses cosine similarity and
persistent storage across application restarts.
"""

import asyncio
import logging
from typing import Any, Optional

try:
    import chromadb
    CHROMA_AVAILABLE = True
except ImportError:
    chromadb = None  # type: ignore[assignment]
    CHROMA_AVAILABLE = False

from config import get_settings
from models.memory import RetrievedChunk, RetrievedMemory

logger = logging.getLogger("nexamind.db.vector_store")

_lock = asyncio.Lock()


class ChromaVectorStore:
    """
    Singleton ChromaDB client with per-user collection management.

    Uses a PersistentClient so vectors survive application restarts.
    Collections are scoped per user to provide data isolation:
      - Document chunks: ``docs_{user_id[:16]}``
      - Memory entries:  ``mem_{user_id[:16]}``
    """

    _instance: Optional["ChromaVectorStore"] = None
    _client: Optional[object] = None  # type: ignore[type-arg]

    # ── Singleton ────────────────────────────────────────────────────────────

    @classmethod
    async def get_instance(cls) -> "ChromaVectorStore":
        """
        Return the singleton ChromaVectorStore, initializing it on first call.

        Thread-safe via asyncio.Lock so concurrent coroutines cannot race.
        """
        if cls._instance is not None:
            return cls._instance

        async with _lock:
            # Double-checked locking — another coroutine may have initialized
            # while we were waiting for the lock.
            if cls._instance is not None:
                return cls._instance

            settings = get_settings()
            instance = cls()
            if not CHROMA_AVAILABLE:
                logger.warning("ChromaDB library not available. Vector store disabled.")
                cls._instance = instance
                return instance

            try:
                instance._client = chromadb.PersistentClient(
                    path=settings.chroma_persist_dir,
                )
                logger.info(
                    "ChromaDB PersistentClient initialized at '%s'",
                    settings.chroma_persist_dir,
                )
            except Exception as exc:
                logger.error("ChromaDB initialization failed: %s", exc)
                raise RuntimeError(f"Failed to initialize ChromaDB: {exc}") from exc

            cls._instance = instance
            return instance

    # ── Internal helpers ─────────────────────────────────────────────────────

    @property
    def _chroma(self) -> "Any":
        if not CHROMA_AVAILABLE or self._client is None:
            raise RuntimeError(
                "ChromaVectorStore is not available or initialized."
            )
        return self._client

    # ── Collection Accessors ─────────────────────────────────────────────────

    def get_doc_collection(self, user_id: str) -> "Any":
        """
        Return (or create) the document-chunk collection for *user_id*.

        Collection name: ``docs_{user_id[:16]}`` using cosine similarity.
        """
        name = f"docs_{user_id[:16]}"
        return self._chroma.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )

    def get_memory_collection(self, user_id: str) -> "Any":
        """
        Return (or create) the memory collection for *user_id*.

        Collection name: ``mem_{user_id[:16]}`` using cosine similarity.
        """
        name = f"mem_{user_id[:16]}"
        return self._chroma.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"},
        )

    # ── Query ────────────────────────────────────────────────────────────────

    async def query_documents(
        self,
        user_id: str,
        query_embedding: list[float],
        n_results: int = 5,
        filter_doc_ids: list[str] | None = None,
    ) -> list[RetrievedChunk]:
        """
        Semantic search over the user's document collection.

        Args:
            user_id:         Owner of the collection to search.
            query_embedding: Pre-computed query embedding vector.
            n_results:       Maximum number of chunks to return.
            filter_doc_ids:  If provided, restrict search to these document IDs.

        Returns:
            List of :class:`RetrievedChunk` sorted by relevance score descending.
        """
        collection = self.get_doc_collection(user_id)

        # Build optional where-filter
        where: dict | None = None
        if filter_doc_ids:
            where = {"documentId": {"$in": filter_doc_ids}}

        kwargs: dict = {
            "query_embeddings": [query_embedding],
            "n_results": n_results,
            "include": ["documents", "metadatas", "distances"],
        }
        if where is not None:
            kwargs["where"] = where

        try:
            results = await asyncio.to_thread(collection.query, **kwargs)
        except Exception as exc:
            logger.error("ChromaDB document query failed for user %s: %s", user_id, exc)
            return []

        chunks: list[RetrievedChunk] = []
        docs = results.get("documents") or [[]]
        metas = results.get("metadatas") or [[]]
        dists = results.get("distances") or [[]]

        for text, meta, dist in zip(docs[0], metas[0], dists[0]):
            # ChromaDB cosine distance → similarity score: 1 - distance
            score = float(1.0 - dist)
            chunks.append(
                RetrievedChunk(
                    text=text or "",
                    documentId=meta.get("documentId", ""),
                    chunkIndex=int(meta.get("chunkIndex", 0)),
                    score=score,
                    metadata=dict(meta),
                )
            )

        return sorted(chunks, key=lambda c: c.score, reverse=True)

    async def query_memories(
        self,
        user_id: str,
        query_embedding: list[float],
        n_results: int = 5,
    ) -> list[RetrievedMemory]:
        """
        Semantic search over the user's memory collection.

        Returns:
            List of :class:`RetrievedMemory` sorted by relevance score descending.
        """
        collection = self.get_memory_collection(user_id)

        try:
            results = await asyncio.to_thread(
                collection.query,
                query_embeddings=[query_embedding],
                n_results=n_results,
                include=["documents", "metadatas", "distances"],
            )
        except Exception as exc:
            logger.error("ChromaDB memory query failed for user %s: %s", user_id, exc)
            return []

        memories: list[RetrievedMemory] = []
        docs = results.get("documents") or [[]]
        metas = results.get("metadatas") or [[]]
        dists = results.get("distances") or [[]]
        ids = results.get("ids") or [[]]

        for mem_id, text, meta, dist in zip(ids[0], docs[0], metas[0], dists[0]):
            score = float(1.0 - dist)
            memories.append(
                RetrievedMemory(
                    memoryId=mem_id,
                    fact=text or "",
                    category=meta.get("category", "knowledge"),
                    score=score,
                )
            )

        return sorted(memories, key=lambda m: m.score, reverse=True)

    # ── Insert ───────────────────────────────────────────────────────────────

    async def add_document_chunks(
        self,
        user_id: str,
        chunks: list[str],
        embeddings: list[list[float]],
        doc_id: str,
        metadata: list[dict],
    ) -> None:
        """
        Bulk-insert document chunks with their embeddings into ChromaDB.

        Each chunk ID is formatted as ``{doc_id}_chunk_{index}``.
        """
        collection = self.get_doc_collection(user_id)
        ids = [f"{doc_id}_chunk_{i}" for i in range(len(chunks))]

        try:
            await asyncio.to_thread(
                collection.upsert,
                ids=ids,
                embeddings=embeddings,
                documents=chunks,
                metadatas=metadata,
            )
            logger.info(
                "Inserted %d chunks for doc %s (user %s)",
                len(chunks),
                doc_id,
                user_id,
            )
        except Exception as exc:
            logger.error(
                "Failed to insert chunks for doc %s: %s", doc_id, exc
            )
            raise

    async def add_memory(
        self,
        user_id: str,
        memory_id: str,
        text: str,
        embedding: list[float],
        metadata: dict | None = None,
    ) -> None:
        """
        Insert or update a single memory entry in the user's memory collection.
        """
        collection = self.get_memory_collection(user_id)
        try:
            await asyncio.to_thread(
                collection.upsert,
                ids=[memory_id],
                embeddings=[embedding],
                documents=[text],
                metadatas=[metadata or {}],
            )
        except Exception as exc:
            logger.error(
                "Failed to add memory %s for user %s: %s", memory_id, user_id, exc
            )
            raise

    # ── Delete ───────────────────────────────────────────────────────────────

    async def delete_document(self, user_id: str, doc_id: str) -> None:
        """
        Delete all chunks belonging to *doc_id* from the user's collection.
        """
        collection = self.get_doc_collection(user_id)
        try:
            await asyncio.to_thread(
                collection.delete,
                where={"documentId": doc_id},
            )
            logger.info("Deleted chunks for doc %s (user %s)", doc_id, user_id)
        except Exception as exc:
            logger.error(
                "Failed to delete doc %s for user %s: %s", doc_id, user_id, exc
            )
            raise


# ── Legacy convenience wrapper (keeps ingestion.py working without changes) ──

def get_vector_store() -> ChromaVectorStore:
    """
    Return the ChromaVectorStore singleton **synchronously** (for use in sync code).

    .. warning::
        The singleton must have been initialized via
        ``await ChromaVectorStore.get_instance()`` before calling this.
    """
    if ChromaVectorStore._instance is None:
        raise RuntimeError(
            "ChromaVectorStore has not been initialized. "
            "Ensure the application lifespan calls "
            "``await ChromaVectorStore.get_instance()`` on startup."
        )
    return ChromaVectorStore._instance
