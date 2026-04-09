/**
 * Server-safe TipTap JSON utilities.
 * No dependency on the TipTap editor runtime — works with raw JSON documents.
 */

type TipTapNode = {
  type?: string;
  text?: string;
  content?: TipTapNode[];
  attrs?: Record<string, unknown>;
};

/**
 * Walks a TipTap JSONContent document and returns the concatenated plain text.
 * Useful for deriving a searchable `notes` string from rich `notesContent`.
 */
export function tiptapJsonToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  return extractText(doc as TipTapNode).trim();
}

function extractText(node: TipTapNode): string {
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }

  if (!Array.isArray(node.content)) return "";

  const parts: string[] = [];
  for (const child of node.content) {
    const text = extractText(child);
    if (text) parts.push(text);
  }

  // Add newlines between block-level nodes for readable plain text.
  const blockTypes = new Set([
    "paragraph", "heading", "bulletList", "orderedList",
    "listItem", "taskList", "taskItem", "callout",
  ]);

  if (node.type && blockTypes.has(node.type)) {
    return parts.join("") + "\n";
  }

  return parts.join("");
}

/**
 * Wraps a plain-text string into a minimal TipTap document with one paragraph.
 * Used when migrating old plain-text notes into the TipTap editor.
 */
export function plainTextToTiptapJson(text: string): { type: "doc"; content: Array<Record<string, unknown>> } {
  if (!text.trim()) {
    return { type: "doc", content: [] };
  }

  const paragraphs = text.split(/\n+/).filter(Boolean);
  return {
    type: "doc",
    content: paragraphs.map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    })),
  };
}
