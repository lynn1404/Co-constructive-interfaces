from app.schemas import GraphState

def route_after_evaluator(state: GraphState) -> str:
    """
    Inspects the evaluator output and determines the next node.
    - If 'incorrect' or 'incomplete': proceeds to 'corrector'.
    - If 'correct' or 'redundant': bypasses 'corrector' directly to 'resolver'.
    """
    status = state.get("evaluation_status")
    if status in ["incorrect", "incomplete"]:
        if state.get("evaluation_error_type") == "not_in_text":
            return "resolver"
        return "corrector"
    return "resolver"