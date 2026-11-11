import { useEffect, useMemo, useRef, useState } from "react";
import type { Edge } from "@xyflow/react";

import { segmentConcepts, sendChat } from "../api";
import { useCssHighlight } from "../hooks/useCssHighlight";
import type { ChatClassification, HighlightMode, TextHighlight } from "../types";
import { debugLog } from "../utils/debug";
import { textOffsetOf } from "../utils/domOffset";
import { findSourceSpan } from "../utils/findSourceSpan";
import { formatMessage } from "../utils/formatMessage";
import { snapSelectionToWords } from "../utils/snapSelection";
import { SettingsMenu } from "./SettingsMenu";
import { ShapeNudgeBanner } from "./ShapeNudgeBanner";
import "./SourcePanel.css";

const MAX_CONCEPT_WORDS = 5;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface ChatTurn {
  id: string;
  role: "user" | "assistant";
  content: string;
  classification?: ChatClassification;
}

interface Props {
  highlights: TextHighlight[];
  setHighlights: React.Dispatch<React.SetStateAction<TextHighlight[]>>;
  readMarks: TextHighlight[];
  setReadMarks: React.Dispatch<React.SetStateAction<TextHighlight[]>>;
  submittedText: string | null;
  setSubmittedText: React.Dispatch<React.SetStateAction<string | null>>;
  edges: Edge[];
  setSubmissionId: React.Dispatch<React.SetStateAction<string | null>>;
  spotlightHighlightIds: string[];
  editingHighlightRef: React.RefObject<((text: string) => void) | null>;
  hideTextAfterExtraction: boolean;
  setHideTextAfterExtraction: React.Dispatch<React.SetStateAction<boolean>>;
  extractionDone: boolean;
  onFinishExtraction: () => void;
  highlightMode: HighlightMode;
  setHighlightMode: React.Dispatch<React.SetStateAction<HighlightMode>>;
  restrictedLinks: boolean;
  setRestrictedLinks: React.Dispatch<React.SetStateAction<boolean>>;
  canvasOpen: boolean;
  onOpenCanvas: (text: string) => void;
  onBackToChat: () => void;
}

export function SourcePanel({
  highlights,
  setHighlights,
  readMarks,
  setReadMarks,
  submittedText,
  setSubmittedText,
  edges,
  setSubmissionId,
  spotlightHighlightIds,
  editingHighlightRef,
  hideTextAfterExtraction,
  setHideTextAfterExtraction,
  extractionDone,
  onFinishExtraction,
  highlightMode,
  setHighlightMode,
  restrictedLinks,
  setRestrictedLinks,
  canvasOpen,
  onOpenCanvas,
  onBackToChat,
}: Props) {
  const [draft, setDraft] = useState("");
  const [segmenting, setSegmenting] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  // raw markdown of the assistant message shown in the canvas view - kept separate from
  // submittedText (its plain, offset-aligned rendering) so the source panel can show the same
  // bold/heading formatting as the chat bubble
  const [canvasRawText, setCanvasRawText] = useState<string | null>(null);
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  const textHidden = hideTextAfterExtraction && extractionDone;
  const messageBodyRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const formattedCanvasMessage = useMemo(() => formatMessage(canvasRawText ?? ""), [canvasRawText]);

  // keep the newest chat message in view
  useEffect(() => {
    if (!canvasOpen) threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [turns, canvasOpen]);

  // the most recent mappable answer the student has not dismissed gets the "build a map" banner
  const latestNudgeTurn = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.role === "assistant" && t.classification?.is_mappable && !dismissedNudges.has(t.id)) {
        return t;
      }
    }
    return null;
  }, [turns, dismissedNudges]);

  // grey out text already used, and spotlight the text behind the selected node
  const spotlightSpans = useMemo(() => {
    const ids = new Set(spotlightHighlightIds);
    return highlights.filter((h) => ids.has(h.id));
  }, [highlights, spotlightHighlightIds]);
  useCssHighlight(messageBodyRef, "read-highlight", readMarks, formattedCanvasMessage);
  useCssHighlight(messageBodyRef, "spotlight-highlight", spotlightSpans, formattedCanvasMessage);

  async function handleSubmit() {
    if (!draft.trim() || sending) return;
    const message = draft;
    setDraft("");
    setChatError(null);
    setSending(true);
    const userTurnId = crypto.randomUUID();
    setTurns((prev) => [...prev, { id: userTurnId, role: "user", content: message }]);
    try {
      const history = turns.map((t) => ({ role: t.role, content: t.content }));
      const { answer, classification } = await sendChat({ message, history });
      debugLog("chat question:", message);
      debugLog("chat answer:", answer);
      debugLog("chat classification:", classification);

      setTurns((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "assistant", content: answer, classification },
      ]);
      setCanvasRawText(answer);
      setSubmittedText(formatMessage(answer).plainText);
      setSubmissionId(crypto.randomUUID()); // always unique, even for repeated text
      setHighlights([]);
      setReadMarks([]);
    } catch (err) {
      console.error("chat failed:", err);
      setChatError("Couldn't reach the assistant. Please try again.");
      setDraft(message);
      setTurns((prev) => prev.filter((t) => t.id !== userTurnId));
    } finally {
      setSending(false);
    }
  }

  async function handleMouseUp() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

    const container = messageBodyRef.current;
    if (!container) return;

    const range = selection.getRangeAt(0);
    if (!container.contains(range.commonAncestorContainer)) return;

    const rawStart = textOffsetOf(container, range.startContainer, range.startOffset);
    const rawEnd = textOffsetOf(container, range.endContainer, range.endOffset);

    const snapped = snapSelectionToWords(submittedText ?? "", rawStart, rawEnd);
    selection.removeAllRanges();

    if (!snapped || snapped.text.trim().length === 0) return;

    // a node or edge label is being edited - this highlight replaces its label
    if (editingHighlightRef.current) {
      editingHighlightRef.current(snapped.text);
      return;
    }

    // an edge is waiting for its label - this highlight becomes that label
    const pendingEdge = edges.find((e) => (e.data as { isPending?: boolean } | undefined)?.isPending);
    if (pendingEdge) {
      const onSubmitLabel = (pendingEdge.data as { onSubmitLabel?: (label: string) => void } | undefined)
        ?.onSubmitLabel;
      onSubmitLabel?.(snapped.text);
      return;
    }

    if (highlightMode === "concepts") {
      const wordLimitExceeded = wordCount(snapped.text) > MAX_CONCEPT_WORDS;
      setHighlights((prev) => [...prev, { id: crypto.randomUUID(), ...snapped, wordLimitExceeded }]);
      setReadMarks((prev) => [...prev, { id: crypto.randomUUID(), ...snapped }]);
      return;
    }

    // "phrases" mode: the backend splits the selection into several concepts
    setSegmenting(true);
    try {
      const { concepts } = await segmentConcepts({
        highlighted_text: snapped.text,
        full_text: submittedText ?? undefined,
      });
      if (concepts.length === 0) return;

      // Look for each concept's source_span inside the selection only, so a word that also
      // appears earlier in the text is not highlighted in the wrong place. The segmenter may
      // paraphrase, so when the span is not found, point the concept at the whole selection.
      const newHighlights: TextHighlight[] = concepts.map((c) => {
        const located = findSourceSpan(snapped.text, c.source_span);
        return located
          ? {
              id: crypto.randomUUID(),
              start: snapped.start + located.start,
              end: snapped.start + located.end,
              text: c.label,
            }
          : { id: crypto.randomUUID(), start: snapped.start, end: snapped.end, text: c.label };
      });

      setHighlights((prev) => [...prev, ...newHighlights]);
      setReadMarks((prev) => [...prev, ...newHighlights.map((h) => ({ ...h, id: crypto.randomUUID() }))]);
    } catch (err) {
      console.error("segment-concepts failed, falling back to raw highlight:", err);
      setHighlights((prev) => [...prev, { id: crypto.randomUUID(), ...snapped }]);
      setReadMarks((prev) => [...prev, { id: crypto.randomUUID(), ...snapped }]);
    } finally {
      setSegmenting(false);
    }
  }

  function handleOpenCanvasFor(rawContent: string) {
    setCanvasRawText(rawContent);
    onOpenCanvas(formatMessage(rawContent).plainText);
  }

  return (
    <div className={`source-panel ${canvasOpen ? "" : "source-panel--chat"}`}>
      {canvasOpen && (
        <>
          <button className="source-panel__back-button" onClick={onBackToChat}>
            ← Back to chat
          </button>

          <SettingsMenu
            restrictedLinks={restrictedLinks}
            setRestrictedLinks={setRestrictedLinks}
            highlightMode={highlightMode}
            setHighlightMode={setHighlightMode}
            hideTextAfterExtraction={hideTextAfterExtraction}
            setHideTextAfterExtraction={setHideTextAfterExtraction}
            extractionDone={extractionDone}
          />
          {segmenting && <span className="source-panel__segmenting">Segmenting…</span>}

          <div
            className={`source-panel__placeholder-zone ${submittedText !== null && !textHidden ? "source-panel__placeholder-zone--scroll" : ""}`}
          >
            {submittedText === null ? (
              <div className="source-panel__placeholder">Start by providing a text</div>
            ) : textHidden ? (
              <div className="source-panel__placeholder source-panel__placeholder--hidden">
                Source text hidden — build the map from the concepts drawer.
              </div>
            ) : (
              <div className="source-panel__message-body" ref={messageBodyRef} onMouseUp={handleMouseUp}>
                {formattedCanvasMessage.nodes}
              </div>
            )}
          </div>

          {hideTextAfterExtraction && submittedText !== null && !extractionDone && (
            <div className="source-panel__done-bar">
              <button
                className="source-panel__done-button"
                onClick={onFinishExtraction}
                disabled={highlights.length === 0}
                title={
                  highlights.length === 0
                    ? "Highlight at least one concept first"
                    : "Hide the text and move extracted concepts into the drawer"
                }
              >
                Done extracting
              </button>
            </div>
          )}
        </>
      )}

      {!canvasOpen && (
        <>
          <div className="chat-thread">
            {turns.length === 0 ? (
              <div className="source-panel__placeholder chat-thread__placeholder">Ask something to get started</div>
            ) : (
              turns.map((turn) => (
                <div key={turn.id} className={`chat-bubble-row chat-bubble-row--${turn.role}`}>
                  <div className={`chat-bubble chat-bubble--${turn.role}`}>
                    {turn.role === "assistant" ? formatMessage(turn.content).nodes : turn.content}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="chat-bubble-row chat-bubble-row--assistant">
                <div className="chat-bubble chat-bubble--assistant chat-bubble--loading">
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                  <span className="chat-typing-dot" />
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>

          {!sending && latestNudgeTurn?.classification && (
            <ShapeNudgeBanner
              key={latestNudgeTurn.id}
              classification={latestNudgeTurn.classification}
              onOpenCanvas={() => handleOpenCanvasFor(latestNudgeTurn.content)}
              onDismiss={() => setDismissedNudges((prev) => new Set(prev).add(latestNudgeTurn.id))}
            />
          )}

          {chatError && <div className="source-panel__chat-error">{chatError}</div>}

          <div className="source-panel__input-bar">
            <input
              className="source-panel__input"
              placeholder={sending ? "Waiting for response…" : "Ask something…"}
              value={draft}
              disabled={sending}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
            <button className="source-panel__send-button" onClick={handleSubmit} disabled={sending}>
              {sending ? "…" : "➤"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
