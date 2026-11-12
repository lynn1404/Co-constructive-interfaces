import type { Node, Edge } from "@xyflow/react";
import type { StudentVerificationEntry } from "../types";

export type GraphSnapshotEntry =
  | {
      subject: string;
      predicate: string;
      object: string;
      edgeId: string;
      verified: boolean;
      flagged?: boolean;
      _judgment?: { justification: string | null; suggested_correction: string };
    }
  | { node: string };

/**
 * Convert the React Flow graph into the list the backend expects: one {subject, predicate, object}
 * entry per labelled edge (with its verified/flagged state, so judged edges are not re-graded) and
 * one {node} entry per node with no edges.
 */
export function buildGraphSnapshot(nodes: Node[], edges: Edge[]): GraphSnapshotEntry[] {
  const connectedNodeIds = new Set<string>();
  const entries: GraphSnapshotEntry[] = [];

  for (const edge of edges) {
    const source = nodes.find((n) => n.id === edge.source);
    const target = nodes.find((n) => n.id === edge.target);
    const edgeData = edge.data as
      { label?: string; verification?: StudentVerificationEntry | null } | undefined;
    const predicate = edgeData?.label;

    if (!source || !target || !predicate) continue;

    connectedNodeIds.add(source.id);
    connectedNodeIds.add(target.id);

    const verification = edgeData?.verification;
    // A connection already flagged incorrect stays settled until the student changes it -
    // re-sending it for grading every "Verify Graph" click would waste a call and risks the
    // model flip-flopping on an unchanged edge. Editing the edge clears `verification` (see
    // Canvas.tsx), which drops `flagged` here and puts it back up for grading.
    const isFlaggedIncorrect = verification?.state === "flagged" && verification.status === "incorrect";

    const entry: GraphSnapshotEntry = {
      subject: source.data.label as string,
      predicate,
      object: target.data.label as string,
      edgeId: edge.id, // new — lets consumers exclude a specific edge exactly
      verified: verification?.state === "verified",
    };

    if (isFlaggedIncorrect) {
      entry.flagged = true;
      const fix = verification!.suggested_triplets?.[0];
      entry._judgment = {
        justification: verification!.hint ?? null,
        suggested_correction: fix ? `${fix.subject} --[${fix.predicate}]--> ${fix.object}` : "",
      };
    }

    entries.push(entry);
  }

  for (const node of nodes) {
    if (!connectedNodeIds.has(node.id)) {
      entries.push({ node: node.data.label as string });
    }
  }

  return entries;
}
