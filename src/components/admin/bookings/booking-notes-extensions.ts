import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { CalloutExtension } from "@/components/admin/lesson-plans/editor/nodes/callout-extension";

/**
 * TipTap extensions for booking notes. Simpler than lesson plans:
 * no chord diagrams, task lists, or material links — just rich text,
 * headings, lists, callouts, and inline images.
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
  CalloutExtension,
  Image.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: {
      class: "booking-notes-image",
    },
  }),
  Placeholder.configure({
    placeholder: "Add notes about this lesson...",
  }),
];
