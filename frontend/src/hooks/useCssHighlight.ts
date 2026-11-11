import { useEffect, type RefObject } from "react";

import type { TextHighlight } from "../types";
import { pointAtOffset } from "../utils/domOffset";

/**
 * Paint `spans` inside the container using the browser's CSS Custom Highlight API, registered
 * under `name` (styled in CSS with `::highlight(name)`). Span offsets index into the container's
 * text content. `contentKey` must change whenever the container's DOM is re-rendered.
 */
export function useCssHighlight(
  containerRef: RefObject<HTMLElement | null>,
  name: string,
  spans: TextHighlight[],
  contentKey: unknown,
): void {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !container.firstChild) return;

    const ranges = spans
      .map((span) => {
        const start = pointAtOffset(container, span.start);
        const end = pointAtOffset(container, span.end);
        if (!start || !end) return null;
        const range = new Range();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        return range;
      })
      .filter((range): range is Range => range !== null);

    CSS.highlights.set(name, new Highlight(...ranges));
    return () => {
      CSS.highlights.delete(name);
    };
  }, [containerRef, name, spans, contentKey]);
}
