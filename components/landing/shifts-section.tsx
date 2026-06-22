'use client'

/**
 * components/landing/shifts-section.tsx — S-13
 *
 * Three shift cards with accent color branding, hover lift,
 * Framer Motion staggered entrance, and icon animations.
 */

import { motion } from 'framer-motion'
import { SITE_CONFIG } from '@/content/site-config'
import { SectionLabel } from '@/components/ui/section-label'
import { Sun, Sunset, Moon } from 'lucide-react'
import type { ShiftItem } from '@/types/landing'

const ICON_MAP: Record<string, React.ElementType> = { Sun, Sunset, Moon }

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

export function ShiftsSection() {
  const shifts = SITE_CONFIG.shifts ?? []
  if (shifts.length === 0) return null

  return (
    <section
      id="shifts"
      aria-label="Available shifts"
      className="py-24 px-4"
      style={{ backgroundColor: '#F9F7F4' }}
    >
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <SectionLabel number="SHIFTS" />

          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: '#1A1A2E', fontFamily: 'var(--lp-font-display)' }}
          >
            Learn on{' '}
            <span className="italic" style={{ color: '#F5A623' }}>
              Your Schedule
            </span>
          </h2>
          <p
            className="text-lg mb-14 max-w-2xl"
            style={{ color: '#6B7280', fontFamily: 'var(--lp-font-body)' }}
          >
            Three shifts designed around your life — whether you are a full-time student,
            a college-goer, or a working professional.
          </p>
        </motion.div>

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {shifts.map((shift: ShiftItem, index: number) => {
            const IconComponent = ICON_MAP[shift.iconName] ?? Sun
            return (
              <motion.div
                key={shift.name}
                variants={cardVariants}
                whileHover={{
                  y: -10,
                  scale: 1.02,
                  transition: { duration: 0.25 },
                }}
                className="group relative rounded-2xl p-8 cursor-default overflow-hidden"
                style={{
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 2px 16px rgba(27, 79, 138, 0.06)',
                  borderTop: `4px solid ${shift.accentColor}`,
                  transition: 'box-shadow 0.4s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 16px 48px rgba(27, 79, 138, 0.14)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 16px rgba(27, 79, 138, 0.06)'
                }}
              >
                {/* Accent glow on hover */}
                <div
                  className="absolute top-0 left-0 right-0 h-32 opacity-0 group-hover:opacity-10 transition-opacity duration-500"
                  style={{
                    background: `linear-gradient(180deg, ${shift.accentColor}, transparent)`,
                  }}
                />

                <div className="relative z-10">
                  {/* Floating icon pill */}
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: index * 0.6 }}
                    className="w-14 h-14 rounded-xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110"
                    style={{
                      background: `${shift.accentColor}15`,
                      color: shift.accentColor,
                    }}
                  >
                    <IconComponent className="w-7 h-7" />
                  </motion.div>

                  <h3
                    className="text-xl font-bold mb-1"
                    style={{ color: '#1A1A2E', fontFamily: 'var(--lp-font-display)' }}
                  >
                    {shift.name}
                  </h3>

                  <p className="text-sm font-semibold mb-4" style={{ color: shift.accentColor }}>
                    {shift.time}
                  </p>

                  <p className="text-sm leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                    {shift.description}
                  </p>

                  <span
                    className="inline-block px-3 py-1 text-xs font-medium rounded-full transition-all duration-300 group-hover:scale-105"
                    style={{
                      background: `${shift.accentColor}15`,
                      color: shift.accentColor,
                    }}
                  >
                    {shift.forWhom}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
