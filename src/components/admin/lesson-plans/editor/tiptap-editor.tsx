"use client";

import { useCallback, useEffect, useState } from "react";
import { EditorContent, type JSONContent } from "@tiptap/react";
import { useTipTapEditor } from "./hooks/use-tiptap-editor";
import { TipTapToolbar } from "./tiptap-toolbar";
import { TipTapSlashMenu } from "./tiptap-slash-menu";
import { TipTapMaterialPicker } from "./tiptap-material-picker";
import { ChordPickerDialog } from "@/components/admin/chords/chord-picker-dialog";
import type { ChordDiagramData } from "@/lib/chords/chord-types";

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
  const [chordPickerOpen, setChordPickerOpen] = useState(false);

  // Listen for chord insertion events from the slash menu and toolbar.
  useEffect(() => {
    if (!editable) return;
    const handler = () => setChordPickerOpen(true);
    window.addEventListener("tiptap:insert-chord", handler);
    return () => window.removeEventListener("tiptap:insert-chord", handler);
  }, [editable]);

  const handleChordSelect = useCallback(
    (diagram: ChordDiagramData, chordId?: string) => {
      if (!editor) return;
      editor.commands.insertChordDiagram({ chordData: diagram, chordId });
    },
    [editor]
  );

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
      {editable && (
        <ChordPickerDialog
          isOpen={chordPickerOpen}
          onClose={() => setChordPickerOpen(false)}
          onSelect={handleChordSelect}
        />
      )}
    </div>
  );
}
