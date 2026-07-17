const path = require("path");
const { AlphaTabWebPackPlugin } = require("@coderline/alphatab-webpack");
const isProduction = process.env.NODE_ENV === "production";
const isLowMemoryDeployBuild = process.env.NEXT_LOW_MEMORY_BUILD === "1";

// Content Security Policy — defense-in-depth against XSS.
// Directives are split across lines for readability; joined into a single header value below.
// 'unsafe-eval' is only needed by the dev server (React Refresh / HMR); the
// production bundle does not use eval, so it is dropped there to tighten the
// policy. 'unsafe-inline' is retained because Next.js injects inline bootstrap/
// hydration scripts that would otherwise require a per-request nonce.
// 'blob:' is required by alphaTab's AudioWorklet (Guitar Pro playback, B.2):
// it bootstraps its processor module via addModule(URL.createObjectURL(...)),
// and an AudioWorklet MODULE fetch is governed by script-src (not worker-src) —
// live QA confirmed the worklet AbortErrors without it. Scoped to blob: only
// (no 'unsafe-eval' in prod; alphaTab's synth is pure JS and needs none).
const scriptSrc = isProduction
  ? "script-src 'self' 'unsafe-inline' blob:"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:";

const cspDirectives = [
  "default-src 'self'",
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  // alphaTab's synth Web Worker loads same-origin from /_next/static (emitted by
  // @coderline/alphatab-webpack), so 'self' suffices here. The AudioWorklet's
  // blob: need is handled in script-src above (worklet MODULE fetches are a
  // script-src concern, not worker-src — verified via live QA A/B test).
  "worker-src 'self'",
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
  // alphaTab (Guitar Pro playback, Phase B.2) ships its synthesizer as a Web
  // Worker + AudioWorklet, resolved internally via
  // `new URL('./alphaTab.worker(let).mjs', import.meta.url)`. Plain webpack does
  // not emit those ESM assets and bakes in an unfetchable file:// path, so the
  // player silently fails at runtime. The official plugin emits the worker/
  // worklet into /_next/static (same-origin, satisfies `worker-src 'self'`) and
  // rewrites the references. Client build only (the synth never runs on the
  // server). assetOutputDir:false because the Bravura font and SONiVOX soundfont
  // are already self-hosted under public/alphatab/. NOTE: this plugin only runs
  // under webpack, which is the Next 15.5 default for both `next dev` and
  // `next build` — so `dev` intentionally does NOT pass `--turbopack` (Turbopack
  // has no plugin API and would skip this hook, breaking playback in dev).
  webpack(config, { isServer }) {
    if (!isServer) {
      config.plugins.push(new AlphaTabWebPackPlugin({ assetOutputDir: false }));
    }
    return config;
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
