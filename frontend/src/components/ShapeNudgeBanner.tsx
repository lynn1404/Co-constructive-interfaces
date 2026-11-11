import type { ChatClassification, MappableShape, ShapeSuggestion } from "../types";

const SHAPE_LABELS: Record<MappableShape, string> = {
  concept_map: "Concept map",
  comparison: "Compare",
  flowchart: "Flowchart",
  sequence: "Sequence",
};

interface Props {
  classification: ChatClassification;
  onOpenCanvas: () => void;
  onDismiss: () => void;
}

/** Banner under a mappable chat answer, inviting the student to rebuild it as a diagram. */
export function ShapeNudgeBanner({ classification, onOpenCanvas, onDismiss }: Props) {
  const { shapes } = classification;
  const primary = shapes.find((s) => s.shape === classification.primary) ?? shapes[0];
  const others = shapes.filter((s) => s !== primary);

  // only concept maps can be built today; the other shapes are shown but disabled
  const shapeButton = (shape: ShapeSuggestion) => (
    <button
      className="chat-shape-banner__button"
      disabled={shape.shape !== "concept_map"}
      title={shape.shape !== "concept_map" ? "Not supported yet" : shape.reason}
      onClick={onOpenCanvas}
    >
      {SHAPE_LABELS[shape.shape]}
    </button>
  );

  return (
    <div className="chat-shape-banner">
      <span className="chat-shape-banner__dot" aria-hidden="true" />
      <div className="chat-shape-banner__text">
        <p className="chat-shape-banner__title">
          Looks like you're building your understanding on something new.
        </p>
        <p className="chat-shape-banner__body">
          AI answers can be mistaken for genuine understanding, try reworking the ideas yourself.
        </p>
      </div>
      <div className="chat-shape-banner__actions">
        {primary && shapeButton(primary)}
        {others.length === 1 && shapeButton(others[0])}
        {others.length > 1 && (
          <button
            className="chat-shape-banner__button"
            title={others.map((s) => SHAPE_LABELS[s.shape]).join(", ")}
            onClick={onOpenCanvas}
          >
            More
          </button>
        )}
        <button className="chat-shape-banner__close" title="Dismiss" onClick={onDismiss}>
          ×
        </button>
      </div>
    </div>
  );
}
