"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useEditor, type JSONContent } from "@tiptap/react";
import { buildLessonPlanExtensions } from "../tiptap-extensions";

interface UseTipTapEditorOptions {
  content: JSONContent | null;
  placeholder?: string;
  editable?: boolean;
  onUpdate?: (json: JSONContent) => void;
}

const EMPTY_DOCUMENT: JSONContent = { type: "doc", content: [] };

function serializeContent(content: JSONContent | null | undefined): string {
  return JSON.stringify(content ?? EMPTY_DOCUMENT);
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
  const initialContentRef = useRef(content ?? EMPTY_DOCUMENT);
  const lastSerializedContentRef = useRef(serializeContent(initialContentRef.current));
  const isApplyingExternalContentRef = useRef(false);
  const extensions = useMemo(() => buildLessonPlanExtensions(placeholder), [placeholder]);
  const serializedContent = useMemo(() => serializeContent(content), [content]);

  const handleUpdate = useCallback(
    ({ editor }: { editor: { getJSON: () => JSONContent } }) => {
      const json = editor.getJSON();
      lastSerializedContentRef.current = serializeContent(json);
      if (isApplyingExternalContentRef.current) {
        return;
      }
      onUpdateRef.current?.(json);
    },
    []
  );

  const editor = useEditor({
    extensions,
    content: initialContentRef.current,
    editable,
    onUpdate: handleUpdate,
    // Suppress SSR mismatch by not rendering until mounted.
    immediatelyRender: false,
  }, [extensions]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (serializedContent === lastSerializedContentRef.current) {
      return;
    }

    const currentSerialized = serializeContent(editor.getJSON());
    if (currentSerialized === serializedContent) {
      lastSerializedContentRef.current = serializedContent;
      return;
    }

    isApplyingExternalContentRef.current = true;
    editor.commands.setContent(content ?? EMPTY_DOCUMENT, { emitUpdate: false });
    lastSerializedContentRef.current = serializedContent;
    isApplyingExternalContentRef.current = false;
  }, [content, editor, serializedContent]);

  return editor;
}
