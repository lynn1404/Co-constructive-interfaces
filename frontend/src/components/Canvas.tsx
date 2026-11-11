import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  applyEdgeChanges,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeProps,
  type Node,
  type NodeProps,
  type OnConnectStart,
  type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { analyzeGapsSimple, checkResolveNodes, verifyGraph } from "../api";
import { useRequest } from "../hooks/useRequest";
import type { SimilarNodeGroup, SimpleGapItem, StudentVerificationEntry, TextHighlight } from "../types";
import { buildGraphSnapshot } from "../utils/buildGraphSnapshot";
import {
  applyVerification,
  buildPanelEntries,
  edgeData,
  makeConceptNode,
  mergeNodes,
  nodeLabel,
  sameIds,
} from "../utils/canvasGraph";
import { debugLog } from "../utils/debug";
import { CanvasToolbar } from "./CanvasToolbar";
import { CONCEPT_DRAG_MIME } from "./ConceptDrawer";
import { DeleteNodeDialog } from "./DeleteNodeDialog";
import { EdgeLinkPicker } from "./EdgeLinkPicker";
import { FloatingConnectionLine } from "./FloatingConnectionLine";
import { FloatingEdge } from "./FloatingEdge";
import { FloatingNode } from "./FloatingNode";
import { GapAnalysisDialog } from "./GapAnalysisDialog";
import { MergeDialog } from "./MergeDialog";
import { SimilarNodesDialog } from "./SimilarNodesDialog";
import { VerificationPanel } from "./VerificationPanel";
import "./Canvas.css";

interface PendingConnection {
  source: string;
  targets: string[];
  sourceHandle: string | null | undefined;
  targetHandle: string | null | undefined;
}

/** Only one edge at a time may wait for a label: clear the flag on all existing edges. */
function clearPending(edges: Edge[]): Edge[] {
  return edges.map((e) => ({ ...e, data: { ...e.data, isPending: false } }));
}

interface Props {
  highlights: TextHighlight[];
  resetKey: string | null;
  edges: Edge[];
  setEdges: React.Dispatch<React.SetStateAction<Edge[]>>;
  onNodeDeleted: (nodeId: string) => void;
  onEdgeLabelRemoved: (labelText: string) => void;
  sourceText: string;
  onNodeSelected: (highlightIds: string[]) => void;
  editingHighlightRef: React.RefObject<((text: string) => void) | null>;
  drawerMode: boolean;
  onConceptPlaced: (highlightId: string) => void;
  restrictedLinks: boolean;
}

export function Canvas(props: Props) {
  // useReactFlow() only works inside a ReactFlowProvider, hence the inner component
  return (
    <div className="canvas">
      <ReactFlowProvider>
        <CanvasInner {...props} />
      </ReactFlowProvider>
    </div>
  );
}

function CanvasInner({
  highlights,
  resetKey,
  edges,
  setEdges,
  onNodeDeleted,
  onEdgeLabelRemoved,
  sourceText,
  onNodeSelected,
  editingHighlightRef,
  drawerMode,
  onConceptPlaced,
  restrictedLinks,
}: Props) {
  const { fitView, screenToFlowPosition } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [deleteConfirmNodeId, setDeleteConfirmNodeId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null);
  const [verifySummary, setVerifySummary] = useState<Record<string, number> | null>(null);
  const [similarGroups, setSimilarGroups] = useState<SimilarNodeGroup[] | null>(null);
  const [gapResult, setGapResult] = useState<{ gaps: SimpleGapItem[]; overall: string } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<
    (PendingConnection & { anchor: { x: number; y: number } }) | null
  >(null);
  const verifyRequest = useRequest("Verification failed");
  const similarRequest = useRequest("Similarity check failed");
  const gapsRequest = useRequest("Gap analysis failed");
  const pendingConnectionDataRef = useRef<PendingConnection | null>(null);
  const connectStartNodeId = useRef<string | null>(null);
  const lastSelectionRef = useRef<string[]>([]);
  const lastSelectedNodeIdsRef = useRef<string[]>([]);
  const prevHighlightsLenRef = useRef(highlights.length);

  // ---- custom node and edge types (memoised: React Flow re-mounts them if these objects change)

  const registerEditingHandler = useCallback(
    (fn: ((text: string) => void) | null) => {
      editingHighlightRef.current = fn;
    },
    [editingHighlightRef],
  );

  // renaming a node changes the triplets of its edges, so their old verdicts no longer apply
  const handleNodeLabelChanged = useCallback(
    (nodeId: string) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.source === nodeId || e.target === nodeId ? { ...e, data: { ...e.data, verification: null } } : e,
        ),
      );
    },
    [setEdges],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      const edge = edges.find((e) => e.id === edgeId);
      const label = edge && edgeData(edge).label;
      if (label) onEdgeLabelRemoved(label);
      setEdges((eds) => eds.filter((e) => e.id !== edgeId));
    },
    [edges, onEdgeLabelRemoved, setEdges],
  );

  const openPanelForEdge = useCallback((edgeId: string) => {
    setFocusEdgeId(edgeId);
    setPanelOpen(true);
  }, []);

  const edgeTypes = useMemo(
    () => ({
      floating: (props: EdgeProps) => (
        <FloatingEdge
          {...props}
          registerEditingHandler={registerEditingHandler}
          onDeleteEdge={deleteEdge}
          onOpenPanel={openPanelForEdge}
          restrictedLinks={restrictedLinks}
        />
      ),
    }),
    [registerEditingHandler, deleteEdge, openPanelForEdge, restrictedLinks],
  );

  const nodeTypes = useMemo(
    () => ({
      floating: (props: NodeProps) => (
        <FloatingNode
          {...props}
          registerEditingHandler={registerEditingHandler}
          onNodeRenamed={handleNodeLabelChanged}
          onRequestDelete={setDeleteConfirmNodeId}
        />
      ),
    }),
    [registerEditingHandler, handleNodeLabelChanged],
  );

  // ---- syncing nodes with the highlights coming from the source panel

  useEffect(() => {
    setNodes([]);
    setEdges([]);
  }, [resetKey, setNodes, setEdges]);

  // a fresh text highlight (i.e. not editing an existing label) means the user is
  // marking something new — drop any current node selection so it doesn't linger
  useEffect(() => {
    if (highlights.length > prevHighlightsLenRef.current) {
      setSelectedNodeIds([]);
      setNodes((nds) => nds.map((n) => (n.selected ? { ...n, selected: false } : n)));
    }
    prevHighlightsLenRef.current = highlights.length;
  }, [highlights, setNodes]);

  // each new highlight becomes a node, laid out on a 4-column grid
  useEffect(() => {
    if (drawerMode) return; // in drawer mode, nodes are only created by dragging from the drawer

    setNodes((currentNodes) => {
      const seenText = new Set(currentNodes.map((n) => (n.data.label as string).trim().toLowerCase()));
      const newNodes: Node[] = [];
      highlights.forEach((h) => {
        const key = h.text.trim().toLowerCase();
        if (seenText.has(key)) return;
        seenText.add(key);
        const index = currentNodes.length + newNodes.length;
        newNodes.push(
          makeConceptNode(h.id, { x: (index % 4) * 200, y: Math.floor(index / 4) * 120 }, h.text, [h.id], {
            autoEdit: true,
            wordLimitExceeded: h.wordLimitExceeded ?? false,
          }),
        );
      });
      return newNodes.length === 0 ? currentNodes : [...currentNodes, ...newNodes];
    });
  }, [highlights, setNodes, drawerMode]);

  useEffect(() => {
    fitView({ duration: 300 });
  }, [nodes.length, fitView]);

  // ---- creating and deleting nodes

  function handleCreateNode() {
    const position = screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    setNodes((currentNodes) => [
      ...currentNodes,
      makeConceptNode(crypto.randomUUID(), position, "New concept", [], { autoEdit: true, color: "white" }),
    ]);
  }

  function handleDragOver(event: React.DragEvent) {
    if (!drawerMode) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleDrop(event: React.DragEvent) {
    if (!drawerMode) return;
    event.preventDefault();
    const highlight = highlights.find((h) => h.id === event.dataTransfer.getData(CONCEPT_DRAG_MIME));
    if (!highlight) return;

    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setNodes((currentNodes) =>
      currentNodes.some((n) => n.id === highlight.id)
        ? currentNodes
        : [...currentNodes, makeConceptNode(highlight.id, position, highlight.text, [highlight.id])],
    );
    onConceptPlaced(highlight.id);
  }

  function handleNodesDelete(deletedNodes: Node[]) {
    const deletedIds = new Set(deletedNodes.map((n) => n.id));
    const cascadedEdges = edges.filter((e) => deletedIds.has(e.source) || deletedIds.has(e.target));

    setEdges((eds) => eds.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)));

    deletedNodes.forEach((n) => {
      const mergedIds = (n.data.sourceHighlightIds as string[] | undefined) ?? [n.id];
      mergedIds.forEach((id) => onNodeDeleted(id));
    });
    cascadedEdges.forEach((e) => {
      const { label } = edgeData(e);
      if (label) onEdgeLabelRemoved(label);
    });
  }

  function confirmDeleteNode() {
    const node = nodes.find((n) => n.id === deleteConfirmNodeId);
    setDeleteConfirmNodeId(null);
    if (!node) return;
    setNodes((currentNodes) => currentNodes.filter((n) => n.id !== node.id));
    handleNodesDelete([node]);
  }

  function handleMerge(nodeIds: string[], mainLabel: string) {
    const merged = mergeNodes(nodes, edges, nodeIds, mainLabel);
    if (!merged) return;
    setNodes(merged.nodes);
    setEdges(merged.edges);
    setSelectedNodeIds([]);
  }

  // ---- creating edges

  function handleEdgesChange(changes: EdgeChange[]) {
    const removedIds = changes.filter((c) => c.type === "remove").map((c) => c.id);
    edges
      .filter((e) => removedIds.includes(e.id))
      .forEach((e) => {
        const { label } = edgeData(e);
        if (label) onEdgeLabelRemoved(label);
      });
    setEdges((eds) => applyEdgeChanges(changes, eds));
  }

  // every edge is a "floating" edge with an arrowhead; while pending, highlighting text in the
  // source panel calls onSubmitLabel to set its label
  function makeEdge(
    source: string,
    target: string,
    sourceHandle: string | null | undefined,
    targetHandle: string | null | undefined,
    label: string,
    isPending: boolean,
  ): Edge {
    const id = crypto.randomUUID();
    return {
      id,
      source,
      target,
      sourceHandle,
      targetHandle,
      type: "floating",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#9ca3af" },
      data: {
        label,
        isPending,
        verification: null,
        onSubmitLabel: (newLabel: string) =>
          setEdges((eds) =>
            eds.map((e) =>
              e.id === id
                ? { ...e, data: { ...e.data, label: newLabel, isPending: false, verification: null } }
                : e,
            ),
          ),
      },
    };
  }

  function createDraftEdge(
    source: string,
    target: string,
    sourceHandle: string | null | undefined,
    targetHandle: string | null | undefined,
  ) {
    const edge = makeEdge(source, target, sourceHandle, targetHandle, "", true);
    setEdges((eds) => [...clearPending(eds), edge]);
  }

  function createLinkedEdge(connection: PendingConnection, link: string) {
    const newEdges = connection.targets.map((target) =>
      makeEdge(connection.source, target, connection.sourceHandle, connection.targetHandle, link, false),
    );
    setEdges((eds) => [...clearPending(eds), ...newEdges]);
  }

  // when the drag lands on a node that's part of a multi-selection, fan the edge out to
  // every selected node instead of just the one the cursor happened to drop on
  function resolveConnectionTargets(actualTarget: string): string[] {
    if (selectedNodeIds.length > 1 && selectedNodeIds.includes(actualTarget)) {
      return selectedNodeIds;
    }
    return [actualTarget];
  }

  const handleConnectStart: OnConnectStart = (_event, params) => {
    connectStartNodeId.current = params.nodeId;
  };

  function handleConnect(connection: Connection) {
    const startId = connectStartNodeId.current;
    const isReversed = startId && startId !== connection.source;

    const actualSource = isReversed ? connection.target! : connection.source!;
    const actualTarget = isReversed ? connection.source! : connection.target!;
    const targets = resolveConnectionTargets(actualTarget).filter((id) => id !== actualSource);

    // restricted-links mode doesn't create the edge yet - it waits until a specific link is
    // chosen, once handleConnectEnd knows where to anchor the category picker
    if (restrictedLinks) {
      pendingConnectionDataRef.current = {
        source: actualSource,
        targets,
        sourceHandle: connection.sourceHandle,
        targetHandle: connection.targetHandle,
      };
    } else {
      targets.forEach((target) =>
        createDraftEdge(actualSource, target, connection.sourceHandle, connection.targetHandle),
      );
    }

    connectStartNodeId.current = null; // reset for next drag
  }

  function handleConnectEnd(event: MouseEvent | TouchEvent) {
    const data = pendingConnectionDataRef.current;
    pendingConnectionDataRef.current = null;
    if (!data) return;

    const point = "changedTouches" in event ? event.changedTouches[0] : event;
    setPendingConnection({ ...data, anchor: { x: point.clientX, y: point.clientY } });
  }

  // ---- selection

  function handleSelectionChange({ nodes: selectedNodes }: OnSelectionChangeParams) {
    const ids = selectedNodes.map((n) => n.id);
    if (!sameIds(ids, lastSelectedNodeIdsRef.current)) {
      lastSelectedNodeIdsRef.current = ids;
      setSelectedNodeIds(ids);
    }

    // a single selected node spotlights the text it came from
    const nextIds =
      selectedNodes.length === 1
        ? ((selectedNodes[0].data.sourceHighlightIds as string[] | undefined) ?? [selectedNodes[0].id])
        : [];
    if (!sameIds(nextIds, lastSelectionRef.current)) {
      lastSelectionRef.current = nextIds;
      onNodeSelected(nextIds);
    }
  }

  // ---- backend checks

  const hasFullTriplet = edges.some((e) => {
    const { label, isPending } = edgeData(e);
    return !!label && !isPending;
  });
  const panelEntries = useMemo(() => buildPanelEntries(nodes, edges), [nodes, edges]);
  const allVerified = panelEntries.length > 0 && panelEntries.every((e) => e.verification !== null);

  async function handleVerifyGraph() {
    const response = await verifyRequest.run(() =>
      verifyGraph({ source_text: sourceText, existing_graph: buildGraphSnapshot(nodes, edges) }),
    );
    if (!response) return;
    debugLog("verify_graph response:", response);
    setEdges((eds) => applyVerification(nodes, eds, response.student));
    setVerifySummary(response.summary);
    setFocusEdgeId(null);
    setPanelOpen(true);
  }

  async function handleAnalyzeGaps() {
    const response = await gapsRequest.run(() =>
      analyzeGapsSimple({ source_text: sourceText, existing_graph: buildGraphSnapshot(nodes, edges) }),
    );
    if (!response) return;
    debugLog("simple_analyze_gaps response:", response);
    setGapResult({ gaps: response.gaps, overall: response.overall });
  }

  async function handleCheckSimilarNodes() {
    const response = await similarRequest.run(() =>
      checkResolveNodes({ existing_graph: buildGraphSnapshot(nodes, edges) }),
    );
    if (!response) return;
    debugLog("check_resolve_nodes response:", response);
    setSimilarGroups(response.groups);
  }

  // the student overrides a "worth another check" verdict and marks the edge correct
  function handleConfirmCorrect(edgeId: string) {
    setEdges((eds) =>
      eds.map((e) => {
        const triplet = edgeData(e).verification?.triplet;
        if (e.id !== edgeId || !triplet) return e;
        const verification: StudentVerificationEntry = {
          triplet,
          state: "verified",
          status: null,
          error_type: null,
          hint: null,
          reflection: null,
          suggested_triplets: [],
        };
        return { ...e, data: { ...e.data, verification } };
      }),
    );
    setVerifySummary((prev) =>
      prev
        ? { ...prev, verified: (prev.verified ?? 0) + 1, flagged: Math.max((prev.flagged ?? 0) - 1, 0) }
        : prev,
    );
  }

  const nodeToDelete = nodes.find((n) => n.id === deleteConfirmNodeId);

  return (
    <>
      <div className="canvas__flow-wrapper" onDragOver={handleDragOver} onDrop={handleDrop}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={handleEdgesChange}
          onNodesDelete={handleNodesDelete}
          onConnect={handleConnect}
          onConnectStart={handleConnectStart}
          onConnectEnd={handleConnectEnd}
          connectionLineComponent={FloatingConnectionLine}
          onSelectionChange={handleSelectionChange}
          selectionMode={SelectionMode.Partial}
          fitView
        >
          <Background gap={16} />
          <Controls />
        </ReactFlow>
      </div>

      <CanvasToolbar
        nodeCount={nodes.length}
        selectedCount={selectedNodeIds.length}
        hasFullTriplet={hasFullTriplet}
        allVerified={allVerified}
        verify={verifyRequest}
        similar={similarRequest}
        gaps={gapsRequest}
        panelOpen={panelOpen}
        onCreateNode={handleCreateNode}
        onMergeSelected={() => setShowMergeDialog(true)}
        onVerify={handleVerifyGraph}
        onCheckSimilar={handleCheckSimilarNodes}
        onAnalyzeGaps={handleAnalyzeGaps}
        onTogglePanel={() => setPanelOpen((open) => !open)}
      />

      {showMergeDialog && (
        <MergeDialog
          nodes={nodes.filter((n) => selectedNodeIds.includes(n.id))}
          onCancel={() => setShowMergeDialog(false)}
          onConfirm={(mainLabel) => {
            handleMerge(selectedNodeIds, mainLabel);
            setShowMergeDialog(false);
          }}
        />
      )}

      {nodeToDelete && (
        <DeleteNodeDialog
          nodeLabel={nodeToDelete.data.label as string}
          relationCount={
            edges.filter((e) => e.source === nodeToDelete.id || e.target === nodeToDelete.id).length
          }
          onCancel={() => setDeleteConfirmNodeId(null)}
          onConfirm={confirmDeleteNode}
        />
      )}

      {panelOpen && (
        <VerificationPanel
          entries={panelEntries}
          focusEdgeId={focusEdgeId}
          summary={verifySummary}
          onClose={() => setPanelOpen(false)}
          onEntryClick={setFocusEdgeId}
          onConfirmCorrect={handleConfirmCorrect}
        />
      )}

      {similarGroups !== null && (
        <SimilarNodesDialog groups={similarGroups} onClose={() => setSimilarGroups(null)} />
      )}

      {gapResult !== null && (
        <GapAnalysisDialog
          gaps={gapResult.gaps}
          overall={gapResult.overall}
          onClose={() => setGapResult(null)}
        />
      )}

      {pendingConnection && (
        <EdgeLinkPicker
          anchor={pendingConnection.anchor}
          sourceLabel={nodeLabel(nodes, pendingConnection.source) ?? "source node"}
          targetLabel={
            pendingConnection.targets.length > 1
              ? `${pendingConnection.targets.length} selected nodes`
              : (nodeLabel(nodes, pendingConnection.targets[0]) ?? "destination node")
          }
          onSubmit={(link) => {
            createLinkedEdge(pendingConnection, link);
            setPendingConnection(null);
          }}
          onClose={() => setPendingConnection(null)}
        />
      )}
    </>
  );
}
