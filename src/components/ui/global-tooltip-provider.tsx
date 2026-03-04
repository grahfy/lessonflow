"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type PropsWithChildren } from "react";

/**
 * App-wide tooltip timing defaults so all pages (including dialogs) behave consistently.
 */
export function GlobalTooltipProvider({ children }: PropsWithChildren) {
  return (
    <TooltipPrimitive.Provider delayDuration={120} skipDelayDuration={80}>
      {children}
    </TooltipPrimitive.Provider>
  );
}
