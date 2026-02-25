const path = require("path");
const isProduction = process.env.NODE_ENV === "production";
const isLowMemoryDeployBuild = process.env.NEXT_LOW_MEMORY_BUILD === "1";

const baseSecurityHeaders = [
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
