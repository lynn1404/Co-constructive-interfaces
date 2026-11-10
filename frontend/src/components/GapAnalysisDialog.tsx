import "./GapAnalysisDialog.css";
import type { SimpleGapItem } from "../types";

interface Props {
  gaps: SimpleGapItem[];
  overall: string;
  onClose: () => void;
}

export function GapAnalysisDialog({ gaps, overall, onClose }: Props) {
  return (
    <div className="gap-analysis-overlay" onClick={onClose}>
      <div className="gap-analysis-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="gap-analysis-dialog__header">
          <span className="gap-analysis-dialog__title">Gap analysis</span>
          <button className="gap-analysis-dialog__close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <p className="gap-analysis-dialog__overall">{overall}</p>

        <div className="gap-analysis-dialog__list">
          {gaps.length === 0 && (
            <div className="gap-analysis-dialog__empty">No gaps found — your map covers the passage.</div>
          )}
          {gaps.map((gap, i) => (
            <div className="gap-analysis-item" key={i}>
              <div className="gap-analysis-item__area">{gap.idea}</div>
              <p className="gap-analysis-item__nudge">{gap.placement}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
