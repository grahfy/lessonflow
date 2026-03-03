"use client";

import { forwardRef, type HTMLAttributes, type PropsWithChildren } from "react";

interface AdminCardProps extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
  noPadding?: boolean;
}

/**
 * Standard card container for admin sections.
 */
export const AdminCard = forwardRef<HTMLDivElement, AdminCardProps>(
  ({ children, noPadding, className, ...props }, ref) => {
    const classes = [
      "admin-card",
      noPadding ? "no-padding" : "",
      className
    ].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

AdminCard.displayName = "AdminCard";
