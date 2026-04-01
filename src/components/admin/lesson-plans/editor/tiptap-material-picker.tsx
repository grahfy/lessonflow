"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { Link2, Link2Off } from "lucide-react";

interface MaterialOption {
  id: string;
  title: string;
  description?: string | null;
}

interface TipTapMaterialPickerProps {
  editor: Editor | null;
  materials: MaterialOption[];
}

interface DropdownPosition {
  top: number;
  left: number;
}

/**
 * Toolbar button + dropdown for linking selected text to a learning material.
 * The teacher selects text in the editor, clicks the link button, and picks
 * a material from the dropdown. The selected text gets wrapped with a
 * `materialLink` mark.
 *
 * If the caret is already inside a materialLink mark, the button shows an
 * "unlink" action instead.
 */
export function TipTapMaterialPicker({
  editor,
  materials,
}: TipTapMaterialPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const editorState = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => ({
      hasSelection: currentEditor ? !currentEditor.state.selection.empty : false,
      isInLink: currentEditor ? currentEditor.isActive("materialLink") : false,
    }),
  });
  const hasSelection = editorState?.hasSelection ?? false;
  const isInLink = editorState?.isInLink ?? false;

  const handleToggle = useCallback(() => {
    if (!editor) return;

    if (isInLink) {
      // Unlink: remove materialLink mark from selection.
      editor.chain().focus().unsetMaterialLink().run();
      return;
    }

    if (!hasSelection) return;
    setIsOpen((o) => !o);
  }, [editor, isInLink, hasSelection]);

  const handleSelectMaterial = useCallback(
    (materialId: string) => {
      if (!editor) return;
      editor.chain().focus().setMaterialLink({ materialId }).run();
      setIsOpen(false);
    },
    [editor]
  );

  const syncDropdownPosition = useCallback(() => {
    const button = buttonRef.current;
    if (!button) {
      setDropdownPosition(null);
      return;
    }

    const rect = button.getBoundingClientRect();
    const viewportPadding = 8;
    const estimatedWidth = 300;
    const estimatedHeight = 280;
    const placeBelow = rect.bottom + 4 + estimatedHeight <= window.innerHeight || rect.top < estimatedHeight;
    const nextLeft = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - estimatedWidth - viewportPadding)
    );
    const nextTop = placeBelow
      ? rect.bottom + 4
      : Math.max(viewportPadding, rect.top - estimatedHeight - 4);

    setDropdownPosition({ top: nextTop, left: nextLeft });
  }, []);

  // Close on click outside.
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    syncDropdownPosition();

    const handleViewportChange = () => {
      syncDropdownPosition();
    };

    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    if (!editor || (!hasSelection && !isInLink)) {
      setIsOpen(false);
    }
    return () => {
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [editor, hasSelection, isInLink, isOpen, syncDropdownPosition]);

  if (!editor || materials.length === 0) return null;

  return (
    <div className="tiptap-material-picker">
      <button
        ref={buttonRef}
        type="button"
        className={`tiptap-toolbar-btn${isInLink ? " is-active" : ""}`}
        title={isInLink ? "Remove material link" : "Link to material"}
        aria-label={isInLink ? "Remove material link" : "Link to material"}
        disabled={!isInLink && !hasSelection}
        onMouseDown={(e) => {
          e.preventDefault();
          handleToggle();
        }}
      >
        {isInLink ? <Link2Off size={16} /> : <Link2 size={16} />}
      </button>

      {isOpen && dropdownPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={dropdownRef}
              className="tiptap-material-picker-dropdown"
              style={{ top: dropdownPosition.top, left: dropdownPosition.left }}
            >
              <p className="tiptap-material-picker-label">Link selection to:</p>
              {materials.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="tiptap-material-picker-item"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelectMaterial(m.id);
                  }}
                >
                  <span className="tiptap-material-picker-item-title">{m.title}</span>
                  {m.description && (
                    <span className="tiptap-material-picker-item-desc">{m.description}</span>
                  )}
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
