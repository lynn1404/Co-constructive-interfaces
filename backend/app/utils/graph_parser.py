"""Helpers for reading the graph payload sent by the frontend: a list mixing edge entries
{"subject", "predicate", "object", ...} and isolated-node entries {"node": label}."""

from typing import Any


def _norm(value: Any) -> str:
    """Normalise a label for comparison: collapse whitespace, casefold."""
    return " ".join(str(value).split()).casefold()


def extract_edges(existing_graph: list[Any]) -> list[tuple[str, str, str]]:
    """Pull well-formed (subject, predicate, object) tuples out of the raw graph payload."""
    edges = []
    for item in existing_graph or []:
        if isinstance(item, dict) and item.get("predicate"):
            subj, pred, obj = item.get("subject"), item.get("predicate"), item.get("object")
            if subj and obj:
                edges.append((str(subj), str(pred), str(obj)))
    return edges


def extract_isolated_nodes(existing_graph: list[Any], edges: list[tuple[str, str, str]]) -> list[str]:
    """Node labels that carry no edge. Handles bare strings and node/label/id dicts."""
    connected = {_norm(n) for (s, _, o) in edges for n in (s, o)}
    isolated: list[str] = []
    for item in existing_graph or []:
        label = None
        if isinstance(item, str):
            label = item
        elif isinstance(item, dict) and not item.get("predicate"):
            label = item.get("node") or item.get("label") or item.get("id")
        if not label:
            continue
        if _norm(label) in connected or _norm(label) in {_norm(x) for x in isolated}:
            continue
        isolated.append(str(label))
    return isolated


def parse_existing_graph(existing_graph: list[dict[str, Any]]) -> tuple[str, list[str]]:
    """Classify graph state and extract all unique entity node labels, in graph order."""
    if not existing_graph:
        return "empty", []

    edges = extract_edges(existing_graph)
    nodes: list[str] = []
    seen = set()
    for (subj, _, obj) in edges:
        for label in (subj, obj):
            if _norm(label) not in seen:
                seen.add(_norm(label))
                nodes.append(label)
    for label in extract_isolated_nodes(existing_graph, edges):
        if _norm(label) not in seen:
            seen.add(_norm(label))
            nodes.append(label)

    graph_type = "full_triplets" if edges else "nodes_only"
    return graph_type, nodes

