"use client";

import type { CSSProperties, ReactNode } from "react";

/**
 * Accessible loading skeleton primitives.
 *
 * RATIONALE: Skeletons replace spinner-only / "Loading" text states so the
 * placeholder occupies the same footprint as the eventual content, removing
 * layout shift (CLS) when data arrives. The shimmer is purely decorative
 * (aria-hidden); screen readers are informed via a single SkeletonRegion that
 * exposes role="status" + aria-busy with sr-only "Loading" copy.
 *
 * Styling lives in src/styles/skeleton.css (imported in app/layout.tsx) and
 * consumes the --skeleton-* design tokens with literal fallbacks so this
 * component is never blocked on token availability. The shimmer animation is
 * disabled under prefers-reduced-motion (see the stylesheet).
 */

type SkeletonShape = "rect" | "text" | "circle";

interface SkeletonBlockProps {
  /** Visual shape; "text" rounds to a line, "circle" is fully round. */
  variant?: SkeletonShape;
  /** CSS width (e.g. "100%", "8rem", 120). Defaults to 100%. */
  width?: string | number;
  /** CSS height (e.g. "1rem", 40). Defaults to a single text line. */
  height?: string | number;
  /** Border radius override. */
  radius?: string | number;
  className?: string;
  style?: CSSProperties;
}

function toCssSize(value: string | number | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? `${value}px` : value;
}

/**
 * A single shimmering placeholder block. Decorative only (aria-hidden); wrap a
 * group in <SkeletonRegion> so assistive tech announces the loading state once.
 */
export function SkeletonBlock({
  variant = "rect",
  width,
  height,
  radius,
  className,
  style
}: SkeletonBlockProps) {
  const classes = ["skeleton-block", `skeleton-block-${variant}`];
  if (className) {
    classes.push(className);
  }

  return (
    <span
      aria-hidden="true"
      className={classes.join(" ")}
      style={{
        width: toCssSize(width),
        height: toCssSize(height),
        borderRadius: toCssSize(radius),
        ...style
      }}
    />
  );
}

interface SkeletonTextProps {
  /** Number of stacked text lines. Defaults to 1. */
  lines?: number;
  /** Width of the last line (others are full width). */
  lastLineWidth?: string | number;
  className?: string;
}

/**
 * A stack of text-line skeletons. The final line is shortened by default to
 * mimic natural paragraph ragging.
 */
export function SkeletonText({ lines = 1, lastLineWidth = "60%", className }: SkeletonTextProps) {
  const classes = ["skeleton-text"];
  if (className) {
    classes.push(className);
  }

  return (
    <span className={classes.join(" ")} aria-hidden="true">
      {Array.from({ length: Math.max(1, lines) }).map((_, index) => {
        const isLast = index === lines - 1;
        return (
          <SkeletonBlock
            key={index}
            variant="text"
            width={isLast && lines > 1 ? lastLineWidth : "100%"}
          />
        );
      })}
    </span>
  );
}

interface SkeletonRowProps {
  /** Relative widths for each cell, e.g. ["20%", "30%", "1fr"]. */
  columns?: Array<string | number>;
  className?: string;
}

/**
 * A horizontal row of cell skeletons, sized to approximate a table/list row so
 * the placeholder grid aligns with the real columns.
 */
export function SkeletonRow({ columns = ["100%"], className }: SkeletonRowProps) {
  const classes = ["skeleton-row"];
  if (className) {
    classes.push(className);
  }

  return (
    <div
      className={classes.join(" ")}
      aria-hidden="true"
      style={{ gridTemplateColumns: columns.map((c) => toCssSize(c)).join(" ") }}
    >
      {columns.map((_, index) => (
        <SkeletonBlock key={index} variant="text" />
      ))}
    </div>
  );
}

interface SkeletonRegionProps {
  children: ReactNode;
  /** Accessible label announced while loading. */
  label?: string;
  className?: string;
}

/**
 * Wraps a group of skeletons and exposes the loading state to assistive tech
 * exactly once (role="status" + aria-busy) while keeping the shimmer visuals
 * hidden from the accessibility tree.
 */
export function SkeletonRegion({ children, label = "Loading", className }: SkeletonRegionProps) {
  const classes = ["skeleton-region"];
  if (className) {
    classes.push(className);
  }

  return (
    <div className={classes.join(" ")} role="status" aria-busy="true">
      <span className="skeleton-sr-only">{label}</span>
      {children}
    </div>
  );
}
