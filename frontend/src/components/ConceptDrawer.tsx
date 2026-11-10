import type { TextHighlight } from "../types";
import "./ConceptDrawer.css";

export const CONCEPT_DRAG_MIME = "application/x-concept-id";

interface Props {
  concepts: TextHighlight[];
}

export function ConceptDrawer({ concepts }: Props) {
  return (
    <div className="concept-drawer">
      <div className="concept-drawer__title">Concepts</div>
      {concepts.length === 0 ? (
        <div className="concept-drawer__empty">All concepts placed on the canvas.</div>
      ) : (
        <div className="concept-drawer__list">
          {concepts.map((c) => (
            <div
              key={c.id}
              className="concept-drawer__chip"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(CONCEPT_DRAG_MIME, c.id);
                e.dataTransfer.effectAllowed = "move";
              }}
            >
              {c.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
