import type { MetadataRoute } from "next";

import { getSeoSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSeoSiteUrl();
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/student/", "/api/", "/setup/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
