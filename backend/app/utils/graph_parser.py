from typing import Tuple, List, Any, Dict, Optional
from collections import deque

def parse_existing_graph(existing_graph: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    """Explicitly classifies graph state and extracts all unique entity node labels."""
    if not existing_graph:
        return "empty", []

    nodes = set()
    has_triplets = False

    for item in existing_graph:
        if isinstance(item, str):
            nodes.add(item)
        elif isinstance(item, dict):
            if "predicate" in item:
                has_triplets = True
                if item.get("subject"): 
                    nodes.add(item["subject"])
                if item.get("object"): 
                    nodes.add(item["object"])
            elif "node" in item:
                nodes.add(item["node"])
            elif "label" in item:
                nodes.add(item["label"])

    graph_type = "full_triplets" if has_triplets else "nodes_only"
    return graph_type, sorted(list(nodes))

def format_existing_graph(existing_graph: list[dict]) -> str:
    lines = []
    for item in existing_graph:
        if "predicate" in item:
            lines.append(f"- ({item['subject']}, {item['predicate']}, {item['object']})")
        elif "node" in item:
            lines.append(f"- [isolated node: {item['node']}]")
    return "\n".join(lines) if lines else "(no existing graph yet)"

def _norm(value: Any) -> str:
    """Normalise a label for comparison: collapse whitespace, casefold."""
    return " ".join(str(value).split()).casefold()


def extract_edges(existing_graph: List[Any]) -> List[Tuple[str, str, str]]:
    """Pull well-formed (subject, predicate, object) tuples out of the raw graph payload."""
    edges = []
    for item in existing_graph or []:
        if isinstance(item, dict) and item.get("predicate"):
            subj, pred, obj = item.get("subject"), item.get("predicate"), item.get("object")
            if subj and obj:
                edges.append((str(subj), str(pred), str(obj)))
    return edges


def extract_isolated_nodes(existing_graph: List[Any], edges: List[Tuple[str, str, str]]) -> List[str]:
    """Node labels that carry no edge. Handles bare strings and node/label/id dicts."""
    connected = {_norm(n) for (s, _, o) in edges for n in (s, o)}
    isolated: List[str] = []
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


def parse_existing_graph(existing_graph: List[Dict[str, Any]]) -> Tuple[str, List[str]]:
    """Classify graph state and extract all unique entity node labels, in graph order."""
    if not existing_graph:
        return "empty", []

    edges = extract_edges(existing_graph)
    nodes: List[str] = []
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


def render_chains(edges: List[Tuple[str, str, str]]) -> Tuple[List[str], List[Tuple[str, str, str]]]:
    """Render the edge set as maximal directed paths.

    Returns (chain_lines, leftover_edges). Leftovers are edges only reachable inside a cycle,
    which the path walk deliberately refuses to follow.
    """
    if not edges:
        return [], []

    out_adj: Dict[str, List[Tuple[str, str]]] = {}
    indeg: Dict[str, int] = {}
    label_of: Dict[str, str] = {}

    for (subj, pred, obj) in edges:
        s_key, o_key = _norm(subj), _norm(obj)
        label_of.setdefault(s_key, subj)
        label_of.setdefault(o_key, obj)
        out_adj.setdefault(s_key, []).append((pred, o_key))
        indeg.setdefault(s_key, 0)
        indeg[o_key] = indeg.get(o_key, 0) + 1

    starts = [k for k, d in indeg.items() if d == 0] or list(indeg.keys())
    covered = set()
    lines: List[str] = []

    def walk(node_key: str, rendered: str, seen: set) -> None:
        nxt = [(p, o) for (p, o) in out_adj.get(node_key, []) if o not in seen]
        if not nxt:
            lines.append(rendered)
            return
        for (pred, o_key) in nxt:
            covered.add((node_key, _norm(pred), o_key))
            walk(o_key, f"{rendered} --{pred}--> {label_of[o_key]}", seen | {o_key})

    for start in starts:
        walk(start, label_of[start], {start})

    leftover = [
        (s, p, o) for (s, p, o) in edges
        if (_norm(s), _norm(p), _norm(o)) not in covered
    ]
    return lines, leftover


def format_existing_graph(existing_graph: list) -> str:
    """Chain-oriented rendering of the graph, so path structure is visible at a glance."""
    edges = extract_edges(existing_graph)
    isolated = extract_isolated_nodes(existing_graph, edges)

    if not edges and not isolated:
        return "(no existing graph yet)"

    blocks = []
    chains, leftover = render_chains(edges)
    for i, chain in enumerate(chains, start=1):
        blocks.append(f"Chain {i}: {chain}")
    for (subj, pred, obj) in leftover:
        blocks.append(f"Additional edge: {subj} --{pred}--> {obj}")
    if isolated:
        blocks.append("Isolated nodes (no edges yet): " + ", ".join(isolated))
    return "\n".join(blocks)


def _find_path(
    edges: List[Tuple[str, str, str]], start: str, goal: str
) -> Optional[Tuple[str, int, List[str]]]:
    """Shortest directed path start -> goal.

    Returns (rendered_path, hop_count, intermediate_labels) or None if unreachable.
    The hop count is what separates a duplicate (1 hop: the graph already states this
    exact relation) from a shortcut (2+ hops: the candidate collapses mediators the
    graph already represents). Those need opposite verdicts, so the caller must be able
    to tell them apart.
    """
    adj: Dict[str, List[Tuple[str, str]]] = {}
    label_of: Dict[str, str] = {}
    for (subj, pred, obj) in edges:
        s_key, o_key = _norm(subj), _norm(obj)
        label_of.setdefault(s_key, subj)
        label_of.setdefault(o_key, obj)
        adj.setdefault(s_key, []).append((pred, o_key))

    start_key, goal_key = _norm(start), _norm(goal)
    if start_key not in label_of or goal_key not in label_of:
        return None

    queue = deque([(start_key, label_of[start_key], [])])
    seen = {start_key}
    while queue:
        cur, rendered, visited = queue.popleft()
        for (pred, nxt) in adj.get(cur, []):
            if nxt in seen:
                continue
            path = f"{rendered} --{pred}--> {label_of[nxt]}"
            if nxt == goal_key:
                return path, len(visited) + 1, [label_of[k] for k in visited]
            seen.add(nxt)
            queue.append((nxt, path, visited + [nxt]))
    return None


def verified_edge_keys(existing_graph: list) -> set:
    """Normalised keys of edges carrying an explicit verified flag.

    The flag lives on the whole edge dict. Any edit to subject, predicate or object changes
    the key, so a modified edge no longer matches its old flag and is treated as unverified.

    A missing 'verified' key is falsy, so imported or pre-existing maps count as fully
    unverified until re-checked. `extract_edges` is deliberately left flag-blind, so this is
    the ONLY place the flag is read for traversal purposes.
    """
    keys = set()
    for item in existing_graph or []:
        if (isinstance(item, dict) and item.get("verified")
                and item.get("predicate") and item.get("subject") and item.get("object")):
            keys.add((_norm(item["subject"]), _norm(item["predicate"]), _norm(item["object"])))
    return keys


def find_exact_duplicate(existing_graph: list, triplet: dict,
                         require_verified: bool = False) -> Optional[Dict[str, str]]:
    """The existing edge this candidate reproduces exactly, comparing normalised, or None.

    Exact here means all three of subject, predicate and object match after whitespace and
    case normalisation.

    When require_verified is True, only a VERIFIED matching edge counts.
    """
    key = (_norm(triplet.get("subject", "")),
           _norm(triplet.get("predicate", "")),
           _norm(triplet.get("object", "")))
    verified = verified_edge_keys(existing_graph) if require_verified else None
    for item in existing_graph or []:
        if not (isinstance(item, dict) and item.get("predicate")):
            continue
        s, p, o = item.get("subject"), item.get("predicate"), item.get("object")
        if not (s and o):
            continue
        ekey = (_norm(s), _norm(p), _norm(o))
        if ekey == key:
            if require_verified and ekey not in verified:
                continue
            return {"subject": str(s), "predicate": str(p), "object": str(o)}
    return None



def _verified_chains_through(edges: List[Tuple[str, str, str]], keys: set) -> Tuple[List[str], bool]:
    """Maximal directed chains (rendered) whose node set touches any key in `keys`.

    Returns (chain_lines, any_touch). Mirrors render_chains' walk but tracks the node-key set of
    each chain so membership is exact, not a substring guess. Cycle-safe: edges only reachable in
    a cycle are surfaced as their own one-hop lines if they touch.
    """
    out_adj: Dict[str, List[Tuple[str, str]]] = {}
    indeg: Dict[str, int] = {}
    label_of: Dict[str, str] = {}
    for (s, p, o) in edges:
        sk, ok = _norm(s), _norm(o)
        label_of.setdefault(sk, s)
        label_of.setdefault(ok, o)
        out_adj.setdefault(sk, []).append((p, ok))
        indeg.setdefault(sk, 0)
        indeg[ok] = indeg.get(ok, 0) + 1

    starts = [k for k, d in indeg.items() if d == 0] or list(indeg.keys())
    lines: List[str] = []
    covered = set()

    def walk(node_key, rendered, node_set, seen):
        nxt = [(p, o) for (p, o) in out_adj.get(node_key, []) if o not in seen]
        if not nxt:
            if node_set & keys:
                lines.append(rendered)
            return
        for (p, o_key) in nxt:
            covered.add((node_key, o_key))
            walk(o_key, f"{rendered} --{p}--> {label_of[o_key]}",
                 node_set | {o_key}, seen | {o_key})

    for start in starts:
        walk(start, label_of[start], {start}, {start})

    # edges stuck inside cycles (never walked): surface individually if they touch
    for (s, p, o) in edges:
        if (_norm(s), _norm(o)) not in covered:
            if {_norm(s), _norm(o)} & keys:
                lines.append(f"{s} --{p}--> {o}")

    # de-dup while preserving order
    seen_lines, uniq = set(), []
    for ln in lines:
        if ln not in seen_lines:
            seen_lines.add(ln); uniq.append(ln)
    return uniq, bool(uniq)


def build_candidate_context(existing_graph: list, triplet: dict) -> str:
    """Show the candidate's structural position among the VERIFIED edges - facts only.

    Only verified edges are authoritative, so unverified edges are filtered out and are invisible
    here. This function draws NO semantic conclusions: it does not decide duplicate, shortcut,
    skipped-mediator or unfinished. Those depend on the predicate and on the source text, which the
    graph cannot see - a 1-hop edge with a different predicate is not a duplicate, an upstream edge
    is not necessarily the mediator the text routes through, and a downstream edge is not
    necessarily the continuation. The model makes those calls against the text; this block only
    reports what is verified and how it connects to the candidate.

    Emits: whether the candidate's subject and object already appear among verified edges, and every
    verified chain that passes through the subject or the object (a node can lie on several chains,
    so all are listed).
    """
    # Keep only verified edges; pass bare nodes / isolated nodes through untouched.
    verified = verified_edge_keys(existing_graph)
    filtered = []
    for item in existing_graph or []:
        if isinstance(item, dict) and item.get("predicate") and item.get("subject") and item.get("object"):
            if (_norm(item["subject"]), _norm(item["predicate"]), _norm(item["object"])) in verified:
                filtered.append(item)
        else:
            filtered.append(item)

    edges = extract_edges(filtered)
    subj, obj = str(triplet.get("subject", "")), str(triplet.get("object", ""))
    s_key, o_key = _norm(subj), _norm(obj)

    if not edges:
        isolated = extract_isolated_nodes(filtered, edges)
        if isolated:
            return (f"- The verified graph has nodes but no verified edges yet: {', '.join(isolated)}\n"
                    f"- Nothing verified connects to the candidate; judge it against the source text.")
        return ("- The verified graph is empty - no verified edges yet.\n"
                "- Judge the candidate against the source text alone.")

    findings: List[str] = []

    for role, label, key in (("subject", subj, s_key), ("object", obj, o_key)):
        incoming = [(s, p, o) for (s, p, o) in edges if _norm(o) == key]
        outgoing = [(s, p, o) for (s, p, o) in edges if _norm(s) == key]
        if not incoming and not outgoing:
            findings.append(f"- The candidate {role} '{label}' does not appear in the verified graph yet.")
            continue
        for (s, p, o) in incoming:
            findings.append(f"- The candidate {role} '{label}' is the TARGET of a verified edge: {s} --{p}--> {o}")
        for (s, p, o) in outgoing:
            findings.append(f"- The candidate {role} '{label}' is the SOURCE of a verified edge: {s} --{p}--> {o}")

    chains, any_touch = _verified_chains_through(edges, {s_key, o_key})
    if any_touch:
        findings.append("- Verified chains passing through the candidate's subject or object "
                        "(what they mean for this candidate is for you to judge against the text):")
        for i, c in enumerate(chains, 1):
            findings.append(f"    Chain {i}: {c}")
    else:
        findings.append("- No verified chain passes through the candidate's subject or object.")

    return "\n".join(findings)

def _triplet_of(edge: dict) -> dict:
    """The bare (subject, predicate, object) of an edge dict, dropping flags."""
    return {"subject": edge["subject"], "predicate": edge["predicate"], "object": edge["object"]}


def _topo_edge_order(edges: List[dict]) -> List[dict]:
    """Edges in root-first order: an edge whose subject depends on another edge's object comes
    later. Cycle-safe - edges only reachable inside a cycle are appended at the end, so the walk
    terminates and never drops an edge."""
    out_edges: Dict[str, List[dict]] = {}
    indeg: Dict[str, int] = {}
    nodes: set = set()
    for e in edges:
        sk, ok = _norm(e["subject"]), _norm(e["object"])
        out_edges.setdefault(sk, []).append(e)
        indeg[ok] = indeg.get(ok, 0) + 1
        indeg.setdefault(sk, indeg.get(sk, 0))
        nodes.add(sk); nodes.add(ok)

    queue = deque(sorted(k for k in nodes if indeg.get(k, 0) == 0))
    seen_nodes = set(queue)
    ordered: List[dict] = []
    emitted: set = set()
    while queue:
        n = queue.popleft()
        for e in out_edges.get(n, []):
            if id(e) in emitted:
                continue
            emitted.add(id(e))
            ordered.append(e)
            ok = _norm(e["object"])
            indeg[ok] -= 1
            if indeg[ok] == 0 and ok not in seen_nodes:
                seen_nodes.add(ok)
                queue.append(ok)
    for e in edges:
        if id(e) not in emitted:
            ordered.append(e)
    return ordered




def _edge_key(triplet: dict) -> tuple:
    """Normalised (subject, predicate, object) tuple, used for exact-match comparison."""
    return (_norm(triplet["subject"]), _norm(triplet["predicate"]), _norm(triplet["object"]))


def _match_node(label: str, known_nodes: List[str]) -> Optional[str]:
    """Return the known node this label denotes, comparing normalised.

    Plain `label in known_nodes` misses on casing or whitespace drift, which would report a
    node as new when the resolver had just matched it.
    """
    key = _norm(label)
    for node in known_nodes:
        if _norm(node) == key:
            return node
    return None


def _add_node(known_nodes: List[str], label: str) -> None:
    if _match_node(label, known_nodes) is None:
        known_nodes.append(label)

