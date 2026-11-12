import { useEffect, useRef, useState } from "react";
import { Handle, Position, NodeToolbar, useReactFlow, type NodeProps } from "@xyflow/react";
import "./FloatingNode.css";

const NODE_COLORS = {
  white: "#ffffff",
  green: "#dcfce7",
  blue: "#dbeafe",
  pink: "#fce7f3",
  red: "#fee2e2",
  yellow: "#fef9c3",
} as const;

type NodeColor = keyof typeof NODE_COLORS;

interface FloatingNodeData {
  label: string;
  aliases: string[];
  sourceHighlightIds: string[];
  isNew?: boolean;
  // true for a node just created from a text highlight — it should open straight into
  // rename mode instead of requiring a double-click
  autoEdit?: boolean;
  color?: NodeColor;
  wordLimitExceeded?: boolean;
}

interface FloatingNodeExtraProps {
  registerEditingHandler: (fn: ((text: string) => void) | null) => void;
  onNodeRenamed?: (nodeId: string) => void;
  onRequestDelete?: (nodeId: string) => void;
}

export function FloatingNode({
  id,
  data,
  selected,
  registerEditingHandler,
  onNodeRenamed,
  onRequestDelete,
}: NodeProps & FloatingNodeExtraProps) {
  const nodeData = data as unknown as FloatingNodeData;
  const { updateNodeData } = useReactFlow();
  const [isEditing, setIsEditing] = useState(!!nodeData.autoEdit);
  const [draftLabel, setDraftLabel] = useState(nodeData.label);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const color = nodeData.color ?? "white";

  function autoResize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  useEffect(() => {
    if (!nodeData.isNew) return;
    const timer = setTimeout(() => updateNodeData(id, { isNew: false }), 5000);
    return () => clearTimeout(timer);
  }, [nodeData.isNew, id, updateNodeData]);

  useEffect(() => {
    if (!nodeData.wordLimitExceeded) return;
    const timer = setTimeout(() => updateNodeData(id, { wordLimitExceeded: false }), 4000);
    return () => clearTimeout(timer);
  }, [nodeData.wordLimitExceeded, id, updateNodeData]);

  useEffect(() => {
    if (!nodeData.autoEdit) return;
    updateNodeData(id, { autoEdit: false });
    registerEditingHandler((text) => {
      updateNodeData(id, { label: text });
      onNodeRenamed?.(id);
      setIsEditing(false);
      registerEditingHandler(null);
    });
    // the canvas re-fits the viewport whenever a node is added, which can steal focus
    // right after mount — reassert it once that settles
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      autoResize(inputRef.current);
    }, 320);
    return () => clearTimeout(timer);
    // runs once, right after this node mounts already in edit mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDelete() {
    onRequestDelete?.(id);
  }

  function setColor(newColor: NodeColor) {
    updateNodeData(id, { color: newColor });
  }

  function startEditing() {
    setDraftLabel(nodeData.label);
    setIsEditing(true);
    // a highlight made in the source panel while this input is open replaces the label directly
    registerEditingHandler((text) => {
      updateNodeData(id, { label: text });
      onNodeRenamed?.(id);
      setIsEditing(false);
      registerEditingHandler(null);
    });
  }

  function commitEdit() {
    const trimmed = draftLabel.trim();
    if (trimmed.length > 0) {
      updateNodeData(id, { label: trimmed });
      onNodeRenamed?.(id);
    }
    setIsEditing(false);
    registerEditingHandler(null);
  }

  function cancelEditing() {
    setIsEditing(false);
    registerEditingHandler(null);
  }

  return (
    <div
      className={`floating-node ${selected ? "floating-node--selected" : ""} ${
        nodeData.isNew ? "floating-node--new" : ""
      }`}
      style={nodeData.isNew ? undefined : { backgroundColor: NODE_COLORS[color] }}
    >
      <NodeToolbar isVisible={selected && !isEditing} className="floating-node-toolbar nodrag nopan">
        <button className="floating-node-toolbar__btn" title="Rename" onClick={startEditing}>
          ✏️
        </button>
        <button className="floating-node-toolbar__btn" title="Delete" onClick={handleDelete}>
          🗑️
        </button>

        <div className="floating-node-toolbar__divider" />

        <div className="floating-node-color-picker">
          {(Object.keys(NODE_COLORS) as NodeColor[]).map((c) => (
            <button
              key={c}
              className={`floating-node-color-picker__swatch ${
                c === color ? "floating-node-color-picker__swatch--active" : ""
              }`}
              style={{ backgroundColor: NODE_COLORS[c] }}
              title={c}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
      </NodeToolbar>

      {nodeData.wordLimitExceeded && (
        <div className="floating-node__word-limit-alert nodrag nopan" role="alert">
          Try to paraphrase in your own words to maximize learning
        </div>
      )}

      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Left} id="left" />

      {isEditing ? (
        <textarea
          ref={inputRef}
          autoFocus
          rows={1}
          className="floating-node__label-input nodrag nowheel"
          value={draftLabel}
          onChange={(e) => {
            setDraftLabel(e.target.value);
            autoResize(e.target);
          }}
          onFocus={(e) => autoResize(e.target)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitEdit();
            }
            if (e.key === "Escape") cancelEditing();
          }}
        />
      ) : (
        <div className="floating-node__label" onDoubleClick={startEditing}>
          {nodeData.label}
        </div>
      )}

      {nodeData.aliases.length > 0 && (
        <ul className="floating-node__aliases">
          {nodeData.aliases.map((alias, i) => (
            <li key={i}>{alias}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
