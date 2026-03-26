import { Node, mergeAttributes } from "@tiptap/core";

export type CalloutType = "tip" | "warning" | "note";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attrs?: { calloutType?: CalloutType }) => ReturnType;
      toggleCallout: (attrs?: { calloutType?: CalloutType }) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

/**
 * Block-level callout node for tips, warnings, and notes inside lesson
 * plan sections. Renders as a styled container with a type badge.
 *
 * JSON shape:
 *   { type: "callout", attrs: { calloutType: "tip" }, content: [{ type: "paragraph", ... }] }
 */
export const CalloutExtension = Node.create({
  name: "callout",

  group: "block",

  content: "block+",

  defining: true,

  addAttributes() {
    return {
      calloutType: {
        default: "note" as CalloutType,
        parseHTML: (element) =>
          (element.getAttribute("data-callout-type") as CalloutType) || "note",
        renderHTML: (attributes) => ({
          "data-callout-type": attributes.calloutType,
        }),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-callout-type]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, {
        class: `tiptap-callout tiptap-callout-${HTMLAttributes["data-callout-type"] || "note"}`,
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.wrapIn(this.name, attrs);
        },
      toggleCallout:
        (attrs) =>
        ({ commands }) => {
          return commands.toggleWrap(this.name, attrs);
        },
      unsetCallout:
        () =>
        ({ commands }) => {
          return commands.lift(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Backspace at the start of a callout lifts it back to a paragraph.
      Backspace: () => {
        const { $from } = this.editor.state.selection;
        if ($from.parentOffset !== 0) return false;
        return this.editor.commands.lift(this.name);
      },
    };
  },
});
