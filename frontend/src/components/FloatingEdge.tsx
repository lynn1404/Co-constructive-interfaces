import { useInternalNode, useStore, EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";
import { getBorderIntersection, getParallelIndex, getCurvedMidpoint } from "../utils/edgeGeometry";
import { useEffect, useRef, useState } from "react";

import "./FloatingEdge.css";
import type { StudentVerificationEntry } from "../types";
import { EdgeLinkPicker } from "./EdgeLinkPicker";

interface FloatingEdgeData {
  label?: string;
  isPending?: boolean;
  verification?: StudentVerificationEntry | null;
  onSubmitLabel?: (label: string) => void;
}

interface FloatingEdgeExtraProps {
  registerEditingHandler: (fn: ((text: string) => void) | null) => void;
  onDeleteEdge: (id: string) => void;
  onOpenPanel: (id: string) => void;
  restrictedLinks: boolean;
}

function edgePathStyle(verification: StudentVerificationEntry | null | undefined): {
  stroke?: string;
  strokeDasharray?: string;
} {
  if (!verification || verification.state === "blocked") {
    return { strokeDasharray: "6 4" };
  }
  if (verification.state === "verified") {
    return { stroke: "#16a34a" };
  }
  switch (verification.status) {
    case "incorrect":
      return { stroke: "#2563eb" };
    case "incomplete":
      return { stroke: "#ca8a04" };
    case "redundant":
      return { stroke: "#9333ea" };
    default:
      return { strokeDasharray: "6 4" };
  }
}

export function FloatingEdge({
  id,
  source,
  target,
  style,
  markerEnd,
  data,
  selected,
  registerEditingHandler,
  onDeleteEdge,
  onOpenPanel,
  restrictedLinks,
}: EdgeProps & FloatingEdgeExtraProps) {

  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const edges = useStore((s) => s.edges);
  const [draftLabel, setDraftLabel] = useState("");
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [pickerAnchor, setPickerAnchor] = useState<{ x: number; y: number } | null>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const edgeData = data as FloatingEdgeData | undefined;
  const showingPicker = restrictedLinks && (edgeData?.isPending || isEditingLabel);

  useEffect(() => {
    if (!showingPicker) {
      setPickerAnchor(null);
      return;
    }
    if (labelRef.current) {
      const rect = labelRef.current.getBoundingClientRect();
      setPickerAnchor({ x: rect.left + rect.width / 2, y: rect.bottom + 16 });
    }
    // anchor is captured once when the picker opens; it intentionally does not
    // track the label afterwards so a manual drag isn't undone by re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showingPicker]);

  if (!sourceNode || !targetNode) return null;

  const sourceRect = {
    x: sourceNode.internals.positionAbsolute.x,
    y: sourceNode.internals.positionAbsolute.y,
    width: sourceNode.measured.width ?? 0,
    height: sourceNode.measured.height ?? 0,
  };
  const targetRect = {
    x: targetNode.internals.positionAbsolute.x,
    y: targetNode.internals.positionAbsolute.y,
    width: targetNode.measured.width ?? 0,
    height: targetNode.measured.height ?? 0,
  };

  const sourceCenter = { x: sourceRect.x + sourceRect.width / 2, y: sourceRect.y + sourceRect.height / 2 };
  const targetCenter = { x: targetRect.x + targetRect.width / 2, y: targetRect.y + targetRect.height / 2 };

  const start = getBorderIntersection(sourceRect, targetCenter);
  const end = getBorderIntersection(targetRect, sourceCenter);

  const { index, total } = getParallelIndex(edges, id, source, target);
  const reversed = source > target;
  const mid = getCurvedMidpoint(start, end, index, total, reversed);

  const path = `M${start.x},${start.y} Q${mid.x},${mid.y} ${end.x},${end.y}`;

  const sourceLabel = (sourceNode.data.label as string | undefined) ?? "source node";
  const targetLabel = (targetNode.data.label as string | undefined) ?? "destination node";

  function handleSubmit() {
    if (draftLabel.trim().length === 0) return;
    edgeData?.onSubmitLabel?.(draftLabel.trim());
    setDraftLabel("");
    setIsEditingLabel(false);
    registerEditingHandler(null);
  }

  function submitLink(link: string) {
    edgeData?.onSubmitLabel?.(link);
    setIsEditingLabel(false);
    registerEditingHandler(null);
  }

  function startEditingLabel() {
    if (!edgeData?.label) return;
    setDraftLabel(edgeData.label);
    setIsEditingLabel(true);
    // a highlight made in the source panel while this input is open replaces the label directly
    registerEditingHandler((text) => {
      edgeData?.onSubmitLabel?.(text);
      setIsEditingLabel(false);
      registerEditingHandler(null);
    });
  }

  function cancelEditingLabel() {
    setIsEditingLabel(false);
    setDraftLabel("");
    registerEditingHandler(null);
  }

  function closePicker() {
    if (isEditingLabel) {
      cancelEditingLabel();
    } else if (edgeData?.isPending) {
      // a pending edge has no label yet, so there is nothing to fall back to - drop it
      onDeleteEdge(id);
    }
  }

  const verification = edgeData?.verification;
  const showCheck = verification?.state === "verified";
  const showWorthCheck = verification?.state === "flagged" && verification.status === "incorrect";
  const showBlocked = verification?.state === "blocked";

  return (
    <>
    <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />
      <path
        id={id}
        className={`react-flow__edge-path ${selected ? "floating-edge--selected" : ""}`}
        d={path}
        style={{ ...style, ...edgePathStyle(verification) }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          ref={labelRef}
          className="edge-label"
          style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}
        >
          {edgeData?.isPending || isEditingLabel ? (
            restrictedLinks ? (
              <span className="edge-label__text edge-label__text--pending">select relation…</span>
            ) : (
              <input
                autoFocus
                placeholder="label…"
                className="edge-label__input nodrag"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onBlur={handleSubmit}
                onKeyDown={(e) => {
                  e.stopPropagation(); // prevent React Flow from reacting to keys while typing
                  if (e.key === "Enter") handleSubmit();
                  if (e.key === "Escape") cancelEditingLabel();
                }}
              />
            )
          ) : edgeData?.label ? (
            <div className="edge-label__row">
              <span
                className="edge-label__text"
                onClick={(e) => {
                  e.stopPropagation();
                  startEditingLabel();
                }}
                title="Click to edit"
              >
                {edgeData.label}
              </span>
              {showCheck && (
                <span className="edge-status-icon edge-status-icon--correct" title="Correct">
                  ✓
                </span>
              )}
              {showWorthCheck && (
                <span
                  className="edge-status-icon edge-status-icon--worth-check"
                  title={
                    verification?.error_type
                      ? `Worth another check (${verification.error_type.replace(/_/g, " ")})`
                      : "Worth another check"
                  }
                >
                  !
                </span>
              )}
              {showBlocked && (
                <span className="edge-status-icon edge-status-icon--blocked" title="Blocked">
                  ⊘
                </span>
              )}
              <span
                className="edge-panel-btn nodrag"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenPanel(id);
                }}
                title="Open verification details"
              >
                🗒
              </span>
            </div>
          ) : null}
        </div>
      </EdgeLabelRenderer>
      {showingPicker && restrictedLinks && pickerAnchor && (
        <EdgeLinkPicker
          anchor={pickerAnchor}
          sourceLabel={sourceLabel}
          targetLabel={targetLabel}
          onSubmit={submitLink}
          onClose={closePicker}
        />
      )}
      {selected && (
        <EdgeLabelRenderer>
          <div
            className="edge-delete-btn nodrag nopan"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y - 22}px)` }}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteEdge(id);
            }}
            title="Delete edge"
          >
            🗑
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}