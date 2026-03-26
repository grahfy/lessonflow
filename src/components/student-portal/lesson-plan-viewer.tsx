"use client";

import type { StudentPortalLessonPlanV2Section } from "@/lib/lesson-plan-contract";

interface LessonPlanViewerProps {
  sections: StudentPortalLessonPlanV2Section[];
  className?: string;
}

/**
 * Lightweight read-only renderer for TipTap JSON lesson plan sections.
 * Converts the ProseMirror JSON document into React elements without
 * loading the full TipTap editor, keeping the student portal bundle small.
 */
export function LessonPlanViewer({ sections, className }: LessonPlanViewerProps) {
  if (sections.length === 0) return null;

  return (
    <div className={`lesson-plan-viewer${className ? ` ${className}` : ""}`}>
      {sections.map((section) => (
        <div key={section.key} className="lesson-plan-viewer-section">
          <h4 className="lesson-plan-viewer-section-title">{section.title}</h4>
          <div className="lesson-plan-viewer-section-content">
            {renderDoc(section.content)}
          </div>
        </div>
      ))}
    </div>
  );
}

type TipTapNode = Record<string, unknown>;

function renderDoc(doc: TipTapNode): React.ReactNode {
  const content = doc.content as TipTapNode[] | undefined;
  if (!content || content.length === 0) return null;
  return content.map((node, i) => renderNode(node, i));
}

function renderNode(node: TipTapNode, key: number): React.ReactNode {
  const type = node.type as string;
  const content = node.content as TipTapNode[] | undefined;
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;

  switch (type) {
    case "paragraph":
      return (
        <p key={key} className="lp-viewer-p">
          {content ? content.map((c, i) => renderNode(c, i)) : null}
        </p>
      );

    case "heading": {
      const level = (attrs.level as number) || 2;
      const children = content ? content.map((c, i) => renderNode(c, i)) : null;
      const headingLevel = Math.min(level + 2, 6);
      if (headingLevel === 4) return <h4 key={key} className="lp-viewer-heading">{children}</h4>;
      if (headingLevel === 5) return <h5 key={key} className="lp-viewer-heading">{children}</h5>;
      return <h6 key={key} className="lp-viewer-heading">{children}</h6>;
    }

    case "bulletList":
      return (
        <ul key={key} className="lp-viewer-ul">
          {content ? content.map((c, i) => renderNode(c, i)) : null}
        </ul>
      );

    case "orderedList":
      return (
        <ol key={key} className="lp-viewer-ol">
          {content ? content.map((c, i) => renderNode(c, i)) : null}
        </ol>
      );

    case "listItem":
      return (
        <li key={key}>
          {content ? content.map((c, i) => renderNode(c, i)) : null}
        </li>
      );

    case "taskList":
      return (
        <ul key={key} className="lp-viewer-checklist">
          {content ? content.map((c, i) => renderNode(c, i)) : null}
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
            {content ? content.map((c, i) => renderNode(c, i)) : null}
          </span>
        </li>
      );
    }

    case "callout": {
      const calloutType = (attrs.calloutType as string) || "note";
      return (
        <div key={key} className={`lp-viewer-callout lp-viewer-callout-${calloutType}`}>
          {content ? content.map((c, i) => renderNode(c, i)) : null}
        </div>
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
        return content.map((c, i) => renderNode(c, i));
      }
      return null;
  }
}
