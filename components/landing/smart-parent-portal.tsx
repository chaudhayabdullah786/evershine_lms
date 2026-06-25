'use client'

/**
 * components/landing/smart-parent-portal.tsx — S-11
 *
 * LMS feature showcase with Framer Motion staggered grid,
 * hover lift animations, and gradient CTA button.
 */

import { motion } from 'framer-motion'
import { SITE_CONFIG } from '@/content/site-config'
import { SectionLabel } from '@/components/ui/section-label'
import {
  Smartphone, BarChart2, Bell, Calendar, ClipboardCheck, Users, ArrowRight,
} from 'lucide-react'
import Link from 'next/link'

const PORTAL_FEATURES = [
  { icon: ClipboardCheck, title: 'Real-Time Attendance', description: 'Know exactly when your child arrives and leaves. Daily attendance notifications straight to your phone.' },
  { icon: BarChart2,      title: 'Grades & Results',     description: 'View test scores, term results, and academic progress — instantly, without visiting the campus.' },
  { icon: Bell,           title: 'Instant Announcements', description: 'Fee reminders, event updates, holiday schedules — never miss an important academy update again.' },
  { icon: Calendar,       title: 'Assignment Tracking',   description: 'Monitor homework submissions, upcoming deadlines, and teacher feedback all in one place.' },
  { icon: Users,          title: 'Teacher Communication', description: 'Direct messaging with your child\'s teachers. Discuss progress without scheduling office visits.' },
  { icon: Smartphone,     title: 'Mobile Accessible',     description: 'Access everything from any smartphone, tablet, or computer — anytime, anywhere in Pakistan.' },
]

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

export function SmartParentPortal() {
  return (
    <section
      id="parent-portal"
      aria-label="Smart Parent Portal"
      className="py-24 px-4"
      style={{ backgroundColor: '#F3F4F6' }}
    >
      <div className="max-w-6xl mx-auto">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <SectionLabel number="TECHNOLOGY" labelColor="#1B4F8A" />

          <h2
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: '#1A1A2E', fontFamily: 'var(--lp-font-display)' }}
          >
            Smart{' '}
            <span className="italic" style={{ color: '#F5A623' }}>
              Parent Portal
            </span>
          </h2>
          <p
            className="text-lg max-w-2xl mx-auto"
            style={{ color: '#6B7280', fontFamily: 'var(--lp-font-body)' }}
          >
            Stay informed about your child&apos;s education journey — from attendance
            to assignments — all from your smartphone.
          </p>
        </motion.div>

        {/* Vision 2030 Portal Showcase Image */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mb-14"
          style={{ textAlign: 'center' }}
        >
          <div
            style={{
              maxWidth: '800px',
              margin: '0 auto',
              borderRadius: '20px',
              overflow: 'hidden',
              boxShadow: '0 16px 64px rgba(27, 79, 138, 0.15)',
              border: '1px solid rgba(27, 79, 138, 0.08)',
              lineHeight: 0,
            }}
          >
            <img
              src="/assets/images/portal/vision-2030-portal.jpeg"
              alt="Vision 2030 — ESA Online Portal — A Smart Digital Solution for Students, Parents, Teachers and Staff"
              loading="lazy"
              style={{
                width: '100%',
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
          <p
            className="mt-4 text-sm"
            style={{ color: '#6B7280', fontStyle: 'italic' }}
          >
            Vision 2030 — One Portal. One Platform. Endless Possibilities.
          </p>
        </motion.div>

        {/* Feature Grid */}
        <motion.div
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-60px' }}
        >
          {PORTAL_FEATURES.map((feature, index) => {
            const IconComponent = feature.icon
            return (
              <motion.div
                key={feature.title}
                variants={cardVariants}
                whileHover={{
                  y: -8,
                  scale: 1.02,
                  transition: { duration: 0.25 },
                }}
                className="group rounded-2xl p-7 cursor-default"
                style={{
                  backgroundColor: '#FFFFFF',
                  boxShadow: '0 2px 16px rgba(27, 79, 138, 0.06)',
                  transition: 'box-shadow 0.4s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 16px 48px rgba(27, 79, 138, 0.12)'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 16px rgba(27, 79, 138, 0.06)'
                }}
              >
                <motion.div
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay: index * 0.4 }}
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110"
                  style={{
                    background: 'rgba(27, 79, 138, 0.08)',
                    color: '#1B4F8A',
                  }}
                >
                  <IconComponent className="w-6 h-6" />
                </motion.div>

                <h3
                  className="text-lg font-bold mb-2"
                  style={{ color: '#1A1A2E', fontFamily: 'var(--lp-font-body)' }}
                >
                  {feature.title}
                </h3>

                <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                  {feature.description}
                </p>
              </motion.div>
            )
          })}
        </motion.div>

        {/* CTA */}
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Link
            href={SITE_CONFIG.loginUrl}
            className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl text-white font-semibold transition-all duration-300 hover:-translate-y-1 hover:shadow-xl cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #1B4F8A, #0f2d52)',
              boxShadow: '0 4px 20px rgba(27, 79, 138, 0.3)',
            }}
          >
            <Smartphone className="w-5 h-5" />
            Access Parent Portal
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-3 text-xs" style={{ color: '#6B7280' }}>
            Available to all enrolled parents · Login credentials provided at admission
          </p>
        </motion.div>
      </div>
    </section>
  )
}
