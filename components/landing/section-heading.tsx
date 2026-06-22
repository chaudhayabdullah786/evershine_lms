'use client'

/**
 * SectionHeading — Reusable heading with animated amber underline.
 * 
 * Features:
 * - Playfair Display serif heading
 * - Animated gradient underline (shimmer effect)
 * - Optional subtitle with smooth reveal
 * - Dark/light variant for different section backgrounds
 */

import { motion } from 'framer-motion'

interface SectionHeadingProps {
  title: string
  subtitle?: string
  light?: boolean  // true = white text for dark backgrounds
}

export default function SectionHeading({ title, subtitle, light = false }: SectionHeadingProps) {
  return (
    <div style={{ textAlign: 'center', marginBottom: '48px' }}>
      <motion.h2
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-40px' }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          fontFamily: 'var(--font-display, Georgia, serif)',
          fontSize: 'clamp(1.75rem, 4vw, 2.75rem)',
          fontWeight: 800,
          color: light ? '#FFFFFF' : '#1B4F8A',
          lineHeight: 1.2,
          marginBottom: '16px',
          letterSpacing: '-0.01em',
        }}
      >
        {title}
      </motion.h2>

      {/* Animated underline */}
      <motion.div
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
        style={{
          width: '80px',
          height: '4px',
          margin: '0 auto 20px',
          borderRadius: '2px',
          background: 'linear-gradient(90deg, #1B4F8A, #F5A623, #1B4F8A)',
          backgroundSize: '200% auto',
          transformOrigin: 'center',
        }}
        className="lp-shimmer-text"
      />

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          style={{
            fontSize: 'clamp(0.9rem, 2vw, 1.05rem)',
            color: light ? 'rgba(255,255,255,0.75)' : '#6B7280',
            maxWidth: '620px',
            marginLeft: 'auto',
            marginRight: 'auto',
            lineHeight: 1.7,
          }}
        >
          {subtitle}
        </motion.p>
      )}
    </div>
  )
}
