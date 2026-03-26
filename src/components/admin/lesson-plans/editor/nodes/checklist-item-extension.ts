import TaskItem from "@tiptap/extension-task-item";
/**
 * Generates a short unique ID for homework checklist items.
 * Uses crypto.randomUUID which is available in all modern browsers and Node 19+.
 */
function generateItemId(): string {
  return `hw_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

/**
 * Extended TaskItem that auto-generates a unique `itemId` on each new
 * checklist item. This ID is stored in the TipTap JSON and used as the
 * foreign key for `HomeworkCompletion` rows — students toggle this exact
 * ID from the portal.
 *
 * Existing items (from loaded JSON) preserve their `itemId`. Only newly
 * created items get a fresh CUID.
 */
export const ChecklistItemExtension = TaskItem.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      itemId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-item-id"),
        renderHTML: (attributes) => {
          // Generate an ID if one wasn't loaded from JSON.
          const id = attributes.itemId || generateItemId();
          return { "data-item-id": id };
        },
        // Ensure new items always get an ID when created programmatically.
        keepOnSplit: false,
      },
    };
  },

  // Override the default creation to inject an itemId.
  onCreate() {
    // Walk all existing taskItem nodes and backfill missing IDs.
    this.editor.state.doc.descendants((node, pos) => {
      if (node.type.name === this.name && !node.attrs.itemId) {
        this.editor.view.dispatch(
          this.editor.state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            itemId: generateItemId(),
          })
        );
      }
    });
  },

  parseHTML() {
    return [
      {
        tag: `li[data-type="taskItem"]`,
        // Priority higher than the base taskItem so we win the parse race.
        priority: 51,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = {
      ...HTMLAttributes,
      "data-type": "taskItem",
      "data-item-id": node.attrs.itemId || generateItemId(),
      "data-checked": node.attrs.checked ? "true" : "false",
    };
    return ["li", attrs, ["label", ["input", { type: "checkbox", checked: node.attrs.checked }]], ["div", 0]];
  },
});
