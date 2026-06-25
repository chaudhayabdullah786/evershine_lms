'use client'

/**
 * components/landing/services-showcase.tsx
 *
 * Tabbed showcase for ESA's three main service offerings:
 * 1. Online Quran Classes
 * 2. Online Coaching Centre
 * 3. Personality Development Sessions
 *
 * Architecture:
 * - 3-tab card switcher at top
 * - Full-width banner reveal with structured content overlay on select
 * - Programs grid + features list per service
 * - CTA button per service
 *
 * Data-driven from SITE_CONFIG.services[].
 * Responsive: stacked cards on mobile, tabbed grid on desktop.
 */

import Image from 'next/image'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SITE_CONFIG } from '@/content/site-config'
import { SectionLabel } from '@/components/ui/section-label'
import {
  BookOpen, Monitor, Brain, CheckCircle2, ArrowRight, Sparkles,
} from 'lucide-react'
import Link from 'next/link'
import type { ServiceOffering } from '@/types/landing'

const ICON_MAP: Record<string, React.ElementType> = {
  'quran-classes': BookOpen,
  'coaching-centre': Monitor,
  'personality-dev': Brain,
}

const tabVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.3 } },
}

export function ServicesShowcase() {
  const services = SITE_CONFIG.services ?? []
  const [activeTab, setActiveTab] = useState(0)

  if (services.length === 0) return null

  const active = services[activeTab]

  return (
    <section
      id="services"
      aria-label="ESA Service Offerings"
      style={{ backgroundColor: '#0D1B2A', position: 'relative', overflow: 'hidden' }}
    >
      {/* Background decorative elements */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div
          style={{
            position: 'absolute',
            top: '-20%',
            right: '-10%',
            width: '500px',
            height: '500px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(245,166,35,0.06) 0%, transparent 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-15%',
            left: '-5%',
            width: '400px',
            height: '400px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(27,79,138,0.08) 0%, transparent 70%)',
          }}
        />
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '100px 16px', position: 'relative', zIndex: 2 }}>
        {/* Section Header */}
        <motion.div
          style={{ textAlign: 'center', marginBottom: '48px' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <SectionLabel number="SERVICES" labelColor="#F5A623" />
          <h2
            style={{
              fontFamily: 'var(--lp-font-display)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 800,
              color: '#FFFFFF',
              marginBottom: '12px',
              lineHeight: 1.2,
            }}
          >
            Our{' '}
            <span style={{ color: '#F5A623', fontStyle: 'italic' }}>
              Specialized
            </span>{' '}
            Programs
          </h2>
          <p
            style={{
              fontSize: '1.05rem',
              color: 'rgba(255,255,255,0.65)',
              maxWidth: '600px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            Beyond regular academics — explore our dedicated programs designed to
            build complete, confident, and career-ready individuals.
          </p>
        </motion.div>

        {/* Tab Buttons */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px',
            justifyContent: 'center',
            marginBottom: '40px',
          }}
        >
          {services.map((service: ServiceOffering, i: number) => {
            const Icon = ICON_MAP[service.id] || Sparkles
            const isActive = i === activeTab
            return (
              <motion.button
                key={service.id}
                onClick={() => setActiveTab(i)}
                whileHover={{ scale: 1.04, y: -2 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px 28px',
                  borderRadius: '12px',
                  border: isActive ? `2px solid ${service.accentColor}` : '2px solid rgba(255,255,255,0.12)',
                  backgroundColor: isActive ? `${service.accentColor}18` : 'rgba(255,255,255,0.04)',
                  color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                  fontSize: '0.92rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.3s',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <Icon size={18} style={{ color: isActive ? service.accentColor : 'rgba(255,255,255,0.5)' }} />
                {service.title}
                {service.badge && (
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '6px',
                      backgroundColor: service.accentColor,
                      color: service.accentColor === '#1B4F8A' ? '#FFFFFF' : '#0D1B2A',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {service.badge}
                  </span>
                )}
              </motion.button>
            )
          })}
        </div>

        {/* Active Service Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={active.id}
            variants={tabVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            style={{
              borderRadius: '20px',
              overflow: 'hidden',
              backgroundColor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
            }}
          >
            {/* Banner Image */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                lineHeight: 0,
                maxHeight: '460px',
                overflow: 'hidden',
              }}
            >
              <Image
                src={active.bannerSrc}
                alt={active.bannerAlt}
                width={1672}
                height={941}
                sizes="(max-width: 768px) 100vw, 1200px"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block',
                  objectFit: 'cover',
                  objectPosition: 'center',
                }}
              />
              {/* Gradient overlay for readability */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '50%',
                  background: 'linear-gradient(to top, rgba(13,27,42,0.95), transparent)',
                  pointerEvents: 'none',
                }}
              />
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 }}
                style={{
                  position: 'absolute',
                  top: '20px',
                  left: '20px',
                  padding: '6px 18px',
                  borderRadius: '8px',
                  backgroundColor: active.accentColor,
                  color: active.accentColor === '#1B4F8A' ? '#FFFFFF' : '#0D1B2A',
                  fontSize: '0.78rem',
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  boxShadow: `0 4px 16px ${active.accentColor}60`,
                }}
              >
                {active.badge}
              </motion.div>
            </div>

            {/* Content Below Banner */}
            <div style={{ padding: 'clamp(24px, 4vw, 48px)' }}>
              {/* Title + Subtitle */}
              <h3
                style={{
                  fontFamily: 'var(--lp-font-display)',
                  fontSize: 'clamp(1.4rem, 3vw, 2rem)',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  marginBottom: '6px',
                }}
              >
                {active.title}
              </h3>
              <p style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.6)', marginBottom: '28px' }}>
                {active.subtitle}
              </p>

              {/* Two-column: Programs + Features */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '32px',
                  marginBottom: '32px',
                }}
              >
                {/* Programs */}
                <div>
                  <h4
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: active.accentColor,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '16px',
                    }}
                  >
                    Programs Offered
                  </h4>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {active.programs.map((prog: string) => (
                      <span
                        key={prog}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          color: 'rgba(255,255,255,0.85)',
                          fontSize: '0.85rem',
                          fontWeight: 500,
                        }}
                      >
                        {prog}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Features */}
                <div>
                  <h4
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: active.accentColor,
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      marginBottom: '16px',
                    }}
                  >
                    Key Features
                  </h4>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '10px' }}>
                    {active.features.map((feat: string, i: number) => (
                      <motion.li
                        key={feat}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.06 }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          fontSize: '0.9rem',
                          color: 'rgba(255,255,255,0.8)',
                        }}
                      >
                        <CheckCircle2 size={16} style={{ color: active.accentColor, flexShrink: 0 }} />
                        {feat}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* CTA */}
              <motion.div whileHover={{ scale: 1.03, y: -2 }} whileTap={{ scale: 0.97 }}>
                <Link
                  href={active.ctaLink}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '14px 36px',
                    borderRadius: '12px',
                    backgroundColor: active.accentColor,
                    color: active.accentColor === '#1B4F8A' ? '#FFFFFF' : '#0D1B2A',
                    fontSize: '1rem',
                    fontWeight: 700,
                    textDecoration: 'none',
                    boxShadow: `0 6px 24px ${active.accentColor}40`,
                    transition: 'box-shadow 0.3s',
                  }}
                >
                  {active.ctaText}
                  <ArrowRight size={16} />
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
