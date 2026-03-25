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

import { getRouteDirection } from "@/lib/site-data";

export type MotionScope = "public" | "admin" | "calendar";
export type TransitionState = "idle" | "entering" | "exiting" | "navigating";
export type MotionDirection = -1 | 0 | 1;

export const MAX_STAGGER_ITEMS_PUBLIC = 36;
export const MAX_STAGGER_ITEMS_ADMIN = 24;
export const MAX_STAGGER_ITEMS_CALENDAR = 12;
export const MAX_DIRECTIONAL_ITEMS_PUBLIC = 12;
export const EXIT_WATCHDOG_MS = 520;
const ENTER_WATCHDOG_BUFFER_MS = 140;
const ENTER_WATCHDOG_MAX_MS = 2000;

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
  beginExitTransition: (
    root?: HTMLElement | null,
    direction?: MotionDirection,
    navigate?: () => void
  ) => Promise<boolean>;
};

const MotionContext = createContext<MotionContextValue | null>(null);

/**
 * Shared reduced-motion check used by animation helpers and presence controllers.
 */
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

/** Infers which motion budget/profile applies to the current rendered root. */
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

/** Deduplicates DOM nodes while preserving their original discovery order. */
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

/** Rejects hidden/skipped DOM nodes before they enter a GSAP sequence. */
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

/**
 * Collects motion targets for a root, preferring explicit annotations and only
 * falling back to generic selectors for older pages.
 */
function collectMotionItems(root: HTMLElement, scope: MotionScope, explicitItems?: HTMLElement[]): HTMLElement[] {
  const rootIsScoped = root.hasAttribute("data-motion-root");
  const isItemInsideScopedRoot = (item: HTMLElement) => {
    if (!rootIsScoped) {
      return true;
    }
    const closestRoot = item.closest("[data-motion-root]") as HTMLElement | null;
    return !closestRoot || closestRoot === root;
  };

  const requested = explicitItems && explicitItems.length > 0
    ? explicitItems
    : (() => {
        // Prefer explicit motion markers. Fallback selectors are only used for pages that have not
        // opted into per-element motion annotations yet.
        const explicit = Array.from(root.querySelectorAll<HTMLElement>("[data-motion-item]"));
        if (root.hasAttribute("data-motion-item")) {
          explicit.unshift(root);
        }
        if (explicit.length > 0) {
          return explicit;
        }
        return Array.from(root.querySelectorAll<HTMLElement>(FALLBACK_SELECTOR));
      })();

  const visibleItems = uniqueElements(requested).filter(isItemInsideScopedRoot).filter(isVisibleElement);
  return visibleItems.slice(0, getMotionItemLimit(scope));
}

/** Selects a stable ordered subset for directional public-page slide transitions. */
function collectDirectionalPublicItems(root: HTMLElement): HTMLElement[] {
  const view = findDirectionalStage(root);
  const order = [
    "[data-motion-item='kicker']",
    "[data-motion-item='title']",
    "[data-motion-item='lead']",
    "[data-motion-item='copy'] .button-row, .button-row",
    "[data-motion-item='copy'] .metrics, [data-motion-item='copy'] .card-grid, [data-motion-item='copy'] .list, [data-motion-item='copy'] .form-grid, [data-motion-item='copy'] .helper-text"
  ];

  const requested: HTMLElement[] = [];
  for (const selector of order) {
    const match = view.querySelector<HTMLElement>(selector);
    if (match) {
      requested.push(match);
    }
  }

  if (!requested.length) {
    return collectMotionItems(root, "public").slice(0, MAX_DIRECTIONAL_ITEMS_PUBLIC);
  }

  return uniqueElements(requested).filter(isVisibleElement).slice(0, MAX_DIRECTIONAL_ITEMS_PUBLIC);
}

/** Finds the element that should receive whole-view directional translation. */
function findDirectionalStage(root: HTMLElement): HTMLElement {
  return (
    root.querySelector<HTMLElement>("[data-motion-stage='true']") ||
    root.querySelector<HTMLElement>(".view") ||
    root
  );
}

/** Computes how far a page should travel during horizontal transitions. */
function getDirectionalDistance(stage: HTMLElement): number {
  return Math.max(420, stage.clientWidth + 64);
}

/** Computes the smaller follower offset used for child elements in slide transitions. */
function getDirectionalOffset(stage: HTMLElement): number {
  return Math.min(96, Math.max(52, Math.round(stage.clientWidth * 0.11)));
}

/** Clears and unregisters any in-flight timeline already attached to this root. */
function clearTimeline(root: HTMLElement): void {
  const existing = timelineRegistry.get(root);
  if (!existing) {
    return;
  }
  existing.kill();
  timelineRegistry.delete(root);
}

/**
 * Runs a GSAP timeline with a hard timeout so route transitions cannot stall
 * forever if the DOM changes mid-animation.
 */
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

    // Watchdog prevents the motion system from deadlocking route transitions if GSAP timelines are
    // interrupted or never complete due to DOM/state changes.
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
  direction?: MotionDirection;
};

export async function animateIn(root: HTMLElement | null, options: AnimationOptions = {}): Promise<void> {
  if (!root || typeof window === "undefined") {
    return;
  }

  clearTimeline(root);

  const scope = options.scope || inferMotionScope(root);
  const direction = options.direction ?? 0;
  const useHorizontalMotion = scope === "public" && direction !== 0;
  const directionalStage = useHorizontalMotion ? findDirectionalStage(root) : null;
  const items = useHorizontalMotion
    ? collectDirectionalPublicItems(root)
    : collectMotionItems(root, scope, options.explicitItems);
  if (!items.length && !directionalStage) {
    return;
  }

  if (prefersReducedMotion()) {
    // Clear transforms/opacity immediately so reduced-motion users still see the correct final state.
    if (directionalStage) {
      gsap.set(directionalStage, {
        clearProps: "transform"
      });
    }
    gsap.set(items, {
      clearProps: "opacity,transform"
    });
    return;
  }

  if (useHorizontalMotion && directionalStage) {
    // RATIONALE: Public page transitions slide the whole stage plus a smaller
    // child offset to create directional continuity between routes.
    const stageDistance = getDirectionalDistance(directionalStage);
    const itemOffset = getDirectionalOffset(directionalStage);
    gsap.set(directionalStage, {
      x: direction > 0 ? stageDistance : -stageDistance,
      force3D: true
    });
    if (items.length) {
      gsap.set(items, {
        x: direction > 0 ? itemOffset : -itemOffset,
        force3D: true
      });
    }
  } else {
    gsap.set(items, {
      opacity: 0,
      y: options.y ?? 0
    });
  }

  const timeline = gsap.timeline();
  if (useHorizontalMotion && directionalStage) {
    timeline.to(
      directionalStage,
      {
        x: 0,
        duration: options.duration ?? 0.42,
        ease: "power4.out",
        force3D: true,
        overwrite: "auto",
        clearProps: "transform"
      },
      0
    );
    if (items.length) {
      timeline.to(
        items,
        {
          x: 0,
          duration: 0.34,
          stagger: options.stagger ?? 0.018,
          ease: "power3.out",
          force3D: true,
          overwrite: "auto",
          clearProps: "transform"
        },
        0.08
      );
    }
  } else {
    timeline.to(items, {
      opacity: 1,
      y: 0,
      duration: options.duration ?? 0.2,
      stagger: options.stagger ?? 0.024,
      ease: "power2.out",
      overwrite: "auto",
      clearProps: "opacity,transform"
    });
  }

  const enterWatchdogMs = Math.min(
    ENTER_WATCHDOG_MAX_MS,
    Math.max(EXIT_WATCHDOG_MS, Math.ceil(timeline.totalDuration() * 1000 + ENTER_WATCHDOG_BUFFER_MS))
  );

  timelineRegistry.set(root, timeline);
  await runTimelineWithWatchdog(timeline, enterWatchdogMs);
  if (directionalStage) {
    gsap.set(directionalStage, {
      clearProps: "transform"
    });
  }
  if (items.length) {
    gsap.set(items, {
      clearProps: "opacity,transform"
    });
  }
  timelineRegistry.delete(root);
}

export async function animateOut(root: HTMLElement | null, options: AnimationOptions = {}): Promise<void> {
  if (!root || typeof window === "undefined") {
    return;
  }

  clearTimeline(root);

  const scope = options.scope || inferMotionScope(root);
  const direction = options.direction ?? 0;
  const useHorizontalMotion = scope === "public" && direction !== 0;
  const directionalStage = useHorizontalMotion ? findDirectionalStage(root) : null;
  const items = useHorizontalMotion
    ? collectDirectionalPublicItems(root)
    : collectMotionItems(root, scope, options.explicitItems);
  if ((!items.length && !directionalStage) || prefersReducedMotion()) {
    return;
  }

  const timeline = gsap.timeline();
  if (useHorizontalMotion && directionalStage) {
    // NOTE: Exit motion mirrors the public-page slide system but uses shorter
    // durations so navigation feels responsive before the next page animates in.
    const stageDistance = getDirectionalDistance(directionalStage);
    const itemOffset = getDirectionalOffset(directionalStage);
    if (items.length) {
      timeline.to(
        items,
        {
          x: direction > 0 ? -itemOffset : itemOffset,
          duration: options.duration ?? 0.24,
          stagger: options.stagger ?? 0.015,
          ease: "power3.in",
          force3D: true,
          overwrite: "auto"
        },
        0
      );
    }
    timeline.to(
      directionalStage,
      {
        x: direction > 0 ? -stageDistance : stageDistance,
        duration: 0.36,
        ease: "power4.inOut",
        force3D: true,
        overwrite: "auto"
      },
      0.03
    );
  } else {
    timeline.to(items, {
      opacity: 0,
      y: options.y ?? 0,
      duration: options.duration ?? 0.16,
      stagger: options.stagger ?? 0,
      ease: "power2.in",
      overwrite: "auto"
    });
  }

  timelineRegistry.set(root, timeline);
  await runTimelineWithWatchdog(timeline, EXIT_WATCHDOG_MS);
  timelineRegistry.delete(root);
}

export function MotionProvider({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const [transitionState, setTransitionState] = useState<TransitionState>("idle");
  const lockedRef = useRef(false);
  const hasMountedRef = useRef(false);
  const lastPathnameRef = useRef(pathname);
  const pendingDirectionRef = useRef<MotionDirection>(0);

  const beginExitTransition = useCallback(async (
    root?: HTMLElement | null,
    direction: MotionDirection = 0,
    navigate?: () => void
  ) => {
    // Lock prevents overlapping route transitions from racing and leaving the motion state machine
    // in an inconsistent state.
    if (lockedRef.current) {
      return false;
    }

    lockedRef.current = true;
    pendingDirectionRef.current = direction;

    const targetRoot = root || findPrimaryMotionRoot();
    const scope = inferMotionScope(targetRoot);

    setTransitionState("exiting");
    await animateOut(targetRoot, {
      scope,
      direction
    });

    setTransitionState("navigating");
    if (navigate) {
      navigate();
      return true;
    }

    lockedRef.current = false;
    pendingDirectionRef.current = 0;
    setTransitionState("idle");
    return true;
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      // RATIONALE: Skipping the initial enter animation prevents GSAP from mutating
      // server-rendered markup before nested client components finish hydrating.
      hasMountedRef.current = true;
      lastPathnameRef.current = pathname;
      pendingDirectionRef.current = 0;
      lockedRef.current = false;
      setTransitionState("idle");
      return;
    }

    const inferredDirection = (() => {
      const previous = lastPathnameRef.current;
      lastPathnameRef.current = pathname;
      if (pendingDirectionRef.current !== 0) {
        return pendingDirectionRef.current;
      }
      // NOTE: When navigation did not explicitly specify a direction, infer it
      // from route structure so browser back/forward still feel consistent.
      return getRouteDirection(previous, pathname);
    })();

    // Wait one frame after pathname changes so the new page root/elements exist before animating in.
    const frame = window.requestAnimationFrame(() => {
      const root = findPrimaryMotionRoot();
      if (!root) {
        lockedRef.current = false;
        pendingDirectionRef.current = 0;
        setTransitionState("idle");
        return;
      }

      setTransitionState("entering");
      animateIn(root, {
        scope: inferMotionScope(root),
        direction: inferredDirection
      }).finally(() => {
        lockedRef.current = false;
        pendingDirectionRef.current = 0;
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
