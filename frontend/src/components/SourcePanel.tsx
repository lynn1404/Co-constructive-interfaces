import { useState, useRef, useMemo } from "react";
import { snapSelectionToWords } from "../utils/snapSelection";
import { textOffsetOf, pointAtOffset } from "../utils/domOffset";
import { findSourceSpan } from "../utils/findSourceSpan";
import { segmentConcepts, sendChat } from "../api";
import { formatMessage } from "../utils/formatMessage";
import "./SourcePanel.css";
import { useEffect } from "react";
import type { TextHighlight, ChatClassification, MappableShape } from "../types";
import type { Edge } from "@xyflow/react";
import {debugLog} from "../utils/debug";

export type HighlightMode = "concepts" | "phrases";

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

const SHAPE_BANNER_LABELS: Record<MappableShape, string> = {
  concept_map: "Concept map",
  comparison: "Compare",
  flowchart: "Flowchart",
  sequence: "Sequence",
};

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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [segmenting, setSegmenting] = useState(false);
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  // raw markdown of whichever assistant message is currently shown in the canvas view —
  // kept separate from submittedText (which holds the plain, offset-aligned rendering of it)
  // so the source panel can display the same bold/heading formatting as the chat bubble
  const [canvasRawText, setCanvasRawText] = useState<string | null>(null);
  const [dismissedNudges, setDismissedNudges] = useState<Set<string>>(new Set());
  const textHidden = hideTextAfterExtraction && extractionDone;
  const messageBodyRef = useRef<HTMLDivElement>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const formattedCanvasMessage = useMemo(() => formatMessage(canvasRawText ?? ""), [canvasRawText]);

  useEffect(() => {
    if (!canvasOpen) {
      threadEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [turns, canvasOpen]);

  const latestNudgeTurn = useMemo(() => {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.role === "assistant" && t.classification?.is_mappable && !dismissedNudges.has(t.id)) {
        return t;
      }
    }
    return null;
  }, [turns, dismissedNudges]);

  useEffect(() => {
    if (submittedText === null) setCanvasRawText(null);
  }, [submittedText]);

  useEffect(() => {
    if (!settingsOpen) return;
    function handlePointerDown(e: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setSettingsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

  useEffect(() => {
    const container = messageBodyRef.current;
    if (!container || !container.firstChild) return;

    const ranges = readMarks
      .map((h) => {
        const start = pointAtOffset(container, h.start);
        const end = pointAtOffset(container, h.end);
        if (!start || !end) return null;
        const range = new Range();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        return range;
      })
      .filter((r): r is Range => r !== null);

    const highlight = new Highlight(...ranges);
    CSS.highlights.set("read-highlight", highlight);

    return () => {
      CSS.highlights.delete("read-highlight");
    };
  }, [readMarks, formattedCanvasMessage]);

  useEffect(() => {
    const container = messageBodyRef.current;
    if (!container || !container.firstChild) return;

    const spotlightSet = new Set(spotlightHighlightIds);

    const ranges = highlights
      .filter((h) => spotlightSet.has(h.id))
      .map((h) => {
        const start = pointAtOffset(container, h.start);
        const end = pointAtOffset(container, h.end);
        if (!start || !end) return null;
        const range = new Range();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        return range;
      })
      .filter((r): r is Range => r !== null);

    const highlight = new Highlight(...ranges);
    CSS.highlights.set("spotlight-highlight", highlight);

    return () => {
      CSS.highlights.delete("spotlight-highlight");
    };
  }, [spotlightHighlightIds, highlights, formattedCanvasMessage]);

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

    // a node or edge label is being edited — this highlight replaces its label instead of
    // creating anything new
    if (editingHighlightRef.current) {
      editingHighlightRef.current(snapped.text);
      return;
    }

    const pendingEdge = edges.find((e) => (e.data as { isPending?: boolean } | undefined)?.isPending);

    if (pendingEdge) {
      const onSubmitLabel = (pendingEdge.data as { onSubmitLabel?: (label: string) => void } | undefined)
        ?.onSubmitLabel;
      onSubmitLabel?.(snapped.text);
      return; // don't also create a node from this highlight
    }

    if (highlightMode === "concepts") {
      const wordLimitExceeded = wordCount(snapped.text) > MAX_CONCEPT_WORDS;
      setHighlights((prev) => [...prev, { id: crypto.randomUUID(), ...snapped, wordLimitExceeded }]);
      setReadMarks((prev) => [...prev, { id: crypto.randomUUID(), ...snapped }]);
      return;
    }

    if (highlightMode === "phrases") {
      setSegmenting(true);
      try {
        const { concepts } = await segmentConcepts({
          highlighted_text: snapped.text,
          full_text: submittedText ?? undefined,
        });

        if (concepts.length === 0) return;

        // The segmenter may paraphrase a concept's label instead of quoting the span
        // verbatim, so source_span won't always be found in the source text. When that
        // happens, point the concept at the whole highlighted span rather than guessing.
        const newHighlights: TextHighlight[] = concepts.map((c) => {
          const located = findSourceSpan(submittedText ?? "", c.source_span);
          return located
            ? { id: crypto.randomUUID(), start: located.start, end: located.end, text: c.label }
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
      return;
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

          <div className="source-panel__settings" ref={settingsRef}>
            <button
              className={`source-panel__settings-btn ${settingsOpen ? "source-panel__settings-btn--active" : ""}`}
              onClick={() => setSettingsOpen((v) => !v)}
              title="Settings"
              aria-label="Settings"
              aria-expanded={settingsOpen}
            >
              ⚙
            </button>

            {settingsOpen && (
              <div className="source-panel__settings-panel" role="menu">
                <div className="source-panel__settings-header">
                  <span>Settings</span>
                  <button
                    className="source-panel__settings-close"
                    onClick={() => setSettingsOpen(false)}
                    aria-label="Close settings"
                    title="Close"
                  >
                    ✕
                  </button>
                </div>

                <div className="source-panel__settings-section">
                  <div className="source-panel__settings-section-title">Edge labels</div>
                  <label
                    className="source-panel__toggle-row"
                    title="When on, new edges are labeled by picking from a category and link list. When off, edges get a free-text label."
                  >
                    <span className="source-panel__toggle-row-text">
                      <span className="source-panel__toggle-row-label">Labels from categories</span>
                      <span className="source-panel__toggle-row-desc">
                        Pick edge labels from a category list instead of typing free text
                      </span>
                    </span>
                    <span
                      className={`source-panel__switch ${restrictedLinks ? "source-panel__switch--on" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={restrictedLinks}
                        onChange={(e) => setRestrictedLinks(e.target.checked)}
                      />
                      <span className="source-panel__switch-track">
                        <span className="source-panel__switch-thumb" />
                      </span>
                    </span>
                  </label>
                </div>

                <div className="source-panel__settings-section">
                  <div className="source-panel__settings-section-title">Highlight mode</div>
                  <div className="source-panel__mode-toggle" role="radiogroup" aria-label="Highlight mode">
                    <label className="source-panel__radio-row">
                      <input
                        type="radio"
                        name="highlight-mode"
                        checked={highlightMode === "concepts"}
                        onChange={() => setHighlightMode("concepts")}
                      />
                      <span>
                        <span className="source-panel__toggle-row-label">Highlight concepts</span>
                        <span className="source-panel__toggle-row-desc">
                          Each highlighted span becomes its own node
                        </span>
                      </span>
                    </label>
                    <label
                      className="source-panel__radio-row"
                      title="Select a span of text; on release it's sent for concept segmentation, and each returned concept becomes its own node"
                    >
                      <input
                        type="radio"
                        name="highlight-mode"
                        checked={highlightMode === "phrases"}
                        onChange={() => setHighlightMode("phrases")}
                      />
                      <span>
                        <span className="source-panel__toggle-row-label">Highlight phrases</span>
                        <span className="source-panel__toggle-row-desc">
                          Selected text is auto-segmented into multiple concept nodes
                        </span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="source-panel__settings-section">
                  <div className="source-panel__settings-section-title">Source text</div>
                  <label
                    className="source-panel__toggle-row"
                    title="When on, click Done after highlighting to hide the source text and move extracted concepts into a drawer to build the map from scratch"
                  >
                    <span className="source-panel__toggle-row-text">
                      <span className="source-panel__toggle-row-label">Hide text after extraction</span>
                      <span className="source-panel__toggle-row-desc">
                        Move extracted concepts into a drawer and build the map from scratch
                      </span>
                    </span>
                    <span
                      className={`source-panel__switch ${hideTextAfterExtraction ? "source-panel__switch--on" : ""} ${extractionDone ? "source-panel__switch--disabled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={hideTextAfterExtraction}
                        disabled={extractionDone}
                        onChange={(e) => setHideTextAfterExtraction(e.target.checked)}
                      />
                      <span className="source-panel__switch-track">
                        <span className="source-panel__switch-thumb" />
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            )}
          </div>
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
        <div className="chat-thread">
          {turns.length === 0 ? (
            <div className="source-panel__placeholder chat-thread__placeholder">
              Ask something to get started
            </div>
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
      )}

      {!canvasOpen &&
        !sending &&
        latestNudgeTurn &&
        (() => {
          const turn = latestNudgeTurn;
          const classification = turn.classification!;
          const shapes = classification.shapes;
          const primary = shapes.find((s) => s.shape === classification.primary) ?? shapes[0];
          const others = shapes.filter((s) => s !== primary);
          return (
            <div className="chat-shape-banner" key={turn.id}>
              <span className="chat-shape-banner__dot" aria-hidden="true" />
              <div className="chat-shape-banner__text">
                <p className="chat-shape-banner__title">
                  Looks like you're building your understanding on something new.
                </p>
                <p className="chat-shape-banner__body">
                  AI answers can be mistaken for genuine understanding, try reworking the ideas yourself.
                </p>
              </div>
              <div className="chat-shape-banner__actions">
                {primary && (
                  <button
                    className="chat-shape-banner__button"
                    disabled={primary.shape !== "concept_map"}
                    title={primary.shape !== "concept_map" ? "Not supported yet" : primary.reason}
                    onClick={() => handleOpenCanvasFor(turn.content)}
                  >
                    {SHAPE_BANNER_LABELS[primary.shape]}
                  </button>
                )}
                {others.length === 1 && (
                  <button
                    className="chat-shape-banner__button"
                    disabled={others[0].shape !== "concept_map"}
                    title={others[0].shape !== "concept_map" ? "Not supported yet" : others[0].reason}
                    onClick={() => handleOpenCanvasFor(turn.content)}
                  >
                    {SHAPE_BANNER_LABELS[others[0].shape]}
                  </button>
                )}
                {others.length > 1 && (
                  <button
                    className="chat-shape-banner__button"
                    title={others.map((s) => SHAPE_BANNER_LABELS[s.shape]).join(", ")}
                    onClick={() => handleOpenCanvasFor(turn.content)}
                  >
                    More
                  </button>
                )}
                <button
                  className="chat-shape-banner__close"
                  title="Dismiss"
                  onClick={() => setDismissedNudges((prev) => new Set(prev).add(turn.id))}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })()}

      {!canvasOpen && (
        <>
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
