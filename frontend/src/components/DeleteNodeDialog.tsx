import "./DeleteNodeDialog.css";

interface Props {
  nodeLabel: string;
  relationCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteNodeDialog({ nodeLabel, relationCount, onCancel, onConfirm }: Props) {
  return (
    <div className="delete-node-dialog-overlay">
      <div className="delete-node-dialog">
        <div className="delete-node-dialog__eyebrow">Delete node</div>
        <div className="delete-node-dialog__message">
          Are you sure you want to delete <strong>{nodeLabel}</strong>? It has {relationCount}{" "}
          relation{relationCount === 1 ? "" : "s"}.
        </div>

        <div className="delete-node-dialog__actions">
          <button className="delete-node-dialog__confirm" onClick={onConfirm}>
            Delete node
          </button>
          <button className="delete-node-dialog__cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
