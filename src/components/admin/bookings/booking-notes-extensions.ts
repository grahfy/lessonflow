import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { CalloutExtension } from "@/components/admin/lesson-plans/editor/nodes/callout-extension";

/**
 * TipTap extensions for booking notes. Simpler than lesson plans:
 * no chord diagrams, task lists, or material links — just rich text,
 * headings, lists, callouts, and inline images.
 */
export function buildBookingNotesExtensions(placeholder?: string) {
  return [
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
      placeholder: placeholder ?? "Add notes about this lesson...",
    }),
  ];
}
