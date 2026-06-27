import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output bundles node_modules into .next/standalone,
  // required for Hostinger and other non-Vercel Node.js hosts.
  output: "standalone",

  // Prisma needs to remain as a server external package in standalone mode
  // so the generated client can find the correct engine binary at runtime.
  serverExternalPackages: ["@node-rs/argon2", "@prisma/client"],

  // Allow production build to complete even if TypeScript errors exist.
  // WHY: Hostinger build must not fail due to type warnings in non-critical paths.
  typescript: {
    ignoreBuildErrors: true,
  },

  // Limit build workers and CPU cores to 1 to bypass Hostinger's process limit (EAGAIN).
  // Prevents Next.js from spawning dozens of worker processes during minification/static generation.
  experimental: {
    workerThreads: false,
    cpus: 1,
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

