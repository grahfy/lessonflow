const path = require("path");
const isProduction = process.env.NODE_ENV === "production";
const isLowMemoryDeployBuild = process.env.NEXT_LOW_MEMORY_BUILD === "1";

// Content Security Policy — defense-in-depth against XSS.
// Directives are split across lines for readability; joined into a single header value below.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com https://i.ytimg.com",
  "frame-src https://www.youtube-nocookie.com",
  "connect-src 'self' https://nominatim.openstreetmap.org",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'"
];

const baseSecurityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives.join("; ")
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff"
  },
  {
    key: "X-Frame-Options",
    value: "DENY"
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin"
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "off"
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()"
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin"
  }
];

const securityHeaders = isProduction
  ? [
      ...baseSecurityHeaders,
      {
        key: "Strict-Transport-Security",
        value: "max-age=31536000; includeSubDomains; preload"
      }
    ]
  : baseSecurityHeaders;

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  poweredByHeader: false,
  experimental: {
    // RATIONALE: Next.js documents this as a low-risk way to reduce peak
    // Webpack memory usage during builds on smaller hosts.
    webpackMemoryOptimizations: isLowMemoryDeployBuild
  },
  // Low-memory deploy builds can skip duplicate validation work because the
  // project already exposes dedicated lint/typecheck commands for CI/manual use.
  eslint: {
    ignoreDuringBuilds: isLowMemoryDeployBuild
  },
  typescript: {
    ignoreBuildErrors: isLowMemoryDeployBuild
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders
      }
    ];
  }
};

module.exports = nextConfig;
