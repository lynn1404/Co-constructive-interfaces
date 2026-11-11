import "./App.css";
import { SourcePanel } from "./components/SourcePanel";
import type { HighlightMode } from "./components/SourcePanel";
import { Canvas } from "./components/Canvas";
import { ConceptDrawer } from "./components/ConceptDrawer";
import { useRef, useState } from "react";
import type { Edge } from "@xyflow/react";
import type { TextHighlight } from "./types";
import type { GraphSnapshotEntry } from "./utils/buildGraphSnapshot";
import { shuffle } from "./utils/shuffle";

export default function App() {
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [highlights, setHighlights] = useState<TextHighlight[]>([]); // -> nodes
  const [readMarks, setReadMarks] = useState<TextHighlight[]>([]); // -> greying only
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [graphSnapshot, setGraphSnapshot] = useState<GraphSnapshotEntry[]>([]);
  const [spotlightHighlightIds, setSpotlightHighlightIds] = useState<string[]>([]);
  const [hideTextAfterExtraction, setHideTextAfterExtraction] = useState(false);
  const [extractionDone, setExtractionDone] = useState(false);
  const [drawerConcepts, setDrawerConcepts] = useState<TextHighlight[]>([]);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>("phrases");
  const [restrictedLinks, setRestrictedLinks] = useState(true);
  const [canvasOpen, setCanvasOpen] = useState(false);
  // imperative side-channel: while a node/edge label is being edited, it registers a
  // handler here so the next text highlight replaces its label instead of creating a new node
  const editingHighlightRef = useRef<((text: string) => void) | null>(null);

  function handleNodeDeleted(nodeId: string) {
    // removes highlight and ungreys text
    const deletedHighlight = highlights.find((h) => h.id === nodeId);
    if (!deletedHighlight) return;

    setHighlights((prev) => prev.filter((h) => h.id !== nodeId));
    setReadMarks((prev) =>
      prev.filter((r) => r.text.trim().toLowerCase() !== deletedHighlight.text.trim().toLowerCase()),
    );
  }

  function handleEdgeLabelRemoved(labelText: string) {
    // removes edge label
    setReadMarks((prev) =>
      prev.filter((r) => r.text.trim().toLowerCase() !== labelText.trim().toLowerCase()),
    );
  }

  function handleReset() {
    // resets the canvas
    setSubmittedText(null);
    setEdges([]);
    setHighlights([]);
    setReadMarks([]);
    setSubmissionId(crypto.randomUUID());
    setGraphSnapshot([]);
    setSpotlightHighlightIds([]);
    setExtractionDone(false);
    setDrawerConcepts([]);
    setCanvasOpen(false);
  }

  function handleFinishExtraction() {
    // fills the concepts drawer in shuffled order
    setDrawerConcepts(shuffle(highlights));
    setExtractionDone(true);
  }

  function handleConceptPlaced(highlightId: string) {
    setDrawerConcepts((prev) => prev.filter((h) => h.id !== highlightId));
  }

  function handleOpenCanvas(text: string) {
    // opens the canvas with the submitted text
    setSubmittedText(text);
    setSubmissionId(crypto.randomUUID());
    setHighlights([]);
    setReadMarks([]);
    setCanvasOpen(true);
  }

  function handleBackToChat() {
    setCanvasOpen(false);
  }

  return (
    <div className="app-layout">
      <div className={canvasOpen ? "app-layout__left" : "app-layout__left app-layout__left--full"}>
        {hideTextAfterExtraction && extractionDone ? (
          <ConceptDrawer concepts={drawerConcepts} />
        ) : (
          <SourcePanel
            highlights={highlights}
            setHighlights={setHighlights}
            readMarks={readMarks}
            setReadMarks={setReadMarks}
            submittedText={submittedText}
            setSubmittedText={setSubmittedText}
            edges={edges}
            setSubmissionId={setSubmissionId}
            spotlightHighlightIds={spotlightHighlightIds}
            editingHighlightRef={editingHighlightRef}
            hideTextAfterExtraction={hideTextAfterExtraction}
            setHideTextAfterExtraction={setHideTextAfterExtraction}
            extractionDone={extractionDone}
            onFinishExtraction={handleFinishExtraction}
            highlightMode={highlightMode}
            setHighlightMode={setHighlightMode}
            restrictedLinks={restrictedLinks}
            setRestrictedLinks={setRestrictedLinks}
            canvasOpen={canvasOpen}
            onOpenCanvas={handleOpenCanvas}
            onBackToChat={handleBackToChat}
          />
        )}
      </div>
      {canvasOpen && (
        <div className="app-layout__right">
          <Canvas
            highlights={highlights}
            resetKey={submissionId}
            edges={edges}
            setEdges={setEdges}
            onNodeDeleted={handleNodeDeleted}
            onEdgeLabelRemoved={handleEdgeLabelRemoved}
            onGraphSnapshotChange={setGraphSnapshot}
            sourceText={submittedText ?? ""}
            graphSnapshot={graphSnapshot}
            onNodeSelected={setSpotlightHighlightIds}
            editingHighlightRef={editingHighlightRef}
            drawerMode={hideTextAfterExtraction}
            onConceptPlaced={handleConceptPlaced}
            restrictedLinks={restrictedLinks}
          />
        </div>
      )}

      {canvasOpen && (
        <button
          className="app-reset-btn"
          onClick={handleReset}
          disabled={submittedText === null}
          title="Clear the source text and canvas"
        >
          ↺ Reset
        </button>
      )}
    </div>
  );
}
