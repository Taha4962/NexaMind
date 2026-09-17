"""
NexaMind Backend — Knowledge Graph API Routes

Provides endpoints for fetching graph visualization data and statistics,
and clearing the user's knowledge graph.
"""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, status

from db.graph_store import clear_user_graph_store, get_user_graph_store
from middleware.auth import get_current_user
from models.user import TokenPayload

logger = logging.getLogger("nexamind.routes.graph")

router = APIRouter()


@router.get(
    "",
    summary="Get user knowledge graph",
    description="Returns graph visualization data (nodes, edges) and graph statistics for the authenticated user.",
)
async def get_graph(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict[str, Any]:
    """Returns visualization data and graph statistics."""
    graph_store = get_user_graph_store(current_user.user_id)
    vis_data = graph_store.to_visualization_data()
    stats = graph_store.get_stats()
    return {
        "graph": vis_data,
        "nodes": vis_data.get("nodes", []),
        "edges": vis_data.get("edges", []),
        "stats": stats,
    }


@router.delete(
    "",
    summary="Clear user knowledge graph",
    description="Deletes the persisted knowledge graph JSON file for the authenticated user.",
)
async def clear_graph(
    current_user: Annotated[TokenPayload, Depends(get_current_user)],
) -> dict[str, str]:
    """Deletes the user's graph file and resets in-memory graph state."""
    user_id = current_user.user_id
    clear_user_graph_store(user_id)
    logger.info("Cleared knowledge graph for user %s", user_id)
    return {"message": "Knowledge graph cleared"}
