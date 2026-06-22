'use client'

/**
 * ProgramsSection — Tabbed program levels + shift cards.
 * 
 * Enhanced with:
 * - Framer Motion AnimatePresence for tab content transitions
 * - Animated tab indicator
 * - Hover-scaling shift cards with icon animation
 * - Gradient accent on active tab
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sun, Sunset, Moon, CheckCircle2 } from 'lucide-react'
import ScrollReveal from '@/components/landing/scroll-reveal'
import SectionHeading from '@/components/landing/section-heading'
import type { ProgramLevel } from '@/types/landing'

const SHIFTS = [
  { label: 'Morning Shift', time: '7:00 AM – 1:00 PM', desc: 'Regular Students', icon: Sun, color: '#F59E0B', gradient: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)' },
  { label: 'Evening Shift', time: '2:00 PM – 7:00 PM', desc: 'College-Going Students', icon: Sunset, color: '#F97316', gradient: 'linear-gradient(135deg, #FFEDD5 0%, #FED7AA 100%)' },
  { label: 'Night Shift', time: '7:00 PM – 10:00 PM', desc: 'Working Professionals', icon: Moon, color: '#6366F1', gradient: 'linear-gradient(135deg, #E0E7FF 0%, #C7D2FE 100%)' },
]

export default function ProgramsSection({ programs }: { programs: ProgramLevel[] }) {
  const [activeTab, setActiveTab] = useState(0)
  const active = programs[activeTab]

  return (
    <section
      id="programs"
      style={{
        padding: '100px 0',
        backgroundColor: '#FFFFFF',
        position: 'relative',
      }}
    >
      <div className="lp-container">
        <SectionHeading
          title="Programs We Offer"
          subtitle="From Play Group to College — a complete learning journey for every stage of your child's growth."
        />

        <ScrollReveal>
          {/* Tabs */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '8px',
              justifyContent: 'center',
              marginBottom: '36px',
            }}
          >
            {programs.map((prog, i) => (
              <motion.button
                key={prog.id}
                onClick={() => setActiveTab(i)}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: '12px 28px',
                  borderRadius: '10px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  transition: 'background-color 0.2s, color 0.2s',
                  backgroundColor: i === activeTab ? '#1B4F8A' : '#F1F5F9',
                  color: i === activeTab ? '#FFFFFF' : '#1A1A2E',
                  boxShadow: i === activeTab ? '0 4px 16px rgba(27,79,138,0.25)' : 'none',
                }}
              >
                {prog.label}
              </motion.button>
            ))}
          </div>

          {/* Tab Content with AnimatePresence */}
          <AnimatePresence mode="wait">
            {active && (
              <motion.div
                key={active.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.35, ease: 'easeInOut' }}
                style={{
                  backgroundColor: '#F9F7F4',
                  borderRadius: '16px',
                  padding: '44px 36px',
                  maxWidth: '720px',
                  margin: '0 auto 52px',
                  boxShadow: '0 2px 12px rgba(27, 79, 138, 0.08)',
                  borderLeft: '4px solid #F5A623',
                }}
              >
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
                  <span
                    style={{
                      padding: '6px 16px',
                      borderRadius: '20px',
                      backgroundColor: 'rgba(27,79,138,0.08)',
                      color: '#1B4F8A',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    Ages: {active.ageRange}
                  </span>
                  <span
                    style={{
                      padding: '6px 16px',
                      borderRadius: '20px',
                      backgroundColor: 'rgba(245,166,35,0.1)',
                      color: '#d4900e',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    {active.classes}
                  </span>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '14px' }}>
                  {active.features.map((feat, i) => (
                    <motion.li
                      key={feat}
                      initial={{ opacity: 0, x: -15 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: i * 0.08 }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        fontSize: '0.95rem',
                        color: '#1A1A2E',
                      }}
                    >
                      <CheckCircle2 size={18} style={{ color: '#16A34A', flexShrink: 0 }} />
                      {feat}
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </ScrollReveal>

        {/* Shift Cards */}
        <ScrollReveal delay={0.2}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-[950px] mx-auto">
            {SHIFTS.map((shift, i) => (
              <motion.div
                key={shift.label}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                whileHover={{ y: -4, scale: 1.02 }}
                style={{
                  textAlign: 'center',
                  padding: '32px 24px',
                  borderRadius: '16px',
                  backgroundColor: '#F9F7F4',
                  boxShadow: '0 2px 12px rgba(27, 79, 138, 0.08)',
                  transition: 'box-shadow 0.3s',
                  cursor: 'default',
                }}
              >
                <motion.div
                  animate={{ rotate: [0, 5, -5, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.5 }}
                  style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '14px',
                    background: shift.gradient,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}
                >
                  <shift.icon size={26} style={{ color: shift.color }} />
                </motion.div>

                <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1B4F8A', marginBottom: '6px' }}>
                  {shift.label}
                </h4>
                <p style={{ fontSize: '0.88rem', color: '#6B7280', marginBottom: '6px' }}>{shift.desc}</p>
                <p style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1B4F8A' }}>{shift.time}</p>
              </motion.div>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  )
}
