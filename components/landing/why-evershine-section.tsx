'use client'

/**
 * WhyEvershineSection — Bento asymmetric grid (emmpo-inspired).
 * 
 * 6 feature cards in a 2:1 bento layout on desktop.
 * Staggered entrance, floating icons, gradient borders on hover,
 * numbered badge overlay, and bottom accent line reveal.
 *
 * Data-driven from SITE_CONFIG.features (6 items).
 * Falls back to whyEvershineFeatures (3 items) if features not available.
 */

import { motion } from 'framer-motion'
import { SectionLabel } from '@/components/ui/section-label'
import SectionHeading from '@/components/landing/section-heading'
import {
  BookOpen, GraduationCap, Shield, Users, Lightbulb,
  BarChart2, Heart, Smartphone
} from 'lucide-react'
import type { FeatureCard } from '@/types/landing'

const ICON_MAP: Record<string, React.ElementType> = {
  BookOpen, GraduationCap, Shield, Users, Lightbulb,
  BarChart2, Heart, Smartphone,
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
}

const cardVariants = {
  hidden: { opacity: 0, y: 50, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
}

function FeatureCardComponent({ feature, index }: { feature: FeatureCard; index: number }) {
  const IconComponent = ICON_MAP[feature.icon] || BookOpen
  // Bento: first card takes 2 cols on desktop
  const isLarge = index === 0

  return (
    <motion.div
      variants={cardVariants}
      whileHover={{
        y: -8,
        scale: 1.02,
        transition: { duration: 0.25, ease: 'easeOut' },
      }}
      className={`group relative overflow-hidden rounded-2xl cursor-default ${
        isLarge ? 'md:col-span-2' : ''
      }`}
      style={{
        backgroundColor: '#FFFFFF',
        padding: isLarge ? '48px 40px' : '40px 28px',
        boxShadow: '0 2px 16px rgba(27, 79, 138, 0.06)',
        transition: 'box-shadow 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        height: '100%',
        borderBottom: '3px solid transparent',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 16px 48px rgba(27, 79, 138, 0.14)'
        e.currentTarget.style.borderBottom = '3px solid #F5A623'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 2px 16px rgba(27, 79, 138, 0.06)'
        e.currentTarget.style.borderBottom = '3px solid transparent'
      }}
    >
      {/* Background number watermark */}
      <span
        className="absolute top-3 right-4 select-none pointer-events-none"
        style={{
          fontSize: isLarge ? '6rem' : '4.5rem',
          fontWeight: 900,
          color: 'rgba(27, 79, 138, 0.03)',
          lineHeight: 1,
          fontFamily: 'var(--lp-font-display)',
        }}
      >
        0{index + 1}
      </span>

      {/* Hover gradient overlay */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, rgba(245, 166, 35, 0.03) 0%, rgba(27, 79, 138, 0.03) 100%)',
        }}
      />

      {/* Floating icon pill */}
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: index * 0.5 }}
        className="relative z-10 mb-6"
      >
        <div
          className="w-16 h-16 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
          style={{
            background: 'linear-gradient(135deg, rgba(245, 166, 35, 0.12) 0%, rgba(27, 79, 138, 0.08) 100%)',
          }}
        >
          <IconComponent size={30} style={{ color: '#F5A623' }} />
        </div>
      </motion.div>

      <h3
        className="relative z-10"
        style={{
          fontFamily: 'var(--lp-font-display)',
          fontSize: isLarge ? '1.5rem' : '1.25rem',
          fontWeight: 700,
          color: '#1B4F8A',
          marginBottom: '14px',
          lineHeight: 1.3,
        }}
      >
        {feature.title}
      </h3>

      <p
        className="relative z-10"
        style={{
          fontSize: '0.95rem',
          color: '#6B7280',
          lineHeight: 1.75,
          maxWidth: isLarge ? '500px' : 'none',
        }}
      >
        {feature.description}
      </p>

      {/* Arrow indicator on hover */}
      <div
        className="relative z-10 mt-5 opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-1"
        style={{ color: '#F5A623', fontSize: '0.85rem', fontWeight: 600 }}
      >
        Learn more →
      </div>
    </motion.div>
  )
}

export default function WhyEvershineSection({ features }: { features: FeatureCard[] }) {
  // Use extended features (6) if available, fall back to original (3)
  const { features: extendedFeatures } = require('@/content/site-config').SITE_CONFIG
  const displayFeatures = extendedFeatures?.length > features.length
    ? extendedFeatures
    : features

  return (
    <section
      id="about"
      aria-label="Why Choose Evershine Academy"
      style={{
        padding: '100px 0',
        backgroundColor: '#F9F7F4',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative circles */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '20%',
          left: '-100px',
          width: '350px',
          height: '350px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(27, 79, 138, 0.04) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '10%',
          right: '-60px',
          width: '250px',
          height: '250px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245, 166, 35, 0.04) 0%, transparent 70%)',
        }}
      />

      <div className="lp-container">
        <div className="text-center">
          <SectionLabel number="WHY US" labelColor="#F5A623" />
        </div>

        <SectionHeading
          title="Why Choose Evershine Academy?"
          subtitle="A learning environment that transforms students into confident, disciplined future leaders."
        />

        <motion.div
          className="grid grid-cols-1 md:grid-cols-3 gap-6"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {displayFeatures.map((feature: FeatureCard, i: number) => (
            <FeatureCardComponent key={feature.title} feature={feature} index={i} />
          ))}
        </motion.div>
      </div>
    </section>
  )
}
