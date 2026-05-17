"""
Web Search node — Tavily + Serper.

When the user enables Web:
  - Runs Tavily (if key configured)
  - Also runs Serper (if key configured) and merges unique results
  - Supplies combined results to the generation node
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from backend.config import settings
from backend.models.state import GraphState

logger = logging.getLogger("exics.graph.web_search")


def _search_tavily(query: str) -> list[dict[str, Any]]:
    from tavily import TavilyClient

    client = TavilyClient(api_key=settings.tavily_api_key)
    response = client.search(
        query=query,
        search_depth="advanced",
        max_results=5,
        include_answer=True,
    )
    results: list[dict[str, Any]] = []

    answer = response.get("answer")
    if answer:
        results.append({
            "title": "Tavily summary",
            "url": "",
            "content": answer,
            "score": 1.0,
            "provider": "tavily",
        })

    for r in response.get("results", []):
        results.append({
            "title": r.get("title", ""),
            "url": r.get("url", ""),
            "content": r.get("content", ""),
            "score": r.get("score", 0),
            "provider": "tavily",
        })
    return results


def _search_serper(query: str) -> list[dict[str, Any]]:
    resp = httpx.post(
        "https://google.serper.dev/search",
        headers={"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"},
        json={"q": query, "num": 5},
        timeout=20,
    )
    resp.raise_for_status()
    data = resp.json()
    results: list[dict[str, Any]] = []

    answer_box = data.get("answerBox")
    if answer_box:
        results.append({
            "title": answer_box.get("title", "Google answer"),
            "url": answer_box.get("link", ""),
            "content": answer_box.get("snippet") or answer_box.get("answer", ""),
            "score": 1.0,
            "provider": "serper",
        })

    for item in data.get("organic", [])[:5]:
        results.append({
            "title": item.get("title", ""),
            "url": item.get("link", ""),
            "content": item.get("snippet", ""),
            "score": 0,
            "provider": "serper",
        })
    return results


def _merge_results(*result_lists: list[list[dict[str, Any]]]) -> list[dict[str, Any]]:
    """Merge search results, deduplicating by URL."""
    seen_urls: set[str] = set()
    merged: list[dict[str, Any]] = []

    for results in result_lists:
        for r in results:
            url = (r.get("url") or "").strip().lower()
            content = (r.get("content") or "").strip()
            if not content:
                continue
            if url and url in seen_urls:
                continue
            if url:
                seen_urls.add(url)
            merged.append(r)
    return merged[:10]


def web_search(state: GraphState) -> GraphState:
    """Search Tavily and Serper, merge results, and pass to generation."""
    query = state.get("rewritten_query") or state["original_query"]
    tavily_results: list[dict[str, Any]] = []
    serper_results: list[dict[str, Any]] = []

    if settings.tavily_api_key:
        try:
            tavily_results = _search_tavily(query)
            logger.info("Tavily returned %d results", len(tavily_results))
        except Exception as exc:
            logger.warning("Tavily search failed: %s", exc)
    else:
        logger.warning("TAVILY_API_KEY not configured")

    if settings.serper_api_key:
        try:
            serper_results = _search_serper(query)
            logger.info("Serper returned %d results", len(serper_results))
        except Exception as exc:
            logger.warning("Serper search failed: %s", exc)
    else:
        logger.warning("SERPER_API_KEY not configured")

    results = _merge_results(tavily_results, serper_results)

    if not results:
        if not settings.tavily_api_key and not settings.serper_api_key:
            logger.error("Web search enabled but no Tavily/Serper API keys in .env")
        else:
            logger.warning("Web search returned 0 results for: %s", query[:80])

    return {
        **state,
        "web_search_results": results,
        "web_search_needed": False,
        "used_web_search": len(results) > 0,
    }
