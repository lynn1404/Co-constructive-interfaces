interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Given a rectangle and a point outside it (typically another node's
 * center), returns the point where a straight line from the rectangle's
 * center to that outside point crosses the rectangle's border.
 */
export function getBorderIntersection(rect: Rect, towards: { x: number; y: number }) {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  const dx = towards.x - cx;
  const dy = towards.y - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const scaleX = dx !== 0 ? rect.width / 2 / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? rect.height / 2 / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return { x: cx + dx * scale, y: cy + dy * scale };
}

/**
 * Given a list of all edges and the one we're currently rendering, returns
 * this edge's index among others connecting the same two nodes (regardless
 * of direction), so duplicates can be visually fanned out.
 */
export function getParallelIndex(
  allEdges: { id: string; source: string; target: string }[],
  currentEdgeId: string,
  source: string,
  target: string,
): { index: number; total: number } {
  const siblings = allEdges
    .filter(
      (e) => (e.source === source && e.target === target) || (e.source === target && e.target === source),
    )
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const index = siblings.findIndex((e) => e.id === currentEdgeId);
  return { index, total: siblings.length };
}

/** Offsets a midpoint perpendicular to the source->target line, spreading
 * multiple parallel edges apart symmetrically around the centerline.
 *
 * The perpendicular direction is derived from a canonical (id-sorted) node
 * order rather than this edge's own start/end. Otherwise a reversed edge
 * (B->A vs A->B) flips the sign of the perpendicular and lands its offset
 * on the same side as its counterpart instead of the opposite side,
 * causing the two curves to overlap instead of fanning apart. */
export function getCurvedMidpoint(
  start: { x: number; y: number },
  end: { x: number; y: number },
  index: number,
  total: number,
  reversed = false,
) {
  if (total <= 1) {
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;

  // perpendicular unit vector, flipped back into canonical orientation for
  // edges running the "reverse" direction so offsets stay consistent
  const sign = reversed ? -1 : 1;
  const nx = (-dy / length) * sign;
  const ny = (dx / length) * sign;

  // center the spread around 0: e.g. 3 edges -> offsets [-1, 0, 1] * spacing
  const spacing = 24;
  const offsetAmount = (index - (total - 1) / 2) * spacing;

  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return { x: midX + nx * offsetAmount, y: midY + ny * offsetAmount };
}
