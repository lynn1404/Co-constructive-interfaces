export function textOffsetOf(root: Node, targetNode: Node, offsetInTarget: number): number {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let total = 0;
  let current = walker.nextNode();

  while (current) {
    if (current === targetNode) {
      return total + offsetInTarget;
    }
    total += current.textContent?.length ?? 0;
    current = walker.nextNode();
  }

  return total; // fallback: targetNode wasn't a text node (rare)
}

/** Inverse of textOffsetOf: locate the text node + local offset for a character offset
 * into the concatenated text content of root. Needed because a formatted message body
 * spans several text nodes (paragraphs, bold spans, list items) rather than one. */
export function pointAtOffset(root: Node, offset: number): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let remaining = offset;
  let current = walker.nextNode() as Text | null;
  let last: Text | null = null;

  while (current) {
    const len = current.textContent?.length ?? 0;
    if (remaining <= len) {
      return { node: current, offset: remaining };
    }
    remaining -= len;
    last = current;
    current = walker.nextNode() as Text | null;
  }

  if (last) return { node: last, offset: last.textContent?.length ?? 0 };
  return null;
}
