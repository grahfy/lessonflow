import Image from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { BookingImageNodeView } from "./booking-image-node-view";

/**
 * Extended Image extension that renders via a React NodeView,
 * adding a hover-visible delete button over inserted images.
 *
 * Inherits all standard Image behaviour (src/alt/title attrs,
 * setImage command, paste handling). Only the rendering layer
 * is replaced.
 */
export const BookingImageExtension = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(BookingImageNodeView);
  },
});
