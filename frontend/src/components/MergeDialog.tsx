import { useState } from "react";
import type { Node } from "@xyflow/react";
import "./MergeDialog.css";

interface Props {
  nodes: Node[];
  onCancel: () => void;
  onConfirm: (mainLabel: string) => void;
}

export function MergeDialog({ nodes, onCancel, onConfirm }: Props) {
  const labels = nodes.map((n) => n.data.label as string);
  const [chosenLabel, setChosenLabel] = useState(labels[0] ?? "");

  return (
    <div className="merge-dialog-overlay">
      <div className="merge-dialog">
        <div className="merge-dialog__eyebrow">Merge {nodes.length} nodes</div>
        <div className="merge-dialog__preview">{labels.join(" + ")}</div>

        <input
          className="merge-dialog__input"
          value={chosenLabel}
          onChange={(e) => setChosenLabel(e.target.value)}
        />

        <div className="merge-dialog__actions">
          <button
            className="merge-dialog__confirm"
            onClick={() => chosenLabel.trim() && onConfirm(chosenLabel.trim())}
          >
            Merge into one node
          </button>
          <button className="merge-dialog__cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}