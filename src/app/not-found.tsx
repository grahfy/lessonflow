import type { Metadata } from "next";
import Link from "next/link";

import { getBranding } from "@/lib/branding";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  const branding = getBranding();

  return (
    <div className="not-found-page">
      <h1>Page not found</h1>
      <p>The page you&apos;re looking for doesn&apos;t exist or has been moved.</p>
      <Link href="/" className="btn btn-primary">
        Back to {branding.PUBLIC_BRAND_NAME}
      </Link>
    </div>
  );
}
