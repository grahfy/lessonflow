import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = "https://www.melbourneguitarschool.com.au";

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin/", "/student/portal/", "/api/", "/setup/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
