'use client'

/**
 * ScrollReveal — Reusable Framer Motion wrapper for section entrance animations.
 * 
 * WHY: Centralizes scroll-triggered animation logic across all landing sections.
 *
 * HYDRATION SAFETY: useReducedMotion() is imported and called, but ONLY used
 * for the transition duration — NOT for initial/animate values. This ensures:
 *  1. initial props are identical on server and client → no hydration mismatch
 *  2. Turbopack's module graph includes use-reduced-motion.mjs → no stale chunk errors
 *  3. Users with prefers-reduced-motion get instant transitions (duration: 0)
 */

import { type FC, type ReactNode } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

interface ScrollRevealProps {
  children: ReactNode
  delay?: number
  direction?: 'up' | 'left' | 'right'
  className?: string
}

const ScrollReveal: FC<ScrollRevealProps> = ({
  children,
  delay = 0,
  direction = 'up',
  className,
}) => {
  const prefersReducedMotion = useReducedMotion()

  // WHY constant initial: These values MUST be the same on server and client.
  // useReducedMotion is NOT used here — it only controls transition duration below.
  const initial = {
    opacity: 0,
    y: direction === 'up' ? 40 : 0,
    x: direction === 'left' ? -60 : direction === 'right' ? 60 : 0,
  }

  return (
    <motion.div
      initial={initial}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once: true, margin: '-100px' }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.6,
        delay: prefersReducedMotion ? 0 : delay,
        ease: 'easeOut',
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export default ScrollReveal
