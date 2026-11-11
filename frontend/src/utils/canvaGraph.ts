// Pure helpers for the concept map: reading node/edge data, matching backend verdicts to edges,
// and merging nodes. No React state here, so Canvas can stay about UI and interaction.
import type { Edge, Node } from "@xyflow/react";

import type { PanelEntry } from "../components/VerificationPanel";
import type { StudentVerificationEntry, Triplet } from "../types";

/** What Canvas stores in `edge.data` (React Flow types it as a loose record). */
export interface CanvasEdgeData {
  label?: string;
  isPending?: boolean;
  verification?: StudentVerificationEntry | null;
  onSubmitLabel?: (label: string) => void;
}

export const edgeData = (edge: Edge): CanvasEdgeData => (edge.data ?? {}) as CanvasEdgeData;

export const nodeLabel = (nodes: Node[], id: string): string | undefined =>
  nodes.find((n) => n.id === id)?.data.label as string | undefined;

export function sameIds(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i]);
}

/** Case- and whitespace-insensitive key for a triplet. The NUL separator cannot appear in a
 * label, so ("a b", "c") and ("a", "b c") never collide. */
export function tripletKey(t: Triplet): string {
  const norm = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();
  return [t.subject, t.predicate, t.object].map(norm).join("\u0000");
}

/** A new concept node of the custom "floating" type; `extra` adds optional data flags. */
export function makeConceptNode(
  id: string,
  position: { x: number; y: number },
  label: string,
  sourceHighlightIds: string[],
  extra: Record<string, unknown> = {},
): Node {
  return {
    id,
    position,
    type: "floating",
    data: { label, aliases: [], sourceHighlightIds, isNew: true, ...extra },
  };
}

/** One verification-panel row per labelled edge whose two endpoints have labels. */
export function buildPanelEntries(nodes: Node[], edges: Edge[]): PanelEntry[] {
  return edges
    .map((e) => {
      const { label, isPending, verification } = edgeData(e);
      const subject = nodeLabel(nodes, e.source);
      const object = nodeLabel(nodes, e.target);
      if (!label || isPending || !subject || !object) return null;
      return {
        edgeId: e.id,
        subject,
        predicate: label,
        object,
        verification: verification ?? null,
      } satisfies PanelEntry;
    })
    .filter((entry): entry is PanelEntry => entry !== null);
}

/** Attach each backend verdict to the edge with the same (subject, predicate, object). */
export function applyVerification(
  nodes: Node[],
  edges: Edge[],
  verdicts: StudentVerificationEntry[],
): Edge[] {
  const byTriplet = new Map(verdicts.map((v) => [tripletKey(v.triplet), v] as const));
  return edges.map((e) => {
    const { label } = edgeData(e);
    const subject = nodeLabel(nodes, e.source);
    const object = nodeLabel(nodes, e.target);
    if (!label || !subject || !object) return e;
    const match = byTriplet.get(tripletKey({ subject, predicate: label, object }));
    return match ? { ...e, data: { ...e.data, verification: match } } : e;
  });
}

/**
 * Merge `nodeIds` into the first of them, labelled `mainLabel`. The other labels become aliases,
 * source highlights are unioned (so the merged node spotlights all its original text), edges are
 * redirected to the surviving node, and verdicts on those edges are cleared.
 * Returns null when fewer than two of the nodes exist.
 */
export function mergeNodes(
  nodes: Node[],
  edges: Edge[],
  nodeIds: string[],
  mainLabel: string,
): { nodes: Node[]; edges: Edge[] } | null {
  const merged = nodes.filter((n) => nodeIds.includes(n.id));
  if (merged.length < 2) return null;

  const survivor = merged[0];
  const mergedIds = new Set(nodeIds);
  const aliases = new Set([
    ...merged.map((n) => n.data.label as string),
    ...merged.flatMap((n) => (n.data.aliases as string[] | undefined) ?? []),
  ]);
  aliases.delete(mainLabel);
  const sourceHighlightIds = merged.flatMap(
    (n) => (n.data.sourceHighlightIds as string[] | undefined) ?? [n.id],
  );

  return {
    nodes: [
      ...nodes.filter((n) => !mergedIds.has(n.id)),
      { ...survivor, data: { label: mainLabel, aliases: Array.from(aliases), sourceHighlightIds } },
    ],
    edges: edges.map((e) => {
      if (!mergedIds.has(e.source) && !mergedIds.has(e.target)) return e;
      return {
        ...e,
        source: mergedIds.has(e.source) ? survivor.id : e.source,
        target: mergedIds.has(e.target) ? survivor.id : e.target,
        data: { ...e.data, verification: null },
      };
    }),
  };
}
