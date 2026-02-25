"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnchorHTMLAttributes, MouseEvent, PropsWithChildren } from "react";

import { findClosestMotionRoot, useTweenOrchestrator } from "@/components/motion/tween-orchestrator";
import { ensurePublicHeroReady } from "@/lib/public-hero-preload";
import { getRouteDirection } from "@/lib/site-data";

type TweenLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick" | "children"> &
  PropsWithChildren<{
  href: string;
  prefetch?: boolean;
}>;

/**
 * Link wrapper that coordinates route navigation with the motion exit transition system.
 *
 * It preserves default browser behavior for modified/external/hash links and only intercepts
 * standard internal navigations.
 */
function isInternalHref(href: string): boolean {
  return href.startsWith("/");
}

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}

export function TweenLink({ href, children, ...rest }: TweenLinkProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { beginExitTransition } = useTweenOrchestrator();

  async function onClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || isModifiedEvent(event)) {
      return;
    }

    if (!isInternalHref(href) || href === pathname || href.startsWith("#")) {
      return;
    }

    event.preventDefault();
    // Ensure key hero imagery is ready before starting the exit transition to reduce perceived
    // flicker on route entry.
    await ensurePublicHeroReady(href);

    const root = findClosestMotionRoot(event.currentTarget);
    const direction = getRouteDirection(pathname, href);
    const accepted = await beginExitTransition(root, direction, () => {
      router.push(href);
    });
    if (!accepted) {
      return;
    }
  }

  return (
    <Link href={href} onClick={onClick} {...rest}>
      {children}
    </Link>
  );
}
