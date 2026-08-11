"""
NexaMind Backend — Memory CRUD Routes

Handles listing, deleting, and clearing user memories stored in MongoDB and ChromaDB.
"""

import logging
from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from middleware.auth import get_current_user
from memory.long_term import LongTermMemory
from models.memory import Memory
from models.user import TokenPayload

logger = logging.getLogger("nexamind.routes.memory")

router = APIRouter()
long_term_memory = LongTermMemory()


@router.get(
    "",
    response_model=list[Memory],
    summary="List all memories",
    description="Retrieve all long-term memories for the authenticated user",
)
async def list_memories(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
    category: Optional[str] = Query(None, description="Filter memories by category"),
) -> list[Memory]:
    """List user memories from MongoDB."""
    return await long_term_memory.get_all_memories(
        user_id=current_user.user_id, category=category
    )


@router.delete(
    "/{memory_id}",
    summary="Delete a single memory",
    description="Delete a memory by ID from both MongoDB and ChromaDB",
)
async def delete_memory(
    memory_id: str,
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict[str, Any]:
    """Delete a memory entry by ID after verifying ownership."""
    success = await long_term_memory.delete_memory(
        memory_id=memory_id, user_id=current_user.user_id
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Memory not found or access denied",
        )
    return {"success": True, "message": "Memory deleted"}


@router.delete(
    "",
    summary="Clear all memories",
    description="Delete all memories for the authenticated user from MongoDB and ChromaDB",
)
async def clear_all_memories(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict[str, str]:
    """Clear all memories for the user."""
    user_id = current_user.user_id
    try:
        from db.mongo import MongoDB
        from db.vector_store import ChromaVectorStore
        import asyncio

        # 1. Delete from MongoDB
        await MongoDB.memories().delete_many({"userId": user_id})

        # 2. Reset/Clear collection in ChromaDB
        try:
            vs = await ChromaVectorStore.get_instance()
            collection = vs.get_memory_collection(user_id)
            await asyncio.to_thread(collection.delete, where={"userId": user_id})
        except Exception as chroma_exc:
            logger.warning("Error clearing ChromaDB memory vectors for user %s: %s", user_id, chroma_exc)

        return {"message": "All memories cleared"}
    except Exception as exc:
        logger.error("Failed to clear memories for user %s: %s", user_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to clear memories",
        )
