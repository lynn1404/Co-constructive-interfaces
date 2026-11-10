from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from app.schemas import GraphState, CorrectorOutput
from app.prompts import CORRECTOR_SYSTEM_PROMPT
from app.utils.graph_parser import extract_edges, build_candidate_context
from app.utils.timing import log_timing
llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

@log_timing
def corrector_node(state: GraphState) -> dict:
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
    agent = llm.with_structured_output(CorrectorOutput)

    # Format existing edges for context so the corrector knows what NOT to duplicate
    formatted_graph = "None"
    if state["existing_graph"]:
        lines = [f"- ({s}, {p}, {o})" for (s, p, o) in extract_edges(state["existing_graph"])]
        if lines:
            formatted_graph = "\n".join(lines)

    prompt = ChatPromptTemplate.from_messages([
        ("system", CORRECTOR_SYSTEM_PROMPT),
        ("human",
         "Source Text: {text}\n"
         "Evaluation Status: {status}\n"
         "Error Type: {error_type}\n"
         "Existing Graph Edges: \n{graph}\n"
         "Existing Node Labels: {nodes}\n"
         "CANDIDATE CONTEXT (authoritative - what the graph already covers):\n{candidate_context}\n"
         "Candidate Triplet: {triplet}\n"
         "Evaluator Diagnosis: {diagnosis}\n"
         "Evaluator claim check (what the text says about this pair): {evidence}\n"
         "Claim direction: {semantic}\n"
         "MEDIATOR NAMED BY THE TEXT: {mediator} (already on a verified path into the subject: {mediator_covered})\n"
         "Graph Path Finding: {path_check}")
    ])
    result = agent.invoke(prompt.format_prompt(
        text=state["source_text"],
        status=state["evaluation_status"],
        error_type=state.get("evaluation_error_type"),
        graph=formatted_graph,
        nodes=state["existing_nodes"],
        candidate_context=build_candidate_context(state["existing_graph"], state["current_triplet"]),
        triplet=state["current_triplet"],
        diagnosis=state["evaluation_diagnosis"],
        evidence=state.get("evaluation_claim_check"),
        semantic=state.get("evaluation_claim_direction"),
        mediator=state.get("evaluation_mediator_in_text") or "(none - the text states the relation directly)",
        mediator_covered=state.get("evaluation_mediator_is_covered"),
        path_check=state.get("evaluation_graph_path_check"),
    ))

    fixed = [t.model_dump() for t in result.fixed_triplets]

    # Keep outcome and triplets consistent: a non-empty list is a fix regardless of the label
    # the model chose, and a no-fix label must not carry triplets.
    outcome = result.correction_outcome
    if fixed and outcome != "fix_provided":
        outcome = "fix_provided"
    elif not fixed and outcome == "fix_provided":
        outcome = "already_represented"

    return {
        "correction": fixed,
        "correction_rationale": result.rationale,
        "correction_outcome": outcome,
        "correction_grounding": [g.model_dump() for g in result.source_grounding],
    }