import re

from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI

from app.prompts import SHAPE_CLASSIFIER_SYSTEM_PROMPT
from app.schemas import ShapeClassification
from app.utils.timing import log_timing, logger

MIN_WORDS = 60


def _strip_decoration(text: str) -> str:
    """Remove styling that carries no meaning. Headers and list markers are deliberately KEPT - a
    header with items under it, or repeated parallel labels, often carry the structure itself."""
    text = re.sub(r"[\U0001F300-\U0001FAFF\u2600-\u27BF]", " ", text)   # emoji
    text = re.sub(r"\*\*|__|~~|`", "", text)                             # bold/italic/strike/inline code
    return text


def _prefilter(answer: str) -> str | None:
    """Cheap reject, no model call. Returns a reason when the answer is not worth classifying."""
    if not answer or not answer.strip():
        return "empty answer"
    words = len(_strip_decoration(answer).split())
    if words < MIN_WORDS:
        return f"too short ({words} words)"
    return None


def _derive(result: ShapeClassification) -> tuple:
    """Filter to substantive shapes, primary first.
 
    The model can nominate a primary it also judged too thin; the substantive filter wins.
    """
    worth = [s for s in result.available_shapes if s.is_substantive]
    if not worth:
        return False, [], ("structure is too slight to be worth drawing"
                           if result.available_shapes else "no diagrammable structure")
    primary = next((s for s in worth if s.shape == result.primary_shape), None)
    if primary is not None:
        worth = [primary] + [s for s in worth if s is not primary]
    return True, worth, worth[0].reason

@log_timing
async def classify_shape(answer: str, user_prompt: str | None = None) -> dict:
    """Decide whether an assistant answer is worth rebuilding as a diagram, and which shapes fit.
 
    Two gates, cheap first: a length prefilter with no model call, then one call that judges purpose
    and shape. The knowledge gate is global and comes before shape, because it cuts ACROSS shape
    rather than along it - a recipe and an explanation of photosynthesis are both processes, and only
    one is worth a diagram.
 
    Returns shapes in preference order, primary first. Only concept_map is rendered today; the other
    three are returned so the data exists on which to decide what to build next.
 
    Returns {"is_mappable", "shapes": [{shape, reason}], "primary", "reason", "gated_by",
             "is_knowledge"} plus two internal fields.
    """
    rejected = _prefilter(answer)
    if rejected:
        logger.info(f"classify_shape: prefilter rejected - {rejected}")
        return {"is_mappable": False, "shapes": [], "primary": None, "reason": rejected,
                "gated_by": "prefilter", "is_knowledge": None, "purpose": None, "analysis": None}

    agent = ChatOpenAI(model="gpt-4o-mini", temperature=0).with_structured_output(ShapeClassification)
    prompt = ChatPromptTemplate.from_messages([
        ("system", SHAPE_CLASSIFIER_SYSTEM_PROMPT),
        ("human",
         "The user asked:\n{user_prompt}\n\n"
         "The assistant answered:\n{answer}\n\n"
         "Is this worth diagramming, and which shapes fit?")
    ])
    result = await agent.ainvoke(prompt.format_prompt(
        user_prompt=user_prompt or "(not provided)",
        answer=_strip_decoration(answer),
    ))

    if not result.is_knowledge_content:
        logger.info("classify_shape: rejected as task content, not knowledge")
        return {
            "is_mappable": False, "shapes": [], "primary": None,
            "reason": "this is a task or set of instructions, not material for understanding a subject",
            "gated_by": "knowledge", "is_knowledge": False,
            "purpose": result.purpose_check, "analysis": result.shape_reasoning,
        }

    mappable, worth, why = _derive(result)
    logger.info(
        f"classify_shape: mappable={mappable} primary={worth[0].shape if worth else None} "
        f"shapes={[s.shape for s in worth]}"
    )
    return {
        "is_mappable": mappable,
        "shapes": [{"shape": s.shape, "reason": s.reason} for s in worth],
        "primary": worth[0].shape if worth else None,
        "reason": why,
        "gated_by": None if mappable else "shape",
        "is_knowledge": True,
        "purpose": result.purpose_check,      # INTERNAL - not for display
        "analysis": result.shape_reasoning,   # INTERNAL - not for display
    }
