interface RequestStatus {
  loading: boolean;
  error: string | null;
}

interface Props {
  nodeCount: number;
  selectedCount: number;
  hasFullTriplet: boolean;
  allVerified: boolean;
  verify: RequestStatus;
  similar: RequestStatus;
  gaps: RequestStatus;
  panelOpen: boolean;
  onCreateNode: () => void;
  onMergeSelected: () => void;
  onVerify: () => void;
  onCheckSimilar: () => void;
  onAnalyzeGaps: () => void;
  onTogglePanel: () => void;
}

/** Buttons floating over the canvas: add/merge nodes, the three AI checks, and the panel toggle. */
export function CanvasToolbar({
  nodeCount,
  selectedCount,
  hasFullTriplet,
  allVerified,
  verify,
  similar,
  gaps,
  panelOpen,
  onCreateNode,
  onMergeSelected,
  onVerify,
  onCheckSimilar,
  onAnalyzeGaps,
  onTogglePanel,
}: Props) {
  return (
    <>
      <div className="canvas-toolbar-topleft">
        <button className="create-node-btn" onClick={onCreateNode} title="Add a new node to the canvas">
          + Add Node
        </button>
        {selectedCount >= 2 && (
          <button className="merge-trigger-btn" onClick={onMergeSelected}>
            Merge {selectedCount} nodes
          </button>
        )}
      </div>

      <div className="canvas-toolbar">
        <div className="canvas-toolbar__row">
          <button
            className="verify-graph-btn"
            onClick={onVerify}
            disabled={!hasFullTriplet || verify.loading || allVerified}
            title={
              !hasFullTriplet
                ? "Add at least one labeled edge to verify"
                : allVerified
                  ? "All edges verified — edit the graph to re-run"
                  : "Verify all triplets in the graph"
            }
          >
            {verify.loading ? "Verifying…" : "Verify Graph"}
          </button>

          <button
            className="check-similar-nodes-btn"
            onClick={onCheckSimilar}
            disabled={nodeCount < 2 || similar.loading}
            title="Suggest nodes that might refer to the same concept"
          >
            {similar.loading ? "Checking…" : "Check similar nodes"}
          </button>

          <button
            className="analyze-gaps-btn"
            onClick={onAnalyzeGaps}
            disabled={!hasFullTriplet || gaps.loading}
            title="Find parts of the source text your map doesn't cover yet"
          >
            {gaps.loading ? "Analyzing…" : "Analyze Gaps"}
          </button>
        </div>

        <div className="canvas-toolbar__errors">
          {verify.error && <div className="verify-graph-error">{verify.error}</div>}
          {similar.error && <div className="check-similar-nodes-error">{similar.error}</div>}
          {gaps.error && <div className="analyze-gaps-error">{gaps.error}</div>}
        </div>
      </div>

      <button
        className={`verification-toggle-chip ${panelOpen ? "verification-toggle-chip--active" : ""}`}
        onClick={onTogglePanel}
        title={panelOpen ? "Hide verification panel" : "Show verification panel"}
      >
        🗒 Verification
      </button>
    </>
  );
}
