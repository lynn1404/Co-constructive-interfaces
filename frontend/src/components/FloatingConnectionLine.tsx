// src/components/FloatingConnectionLine.tsx
import { useInternalNode, type ConnectionLineComponentProps } from "@xyflow/react";
import { getBorderIntersection } from "../utils/edgeGeometry";
import "./FloatingConnectionLine.css";

export function FloatingConnectionLine({ fromNode, toX, toY }: ConnectionLineComponentProps) {
  const sourceNode = useInternalNode(fromNode.id);
  if (!sourceNode) return null;

  const sourceRect = {
    x: sourceNode.internals.positionAbsolute.x,
    y: sourceNode.internals.positionAbsolute.y,
    width: sourceNode.measured.width ?? 0,
    height: sourceNode.measured.height ?? 0,
  };

  const start = getBorderIntersection(sourceRect, { x: toX, y: toY });

  return (
    <path
      d={`M${start.x},${start.y} L${toX},${toY}`}
      className="floating-connection-line"
    />
  );
}