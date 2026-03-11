"use client";

import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";

import type { AdminBuildInfo } from "@/lib/build-info-types";

type BuildInfoResponse = {
  ok: boolean;
  buildInfo?: AdminBuildInfo;
};

/**
 * Compact footer that keeps the current admin build identifier visible.
 */
export function AdminBuildInfoFooter(): ReactElement {
  const [buildInfo, setBuildInfo] = useState<AdminBuildInfo | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadBuildInfo() {
      try {
        const response = await fetch("/api/admin/build-info", { cache: "no-store" });
        if (!response.ok) {
          return;
        }

        const body = (await response.json().catch(() => null)) as BuildInfoResponse | null;
        if (!cancelled && body?.ok && body.buildInfo) {
          setBuildInfo(body.buildInfo);
        }
      } catch {
        // RATIONALE: The footer should fail quietly rather than add admin noise.
      }
    }

    void loadBuildInfo();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <footer className="admin-build-info-footer" aria-label="Build information">
      <p className="helper-text admin-build-info-footer-copy">
        Version <code>{buildInfo?.versionText || "Loading..."}</code>
      </p>
      <div className="admin-build-info-footer-links">
        <span className="helper-text">Created by {buildInfo?.createdBy || "Dean Thomson"}</span>
        <Link href="/admin/about" className="helper-text">
          About
        </Link>
      </div>
    </footer>
  );
}
