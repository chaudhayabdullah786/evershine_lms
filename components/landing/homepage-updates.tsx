'use client'

/**
 * components/landing/homepage-updates.tsx
 *
 * Dynamic "What's New at ESA" section displaying up to 6
 * priority-sorted update cards. Each card shows:
 * - Category badge (color-coded by priority)
 * - Icon + title + description
 * - CTA button
 *
 * Display rules:
 * 1. High priority first, then medium, then low
 * 2. Only items with showOnHomepage = true
 * 3. Expired items auto-hidden
 * 4. Max 6 items
 *
 * Data from SITE_CONFIG.homepageUpdates[].
 */

import { motion } from 'framer-motion'
import { SectionLabel } from '@/components/ui/section-label'
import { SITE_CONFIG } from '@/content/site-config'
import Link from 'next/link'
import {
  GraduationCap, BookOpen, Code, Sparkles, Smartphone,
  ArrowRight, Bell,
} from 'lucide-react'
import type { HomepageUpdate } from '@/types/landing'

const ICON_MAP: Record<string, React.ElementType> = {
  GraduationCap, BookOpen, Code, Sparkles, Smartphone, Bell,
}

const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

const BADGE_COLORS: Record<string, { bg: string; text: string }> = {
  OPEN:           { bg: '#16A34A', text: '#FFFFFF' },
  NEW:            { bg: '#1B4F8A', text: '#FFFFFF' },
  HOT:            { bg: '#EF4444', text: '#FFFFFF' },
  'STARTING SOON': { bg: '#F59E0B', text: '#0D1B2A' },
  LIVE:           { bg: '#7C3AED', text: '#FFFFFF' },
}

const PRIORITY_ACCENT: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#6B7280',
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 40, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

function getVisibleUpdates(updates: HomepageUpdate[]): HomepageUpdate[] {
  const now = new Date()
  return updates
    .filter((u) => {
      if (!u.showOnHomepage) return false
      if (u.expiresAt && new Date(u.expiresAt) < now) return false
      return true
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    .slice(0, 6)
}

export function HomepageUpdates() {
  const updates = SITE_CONFIG.homepageUpdates ?? []
  const visible = getVisibleUpdates(updates)

  if (visible.length === 0) return null

  return (
    <section
      id="updates"
      aria-label="Latest Updates"
      style={{ backgroundColor: '#FFFFFF', position: 'relative' }}
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
          <SectionLabel number="UPDATES" labelColor="#F5A623" />
          <h2
            style={{
              fontFamily: 'var(--lp-font-display)',
              fontSize: 'clamp(2rem, 4vw, 3rem)',
              fontWeight: 800,
              color: '#1A1A2E',
              marginBottom: '12px',
            }}
          >
            What&apos;s{' '}
            <span style={{ color: '#F5A623', fontStyle: 'italic' }}>
              New
            </span>{' '}
            at ESA
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
            Stay informed about the latest courses, events, and announcements
            from Evershine Academy.
          </p>
        </motion.div>

        {/* Updates Grid */}
        <motion.div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            gap: '20px',
          }}
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {visible.map((update, index) => {
            const IconComponent = ICON_MAP[update.icon] || Bell
            const badgeColor = BADGE_COLORS[update.badge ?? ''] ?? BADGE_COLORS.NEW
            const priorityColor = PRIORITY_ACCENT[update.priority]

            return (
              <motion.div
                key={update.title}
                variants={cardVariants}
                whileHover={{
                  y: -6,
                  scale: 1.01,
                  transition: { duration: 0.25 },
                }}
                style={{
                  backgroundColor: '#F9F7F4',
                  borderRadius: '16px',
                  padding: '28px 24px',
                  borderLeft: `4px solid ${priorityColor}`,
                  boxShadow: '0 2px 12px rgba(27, 79, 138, 0.06)',
                  transition: 'box-shadow 0.4s',
                  display: 'flex',
                  flexDirection: 'column',
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 12px 40px rgba(27, 79, 138, 0.12)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 12px rgba(27, 79, 138, 0.06)'
                }}
              >
                {/* Top row: icon + badge */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '16px',
                  }}
                >
                  <motion.div
                    animate={{ y: [0, -3, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 }}
                    style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '12px',
                      backgroundColor: `${priorityColor}12`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <IconComponent size={22} style={{ color: priorityColor }} />
                  </motion.div>

                  {update.badge && (
                    <span
                      style={{
                        padding: '3px 10px',
                        borderRadius: '6px',
                        backgroundColor: badgeColor.bg,
                        color: badgeColor.text,
                        fontSize: '0.65rem',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                      }}
                    >
                      {update.badge}
                    </span>
                  )}
                </div>

                {/* Category */}
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: '#6B7280',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    marginBottom: '6px',
                  }}
                >
                  {update.category}
                </span>

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
                  {update.title}
                </h3>

                {/* Description */}
                <p
                  style={{
                    fontSize: '0.88rem',
                    color: '#6B7280',
                    lineHeight: 1.6,
                    marginBottom: '20px',
                    flexGrow: 1,
                  }}
                >
                  {update.description}
                </p>

                {/* CTA */}
                <Link
                  href={update.buttonLink}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#1B4F8A',
                    textDecoration: 'none',
                    transition: 'gap 0.2s',
                  }}
                >
                  {update.buttonText}
                  <ArrowRight size={14} />
                </Link>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
