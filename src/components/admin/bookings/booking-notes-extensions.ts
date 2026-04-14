import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import { BookingImageExtension } from "@/components/admin/lesson-plans/editor/nodes/booking-image-extension";
import Placeholder from "@tiptap/extension-placeholder";
import { ChordDiagramExtension } from "@/components/admin/lesson-plans/editor/nodes/chord-diagram-extension";
import { CalloutExtension } from "@/components/admin/lesson-plans/editor/nodes/callout-extension";
import { ChecklistItemExtension } from "@/components/admin/lesson-plans/editor/nodes/checklist-item-extension";

/**
 * TipTap extensions for booking notes. These mirror the rich note affordances
 * admins expect in lesson plans, except for material-link embeds.
 *
 * Exported as a stable singleton so the reference identity doesn't change
 * between renders — TipTap's useEditor re-initialises the editor when the
 * extensions array changes by reference.
 */
export const bookingNotesExtensions = [
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
  CalloutExtension,
  BookingImageExtension.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: {
      class: "booking-notes-image",
    },
  }),
  Placeholder.configure({
    placeholder: "Add notes about this lesson...",
  }),
  ChordDiagramExtension,
];
