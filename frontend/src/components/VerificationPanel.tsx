import { useEffect, useRef, useState } from "react";
import "./VerificationPanel.css";
import type { StudentVerificationEntry } from "../types";

export interface PanelEntry {
  edgeId: string;
  subject: string;
  predicate: string;
  object: string;
  verification: StudentVerificationEntry | null;
}

interface Props {
  entries: PanelEntry[];
  focusEdgeId: string | null;
  summary: Record<string, number> | null;
  onClose: () => void;
  onEntryClick?: (edgeId: string) => void;
  onConfirmCorrect?: (edgeId: string) => void;
}

const ERROR_TYPE_LABELS: Record<string, string> = {
  not_in_text: "not in text",
  contradicts_text: "contradicts text",
  reversed_relation: "reversed relation",
  skipped_mediator: "skipped a step",
  duplicate: "duplicate",
  unfinished_process: "unfinished process",
};

export function statusLabel(entry: PanelEntry["verification"]): { text: string; className: string } {
  if (!entry) return { text: "not yet verified", className: "verification-card__badge--pending" };
  if (entry.state === "blocked") return { text: "blocked", className: "verification-card__badge--blocked" };
  if (entry.state === "verified") return { text: "correct", className: "verification-card__badge--correct" };
  switch (entry.status) {
    case "incorrect":
      return { text: "Worth another check", className: "verification-card__badge--worth-check" };
    case "incomplete":
      return { text: "incomplete", className: "verification-card__badge--incomplete" };
    case "redundant":
      return { text: "redundant", className: "verification-card__badge--redundant" };
    default:
      return { text: "not yet verified", className: "verification-card__badge--pending" };
  }
}

export function VerificationPanel({
  entries,
  focusEdgeId,
  summary,
  onClose,
  onEntryClick,
  onConfirmCorrect,
}: Props) {
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const panelRef = useRef<HTMLDivElement>(null);
  const [expandedHints, setExpandedHints] = useState<Set<string>>(new Set());

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (panelRef.current && !panelRef.current.contains(target)) {
        // the panel's own open/close toggle button handles itself — don't fight it
        if (target instanceof Element && target.closest(".verification-toggle-btn")) return;
        onClose();
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [onClose]);

  const toggleHint = (edgeId: string) => {
    setExpandedHints((prev) => {
      const next = new Set(prev);
      if (next.has(edgeId)) next.delete(edgeId);
      else next.add(edgeId);
      return next;
    });
  };

  useEffect(() => {
    if (!focusEdgeId) return;
    const el = cardRefs.current.get(focusEdgeId);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusEdgeId]);

  return (
    <div className="verification-panel" ref={panelRef}>
      <div className="verification-panel__header">
        <span className="verification-panel__title">Graph verification</span>
        <button className="verification-panel__close" onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      {summary && (
        <div className="verification-panel__summary">
          <span>✓ {summary.verified ?? 0} verified</span>
          <span>⚑ {summary.flagged ?? 0} flagged</span>
          <span>⛔ {summary.blocked ?? 0} blocked</span>
        </div>
      )}

      <div className="verification-panel__list">
        {entries.length === 0 && (
          <div className="verification-panel__empty">No triplets on the graph yet.</div>
        )}
        {entries.map((entry) => {
          const badge = statusLabel(entry.verification);
          return (
            <div
              key={entry.edgeId}
              ref={(el) => {
                if (el) cardRefs.current.set(entry.edgeId, el);
                else cardRefs.current.delete(entry.edgeId);
              }}
              className={`verification-card ${entry.edgeId === focusEdgeId ? "verification-card--focused" : ""} ${onEntryClick ? "verification-card--clickable" : ""}`}
              onClick={onEntryClick ? () => onEntryClick(entry.edgeId) : undefined}
            >
              <div className="verification-card__row">
                <span className="verification-card__triplet">
                  {entry.subject} <span className="verification-card__arrow">→</span> {entry.predicate}{" "}
                  <span className="verification-card__arrow">→</span> {entry.object}
                </span>
                <span className="verification-card__badge-group">
                  {entry.verification?.status === "incorrect" && entry.verification.error_type && (
                    <span className="verification-card__error-type">
                      {ERROR_TYPE_LABELS[entry.verification.error_type] ?? entry.verification.error_type}
                    </span>
                  )}
                  <span className={`verification-card__badge ${badge.className}`}>{badge.text}</span>
                </span>
              </div>

              {!entry.verification && (
                <p className="verification-card__placeholder">Run "Verify Graph" to check this connection.</p>
              )}

              {entry.verification && entry.verification.state !== "verified" && onConfirmCorrect && (
                <button
                  type="button"
                  className="verification-card__confirm-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onConfirmCorrect(entry.edgeId);
                  }}
                >
                  Confirm as correct
                </button>
              )}

              {entry.verification?.reflection ? (
                <div className="verification-card__reflection">
                  <p className="verification-card__reflection-question">🤔 {entry.verification.reflection}</p>
                  {expandedHints.has(entry.edgeId) ? (
                    <>
                      {entry.verification.hint && (
                        <p className="verification-card__hint">{entry.verification.hint}</p>
                      )}
                      {entry.verification.suggested_triplets &&
                        entry.verification.suggested_triplets.length > 0 && (
                          <div className="verification-card__suggestions">
                            <div className="verification-card__suggestions-title">Suggested:</div>
                            <ul>
                              {entry.verification.suggested_triplets.map((t, i) => (
                                <li key={i}>
                                  {t.subject} <span className="verification-card__arrow">→</span>{" "}
                                  {t.predicate} <span className="verification-card__arrow">→</span> {t.object}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                    </>
                  ) : (
                    <button
                      type="button"
                      className="verification-card__hint-toggle"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleHint(entry.edgeId);
                      }}
                    >
                      See hint
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {entry.verification?.hint && (
                    <p className="verification-card__hint"> {entry.verification.hint}</p>
                  )}
                  {entry.verification?.suggested_triplets &&
                    entry.verification.suggested_triplets.length > 0 && (
                      <div className="verification-card__suggestions">
                        <div className="verification-card__suggestions-title">Suggested:</div>
                        <ul>
                          {entry.verification.suggested_triplets.map((t, i) => (
                            <li key={i}>
                              {t.subject} <span className="verification-card__arrow">→</span> {t.predicate}{" "}
                              <span className="verification-card__arrow">→</span> {t.object}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
