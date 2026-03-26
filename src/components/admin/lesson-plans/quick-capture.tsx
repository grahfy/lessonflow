"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { X, StickyNote, Save, ChevronRight } from "lucide-react";

interface QuickCaptureProps {
  initialNotes?: string | null;
  disabled?: boolean;
  onSave: (notes: string) => Promise<void>;
  onExpand?: () => void;
}

/**
 * Floating notepad overlay for jotting quick lesson notes during or after
 * a lesson. Saves bullet-point text as `quickCaptureNotes` on the lesson
 * plan draft. The "Expand" button transitions to the full section editor.
 *
 * Mobile-friendly: large touch targets, minimal chrome, auto-resizing textarea.
 */
export function QuickCapture({
  initialNotes,
  disabled = false,
  onSave,
  onExpand,
}: QuickCaptureProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notes, setNotes] = useState(initialNotes ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isDirty = notes !== (initialNotes ?? "");

  // Sync initial notes when they change externally.
  useEffect(() => {
    setNotes(initialNotes ?? "");
  }, [initialNotes]);

  // Auto-resize textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(120, el.scrollHeight)}px`;
  }, [notes, isOpen]);

  const handleSave = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await onSave(notes);
    } finally {
      setSaving(false);
    }
  }, [notes, isDirty, saving, onSave]);

  const handleClose = useCallback(async () => {
    if (isDirty) {
      await handleSave();
    }
    setIsOpen(false);
  }, [isDirty, handleSave]);

  // Keyboard shortcut: Ctrl/Cmd+S to save.
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [isOpen, handleSave, handleClose]);

  if (!isOpen) {
    return (
      <button
        type="button"
        className="quick-capture-trigger"
        title="Quick notes"
        disabled={disabled}
        onClick={() => setIsOpen(true)}
      >
        <StickyNote size={18} />
        <span>Quick Notes</span>
        {notes.trim() && <span className="quick-capture-dot" />}
      </button>
    );
  }

  return createPortal(
    <div className="quick-capture-overlay" role="dialog" aria-label="Quick capture notes">
      <div className="quick-capture-panel">
        <div className="quick-capture-header">
          <StickyNote size={16} />
          <span className="quick-capture-title">Quick Lesson Notes</span>
          <div className="quick-capture-header-actions">
            {onExpand && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                title="Expand to full editor"
                onClick={onExpand}
              >
                <ChevronRight size={14} /> Expand
              </button>
            )}
            <button
              type="button"
              className="quick-capture-close"
              title="Close"
              onClick={handleClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <textarea
          ref={textareaRef}
          className="quick-capture-textarea"
          placeholder={"Jot down key points from this lesson...\n\n- What went well\n- What to work on\n- Notes for next time"}
          value={notes}
          disabled={disabled || saving}
          onChange={(e) => setNotes(e.target.value)}
        />

        <div className="quick-capture-footer">
          <span className="quick-capture-status">
            {saving ? "Saving..." : isDirty ? "Unsaved changes" : "Saved"}
          </span>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!isDirty || saving || disabled}
            onClick={handleSave}
          >
            <Save size={14} /> Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
