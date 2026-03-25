"use client";

import { useRef } from "react";
import { Tooltip } from "@/components/admin/ui/tooltip";

type TabKey = string;

interface AdminTabNavItem<T extends TabKey> {
  key: T;
  label: string;
  tooltip?: string;
}

interface AdminTabNavProps<T extends TabKey> {
  activeKey: T;
  items: AdminTabNavItem<T>[];
  onChange: (key: T) => void;
}

/**
 * Shared tab navigation for admin sections with consistent button styling.
 */
export function AdminTabNav<T extends TabKey>({ activeKey, items, onChange }: AdminTabNavProps<T>) {
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex: number | null = null;

    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      nextIndex = index < items.length - 1 ? index + 1 : 0;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      nextIndex = index > 0 ? index - 1 : items.length - 1;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = items.length - 1;
    }

    if (nextIndex !== null) {
      tabsRef.current[nextIndex]?.focus();
      onChange(items[nextIndex].key);
    }
  };

  return (
    <div className="admin-tab-nav" role="tablist" aria-label="Admin section tabs">
      {items.map((item, index) => {
        const isActive = activeKey === item.key;
        const button = (
          <button
            key={item.key}
            ref={(el) => { tabsRef.current[index] = el; }}
            id={`tab-${item.key}`}
            className={`btn ${isActive ? "btn-primary" : "btn-secondary"}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onKeyDown={(e) => handleKeyDown(e, index)}
            onClick={() => onChange(item.key)}
          >
            {item.label}
          </button>
        );

        return item.tooltip ? (
          <Tooltip key={item.key} content={item.tooltip}>
            {button}
          </Tooltip>
        ) : (
          button
        );
      })}
    </div>
  );
}
