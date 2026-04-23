"""
NexaMind Backend — NetworkX Knowledge Graph Manager Singleton

Provides a singleton in-memory knowledge graph using NetworkX.
The graph stores relationships between entities extracted from
documents and conversations, enabling reasoning across sessions.
"""

import json
import logging
import os
from typing import Optional

import networkx as nx

logger = logging.getLogger("nexamind.db.graph_store")

# ── Persistence File ──
GRAPH_PERSIST_FILE = "knowledge_graph.json"


class GraphStoreClient:
    """
    Singleton NetworkX graph manager.

    Manages an in-memory directed knowledge graph with optional
    persistence to JSON. Stores entities as nodes and relationships
    as edges with metadata.
    """

    _instance: Optional["GraphStoreClient"] = None
    _graph: Optional[nx.DiGraph] = None
    _persist_path: Optional[str] = None

    def __new__(cls) -> "GraphStoreClient":
        """Ensure only one GraphStoreClient instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def initialize(self, persist_dir: str = "./graph_data") -> None:
        """
        Initialize the knowledge graph.

        Loads existing graph from disk if available, or creates
        a new empty directed graph.

        Args:
            persist_dir: Directory for graph persistence files.
        """
        self._persist_path = os.path.join(persist_dir, GRAPH_PERSIST_FILE)

        if os.path.exists(self._persist_path):
            try:
                self._load_from_disk()
                logger.info(
                    "Knowledge graph loaded from %s (%d nodes, %d edges)",
                    self._persist_path,
                    self._graph.number_of_nodes() if self._graph else 0,
                    self._graph.number_of_edges() if self._graph else 0,
                )
            except Exception as e:
                logger.warning("Failed to load graph from disk: %s. Creating new.", str(e))
                self._graph = nx.DiGraph()
        else:
            self._graph = nx.DiGraph()
            os.makedirs(persist_dir, exist_ok=True)
            logger.info("New knowledge graph initialized at %s", persist_dir)

    @property
    def graph(self) -> nx.DiGraph:
        """
        Get the NetworkX directed graph instance.

        Returns:
            The directed graph for knowledge operations.

        Raises:
            RuntimeError: If the graph has not been initialized.
        """
        if self._graph is None:
            raise RuntimeError(
                "Knowledge graph is not initialized. Call initialize() first."
            )
        return self._graph

    def save_to_disk(self) -> None:
        """
        Persist the current graph state to JSON on disk.

        Raises:
            RuntimeError: If the graph or persist path is not initialized.
        """
        if self._graph is None or self._persist_path is None:
            raise RuntimeError("Graph is not initialized. Cannot save.")

        try:
            data = nx.node_link_data(self._graph)
            with open(self._persist_path, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, default=str)
            logger.info("Knowledge graph saved to %s", self._persist_path)
        except Exception as e:
            logger.error("Failed to save knowledge graph: %s", str(e))
            raise

    def _load_from_disk(self) -> None:
        """Load graph state from JSON file on disk."""
        if self._persist_path is None:
            raise RuntimeError("Persist path is not set.")

        with open(self._persist_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        self._graph = nx.node_link_graph(data, directed=True)


def get_graph_store() -> GraphStoreClient:
    """
    Get the singleton GraphStoreClient instance.

    Returns:
        The GraphStoreClient singleton for knowledge graph operations.
    """
    return GraphStoreClient()
