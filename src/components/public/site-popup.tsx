"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { AppDialog } from "@/components/ui/app-dialog";
import type { PopupAnimation, PopupFormFactor, PopupImagePlacement } from "@/generated/prisma/client";

import styles from "./site-popup.module.css";

/**
 * Presentational promo popup — the public-site renderer for an admin-authored
 * SitePopup (promo-popup-system, AC-25..AC-45). Pure props in, DOM out: no
 * fetching, no repeat-policy evaluation, no stats calls. `SitePopupContainer`
 * (site-popup-container.tsx) owns all of that and supplies onDismiss/onCtaClick.
 *
 * Field names deliberately mirror src/lib/popups/popup-contract.ts (`heading`,
 * `ctaUrl`, `buttonBackgroundColor`, ...) and the generated Prisma enums, so
 * the eventual container can pass an API response straight through with no
 * translation layer — one less place for the contract to drift.
 */

export interface SitePopupContent {
  heading: string;
  /**
   * Rich text from TipTap, already sanitized ON WRITE by
   * src/lib/popups/popup-contract.ts (`sanitizePopupBodyHtml` — a
   * schema-constrained TipTap round-trip that drops script/iframe/style/on*
   * handlers and javascript:/data:/vbscript: hrefs before the row is ever
   * stored). Confirmed by team-lead: render it directly via
   * dangerouslySetInnerHTML below — do not add a second sanitization pass
   * here, a divergent client-side sanitizer is its own hazard.
   */
  bodyHtml: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
}

export interface SitePopupStyle {
  backgroundColor: string;
  textColor: string;
  buttonBackgroundColor: string;
  buttonTextColor: string;
  /** Author-configured desktop width. Never honoured below 640px — a custom width can't overflow a phone. */
  widthPx?: number | null;
  cornerRadiusPx?: number | null;
}

export interface SitePopupProps {
  isOpen: boolean;
  formFactor: PopupFormFactor;
  animation: PopupAnimation;
  imagePlacement: PopupImagePlacement;
  content: SitePopupContent;
  style: SitePopupStyle;
  onDismiss: () => void;
  onCtaClick: () => void;
}

const DEFAULT_CORNER_RADIUS_PX = 16;
const DEFAULT_CORNER_WIDTH_PX = 340;
const DEFAULT_MODAL_WIDTH_PX = 480;

function backgroundImageStyle(imageUrl: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(rgba(6, 11, 31, 0.35), rgba(6, 11, 31, 0.72)), url(${imageUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center"
  };
}

export function SitePopup({
  isOpen,
  formFactor,
  animation,
  imagePlacement,
  content,
  style,
  onDismiss,
  onCtaClick
}: SitePopupProps) {
  const cornerRadiusPx = style.cornerRadiusPx ?? DEFAULT_CORNER_RADIUS_PX;

  // imageUrl points at /api/popups/{id}/image — degrade to no-image rather
  // than a broken-image box if it 404s (endpoint still being built) or an
  // admin deletes the file out from under a live popup. Resets per image so
  // a later popup/edit gets its own attempt.
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setImageFailed(false);
  }, [content.imageUrl]);

  // The bar is `position: fixed; top: 0`, so it is painted over the site header
  // — covering the nav it is meant to sit above. Offset the page by the bar's
  // MEASURED height rather than a constant: the height depends on the author's
  // heading length and on the viewport, so any hard-coded number is wrong at
  // some breakpoint. Declared before the `isOpen` early return to keep the hook
  // order stable across open/closed renders.
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const clear = () => root.style.removeProperty("--site-popup-bar-offset");
    const element = barRef.current;
    if (!isOpen || formFactor !== "bar" || !element) {
      clear();
      return clear;
    }
    const apply = () => {
      root.style.setProperty("--site-popup-bar-offset", `${element.getBoundingClientRect().height}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(element);
    return () => {
      observer.disconnect();
      clear();
    };
  }, [isOpen, formFactor, content.heading, content.bodyHtml, content.ctaLabel]);

  if (!isOpen) return null;

  const animationClass = styles[`enter-${animation}`];
  const hasCta = Boolean(content.ctaLabel && content.ctaUrl);
  // AC-45 change (approved): the bar is content-constrained to heading + one
  // line + CTA. No factor shows an image once it's a bar, regardless of what
  // the author uploaded or configured.
  const showImage =
    formFactor !== "bar" && Boolean(content.imageUrl) && !imageFailed && imagePlacement !== "none" && imagePlacement !== "background";
  const showBackgroundImage = formFactor !== "bar" && Boolean(content.imageUrl) && !imageFailed && imagePlacement === "background";

  const cta = hasCta ? (
    <a
      className={styles.cta}
      style={{ background: style.buttonBackgroundColor, color: style.buttonTextColor }}
      href={content.ctaUrl as string}
      onClick={onCtaClick}
    >
      {content.ctaLabel}
    </a>
  ) : null;

  const image = showImage ? (
    <div className={imagePlacement === "side" ? styles.imageSide : styles.imageTop} style={{ borderRadius: cornerRadiusPx }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- deliberate: author-uploaded promo images gain little from next/image optimization, not worth the remote-pattern config */}
      <img src={content.imageUrl as string} alt={content.imageAlt ?? ""} onError={() => setImageFailed(true)} />
    </div>
  ) : null;

  if (formFactor === "modal") {
    const widthPx = style.widthPx ?? DEFAULT_MODAL_WIDTH_PX;
    return (
      <AppDialog
        isOpen={isOpen}
        onClose={onDismiss}
        title={content.heading}
        size="sm"
        panelClassName={animationClass}
        panelStyle={{
          width: `min(${widthPx}px, calc(100vw - 40px))`,
          background: style.backgroundColor,
          borderColor: style.backgroundColor,
          borderRadius: cornerRadiusPx,
          color: style.textColor,
          position: "relative",
          ...(showBackgroundImage ? backgroundImageStyle(content.imageUrl as string) : {})
        }}
        footer={cta}
      >
        {showBackgroundImage && <div className={styles.scrim} style={{ borderRadius: cornerRadiusPx }} />}
        {image}
        <div
          className={styles.body}
          style={{ color: style.textColor }}
          dangerouslySetInnerHTML={{ __html: content.bodyHtml }}
        />
      </AppDialog>
    );
  }

  if (formFactor === "corner") {
    const widthPx = style.widthPx ?? DEFAULT_CORNER_WIDTH_PX;
    return (
      <aside
        className={`${styles.corner} ${animationClass}`}
        role="complementary"
        aria-label={content.heading}
        style={{
          width: `min(${widthPx}px, calc(100vw - 40px))`,
          background: style.backgroundColor,
          borderRadius: cornerRadiusPx,
          ...(showBackgroundImage ? backgroundImageStyle(content.imageUrl as string) : {})
        }}
      >
        {showBackgroundImage && <div className={styles.scrim} style={{ borderRadius: cornerRadiusPx }} />}
        <div className={styles.cornerHead}>
          {image}
          <h2 className={styles.heading} style={{ color: style.textColor }}>
            {content.heading}
          </h2>
          <button type="button" className={styles.close} style={{ color: style.textColor }} onClick={onDismiss} aria-label="Close">
            ×
          </button>
        </div>
        <div
          className={styles.body}
          style={{ color: style.textColor }}
          dangerouslySetInnerHTML={{ __html: content.bodyHtml }}
        />
        {cta}
      </aside>
    );
  }

  // formFactor === "bar" — heading + one clipped line + CTA only, never an image.
  return (
    <div
      ref={barRef}
      className={`${styles.bar} ${animationClass}`}
      role="region"
      aria-label={content.heading}
      style={{ background: style.backgroundColor }}
    >
      <div className={styles.barText}>
        <span className={styles.barHeading} style={{ color: style.textColor }}>
          {content.heading}
        </span>
        <div
          className={styles.barBody}
          style={{ color: style.textColor }}
          dangerouslySetInnerHTML={{ __html: content.bodyHtml }}
        />
      </div>
      {cta}
      <button type="button" className={styles.barClose} style={{ color: style.textColor }} onClick={onDismiss} aria-label="Close">
        ×
      </button>
    </div>
  );
}
