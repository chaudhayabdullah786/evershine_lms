'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { SITE_CONFIG } from '@/content/site-config'

import SiteHeader from '@/components/landing/site-header'
import SiteFooter from '@/components/landing/site-footer'
import WhatsAppWidget from '@/components/landing/whatsapp-widget'
import HeroSection from '@/components/landing/hero-section'
import AnnouncementTicker from '@/components/landing/announcement-ticker'
import { SubjectsTicker } from '@/components/landing/subjects-ticker'
import StatsBar from '@/components/landing/stats-bar'
import { HomepageUpdates } from '@/components/landing/homepage-updates'
import ProgramsSection from '@/components/landing/programs-section'
import DeferredSection from '@/components/landing/deferred-section'

const ServicesShowcase = dynamic(
  () => import('@/components/landing/services-showcase').then((mod) => mod.ServicesShowcase),
  { ssr: false }
)
const WhyEvershineSection = dynamic(() => import('@/components/landing/why-evershine-section'), { ssr: false })
const CampusShowcase = dynamic(() => import('@/components/landing/campus-showcase'), { ssr: false })
const AcademyMemories = dynamic(() => import('@/components/landing/academy-memories'), { ssr: false })
const PrincipalStory = dynamic(
  () => import('@/components/landing/principal-story').then((mod) => mod.PrincipalStory),
  { ssr: false }
)
const SmartParentPortal = dynamic(
  () => import('@/components/landing/smart-parent-portal').then((mod) => mod.SmartParentPortal),
  { ssr: false }
)
const EventsTimeline = dynamic(
  () => import('@/components/landing/events-timeline').then((mod) => mod.EventsTimeline),
  { ssr: false }
)
const CTASection = dynamic(() => import('@/components/landing/cta-section'), { ssr: false })
const ShiftsSection = dynamic(
  () => import('@/components/landing/shifts-section').then((mod) => mod.ShiftsSection),
  { ssr: false }
)
const TestimonialsSection = dynamic(() => import('@/components/landing/testimonials-section'), { ssr: false })
const FAQSection = dynamic(() => import('@/components/landing/faq-section'), { ssr: false })
const ContactSection = dynamic(() => import('@/components/landing/contact-section'), { ssr: false })
const TeacherApplicationModal = dynamic(() => import('@/components/landing/teacher-application-modal'), { ssr: false })

export default function LandingPageClient() {
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

      <SiteHeader onApplyClick={handleApplyClick} />

      <main>
        <HeroSection
          banners={SITE_CONFIG.bannerImages}
          academyName={SITE_CONFIG.academyName}
          tagline={SITE_CONFIG.tagline}
          subTagline={SITE_CONFIG.subTagline}
          onApplyClick={handleApplyClick}
        />

        <AnnouncementTicker text={SITE_CONFIG.announcementText} />
        <SubjectsTicker />
        <StatsBar stats={SITE_CONFIG.stats} />
        <HomepageUpdates />
        <ProgramsSection programs={SITE_CONFIG.programs} />

        <DeferredSection minHeight={720}>{() => <ServicesShowcase />}</DeferredSection>
        <DeferredSection minHeight={640}>{() => <WhyEvershineSection features={SITE_CONFIG.whyEvershineFeatures} />}</DeferredSection>
        <DeferredSection minHeight={760}>{() => <CampusShowcase onApplyClick={handleApplyClick} />}</DeferredSection>
        <DeferredSection minHeight={980}>{() => <AcademyMemories images={SITE_CONFIG.galleryImages} videos={SITE_CONFIG.videos} />}</DeferredSection>
        <DeferredSection minHeight={620}>{() => <PrincipalStory />}</DeferredSection>
        <DeferredSection minHeight={620}>{() => <SmartParentPortal />}</DeferredSection>
        <DeferredSection minHeight={620}>{() => <EventsTimeline />}</DeferredSection>
        <DeferredSection minHeight={420}>
          {() => (
            <CTASection
              onStudentApply={handleApplyClick}
              onTeacherApply={() => setTeacherModalOpen(true)}
            />
          )}
        </DeferredSection>
        <DeferredSection minHeight={520}>{() => <ShiftsSection />}</DeferredSection>
        <DeferredSection minHeight={520}>{() => <TestimonialsSection testimonials={SITE_CONFIG.testimonials} />}</DeferredSection>
        <DeferredSection minHeight={520}>{() => <FAQSection faqs={SITE_CONFIG.faqs} />}</DeferredSection>
        <DeferredSection minHeight={720}>{() => <ContactSection contactInfo={SITE_CONFIG.contactInfo} />}</DeferredSection>
      </main>

      <SiteFooter contactInfo={SITE_CONFIG.contactInfo} />
      <WhatsAppWidget phoneNumber={SITE_CONFIG.contactInfo.whatsapp} />

      {teacherModalOpen && (
        <TeacherApplicationModal
          isOpen={teacherModalOpen}
          onClose={() => setTeacherModalOpen(false)}
          whatsappNumber={SITE_CONFIG.contactInfo.whatsapp}
        />
      )}
    </div>
  )
}
