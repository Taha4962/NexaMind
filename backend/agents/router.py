"""
NexaMind Backend — Router Agent (Central Orchestrator)

Implements the ReAct loop: Think -> Act -> Observe -> Answer
1. THINK: Classifies query intent via Flash-Lite into "rag", "memory", "web", or "direct".
2. ACT: Dispatches to the appropriate sub-agent (RAGAgent, MemoryAgent, WebAgent).
3. OBSERVE: Evaluates sub-agent output and handles graceful fallback to direct chat.
4. ANSWER: Synthesizes final prompt and streams response using the routed model.
"""

import asyncio
import json
import logging
import re
from typing import Any, AsyncGenerator, Literal, Optional

import google.generativeai as genai
from pydantic import BaseModel, Field

from config import get_settings
from models.chat import AgentType, ChatRequest, Source
from utils.model_router import select_model
from utils.streaming import StreamChunk, StreamingManager

logger = logging.getLogger("nexamind.agents.router")


class RouterDecision(BaseModel):
    """Structured decision output from the Think phase."""

    intent: Literal["rag", "memory", "web", "direct"] = Field(
        ..., description="Classified intent destination"
    )
    confidence: float = Field(..., description="Classification confidence score between 0 and 1")
    reasoning: str = Field(default="", description="Short reasoning behind the routing decision")


class RouterAgent:
    """
    Central orchestrating agent managing the ReAct loop and sub-agent dispatch.
    """

    INTENT_PROMPT = """Classify the intent of this user query into exactly ONE of:
- "rag": user is asking about their uploaded files, documents, PDFs, codebase, notes, or explicit document questions.
- "memory": user is asking about past conversations, facts about themselves, preferences, identity, past projects, or personal history.
- "web": user needs current real-time external information, breaking news, live data, weather, or web lookup.
- "direct": general chat, greeting, code writing, reasoning, math, or questions requiring no external document search.

Context:
Has uploaded documents: {has_documents}
Query: {query}

Return ONLY valid JSON matching this schema:
{{
  "intent": "rag" | "memory" | "web" | "direct",
  "confidence": 0.95,
  "reasoning": "brief explanation"
}}"""

    def __init__(self) -> None:
        self.settings = get_settings()
        genai.configure(api_key=self.settings.gemini_api_key)
        self.streaming_manager = StreamingManager()

    async def classify(self, query: str, has_documents: bool = True) -> RouterDecision:
        """
        THINK phase: uses Flash-Lite to classify query intent.
        Falls back to direct chat on error.
        """
        choice = select_model("intent")
        prompt = self.INTENT_PROMPT.format(
            has_documents=has_documents,
            query=query,
        )

        try:
            model = genai.GenerativeModel(
                model_name=choice["model"],
                generation_config={"response_mime_type": "application/json"},
            )
            response = await asyncio.to_thread(model.generate_content, prompt)
            raw_text = (response.text or "{}").strip()
            raw_text = re.sub(r"^```json\s*", "", raw_text, flags=re.MULTILINE)
            raw_text = re.sub(r"\s*```$", "", raw_text, flags=re.MULTILINE).strip()

            data = json.loads(raw_text)
            intent = data.get("intent", "direct").lower()
            if intent not in ("rag", "memory", "web", "direct"):
                intent = "direct"

            return RouterDecision(
                intent=intent,  # type: ignore[arg-type]
                confidence=float(data.get("confidence", 0.9)),
                reasoning=data.get("reasoning", "Classified by RouterAgent"),
            )
        except Exception as exc:
            logger.warning("Intent classification failed: %s. Defaulting to direct chat.", exc)
            return RouterDecision(
                intent="direct",
                confidence=1.0,
                reasoning="Fallback due to classification error",
            )

    async def _execute_subagent(
        self,
        intent: str,
        query: str,
        user_id: str,
        chat_history: list[dict],
        attached_doc_ids: Optional[list[str]] = None,
    ) -> Any:
        """
        ACT phase: dispatches to the requested sub-agent.
        """
        from agents import AgentResult, MemoryAgent, RAGAgent, WebAgent

        if intent == "rag":
            rag_agent = RAGAgent()
            return await rag_agent.handle(
                query=query,
                user_id=user_id,
                chat_history=chat_history,
                attached_doc_ids=attached_doc_ids,
            )

        if intent == "memory":
            memory_agent = MemoryAgent()
            return await memory_agent.handle(
                query=query,
                user_id=user_id,
                chat_history=chat_history,
            )

        if intent == "web":
            web_agent = WebAgent()
            return await web_agent.handle(
                query=query,
                user_id=user_id,
                chat_history=chat_history,
            )

        return AgentResult(
            context="",
            sources=[],
            used=False,
            agentType=AgentType.DIRECT,
        )

    async def route(
        self,
        chat_request: ChatRequest,
        user_id: str,
        chat_history: list[dict],
    ) -> AsyncGenerator[StreamChunk, None]:
        """
        Full ReAct loop yielding StreamChunk objects for SSE streaming.
        1. THINK: classify query intent.
        2. ACT: dispatch to sub-agent.
        3. OBSERVE: examine result and determine model/agent type.
        4. ANSWER: stream tokens.
        """
        from agents import MemoryAgent

        query = chat_request.message
        has_docs = bool(chat_request.attachedDocIds)

        # 1. THINK
        decision = await self.classify(query=query, has_documents=has_docs)
        logger.info(
            "Router THINK: query='%s' -> intent=%s (conf=%.2f, reason=%s)",
            query[:40],
            decision.intent,
            decision.confidence,
            decision.reasoning,
        )

        # 2. ACT
        result = await self._execute_subagent(
            intent=decision.intent,
            query=query,
            user_id=user_id,
            chat_history=chat_history,
            attached_doc_ids=chat_request.attachedDocIds,
        )

        # 3. OBSERVE
        # Always fetch background personal memory & graph context to ensure continuity
        memory_agent = MemoryAgent()
        memory_result = await memory_agent.handle(query, user_id, chat_history)
        memory_context = memory_result.context if memory_result.used else ""

        if result.agentType == AgentType.RAG and result.used:
            agent_type = AgentType.RAG
            model_info = select_model("rag_generation")
            sources = result.sources
            context_to_inject = result.context
        elif result.agentType == AgentType.MEMORY and result.used:
            agent_type = AgentType.MEMORY
            model_info = select_model("memory_synthesis")
            sources = []
            context_to_inject = result.context
        elif result.agentType == AgentType.WEB and result.used:
            agent_type = AgentType.WEB
            model_info = select_model("web_summary")
            sources = result.sources
            context_to_inject = result.context
        else:
            # Fallback to direct chat
            agent_type = AgentType.DIRECT
            model_info = select_model("direct_chat")
            sources = []
            context_to_inject = memory_context

        logger.info(
            "Router OBSERVE: selected agentType=%s, model=%s, sources=%d",
            agent_type.value,
            model_info["model"],
            len(sources),
        )

        # 4. ANSWER (Streaming)
        if model_info["provider"] == "gemini" or not self.streaming_manager.groq_client:
            # Build Gemini prompt
            system_instruction = (
                "You are NexaMind, an intelligent and helpful personal AI assistant. "
                "Be concise, accurate, and friendly. Respond in clear markdown."
            )
            prompt_parts = []
            if memory_context and agent_type != AgentType.MEMORY:
                prompt_parts.append(memory_context)
            if context_to_inject and agent_type != AgentType.DIRECT:
                prompt_parts.append(context_to_inject)

            # Add recent conversation history
            if chat_history:
                hist_lines = [
                    f"{'User' if m.get('role') == 'user' else 'Assistant'}: {m.get('content', '')}"
                    for m in chat_history[-6:]
                ]
                prompt_parts.append("CONVERSATION HISTORY:\n" + "\n".join(hist_lines))

            prompt_parts.append(f"USER QUERY: {query}")
            final_prompt = "\n\n".join(prompt_parts)

            async for chunk in self.streaming_manager.stream_gemini(
                prompt=final_prompt,
                model_name=model_info["model"],
                system_instruction=system_instruction,
                chat_id=chat_request.chatId or "",
                agent_type=agent_type.value,
                sources=sources,
            ):
                yield chunk

        else:
            # Groq Llama streaming path
            system_instruction = (
                "You are NexaMind, an intelligent and helpful personal AI assistant. "
                "Be concise, accurate, and friendly. Respond in clear markdown."
            )
            if memory_context:
                system_instruction += f"\n\n{memory_context}"
            if context_to_inject and context_to_inject != memory_context:
                system_instruction += f"\n\n{context_to_inject}"

            messages_list = [{"role": "system", "content": system_instruction}]
            for m in chat_history[-6:]:
                messages_list.append({"role": m.get("role", "user"), "content": m.get("content", "")})
            messages_list.append({"role": "user", "content": query})

            async for chunk in self.streaming_manager.stream_groq(
                messages=messages_list,
                model_name=model_info["model"],
                chat_id=chat_request.chatId or "",
                agent_type=agent_type.value,
            ):
                yield chunk

    async def execute(
        self,
        chat_request: ChatRequest,
        user_id: str,
        chat_history: list[dict],
    ) -> tuple[str, str, AgentType, list[Source]]:
        """
        Non-streaming execution path. Returns (content, model_used, agent_type, sources).
        """
        tokens: list[str] = []
        model_used = "gemini-2.5-flash"
        final_agent_type = AgentType.DIRECT
        final_sources: list[Source] = []

        async for chunk in self.route(chat_request, user_id, chat_history):
            if chunk.type == "token":
                tokens.append(chunk.content)
            elif chunk.type == "done":
                if chunk.metadata.get("modelUsed"):
                    model_used = str(chunk.metadata["modelUsed"])
                if chunk.metadata.get("agentType"):
                    final_agent_type = AgentType(chunk.metadata["agentType"])
                if chunk.metadata.get("sources"):
                    final_sources = [
                        Source(**s) if isinstance(s, dict) else s
                        for s in chunk.metadata["sources"]
                    ]

        return "".join(tokens), model_used, final_agent_type, final_sources
