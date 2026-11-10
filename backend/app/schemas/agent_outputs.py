from typing import Any, Dict, TypedDict, List, Optional, Literal, Tuple
from pydantic import BaseModel, Field

class Node(BaseModel):
    id: str = Field(description="Unique node identifier")
    label: str = Field(description="Primary display text/label for the node")
    resolved_labels: List[str] = Field(
        default_factory=list, 
        description="Canonical aliases, synonyms, or merged node labels linked to this entity"
    )
    metadata: Optional[Dict[str, Any]] = Field(default=None)

class Edge(BaseModel):
    id: Optional[str] = Field(default=None, description="Unique edge identifier")
    source: str = Field(description="ID of the subject node")
    target: str = Field(description="ID of the object node")
    predicate: str = Field(description="Relationship label connecting source and target")


class Triplet(BaseModel):
    subject: str
    predicate: str
    object: str


class EntityMatch(BaseModel):
    is_exact_match: bool = Field(
        description="True ONLY if the candidate term and an existing node are the EXACT SAME concept "
                    "(synonyms, acronym vs expansion, casing or spelling variants). False if they are "
                    "different concepts, or if the candidate is a phrase, process or action that merely "
                    "CONTAINS the node (e.g. 'addiction to social media' is not 'social media')."
    )
    canonical_node: Optional[str] = Field(
        default=None,
        description="The existing node label, copied verbatim including its casing. "
                    "MUST be None if is_exact_match is False."
    )
    reason: str = Field(description="Brief explanation of the decision.")
 
 
class ResolverOutput(BaseModel):
    """Call 1: node-level resolution only. The relation question is asked separately, and only
    when both nodes resolve onto existing labels AND an edge already connects them."""
    subject_resolution: EntityMatch
    object_resolution: EntityMatch
 
 
class RelationMatch(BaseModel):
    """Call 2: does one of the existing edges between these two nodes state the SAME relation?
 
    Only ever asked when Python has already established that the candidate edges connect the
    proposal's own two nodes, so the model cannot match against an unrelated edge that happens to
    share a single node - the failure this two-step split exists to prevent.
    """
    comparison: str = Field(
        description="Compare the proposed relation against each existing edge listed, one by one. For "
                    "each, state whether it asserts the same relation or a genuinely different one, and "
                    "why. Do this before deciding."
    )
    already_exists: bool = Field(
        description="True if one of the listed edges states the SAME relation as the proposal, allowing "
                    "for synonymous predicates ('causes' / 'leads to' / 'results in') and for CONVERSE "
                    "phrasing, where the nodes are swapped AND the predicate inverted so the two cancel "
                    "out ('A is caused by B' is the same claim as 'B causes A'). False when every listed "
                    "edge asserts a genuinely different relation between the same two concepts - two "
                    "nodes can be linked by more than one true relation."
    )
    matching_edge: Optional[Triplet] = Field(
        default=None,
        description="The existing edge the proposal duplicates, copied exactly as listed. "
                    "MUST be None if already_exists is False."
    )


class ResolverOutput(BaseModel):
    subject_resolution: EntityMatch
    object_resolution: EntityMatch


class GroundedClaim(BaseModel):
    """One intended triplet paired with the verbatim text that supports it."""
    intended_triplet: str = Field(
        description="The triplet you intend to emit, written as 'subject -> predicate -> object'."
    )
    source_quote: str = Field(
        description="A VERBATIM, contiguous span copied character-for-character from the Source Text. "
                    "No paraphrase, no ellipses, no tidying. Keep it to the minimum span carrying the "
                    "relation. If no single span supports this triplet, drop the triplet rather than "
                    "inventing a span."
    )


class CorrectorOutput(BaseModel):
    diagnosis_restatement: str = Field(
        description="Restate the evaluator's error in your own words, naming the candidate's exact "
                    "subject and object, and which error it was: reversed direction, skipped mediator "
                    "(which entity), unsupported claim. If you cannot state it in terms of the candidate's own pair, you have "
                    "misread the diagnosis - re-read it before continuing."
    )
    atomic_breakdown: str = Field(
        description="A chained sequence of elementary concepts/relations described in the source text, "
                    "forming the minimal correct representation of this fact."
    )
    source_grounding: List[GroundedClaim] = Field(
        default_factory=list,
        description="One entry per triplet you intend to emit. Produce this BEFORE fixed_triplets: "
                    "quote first, then emit. Empty when no triplets are being emitted."
    )
    coverage_check: str = Field(
        description="Per the CANDIDATE CONTEXT block: which relations in atomic_breakdown does the "
                    "graph ALREADY represent, in either direction or reworded? Name them explicitly. "
                    "Those must not be re-emitted."
    )
    node_reuse_check: str = Field(
        description="Which concepts can reuse existing node labels verbatim, and which require new nodes."
    )
    sense_check: str = Field(
        description="Validation that each triplet in fixed_triplets reads as a true, standalone fact."
    )
    correction_outcome: Literal["fix_provided", "already_represented", "unsupported"] = Field(
        description="'fix_provided' if emitting triplets. 'already_represented' if the correct version "
                    "is already in the graph. 'unsupported' if the source text supports no version of "
                    "this claim. fixed_triplets MUST be empty for the latter two."
    )
    fixed_triplets: List[Triplet] = Field(
        default_factory=list,
        description="The minimal set of correct, connected atomic triplets capturing the flagged fact. "
                    "MUST be empty when correction_outcome is 'already_represented' or 'unsupported'. "
                    "Never invent a triplet just to avoid returning an empty list."
    )
    rationale: str = Field(
        description="INTERNAL note for the hint writer. State what you changed and why, or why no "
                    "change was needed. Technical and precise; the hint writer will translate it."
    )


class HinterOutput(BaseModel):
    reflection: Optional[str] = Field(
        default=None,
        description="One short reflective question for the incorrect/incomplete cases, pointing the "
                    "student at WHAT to reconsider without giving the answer (e.g. 'What does the text "
                    "say actually connects these two - is it direct, or is there a step between?'). "
                    "Null for correct and redundant, where there is nothing to reconsider. Never answer "
                    "your own question here - the explanation goes in student_hint."
    )
    student_hint: str = Field(
        description="The direct explanation shown to the student. Plain and brief: what the text says, "
                    "what was off, what changed. No warm-up phrases, no hedging, no filler. Written from "
                    "scratch in plain language - never a copy of the internal notes."
    )


class MergeGroup(BaseModel):
    """One set of node labels the model confirms denote the same concept."""
    canonical: str = Field(
        description="The label to keep for the merged node - the clearest, most standard full form "
                    "among the members (prefer an expanded name over an acronym when both are present, "
                    "e.g. 'Generative AI' over 'GenAI'). Copy an existing member verbatim; never invent."
    )
    members: List[str] = Field(
        description="Two or more candidate labels that concept_analysis judged to be the SAME concept, "
                    "copied verbatim. Never include a label the analysis flagged as merely related, or "
                    "as a part or instance of another."
    )
    reason: str = Field(description="Brief why these co-refer.")


class ClusterResolution(BaseModel):
    """The model's verdict on one candidate cluster: reasoning first, then zero or more groups."""
    concept_analysis: str = Field(
        description="Before grouping, go through the cluster label by label and state what CONCEPT each "
                    "names. For any two that look mergeable, apply the same-concept test: are they the "
                    "same thing under different words (synonym, acronym/expansion, spelling or casing "
                    "variant) - or is one merely RELATED to, or a PART or INSTANCE of, the other? If one "
                    "label contains another as a sub-phrase, treat them as different concepts unless the "
                    "extra words are purely cosmetic. If a Source Text is provided and it makes the "
                    "referent of an ambiguous pair clear, use it to decide; if it does not, fall back to "
                    "judging the labels by their ordinary meaning. Name which are the same and which only "
                    "look similar, and why, before forming any group."
    )
    groups: List[MergeGroup] = Field(default_factory=list)


class TextJudgmentOutput(BaseModel):
    """Does the SOURCE TEXT support this triplet? Nothing about the student's map."""
    text_relation_kind: str = Field(
        description="Before considering the candidate's predicate at all: what does the SOURCE TEXT "
                    "assert between these two entities? Quote the words that signal it, then name the "
                    "kind - definition (refers to, is, means, is defined as), causal (causes, leads "
                    "to, results in), classificatory (includes, is a type of, such as), part-whole "
                    "(consists of, is part of), correlational (is associated with), or another one that you name if none of the above apply. Read "
                    "this off the text alone. Do not mention the candidate's predicate here."
    )
    claim_check: str = Field(
        description="The kind of relation the text asserts is settled in text_relation_kind - do not "
                    "revise it. State the candidate's predicate and which kind IT names, then say "
                    "whether the two kinds match. Then write the question out - does the text support "
                    "that [subject] [predicate] [object]? - and answer it. A definitional text does "
                    "not support a causal predicate: if the text says X is or refers to Y, X does not "
                    "cause Y, because a thing does not bring about what it already is."
    )
    direction_check: str = Field(
        description="Is the predicate symmetric - does it make the same claim with the entities in "
                    "either order? If so, direction cannot be wrong. If not, say which side of the "
                    "relation the text puts each entity on and check the candidate matches. Swapping "
                    "the entities AND inverting the predicate is not a reversal; they cancel out."
    )
    mediator_in_text: Optional[str] = Field(
        default=None,
        description="If the text puts an entity BETWEEN this subject and object, so a direct link "
                    "would misattribute its action, name it as the text names it. Null when direct."
    )
    is_supported: bool = Field(
        description="False only when the candidate asserts something the text does not: a genuinely "
                    "different entity in a slot, the opposite claim, or a relation the text conveys "
                    "nowhere. Not grounds for False: a mediator, a different name for the same thing, "
                    "a synonymous predicate, converse wording, or a relation carried by structure."
    )
    better_predicate: Optional[str] = Field(
            default=None,
            description="Only when is_supported is True. Does the candidate's predicate claim the relation "
                        "MORE strongly or LESS strongly than the text does? Too strong: the text hedges "
                        "('can help', 'may contribute to', 'is one factor in') and the candidate states it "
                        "flatly ('causes', 'results in'). Too weak: the text is definite ('causes', "
                        "'produces') and the candidate softens it ('is associated with', 'is related to'). "
                        "In either case, give a predicate that carries the text's own force. Null when the "
                        "candidate matches the text's strength, which is most of the time - a different "
                        "word for the same force is not a reason. This is a note, not an error: the "
                        "candidate stays supported."
        )
    text_error: Optional[Literal[
        "not_in_text", "reversed_relation", "wrong_object", "wrong_subject", "wrong_predicate"
    ]] = Field(
        default=None,
        description="Only when is_supported is False. Ask first whether the text relates these two "
                    "entities AT ALL - if not, the answer is 'not_in_text' and no slot comparison "
                    "applies. Otherwise take these in order, stopping at the first that fits: "
                    "'reversed_relation' - the text states this relation the opposite way round with "
                    "the predicate NOT inverted; 'wrong_object' - subject and predicate match, the "
                    "object is a different entity; 'wrong_subject' - predicate and object match, the "
                    "subject is a different entity; 'wrong_predicate' - both entities right, the text "
                    "states a genuinely different relation, not a reworded one. A slot only differs "
                    "when the fillers are different concepts, not the same concept reworded."
    )
    diagnosis: str = Field(
        description="INTERNAL note for the correction agent, never shown to the student. State what "
                    "the text does or does not convey about THIS pair, naming them. Technical."
    )
    
class GraphJudgmentOutput(BaseModel):
    """Where does this triplet sit in the student's VERIFIED graph? Faithfulness is already settled."""
 
    graph_path_check: str = Field(
        description="From the CANDIDATE CONTEXT block: do the candidate's subject and object already "
                    "appear among verified edges? What verified chains pass through them? Does any direct "
                    "or multi-hop path connect subject to object? Report what is there; draw no conclusion "
                    "about whether the triplet is true - that is already settled."
    )
    duplicate_of: Optional[Triplet] = Field(
        default=None,
        description="A VERIFIED edge stating the SAME relation as the candidate - same subject-object pair "
                    "AND same relation, allowing synonyms and reworded predicates. A verified edge between "
                    "the same two nodes with a genuinely DIFFERENT relation is NOT a duplicate. Null if no "
                    "verified edge states this relation."
    )
    predicate_note: Optional[str] = Field(
        default=None,
        description="If it is a duplicate but the candidate's predicate adds a distinct nuance the existing "
                    "edge lacks, note it here."
    )
    mediator_is_covered: bool = Field(
        description="Only meaningful when a mediator was found in the text (given to you as MEDIATOR IN "
                    "TEXT). True if that SPECIFIC entity is already represented on a verified path leading "
                    "into the candidate's subject - meaning the student built the chain properly and the "
                    "direct edge is fine. False if it is absent, or if the verified edge into the subject "
                    "is a different relation than the mediating step the text describes. False when no "
                    "mediator was given."
    )
    graph_note: str = Field(
        description="INTERNAL one-liner summarising how this triplet relates to the verified graph."
    )

class GapArea(BaseModel):
    """One part of the source text the map does not represent yet."""
    source_span: str = Field(
        description="A VERBATIM, contiguous span copied character-for-character from the Source Text "
                    "marking where this gap is. No paraphrase, no ellipses, no tidying. Keep it short - "
                    "the clause or sentence carrying the unmapped content, not the whole paragraph."
    )
    area: str = Field(
        description="The part of the passage this gap covers, named in plain language the student "
                    "can find in the text - a short phrase, not a quote of the whole sentence."
    )
    nudge: str = Field(
        description="One short line pointing them at that part of the text. Say what is unmapped, "
                    "NOT what to draw: name the region, never the connection. 'The bit about what "
                    "traps the heat isn't on your map yet' - not 'add greenhouse gases traps heat'. "
                    "Direct and human, like a TA glancing at their screen."
    )


class GapAnalysisOutput(BaseModel):
    """Reasoning first, then the gaps - declaration order is generation order."""
    coverage_review: str = Field(
        description="Walk the passage and state, in your own words, which of its facts the student's "
                    "connections already represent and which they do not. Match by MEANING, not "
                    "wording: an edge counts as covering a fact even if it words it differently. Be "
                    "honest about partial coverage - a fact touched by one edge but not finished is "
                    "still partly covered."
    )
    gaps: List[GapArea] = Field(
        default_factory=list,
        description="The unmapped parts, most substantial first. At most 3 - this is a nudge, not a "
                    "checklist. Empty when the map already covers the passage's main content."
    )
    overall: str = Field(
        description="One line to the student about where their map stands overall. If they have "
                    "covered everything, say so plainly and stop."
    )


class ExtractedConcept(BaseModel):
    """One concept found in the highlighted span, ready to become a node."""
    label: str = Field(
        description="The concept as a node label: a short noun or gerund phrase. Never a clause with "
                    "its own verb, never a full relation. Strip articles and connectives. Keep a phrase "
                    "WHOLE when its parts only mean the right thing together, but split out any entity "
                    "that exists in its own right and could carry its own connections elsewhere."
    )
    source_span: str = Field(
        description="The words from the span this concept comes from. Normally the same as the label; "
                    "may differ when the label reorders them into a natural node name."
    )
 
 
class SegmenterOutput(BaseModel):
    """Reasoning FIRST - declaration order is generation order, and the segmentation decision has to
    be reasoned about before the list exists, since the list already encodes where the boundaries fell."""
    segmentation_reasoning: str = Field(
        description="Before listing anything, say how you are splitting this text and why - which "
                    "phrases are single concepts that must stay whole, and where a genuine boundary "
                    "between two separate concepts falls. Name any noun you split out as its own "
                    "concept and any phrase you kept intact, with the reason for each."
    )
    concepts: List[ExtractedConcept] = Field(
        default_factory=list,
        description="Every distinct concept in the span, in the order they appear. Empty if the span "
                    "carries no mappable concept."
    )


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


class ChatRequest(BaseModel):
    message: str
    history: List[Dict[str, str]] = Field(default_factory=list)  # [{role, content}]

class ChatResponse(BaseModel):
    answer: str
    classification: Dict[str, Any]


class EdgeEvaluation(BaseModel):
    """One edge's verdict from the batch pass."""
 
    edge_index: int = Field(
        description="The index of the edge being evaluated, matching the input list exactly."
    )
    verdict: Literal["correct", "incorrect"] = Field(
        description="'correct' if the relationship is stated, explicitly or implicitly, or"
                    "unambiguously inferable from the text Check the direction and kind before marking correct."
                    "'incorrect' if it contradicts the text, reverses direction, misstates the relation, or " \
                    "relates two concepts the text does not connect. "
    )
    confidence: float = Field(
        ge=0.0, le=1.0,
        description="Confidence in this verdict, 0-1."
    )
    text_grounded: str = Field(
        description="When the verdict is 'correct': the VERBATIM span of the reference text that "
                    "grounds this edge, copied character for character - no paraphrase, no ellipses. "
                    "Quote the heading or the definition line when that is what carries the relation. "
                    "When the verdict is 'incorrect': the single word 'unsupported'."
    )
    justification: str = Field(
        description="1-3 sentences explaining the verdict, paraphrasing the relevant part of the text "
                    "rather than quoting it. Mention clause-splitting, duplication, or contradiction "
                    "with other edges when relevant."
    )
    suggested_correction: str = Field(
        description="When incorrect: first check whether the text supports a corrected version of "
                    "this edge. If it does, write it as 'subject --[relation]--> object' and verify "
                    "it holds before including it - if it does not hold on reflection, fall back to "
                    "short guidance. If the text supports nothing close to this edge, write short "
                    "guidance only. Empty string when correct."
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