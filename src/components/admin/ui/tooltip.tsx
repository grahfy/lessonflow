"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { isValidElement, type ReactNode, useEffect, useMemo, useState } from "react";

type TooltipSide = "top" | "right" | "bottom" | "left";
type TooltipAlign = "start" | "center" | "end";

interface TooltipProps {
  children: ReactNode;
  content: ReactNode;
  side?: TooltipSide;
  align?: TooltipAlign;
  sideOffset?: number;
  disabled?: boolean;
  openOnTap?: boolean;
}

/**
 * Shared tooltip wrapper for descriptive UI affordances.
 */
export function Tooltip({
  children,
  content,
  side = "top",
  align = "center",
  sideOffset = 8,
  disabled = false,
  openOnTap = true
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [touchLikePointer, setTouchLikePointer] = useState(false);

  const triggerDisabled = useMemo(() => {
    if (!isValidElement(children)) {
      return false;
    }
    const props = children.props as {
      disabled?: boolean;
      "aria-disabled"?: boolean | "true" | "false";
    };
    return props.disabled === true || props["aria-disabled"] === true || props["aria-disabled"] === "true";
  }, [children]);

  const touchEnabled = openOnTap && touchLikePointer;

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) {
      return;
    }
    const query = window.matchMedia("(hover: none), (pointer: coarse)");
    const sync = () => setTouchLikePointer(query.matches);
    sync();

    if (typeof query.addEventListener === "function") {
      query.addEventListener("change", sync);
      return () => query.removeEventListener("change", sync);
    }

    query.addListener(sync);
    return () => query.removeListener(sync);
  }, []);

  if (disabled || !content) {
    return <>{children}</>;
  }

  const triggerNode =
    triggerDisabled || !isValidElement(children) ? (
      <span
        className={`ui-tooltip-trigger${triggerDisabled ? " is-disabled" : ""}`}
        tabIndex={triggerDisabled ? 0 : undefined}
      >
        {children}
      </span>
    ) : (
      children
    );

  return (
    <TooltipPrimitive.Root disableHoverableContent open={open} onOpenChange={setOpen}>
      <TooltipPrimitive.Trigger
        asChild
        onPointerDown={(event) => {
          if (!touchEnabled || event.pointerType === "mouse") {
            return;
          }
          setOpen((prev) => !prev);
        }}
      >
        {triggerNode}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          className="ui-tooltip-content"
          side={side}
          align={align}
          sideOffset={sideOffset}
        >
          {content}
          <TooltipPrimitive.Arrow className="ui-tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
