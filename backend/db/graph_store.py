"""
NexaMind Backend — NetworkX Knowledge Graph Manager

Provides a per-user directed knowledge graph using NetworkX DiGraph.
Persisted as JSON to disk per user: {CHROMA_PERSIST_DIR}/graphs/user_{userId[:16]}.json
Thread-safe writes via asyncio.Lock.
"""

import asyncio
from collections import deque
from datetime import datetime, timezone
import json
import logging
from pathlib import Path
from typing import Any, Literal, Optional

import networkx as nx

from config import get_settings

logger = logging.getLogger("nexamind.db.graph_store")

NodeType = Literal[
    "Person",
    "Topic",
    "Project",
    "Place",
    "Date",
    "Document",
    "Concept",
    "Event",
]

EdgeType = Literal[
    "WORKS_ON",
    "MENTIONED_IN",
    "RELATED_TO",
    "OCCURRED_ON",
    "KNOWS",
    "AUTHORED",
    "REFERS_TO",
    "HAPPENED_AT",
    "PART_OF",
]


class GraphStore:
    """
    Per-user knowledge graph using NetworkX DiGraph.
    Persisted as JSON to disk.
    One graph file per user: {CHROMA_PERSIST_DIR}/graphs/user_{userId[:16]}.json
    """

    NodeType = NodeType
    EdgeType = EdgeType

    def __init__(self, user_id: str) -> None:
        self.user_id = user_id
        settings = get_settings()
        persist_dir = getattr(settings, "chroma_persist_dir", "./chroma_data")
        self.graph_path = Path(persist_dir) / "graphs" / f"user_{user_id[:16]}.json"
        self.graph: nx.DiGraph = self._load_or_create()
        self._lock = asyncio.Lock()  # prevent concurrent writes

    def _load_or_create(self) -> nx.DiGraph:
        """
        If graph file exists: load with nx.node_link_graph(json.load(file)).
        Else: return empty nx.DiGraph().
        """
        if self.graph_path.exists():
            try:
                with open(self.graph_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                edges_key = "edges" if "edges" in data else "links"
                graph = nx.node_link_graph(data, directed=True, edges=edges_key)
                logger.info(
                    "Loaded graph for user %s (%d nodes, %d edges)",
                    self.user_id,
                    graph.number_of_nodes(),
                    graph.number_of_edges(),
                )
                return graph
            except Exception as exc:
                logger.warning(
                    "Failed to load graph from %s: %s. Creating new empty graph.",
                    self.graph_path,
                    exc,
                )
                return nx.DiGraph()
        return nx.DiGraph()

    async def save(self) -> None:
        """Persist graph to JSON file. Thread-safe with asyncio.Lock."""
        async with self._lock:
            try:
                self.graph_path.parent.mkdir(parents=True, exist_ok=True)
                data = nx.node_link_data(self.graph, edges="edges")
                with open(self.graph_path, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, default=str)
                logger.debug("Knowledge graph saved to %s", self.graph_path)
            except Exception as exc:
                logger.error("Failed to save knowledge graph for user %s: %s", self.user_id, exc)

    async def add_node(
        self,
        name: str,
        node_type: NodeType,
        metadata: Optional[dict[str, Any]] = None,
    ) -> str:
        """
        Add or update a node.
        node_id = f"{node_type.lower()}_{name.lower().replace(' ', '_')}"
        If node exists: update metadata, increment mention_count, update last_seen.
        If new: create with mention_count=1, first_seen=now, last_seen=now.
        Save graph after adding.
        Returns node_id.
        """
        meta = metadata or {}
        clean_name = name.strip()
        node_id = f"{node_type.lower()}_{clean_name.lower().replace(' ', '_')}"
        now = datetime.now(tz=timezone.utc).isoformat()

        if self.graph.has_node(node_id):
            node_data = self.graph.nodes[node_id]
            node_data["mention_count"] = node_data.get("mention_count", 1) + 1
            node_data["last_seen"] = now
            node_data["name"] = clean_name
            node_data["type"] = node_type
            if meta:
                node_data.update(meta)
        else:
            self.graph.add_node(
                node_id,
                name=clean_name,
                type=node_type,
                mention_count=1,
                first_seen=now,
                last_seen=now,
                **meta,
            )

        await self.save()
        return node_id

    async def add_edge(
        self,
        from_node_id: str,
        to_node_id: str,
        edge_type: EdgeType,
        metadata: Optional[dict[str, Any]] = None,
    ) -> None:
        """
        Add or update an edge between two existing nodes.
        If both nodes don't exist: skip (never create dangling edges).
        If edge exists: increment weight, update last_seen.
        If new: create with weight=1, first_seen=now.
        Save graph after adding.
        """
        if not self.graph.has_node(from_node_id) or not self.graph.has_node(to_node_id):
            logger.warning(
                "Skipping dangling edge: %s -> %s (nodes do not exist)",
                from_node_id,
                to_node_id,
            )
            return

        meta = metadata or {}
        now = datetime.now(tz=timezone.utc).isoformat()

        if self.graph.has_edge(from_node_id, to_node_id):
            edge_data = self.graph[from_node_id][to_node_id]
            edge_data["weight"] = edge_data.get("weight", 1) + 1
            edge_data["last_seen"] = now
            edge_data["relationship"] = edge_type
            if meta:
                edge_data.update(meta)
        else:
            self.graph.add_edge(
                from_node_id,
                to_node_id,
                relationship=edge_type,
                weight=1,
                first_seen=now,
                last_seen=now,
                **meta,
            )

        await self.save()

    def get_neighbors(
        self,
        node_id: str,
        hops: int = 2,
        edge_types: Optional[list[EdgeType]] = None,
    ) -> list[dict[str, Any]]:
        """
        BFS traversal up to N hops from a node.
        Optionally filter by edge types.
        Returns list of { nodeId, name, type, relationship, hops, weight }
        Limit to 20 results to keep context manageable.
        """
        if not self.graph.has_node(node_id):
            return []

        results: list[dict[str, Any]] = []
        visited = {node_id}
        queue: deque[tuple[str, int]] = deque([(node_id, 0)])

        while queue and len(results) < 20:
            current_id, current_hop = queue.popleft()
            if current_hop >= hops:
                continue

            # Check outgoing edges
            for successor in self.graph.successors(current_id):
                if len(results) >= 20:
                    break
                edge_data = self.graph[current_id][successor]
                rel = edge_data.get("relationship", "RELATED_TO")
                if edge_types and rel not in edge_types:
                    continue

                if successor not in visited:
                    visited.add(successor)
                    queue.append((successor, current_hop + 1))
                    succ_data = self.graph.nodes[successor]
                    results.append(
                        {
                            "nodeId": successor,
                            "name": succ_data.get("name", successor),
                            "type": succ_data.get("type", "Topic"),
                            "relationship": rel,
                            "hops": current_hop + 1,
                            "weight": edge_data.get("weight", 1),
                        }
                    )

            # Check incoming edges (bidirectional traversal for context)
            for predecessor in self.graph.predecessors(current_id):
                if len(results) >= 20:
                    break
                edge_data = self.graph[predecessor][current_id]
                rel = edge_data.get("relationship", "RELATED_TO")
                if edge_types and rel not in edge_types:
                    continue

                if predecessor not in visited:
                    visited.add(predecessor)
                    queue.append((predecessor, current_hop + 1))
                    pred_data = self.graph.nodes[predecessor]
                    results.append(
                        {
                            "nodeId": predecessor,
                            "name": pred_data.get("name", predecessor),
                            "type": pred_data.get("type", "Topic"),
                            "relationship": f"INCOMING:{rel}",
                            "hops": current_hop + 1,
                            "weight": edge_data.get("weight", 1),
                        }
                    )

        return results[:20]

    def find_node(self, name: str) -> Optional[str]:
        """
        Fuzzy find a node by name. Try exact match first.
        Then try case-insensitive contains match.
        Returns node_id or None.
        """
        clean_name = name.strip().lower()
        if not clean_name:
            return None

        # 1. Exact node_id or name match
        for n, data in self.graph.nodes(data=True):
            node_name = str(data.get("name", "")).strip().lower()
            if n.lower() == clean_name or node_name == clean_name:
                return n

        # 2. Case-insensitive substring match
        for n, data in self.graph.nodes(data=True):
            node_name = str(data.get("name", "")).strip().lower()
            if clean_name in node_name or clean_name in n.lower():
                return n

        return None

    def get_stats(self) -> dict[str, Any]:
        """Returns { nodeCount, edgeCount, topNodes (by mention_count, top 5) }"""
        nodes_sorted = sorted(
            self.graph.nodes(data=True),
            key=lambda x: x[1].get("mention_count", 1),
            reverse=True,
        )
        top_nodes = [
            {
                "id": n,
                "name": data.get("name", n),
                "type": data.get("type", "Topic"),
                "mentionCount": data.get("mention_count", 1),
            }
            for n, data in nodes_sorted[:5]
        ]
        return {
            "nodeCount": self.graph.number_of_nodes(),
            "edgeCount": self.graph.number_of_edges(),
            "topNodes": top_nodes,
        }

    def to_visualization_data(self) -> dict[str, Any]:
        """
        Returns graph as { nodes: [{id, label, type, size}], edges: [{source, target, label}] }
        Used by the frontend graph visualization component.
        Limit to 100 most-mentioned nodes for performance.
        """
        nodes_sorted = sorted(
            self.graph.nodes(data=True),
            key=lambda x: x[1].get("mention_count", 1),
            reverse=True,
        )[:100]

        valid_node_ids = {n for n, _ in nodes_sorted}

        nodes_list = [
            {
                "id": n,
                "label": data.get("name", n),
                "type": data.get("type", "Topic"),
                "size": data.get("mention_count", 1),
            }
            for n, data in nodes_sorted
        ]

        edges_list = []
        for u, v, data in self.graph.edges(data=True):
            if u in valid_node_ids and v in valid_node_ids:
                edges_list.append(
                    {
                        "source": u,
                        "target": v,
                        "label": data.get("relationship", "RELATED_TO"),
                        "weight": data.get("weight", 1),
                    }
                )

        return {"nodes": nodes_list, "edges": edges_list}


# ── Global Cache for User GraphStores ──────────────────────────────────────────
_user_graphs: dict[str, GraphStore] = {}


def get_user_graph_store(user_id: str) -> GraphStore:
    """Returns or creates a cached GraphStore for user_id."""
    if user_id not in _user_graphs:
        _user_graphs[user_id] = GraphStore(user_id)
    return _user_graphs[user_id]


def clear_user_graph_store(user_id: str) -> None:
    """Removes cached GraphStore for user_id and deletes the file."""
    store = _user_graphs.pop(user_id, None)
    if store is None:
        store = GraphStore(user_id)
    if store.graph_path.exists():
        try:
            store.graph_path.unlink()
            logger.info("Deleted graph file for user %s", user_id)
        except Exception as exc:
            logger.error("Error deleting graph file %s: %s", store.graph_path, exc)
