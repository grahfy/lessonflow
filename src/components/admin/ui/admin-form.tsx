"use client";

import type { HTMLAttributes, PropsWithChildren, ReactNode } from "react";

interface AdminFormProps extends PropsWithChildren<HTMLAttributes<HTMLDivElement>> {
}

/**
 * Standard form grid for admin sections.
 */
export function AdminForm({ children, className, ...props }: AdminFormProps) {
  const classes = [
    "form-grid",
    className
  ].filter(Boolean).join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}

interface AdminFieldProps extends PropsWithChildren {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  fullWidth?: boolean;
  htmlFor?: string;
}

/**
 * Standard form field for admin sections.
 */
export function AdminField({ label, description, error, required, fullWidth, htmlFor, children }: AdminFieldProps) {
  const classes = [
    "field",
    fullWidth ? "full" : ""
  ].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <label htmlFor={htmlFor}>
        {label}
        {required && <span className="required-mark">*</span>}
      </label>
      {description && <p className="field-description">{description}</p>}
      {children}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
