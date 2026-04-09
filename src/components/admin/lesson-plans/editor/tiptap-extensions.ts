import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { MaterialLinkMark } from "./nodes/material-link-mark";
import { ChecklistItemExtension } from "./nodes/checklist-item-extension";
import { CalloutExtension } from "./nodes/callout-extension";
import { ChordDiagramExtension } from "./nodes/chord-diagram-extension";

/**
 * Standard TipTap extensions for lesson plan sections. Includes paragraph,
 * headings (h2/h3 only), bold, italic, strike, bullet list, ordered list,
 * task list (for homework checklists), callouts, material links, and
 * placeholder text.
 */
export function buildLessonPlanExtensions(placeholder?: string) {
  return [
    StarterKit.configure({
      heading: { levels: [2, 3] },
      codeBlock: false,
      code: false,
      horizontalRule: false,
    }),
    TaskList,
    ChecklistItemExtension.configure({
      nested: false,
      HTMLAttributes: { class: "lesson-plan-task-item" },
    }),
    MaterialLinkMark,
    CalloutExtension,
    Image.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { class: "lesson-plan-image" },
    }),
    Placeholder.configure({
      placeholder: placeholder ?? "Start typing...",
    }),
    ChordDiagramExtension,
  ];
}
