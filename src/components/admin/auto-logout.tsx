"use client";

import { useEffect, useCallback, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";

// 15 minutes in milliseconds
const INACTIVITY_TIMEOUT = 15 * 60 * 1000;

export function AutoLogout() {
  const router = useRouter();
  const pathname = usePathname();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // We don't want to enforce auto-logout on the login page itself
  const isLoginPage = pathname?.startsWith("/admin/login");

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      router.push("/admin/login?reason=inactivity");
      router.refresh(); // Ensure server components re-evaluate auth state
    } catch (error) {
      console.error("Failed to auto-logout:", error);
    }
  }, [router]);

  const resetTimer = useCallback(() => {
    if (isLoginPage) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      void handleLogout();
    }, INACTIVITY_TIMEOUT);
  }, [handleLogout, isLoginPage]);

  useEffect(() => {
    if (isLoginPage) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Set initial timer
    resetTimer();

    // Events to track user activity
    const events = [
      "mousedown",
      "mousemove",
      "keydown",
      "scroll",
      "touchstart",
      "click"
    ];

    // Throttled reset to avoid excessive calls on mousemove/scroll
    let lastReset = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      // Only reset timer at most every second to save performance
      if (now - lastReset > 1000) {
        resetTimer();
        lastReset = now;
      }
    };

    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [resetTimer, isLoginPage]);

  // This component doesn't render anything visible
  return null;
}
