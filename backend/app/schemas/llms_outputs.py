from typing import Optional, Literal, List

from pydantic import BaseModel, Field


class ShapeOption(BaseModel):
    """One diagram shape that could represent this answer."""
    shape: Literal["comparison", "concept_map", "flowchart", "sequence"]
    is_substantive: bool = Field(
        description="Would a student actually learn from building THIS shape of this answer? An "
                    "answer can support a shape technically while being too thin to be worth drawing "
                    "that way."
    )
    reason: str = Field(description="One line: what this shape would help them see.")


class ShapeClassification(BaseModel):
    purpose_check: str = Field(
        description="Is this answer EXPLAINING how something works or how ideas relate, or is it "
                    "INSTRUCTING the reader how to do something? Quote the giveaway."
    )
    is_knowledge_content: bool = Field(
        description="True only if the answer's purpose is to build UNDERSTANDING of a subject. False "
                    "for anything meant to get a task done: recipes, install guides, troubleshooting, "
                    "tool instructions, code, tips, recommendations."
    )
    shape_reasoning: str = Field(
        description="Take each of the four shapes in turn and say whether this answer could be drawn "
                    "that way, with evidence rather than a verdict: for a flowchart quote the "
                    "conditions, for a comparison name the shared aspects. Several may fit at once."
    )
    available_shapes: List[ShapeOption] = Field(
        default_factory=list,
        description="Every shape that genuinely fits, not just the best one. Empty when none do."
    )
    primary_shape: Optional[Literal["comparison", "concept_map", "flowchart", "sequence"]] = Field(
        default=None,
        description="Of the shapes you listed, the one that would teach the most if the student built "
                    "it themselves. Judge by what drawing it forces them to work out, not by which "
                    "matches the answer's layout. Null when no shape fits."
    )

class EdgeEvaluation(BaseModel):
    """One edge's verdict from the batch pass. Fields are generated in declaration order:
    evidence and reasoning first, verdict after."""

    edge_index: int = Field(
        description="The index of the edge being evaluated, matching the input list exactly."
    )
    text_grounded: str = Field(
        description="The VERBATIM span of the reference text most relevant to this edge, copied "
                    "character for character - no paraphrase, no ellipses. Quote the heading or the "
                    "definition line when that is what carries the relation. The single word "
                    "'unsupported' only if the text never relates these two concepts."
    )
    justification: str = Field(
        description="1-3 sentences explaining the verdict, paraphrasing the relevant part of the text "
                    "rather than quoting it. Mention clause-splitting, duplication, or contradiction "
                    "with other edges when relevant."
    )
    verdict: Literal["correct", "incorrect"] = Field(
        description="'correct' if the relationship is stated explicitly or implicitly, or is "
                    "unambiguously inferable from the text. Check the direction and relation kind "
                    "before marking correct. 'incorrect' if it contradicts the text, reverses "
                    "direction, misstates the relation, or relates two concepts the text does not "
                    "connect."
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Confidence in this verdict, 0-1."
    )
    suggested_correction: str = Field(
        description="When incorrect: first check whether the text supports a corrected version of "
                    "this edge. If it does, write it as 'subject --[relation]--> object' and verify "
                    "it holds before including it. If it does not hold, or the text supports nothing "
                    "close to this edge, write a one-sentence hint instead, with no label or prefix. "
                    "Empty string when correct."
    )

 
 
class MapEvaluation(BaseModel):
    evaluations: List[EdgeEvaluation] = Field(
        description="Exactly one evaluation per input edge index - no more, no fewer."
    )


class MergeGroup(BaseModel):
    members: List[str] = Field(
        description="Two or more labels that refer to the SAME concept, copied verbatim."
    )
    reason: str = Field(description="One line on why these co-refer.")


class NodeResolution(BaseModel):
    concept_analysis: str = Field(
        description="Go through the labels and state what concept each names. For any two that "
                    "look similar, apply the same-concept test: same thing under different words, "
                    "or merely related/containing? Name which are the same and why."
    )
    groups: List[MergeGroup] = Field(
        default_factory=list,
        description="Each set of co-referring labels. Empty when nothing should merge."
    )


class Gap(BaseModel):
    idea: str = Field(
        description="The missing idea in plain language - what the text says that the map does not "
                    "capture yet. Name the REGION to explore, not the connection to draw: "
                    "'how deforestation affects the carbon cycle' not 'deforestation reduces carbon "
                    "sequestration'. The student must go back to the text and work it out."
    )
    placement: str = Field(
        description="Where in the text this idea lives: the section heading, paragraph label, or "
                    "bullet group - e.g. 'paragraph 2', 'under \"Causes of cognitive fatigue\"', "
                    "'the third bullet under Effects'. Be specific enough that the student can find "
                    "it without searching the whole text."
    )


class GapAnalysis(BaseModel):
    coverage_review: str = Field(
        description="Walk the text section by section and say which ideas the verified map already "
                    "covers and which it does not. Match by meaning, not wording. Be honest about "
                    "partial coverage - a concept touched by one edge but not developed is "
                    "partially covered, not missing."
    )
    gaps: List[Gap] = Field(
        default_factory=list,
        description="The most substantial missing ideas, up to 5. Most important first. Empty when "
                    "the map covers the text's main content."
    )
    overall: str = Field(
        description="One line to the student on where their map stands overall."
    )


class ExtractedConcept(BaseModel):
    label: str = Field(
        description="The concept as a node label. Can be a noun phrase, a gerund phrase, or any "
                    "short expression that names one idea — part of speech does not matter. "
                    "Paraphrase and compress where it makes a cleaner label: 'the process of "
                    "monitoring one's own thinking' becomes 'monitoring one's own thinking'. "
                    "1-6 words; never a full clause with its own subject and verb."
    )
    source_span: str = Field(
        description="The words from the highlighted span this concept comes from. May differ from "
                    "the label when the label paraphrases or converts to gerund form."
    )
 
 
class SimpleSegmenterOutput(BaseModel):
    """Reasoning FIRST — the segmentation decision happens before the list exists."""
    segmentation_reasoning: str = Field(
        description="Before listing anything: which phrases from the span are single concepts that "
                    "stay whole, and which split into separate concepts? Say why for any non-obvious "
                    "decision. Conjunctions often split; qualifiers that change the meaning stay "
                    "attached; relation words ('such as', 'which', 'leads to') are not concepts."
    )
    concepts: List[ExtractedConcept] = Field(
        default_factory=list,
        description="Every distinct concept from the span, in the order they appear. Empty when the "
                    "span carries no mappable concept."
    )