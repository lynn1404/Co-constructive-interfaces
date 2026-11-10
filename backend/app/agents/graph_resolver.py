from app.utils.graph_parser import parse_existing_graph, _norm
from typing import List, Dict
import math
from typing import List, Optional, Dict, Any, Tuple
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from openai import AsyncOpenAI
from app.schemas import ClusterResolution
from app.prompts import GRAPH_RESOLVER_SYSTEM_PROMPT
from app.utils.timing import logger

EMBED_MODEL = "text-embedding-3-small"
SIM_THRESHOLD = 0.5


def _cosine(a: List[float], b: List[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def _cluster_by_similarity(labels, vectors, threshold):
    """Mutual-best pairing: label A pairs with B only if each is the other's most similar
    partner and the similarity clears the floor. Avoids the transitive chaining that lets one
    mid-similarity hub node merge several distinct concepts into a single blob."""
    n = len(labels)
    if n < 2:
        return []
    best = {}
    for i in range(n):
        j_best, s_best = None, -1.0
        for j in range(n):
            if i == j:
                continue
            s = _cosine(vectors[i], vectors[j])
            if s > s_best:
                j_best, s_best = j, s
        if s_best >= threshold:
            best[i] = (j_best, s_best)

    pairs = []
    for i, (j, s) in best.items():
        if i < j and best.get(j, (None,))[0] == i:
            pairs.append([labels[i], labels[j]])
    return pairs

async def graph_resolver(existing_graph: List[dict],
                         source_text: Optional[str] = None,
                         threshold: float = SIM_THRESHOLD) -> dict:
    """Suggest node merges across the whole graph. Returns {"clusters": [...], "groups": [...], "n_nodes": int}.

    clusters is the raw stage-1 output: lists of labels grouped purely by embedding
    similarity (>= threshold), before the LLM confirms/refines them into groups.
    groups is a list of {canonical, members, reason}. Suggestion only - nothing is merged here.
    Runs on ALL node labels (verified or not): merging is canvas cleanup, not a truth judgment.
    source_text is optional context used only to disambiguate genuinely ambiguous pairs.
    """
    logger.info(f"-> graph_resolver started (threshold={threshold})")
    _, nodes = parse_existing_graph(existing_graph)
    seen, labels = set(), []
    for label in nodes:
        clean = " ".join(str(label).split())
        k = _norm(clean)
        if k not in seen:
            seen.add(k)
            labels.append(clean)


    logger.info(f"graph_resolver: {len(labels)} unique node labels: {labels}")

    if len(labels) < 2:
        logger.info("graph_resolver: fewer than 2 labels, nothing to compare")
        return {"clusters": [], "groups": [], "n_nodes": len(labels)}

    # --- stage 1: embed (linear) + cluster (free) ---
    client = AsyncOpenAI()
    emb = await client.embeddings.create(model=EMBED_MODEL, input=labels)
    vectors = [d.embedding for d in sorted(emb.data, key=lambda d: d.index)]
    clusters = _cluster_by_similarity(labels, vectors, threshold)
    logger.info(f"graph_resolver: {len(clusters)} candidate cluster(s) from embeddings: {clusters}")
    if not clusters:
        logger.info("graph_resolver: no clusters passed the similarity threshold")
        return {"clusters": [], "groups": [], "n_nodes": len(labels)}

    # --- stage 2: confirm each cluster with the model ---
    agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(ClusterResolution)
    prompt = ChatPromptTemplate.from_messages([
        ("system", GRAPH_RESOLVER_SYSTEM_PROMPT),
        ("human",
         "Source Text (optional context - may be empty):\n{source_text}\n\n"
         "Cluster of node labels:\n{labels}\n\nWhich should be merged?")
    ])

    valid = {_norm(l) for l in labels}
    out_groups: List[dict] = []
    for cluster in clusters:
        logger.info(f"graph_resolver: confirming cluster with LLM: {cluster}")
        result = await agent.ainvoke(prompt.format_prompt(
            source_text=source_text or "(none provided)",
            labels="\n".join(f"- {l}" for l in cluster),
        ))
        logger.info(f"graph_resolver: LLM proposed {len(result.groups)} group(s) for cluster {cluster}")
        for g in result.groups:
            members, mseen = [], set()
            for m in g.members:
                if _norm(m) in valid and _norm(m) not in mseen:
                    mseen.add(_norm(m)); members.append(m)
                elif _norm(m) not in valid:
                    logger.info(f"graph_resolver: dropping hallucinated member {m!r} not in original labels")
            if len(members) >= 2:
                canonical = g.canonical if _norm(g.canonical) in {_norm(m) for m in members} else members[0]
                logger.info(f"graph_resolver: group -> canonical={canonical!r} members={members} reason={g.reason!r}")
                out_groups.append({"canonical": canonical, "members": members, "reason": g.reason})
            else:
                logger.info(f"graph_resolver: dropping group, fewer than 2 valid members after filtering: {g.members}")

    logger.info(f"<- graph_resolver finished: {len(out_groups)} group(s) out of {len(labels)} labels")
    return {"clusters": clusters, "groups": out_groups, "n_nodes": len(labels)}