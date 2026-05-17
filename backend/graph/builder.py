"""
LangGraph StateGraph builder for the Exics RAG pipeline.

Flow:
  START -> query_analysis -> retrieval -> [decision]
    |- retrieval FAILED -> web_search -> generation -> hallucination_check -> ...
    |- retrieval OK -> grading -> [decision]
        |- relevant chunks -> generation -> hallucination_check -> [decision]
        |   |- grounded -> END
        |   |- ungrounded -> generation (retry)
        |- no relevant chunks -> web_search -> generation -> hallucination_check -> ...
"""

from __future__ import annotations

import logging

from langgraph.graph import StateGraph, END

from backend.models.state import GraphState
from backend.graph.nodes.query_analysis import query_analysis
from backend.graph.nodes.retrieval import retrieval
from backend.graph.nodes.grading import grading
from backend.graph.nodes.generation import generation
from backend.graph.nodes.hallucination import hallucination_check
from backend.graph.nodes.web_search import web_search
from backend.graph.nodes.query_rewrite import query_rewrite_retry
from backend.graph.routing import after_retrieval, route_after_grading, should_regenerate

logger = logging.getLogger("exics.graph")


def build_graph() -> StateGraph:
    """Construct and compile the RAG pipeline graph."""
    graph = StateGraph(GraphState)

    graph.add_node("query_analysis", query_analysis)
    graph.add_node("retrieval", retrieval)
    graph.add_node("grading", grading)
    graph.add_node("query_rewrite_retry", query_rewrite_retry)
    graph.add_node("generation", generation)
    graph.add_node("hallucination_check", hallucination_check)
    graph.add_node("web_search", web_search)

    graph.set_entry_point("query_analysis")
    graph.add_edge("query_analysis", "retrieval")

    graph.add_conditional_edges(
        "retrieval",
        after_retrieval,
        {"web_search": "web_search", "grading": "grading"},
    )

    graph.add_conditional_edges(
        "grading",
        route_after_grading,
        {
            "rewrite_retry": "query_rewrite_retry",
            "web_search": "web_search",
            "generate": "generation",
        },
    )

    graph.add_edge("query_rewrite_retry", "retrieval")

    graph.add_edge("web_search", "generation")
    graph.add_edge("generation", "hallucination_check")

    graph.add_conditional_edges(
        "hallucination_check",
        should_regenerate,
        {"regenerate": "generation", "done": END},
    )

    return graph.compile()


_compiled_graph = None


def get_graph():
    """Return the compiled graph (lazy singleton)."""
    global _compiled_graph
    if _compiled_graph is None:
        logger.info("Building LangGraph RAG pipeline ...")
        _compiled_graph = build_graph()
        logger.info("RAG pipeline ready")
    return _compiled_graph
