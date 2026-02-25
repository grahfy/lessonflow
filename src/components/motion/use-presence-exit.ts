"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EXIT_WATCHDOG_MS, prefersReducedMotion } from "@/components/motion/tween-orchestrator";

type PresenceOptions = {
  timeoutMs?: number;
};

type HideOptions = {
  immediate?: boolean;
};

/**
 * Small presence controller for modal/dialog exit animations.
 *
 * Components use `isMounted` for DOM presence and `isVisible` for CSS/animation state. The timer
 * allows delayed unmount after exit animations, with a reduced-motion fast path.
 */
export function usePresenceExit(options: PresenceOptions = {}) {
  const timeoutMs = options.timeoutMs ?? EXIT_WATCHDOG_MS;
  const [isMounted, setIsMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<number | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimer();
    setIsMounted(true);
    // Defer visibility to the next frame so enter animations can transition from a known hidden state.
    window.requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, [clearTimer]);

  const hide = useCallback(
    (onAfterHide?: () => void, hideOptions: HideOptions = {}) => {
      clearTimer();
      setIsVisible(false);

      if (hideOptions.immediate || prefersReducedMotion()) {
        setIsMounted(false);
        onAfterHide?.();
        return;
      }

      // Watchdog timeout guarantees unmount even if an exit animation callback never fires.
      timerRef.current = window.setTimeout(() => {
        setIsMounted(false);
        onAfterHide?.();
      }, timeoutMs);
    },
    [clearTimer, timeoutMs]
  );

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    isMounted,
    isVisible,
    show,
    hide
  };
}
