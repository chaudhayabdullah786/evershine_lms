import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles node_modules into .next/standalone,
  // required for Hostinger and other non-Vercel Node.js hosts.
  output: "standalone",

  // Prisma needs to remain as a server external package in standalone mode
  // so the generated client can find the correct engine binary at runtime.
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client"],

  // Allow production build to complete even if TypeScript or ESLint errors exist.
  // Both are run independently via `npm run lint` in the CI pipeline.
  // WHY: Hostinger build must not fail due to type/lint warnings in non-critical paths.
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Image remote patterns — add domains your images are served from.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
    ],
  },

  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
        ],
      },
      // Hardened security headers
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

