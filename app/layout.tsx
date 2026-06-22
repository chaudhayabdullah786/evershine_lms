import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "EverShine Academy LMS",
  description: "Empowering minds, building futures — EverShine Academy Learning Management System",
  manifest: "/manifest.json",
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
    apple: "/apple-touch-icon.png",
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
