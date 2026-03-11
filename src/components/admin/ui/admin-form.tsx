"use client";

import { forwardRef, type HTMLAttributes, type PropsWithChildren } from "react";
import { Tooltip } from "@/components/admin/ui/tooltip";

type AdminFormProps = PropsWithChildren<HTMLAttributes<HTMLDivElement>>;

/**
 * Standard form grid for admin sections.
 */
export const AdminForm = forwardRef<HTMLDivElement, AdminFormProps>(
  ({ children, className, ...props }, ref) => {
    const classes = [
      "form-grid",
      className
    ].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={classes} {...props}>
        {children}
      </div>
    );
  }
);

AdminForm.displayName = "AdminForm";

interface AdminFieldProps extends PropsWithChildren {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  fullWidth?: boolean;
  htmlFor?: string;
  className?: string;
  tooltip?: string;
}

/**
 * Standard form field for admin sections.
 */
export const AdminField = forwardRef<HTMLDivElement, AdminFieldProps>(
  ({ label, description, error, required, fullWidth, htmlFor, className, tooltip, children }, ref) => {
    const classes = [
      "field",
      fullWidth ? "full" : "",
      className
    ].filter(Boolean).join(" ");

    return (
      <div ref={ref} className={classes}>
        <label htmlFor={htmlFor} className="admin-field-label">
          {tooltip ? (
            <Tooltip content={tooltip}>
              <span className="admin-field-label-tooltip">{label}</span>
            </Tooltip>
          ) : (
            label
          )}
          {required && <span className="required-mark">*</span>}
        </label>
        {description && <p className="field-description">{description}</p>}
        {children}
        {error && <p className="field-error">{error}</p>}
      </div>
    );
  }
);

AdminField.displayName = "AdminField";
