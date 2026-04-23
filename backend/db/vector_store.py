"""
NexaMind Backend — ChromaDB Vector Store Singleton

Provides a singleton ChromaDB client for storing and querying
document embeddings. Uses persistent storage to maintain vectors
across application restarts.
"""

import logging
from typing import Optional

import chromadb
from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

from config import get_settings

logger = logging.getLogger("nexamind.db.vector_store")

# ── Collection Name ──
COLLECTION_NAME = "nexamind_documents"


class VectorStoreClient:
    """
    Singleton ChromaDB client manager.

    Manages the ChromaDB persistent client lifecycle and provides
    access to the document embeddings collection.
    """

    _instance: Optional["VectorStoreClient"] = None
    _client: Optional[ClientAPI] = None
    _collection: Optional[Collection] = None

    def __new__(cls) -> "VectorStoreClient":
        """Ensure only one VectorStoreClient instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def initialize(self) -> None:
        """
        Initialize the ChromaDB persistent client.

        Creates the persistent storage directory if it doesn't exist
        and initializes the documents collection.

        Raises:
            RuntimeError: If ChromaDB initialization fails.
        """
        try:
            settings = get_settings()
            self._client = chromadb.PersistentClient(
                path=settings.chroma_persist_dir,
            )
            self._collection = self._client.get_or_create_collection(
                name=COLLECTION_NAME,
                metadata={"description": "NexaMind document embeddings"},
            )
            logger.info(
                "ChromaDB initialized at %s with collection '%s'",
                settings.chroma_persist_dir,
                COLLECTION_NAME,
            )
        except Exception as e:
            logger.error("ChromaDB initialization failed: %s", str(e))
            raise RuntimeError(f"Failed to initialize ChromaDB: {str(e)}") from e

    @property
    def client(self) -> ClientAPI:
        """
        Get the ChromaDB client instance.

        Returns:
            The ChromaDB client for advanced operations.

        Raises:
            RuntimeError: If the client has not been initialized.
        """
        if self._client is None:
            raise RuntimeError(
                "ChromaDB client is not initialized. Call initialize() first."
            )
        return self._client

    @property
    def collection(self) -> Collection:
        """
        Get the documents collection.

        Returns:
            The ChromaDB collection for document embeddings.

        Raises:
            RuntimeError: If the collection has not been created.
        """
        if self._collection is None:
            raise RuntimeError(
                "ChromaDB collection is not available. Call initialize() first."
            )
        return self._collection


def get_vector_store() -> VectorStoreClient:
    """
    Get the singleton VectorStoreClient instance.

    Returns:
        The VectorStoreClient singleton for vector operations.
    """
    return VectorStoreClient()
