"use client";

import { renderChordSvg } from "@/lib/chords/chord-svg";
import type { ChordDiagramData } from "@/lib/chords/chord-types";

export type TipTapNode = Record<string, unknown>;

/**
 * Shared read-only renderer for TipTap JSON documents. Used by the
 * lesson plan viewer and booking notes viewer in the student portal.
 * Does not load the TipTap editor bundle — works with raw ProseMirror JSON.
 */
export type RenderOptions = {
  bookingId?: string;
};

export function renderDoc(doc: TipTapNode, options?: RenderOptions): React.ReactNode {
  const content = doc.content as TipTapNode[] | undefined;
  if (!content || content.length === 0) return null;
  return content.map((node, i) => renderNode(node, i, options));
}

/**
 * Renders a single TipTap node. When used inside the student portal,
 * image `src` URLs that point to admin endpoints are rewritten to
 * the student-accessible endpoint.
 */
export function renderNode(
  node: TipTapNode,
  key: number,
  options?: { bookingId?: string }
): React.ReactNode {
  const type = node.type as string;
  const content = node.content as TipTapNode[] | undefined;
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  const renderChildren = () =>
    content ? content.map((c, i) => renderNode(c, i, options)) : null;

  switch (type) {
    case "paragraph":
      return (
        <p key={key} className="lp-viewer-p">
          {renderChildren()}
        </p>
      );

    case "heading": {
      const level = (attrs.level as number) || 2;
      const children = renderChildren();
      const headingLevel = Math.min(level + 2, 6);
      if (headingLevel === 4) return <h4 key={key} className="lp-viewer-heading">{children}</h4>;
      if (headingLevel === 5) return <h5 key={key} className="lp-viewer-heading">{children}</h5>;
      return <h6 key={key} className="lp-viewer-heading">{children}</h6>;
    }

    case "bulletList":
      return (
        <ul key={key} className="lp-viewer-ul">
          {renderChildren()}
        </ul>
      );

    case "orderedList":
      return (
        <ol key={key} className="lp-viewer-ol">
          {renderChildren()}
        </ol>
      );

    case "listItem":
      return (
        <li key={key}>
          {renderChildren()}
        </li>
      );

    case "taskList":
      return (
        <ul key={key} className="lp-viewer-checklist">
          {renderChildren()}
        </ul>
      );

    case "taskItem": {
      const checked = attrs.checked as boolean;
      const itemId = attrs.itemId as string;
      return (
        <li key={key} className="lp-viewer-checklist-item" data-item-id={itemId}>
          <span className={`lp-viewer-checkbox${checked ? " is-checked" : ""}`}>
            {checked ? "\u2611" : "\u2610"}
          </span>
          <span className={checked ? "lp-viewer-checked-text" : ""}>
            {renderChildren()}
          </span>
        </li>
      );
    }

    case "callout": {
      const calloutType = (attrs.calloutType as string) || "note";
      return (
        <div key={key} className={`lp-viewer-callout lp-viewer-callout-${calloutType}`}>
          {renderChildren()}
        </div>
      );
    }

    case "chordDiagram": {
      const chordData = attrs.chordData as ChordDiagramData | null;
      if (!chordData) return null;
      const svg = renderChordSvg(chordData, {
        width: 160,
        height: 220,
        showTitle: true,
        showNoteNames: true,
        showFingerNumbers: true,
      });
      return (
        <div
          key={key}
          className="lp-viewer-chord-diagram"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      );
    }

    case "image": {
      let src = attrs.src as string;
      // Rewrite admin image URLs to student-accessible endpoints.
      if (options?.bookingId && src) {
        const adminPattern = /\/api\/admin\/bookings\/[^/]+\/notes-image\/([^/]+)/;
        const match = src.match(adminPattern);
        if (match) {
          src = `/api/student/booking-notes-image/${options.bookingId}/${match[1]}`;
        }
      }
      return (
        <img
          key={key}
          src={src}
          alt={(attrs.alt as string) || ""}
          className="lp-viewer-image"
        />
      );
    }

    case "text": {
      const text = node.text as string;
      const marks = node.marks as Array<{ type: string; attrs?: Record<string, unknown> }> | undefined;

      if (!marks || marks.length === 0) {
        return text;
      }

      let result: React.ReactNode = text;
      for (const mark of marks) {
        switch (mark.type) {
          case "bold":
            result = <strong key={key}>{result}</strong>;
            break;
          case "italic":
            result = <em key={key}>{result}</em>;
            break;
          case "strike":
            result = <s key={key}>{result}</s>;
            break;
          case "materialLink": {
            const materialId = mark.attrs?.materialId as string;
            result = (
              <span
                key={key}
                className="lp-viewer-material-link"
                data-material-id={materialId}
              >
                {result}
              </span>
            );
            break;
          }
        }
      }

      return result;
    }

    default:
      // Unknown node type — render children if any.
      if (content) {
        return renderChildren();
      }
      return null;
  }
}
