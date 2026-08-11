"""
NexaMind Backend — Embedding Generation Utility

Generates text embeddings using Google's text-embedding-004 model.
Handles batching, rate limiting, and error recovery for large
document processing workloads.
"""

import logging
import asyncio
import google.generativeai as genai
from config import get_settings

logger = logging.getLogger("nexamind.utils.embedder")

# ── Model Configuration ──
EMBEDDING_MODEL = "models/text-embedding-004"
MAX_BATCH_SIZE = 100

class GeminiEmbedder:
    def __init__(self) -> None:
        settings = get_settings()
        genai.configure(api_key=settings.gemini_api_key)
        self.model = EMBEDDING_MODEL

    async def embed_text(self, text: str) -> list[float]:
        """
        Generate a single text embedding.
        """
        result = await asyncio.to_thread(
            genai.embed_content,
            model=self.model,
            content=text,
            task_type="retrieval_document"
        )
        return result["embedding"]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for a batch of texts.
        Processed in batches of up to MAX_BATCH_SIZE.
        """
        embeddings = []
        # Process in batches of 100 max
        for i in range(0, len(texts), MAX_BATCH_SIZE):
            batch = texts[i:i+MAX_BATCH_SIZE]
            result = await asyncio.to_thread(
                genai.embed_content,
                model=self.model,
                content=batch,
                task_type="retrieval_document"
            )
            
            # The result could be a list of embeddings if content was a list
            batch_embeddings = result.get("embedding", [])
            if batch_embeddings and isinstance(batch_embeddings[0], float):
                # Only one element in batch
                embeddings.append(batch_embeddings)
            else:
                embeddings.extend(batch_embeddings)
            
            # Add a slight delay between batches to respect rate limits
            if i + MAX_BATCH_SIZE < len(texts):
                await asyncio.sleep(1)

        return embeddings

    async def embed_query(self, query: str) -> list[float]:
        """
        Embed a query string.
        """
        result = await asyncio.to_thread(
            genai.embed_content,
            model=self.model,
            content=query,
            task_type="retrieval_query"
        )
        return result["embedding"]
