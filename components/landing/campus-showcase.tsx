'use client'

/**
 * CampusShowcase — Premium parallax split panels (emmpo-inspired).
 * 
 * Desktop: side-by-side with parallax bg, glass-morphic overlay cards.
 * Mobile: stacked vertically, parallax disabled (iOS safe).
 * Each panel: icon, title, motto, features, and Apply CTA.
 *
 * Enhancements:
 * - Framer Motion staggered feature list entrance
 * - Glass-morphic card overlay with backdrop blur
 * - Button glow animation on hover
 * - Slide-in from left/right
 */

import { motion } from 'framer-motion'
import { CheckCircle, GraduationCap, BookHeart, ArrowRight } from 'lucide-react'
import { SectionLabel } from '@/components/ui/section-label'
import SectionHeading from '@/components/landing/section-heading'

const CAMPUSES = [
  {
    title: 'Boys Campus',
    motto: 'Discipline. Focus. Excellence.',
    icon: GraduationCap,
    features: ['Dedicated Male Faculty', 'Sports & Athletics Program', 'Board Exam Coaching', 'Character Development'],
    bg: '/assets/images/banner/banner-5.png',
    gradient: 'linear-gradient(135deg, rgba(15, 45, 82, 0.92), rgba(27, 79, 138, 0.85))',
  },
  {
    title: 'Girls Campus',
    motto: 'Respect. Empowerment. Excellence.',
    icon: BookHeart,
    features: ['All-Female Teaching Staff', 'Safe & Nurturing Environment', 'Holistic Development', 'Confidence Building'],
    bg: '/assets/images/banner/banner-4.png',
    gradient: 'linear-gradient(135deg, rgba(27, 79, 138, 0.88), rgba(15, 45, 82, 0.92))',
  },
]

const featureVariants = {
  hidden: { opacity: 0, x: -20 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, delay: 0.3 + i * 0.1, ease: 'easeOut' },
  }),
}

interface CampusShowcaseProps {
  onApplyClick: () => void
}

export default function CampusShowcase({ onApplyClick }: CampusShowcaseProps) {
  return (
    <section id="campuses" aria-label="Our Campuses" style={{ backgroundColor: '#1B4F8A' }}>
      <div className="lp-container" style={{ padding: '80px 0 0', textAlign: 'center' }}>
        <SectionLabel number="CAMPUSES" labelColor="#F5A623" />
        <SectionHeading
          title="Our Campuses"
          subtitle="Dedicated learning environments designed for focus, safety, and academic excellence."
          light
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2">
        {CAMPUSES.map((campus, i) => (
          <motion.div
            key={campus.title}
            initial={{ opacity: 0, x: i === 0 ? -80 : 80 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{
              duration: 0.7,
              delay: i * 0.2,
              ease: [0.25, 0.46, 0.45, 0.94],
            }}
            className="lp-campus-parallax relative overflow-hidden"
            style={{
              backgroundImage: `url(${campus.bg})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              minHeight: '550px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Gradient overlay */}
            <div
              className="absolute inset-0"
              style={{ background: campus.gradient }}
            />

            {/* Glass card content */}
            <div
              className="relative z-10 m-6 md:m-10 p-8 md:p-12 rounded-2xl text-center max-w-md"
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
              }}
            >
              {/* Icon */}
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                className="mb-6"
              >
                <campus.icon size={52} style={{ color: '#F5A623' }} />
              </motion.div>

              <h3
                style={{
                  fontFamily: 'var(--lp-font-display)',
                  fontSize: 'clamp(1.75rem, 3vw, 2.5rem)',
                  fontWeight: 700,
                  marginBottom: '8px',
                  color: '#FFFFFF',
                }}
              >
                {campus.title}
              </h3>

              <p
                style={{
                  fontSize: '1rem',
                  fontWeight: 500,
                  color: '#F5A623',
                  marginBottom: '28px',
                  fontStyle: 'italic',
                  fontFamily: 'var(--lp-font-display)',
                }}
              >
                {campus.motto}
              </p>

              {/* Features with staggered animation */}
              <ul className="text-left inline-block mb-8" style={{ listStyle: 'none', padding: 0 }}>
                {campus.features.map((feat, fi) => (
                  <motion.li
                    key={feat}
                    custom={fi}
                    variants={featureVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    className="flex items-center gap-3 mb-3 text-white/90"
                    style={{ fontSize: '0.95rem' }}
                  >
                    <CheckCircle size={18} style={{ color: '#F5A623', flexShrink: 0 }} />
                    {feat}
                  </motion.li>
                ))}
              </ul>

              {/* CTA Button */}
              <motion.button
                onClick={onApplyClick}
                whileHover={{ y: -3, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="inline-flex items-center gap-2 cursor-pointer"
                style={{
                  padding: '14px 36px',
                  background: 'linear-gradient(135deg, #F5A623, #d4900e)',
                  color: '#1B4F8A',
                  borderRadius: '12px',
                  border: 'none',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  boxShadow: '0 6px 24px rgba(245, 166, 35, 0.35)',
                  transition: 'box-shadow 0.3s',
                }}
              >
                Apply — {campus.title}
                <ArrowRight className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
