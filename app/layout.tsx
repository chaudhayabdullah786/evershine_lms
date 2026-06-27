import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "EverShine Academy LMS",
  description: "Empowering minds, building futures — EverShine Academy Learning Management System",
  manifest: "/manifest.json",
  // PWA: apple-web-app-capable enables "Add to Home Screen" on iOS Safari
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "EverShine LMS",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-128x128.png", sizes: "128x128", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    // Apple Touch Icon — used when user adds PWA to iOS home screen
    // pwa-icon-180.png is generated from evershinelogo.png via scripts/setup-pwa-icons.js
    apple: "/brand/pwa-icon-180.png",
  },
  // PWA theme color — matches manifest.json theme_color
  // Displayed in Android Chrome address bar and notification shade
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "EverShine LMS",
    "msapplication-TileColor": "#0f172a",
    "msapplication-TileImage": "/brand/pwa-icon-192.png",
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
