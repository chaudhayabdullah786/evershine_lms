import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { Providers } from "@/components/providers";
import { SessionProvider } from "next-auth/react";
import { PWARegister } from "@/components/providers/PWARegister";

export const viewport: Viewport = {
  themeColor: "#0F4C81",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Evershine Academy | Modern Digital Learning and LMS",
    template: "%s | Evershine Academy",
  },
  description: "Evershine Academy provides quality education, online courses, an LMS, student and teacher portals, assignments, quizzes, examinations, and modern digital learning.",
  keywords: [
    "Evershine Academy",
    "Ever Shine Academy",
    "Evershine LMS",
    "Ever Shine LMS",
    "Best Academy",
    "Learning Management System",
    "School Management System",
    "Student Portal",
    "Teacher Portal",
    "Online Classes",
    "Pakistan Academy",
    "Education",
    "Digital Learning",
    "Gujranwala Academy",
    "Online Courses",
  ],
  authors: [{ name: "Evershine Academy" }],
  creator: "Evershine Academy",
  publisher: "Evershine Academy",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-video-preview": -1,
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "https://www.evershineacadmey.com/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.evershineacadmey.com/",
    siteName: "Evershine Academy",
    title: "Evershine Academy | Modern Digital Learning and LMS",
    description: "Quality education, online courses, LMS, student and teacher portals, assignments, quizzes, examinations, and modern digital learning.",
    images: [
      {
        url: "https://www.evershineacadmey.com/assets/images/evershine-social-share.jpg",
        width: 1200,
        height: 630,
        alt: "Evershine Academy",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Evershine Academy | Modern Digital Learning and LMS",
    description: "Quality education, online courses, LMS, student and teacher portals, assignments, quizzes, examinations, and modern digital learning.",
    images: ["https://www.evershineacadmey.com/assets/images/evershine-social-share.jpg"],
  },
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
    apple: "/brand/pwa-icon-180.png",
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "EverShine LMS",
    "msapplication-TileColor": "#0f172a",
    "msapplication-TileImage": "/brand/pwa-icon-192.png",
  },
};


// Hostinger replaces the active standalone bundle during each deployment.
// Static HTML cached by an edge for a previous build can therefore reference
// chunk hashes that no longer exist in the new bundle. Rendering document
// routes dynamically makes Next.js emit private/no-store cache headers while
// keeping content-hashed /_next/static assets immutable and cacheable.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("h-full")} suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "EducationalOrganization",
              "@id": "https://www.evershineacadmey.com/#organization",
              "name": "Evershine Academy",
              "url": "https://www.evershineacadmey.com/",
              "logo": {
                "@type": "ImageObject",
                "url": "https://www.evershineacadmey.com/images/logo.png"
              },
              "description": "Evershine Academy provides quality education, online courses, an LMS, student and teacher portals, assignments, quizzes, examinations, and modern digital learning.",
              "address": {
                "@type": "PostalAddress",
                "streetAddress": "Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony",
                "addressLocality": "Gujranwala",
                "addressRegion": "Punjab",
                "addressCountry": "PK"
              },
              "telephone": "+92-328-4010522"
            })
          }}
        />
      </head>
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

