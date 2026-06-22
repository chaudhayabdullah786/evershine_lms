'use client'

/**
 * StatsBar — Animated count-up statistics with gradient background.
 * 
 * Enhanced:
 * - Animated gradient background (gradientShift)
 * - Framer Motion staggered entrance per stat
 * - Animated counter with easing
 * - Decorative line between stats on desktop
 */

import { motion } from 'framer-motion'
import { useCounterAnimation } from '@/hooks/use-counter-animation'
import { Users, Award, GraduationCap, Trophy } from 'lucide-react'
import type { Stat } from '@/types/landing'

const ICON_MAP: Record<string, React.ElementType> = {
  Users,
  Award,
  GraduationCap,
  Trophy,
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
}

function StatItem({ stat, index }: { stat: Stat; index: number }) {
  const { count, ref } = useCounterAnimation(stat.value, 2000)
  const IconComponent = ICON_MAP[stat.icon] || Award

  return (
    <motion.div
      ref={ref}
      variants={itemVariants}
      style={{
        textAlign: 'center',
        padding: '32px 16px',
        position: 'relative',
      }}
    >
      {/* Floating icon */}
      <motion.div
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.3 }}
      >
        <IconComponent
          size={38}
          style={{ color: '#F5A623', marginBottom: '14px' }}
        />
      </motion.div>

      <div
        style={{
          fontSize: 'clamp(2.25rem, 5vw, 3rem)',
          fontWeight: 800,
          color: '#FFFFFF',
          lineHeight: 1,
          fontFamily: 'var(--font-display, Georgia, serif)',
        }}
      >
        {count}{stat.suffix}
      </div>

      <div
        style={{
          fontSize: '0.85rem',
          fontWeight: 500,
          color: 'rgba(255,255,255,0.65)',
          marginTop: '8px',
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
        }}
      >
        {stat.label}
      </div>
    </motion.div>
  )
}

export default function StatsBar({ stats }: { stats: Stat[] }) {
  return (
    <section
      style={{
        padding: '16px 0',
        background: 'linear-gradient(-45deg, #1B4F8A, #153d6b, #1a3a5c, #1B4F8A)',
        backgroundSize: '400% 400%',
        animation: 'gradientShift 8s ease infinite',
      }}
    >
      <motion.div
        className="lp-container grid grid-cols-2 md:grid-cols-4 gap-2"
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
      >
        {stats.map((stat, i) => (
          <StatItem key={stat.label} stat={stat} index={i} />
        ))}
      </motion.div>
    </section>
  )
}
