"""
NexaMind Backend — Memory Sub-Agent

Combines LongTermMemory (semantic profile + episodic facts) and NetworkX Knowledge Graph
traversal into unified personal context for user queries.
"""

import asyncio
import json
import logging
import re
from typing import Any

import google.generativeai as genai

from config import get_settings
from db.graph_store import get_user_graph_store
from memory.long_term import LongTermMemory
from models.chat import AgentType
from utils.model_router import select_model

logger = logging.getLogger("nexamind.agents.memory_agent")


class MemoryAgent:
    """
    Sub-agent responsible for synthesizing long-term user memories and graph connections.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self.long_term_memory = LongTermMemory()
        genai.configure(api_key=self.settings.gemini_api_key)

    async def _extract_query_entities(self, query: str) -> list[str]:
        """Extracts 1-4 entity names from query using Flash-Lite."""
        choice = select_model("entity_extraction")
        prompt = (
            f"Extract 1-4 key entity names (people, projects, tools, topics, concepts, places) "
            f"mentioned in this user query. Return ONLY a valid JSON array of strings.\n"
            f'Example: ["NexaMind", "FastAPI", "Taha"]\n'
            f"If no specific entities, return [].\n\n"
            f"Query: {query}"
        )
        try:
            model = genai.GenerativeModel(
                model_name=choice["model"],
                generation_config={"response_mime_type": "application/json"},
            )
            response = await asyncio.to_thread(model.generate_content, prompt)
            raw_text = (response.text or "[]").strip()
            raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE).strip()
            data = json.loads(raw_text)
            if isinstance(data, list):
                return [str(item).strip() for item in data if str(item).strip()]
            if isinstance(data, dict) and "entities" in data:
                return [str(e.get("name", e)).strip() for e in data["entities"] if str(e).strip()]
            return []
        except Exception as exc:
            logger.debug("Entity extraction from query failed in MemoryAgent: %s", exc)
            return []

    async def _get_graph_context(self, query: str, user_id: str) -> str:
        """Traverses user knowledge graph for entities matching the query."""
        try:
            entities = await self._extract_query_entities(query)
            if not entities:
                return ""

            graph_store = get_user_graph_store(user_id)
            matched_nodes: set[str] = set()

            for ent_name in entities:
                nid = graph_store.find_node(ent_name)
                if nid:
                    matched_nodes.add(nid)

            if not matched_nodes:
                return ""

            all_connections: list[str] = []
            for nid in matched_nodes:
                source_data = graph_store.graph.nodes.get(nid, {})
                source_name = source_data.get("name", nid)
                source_type = source_data.get("type", "Topic")
                neighbors = graph_store.get_neighbors(nid, hops=2)

                for neighbor in neighbors:
                    rel = neighbor.get("relationship", "RELATED_TO")
                    target_name = neighbor.get("name", "")
                    target_type = neighbor.get("type", "Topic")
                    if rel.startswith("INCOMING:"):
                        actual_rel = rel.replace("INCOMING:", "")
                        all_connections.append(
                            f"- {target_name} ({target_type}) → {actual_rel} → {source_name} ({source_type})"
                        )
                    else:
                        all_connections.append(
                            f"- {source_name} ({source_type}) → {rel} → {target_name} ({target_type})"
                        )

            if not all_connections:
                return ""

            unique_lines = list(dict.fromkeys(all_connections))
            return "Knowledge graph context:\n" + "\n".join(unique_lines[:15])

        except Exception as exc:
            logger.warning("Graph traversal error in MemoryAgent: %s", exc)
            return ""

    async def handle(
        self,
        query: str,
        user_id: str,
        chat_history: list[dict],
    ) -> "AgentResult":  # type: ignore[name-defined]
        """
        Retrieves long-term memories and knowledge graph connections.
        """
        from agents import AgentResult

        try:
            # 1. Fetch user memory profile & semantically relevant memories
            user_summary = await self.long_term_memory.get_user_context_summary(user_id)
            relevant_mems = await self.long_term_memory.retrieve_relevant(query, user_id, n_results=5)

            # 2. Fetch knowledge graph context
            graph_context = await self._get_graph_context(query, user_id)

            sections = []
            if user_summary:
                sections.append(user_summary)
            if relevant_mems:
                mem_lines = [f"- [{m.category}] {m.fact}" for m in relevant_mems]
                sections.append("Relevant memories:\n" + "\n".join(mem_lines))
            if graph_context:
                sections.append(graph_context)

            if not sections:
                return AgentResult(
                    context="",
                    sources=[],
                    used=False,
                    agentType=AgentType.MEMORY,
                    note="No long-term memories or graph entities found",
                )

            formatted_context = "USER MEMORY & GRAPH CONTEXT:\n" + "\n\n".join(sections)

            return AgentResult(
                context=formatted_context,
                sources=[],
                used=True,
                agentType=AgentType.MEMORY,
            )

        except Exception as exc:
            logger.error("MemoryAgent.handle failed for user %s: %s", user_id, exc)
            return AgentResult(
                context="",
                sources=[],
                used=False,
                agentType=AgentType.MEMORY,
                note=str(exc),
            )
