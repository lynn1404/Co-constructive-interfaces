const isWordChar = (c: string) => /\w/.test(c);

interface WordBounds {
  start: number;
  end: number;
}

function wordBoundsAt(text: string, index: number): WordBounds | null {
  if (index < 0 || index >= text.length || !isWordChar(text[index])) {
    return null; // index sits on whitespace/punctuation — no word to snap to
  }

  let start = index;
  let end = index;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;

  return { start, end };
}

export interface SnappedSelection {
  start: number;
  end: number;
  text: string;
}

export function snapSelectionToWords(
  fullText: string,
  rawStart: number,
  rawEnd: number,
): SnappedSelection | null {
  // normalize: caller might pass indices out of order (e.g. a right-to-left drag)
  let start = Math.min(rawStart, rawEnd);
  let end = Math.max(rawStart, rawEnd);

  if (end <= start) return null;

  // Left edge: if we're inside a word, walk back to its start
  const startWord = wordBoundsAt(fullText, start);
  if (startWord) start = startWord.start;

  // Right edge: if we're inside a word, walk forward to its end.
  // end is exclusive (one past the last selected char), so we check the
  // word at end - 1, the last actually-selected character.
  const endWord = wordBoundsAt(fullText, end - 1);
  if (endWord) end = endWord.end;

  const text = fullText.slice(start, end);
  return { start, end, text };
}
