import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Evershaheen Academy LMS",
  description: "Empowering minds, building futures — Evershaheen Academy Learning Management System",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Evershaheen LMS",
  },
  icons: {
    // WHY brand/: These reference the canonical brand assets in /public/brand/.
    // The root /favicon.svg and /favicon.ico are retained as fallbacks for
    // browsers that look there first, but all metadata explicitly points to
    // the correct brand icons so tabs and bookmarks show the academy logo.
    icon: [
      { url: "/brand/logo-icon.svg",     type: "image/svg+xml" },
      { url: "/brand/logo-icon-16.png",  sizes: "16x16",   type: "image/png" },
      { url: "/brand/logo-icon-32.png",  sizes: "32x32",   type: "image/png" },
      { url: "/brand/logo-icon-48.png",  sizes: "48x48",   type: "image/png" },
      { url: "/brand/logo-icon-64.png",  sizes: "64x64",   type: "image/png" },
      { url: "/brand/logo-icon-128.png", sizes: "128x128", type: "image/png" },
      { url: "/brand/logo-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/brand/logo-icon.svg",
    apple: "/brand/logo-icon-192.png",
  },
};

import { Providers } from "@/components/providers";
import { SessionProvider } from "next-auth/react";
import { PWARegister } from "@/components/providers/PWARegister";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("h-full")} suppressHydrationWarning data-scroll-behavior="smooth">
      <body
  className="min-h-full bg-background text-foreground antialiased"
  suppressHydrationWarning
>
        <SessionProvider>
          <Providers>
            {children}
            <PWARegister />
            <Toaster />
          </Providers>
        </SessionProvider>
      </body>
    </html>
  );
}
