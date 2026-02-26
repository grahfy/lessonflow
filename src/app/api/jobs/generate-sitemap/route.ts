import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

import { getCronSecret, getPublicSiteUrl, hasCronSecret } from "@/lib/env";

type PageConfig = {
  enabled: boolean;
  priority: number;
  changeFrequency: string;
  title: string;
  description: string;
  keywords: string[];
  noindex: boolean;
};

type SeoConfig = {
  version: string;
  lastUpdated: string;
  pages: Record<string, PageConfig>;
  robots: {
    defaultUserAgent: string;
    allow: string[];
    disallow: string[];
    sitemap: boolean;
  };
};

/**
 * POST /api/jobs/generate-sitemap
 * 
 * Generates sitemap.xml and robots.txt from the SEO configuration.
 * Requires x-cron-secret header for authentication.
 */
export async function POST(request: NextRequest) {
  if (!hasCronSecret()) {
    return NextResponse.json({ error: "Cron secret not configured" }, { status: 401 });
  }
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== getCronSecret()) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Load SEO configuration
    const seoConfigPath = path.join(process.cwd(), "src/lib/seo-config.json");
    if (!fs.existsSync(seoConfigPath)) {
      return NextResponse.json({ error: "SEO config not found" }, { status: 404 });
    }

    const seoConfig: SeoConfig = JSON.parse(fs.readFileSync(seoConfigPath, "utf-8"));

    // Get base URL from environment
    const baseUrl = getPublicSiteUrl().replace(/\/+$/, "");

    // Generate sitemap.xml
    const sitemapXml = generateSitemapXml(baseUrl, seoConfig.pages);
    const sitemapPath = path.join(process.cwd(), "public/sitemap.xml");
    fs.writeFileSync(sitemapPath, sitemapXml, "utf-8");

    // Generate robots.txt
    const robotsTxt = generateRobotsTxt(baseUrl, seoConfig);
    const robotsPath = path.join(process.cwd(), "public/robots.txt");
    fs.writeFileSync(robotsPath, robotsTxt, "utf-8");

    // Update lastUpdated timestamp
    seoConfig.lastUpdated = new Date().toISOString();
    fs.writeFileSync(seoConfigPath, JSON.stringify(seoConfig, null, 2), "utf-8");

    return NextResponse.json({
      ok: true,
      sitemap: {
        path: "/sitemap.xml",
        urlCount: Object.values(seoConfig.pages).filter((p) => p.enabled && !p.noindex).length
      },
      robots: {
        path: "/robots.txt"
      }
    });
  } catch (error) {
    console.error("Failed to generate sitemap:", error);
    return NextResponse.json(
      { error: "Failed to generate sitemap", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

/**
 * Generate sitemap XML from page configuration
 */
function generateSitemapXml(baseUrl: string, pages: Record<string, PageConfig>): string {
  const now = new Date().toISOString().split("T")[0];
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const [urlPath, config] of Object.entries(pages)) {
    if (!config.enabled || config.noindex) {
      continue;
    }

    const url = urlPath === "/" ? baseUrl : `${baseUrl}${urlPath}`;

    xml += '  <url>\n';
    xml += `    <loc>${url}</loc>\n`;
    xml += `    <lastmod>${now}</lastmod>\n`;
    xml += `    <changefreq>${config.changeFrequency}</changefreq>\n`;
    xml += `    <priority>${config.priority}</priority>\n`;
    xml += '  </url>\n';
  }

  xml += '</urlset>\n';
  return xml;
}

/**
 * Generate robots.txt from configuration
 */
function generateRobotsTxt(baseUrl: string, config: SeoConfig): string {
  let txt = `# Robots.txt for Melbourne Guitar School\n`;
  txt += `# Generated: ${new Date().toISOString()}\n\n`;

  txt += `User-agent: ${config.robots.defaultUserAgent}\n\n`;

  // Add allow rules for enabled pages
  txt += `# Allowed paths\n`;
  for (const [urlPath, pageConfig] of Object.entries(config.pages)) {
    if (pageConfig.enabled && !pageConfig.noindex && urlPath !== "/") {
      txt += `Allow: ${urlPath}\n`;
    }
  }

  // Add disallow rules
  txt += `\n# Disallowed paths\n`;
  for (const disallow of config.robots.disallow) {
    txt += `Disallow: ${disallow}\n`;
  }

  // Add sitemap reference
  txt += `\n# Sitemap\n`;
  txt += `Sitemap: ${baseUrl}/sitemap.xml\n`;

  return txt;
}
