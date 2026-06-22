'use client'

/**
 * components/landing/events-timeline.tsx
 *
 * Horizontal scrollable timeline showing upcoming academy events.
 * Each event displays as a card with date circle, status badge,
 * and optional registration CTA.
 *
 * Data from SITE_CONFIG.events[].
 * Responsive: horizontal scroll on desktop, vertical stack on mobile.
 */

import { motion } from 'framer-motion'
import { SectionLabel } from '@/components/ui/section-label'
import { SITE_CONFIG } from '@/content/site-config'
import { Calendar, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { AcademyEvent } from '@/types/landing'

const STATUS_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  upcoming:  { color: '#F59E0B', bg: '#FEF3C7', label: 'Upcoming' },
  ongoing:   { color: '#16A34A', bg: '#DCFCE7', label: 'Ongoing' },
  completed: { color: '#6B7280', bg: '#F3F4F6', label: 'Completed' },
}

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, delay: i * 0.12, ease: [0.25, 0.46, 0.45, 0.94] },
  }),
}

function parseDateParts(dateStr: string): { day: string; month: string } {
  // Expects: "June 25, 2026" → { day: "25", month: "JUN" }
  const parts = dateStr.split(' ')
  const month = (parts[0] ?? '').substring(0, 3).toUpperCase()
  const day = (parts[1] ?? '').replace(',', '')
  return { day, month }
}

export function EventsTimeline() {
  const events = SITE_CONFIG.events ?? []
  if (events.length === 0) return null

  return (
    <section
      id="events"
      aria-label="Upcoming Events"
      style={{ backgroundColor: '#F9F7F4', position: 'relative' }}
    >
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '100px 16px' }}>
        {/* Section Header */}
        <motion.div
          style={{ textAlign: 'center', marginBottom: '52px' }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <SectionLabel number="EVENTS" labelColor="#1B4F8A" />
          <h2
            style={{
              fontFamily: 'var(--lp-font-display)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 800,
              color: '#1A1A2E',
              marginBottom: '12px',
            }}
          >
            Upcoming{' '}
            <span style={{ color: '#F5A623', fontStyle: 'italic' }}>
              Events
            </span>
          </h2>
          <p
            style={{
              fontSize: '1.05rem',
              color: '#6B7280',
              maxWidth: '540px',
              margin: '0 auto',
              lineHeight: 1.6,
            }}
          >
            Mark your calendar — here are the key dates and events at Evershine Academy.
          </p>
        </motion.div>

        {/* Timeline Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '20px',
            position: 'relative',
          }}
        >
          {/* Connecting line (desktop only) */}
          <div
            className="hidden md:block"
            style={{
              position: 'absolute',
              top: '48px',
              left: '40px',
              right: '40px',
              height: '2px',
              background: 'linear-gradient(to right, rgba(27,79,138,0.1), rgba(245,166,35,0.2), rgba(27,79,138,0.1))',
              zIndex: 0,
            }}
          />

          {events.map((event: AcademyEvent, i: number) => {
            const { day, month } = parseDateParts(event.date)
            const status = STATUS_CONFIG[event.status] ?? STATUS_CONFIG.upcoming

            return (
              <motion.div
                key={event.title}
                custom={i}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: '-40px' }}
                whileHover={{
                  y: -8,
                  scale: 1.02,
                  transition: { duration: 0.25 },
                }}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '16px',
                  padding: '28px 24px',
                  boxShadow: '0 2px 16px rgba(27, 79, 138, 0.06)',
                  transition: 'box-shadow 0.4s',
                  position: 'relative',
                  zIndex: 2,
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 16px 48px rgba(27, 79, 138, 0.14)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 16px rgba(27, 79, 138, 0.06)'
                }}
              >
                {/* Date Circle */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '16px',
                    marginBottom: '20px',
                  }}
                >
                  <motion.div
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
                    style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '16px',
                      background: 'linear-gradient(135deg, #1B4F8A, #0f2d52)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#FFFFFF', lineHeight: 1 }}>
                      {day}
                    </span>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: '#F5A623', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {month}
                    </span>
                  </motion.div>

                  {/* Status Badge */}
                  <span
                    style={{
                      padding: '4px 12px',
                      borderRadius: '8px',
                      backgroundColor: status.bg,
                      color: status.color,
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    {status.label}
                  </span>
                </div>

                {/* Title */}
                <h3
                  style={{
                    fontFamily: 'var(--lp-font-display)',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: '#1A1A2E',
                    marginBottom: '8px',
                    lineHeight: 1.3,
                  }}
                >
                  {event.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    fontSize: '0.88rem',
                    color: '#6B7280',
                    lineHeight: 1.6,
                    marginBottom: '20px',
                  }}
                >
                  {event.description}
                </p>

                {/* Registration CTA */}
                {event.registrationRequired && event.status !== 'completed' && (
                  <Link
                    href="/admissions/apply"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '8px 20px',
                      borderRadius: '8px',
                      backgroundColor: '#1B4F8A',
                      color: '#FFFFFF',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      textDecoration: 'none',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    Register Now
                    <ArrowRight size={13} />
                  </Link>
                )}

                {!event.registrationRequired && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.82rem',
                      color: '#6B7280',
                    }}
                  >
                    <Calendar size={14} />
                    Open to all students
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
