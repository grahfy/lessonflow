"use client";

import { useCallback, useState } from "react";

interface HomeworkItem {
  itemId: string;
  text: string;
  completed: boolean;
}

interface HomeworkChecklistProps {
  lessonPlanId: string;
  items: HomeworkItem[];
  className?: string;
}

/**
 * Interactive homework checklist for the student portal.
 * Students toggle checkboxes to mark items as done/undone.
 * Each toggle calls the homework completion API.
 */
export function HomeworkChecklist({
  lessonPlanId,
  items,
  className,
}: HomeworkChecklistProps) {
  const [completions, setCompletions] = useState<Set<string>>(
    () => new Set(items.filter((i) => i.completed).map((i) => i.itemId))
  );
  const [toggling, setToggling] = useState<Set<string>>(new Set());

  const handleToggle = useCallback(
    async (itemId: string) => {
      if (toggling.has(itemId)) return;

      setToggling((prev) => new Set(prev).add(itemId));
      try {
        const res = await fetch(
          `/api/student/homework/${lessonPlanId}/${itemId}`,
          { method: "POST" }
        );

        if (res.ok) {
          const body = await res.json();
          setCompletions((prev) => {
            const next = new Set(prev);
            if (body.completed) {
              next.add(itemId);
            } else {
              next.delete(itemId);
            }
            return next;
          });
        }
      } finally {
        setToggling((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [lessonPlanId, toggling]
  );

  if (items.length === 0) return null;

  return (
    <ul className={`homework-checklist${className ? ` ${className}` : ""}`}>
      {items.map((item) => {
        const done = completions.has(item.itemId);
        const busy = toggling.has(item.itemId);

        return (
          <li key={item.itemId} className="homework-checklist-item">
            <button
              type="button"
              className={`homework-checklist-toggle${done ? " is-done" : ""}`}
              disabled={busy}
              onClick={() => void handleToggle(item.itemId)}
              aria-label={done ? `Unmark "${item.text}"` : `Mark "${item.text}" as done`}
            >
              <span className="homework-checklist-checkbox">
                {busy ? "\u23F3" : done ? "\u2611" : "\u2610"}
              </span>
              <span className={done ? "homework-checklist-done-text" : ""}>
                {item.text}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
