import { Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ChordDiagramNodeView } from "./chord-diagram-node-view";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    chordDiagram: {
      insertChordDiagram: (attrs: { chordData: object; chordId?: string }) => ReturnType;
    };
  }
}

/**
 * TipTap atom node for inline chord diagrams in lesson plans.
 *
 * Stores the full ChordDiagramData as a JSON attribute so lesson plans
 * are self-contained snapshots. The optional chordId links back to the
 * library for provenance but is not a live binding.
 *
 * JSON shape:
 *   { type: "chordDiagram", attrs: { chordData: {...}, chordId?: "clx..." } }
 */
export const ChordDiagramExtension = Node.create({
  name: "chordDiagram",

  group: "block",

  atom: true,

  draggable: true,

  addAttributes() {
    return {
      chordData: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("data-chord-data");
          if (!raw) return null;
          try { return JSON.parse(raw); } catch { return null; }
        },
        renderHTML: (attributes) => ({
          "data-chord-data": JSON.stringify(attributes.chordData),
        }),
      },
      chordId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-chord-id"),
        renderHTML: (attributes) => {
          if (!attributes.chordId) return {};
          return { "data-chord-id": attributes.chordId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-chord-diagram]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-chord-diagram": "" }, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChordDiagramNodeView);
  },

  addCommands() {
    return {
      insertChordDiagram:
        (attrs) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs,
          });
        },
    };
  },
});
