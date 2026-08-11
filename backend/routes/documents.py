"""
NexaMind Backend — Documents API Routes

Handles document ingestion triggers, listing user documents,
and deleting documents from both MongoDB and ChromaDB.
"""

import logging
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from pydantic import BaseModel, Field

from middleware.auth import get_current_user
from models.user import TokenPayload
from db.mongo import get_db
from pipelines.ingestion import DocumentIngestionPipeline

try:
    import chromadb
    CHROMA_AVAILABLE = True
except ImportError:
    CHROMA_AVAILABLE = False

logger = logging.getLogger("nexamind.routes.documents")
router = APIRouter()

# ── Request Models ──

class IngestRequest(BaseModel):
    documentId: str = Field(..., description="The MongoDB ObjectId of the document")
    cloudinaryUrl: str = Field(..., description="The URL to download the document")
    fileType: str = Field(..., description="The type of the file (pdf, docx, txt)")


# ── Background Task Wrapper ──

async def run_ingestion(
    document_id: str, cloudinary_url: str, file_type: str, user_id: str
) -> None:
    pipeline = DocumentIngestionPipeline()
    try:
        await pipeline.ingest(document_id, cloudinary_url, file_type, user_id)
    except Exception as e:
        logger.error("Background ingestion failed: %s", str(e))


# ── Routes ──

@router.post(
    "/ingest",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger document ingestion",
    description="Starts background ingestion process for an uploaded document.",
)
async def ingest_document(
    request: IngestRequest,
    background_tasks: BackgroundTasks,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict[str, str]:
    """
    Trigger the ingestion pipeline for a document.
    Returns 202 Accepted immediately and runs pipeline in background.
    """
    background_tasks.add_task(
        run_ingestion,
        request.documentId,
        request.cloudinaryUrl,
        request.fileType,
        current_user.user_id,
    )
    return {"message": "Ingestion started", "documentId": request.documentId}


@router.get(
    "",
    summary="List user documents",
    description="Retrieves a list of all documents belonging to the authenticated user.",
)
async def list_documents(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> list[dict]:
    """
    Get all documents for the current user.
    """
    db = get_db()
    cursor = db.documents.find({"userId": current_user.user_id}).sort("createdAt", -1)
    documents = []
    async for doc in cursor:
        doc["_id"] = str(doc["_id"])
        documents.append(doc)
    return documents


@router.delete(
    "/{document_id}",
    summary="Delete a document",
    description="Deletes a document from MongoDB and its embeddings from ChromaDB.",
)
async def delete_document(
    document_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict[str, str]:
    """
    Delete document from vector db and mongodb.
    """
    try:
        if CHROMA_AVAILABLE:
            safe_user_id = re.sub(r'[^a-zA-Z0-9_]', '', current_user.user_id)
            collection_name = f"user_{safe_user_id}_docs"
            chroma_client = chromadb.PersistentClient(path="./chroma_db")
            try:
                collection = chroma_client.get_collection(name=collection_name)
                # Delete chunks for this document
                collection.delete(where={"documentId": document_id})
                logger.info("Deleted embeddings for doc %s", document_id)
            except ValueError:
                # Collection doesn't exist
                pass
    except Exception as e:
        logger.error("Error deleting from ChromaDB for doc %s: %s", document_id, str(e))
        # Proceed with MongoDB deletion anyway

    # Deleting from MongoDB is handled primarily by the Next.js frontend,
    # but the instructions say:
    # "Delete from ChromaDB: collection.delete(where={'documentId': document_id})"
    # "Delete from MongoDB"
    # The frontend already deletes from MongoDB after calling this endpoint, 
    # but we can optionally delete it here or let the frontend do it. 
    # For safety we can delete it if it exists.
    from bson import ObjectId
    db = get_db()
    await db.documents.delete_one(
        {"_id": ObjectId(document_id), "userId": ObjectId(current_user.user_id)}
    )

    return {"message": "Document and embeddings deleted"}
