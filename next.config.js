const path = require("path");
const isProduction = process.env.NODE_ENV === "production";
const isLowMemoryDeployBuild = process.env.NEXT_LOW_MEMORY_BUILD === "1";

// Content Security Policy — defense-in-depth against XSS.
// Directives are split across lines for readability; joined into a single header value below.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
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
  // Keep the native MariaDB driver and Prisma adapter out of the bundled graph.
  // They depend on Node built-ins ('crypto', 'os', etc.); bundling them (e.g. via
  // the instrumentation.ts -> observability -> db -> adapter chain Next traces at
  // build time) fails with "Can't resolve 'crypto'/'os'". Treating them as
  // external defers resolution to Node at runtime where the built-ins exist.
  serverExternalPackages: ["@prisma/adapter-mariadb", "mariadb"],
  experimental: {
    // RATIONALE: Next.js documents this as a low-risk way to reduce peak
    // Webpack memory usage during builds on smaller hosts.
    webpackMemoryOptimizations: isLowMemoryDeployBuild
  },
  // The project exposes dedicated `npm run lint` and `npm run typecheck`
  // commands.  Skipping these during `next build` avoids duplicate work and
  // shaves time off every deploy.
  eslint: {
    ignoreDuringBuilds: true
  },
  typescript: {
    ignoreBuildErrors: true
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
