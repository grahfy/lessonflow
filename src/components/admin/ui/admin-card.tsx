"use client";

import { forwardRef, type HTMLAttributes, type PropsWithChildren } from "react";

interface AdminCardProps extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
  noPadding?: boolean;
  ghost?: boolean;
}

/**
 * Standard card container for admin sections.
 */
export const AdminCard = forwardRef<HTMLDivElement, AdminCardProps>(
  ({ children, noPadding, ghost, className, style, ...props }, ref) => {
    const classes = [
      ghost ? "" : "admin-card",
      noPadding ? "no-padding" : "",
      className
    ].filter(Boolean).join(" ");

    const finalStyle = ghost ? { ...style, background: 'none', border: 'none', boxShadow: 'none', padding: 0 } : style;

    return (
      <div ref={ref} className={classes} style={finalStyle} {...props}>
        {children}
      </div>
    );
  }
);

AdminCard.displayName = "AdminCard";
