'use client'

/**
 * CTASection — Dual-panel conversion block (emmpo-inspired).
 * 
 * Left: Student admission (navy gradient with animated particles)
 * Right: Teacher recruitment (amber gradient)
 * Center: Pulsing scarcity badge
 *
 * MARKETING: Isolated bold CTA — one section, two actions, no competing info.
 */

import { motion } from 'framer-motion'
import { SectionLabel } from '@/components/ui/section-label'
import { Clock, GraduationCap, Briefcase, ArrowRight, Sparkles } from 'lucide-react'

interface CTASectionProps {
  onStudentApply: () => void
  onTeacherApply: () => void
}

export default function CTASection({ onStudentApply, onTeacherApply }: CTASectionProps) {
  return (
    <section
      id="apply"
      aria-label="Apply now"
      className="relative overflow-hidden"
    >
      {/* Scarcity Badge - Floating center */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 -translate-y-1/2">
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            boxShadow: [
              '0 0 0 0 rgba(245, 166, 35, 0.4)',
              '0 0 0 12px rgba(245, 166, 35, 0)',
              '0 0 0 0 rgba(245, 166, 35, 0)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="px-6 py-2.5 rounded-full text-sm font-bold tracking-wide"
          style={{
            background: 'linear-gradient(135deg, #F5A623, #d4900e)',
            color: '#1B4F8A',
            boxShadow: '0 4px 20px rgba(245, 166, 35, 0.4)',
          }}
        >
          <Sparkles className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          Limited Seats — 2026–27
        </motion.div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Student CTA Panel */}
        <motion.div
          initial={{ opacity: 0, x: -80 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative"
          style={{
            background: 'linear-gradient(135deg, #1B4F8A 0%, #0f2d52 100%)',
            padding: 'clamp(60px, 8vw, 100px) clamp(28px, 5vw, 60px)',
            color: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '480px',
            overflow: 'hidden',
          }}
        >
          {/* Animated background particles */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute rounded-full"
                style={{
                  width: `${20 + i * 15}px`,
                  height: `${20 + i * 15}px`,
                  background: 'rgba(245, 166, 35, 0.06)',
                  top: `${15 + i * 18}%`,
                  right: `${5 + i * 12}%`,
                }}
                animate={{
                  y: [0, -20, 0],
                  x: [0, 10, 0],
                  scale: [1, 1.2, 1],
                }}
                transition={{
                  duration: 4 + i,
                  repeat: Infinity,
                  ease: 'easeInOut',
                  delay: i * 0.8,
                }}
              />
            ))}
          </div>

          <div className="relative z-10">
            <SectionLabel number="STUDENTS" labelColor="#F5A623" />

            <motion.div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6"
              style={{
                background: 'rgba(245, 166, 35, 0.15)',
                color: '#F5A623',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Clock className="w-3.5 h-3.5" />
              Admissions Closing Soon
            </motion.div>

            <h2
              style={{
                fontFamily: 'var(--lp-font-display)',
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                fontWeight: 800,
                lineHeight: 1.12,
                marginBottom: '18px',
              }}
            >
              Shape Your{' '}
              <span className="italic" style={{ color: '#F5A623' }}>
                Future
              </span>
            </h2>

            <p style={{ fontSize: '1.05rem', opacity: 0.85, marginBottom: '16px', lineHeight: 1.7, maxWidth: '440px' }}>
              Join 650+ students building knowledge, discipline, and character at Evershine Academy.
              Play Group to College — Morning, Evening &amp; Night shifts.
            </p>

            <p className="flex items-center gap-2 mb-8" style={{ color: '#F5A623', fontStyle: 'italic', fontSize: '0.9rem' }}>
              <Clock className="w-4 h-4" />
              Don&apos;t miss the admission deadline
            </p>

            <motion.button
              onClick={onStudentApply}
              whileHover={{ y: -3, scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 cursor-pointer"
              style={{
                padding: '16px 40px',
                background: 'linear-gradient(135deg, #F5A623, #d4900e)',
                color: '#1B4F8A',
                borderRadius: '12px',
                border: 'none',
                fontSize: '1.05rem',
                fontWeight: 700,
                boxShadow: '0 6px 24px rgba(245, 166, 35, 0.4)',
                transition: 'box-shadow 0.3s',
              }}
            >
              <GraduationCap className="w-5 h-5" />
              Apply for Admission
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>

        {/* Teacher CTA Panel */}
        <motion.div
          initial={{ opacity: 0, x: 80 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: '-80px' }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="relative"
          style={{
            background: 'linear-gradient(135deg, #F5A623 0%, #d4900e 100%)',
            padding: 'clamp(60px, 8vw, 100px) clamp(28px, 5vw, 60px)',
            color: '#1B4F8A',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            minHeight: '480px',
            overflow: 'hidden',
          }}
        >
          {/* Decorative pattern */}
          <div
            className="absolute inset-0 opacity-[0.04] pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(circle at 2px 2px, #1B4F8A 1px, transparent 0)',
              backgroundSize: '32px 32px',
            }}
          />

          <div className="relative z-10">
            <SectionLabel number="TEACHERS" labelColor="#1B4F8A" />

            <h2
              style={{
                fontFamily: 'var(--lp-font-display)',
                fontSize: 'clamp(2rem, 4vw, 3.2rem)',
                fontWeight: 800,
                lineHeight: 1.12,
                marginBottom: '18px',
              }}
            >
              Join Our{' '}
              <span className="italic" style={{ color: '#0f2d52' }}>
                Faculty
              </span>
            </h2>

            <p style={{ fontSize: '1.05rem', marginBottom: '16px', lineHeight: 1.7, maxWidth: '440px', opacity: 0.85 }}>
              We&apos;re looking for qualified, passionate educators who believe in shaping the next generation
              of leaders in Gujranwala.
            </p>

            <div
              className="flex items-center gap-3 mb-8 px-4 py-2.5 rounded-lg w-fit"
              style={{
                background: 'rgba(27, 79, 138, 0.1)',
                fontSize: '0.88rem',
                fontWeight: 600,
              }}
            >
              <Briefcase className="w-4 h-4" />
              Requirements: B.Ed / M.Ed / MPhil minimum
            </div>

            <motion.button
              onClick={onTeacherApply}
              whileHover={{ y: -3, scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="inline-flex items-center gap-2 cursor-pointer"
              style={{
                padding: '16px 40px',
                background: 'linear-gradient(135deg, #1B4F8A, #0f2d52)',
                color: '#FFFFFF',
                borderRadius: '12px',
                border: 'none',
                fontSize: '1.05rem',
                fontWeight: 700,
                boxShadow: '0 6px 24px rgba(27, 79, 138, 0.3)',
                transition: 'box-shadow 0.3s',
              }}
            >
              <Briefcase className="w-5 h-5" />
              Apply as Teacher
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
