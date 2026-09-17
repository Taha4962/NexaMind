"""
NexaMind Backend — RAG Sub-Agent

Wraps the RAGRetrievalPipeline to perform semantic search over user document chunks.
Returns an AgentResult with formatted document context and source attributions.
"""

import logging
from typing import Optional

from models.chat import AgentType, Source
from pipelines.retrieval import RAGRetrievalPipeline

logger = logging.getLogger("nexamind.agents.rag_agent")


class RAGAgent:
    """
    Sub-agent responsible for document-augmented retrieval and context assembly.
    """

    def __init__(self) -> None:
        self.pipeline = RAGRetrievalPipeline()

    async def handle(
        self,
        query: str,
        user_id: str,
        chat_history: list[dict],
        attached_doc_ids: Optional[list[str]] = None,
    ) -> "AgentResult":  # type: ignore[name-defined]
        """
        Retrieves relevant document chunks and formats them for prompt injection.
        """
        from agents import AgentResult

        try:
            chunks = await self.pipeline.retrieve_with_context(
                query=query,
                user_id=user_id,
                chat_history=chat_history,
                n_chunks=5,
                filter_doc_ids=attached_doc_ids or None,
            )

            if not chunks:
                return AgentResult(
                    context="",
                    sources=[],
                    used=False,
                    agentType=AgentType.RAG,
                    note="No relevant document chunks found above score threshold",
                )

            # Format chunks into readable document context
            context_blocks = []
            sources: list[Source] = []

            for i, chunk in enumerate(chunks, 1):
                page_info = f" (Page {chunk.pageNumber})" if chunk.pageNumber else ""
                context_blocks.append(
                    f"[Document {i}: {chunk.filename}{page_info}]\n{chunk.chunkText}"
                )
                sources.append(
                    Source(
                        documentId=chunk.documentId,
                        filename=chunk.filename,
                        pageNumber=chunk.pageNumber,
                        chunkText=chunk.chunkText[:150],
                    )
                )

            formatted_context = "DOCUMENT CONTEXT:\n" + "\n\n".join(context_blocks)

            return AgentResult(
                context=formatted_context,
                sources=sources,
                used=True,
                agentType=AgentType.RAG,
            )

        except Exception as exc:
            logger.error("RAGAgent.handle failed for user %s: %s", user_id, exc)
            return AgentResult(
                context="",
                sources=[],
                used=False,
                agentType=AgentType.RAG,
                note=str(exc),
            )
