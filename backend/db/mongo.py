"""
NexaMind Backend — MongoDB Async Client Singleton

Provides a class-method-based singleton MongoDB client using the Motor async driver.
All database operations must use this singleton to benefit from connection pooling.
"""

import logging
from typing import Optional

from motor.motor_asyncio import (
    AsyncIOMotorClient,
    AsyncIOMotorCollection,
    AsyncIOMotorDatabase,
)
from pymongo import ASCENDING, DESCENDING, IndexModel

from config import get_settings

logger = logging.getLogger("nexamind.db.mongo")

# ── Database Name ─────────────────────────────────────────────────────────────
DATABASE_NAME = "nexamind"


class MongoDB:
    """
    Async MongoDB client singleton using Motor.

    All public APIs are class-methods so callers never need to hold an instance
    reference — they simply call ``MongoDB.users()``, ``MongoDB.chats()``, etc.
    """

    _instance: Optional["MongoDB"] = None
    _client: Optional[AsyncIOMotorClient] = None  # type: ignore[type-arg]
    _db: Optional[AsyncIOMotorDatabase] = None  # type: ignore[type-arg]

    # ── Lifecycle ─────────────────────────────────────────────────────────────

    @classmethod
    async def connect(cls) -> None:
        """
        Initialize the Motor client and verify the connection with a ping.

        Reads ``MONGO_URL`` from the application config.

        Raises:
            ConnectionError: If MongoDB cannot be reached within 5 seconds.
        """
        settings = get_settings()
        try:
            cls._client = AsyncIOMotorClient(
                settings.mongo_url,
                serverSelectionTimeoutMS=5000,
                maxPoolSize=50,
                minPoolSize=5,
            )
            # Ping to verify connectivity before accepting traffic
            await cls._client.admin.command("ping")
            cls._db = cls._client[DATABASE_NAME]
            logger.info("MongoDB connected successfully (database: %s)", DATABASE_NAME)
        except Exception as exc:
            logger.error("MongoDB connection failed: %s", exc)
            raise ConnectionError(f"Failed to connect to MongoDB: {exc}") from exc

    @classmethod
    async def disconnect(cls) -> None:
        """Close the Motor client connection gracefully."""
        if cls._client is not None:
            cls._client.close()
            cls._client = None
            cls._db = None
            logger.info("MongoDB connection closed")

    @classmethod
    def get_db(cls) -> AsyncIOMotorDatabase:  # type: ignore[type-arg]
        """
        Return the database instance.

        Raises:
            RuntimeError: If :meth:`connect` has not been called.
        """
        if cls._db is None:
            raise RuntimeError(
                "MongoDB is not connected. Call MongoDB.connect() during app startup."
            )
        return cls._db

    # ── Collection Accessors ──────────────────────────────────────────────────

    @classmethod
    def users(cls) -> AsyncIOMotorCollection:  # type: ignore[type-arg]
        """Access the ``users`` collection."""
        return cls.get_db()["users"]

    @classmethod
    def chats(cls) -> AsyncIOMotorCollection:  # type: ignore[type-arg]
        """Access the ``chats`` collection."""
        return cls.get_db()["chats"]

    @classmethod
    def messages(cls) -> AsyncIOMotorCollection:  # type: ignore[type-arg]
        """Access the ``messages`` collection."""
        return cls.get_db()["messages"]

    @classmethod
    def memories(cls) -> AsyncIOMotorCollection:  # type: ignore[type-arg]
        """Access the ``memories`` collection."""
        return cls.get_db()["memories"]

    @classmethod
    def documents(cls) -> AsyncIOMotorCollection:  # type: ignore[type-arg]
        """Access the ``documents`` collection."""
        return cls.get_db()["documents"]

    @classmethod
    def revoked_tokens(cls) -> AsyncIOMotorCollection:  # type: ignore[type-arg]
        """Access the ``revoked_tokens`` collection (JWT blacklist)."""
        return cls.get_db()["revoked_tokens"]

    @classmethod
    def login_attempts(cls) -> AsyncIOMotorCollection:  # type: ignore[type-arg]
        """Access the ``login_attempts`` collection (brute-force protection)."""
        return cls.get_db()["login_attempts"]

    @classmethod
    def otp_verifications(cls) -> AsyncIOMotorCollection:  # type: ignore[type-arg]
        """Access the ``otp_verifications`` collection."""
        return cls.get_db()["otp_verifications"]

    # ── Index Management ──────────────────────────────────────────────────────

    @classmethod
    async def create_indexes(cls) -> None:
        """
        Create all required MongoDB indexes on startup.

        Idempotent — safe to call on every application start.
        Indexes are created in the background where possible.
        """
        db = cls.get_db()

        # ── users ─────────────────────────────────────────────────────────────
        await db["users"].create_indexes([
            IndexModel([("email", ASCENDING)], unique=True, name="users_email_unique"),
            IndexModel([("googleId", ASCENDING)], sparse=True, name="users_google_id_sparse"),
        ])

        # ── chats ─────────────────────────────────────────────────────────────
        await db["chats"].create_indexes([
            IndexModel([("userId", ASCENDING)], name="chats_user_id"),
            IndexModel([("userId", ASCENDING), ("lastMessageAt", DESCENDING)], name="chats_user_last_msg"),
        ])

        # ── messages ─────────────────────────────────────────────────────────
        await db["messages"].create_indexes([
            IndexModel([("chatId", ASCENDING)], name="messages_chat_id"),
            IndexModel([("chatId", ASCENDING), ("createdAt", ASCENDING)], name="messages_chat_created"),
        ])

        # ── memories ──────────────────────────────────────────────────────────
        await db["memories"].create_indexes([
            IndexModel([("userId", ASCENDING)], name="memories_user_id"),
            IndexModel([("userId", ASCENDING), ("category", ASCENDING)], name="memories_user_category"),
        ])

        # ── documents ─────────────────────────────────────────────────────────
        await db["documents"].create_indexes([
            IndexModel([("userId", ASCENDING)], name="documents_user_id"),
            IndexModel([("userId", ASCENDING), ("status", ASCENDING)], name="documents_user_status"),
        ])

        # ── revoked_tokens — TTL index ─────────────────────────────────────
        await db["revoked_tokens"].create_indexes([
            IndexModel(
                [("expiresAt", ASCENDING)],
                expireAfterSeconds=0,
                name="revoked_tokens_ttl",
            ),
            IndexModel([("jti", ASCENDING)], unique=True, name="revoked_tokens_jti"),
        ])

        # ── login_attempts ────────────────────────────────────────────────────
        await db["login_attempts"].create_indexes([
            IndexModel([("email", ASCENDING), ("ip", ASCENDING)], name="login_attempts_email_ip"),
        ])

        # ── otp_verifications ─────────────────────────────────────────────────
        await db["otp_verifications"].create_indexes([
            IndexModel([("userId", ASCENDING)], name="otp_user_id"),
            IndexModel(
                [("expiresAt", ASCENDING)],
                expireAfterSeconds=0,
                name="otp_ttl",
            ),
        ])

        logger.info("MongoDB indexes created/verified successfully")


# ── Backward-compatible shim ─────────────────────────────────────────────────
# Legacy code in middleware/auth.py calls get_db() which returned MongoDBClient.
# We expose the same name pointing at our new class-based singleton.

class MongoDBClient:
    """
    Backward-compatible shim for the legacy instance-based API.

    .. deprecated::
        Use :class:`MongoDB` directly. This shim exists only to keep
        ``middleware/auth.py`` and similar call-sites working without
        a mass rename.
    """

    _instance: Optional["MongoDBClient"] = None

    def __new__(cls) -> "MongoDBClient":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    async def connect(self, mongo_url: str) -> None:  # noqa: ARG002
        """Delegate to MongoDB.connect() (ignores mongo_url — reads from config)."""
        await MongoDB.connect()

    async def disconnect(self) -> None:
        """Delegate to MongoDB.disconnect()."""
        await MongoDB.disconnect()

    @property
    def database(self) -> AsyncIOMotorDatabase:  # type: ignore[type-arg]
        return MongoDB.get_db()

    @property
    def client(self) -> AsyncIOMotorClient:  # type: ignore[type-arg]
        if MongoDB._client is None:
            raise RuntimeError("MongoDB client is not initialized.")
        return MongoDB._client  # type: ignore[return-value]

    # Collection properties (shim)
    @property
    def users(self):  # type: ignore[no-untyped-def]
        return MongoDB.users()

    @property
    def chats(self):  # type: ignore[no-untyped-def]
        return MongoDB.chats()

    @property
    def messages(self):  # type: ignore[no-untyped-def]
        return MongoDB.messages()

    @property
    def memories(self):  # type: ignore[no-untyped-def]
        return MongoDB.memories()

    @property
    def documents(self):  # type: ignore[no-untyped-def]
        return MongoDB.documents()

    @property
    def revoked_tokens(self):  # type: ignore[no-untyped-def]
        return MongoDB.revoked_tokens()

    @property
    def login_attempts(self):  # type: ignore[no-untyped-def]
        return MongoDB.login_attempts()


def get_db() -> MongoDBClient:
    """
    Return the singleton MongoDBClient shim.

    Legacy entry-point kept so existing imports continue to work.
    """
    return MongoDBClient()
