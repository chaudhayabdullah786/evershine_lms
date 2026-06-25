import type { Metadata } from 'next'
import { SITE_CONFIG } from '@/content/site-config'
import LandingPageClient from '@/components/landing/landing-page-client'

export const metadata: Metadata = {
  metadataBase: new URL(SITE_CONFIG.websiteUrl ?? 'https://www.evershineacademy.com'),
  title: SITE_CONFIG.seo?.title ?? 'Evershine Academy',
  description: SITE_CONFIG.seo?.description ?? SITE_CONFIG.subTagline,
  keywords: SITE_CONFIG.seo?.keywords,
  openGraph: {
    title: SITE_CONFIG.seo?.title ?? 'Evershine Academy',
    description: SITE_CONFIG.seo?.description ?? SITE_CONFIG.subTagline,
    images: [SITE_CONFIG.seo?.ogImage ?? '/assets/images/optimized/banner/banner-3.webp'],
  },
}

export default function LandingPage() {
  return <LandingPageClient />
}
