"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Editor } from "@tiptap/react";
import {
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  MessageSquareQuote,
  AlertTriangle,
  Lightbulb,
  type LucideIcon,
} from "lucide-react";

interface SlashMenuItem {
  label: string;
  description: string;
  icon: LucideIcon;
  action: (editor: Editor) => void;
  keywords: string[];
}

const SLASH_ITEMS: SlashMenuItem[] = [
  {
    label: "Heading 2",
    description: "Large section heading",
    icon: Heading2,
    keywords: ["h2", "heading", "title"],
    action: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: "Heading 3",
    description: "Small section heading",
    icon: Heading3,
    keywords: ["h3", "heading", "subtitle"],
    action: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: "Bullet List",
    description: "Unordered list of items",
    icon: List,
    keywords: ["bullet", "list", "unordered", "ul"],
    action: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered List",
    description: "Ordered list of items",
    icon: ListOrdered,
    keywords: ["number", "ordered", "list", "ol"],
    action: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Checklist",
    description: "Checkbox items for homework",
    icon: ListChecks,
    keywords: ["check", "task", "todo", "homework"],
    action: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    label: "Tip",
    description: "Green callout for tips",
    icon: Lightbulb,
    keywords: ["tip", "callout", "hint"],
    action: (e) => e.chain().focus().toggleCallout({ calloutType: "tip" }).run(),
  },
  {
    label: "Warning",
    description: "Yellow callout for warnings",
    icon: AlertTriangle,
    keywords: ["warning", "caution", "alert"],
    action: (e) => e.chain().focus().toggleCallout({ calloutType: "warning" }).run(),
  },
  {
    label: "Note",
    description: "Blue callout for notes",
    icon: MessageSquareQuote,
    keywords: ["note", "info", "callout"],
    action: (e) => e.chain().focus().toggleCallout({ calloutType: "note" }).run(),
  },
];

interface TipTapSlashMenuProps {
  editor: Editor | null;
}

/**
 * Floating menu that appears when the user types "/" at the start of a
 * line or after a space. Filters items by typed query text after the slash.
 */
export function TipTapSlashMenu({ editor }: TipTapSlashMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    if (!query) return SLASH_ITEMS;
    const q = query.toLowerCase();
    return SLASH_ITEMS.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.includes(q))
    );
  }, [query]);

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setSelectedIndex(0);
  }, []);

  const runItem = useCallback(
    (item: SlashMenuItem) => {
      if (!editor) return;
      // Delete the "/" and any query text before running the action.
      const { from } = editor.state.selection;
      const slashStart = from - query.length - 1;
      editor
        .chain()
        .focus()
        .deleteRange({ from: slashStart, to: from })
        .run();
      item.action(editor);
      closeMenu();
    },
    [editor, query, closeMenu]
  );

  useEffect(() => {
    if (!editor) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen) {
        // Open on "/" at start of line or after whitespace.
        if (event.key === "/") {
          const { $from } = editor.state.selection;
          const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
          if ($from.parentOffset === 0 || textBefore.endsWith(" ")) {
            // Get cursor position for menu placement.
            const coords = editor.view.coordsAtPos(editor.state.selection.from);
            setPosition({ top: coords.bottom + 4, left: coords.left });
            setIsOpen(true);
            setQuery("");
            setSelectedIndex(0);
          }
        }
        return;
      }

      // Menu is open — handle navigation.
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filteredItems.length - 1));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (filteredItems[selectedIndex]) {
          runItem(filteredItems[selectedIndex]);
        }
        return;
      }

      if (event.key === "Backspace") {
        if (query.length === 0) {
          closeMenu();
        } else {
          setQuery((q) => q.slice(0, -1));
          setSelectedIndex(0);
        }
        return;
      }

      // Append printable characters to query.
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        setQuery((q) => q + event.key);
        setSelectedIndex(0);
      }
    };

    const dom = editor.view.dom;
    dom.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => dom.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [editor, isOpen, query, filteredItems, selectedIndex, runItem, closeMenu]);

  // Close if editor loses focus.
  useEffect(() => {
    if (!isOpen) return;
    const handleBlur = () => closeMenu();
    editor?.view.dom.addEventListener("blur", handleBlur);
    return () => editor?.view.dom.removeEventListener("blur", handleBlur);
  }, [editor, isOpen, closeMenu]);

  if (!isOpen || !position || filteredItems.length === 0) return null;

  return (
    <div
      ref={menuRef}
      className="tiptap-slash-menu"
      style={{ top: position.top, left: position.left }}
    >
      {filteredItems.map((item, index) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            className={`tiptap-slash-menu-item${index === selectedIndex ? " is-selected" : ""}`}
            onMouseDown={(e) => {
              e.preventDefault();
              runItem(item);
            }}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <Icon size={16} />
            <div>
              <span className="tiptap-slash-menu-item-label">{item.label}</span>
              <span className="tiptap-slash-menu-item-desc">{item.description}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
