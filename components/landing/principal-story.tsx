'use client'

/**
 * components/landing/principal-story.tsx — S-10
 *
 * emmpo.com founder pattern with Framer Motion animations:
 * - Photo reveal with scale
 * - Quote typewriter-style fade
 * - Values pills staggered entrance
 * - Parallax dot pattern
 */

import { motion } from 'framer-motion'
import { SITE_CONFIG } from '@/content/site-config'
import { SectionLabel } from '@/components/ui/section-label'
import { Quote } from 'lucide-react'

const VALUES = ['Discipline', 'Excellence', 'Faith', 'Growth', 'Character', 'Innovation']

const pillVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: (i: number) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3, delay: 0.6 + i * 0.08, ease: 'easeOut' },
  }),
}

export function PrincipalStory() {
  return (
    <section
      id="principal"
      aria-label="Meet our principal"
      className="relative py-24 px-4 overflow-hidden"
      style={{ backgroundColor: '#1B4F8A' }}
    >
      {/* Subtle background pattern */}
      <div
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.3) 1px, transparent 0)',
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center lg:text-left">
          <SectionLabel number="OUR STORY" labelColor="#F5A623" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-12 lg:gap-16 items-center">
          {/* Photo Column (2/5) */}
          <motion.div
            className="lg:col-span-2 flex justify-center lg:justify-start"
            initial={{ opacity: 0, scale: 0.85, x: -40 }}
            whileInView={{ opacity: 1, scale: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <div className="relative">
              {/* Decorative frame */}
              <motion.div
                className="absolute -inset-3 rounded-2xl opacity-20"
                style={{
                  border: '2px solid #F5A623',
                  transform: 'rotate(3deg)',
                }}
                animate={{ rotate: [3, 5, 3] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />

              <div
                className="w-64 h-80 md:w-72 md:h-96 rounded-2xl overflow-hidden relative"
                style={{
                  boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                }}
              >
                <div
                  className="w-full h-full flex flex-col items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #1a3f6f, #2563eb)' }}
                >
                  <motion.div
                    className="w-24 h-24 rounded-full flex items-center justify-center mb-4"
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: '2px solid rgba(255, 255, 255, 0.2)',
                    }}
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <span
                      className="text-4xl font-bold"
                      style={{ color: '#F5A623', fontFamily: 'var(--lp-font-display)' }}
                    >
                      EA
                    </span>
                  </motion.div>
                  <p className="text-white/80 text-sm font-medium">Director</p>
                  <p
                    className="text-lg font-bold mt-1"
                    style={{ color: '#F5A623', fontFamily: 'var(--lp-font-display)' }}
                  >
                    {SITE_CONFIG.academyName}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Content Column (3/5) */}
          <div className="lg:col-span-3 text-center lg:text-left">
            {/* Pull Quote */}
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <Quote
                className="w-10 h-10 mb-4 mx-auto lg:mx-0 opacity-60"
                style={{ color: '#F5A623' }}
              />
              <blockquote
                className="text-xl md:text-2xl lg:text-3xl italic leading-relaxed"
                style={{
                  color: 'rgba(255, 255, 255, 0.95)',
                  fontFamily: 'var(--lp-font-display)',
                }}
              >
                &ldquo;Education is not just about grades — it is about building
                the character, confidence, and conviction that transforms a child
                into a leader. That is the Evershine promise.&rdquo;
              </blockquote>
            </motion.div>

            {/* Story paragraph */}
            <motion.p
              className="text-base md:text-lg leading-relaxed mb-8"
              style={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontFamily: 'var(--lp-font-body)',
              }}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.35 }}
            >
              For over 15 years, {SITE_CONFIG.academyName} has been nurturing young minds
              in Gujranwala — from Play Group to College. Our mission goes beyond academics:
              we build disciplined, morally grounded individuals who are ready to face the
              challenges of tomorrow. With separate campuses for boys and girls, three flexible
              shifts, and a team of 45+ dedicated teachers, we ensure every student receives
              the attention they deserve.
            </motion.p>

            {/* Values Pills with staggered animation */}
            <div className="flex flex-wrap justify-center lg:justify-start gap-3 mb-8">
              {VALUES.map((value, i) => (
                <motion.span
                  key={value}
                  custom={i}
                  variants={pillVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  whileHover={{ scale: 1.08, backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                  className="px-4 py-2 text-sm font-medium rounded-full cursor-default"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: 'rgba(255, 255, 255, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontFamily: 'var(--lp-font-body)',
                    transition: 'background 0.3s',
                  }}
                >
                  {value}
                </motion.span>
              ))}
            </div>

            {/* Motto */}
            {SITE_CONFIG.motto && (
              <motion.p
                className="text-sm font-semibold tracking-widest uppercase"
                style={{ color: '#F5A623' }}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.8 }}
              >
                {SITE_CONFIG.motto}
              </motion.p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
