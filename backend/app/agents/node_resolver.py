import logging

from langchain_core.prompts import ChatPromptTemplate

from app.config import get_llm
from app.prompts import NODE_RESOLUTION_SYSTEM_PROMPT
from app.schemas import NodeResolution
from app.utils.graph_parser import _norm, parse_existing_graph
from app.utils.timing import log_timing

logger = logging.getLogger(__name__)


@log_timing
async def resolve_nodes(existing_graph: list[dict]) -> dict:
    """Suggest which node labels name the same concept and could be merged, in one LLM call.

    Returns {"groups": [{"members": [...], "reason": str}], "n_nodes": int}.
    """
    _, nodes = parse_existing_graph(existing_graph)  # already de-duplicated by _norm
    labels = [" ".join(str(node).split()) for node in nodes]

    if len(labels) < 2:
        return {"groups": [], "n_nodes": len(labels)}

    agent = get_llm().with_structured_output(NodeResolution)
    prompt = ChatPromptTemplate.from_messages([
        ("system", NODE_RESOLUTION_SYSTEM_PROMPT),
        ("human", "Node labels from the student's map:\n{labels}\n\nWhich should be merged?"),
    ])
    result = await agent.ainvoke(prompt.format_prompt(
        labels="\n".join(f"- {label}" for label in labels)))

    logger.info("resolve_nodes: %d labels -> %d group(s)", len(labels), len(result.groups))

    # Keep only members that really exist on the map (in their original casing),
    # and only groups that still have at least two members.
    valid = {_norm(label): label for label in labels}
    out_groups = []
    for group in result.groups:
        members, seen = [], set()
        for member in group.members:
            key = _norm(member)
            if key in valid and key not in seen:
                seen.add(key)
                members.append(valid[key])
        if len(members) >= 2:
            out_groups.append({"members": members, "reason": group.reason})

    return {"groups": out_groups, "n_nodes": len(labels)}
