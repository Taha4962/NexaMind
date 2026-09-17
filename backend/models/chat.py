"""
NexaMind Backend — Chat & Message Pydantic Models

Defines data models for chat sessions and individual messages,
including agent type tracking and RAG source attribution.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from bson import ObjectId
from pydantic import BaseModel, Field


# ── Enums ─────────────────────────────────────────────────────────────────────

class MessageRole(str, Enum):
    """Message author role."""
    USER = "user"
    ASSISTANT = "assistant"


class AgentType(str, Enum):
    """Agent type that handled the message."""
    RAG = "rag"
    MEMORY = "memory"
    WEB = "web"
    DIRECT = "direct"


# ── Source Attribution ────────────────────────────────────────────────────────

class Source(BaseModel):
    """Source attribution for RAG-generated responses."""

    documentId: str = Field(..., description="Source document ID")
    filename: str = Field(..., description="Original filename")
    pageNumber: Optional[int] = Field(
        default=None,
        description="Page number in the source document",
    )
    chunkText: str = Field(
        ...,
        description="First 150 characters of the source chunk",
    )

    # Backward-compatible aliases used by legacy consumers
    @property
    def doc_id(self) -> str:
        return self.documentId

    @property
    def chunk_text(self) -> str:
        return self.chunkText


# ── Core Domain Models ────────────────────────────────────────────────────────

class Message(BaseModel):
    """Individual chat message stored in MongoDB."""

    id: str = Field(default_factory=lambda: str(ObjectId()), description="Message ID")
    chatId: str = Field(..., description="Parent chat session ID")
    role: MessageRole = Field(..., description="Message author role")
    content: str = Field(..., min_length=1, description="Message content")
    agentType: Optional[AgentType] = Field(
        default=None,
        description="Agent that handled this message (assistant only)",
    )
    sources: list[Source] = Field(
        default_factory=list,
        description="Source attributions for RAG responses",
    )
    tokensUsed: Optional[int] = Field(default=None, description="LLM tokens consumed")
    modelUsed: Optional[str] = Field(default=None, description="LLM model identifier")
    createdAt: datetime = Field(
        default_factory=datetime.utcnow,
        description="Message creation timestamp",
    )


class Chat(BaseModel):
    """Chat session stored in MongoDB."""

    id: str = Field(default_factory=lambda: str(ObjectId()), description="Chat ID")
    userId: str = Field(..., description="User who owns this chat")
    title: str = Field(default="New Chat", description="Chat session title")
    messageCount: int = Field(default=0, description="Number of messages")
    lastMessageAt: Optional[datetime] = Field(
        default=None,
        description="Timestamp of last message",
    )
    createdAt: datetime = Field(
        default_factory=datetime.utcnow,
        description="Chat creation timestamp",
    )


# ── Request / Response Models ─────────────────────────────────────────────────

class ChatRequest(BaseModel):
    """Request body for POST /api/v1/agent/chat."""

    message: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="User message to process",
    )
    chatId: Optional[str] = Field(
        default=None,
        description="Existing chat ID to continue (None = start new chat)",
    )
    attachedDocIds: list[str] = Field(
        default_factory=list,
        description="Specific document IDs to search (empty = all user docs)",
    )


class ChatResponse(BaseModel):
    """Response body for POST /api/v1/agent/chat."""

    chatId: str = Field(..., description="Chat session ID")
    messageId: str = Field(..., description="Assistant message ID")
    content: str = Field(..., description="Assistant response text")
    agentType: AgentType = Field(..., description="Agent that handled the request")
    sources: list[Source] = Field(
        default_factory=list,
        description="Source attributions (RAG only)",
    )
    modelUsed: str = Field(..., description="LLM model that generated the response")


# ── Legacy aliases — keep existing consumers working ──────────────────────────

class MessageBase(BaseModel):
    """Base message model (legacy)."""
    role: MessageRole = Field(..., description="Message author role")
    content: str = Field(..., min_length=1, description="Message content")


class MessageCreate(MessageBase):
    """Model for creating a new message (legacy)."""
    chat_id: str = Field(..., description="Parent chat session ID")


class MessageInDB(MessageBase):
    """Complete message document as stored in MongoDB (legacy, snake_case)."""
    id: str = Field(..., alias="_id", description="MongoDB document ID")
    chat_id: str = Field(..., description="Parent chat session ID")
    user_id: str = Field(..., description="User who owns this chat")
    sources: list[Source] = Field(default_factory=list)
    agent_type: Optional[AgentType] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


class MessageResponse(BaseModel):
    """Message data returned in API responses (legacy)."""
    id: str = Field(..., description="Message ID")
    role: MessageRole
    content: str
    sources: list[Source] = Field(default_factory=list)
    agent_type: Optional[AgentType] = Field(default=None)
    created_at: datetime


class ChatBase(BaseModel):
    """Base chat session model (legacy)."""
    title: str = Field(default="New Chat", max_length=200)


class ChatCreate(ChatBase):
    """Model for creating a new chat session (legacy)."""
    pass


class ChatInDB(ChatBase):
    """Complete chat document as stored in MongoDB (legacy, snake_case)."""
    id: str = Field(..., alias="_id", description="MongoDB document ID")
    user_id: str = Field(..., description="User who owns this chat")
    message_count: int = Field(default=0)
    last_message_at: Optional[datetime] = Field(default=None)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        populate_by_name = True


class ChatResponse_Legacy(BaseModel):
    """Chat session data returned in API responses (legacy)."""
    id: str
    title: str
    message_count: int
    last_message_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


class ChatWithMessages(ChatResponse_Legacy):
    """Chat session with its full message history (legacy)."""
    messages: list[MessageResponse] = Field(default_factory=list)


class AgentChatRequest(BaseModel):
    """Request model for the agent chat endpoint (legacy snake_case alias)."""
    message: str = Field(..., min_length=1, max_length=10000)
    chat_id: Optional[str] = Field(default=None)
    # Also expose the new field name
    attachedDocIds: list[str] = Field(default_factory=list)
