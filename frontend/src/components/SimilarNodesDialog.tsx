import "./SimilarNodesDialog.css";
import type { SimilarNodeGroup } from "../types";

interface Props {
  groups: SimilarNodeGroup[];
  onClose: () => void;
}

export function SimilarNodesDialog({ groups, onClose }: Props) {
  return (
    <div className="similar-nodes-overlay" onClick={onClose}>
      <div className="similar-nodes-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="similar-nodes-dialog__header">
          <span className="similar-nodes-dialog__title">Similar nodes</span>
          <button className="similar-nodes-dialog__close" onClick={onClose} title="Close">
            ✕
          </button>
        </div>

        <p className="similar-nodes-dialog__note">
          These are suggestions only — nothing on the canvas has been changed. Merge manually if you agree.
        </p>

        <div className="similar-nodes-dialog__list">
          {groups.length === 0 && (
            <div className="similar-nodes-dialog__empty">No similar nodes found.</div>
          )}
          {groups.map((group, i) => (
            <div className="similar-nodes-group" key={i}>
              <div className="similar-nodes-group__members">
                {group.members.map((m, j) => (
                  <span key={j} className="similar-nodes-group__chip">
                    {m}
                  </span>
                ))}
              </div>
              <p className="similar-nodes-group__reason">{group.reason}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
