"""
NexaMind Backend — Chat & Message Pydantic Models

Defines data models for chat sessions and individual messages,
including agent type tracking and source attribution.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class AgentType(str, Enum):
    """Agent type that handled the message."""

    RAG = "rag"
    MEMORY = "memory"
    WEB = "web"
    DIRECT = "direct"


class MessageRole(str, Enum):
    """Message author role."""

    USER = "user"
    ASSISTANT = "assistant"


class Source(BaseModel):
    """Source attribution for RAG-generated responses."""

    doc_id: str = Field(..., description="Source document ID")
    filename: str = Field(..., description="Original filename")
    page_number: Optional[int] = Field(
        default=None,
        description="Page number in the source document",
    )
    chunk_text: str = Field(
        ...,
        description="Relevant text chunk from the source",
    )


class MessageBase(BaseModel):
    """Base message model."""

    role: MessageRole = Field(..., description="Message author role")
    content: str = Field(..., min_length=1, description="Message content")


class MessageCreate(MessageBase):
    """Model for creating a new message."""

    chat_id: str = Field(..., description="Parent chat session ID")


class MessageInDB(MessageBase):
    """Complete message document as stored in MongoDB."""

    id: str = Field(..., alias="_id", description="MongoDB document ID")
    chat_id: str = Field(..., description="Parent chat session ID")
    user_id: str = Field(..., description="User who owns this chat")
    sources: list[Source] = Field(
        default_factory=list,
        description="Source attributions for RAG responses",
    )
    agent_type: Optional[AgentType] = Field(
        default=None,
        description="Agent that handled this message (assistant only)",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Message creation timestamp",
    )

    class Config:
        populate_by_name = True


class MessageResponse(BaseModel):
    """Message data returned in API responses."""

    id: str = Field(..., description="Message ID")
    role: MessageRole = Field(description="Message author role")
    content: str = Field(description="Message content")
    sources: list[Source] = Field(default_factory=list, description="Source attributions")
    agent_type: Optional[AgentType] = Field(default=None, description="Handling agent")
    created_at: datetime = Field(description="Creation timestamp")


class ChatBase(BaseModel):
    """Base chat session model."""

    title: str = Field(
        default="New Chat",
        max_length=200,
        description="Chat session title",
    )


class ChatCreate(ChatBase):
    """Model for creating a new chat session."""

    pass


class ChatInDB(ChatBase):
    """Complete chat document as stored in MongoDB."""

    id: str = Field(..., alias="_id", description="MongoDB document ID")
    user_id: str = Field(..., description="User who owns this chat")
    message_count: int = Field(default=0, description="Number of messages in chat")
    last_message_at: Optional[datetime] = Field(
        default=None,
        description="Timestamp of last message",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Chat creation timestamp",
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Last update timestamp",
    )

    class Config:
        populate_by_name = True


class ChatResponse(BaseModel):
    """Chat session data returned in API responses."""

    id: str = Field(..., description="Chat ID")
    title: str = Field(description="Chat title")
    message_count: int = Field(description="Number of messages")
    last_message_at: Optional[datetime] = Field(description="Last message timestamp")
    created_at: datetime = Field(description="Creation timestamp")
    updated_at: datetime = Field(description="Last update timestamp")


class ChatWithMessages(ChatResponse):
    """Chat session with its full message history."""

    messages: list[MessageResponse] = Field(
        default_factory=list,
        description="Ordered list of messages in this chat",
    )


class AgentChatRequest(BaseModel):
    """Request model for the agent chat endpoint."""

    message: str = Field(
        ...,
        min_length=1,
        max_length=10000,
        description="User message to process",
    )
    chat_id: Optional[str] = Field(
        default=None,
        description="Existing chat ID to continue, or None for new chat",
    )
