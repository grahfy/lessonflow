"use client";

import { useCallback, useMemo, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { TipTapEditor } from "@/components/admin/lesson-plans/editor/tiptap-editor";
import { BookingNotesToolbar } from "./booking-notes-toolbar";
import { buildBookingNotesExtensions } from "./booking-notes-extensions";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

interface BookingNotesEditorProps {
  content: JSONContent | null;
  onUpdate: (json: JSONContent) => void;
  /** Booking ID used to construct the image upload endpoint. */
  bookingId: string | null;
  className?: string;
}

/**
 * Rich text editor for booking notes. Wraps the shared TipTapEditor with
 * booking-specific extensions (no chord diagrams, adds image support)
 * and a custom toolbar with an image upload button.
 */
export function BookingNotesEditor({
  content,
  onUpdate,
  bookingId,
  className,
}: BookingNotesEditorProps) {
  const extensions = useMemo(() => buildBookingNotesExtensions(), []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // We need a ref to the editor instance to insert the image after upload.
  // The TipTapEditor component doesn't expose the editor directly, but we can
  // use the onUpdate callback pattern. Instead, we'll use a workaround:
  // store the latest editor ref via a custom event after upload.
  const [editorRef, setEditorRef] = useState<{ insertImage: (url: string) => void } | null>(null);

  const handleUpdate = useCallback(
    (json: JSONContent) => {
      onUpdate(json);
    },
    [onUpdate]
  );

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!bookingId) {
        setUploadError("Save the booking first before uploading images.");
        return;
      }

      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setUploadError("Only JPEG, PNG, GIF, and WebP images are allowed.");
        return;
      }

      if (file.size > MAX_IMAGE_SIZE) {
        setUploadError("Image must be under 5 MB.");
        return;
      }

      setUploadError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/admin/bookings/${bookingId}/notes-image`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Upload failed." }));
          setUploadError(data.error || "Upload failed.");
          return;
        }

        const data = await res.json();
        if (data.url) {
          editorRef?.insertImage(data.url);
        }
      } catch {
        setUploadError("Upload failed. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [bookingId, editorRef]
  );

  const toolbarSlot = (
    <BookingNotesToolbar
      editor={null}
      onImageUpload={bookingId ? handleImageUpload : undefined}
    />
  );

  return (
    <div className={`booking-notes-editor${className ? ` ${className}` : ""}`}>
      <BookingNotesEditorInner
        content={content}
        onUpdate={handleUpdate}
        extensions={extensions}
        onImageUpload={bookingId ? handleImageUpload : undefined}
        onEditorReady={setEditorRef}
      />
      {uploading && <p className="helper-text">Uploading image...</p>}
      {uploadError && <p className="helper-text text-danger">{uploadError}</p>}
    </div>
  );
}

/**
 * Inner component that renders the TipTapEditor and exposes the editor
 * instance for image insertion via a callback.
 */
function BookingNotesEditorInner({
  content,
  onUpdate,
  extensions,
  onImageUpload,
  onEditorReady,
}: {
  content: JSONContent | null;
  onUpdate: (json: JSONContent) => void;
  extensions: ReturnType<typeof buildBookingNotesExtensions>;
  onImageUpload?: (file: File) => void;
  onEditorReady: (ref: { insertImage: (url: string) => void } | null) => void;
}) {
  // We use the TipTapEditor component with the minimal flag to disable
  // chord picker and slash menu, and pass a custom toolbar.
  return (
    <TipTapEditorWithImageInsert
      content={content}
      onUpdate={onUpdate}
      extensions={extensions}
      onImageUpload={onImageUpload}
      onEditorReady={onEditorReady}
    />
  );
}

/**
 * Wrapper that uses the TipTap editor hook directly so we can access the
 * editor instance for image insertion.
 */
import { EditorContent } from "@tiptap/react";
import { useTipTapEditor } from "@/components/admin/lesson-plans/editor/hooks/use-tiptap-editor";
import { useEffect, useRef } from "react";

function TipTapEditorWithImageInsert({
  content,
  onUpdate,
  extensions,
  onImageUpload,
  onEditorReady,
}: {
  content: JSONContent | null;
  onUpdate: (json: JSONContent) => void;
  extensions: ReturnType<typeof buildBookingNotesExtensions>;
  onImageUpload?: (file: File) => void;
  onEditorReady: (ref: { insertImage: (url: string) => void } | null) => void;
}) {
  const editor = useTipTapEditor({
    content,
    onUpdate,
    extensions,
  });

  const editorStableRef = useRef(editor);
  editorStableRef.current = editor;

  useEffect(() => {
    if (!editor) {
      onEditorReady(null);
      return;
    }
    onEditorReady({
      insertImage: (url: string) => {
        editorStableRef.current
          ?.chain()
          .focus()
          .setImage({ src: url })
          .run();
      },
    });
  }, [editor, onEditorReady]);

  return (
    <div className="tiptap-editor-shell">
      <div className="tiptap-toolbar-row">
        <BookingNotesToolbar editor={editor} onImageUpload={onImageUpload} />
      </div>
      <EditorContent editor={editor} className="tiptap-editor-content" />
    </div>
  );
}
