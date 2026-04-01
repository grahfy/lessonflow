"use client";

import { useCallback, useRef } from "react";
import { useEditor, type JSONContent } from "@tiptap/react";
import { buildLessonPlanExtensions } from "../tiptap-extensions";

interface UseTipTapEditorOptions {
  content: JSONContent | null;
  placeholder?: string;
  editable?: boolean;
  onUpdate?: (json: JSONContent) => void;
}

/**
 * Wraps TipTap's `useEditor` with lesson-plan-specific extensions and a
 * stable `onUpdate` callback. Returns the editor instance directly.
 */
export function useTipTapEditor({
  content,
  placeholder,
  editable = true,
  onUpdate,
}: UseTipTapEditorOptions) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const handleUpdate = useCallback(
    ({ editor }: { editor: { getJSON: () => JSONContent } }) => {
      onUpdateRef.current?.(editor.getJSON());
    },
    []
  );

  const initialContentRef = useRef(content);

  const editor = useEditor({
    extensions: buildLessonPlanExtensions(placeholder),
    content: initialContentRef.current ?? undefined,
    editable,
    onUpdate: handleUpdate,
    // Suppress SSR mismatch by not rendering until mounted.
    immediatelyRender: false,
  });

  return editor;
}
