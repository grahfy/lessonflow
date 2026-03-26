"use client";

import { EditorContent, type JSONContent } from "@tiptap/react";
import { useTipTapEditor } from "./hooks/use-tiptap-editor";
import { TipTapToolbar } from "./tiptap-toolbar";
import { TipTapSlashMenu } from "./tiptap-slash-menu";
import { TipTapMaterialPicker } from "./tiptap-material-picker";

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
}: TipTapEditorProps) {
  const editor = useTipTapEditor({ content, placeholder, editable, onUpdate });

  return (
    <div className={`tiptap-editor-shell${className ? ` ${className}` : ""}`}>
      {editable && (
        <div className="tiptap-toolbar-row">
          <TipTapToolbar editor={editor} />
          {materials && materials.length > 0 && (
            <TipTapMaterialPicker editor={editor} materials={materials} />
          )}
        </div>
      )}
      <EditorContent
        editor={editor}
        className="tiptap-editor-content"
      />
      {editable && <TipTapSlashMenu editor={editor} />}
    </div>
  );
}
