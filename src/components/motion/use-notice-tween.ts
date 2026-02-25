"use client";

import gsap from "gsap";
import { useEffect, useRef } from "react";

import { prefersReducedMotion } from "@/components/motion/tween-orchestrator";

/**
 * Animates transient notice banners (success/error) when they become visible.
 *
 * The hook is intentionally minimal so forms can opt into a consistent notice entrance animation
 * without sharing form state logic.
 */
export function useNoticeTween<T extends HTMLElement = HTMLParagraphElement>(isActive: boolean) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!isActive || !ref.current || prefersReducedMotion()) {
      return;
    }

    // `overwrite:auto` prevents stacked notice animations from fighting each other during rapid
    // validation changes.
    gsap.fromTo(
      ref.current,
      {
        opacity: 0,
        y: -4
      },
      {
        opacity: 1,
        y: 0,
        duration: 0.18,
        ease: "power2.out",
        overwrite: "auto"
      }
    );
  }, [isActive]);

  return ref;
}
