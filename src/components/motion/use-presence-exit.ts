"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { EXIT_WATCHDOG_MS, prefersReducedMotion } from "@/components/motion/tween-orchestrator";

type PresenceOptions = {
  timeoutMs?: number;
};

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
    window.requestAnimationFrame(() => {
      setIsVisible(true);
    });
  }, [clearTimer]);

  const hide = useCallback(
    (onAfterHide?: () => void) => {
      clearTimer();
      setIsVisible(false);

      if (prefersReducedMotion()) {
        setIsMounted(false);
        onAfterHide?.();
        return;
      }

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
