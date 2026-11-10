import type { ReactNode } from "react";

export interface FormattedMessage {
  nodes: ReactNode[];
  /** Concatenation of every visible character, in DOM order, with markdown syntax
   * stripped. Guaranteed to match the text content the browser will report for
   * `nodes` once mounted, so character offsets computed against it (via
   * textOffsetOf/pointAtOffset) stay valid for selection and highlighting. */
  plainText: string;
}

function isTableSeparatorLine(line: string): boolean {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line) && line.includes("-");
}

function splitTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

export function formatMessage(text: string): FormattedMessage {
  const plain: string[] = [];

  function renderInline(segment: string, keyPrefix: string): ReactNode[] {
    const nodes: ReactNode[] = [];
    const pattern = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let i = 0;

    while ((match = pattern.exec(segment)) !== null) {
      if (match.index > lastIndex) {
        const chunk = segment.slice(lastIndex, match.index);
        nodes.push(chunk);
        plain.push(chunk);
      }
      if (match[1] !== undefined) {
        nodes.push(<strong key={`${keyPrefix}-b${i++}`}>{match[1]}</strong>);
        plain.push(match[1]);
      } else if (match[2] !== undefined) {
        nodes.push(<code key={`${keyPrefix}-c${i++}`}>{match[2]}</code>);
        plain.push(match[2]);
      } else {
        const linkText = match[3] ?? "";
        const href = match[4] ?? "";
        nodes.push(
          <a key={`${keyPrefix}-a${i++}`} href={href} target="_blank" rel="noopener noreferrer">
            {linkText}
          </a>
        );
        plain.push(linkText);
      }
      lastIndex = pattern.lastIndex;
    }
    if (lastIndex < segment.length) {
      const chunk = segment.slice(lastIndex);
      nodes.push(chunk);
      plain.push(chunk);
    }
    return nodes;
  }

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let listItems: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listStart = 1;
  let listKey = 0;
  let codeLines: string[] | null = null;
  let codeKey = 0;
  let quoteLines: string[] = [];
  let quoteKey = 0;
  let tableKey = 0;

  // block-level elements (headings, paragraphs, list items) render on their own line, but
  // contribute no separating character to the DOM's text content on their own — without an
  // explicit break here, the last word of one block and the first word of the next get
  // concatenated in plainText with no boundary, so word-snapping fuses them (e.g. "ResistanceMany").
  // The separator must be pushed to `plain` *before* the block's own content is built (hence the
  // thunk) — building the node first, as with `pushBlock(<p>{renderInline(...)}</p>)`, runs
  // renderInline's plain.push calls before this function ever gets to insert the separator,
  // putting the "\n" out of order relative to the DOM's actual depth-first text order.
  function pushBlock(build: () => ReactNode) {
    if (blocks.length > 0) {
      blocks.push("\n");
      plain.push("\n");
    }
    blocks.push(build());
  }

  function flushList() {
    if (listItems.length === 0) return;
    const items = listItems;
    const type = listType;
    const start = listStart;
    listItems = [];
    listType = null;
    const key = `list-${listKey++}`;
    pushBlock(() => {
      const children: ReactNode[] = [];
      items.forEach((item, idx) => {
        // separate list items the same way blocks are separated — otherwise the last word of
        // one item and the first word of the next fuse together with no boundary in plainText
        if (idx > 0) {
          children.push("\n");
          plain.push("\n");
        }
        children.push(<li key={idx}>{renderInline(item, `${key}-${idx}`)}</li>);
      });
      return type === "ol" ? (
        <ol key={key} start={start}>
          {children}
        </ol>
      ) : (
        <ul key={key}>{children}</ul>
      );
    });
  }

  function flushCodeBlock() {
    if (codeLines === null) return;
    const content = codeLines.join("\n");
    codeLines = null;
    const key = `code-${codeKey++}`;
    // a code block's whitespace (indentation, blank lines) is meaningful, so it's pushed as a
    // single exact chunk rather than through renderInline, and rendered with white-space: pre
    pushBlock(() => {
      plain.push(content);
      return (
        <pre key={key}>
          <code>{content}</code>
        </pre>
      );
    });
  }

  function flushQuote() {
    if (quoteLines.length === 0) return;
    const items = quoteLines;
    quoteLines = [];
    const key = `quote-${quoteKey++}`;
    pushBlock(() => {
      const children: ReactNode[] = [];
      items.forEach((item, idx) => {
        if (idx > 0) {
          children.push("\n");
          plain.push("\n");
        }
        children.push(...renderInline(item, `${key}-${idx}`));
      });
      return <blockquote key={key}>{children}</blockquote>;
    });
  }

  function flushTable(header: string[], rows: string[][]) {
    const key = `table-${tableKey++}`;
    pushBlock(() => {
      const headerCells: ReactNode[] = [];
      header.forEach((cell, idx) => {
        if (idx > 0) {
          headerCells.push("\n");
          plain.push("\n");
        }
        headerCells.push(<th key={idx}>{renderInline(cell, `${key}-h${idx}`)}</th>);
      });
      const bodyRows = rows.map((row, rIdx) => {
        const cells: ReactNode[] = [];
        row.forEach((cell, cIdx) => {
          // every cell — including the first cell of each row — needs a separator: it either
          // follows the previous row's last cell or (for row 0) the header's last cell
          cells.push("\n");
          plain.push("\n");
          cells.push(<td key={cIdx}>{renderInline(cell, `${key}-r${rIdx}c${cIdx}`)}</td>);
        });
        return <tr key={rIdx}>{cells}</tr>;
      });
      return (
        <table key={key}>
          <thead>
            <tr>{headerCells}</tr>
          </thead>
          <tbody>{bodyRows}</tbody>
        </table>
      );
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    // inside a fenced code block, content is kept verbatim — no trimming, no markdown parsing
    if (codeLines !== null) {
      if (/^\s*```/.test(rawLine)) {
        flushCodeBlock();
      } else {
        codeLines.push(rawLine);
      }
      continue;
    }

    const line = rawLine.trim();

    if (/^```/.test(line)) {
      flushList();
      flushQuote();
      codeLines = [];
      continue;
    }

    if (line === "") {
      flushList();
      flushQuote();
      continue;
    }

    // a GFM table: a "| a | b |" row immediately followed by a "| --- | --- |" separator row
    if (line.includes("|") && i + 1 < lines.length && isTableSeparatorLine(lines[i + 1].trim())) {
      flushList();
      flushQuote();
      const header = splitTableRow(line);
      const rows: string[][] = [];
      i += 2; // skip header + separator
      while (i < lines.length && lines[i].trim() !== "" && lines[i].trim().includes("|")) {
        rows.push(splitTableRow(lines[i].trim()));
        i++;
      }
      i--; // outer loop will re-increment
      flushTable(header, rows);
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushList();
      quoteLines.push(quote[1]);
      continue;
    }
    flushQuote();

    if (/^([-*_])\s*(\1\s*){2,}$/.test(line)) {
      flushList();
      pushBlock(() => <hr key={i} />);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushList();
      const level = heading[1].length;
      const HeadingTag = (["h3", "h3", "h4", "h5", "h5", "h6"][level - 1] ?? "h6") as
        | "h3"
        | "h4"
        | "h5"
        | "h6";
      pushBlock(() => (
        <HeadingTag key={i}>{renderInline(heading[2], `h-${i}`)}</HeadingTag>
      ));
      continue;
    }

    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (listType !== "ul") flushList();
      listType = "ul";
      listItems.push(bullet[1]);
      continue;
    }

    const numbered = /^(\d+)[.)]\s+(.*)$/.exec(line);
    if (numbered) {
      if (listType !== "ol") {
        flushList();
        listStart = parseInt(numbered[1], 10);
      }
      listType = "ol";
      listItems.push(numbered[2]);
      continue;
    }

    flushList();
    pushBlock(() => <p key={i}>{renderInline(line, `p-${i}`)}</p>);
  }

  flushCodeBlock();
  flushList();
  flushQuote();

  return { nodes: blocks, plainText: plain.join("") };
}
