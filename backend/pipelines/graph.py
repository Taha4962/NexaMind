"""
NexaMind Backend — Knowledge Graph Extraction Pipeline

Extracts entities and relationships from conversation turns using Gemini Flash-Lite
and merges them into the user's per-user NetworkX knowledge graph.
Runs as a background task after every response alongside memory extraction.
"""

import asyncio
import json
import logging
import re
from typing import Any

import google.generativeai as genai

from config import get_settings
from db.graph_store import EdgeType, NodeType, get_user_graph_store

logger = logging.getLogger("nexamind.pipelines.graph")

FLASH_LITE_MODEL = "gemini-2.0-flash-lite"

VALID_ENTITY_TYPES = {
    "Person",
    "Topic",
    "Project",
    "Place",
    "Date",
    "Document",
    "Concept",
    "Event",
}

VALID_RELATIONSHIP_TYPES = {
    "WORKS_ON",
    "MENTIONED_IN",
    "RELATED_TO",
    "OCCURRED_ON",
    "KNOWS",
    "AUTHORED",
    "REFERS_TO",
    "HAPPENED_AT",
    "PART_OF",
}


class GraphPipeline:
    """
    Extracts entities and relationships from conversation turns
    and merges them into the user's knowledge graph.
    """

    EXTRACTION_PROMPT = """Extract entities and relationships from this conversation exchange.
Focus on: people, projects, topics, places, dates, concepts the user mentions.

Return ONLY valid JSON. No explanation. No markdown backticks. Example:
{{
  "entities": [
    {{"name": "NexaMind", "type": "Project"}},
    {{"name": "Taha", "type": "Person"}},
    {{"name": "FastAPI", "type": "Topic"}}
  ],
  "relationships": [
    {{"from": "Taha", "to": "NexaMind", "type": "WORKS_ON"}},
    {{"from": "NexaMind", "to": "FastAPI", "type": "REFERS_TO"}}
  ]
}}

Valid entity types: Person, Topic, Project, Place, Date, Document, Concept, Event
Valid relationship types: WORKS_ON, MENTIONED_IN, RELATED_TO, OCCURRED_ON,
                         KNOWS, AUTHORED, REFERS_TO, HAPPENED_AT, PART_OF

If nothing meaningful to extract, return: {{"entities": [], "relationships": []}}

Conversation:
User: {user_message}
Assistant: {assistant_message}"""

    def __init__(self) -> None:
        self.settings = get_settings()
        genai.configure(api_key=self.settings.gemini_api_key)

    async def process(
        self,
        user_message: str,
        assistant_message: str,
        user_id: str,
        chat_id: str,
    ) -> None:
        """
        Background task — runs after every response alongside memory extraction.
        Steps:
        1. Call Flash-Lite with EXTRACTION_PROMPT
        2. Parse JSON response safely — on any error return silently
        3. For each entity: graph_store.add_node(name, type)
        4. For each relationship: graph_store.add_edge(from, to, type)
        5. Add MENTIONED_IN edge from each entity to chat node
        6. Save graph
        Never raise — always catch and log exceptions.
        """
        try:
            prompt = self.EXTRACTION_PROMPT.format(
                user_message=user_message,
                assistant_message=assistant_message,
            )

            model = genai.GenerativeModel(
                model_name=FLASH_LITE_MODEL,
                generation_config={"response_mime_type": "application/json"},
            )

            response = await asyncio.to_thread(model.generate_content, prompt)
            raw_text = (response.text or "{}").strip()
            raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE).strip()

            try:
                data = json.loads(raw_text)
            except Exception as parse_exc:
                logger.warning("Failed to parse graph extraction JSON: %s. Raw: %s", parse_exc, raw_text[:200])
                return

            entities = data.get("entities", [])
            relationships = data.get("relationships", [])

            if not entities and not relationships:
                return

            graph_store = get_user_graph_store(user_id)

            # Map from entity name (case-insensitive) to node_id
            name_to_node_id: dict[str, str] = {}

            # 3. Add entities as nodes
            for ent in entities:
                ent_name = str(ent.get("name", "")).strip()
                ent_type = str(ent.get("type", "Topic")).strip()

                if not ent_name:
                    continue

                if ent_type not in VALID_ENTITY_TYPES:
                    ent_type = "Topic"

                node_id = await graph_store.add_node(
                    name=ent_name,
                    node_type=ent_type,  # type: ignore[arg-type]
                )
                name_to_node_id[ent_name.lower()] = node_id

            # 4. Add chat node and MENTIONED_IN edges
            if chat_id:
                chat_node_id = await graph_store.add_node(
                    name=f"Chat {chat_id[:8]}",
                    node_type="Document",
                    metadata={"chatId": chat_id},
                )
                for node_id in name_to_node_id.values():
                    await graph_store.add_edge(
                        from_node_id=node_id,
                        to_node_id=chat_node_id,
                        edge_type="MENTIONED_IN",
                    )

            # 5. Add relationships
            for rel in relationships:
                from_name = str(rel.get("from", "")).strip()
                to_name = str(rel.get("to", "")).strip()
                rel_type = str(rel.get("type", "RELATED_TO")).strip()

                if not from_name or not to_name:
                    continue

                if rel_type not in VALID_RELATIONSHIP_TYPES:
                    rel_type = "RELATED_TO"

                # Lookup or find existing node_id
                from_id = name_to_node_id.get(from_name.lower()) or graph_store.find_node(from_name)
                to_id = name_to_node_id.get(to_name.lower()) or graph_store.find_node(to_name)

                # Fallback: create as Topic if node doesn't exist
                if not from_id:
                    from_id = await graph_store.add_node(name=from_name, node_type="Topic")
                    name_to_node_id[from_name.lower()] = from_id
                if not to_id:
                    to_id = await graph_store.add_node(name=to_name, node_type="Topic")
                    name_to_node_id[to_name.lower()] = to_id

                if from_id and to_id and from_id != to_id:
                    await graph_store.add_edge(
                        from_node_id=from_id,
                        to_node_id=to_id,
                        edge_type=rel_type,  # type: ignore[arg-type]
                    )

            logger.info(
                "Graph pipeline processed for user %s: %d entities, %d relationships",
                user_id,
                len(entities),
                len(relationships),
            )

        except Exception as exc:
            logger.error("Error in graph extraction pipeline for user %s: %s", user_id, exc)
