"use client";

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
  return (
    <div className="admin-tab-nav" role="tablist" aria-label="Admin section tabs">
      {items.map((item) => {
        const button = (
          <button
            key={item.key}
            className={`btn ${activeKey === item.key ? "btn-primary" : "btn-secondary"}`}
            type="button"
            role="tab"
            aria-selected={activeKey === item.key}
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
