import { useEffect, useRef, useState } from "react";

import type { HighlightMode } from "../types";

interface Props {
  restrictedLinks: boolean;
  setRestrictedLinks: (value: boolean) => void;
  highlightMode: HighlightMode;
  setHighlightMode: (mode: HighlightMode) => void;
  hideTextAfterExtraction: boolean;
  setHideTextAfterExtraction: (value: boolean) => void;
  extractionDone: boolean;
}

/** The ⚙ button and its dropdown of canvas settings. Closes on an outside click or Escape. */
export function SettingsMenu({
  restrictedLinks,
  setRestrictedLinks,
  highlightMode,
  setHighlightMode,
  hideTextAfterExtraction,
  setHideTextAfterExtraction,
  extractionDone,
}: Props) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div className="source-panel__settings" ref={menuRef}>
      <button
        className={`source-panel__settings-btn ${open ? "source-panel__settings-btn--active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="Settings"
        aria-label="Settings"
        aria-expanded={open}
      >
        ⚙
      </button>

      {open && (
        <div className="source-panel__settings-panel" role="menu">
          <div className="source-panel__settings-header">
            <span>Settings</span>
            <button
              className="source-panel__settings-close"
              onClick={() => setOpen(false)}
              aria-label="Close settings"
              title="Close"
            >
              ✕
            </button>
          </div>

          <div className="source-panel__settings-section">
            <div className="source-panel__settings-section-title">Edge labels</div>
            <label
              className="source-panel__toggle-row"
              title="When on, new edges are labeled by picking from a category and link list. When off, edges get a free-text label."
            >
              <span className="source-panel__toggle-row-text">
                <span className="source-panel__toggle-row-label">Labels from categories</span>
                <span className="source-panel__toggle-row-desc">
                  Pick edge labels from a category list instead of typing free text
                </span>
              </span>
              <span className={`source-panel__switch ${restrictedLinks ? "source-panel__switch--on" : ""}`}>
                <input
                  type="checkbox"
                  checked={restrictedLinks}
                  onChange={(e) => setRestrictedLinks(e.target.checked)}
                />
                <span className="source-panel__switch-track">
                  <span className="source-panel__switch-thumb" />
                </span>
              </span>
            </label>
          </div>

          <div className="source-panel__settings-section">
            <div className="source-panel__settings-section-title">Highlight mode</div>
            <div className="source-panel__mode-toggle" role="radiogroup" aria-label="Highlight mode">
              <label className="source-panel__radio-row">
                <input
                  type="radio"
                  name="highlight-mode"
                  checked={highlightMode === "concepts"}
                  onChange={() => setHighlightMode("concepts")}
                />
                <span>
                  <span className="source-panel__toggle-row-label">Highlight concepts</span>
                  <span className="source-panel__toggle-row-desc">
                    Each highlighted span becomes its own node
                  </span>
                </span>
              </label>
              <label
                className="source-panel__radio-row"
                title="Select a span of text; on release it's sent for concept segmentation, and each returned concept becomes its own node"
              >
                <input
                  type="radio"
                  name="highlight-mode"
                  checked={highlightMode === "phrases"}
                  onChange={() => setHighlightMode("phrases")}
                />
                <span>
                  <span className="source-panel__toggle-row-label">Highlight phrases</span>
                  <span className="source-panel__toggle-row-desc">
                    Selected text is auto-segmented into multiple concept nodes
                  </span>
                </span>
              </label>
            </div>
          </div>

          <div className="source-panel__settings-section">
            <div className="source-panel__settings-section-title">Source text</div>
            <label
              className="source-panel__toggle-row"
              title="When on, click Done after highlighting to hide the source text and move extracted concepts into a drawer to build the map from scratch"
            >
              <span className="source-panel__toggle-row-text">
                <span className="source-panel__toggle-row-label">Hide text after extraction</span>
                <span className="source-panel__toggle-row-desc">
                  Move extracted concepts into a drawer and build the map from scratch
                </span>
              </span>
              <span
                className={`source-panel__switch ${hideTextAfterExtraction ? "source-panel__switch--on" : ""} ${extractionDone ? "source-panel__switch--disabled" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={hideTextAfterExtraction}
                  disabled={extractionDone}
                  onChange={(e) => setHideTextAfterExtraction(e.target.checked)}
                />
                <span className="source-panel__switch-track">
                  <span className="source-panel__switch-thumb" />
                </span>
              </span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
