"""
NexaMind Backend — Memory Pydantic Models

Defines data models for the memory layer, including retrieved chunks
and memories from the vector store, plus the long-term memory schema.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────────

class MemoryCategory(str, Enum):
    """Semantic category of a stored memory."""

    PREFERENCE = "preference"       # user likes / dislikes
    PERSONAL = "personal"           # name, location, job, etc.
    PROJECT = "project"             # things user is working on
    EVENT = "event"                 # dates, deadlines, plans
    KNOWLEDGE = "knowledge"         # facts user mentioned knowing
    RELATIONSHIP = "relationship"   # people user mentioned


# ── Long-term Memory Document ──────────────────────────────────────────────────

class Memory(BaseModel):
    """
    Persistent memory fact stored in MongoDB and indexed in ChromaDB.
    """

    id: str = Field(
        default_factory=lambda: str(ObjectId()),
        description="MongoDB document ID",
    )
    userId: str = Field(..., description="User who owns this memory")
    fact: str = Field(..., description="The extracted memory text")
    category: MemoryCategory = Field(..., description="Semantic category")
    confidence: float = Field(
        default=1.0,
        ge=0.0,
        le=1.0,
        description="Extraction confidence (0–1)",
    )
    sourceMessageId: Optional[str] = Field(
        default=None,
        description="Message ID from which this memory was extracted",
    )
    sourceChatId: Optional[str] = Field(
        default=None,
        description="Chat session that generated this memory",
    )
    lastAccessed: datetime = Field(
        default_factory=datetime.utcnow,
        description="Last time this memory was used in a response",
    )
    accessCount: int = Field(default=0, description="How many times retrieved")
    createdAt: datetime = Field(
        default_factory=datetime.utcnow,
        description="Memory creation timestamp",
    )


# ── Vector-Store Return Models ─────────────────────────────────────────────────

class RetrievedChunk(BaseModel):
    """
    A document chunk returned by a ChromaDB similarity search.
    """

    text: str = Field(..., description="Chunk text content")
    documentId: str = Field(..., description="Parent document ID")
    chunkIndex: int = Field(..., description="Sequential chunk index")
    score: float = Field(..., description="Cosine similarity score (0–1)")
    metadata: dict = Field(default_factory=dict, description="Raw ChromaDB metadata")


class RetrievedMemory(BaseModel):
    """
    A memory entry returned by a ChromaDB similarity search.
    """

    memoryId: str = Field(..., description="ChromaDB / MongoDB memory ID")
    fact: str = Field(..., description="Memory text")
    category: str = Field(..., description="Memory category")
    score: float = Field(..., description="Cosine similarity score (0–1)")


# ── Legacy Models (kept for backward compatibility) ────────────────────────────

class MemoryType(str, Enum):
    """Legacy memory classification type."""
    FACT = "fact"
    PREFERENCE = "preference"
    EXPERIENCE = "experience"
    INSTRUCTION = "instruction"


class MemoryImportance(str, Enum):
    """Legacy memory importance level."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MemoryBase(BaseModel):
    """Base memory model (legacy)."""
    content: str = Field(..., min_length=1, max_length=5000)
    memory_type: MemoryType = Field(default=MemoryType.FACT)
    importance: MemoryImportance = Field(default=MemoryImportance.MEDIUM)


class MemoryCreate(MemoryBase):
    """Model for creating a new memory (legacy)."""
    source_chat_id: Optional[str] = Field(default=None)
    tags: list[str] = Field(default_factory=list)


class MemoryInDB(MemoryBase):
    """Complete memory document as stored in MongoDB (legacy)."""
    id: str = Field(..., alias="_id")
    user_id: str = Field(...)
    source_chat_id: Optional[str] = Field(default=None)
    tags: list[str] = Field(default_factory=list)
    access_count: int = Field(default=0)
    last_accessed_at: Optional[datetime] = Field(default=None)
    embedding_id: Optional[str] = Field(default=None)
    is_active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


class MemoryResponse(BaseModel):
    """Memory data returned in API responses (legacy)."""
    id: str
    content: str
    memory_type: MemoryType
    importance: MemoryImportance
    tags: list[str] = Field(default_factory=list)
    access_count: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class MemoryUpdate(BaseModel):
    """Model for updating an existing memory (legacy)."""
    content: Optional[str] = Field(default=None, min_length=1, max_length=5000)
    memory_type: Optional[MemoryType] = Field(default=None)
    importance: Optional[MemoryImportance] = Field(default=None)
    tags: Optional[list[str]] = Field(default=None)
    is_active: Optional[bool] = Field(default=None)
