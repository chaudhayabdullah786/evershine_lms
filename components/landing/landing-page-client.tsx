'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useState, Component, type ReactNode } from 'react'
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

class SectionErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  componentDidCatch(err: Error) {
    console.error('[landing] Section error:', err.message)
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null
    }
    return this.props.children
  }
}

const ServicesShowcase = dynamic(
  () => import('@/components/landing/services-showcase').then((mod) => mod.ServicesShowcase),
  { ssr: false, loading: () => null }
)
const WhyEvershineSection = dynamic(() => import('@/components/landing/why-evershine-section'), { ssr: false, loading: () => null })
const CampusShowcase = dynamic(() => import('@/components/landing/campus-showcase'), { ssr: false, loading: () => null })
const AcademyMemories = dynamic(() => import('@/components/landing/academy-memories'), { ssr: false, loading: () => null })
const PrincipalStory = dynamic(
  () => import('@/components/landing/principal-story').then((mod) => mod.PrincipalStory),
  { ssr: false, loading: () => null }
)
const SmartParentPortal = dynamic(
  () => import('@/components/landing/smart-parent-portal').then((mod) => mod.SmartParentPortal),
  { ssr: false, loading: () => null }
)
const EventsTimeline = dynamic(
  () => import('@/components/landing/events-timeline').then((mod) => mod.EventsTimeline),
  { ssr: false, loading: () => null }
)
const CTASection = dynamic(() => import('@/components/landing/cta-section'), { ssr: false, loading: () => null })
const ShiftsSection = dynamic(
  () => import('@/components/landing/shifts-section').then((mod) => mod.ShiftsSection),
  { ssr: false, loading: () => null }
)
const TestimonialsSection = dynamic(() => import('@/components/landing/testimonials-section'), { ssr: false, loading: () => null })
const FAQSection = dynamic(() => import('@/components/landing/faq-section'), { ssr: false, loading: () => null })
const ContactSection = dynamic(() => import('@/components/landing/contact-section'), { ssr: false, loading: () => null })
const TeacherApplicationModal = dynamic(() => import('@/components/landing/teacher-application-modal'), { ssr: false, loading: () => null })

function WithErrorBoundary({ children }: { children: ReactNode }) {
  return <SectionErrorBoundary>{children}</SectionErrorBoundary>
}

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

        <DeferredSection minHeight={720}>
          {() => <WithErrorBoundary><ServicesShowcase /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={640}>
          {() => <WithErrorBoundary><WhyEvershineSection features={SITE_CONFIG.whyEvershineFeatures} /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={760}>
          {() => <WithErrorBoundary><CampusShowcase onApplyClick={handleApplyClick} /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={980}>
          {() => <WithErrorBoundary><AcademyMemories images={SITE_CONFIG.galleryImages} videos={SITE_CONFIG.videos} /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={620}>
          {() => <WithErrorBoundary><PrincipalStory /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={620}>
          {() => <WithErrorBoundary><SmartParentPortal /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={620}>
          {() => <WithErrorBoundary><EventsTimeline /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={420}>
          {() => (
            <WithErrorBoundary>
              <CTASection
                onStudentApply={handleApplyClick}
                onTeacherApply={() => setTeacherModalOpen(true)}
              />
            </WithErrorBoundary>
          )}
        </DeferredSection>
        <DeferredSection minHeight={520}>
          {() => <WithErrorBoundary><ShiftsSection /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={520}>
          {() => <WithErrorBoundary><TestimonialsSection testimonials={SITE_CONFIG.testimonials} /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={520}>
          {() => <WithErrorBoundary><FAQSection faqs={SITE_CONFIG.faqs} /></WithErrorBoundary>}
        </DeferredSection>
        <DeferredSection minHeight={720}>
          {() => <WithErrorBoundary><ContactSection contactInfo={SITE_CONFIG.contactInfo} /></WithErrorBoundary>}
        </DeferredSection>
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
