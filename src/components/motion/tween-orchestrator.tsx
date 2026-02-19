"use client";

import gsap from "gsap";
import { usePathname } from "next/navigation";
import {
  PropsWithChildren,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

export type MotionScope = "public" | "admin" | "calendar";
export type TransitionState = "idle" | "entering" | "exiting" | "navigating";

export const MAX_STAGGER_ITEMS_PUBLIC = 36;
export const MAX_STAGGER_ITEMS_ADMIN = 24;
export const MAX_STAGGER_ITEMS_CALENDAR = 12;
export const EXIT_WATCHDOG_MS = 280;

const FALLBACK_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "p",
  "li",
  "article",
  ".btn",
  ".field",
  ".metric",
  ".info-card",
  ".notice",
  ".calendar-event"
].join(",");

const timelineRegistry = new WeakMap<HTMLElement, gsap.core.Timeline>();

type MotionContextValue = {
  transitionState: TransitionState;
  beginExitTransition: (root?: HTMLElement | null) => Promise<boolean>;
};

const MotionContext = createContext<MotionContextValue | null>(null);

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function getMotionItemLimit(scope: MotionScope): number {
  if (scope === "admin") {
    return MAX_STAGGER_ITEMS_ADMIN;
  }
  if (scope === "calendar") {
    return MAX_STAGGER_ITEMS_CALENDAR;
  }
  return MAX_STAGGER_ITEMS_PUBLIC;
}

export function inferMotionScope(root: HTMLElement | null): MotionScope {
  if (!root) {
    return "public";
  }

  const fromDataset = root.dataset.motionRoot || root.dataset.motionScope;
  if (fromDataset === "admin" || fromDataset === "calendar") {
    return fromDataset;
  }

  if (root.classList.contains("admin-shell")) {
    return "admin";
  }

  return "public";
}

function uniqueElements(items: HTMLElement[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const unique: HTMLElement[] = [];
  for (const item of items) {
    if (seen.has(item)) {
      continue;
    }
    seen.add(item);
    unique.push(item);
  }
  return unique;
}

function isVisibleElement(element: HTMLElement): boolean {
  if (element.dataset.motionSkip === "true") {
    return false;
  }

  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
    return false;
  }

  const rects = element.getClientRects();
  return rects.length > 0;
}

function collectMotionItems(root: HTMLElement, scope: MotionScope, explicitItems?: HTMLElement[]): HTMLElement[] {
  const requested = explicitItems && explicitItems.length > 0
    ? explicitItems
    : (() => {
        const explicit = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-item]"));
        if (explicit.length > 0) {
          return explicit;
        }
        return Array.from(root.querySelectorAll<HTMLElement>(FALLBACK_SELECTOR));
      })();

  const visibleItems = uniqueElements(requested).filter(isVisibleElement);
  return visibleItems.slice(0, getMotionItemLimit(scope));
}

function clearTimeline(root: HTMLElement): void {
  const existing = timelineRegistry.get(root);
  if (!existing) {
    return;
  }
  existing.kill();
  timelineRegistry.delete(root);
}

function runTimelineWithWatchdog(timeline: gsap.core.Timeline, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let finished = false;

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      resolve();
    };

    const timer = window.setTimeout(() => {
      timeline.kill();
      finish();
    }, timeoutMs);

    timeline.eventCallback("onComplete", () => {
      window.clearTimeout(timer);
      finish();
    });

    timeline.eventCallback("onInterrupt", () => {
      window.clearTimeout(timer);
      finish();
    });
  });
}

export function findPrimaryMotionRoot(): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }
  return (
    (document.querySelector("[data-motion-primary='true']") as HTMLElement | null) ||
    (document.querySelector("[data-motion-root]") as HTMLElement | null)
  );
}

export function findClosestMotionRoot(node: Element | null): HTMLElement | null {
  if (!node) {
    return findPrimaryMotionRoot();
  }
  return (node.closest("[data-motion-root]") as HTMLElement | null) || findPrimaryMotionRoot();
}

type AnimationOptions = {
  explicitItems?: HTMLElement[];
  scope?: MotionScope;
  duration?: number;
  y?: number;
  stagger?: number;
};

export async function animateIn(root: HTMLElement | null, options: AnimationOptions = {}): Promise<void> {
  if (!root || typeof window === "undefined") {
    return;
  }

  clearTimeline(root);

  const scope = options.scope || inferMotionScope(root);
  const items = collectMotionItems(root, scope, options.explicitItems);
  if (!items.length) {
    return;
  }

  if (prefersReducedMotion()) {
    gsap.set(items, {
      clearProps: "opacity,transform"
    });
    return;
  }

  gsap.set(items, {
    opacity: 0,
    y: options.y ?? 10
  });

  const timeline = gsap.timeline();
  timeline.to(items, {
    opacity: 1,
    y: 0,
    duration: options.duration ?? 0.2,
    stagger: options.stagger ?? 0.024,
    ease: "power2.out",
    overwrite: "auto",
    clearProps: "opacity,transform"
  });

  timelineRegistry.set(root, timeline);
  await runTimelineWithWatchdog(timeline, EXIT_WATCHDOG_MS);
  timelineRegistry.delete(root);
}

export async function animateOut(root: HTMLElement | null, options: AnimationOptions = {}): Promise<void> {
  if (!root || typeof window === "undefined") {
    return;
  }

  clearTimeline(root);

  const scope = options.scope || inferMotionScope(root);
  const items = collectMotionItems(root, scope, options.explicitItems);
  if (!items.length || prefersReducedMotion()) {
    return;
  }

  const timeline = gsap.timeline();
  timeline.to(items, {
    opacity: 0,
    y: options.y ?? -8,
    duration: options.duration ?? 0.16,
    stagger: options.stagger ?? 0.018,
    ease: "power2.in",
    overwrite: "auto"
  });

  timelineRegistry.set(root, timeline);
  await runTimelineWithWatchdog(timeline, EXIT_WATCHDOG_MS);
  timelineRegistry.delete(root);
}

export function MotionProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const lockedRef = useRef(false);

  const beginExitTransition = useCallback(async (root?: HTMLElement | null) => {
    if (lockedRef.current) {
      return false;
    }

    lockedRef.current = true;
    setTransitionState("exiting");

    const targetRoot = root || findPrimaryMotionRoot();
    await animateOut(targetRoot, {
      scope: inferMotionScope(targetRoot)
    });

    setTransitionState("navigating");
    return true;
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const root = findPrimaryMotionRoot();
      if (!root) {
        lockedRef.current = false;
        setTransitionState("idle");
        return;
      }

      setTransitionState("entering");
      animateIn(root, {
        scope: inferMotionScope(root)
      }).finally(() => {
        lockedRef.current = false;
        setTransitionState("idle");
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [pathname]);

  const value = useMemo(
    () => ({
      transitionState,
      beginExitTransition
    }),
    [beginExitTransition, transitionState]
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export function useTweenOrchestrator(): MotionContextValue {
  const context = useContext(MotionContext);
  if (!context) {
    throw new Error("useTweenOrchestrator must be used inside MotionProvider.");
  }
  return context;
}
