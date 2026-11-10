from langgraph.graph import StateGraph, END
from app.schemas import GraphState
from app.agents import evaluator_node, corrector_node, resolver_node, hinter_node
from app.graph.router import route_after_evaluator


workflow = StateGraph(GraphState)

workflow.add_node("evaluator", evaluator_node)
workflow.add_node("corrector", corrector_node)
workflow.add_node("resolver", resolver_node)
workflow.add_node("hinter", hinter_node)

workflow.set_entry_point("evaluator")

workflow.add_conditional_edges(
    "evaluator",
    route_after_evaluator,
    {
        "corrector": "corrector",
        "resolver": "resolver"
    }
)

workflow.add_edge("corrector", "resolver")
workflow.add_edge("resolver", "hinter")
workflow.add_edge("hinter", END)

pipeline_graph = workflow.compile()