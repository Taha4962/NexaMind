"""
NexaMind Backend — MongoDB Async Client Singleton

Provides a singleton MongoDB client using the Motor async driver.
All database operations throughout the application must use this
singleton to ensure connection pooling and resource efficiency.
"""

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

logger = logging.getLogger("nexamind.db.mongo")

# ── Database Name ──
DATABASE_NAME = "nexamind"


class MongoDBClient:
    """
    Singleton MongoDB async client manager.

    Manages the Motor client lifecycle and provides access to the
    NexaMind database and its collections. Only one instance should
    exist throughout the application lifecycle.
    """

    _instance: Optional["MongoDBClient"] = None
    _client: Optional[AsyncIOMotorClient] = None  # type: ignore[type-arg]
    _database: Optional[AsyncIOMotorDatabase] = None  # type: ignore[type-arg]

    def __new__(cls) -> "MongoDBClient":
        """Ensure only one MongoDBClient instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def connect(self, mongo_url: str) -> None:
        """
        Establish connection to MongoDB Atlas.

        Args:
            mongo_url: MongoDB connection string.

        Raises:
            ConnectionError: If the connection cannot be established.
        """
        try:
            self._client = AsyncIOMotorClient(
                mongo_url,
                maxPoolSize=50,
                minPoolSize=10,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=10000,
            )
            # Verify connection by pinging the server
            await self._client.admin.command("ping")
            self._database = self._client[DATABASE_NAME]
            logger.info("Connected to MongoDB database: %s", DATABASE_NAME)
        except Exception as e:
            logger.error("MongoDB connection failed: %s", str(e))
            raise ConnectionError(f"Failed to connect to MongoDB: {str(e)}") from e

    async def disconnect(self) -> None:
        """Close the MongoDB connection and release resources."""
        if self._client is not None:
            self._client.close()
            self._client = None
            self._database = None
            logger.info("MongoDB connection closed")

    @property
    def database(self) -> AsyncIOMotorDatabase:  # type: ignore[type-arg]
        """
        Get the NexaMind database instance.

        Returns:
            The Motor database object for the nexamind database.

        Raises:
            RuntimeError: If the database connection has not been established.
        """
        if self._database is None:
            raise RuntimeError(
                "MongoDB is not connected. Call connect() first during app startup."
            )
        return self._database

    @property
    def client(self) -> AsyncIOMotorClient:  # type: ignore[type-arg]
        """
        Get the raw Motor client instance.

        Returns:
            The Motor client for advanced operations.

        Raises:
            RuntimeError: If the client has not been initialized.
        """
        if self._client is None:
            raise RuntimeError(
                "MongoDB client is not initialized. Call connect() first."
            )
        return self._client

    # ── Collection Accessors ──

    @property
    def users(self):  # type: ignore[no-untyped-def]
        """Access the users collection."""
        return self.database["users"]

    @property
    def chats(self):  # type: ignore[no-untyped-def]
        """Access the chats collection."""
        return self.database["chats"]

    @property
    def messages(self):  # type: ignore[no-untyped-def]
        """Access the messages collection."""
        return self.database["messages"]

    @property
    def memories(self):  # type: ignore[no-untyped-def]
        """Access the memories collection."""
        return self.database["memories"]

    @property
    def documents(self):  # type: ignore[no-untyped-def]
        """Access the documents collection."""
        return self.database["documents"]

    @property
    def revoked_tokens(self):  # type: ignore[no-untyped-def]
        """Access the revoked_tokens collection for JWT blacklisting."""
        return self.database["revoked_tokens"]

    @property
    def login_attempts(self):  # type: ignore[no-untyped-def]
        """Access the login_attempts collection for brute force protection."""
        return self.database["login_attempts"]


def get_db() -> MongoDBClient:
    """
    Get the singleton MongoDBClient instance.

    Returns:
        The MongoDBClient singleton for database operations.
    """
    return MongoDBClient()
