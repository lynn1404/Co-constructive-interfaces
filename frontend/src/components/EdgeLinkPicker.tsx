import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { LINK_CATEGORIES } from "../data/linkCategories";
import "./EdgeLinkPicker.css";

interface EdgeLinkPickerProps {
  anchor: { x: number; y: number };
  sourceLabel: string;
  targetLabel: string;
  onSubmit: (link: string) => void;
  onClose: () => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
}

export function EdgeLinkPicker({ anchor, sourceLabel, targetLabel, onSubmit, onClose }: EdgeLinkPickerProps) {
  const [position, setPosition] = useState(anchor);
  const [category, setCategory] = useState<string | null>(null);
  const [customLink, setCustomLink] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // capture phase: fires before React Flow's own pane/node handlers can
    // stop the event from bubbling, so outside clicks reliably close this.
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [onClose]);

  function handleDragStart(e: React.PointerEvent<HTMLDivElement>) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      baseX: position.x,
      baseY: position.y,
    };
  }

  function handleDragMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = dragState.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    setPosition({
      x: drag.baseX + (e.clientX - drag.startX),
      y: drag.baseY + (e.clientY - drag.startY),
    });
  }

  function handleDragEnd(e: React.PointerEvent<HTMLDivElement>) {
    if (dragState.current?.pointerId === e.pointerId) {
      dragState.current = null;
    }
  }

  return createPortal(
    <div
      ref={rootRef}
      className="edge-link-picker nodrag nopan nowheel"
      style={{ transform: `translate(-50%, 0) translate(${position.x}px, ${position.y}px)` }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="edge-link-picker__header">
        <div
          className="edge-link-picker__handle"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          title="Drag to move"
        >
          ⠿⠿⠿
        </div>
        {category === null ? (
          <div className="edge-link-picker__title">
            <p>How is the relation between <strong>{sourceLabel}</strong> and <strong>{targetLabel}</strong> best described?</p>
          </div>
        ) : (
          <div className="edge-link-picker__title">
            <button
              type="button"
              className="edge-link-picker__back"
              onClick={() => setCategory(null)}
              title="Back to categories"
            >
              ←
            </button>
            {category}
          </div>
        )}
      </div>
      <div className="edge-link-picker__scroll">
        {customLink !== null ? (
          <form
            className="edge-link-picker__custom-form"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = customLink.trim();
              if (trimmed) onSubmit(trimmed);
            }}
          >
            <input
              autoFocus
              type="text"
              className="edge-link-picker__custom-input"
              placeholder="Type your own relation…"
              value={customLink}
              onChange={(e) => setCustomLink(e.target.value)}
            />
            <div className="edge-link-picker__custom-actions">
              <button
                type="button"
                className="edge-link-picker__back"
                onClick={() => setCustomLink(null)}
              >
                ← Back to list
              </button>
              <button
                type="submit"
                className="edge-link-picker__custom-submit"
                disabled={!customLink.trim()}
              >
                Use this
              </button>
            </div>
          </form>
        ) : category === null ? (
          <div className="edge-link-picker__list">
            {LINK_CATEGORIES.map((cat) => (
              <button
                key={cat.name}
                type="button"
                className="edge-link-picker__option edge-link-picker__option--category"
                onClick={() => setCategory(cat.name)}
              >
                <span className="edge-link-picker__category-name">{cat.name}</span>
                <span className="edge-link-picker__category-examples">
                  e.g. {cat.links.slice(0, 3).join(", ")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="edge-link-picker__list">
            {LINK_CATEGORIES.find((c) => c.name === category)?.links.map((link) => (
              <button
                key={link}
                type="button"
                className="edge-link-picker__option"
                onClick={() => onSubmit(link)}
              >
                {link}
              </button>
            ))}
          </div>
        )}
      </div>
      {customLink === null && (
        <div className="edge-link-picker__footer">
          <button
            type="button"
            className="edge-link-picker__option edge-link-picker__option--custom"
            onClick={() => setCustomLink("")}
          >
            ✎ None of these — type my own
          </button>
        </div>
      )}
    </div>,
    document.body
  );
}
