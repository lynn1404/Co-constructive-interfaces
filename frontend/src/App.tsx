import { useRef, useState } from "react";
import type { Edge } from "@xyflow/react";

import { Canvas } from "./components/Canvas";
import { ConceptDrawer } from "./components/ConceptDrawer";
import { SourcePanel } from "./components/SourcePanel";
import type { TextHighlight, HighlightMode } from "./types";
import { shuffle } from "./utils/shuffle";

import "./App.css";

// Case- and whitespace-insensitive key, so "Stress " and "stress" count as the same text.
const textKey = (text: string) => text.trim().toLowerCase();

/**
 * Root component. Holds the state shared by both halves of the screen - the source text, its
 * highlights (which become concept nodes) and the map's edges - and switches between the chat
 * view and the split "source text | concept map" view.
 */
export default function App() {
  const [submittedText, setSubmittedText] = useState<string | null>(null);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [highlights, setHighlights] = useState<TextHighlight[]>([]); // -> nodes
  const [readMarks, setReadMarks] = useState<TextHighlight[]>([]); // -> greying only
  const [submissionId, setSubmissionId] = useState<string | null>(null);
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

  // a node was deleted on the map: forget its highlight and un-grey its text
  function handleNodeDeleted(nodeId: string) {
    // removes highlight and ungreys text
    const deletedHighlight = highlights.find((h) => h.id === nodeId);
    if (!deletedHighlight) return;

    setHighlights((prev) => prev.filter((h) => h.id !== nodeId));
    setReadMarks((prev) => prev.filter((r) => textKey(r.text) !== textKey(deletedHighlight.text)));
  }

  // ungreys text when an edge label is removed
  function handleEdgeLabelRemoved(labelText: string) {
    setReadMarks((prev) => prev.filter((r) => textKey(r.text) !== textKey(labelText)));
  }

  // clear the text, the map and all marks, and return to the chat
  function handleReset() {
    setSubmittedText(null);
    setEdges([]);
    setHighlights([]);
    setReadMarks([]);
    setSubmissionId(crypto.randomUUID());
    setSpotlightHighlightIds([]);
    setExtractionDone(false);
    setDrawerConcepts([]);
    setCanvasOpen(false);
  }

  // fills the concepts drawer in shuffled order
  function handleFinishExtraction() {
    setDrawerConcepts(shuffle(highlights));
    setExtractionDone(true);
  }

  // drawer mode: a concept was dragged onto the canvas, so remove it from the drawer
  function handleConceptPlaced(highlightId: string) {
    setDrawerConcepts((prev) => prev.filter((h) => h.id !== highlightId));
  }

  // opens the canvas with the submitted text
  function handleOpenCanvas(text: string) {
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
            sourceText={submittedText ?? ""}
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
