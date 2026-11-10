from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from app.schemas import GraphState, HinterOutput
from app.prompts import HINTER_SYSTEM_PROMPT
from app.utils.timing import log_timing

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, seed=42)

@log_timing
def hinter_node(state: GraphState) -> dict:
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, seed=42)
    status = state["evaluation_status"]

    if status == "redundant":
        dup = state.get("duplicate_of")
        dup_str = f"\"{dup['subject']} {dup['predicate']} {dup['object']}\"" if dup else "an existing fact in your graph"
        note = f" It also adds a detail worth keeping: {state['predicate_note']}" if state.get("predicate_note") else ""
        return {"student_hint": f"This is already captured in your graph as {dup_str}.{note}",
                "student_reflection": None}
    if status == "correct":
        return {"student_hint": "Nice work — this triplet accurately reflects the text.",
                "student_reflection": None}

    # No correction was produced. These are honest answers, not failures, and each needs its
    # own wording - "here's the fix" phrasing would be actively misleading with nothing to add.
    outcome = state.get("correction_outcome")
    error_type = state.get("evaluation_error_type")
    resolutions = state.get("resolutions") or []
    all_already_drawn = bool(resolutions) and all(
        r.get("status") == "triplet_exists" for r in resolutions
    )
    # error_type 'not_in_text' means the corrector was bypassed entirely, so correction_outcome
    # is None - treat it as the unsupported case.
    unsupported = (outcome == "unsupported") or (error_type == "not_in_text")
    nothing_to_draw = (
        (state.get("correction") == [] and outcome in ("already_represented", "unsupported"))
        or error_type == "not_in_text"
        or all_already_drawn
    )
    
    nothing_to_draw = (state.get("correction") == [] and
                       outcome in ("already_represented", "unsupported")) or all_already_drawn

    if nothing_to_draw:
        agent = llm.with_structured_output(HinterOutput)
        if outcome == "unsupported":
            situation = (
                "The student's edge asserts something the SOURCE TEXT DOES NOT SAY, so there is no "
                "grounded correction to offer - nothing can replace it. Explain what the text actually "
                "does and does not cover on this point, so they can see why their claim has no footing "
                "in it, and suggest they look for a relation the passage does state. Their map does NOT "
                "already contain this fact - do not tell them it is already covered, and do NOT imply "
                "any new connection is being suggested."
            )
        else:
            situation = (
                "The student's edge was wrong, but every connection that would fix it is ALREADY on their map "
                "(often because they drew an existing relation backwards). There is nothing for them to add. "
                "Explain what the text says and why their edge didn't match it, then tell them their map already "
                "covers this correctly, so they can move on to a part of the text they haven't mapped yet. "
                "Do NOT imply any new connection is being suggested."
            )
        prompt = ChatPromptTemplate.from_messages([
            ("system", HINTER_SYSTEM_PROMPT),
            ("human",
             "SITUATION: {situation}\n"
             "Evaluation diagnosis (internal): {eval_diagnosis}\n"
             "Evaluator evidence (what the text says): {eval_evidence}\n"
             "Correction grounding (verbatim source quotes): {correction_grounding}\n"
             "Correction rationale (internal): {correction_rationale}\n"
             "Resolutions: {resolutions}\n"
             "No connections are being suggested. Lead with WHY, grounded in the text. Write 2-3 sentences.")
        ])
        result = agent.invoke(prompt.format_prompt(
            situation=situation,
            eval_diagnosis=state["evaluation_diagnosis"],
            eval_evidence=state.get("evaluation_evidence"),
            correction_grounding=state.get("correction_grounding"),
            correction_rationale=state.get("correction_rationale"),
            resolutions=[
                {"status": r.get("status"), "hint": r.get("action_hint")} for r in resolutions
            ],
        ))
        return {"student_hint": result.student_hint,
                "student_reflection": result.reflection}

    agent = llm.with_structured_output(HinterOutput)
    prompt = ChatPromptTemplate.from_messages([
        ("system", HINTER_SYSTEM_PROMPT),
        ("human",
         "Evaluation diagnosis (internal): {eval_diagnosis}\n"
         "Evaluator evidence (what the text says about this pair): {eval_evidence}\n"
         "Evaluator mediator/near-miss analysis: {near_miss}\n"
         "Correction grounding (verbatim source quotes per connection): {correction_grounding}\n"
         "Correction rationale (internal): {correction_rationale}\n"
         "Resolutions (one per proposed connection): {resolutions}\n"
         "Lead with WHY this was judged the way it was, grounded in the text above, before "
         "explaining the correction.")
    ])
    result = agent.invoke(prompt.format_prompt(
        eval_diagnosis=state["evaluation_diagnosis"],
        eval_evidence=state.get("evaluation_evidence"),
        near_miss=state.get("evaluation_near_miss_check"),
        correction_grounding=state.get("correction_grounding"),
        correction_rationale=state.get("correction_rationale"),
        resolutions=[
            {"status": r.get("status"), "hint": r.get("action_hint")} for r in resolutions
        ],
    ))
    return {"student_hint": result.student_hint,
            "student_reflection": result.reflection}