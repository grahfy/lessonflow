"use client";

import { useCallback } from "react";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Strikethrough,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  MessageSquareQuote,
  Undo,
  Redo,
} from "lucide-react";

interface TipTapToolbarProps {
  editor: Editor | null;
}

interface ToolbarAction {
  icon: typeof Bold;
  label: string;
  action: (editor: Editor) => void;
  isActive?: (editor: Editor) => boolean;
}

const TOOLBAR_GROUPS: ToolbarAction[][] = [
  [
    {
      icon: Bold,
      label: "Bold",
      action: (e) => e.chain().focus().toggleBold().run(),
      isActive: (e) => e.isActive("bold"),
    },
    {
      icon: Italic,
      label: "Italic",
      action: (e) => e.chain().focus().toggleItalic().run(),
      isActive: (e) => e.isActive("italic"),
    },
    {
      icon: Strikethrough,
      label: "Strikethrough",
      action: (e) => e.chain().focus().toggleStrike().run(),
      isActive: (e) => e.isActive("strike"),
    },
  ],
  [
    {
      icon: Heading2,
      label: "Heading 2",
      action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: (e) => e.isActive("heading", { level: 2 }),
    },
    {
      icon: Heading3,
      label: "Heading 3",
      action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: (e) => e.isActive("heading", { level: 3 }),
    },
  ],
  [
    {
      icon: List,
      label: "Bullet List",
      action: (e) => e.chain().focus().toggleBulletList().run(),
      isActive: (e) => e.isActive("bulletList"),
    },
    {
      icon: ListOrdered,
      label: "Numbered List",
      action: (e) => e.chain().focus().toggleOrderedList().run(),
      isActive: (e) => e.isActive("orderedList"),
    },
    {
      icon: ListChecks,
      label: "Checklist",
      action: (e) => e.chain().focus().toggleTaskList().run(),
      isActive: (e) => e.isActive("taskList"),
    },
  ],
  [
    {
      icon: MessageSquareQuote,
      label: "Callout",
      action: (e) => e.chain().focus().toggleCallout({ calloutType: "note" }).run(),
      isActive: (e) => e.isActive("callout"),
    },
  ],
  [
    {
      icon: Undo,
      label: "Undo",
      action: (e) => e.chain().focus().undo().run(),
    },
    {
      icon: Redo,
      label: "Redo",
      action: (e) => e.chain().focus().redo().run(),
    },
  ],
];

/**
 * Compact formatting toolbar for a lesson plan TipTap editor section.
 * Groups: text marks | headings | lists/checklists | undo/redo.
 */
export function TipTapToolbar({ editor }: TipTapToolbarProps) {
  if (!editor) return null;

  return (
    <div className="tiptap-toolbar" role="toolbar" aria-label="Formatting">
      {TOOLBAR_GROUPS.map((group, gi) => (
        <div key={gi} className="tiptap-toolbar-group">
          {group.map((item) => (
            <ToolbarButton key={item.label} editor={editor} {...item} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ToolbarButton({
  editor,
  icon: Icon,
  label,
  action,
  isActive,
}: ToolbarAction & { editor: Editor }) {
  const handleClick = useCallback(() => action(editor), [action, editor]);
  const active = isActive?.(editor) ?? false;

  return (
    <button
      type="button"
      className={`tiptap-toolbar-btn${active ? " is-active" : ""}`}
      onClick={handleClick}
      title={label}
      aria-label={label}
      aria-pressed={isActive ? active : undefined}
    >
      <Icon size={16} />
    </button>
  );
}
