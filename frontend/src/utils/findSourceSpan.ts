export interface SourceSpanRange {
  start: number;
  end: number;
}

/**
 * Locates a whitespace-normalized span (as produced by the backend's
 * " ".join(text.split()) normalization) back in the original, un-normalized
 * source text, returning raw character offsets suitable for a DOM Range.
 */
export function findSourceSpan(sourceText: string, span: string): SourceSpanRange | null {
  const normalizedSpan = span.split(/\s+/).filter(Boolean).join(" ").toLowerCase();
  if (!normalizedSpan) return null;

  const normChars: string[] = [];
  const origIndex: number[] = [];
  let prevWasSpace = true;

  for (let i = 0; i < sourceText.length; i++) {
    const c = sourceText[i];
    if (/\s/.test(c)) {
      if (!prevWasSpace) {
        normChars.push(" ");
        origIndex.push(i);
        prevWasSpace = true;
      }
    } else {
      normChars.push(c);
      origIndex.push(i);
      prevWasSpace = false;
    }
  }
  while (normChars.length > 0 && normChars[normChars.length - 1] === " ") {
    normChars.pop();
    origIndex.pop();
  }

  const normalized = normChars.join("").toLowerCase();
  const idx = normalized.indexOf(normalizedSpan);
  if (idx === -1) return null;

  const start = origIndex[idx];
  const end = origIndex[idx + normalizedSpan.length - 1] + 1;
  return { start, end };
}
