"""
NexaMind Backend — Memory Pydantic Models

Defines data models for the memory layer, including both
short-term (session) and long-term (persistent) memories.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MemoryType(str, Enum):
    """Memory classification type."""

    FACT = "fact"
    PREFERENCE = "preference"
    EXPERIENCE = "experience"
    INSTRUCTION = "instruction"


class MemoryImportance(str, Enum):
    """Memory importance level."""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class MemoryBase(BaseModel):
    """Base memory model."""

    content: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        description="Memory content text",
    )
    memory_type: MemoryType = Field(
        default=MemoryType.FACT,
        description="Classification of the memory",
    )
    importance: MemoryImportance = Field(
        default=MemoryImportance.MEDIUM,
        description="Importance level of this memory",
    )


class MemoryCreate(MemoryBase):
    """Model for creating a new memory."""

    source_chat_id: Optional[str] = Field(
        default=None,
        description="Chat session that generated this memory",
    )
    tags: list[str] = Field(
        default_factory=list,
        description="Tags for categorizing the memory",
    )


class MemoryInDB(MemoryBase):
    """Complete memory document as stored in MongoDB."""

    id: str = Field(..., alias="_id", description="MongoDB document ID")
    user_id: str = Field(..., description="User who owns this memory")
    source_chat_id: Optional[str] = Field(
        default=None,
        description="Chat that generated this memory",
    )
    tags: list[str] = Field(default_factory=list, description="Memory tags")
    access_count: int = Field(
        default=0,
        description="Number of times this memory was retrieved",
    )
    last_accessed_at: Optional[datetime] = Field(
        default=None,
        description="Last time this memory was used in a response",
    )
    embedding_id: Optional[str] = Field(
        default=None,
        description="ChromaDB embedding ID for semantic search",
    )
    is_active: bool = Field(default=True, description="Whether memory is active")
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Memory creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Last update timestamp",
    )

    class Config:
        populate_by_name = True


class MemoryResponse(BaseModel):
    """Memory data returned in API responses."""

    id: str = Field(..., description="Memory ID")
    content: str = Field(description="Memory content")
    memory_type: MemoryType = Field(description="Memory type")
    importance: MemoryImportance = Field(description="Importance level")
    tags: list[str] = Field(default_factory=list, description="Memory tags")
    access_count: int = Field(description="Times accessed")
    is_active: bool = Field(description="Active status")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class MemoryUpdate(BaseModel):
    """Model for updating an existing memory."""

    content: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=5000,
        description="Updated content",
    )
    memory_type: Optional[MemoryType] = Field(
        default=None,
        description="Updated memory type",
    )
    importance: Optional[MemoryImportance] = Field(
        default=None,
        description="Updated importance level",
    )
    tags: Optional[list[str]] = Field(
        default=None,
        description="Updated tags",
    )
    is_active: Optional[bool] = Field(
        default=None,
        description="Updated active status",
    )
