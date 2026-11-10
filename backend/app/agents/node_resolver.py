from typing import List, Dict, Any, Optional
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from app.schemas import NodeResolution
from app.prompts import NODE_RESOLUTION_SYSTEM_PROMPT
from app.utils.graph_parser import _norm, parse_existing_graph
from app.utils.timing import logger


async def resolve_nodes(existing_graph: List[dict]) -> dict:
    """Suggest node merges across the whole graph in one call, no embeddings.

    One call sees all labels at once and groups co-referents. Returns the same shape as
    graph_resolver: {"groups": [{canonical, members, reason}], "n_nodes": int}.

    Compared to graph_resolver (embed → cluster → confirm), this is simpler and cheaper,
    but the model sees every pair at once which may cause it to miss near-synonyms it would
    catch if they were in a small cluster together. On large maps (>20 nodes) the embedding
    version is likely more reliable; for small maps this is sufficient.
    """
    _, nodes = parse_existing_graph(existing_graph)

    # De-dup exact normalised repeats upfront; keep first-seen surface form.
    seen, labels = set(), []
    for label in nodes:
        clean = " ".join(str(label).split())
        k = _norm(clean)
        if k not in seen:
            seen.add(k)
            labels.append(clean)

    if len(labels) < 2:
        return {"groups": [], "n_nodes": len(labels)}

    agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(NodeResolution)
    prompt = ChatPromptTemplate.from_messages([
        ("system", NODE_RESOLUTION_SYSTEM_PROMPT),
        ("human",
         "Node labels from the student's map:\n{labels}\n\n"
         "Which should be merged?")
    ])
    result = await agent.ainvoke(prompt.format_prompt(
        labels="\n".join(f"- {l}" for l in labels)))

    logger.info(f"resolve_nodes: {len(labels)} labels → {len(result.groups)} group(s)")

    # Guard: keep only members that were actually in the label list, and only groups with ≥2.
    valid = {_norm(l): l for l in labels}
    out_groups = []
    for g in result.groups:
        members, seen_m = [], set()
        for m in g.members:
            k = _norm(m)
            if k in valid and k not in seen_m:
                seen_m.add(k)
                members.append(valid[k])   # use the original casing from the map
        if len(members) < 2:
            continue
        out_groups.append({"members": members, "reason": g.reason})

    return {"groups": out_groups, "n_nodes": len(labels)}