"use client";

import type { ReactNode } from "react";

import { Tooltip } from "@/components/admin/ui/tooltip";

export interface AdminTabItem<TTab extends string> {
  key: TTab;
  label: string;
  tooltip?: string;
  disabled?: boolean;
}

interface AdminTabBarProps<TTab extends string> {
  items: ReadonlyArray<AdminTabItem<TTab>>;
  activeTab: TTab;
  onChange: (tab: TTab) => void;
  className?: string;
  listClassName?: string;
  rightSlot?: ReactNode;
}

export function AdminTabBar<TTab extends string>({
  items,
  activeTab,
  onChange,
  className,
  listClassName,
  rightSlot
}: AdminTabBarProps<TTab>) {
  return (
    <div className={["admin-tab-bar", className].filter(Boolean).join(" ")}>
      <div className={["admin-tab-bar-list", listClassName].filter(Boolean).join(" ")}>
        {items.map((item) => {
          const button = (
            <button
              key={item.key}
              type="button"
              className={`btn ${activeTab === item.key ? "btn-primary" : "btn-secondary"}`}
              disabled={item.disabled}
              onClick={() => onChange(item.key)}
            >
              {item.label}
            </button>
          );

          if (!item.tooltip) {
            return button;
          }

          return (
            <Tooltip key={item.key} content={item.tooltip}>
              {button}
            </Tooltip>
          );
        })}
      </div>
      {rightSlot ? <div className="admin-tab-bar-right">{rightSlot}</div> : null}
    </div>
  );
}
