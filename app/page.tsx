'use client'

import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'

/**
 * app/page.tsx — Evershine Academy Landing Page v3
 * Updated: 2026-06-20 — Dynamic content management & final_ones integration
 * 
 * Assembles all landing page sections into a single,
 * conversion-optimized page. All content sourced from
 * content/site-config.ts for client-editable updates.
 * 
 * Section Order (v3 — updated):
 *  1. Header (transparent → sticky)
 *  2. Hero (enhanced carousel with admission-open-2026 banner)
 *  3. Announcement Ticker (enhanced multi-item, professional)
 *  4. Subjects Ticker (navy strip)
 *  5. Stats Bar (count-up animation)
 *  6. Homepage Updates (NEW — "What's New at ESA")
 *  7. Programs Journey (tabbed cards)
 *  8. Services Showcase (NEW — Quran/Coaching/Personality Dev tabs)
 *  9. Why Evershine (bento features)
 * 10. Campus Showcase (parallax split)
 * 11. Academy Memories (enhanced with 4 new campus photos)
 * 12. Principal Story (founder pattern)
 * 13. Smart Parent Portal (enhanced with Vision 2030 image)
 * 14. Events Timeline (NEW — upcoming events)
 * 15. CTA (student + teacher)
 * 16. Shifts (Morning/Evening/Night)
 * 17. Testimonials (carousel)
 * 18. FAQ (accordion)
 * 19. Contact (form + map)
 * 20. Footer
 * 21. WhatsApp Widget (fixed)
 * + Teacher Application Modal
 */

import { useState } from 'react'
import { SITE_CONFIG } from '@/content/site-config'

// Layout
import SiteHeader from '@/components/landing/site-header'
import SiteFooter from '@/components/landing/site-footer'
import WhatsAppWidget from '@/components/landing/whatsapp-widget'

// Sections
import HeroSection from '@/components/landing/hero-section'
import AnnouncementTicker from '@/components/landing/announcement-ticker'
import { SubjectsTicker } from '@/components/landing/subjects-ticker'
import StatsBar from '@/components/landing/stats-bar'

function LandingSectionFallback() {
  return (
    <div
      aria-hidden="true"
      style={{
        minHeight: '220px',
        background: 'linear-gradient(180deg, rgba(245,243,239,0.6), rgba(255,255,255,0))',
      }}
    />
  )
}

const HomepageUpdates = dynamic(
  () => import('@/components/landing/homepage-updates').then((m) => m.HomepageUpdates),
  { ssr: false, loading: LandingSectionFallback }
)
const ProgramsSection = dynamic(() => import('@/components/landing/programs-section'), { ssr: false, loading: LandingSectionFallback })
const ServicesShowcase = dynamic(
  () => import('@/components/landing/services-showcase').then((m) => m.ServicesShowcase),
  { ssr: false, loading: LandingSectionFallback }
)
const WhyEvershineSection = dynamic(() => import('@/components/landing/why-evershine-section'), { ssr: false, loading: LandingSectionFallback })
const CampusShowcase = dynamic(() => import('@/components/landing/campus-showcase'), { ssr: false, loading: LandingSectionFallback })
const AcademyMemories = dynamic(() => import('@/components/landing/academy-memories'), { ssr: false, loading: LandingSectionFallback })
const PrincipalStory = dynamic(
  () => import('@/components/landing/principal-story').then((m) => m.PrincipalStory),
  { ssr: false, loading: LandingSectionFallback }
)
const SmartParentPortal = dynamic(
  () => import('@/components/landing/smart-parent-portal').then((m) => m.SmartParentPortal),
  { ssr: false, loading: LandingSectionFallback }
)
const EventsTimeline = dynamic(
  () => import('@/components/landing/events-timeline').then((m) => m.EventsTimeline),
  { ssr: false, loading: LandingSectionFallback }
)
const CTASection = dynamic(() => import('@/components/landing/cta-section'), { ssr: false, loading: LandingSectionFallback })
const ShiftsSection = dynamic(
  () => import('@/components/landing/shifts-section').then((m) => m.ShiftsSection),
  { ssr: false, loading: LandingSectionFallback }
)
const TestimonialsSection = dynamic(() => import('@/components/landing/testimonials-section'), { ssr: false, loading: LandingSectionFallback })
const FAQSection = dynamic(() => import('@/components/landing/faq-section'), { ssr: false, loading: LandingSectionFallback })
const ContactSection = dynamic(() => import('@/components/landing/contact-section'), { ssr: false, loading: LandingSectionFallback })
const TeacherApplicationModal = dynamic(() => import('@/components/landing/teacher-application-modal'), { ssr: false })

export default function LandingPage() {
  const router = useRouter()
  const [teacherModalOpen, setTeacherModalOpen] = useState(false)

  const handleApplyClick = () => router.push('/admissions/apply')

  return (
    <div
      style={{
        backgroundColor: 'var(--lp-background)',
        color: 'var(--lp-text)',
        overflow: 'hidden',
      }}
    >
      {/* Skip Navigation — WCAG 2.1 AA */}
      <a
        href="#about"
        className="sr-only focus:not-sr-only"
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          zIndex: 9999,
          padding: '8px 16px',
          backgroundColor: 'var(--lp-primary)',
          color: '#FFF',
          borderRadius: '4px',
          textDecoration: 'none',
          fontWeight: 600,
        }}
      >
        Skip to main content
      </a>

      {/* ── S-01. Header ── */}
      <SiteHeader onApplyClick={handleApplyClick} />

      <main>
        {/* ── S-02. Hero (enhanced carousel) ── */}
        <HeroSection
          banners={SITE_CONFIG.bannerImages}
          academyName={SITE_CONFIG.academyName}
          tagline={SITE_CONFIG.tagline}
          subTagline={SITE_CONFIG.subTagline}
          onApplyClick={handleApplyClick}
        />

        {/* ── S-03. Announcement Ticker (enhanced multi-item) ── */}
        <AnnouncementTicker text={SITE_CONFIG.announcementText} />

        {/* ── S-04. Subjects Ticker (navy strip) ── */}
        <SubjectsTicker />

        {/* ── S-05. Stats Bar ── */}
        <StatsBar stats={SITE_CONFIG.stats} />

        {/* ── S-06. Homepage Updates (NEW — "What's New at ESA") ── */}
        <HomepageUpdates />

        {/* ── S-07. Programs ── */}
        <ProgramsSection programs={SITE_CONFIG.programs} />

        {/* ── S-08. Services Showcase (NEW — Quran/Coaching/PD tabs) ── */}
        <ServicesShowcase />

        {/* ── S-09. Why Evershine ── */}
        <WhyEvershineSection features={SITE_CONFIG.whyEvershineFeatures} />

        {/* ── S-10. Campus Showcase ── */}
        <CampusShowcase onApplyClick={handleApplyClick} />

        {/* ── S-11. Academy Memories (enhanced with new campus photos) ── */}
        <AcademyMemories
          images={SITE_CONFIG.galleryImages}
          videos={SITE_CONFIG.videos}
        />

        {/* ── S-12. Principal Story ── */}
        <PrincipalStory />

        {/* ── S-13. Smart Parent Portal (enhanced with Vision 2030) ── */}
        <SmartParentPortal />

        {/* ── S-14. Events Timeline (NEW) ── */}
        <EventsTimeline />

        {/* ── S-15. CTA ── */}
        <CTASection
          onStudentApply={handleApplyClick}
          onTeacherApply={() => setTeacherModalOpen(true)}
        />

        {/* ── S-16. Shifts ── */}
        <ShiftsSection />

        {/* ── S-17. Testimonials ── */}
        <TestimonialsSection testimonials={SITE_CONFIG.testimonials} />

        {/* ── S-18. FAQ ── */}
        <FAQSection faqs={SITE_CONFIG.faqs} />

        {/* ── S-19. Contact ── */}
        <ContactSection contactInfo={SITE_CONFIG.contactInfo} />
      </main>

      {/* ── S-20. Footer ── */}
      <SiteFooter contactInfo={SITE_CONFIG.contactInfo} />

      {/* ── S-21. WhatsApp Widget ── */}
      <WhatsAppWidget phoneNumber={SITE_CONFIG.contactInfo.whatsapp} />

      {/* ── Application Modals ── */}
      <TeacherApplicationModal
        isOpen={teacherModalOpen}
        onClose={() => setTeacherModalOpen(false)}
        whatsappNumber={SITE_CONFIG.contactInfo.whatsapp}
      />
    </div>
  )
}
