"""
NexaMind Backend — Web Search Sub-Agent (Full Tavily Integration)

Provides real-time web search powered by the Tavily API.
Features:
  - Keyword + Flash-Lite heuristic gating (needs_web_search) to avoid
    wasting API quota on queries that don't need live data.
  - Daily budget cap (30 searches/day) with midnight UTC auto-reset.
  - Graceful fallback: every failure path returns AgentResult(used=False)
    so RouterAgent can fall through to direct chat without crashing.
  - Source URLs validated to be proper https:// links before inclusion.
"""

import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import urlparse

import google.generativeai as genai

from config import get_settings
from models.chat import AgentType, Source
from utils.model_router import select_model

logger = logging.getLogger("nexamind.agents.web_agent")

# ── Trigger keywords for fast heuristic check ─────────────────────────────────
_WEB_TRIGGER_KEYWORDS: frozenset[str] = frozenset(
    [
        "latest", "current", "today", "recent", "now", "this week",
        "this month", "news", "price of", "price for", "stock", "weather",
        "who is the current", "right now", "breaking", "just happened",
        "live", "update", "announcement", "release", "launched", "new version",
        "trending", "2024", "2025", "2026",
    ]
)

# ── Daily budget state (in-memory, resets at midnight UTC) ────────────────────
_DAILY_LIMIT = 30


class _DailyBudget:
    """Thread-safe (asyncio) in-memory daily search counter."""

    def __init__(self) -> None:
        self._count: int = 0
        self._reset_date: str = self._today()

    @staticmethod
    def _today() -> str:
        return datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")

    def _maybe_reset(self) -> None:
        today = self._today()
        if today != self._reset_date:
            logger.info(
                "Web search budget reset for new UTC day (prev date: %s, count: %d)",
                self._reset_date,
                self._count,
            )
            self._count = 0
            self._reset_date = today

    def remaining(self) -> int:
        self._maybe_reset()
        return max(0, _DAILY_LIMIT - self._count)

    def consume(self) -> bool:
        """Returns True if budget available and increments counter, False if exhausted."""
        self._maybe_reset()
        if self._count >= _DAILY_LIMIT:
            return False
        self._count += 1
        logger.debug("Web search budget used: %d/%d", self._count, _DAILY_LIMIT)
        return True


# Module-level singleton budget tracker
_budget = _DailyBudget()


def _is_valid_https_url(url: str) -> bool:
    """Validate that a URL is a proper https:// link."""
    try:
        parsed = urlparse(url)
        return parsed.scheme == "https" and bool(parsed.netloc)
    except Exception:
        return False


class WebAgent:
    """
    Sub-agent responsible for real-time web search using the Tavily API.

    Flow:
      1. needs_web_search() gates the call — keyword heuristic + optional Flash-Lite.
      2. Daily budget check — cap at 30 searches/day to stay within free tier.
      3. TavilyClient.search() fetches top results.
      4. Results are formatted into a grounded context block with source URLs.
      5. Returns AgentResult(used=True) on success, AgentResult(used=False) on
         any failure so RouterAgent falls back to direct chat transparently.
    """

    def __init__(self) -> None:
        self.settings = get_settings()
        self._tavily_client = None  # Lazy-init to avoid crash if key missing
        genai.configure(api_key=self.settings.gemini_api_key)

    def _get_tavily_client(self):
        """Lazy-initialise TavilyClient. Returns None if key is missing/invalid."""
        if self._tavily_client is not None:
            return self._tavily_client
        try:
            from tavily import TavilyClient

            api_key = self.settings.tavily_api_key
            if not api_key or api_key.strip() in ("", "your-tavily-key", "TAVILY_API_KEY"):
                logger.warning("TAVILY_API_KEY not configured — web search disabled")
                return None
            self._tavily_client = TavilyClient(api_key=api_key)
            return self._tavily_client
        except Exception as exc:
            logger.warning("Tavily client init failed: %s", exc)
            return None

    # ── Public interface ──────────────────────────────────────────────────────

    async def needs_web_search(self, query: str) -> bool:
        """
        Two-stage gate:
          Stage 1 — Fast keyword heuristic (zero API cost).
          Stage 2 — Flash-Lite binary confirmation for ambiguous cases.

        Returns True only when live web data is genuinely needed.
        """
        query_lower = query.lower()

        # Stage 1: keyword scan
        has_trigger = any(kw in query_lower for kw in _WEB_TRIGGER_KEYWORDS)
        if has_trigger:
            logger.debug("needs_web_search: keyword trigger matched for query '%s'", query[:60])
            return True

        # Stage 2: Flash-Lite confirmation for ambiguous queries (> 8 words)
        words = query_lower.split()
        if len(words) < 4:
            return False  # Very short queries rarely need live data

        choice = select_model("intent")
        prompt = (
            "Does this user query require current, real-time, or live information from the web "
            "(e.g. today's news, current prices, recent events, live data)?\n\n"
            f"Query: {query}\n\n"
            'Return ONLY valid JSON: {"needs_web": true} or {"needs_web": false}'
        )
        try:
            model = genai.GenerativeModel(
                model_name=choice["model"],
                generation_config={"response_mime_type": "application/json"},
            )
            response = await asyncio.to_thread(model.generate_content, prompt)
            try:
                raw = (response.text or "{}").strip()
            except (ValueError, AttributeError):
                raw = "{}"
            raw = re.sub(r"^```json\s*", "", raw, flags=re.MULTILINE)
            raw = re.sub(r"\s*```$", "", raw, flags=re.MULTILINE).strip()
            data = json.loads(raw)
            result = bool(data.get("needs_web", False))
            logger.debug("needs_web_search: Flash-Lite returned %s for query '%s'", result, query[:60])
            return result
        except Exception as exc:
            logger.debug("needs_web_search Flash-Lite check failed: %s. Defaulting to False.", exc)
            return False

    async def handle(
        self,
        query: str,
        user_id: str,
        chat_history: list[dict],
    ) -> "AgentResult":  # type: ignore[name-defined]
        """
        Perform a Tavily web search and return formatted context + sources.

        Always catches exceptions — failures return AgentResult(used=False).
        """
        from agents import AgentResult

        # ── Budget check ──────────────────────────────────────────────────────
        if not _budget.consume():
            logger.warning(
                "Web search daily budget exhausted (%d/%d). Falling back to direct chat.",
                _DAILY_LIMIT,
                _DAILY_LIMIT,
            )
            return AgentResult(
                context="",
                sources=[],
                used=False,
                agentType=AgentType.WEB,
                note=f"Daily web search budget exhausted ({_DAILY_LIMIT}/day). Falling back to direct chat.",
            )

        # ── Tavily client ─────────────────────────────────────────────────────
        client = self._get_tavily_client()
        if client is None:
            return AgentResult(
                context="",
                sources=[],
                used=False,
                agentType=AgentType.WEB,
                note="Tavily API not configured",
            )

        # ── Search ────────────────────────────────────────────────────────────
        try:
            logger.info("WebAgent: searching Tavily for query '%s' (budget remaining: %d)", query[:60], _budget.remaining())

            search_response: dict = await asyncio.to_thread(
                client.search,
                query=query,
                max_results=5,
                search_depth="basic",
                include_answer=True,
            )

            results: list[dict] = search_response.get("results", [])
            tavily_answer: str = search_response.get("answer", "")

            if not results:
                logger.info("WebAgent: Tavily returned no results for '%s'", query[:60])
                return AgentResult(
                    context="",
                    sources=[],
                    used=False,
                    agentType=AgentType.WEB,
                    note="Tavily returned no results",
                )

            # ── Format context + build Source list ────────────────────────────
            context_blocks: list[str] = []
            sources: list[Source] = []

            if tavily_answer:
                context_blocks.append(f"Web search answer: {tavily_answer}")

            for i, result in enumerate(results, 1):
                title: str = result.get("title", f"Result {i}").strip()
                url: str = result.get("url", "").strip()
                content: str = result.get("content", "").strip()
                score: float = float(result.get("score", 0.0))

                # Skip low-relevance results
                if score < 0.3:
                    continue

                # Validate URL
                if not _is_valid_https_url(url):
                    logger.debug("WebAgent: skipping result with invalid URL: %r", url)
                    continue

                snippet = content[:300] if content else title
                context_blocks.append(f"[Web {i}: {title}]\n{snippet}\nSource: {url}")

                sources.append(
                    Source(
                        documentId=url,           # URL acts as unique ID for web sources
                        filename=title,
                        pageNumber=None,
                        chunkText=content[:150] if content else title[:150],
                        url=url,
                    )
                )

            if not context_blocks:
                return AgentResult(
                    context="",
                    sources=[],
                    used=False,
                    agentType=AgentType.WEB,
                    note="No valid web results after URL validation",
                )

            formatted_context = (
                f"WEB SEARCH RESULTS for: \"{query}\"\n\n"
                + "\n\n".join(context_blocks)
            )

            logger.info(
                "WebAgent: search complete — %d valid sources (budget remaining: %d)",
                len(sources),
                _budget.remaining(),
            )

            return AgentResult(
                context=formatted_context,
                sources=sources,
                used=True,
                agentType=AgentType.WEB,
            )

        except Exception as exc:
            logger.error(
                "WebAgent.handle failed for user %s (query: '%s'): %s",
                user_id,
                query[:60],
                exc,
                exc_info=True,
            )
            return AgentResult(
                context="",
                sources=[],
                used=False,
                agentType=AgentType.WEB,
                note=f"Web search error: {exc}",
            )
