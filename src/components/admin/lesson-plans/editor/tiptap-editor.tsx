"use client";

import { useCallback, useEffect, useState } from "react";
import { EditorContent, type JSONContent } from "@tiptap/react";
import type { Extensions } from "@tiptap/react";
import { useTipTapEditor } from "./hooks/use-tiptap-editor";
import { TipTapToolbar } from "./tiptap-toolbar";
import { TipTapSlashMenu } from "./tiptap-slash-menu";
import { TipTapMaterialPicker } from "./tiptap-material-picker";
import { ChordPickerDialog } from "@/components/admin/chords/chord-picker-dialog";
import type { ChordDiagramData } from "@/lib/chords/chord-types";

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 MB

interface MaterialOption {
  id: string;
  title: string;
  description?: string | null;
}

interface TipTapEditorProps {
  content: JSONContent | null;
  placeholder?: string;
  editable?: boolean;
  onUpdate?: (json: JSONContent) => void;
  className?: string;
  /** Available learning materials for inline linking. */
  materials?: MaterialOption[];
  /** Custom extensions. When omitted, defaults to lesson plan extensions. */
  extensions?: Extensions;
  /** Custom toolbar component. When omitted, renders the default TipTapToolbar. */
  toolbarSlot?: React.ReactNode;
  /** When true, hides the chord picker and slash menu (for non-lesson-plan contexts). */
  minimal?: boolean;
  /** Booking ID for image uploads. When provided, shows an image upload button in the toolbar. */
  bookingId?: string | null;
}

/**
 * Self-contained TipTap rich-text editor for one lesson plan section.
 * Renders a formatting toolbar above the editable area, with an optional
 * material link picker when materials are provided.
 */
export function TipTapEditor({
  content,
  placeholder,
  editable = true,
  onUpdate,
  className,
  materials,
  extensions: customExtensions,
  toolbarSlot,
  minimal = false,
  bookingId,
}: TipTapEditorProps) {
  const editor = useTipTapEditor({ content, placeholder, editable, onUpdate, extensions: customExtensions });
  const [chordPickerOpen, setChordPickerOpen] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);

  // Listen for chord insertion events from the slash menu and toolbar.
  useEffect(() => {
    if (!editable || minimal) return;
    const handler = () => setChordPickerOpen(true);
    window.addEventListener("tiptap:insert-chord", handler);
    return () => window.removeEventListener("tiptap:insert-chord", handler);
  }, [editable, minimal]);

  const handleChordSelect = useCallback(
    (diagram: ChordDiagramData, chordId?: string) => {
      if (!editor) return;
      editor.commands.insertChordDiagram({ chordData: diagram, chordId });
    },
    [editor]
  );

  const handleImageUpload = useCallback(
    async (file: File) => {
      if (!bookingId || !editor) return;

      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setImageUploadError("Only JPEG, PNG, GIF, and WebP images are allowed.");
        return;
      }
      if (file.size > MAX_IMAGE_SIZE) {
        setImageUploadError("Image must be under 5 MB.");
        return;
      }

      setImageUploadError(null);
      setImageUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`/api/admin/bookings/${bookingId}/notes-image`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: "Upload failed." }));
          setImageUploadError(data.error || "Upload failed.");
          return;
        }

        const data = await res.json();
        if (data.url) {
          editor.chain().focus().setImage({ src: data.url }).run();
        }
      } catch {
        setImageUploadError("Upload failed. Please try again.");
      } finally {
        setImageUploading(false);
      }
    },
    [bookingId, editor]
  );

  return (
    <div className={`tiptap-editor-shell${className ? ` ${className}` : ""}`}>
      {editable && (
        <div className="tiptap-toolbar-row">
          {toolbarSlot ?? (
            <>
              <TipTapToolbar
                editor={editor}
                onImageUpload={bookingId ? handleImageUpload : undefined}
              />
              {materials && materials.length > 0 && (
                <TipTapMaterialPicker editor={editor} materials={materials} />
              )}
            </>
          )}
        </div>
      )}
      <EditorContent
        editor={editor}
        className="tiptap-editor-content"
      />
      {imageUploading && <p className="helper-text">Uploading image...</p>}
      {imageUploadError && <p className="helper-text text-danger">{imageUploadError}</p>}
      {editable && !minimal && <TipTapSlashMenu editor={editor} />}
      {editable && !minimal && (
        <ChordPickerDialog
          isOpen={chordPickerOpen}
          onClose={() => setChordPickerOpen(false)}
          onSelect={handleChordSelect}
        />
      )}
    </div>
  );
}
