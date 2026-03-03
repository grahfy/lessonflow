"use client";

import type { HTMLAttributes, PropsWithChildren } from "react";

interface AdminCardProps extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
  noPadding?: boolean;
}

/**
 * Standard card container for admin sections.
 */
export function AdminCard({ children, noPadding, className, ...props }: AdminCardProps) {
  const classes = [
    "admin-card",
    noPadding ? "no-padding" : "",
    className
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
