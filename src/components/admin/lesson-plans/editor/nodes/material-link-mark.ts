import { Mark, mergeAttributes } from "@tiptap/core";

export interface MaterialLinkMarkOptions {
  HTMLAttributes: Record<string, unknown>;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    materialLink: {
      setMaterialLink: (attrs: { materialId: string }) => ReturnType;
      unsetMaterialLink: () => ReturnType;
    };
  }
}

/**
 * Custom TipTap mark that wraps inline text with a learning-material reference.
 * Stored in JSON as:
 *   { type: "text", text: "chord chart", marks: [{ type: "materialLink", attrs: { materialId: "clx..." } }] }
 *
 * Renders as an underlined span with a data attribute for the material ID.
 * The admin UI overlays a tooltip via a React NodeView; in raw HTML output
 * the data-material-id attribute is available for the student portal renderer.
 */
export const MaterialLinkMark = Mark.create<MaterialLinkMarkOptions>({
  name: "materialLink",

  priority: 1000,

  addOptions() {
    return {
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      materialId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-material-id"),
        renderHTML: (attributes) => {
          if (!attributes.materialId) return {};
          return { "data-material-id": attributes.materialId };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-material-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: "tiptap-material-link",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setMaterialLink:
        (attrs) =>
        ({ commands }) => {
          return commands.setMark(this.name, attrs);
        },
      unsetMaterialLink:
        () =>
        ({ commands }) => {
          return commands.unsetMark(this.name);
        },
    };
  },
});
