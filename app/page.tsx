'use client'

import { useRouter } from 'next/navigation'

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
import { HomepageUpdates } from '@/components/landing/homepage-updates'
import ProgramsSection from '@/components/landing/programs-section'
import { ServicesShowcase } from '@/components/landing/services-showcase'
import WhyEvershineSection from '@/components/landing/why-evershine-section'
import CampusShowcase from '@/components/landing/campus-showcase'
import AcademyMemories from '@/components/landing/academy-memories'
import { PrincipalStory } from '@/components/landing/principal-story'
import { SmartParentPortal } from '@/components/landing/smart-parent-portal'
import { EventsTimeline } from '@/components/landing/events-timeline'
import CTASection from '@/components/landing/cta-section'
import { ShiftsSection } from '@/components/landing/shifts-section'
import TestimonialsSection from '@/components/landing/testimonials-section'
import FAQSection from '@/components/landing/faq-section'
import ContactSection from '@/components/landing/contact-section'

// Modals
import TeacherApplicationModal from '@/components/landing/teacher-application-modal'

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
