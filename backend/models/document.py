"""
NexaMind Backend — Document Pydantic Models

Defines data models for uploaded documents, including metadata,
processing status, and chunk tracking.
"""

from datetime import datetime
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class DocumentStatus(str, Enum):
    """Document processing status."""

    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class DocumentType(str, Enum):
    """Supported document types."""

    PDF = "pdf"
    DOCX = "docx"
    TXT = "txt"
    MD = "md"


class DocumentBase(BaseModel):
    """Base document model."""

    filename: str = Field(..., description="Original filename")
    document_type: DocumentType = Field(..., description="Document file type")


class DocumentUpload(BaseModel):
    """Model for document upload metadata."""

    filename: str = Field(..., description="Original filename")
    content_type: str = Field(..., description="MIME content type")
    size_bytes: int = Field(..., gt=0, description="File size in bytes")


class DocumentInDB(DocumentBase):
    """Complete document record as stored in MongoDB."""

    id: str = Field(..., alias="_id", description="MongoDB document ID")
    user_id: str = Field(..., description="User who uploaded this document")
    cloudinary_url: str = Field(
        ...,
        description="Cloudinary URL for the stored file",
    )
    cloudinary_public_id: str = Field(
        ...,
        description="Cloudinary public ID for file management",
    )
    size_bytes: int = Field(..., description="File size in bytes")
    page_count: Optional[int] = Field(
        default=None,
        description="Number of pages (PDFs only)",
    )
    chunk_count: int = Field(
        default=0,
        description="Number of text chunks created from this document",
    )
    status: DocumentStatus = Field(
        default=DocumentStatus.PENDING,
        description="Current processing status",
    )
    error_message: Optional[str] = Field(
        default=None,
        description="Error message if processing failed",
    )
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(),
        description="Upload timestamp",
    )
    processed_at: Optional[datetime] = Field(
        default=None,
        description="Processing completion timestamp",
    )

    class Config:
        populate_by_name = True


class DocumentResponse(BaseModel):
    """Document data returned in API responses."""

    id: str = Field(..., description="Document ID")
    filename: str = Field(description="Original filename")
    document_type: DocumentType = Field(description="File type")
    size_bytes: int = Field(description="File size in bytes")
    page_count: Optional[int] = Field(default=None, description="Page count")
    chunk_count: int = Field(description="Number of chunks")
    status: DocumentStatus = Field(description="Processing status")
    error_message: Optional[str] = Field(default=None, description="Error message")
    created_at: datetime = Field(description="Upload timestamp")
    processed_at: Optional[datetime] = Field(
        default=None, description="Processing timestamp"
    )


class DocumentChunk(BaseModel):
    """Represents a single chunk of text extracted from a document."""

    chunk_id: str = Field(..., description="Unique chunk identifier")
    document_id: str = Field(..., description="Parent document ID")
    user_id: str = Field(..., description="Owner user ID")
    content: str = Field(..., description="Chunk text content")
    page_number: Optional[int] = Field(
        default=None,
        description="Source page number",
    )
    chunk_index: int = Field(..., description="Sequential chunk index")
    metadata: dict[str, str] = Field(
        default_factory=dict,
        description="Additional chunk metadata",
    )
