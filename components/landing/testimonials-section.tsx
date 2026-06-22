'use client'

/**
 * TestimonialsSection — Oversized italic Playfair pull-quotes (emmpo-inspired).
 *
 * Auto-advancing carousel with:
 * - Large opening quotation mark in amber gold
 * - Oversized italic Playfair Display quote text
 * - Star rating display
 * - Crossfade animations with AnimatePresence
 * - Swipe support on mobile
 * - Pause on hover/touch
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SectionLabel } from '@/components/ui/section-label'
import SectionHeading from '@/components/landing/section-heading'
import { Star, ChevronLeft, ChevronRight } from 'lucide-react'
import type { Testimonial } from '@/types/landing'

export default function TestimonialsSection({ testimonials }: { testimonials: Testimonial[] }) {
  const [active, setActive] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [direction, setDirection] = useState(1) // 1 = forward, -1 = back
  const touchStart = useRef(0)

  const goTo = useCallback((index: number) => {
    setDirection(index > active ? 1 : -1)
    setActive(index)
  }, [active])

  const next = useCallback(() => {
    setDirection(1)
    setActive((prev) => (prev + 1) % testimonials.length)
  }, [testimonials.length])

  const prev = useCallback(() => {
    setDirection(-1)
    setActive((prev) => (prev - 1 + testimonials.length) % testimonials.length)
  }, [testimonials.length])

  useEffect(() => {
    if (isPaused || testimonials.length <= 1) return
    const timer = setInterval(next, 6000)
    return () => clearInterval(timer)
  }, [isPaused, next, testimonials.length])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    const diff = touchStart.current - e.changedTouches[0].clientX
    if (Math.abs(diff) > 50) {
      diff > 0 ? next() : prev()
    }
  }

  const current = testimonials[active]

  const slideVariants = {
    enter: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? 60 : -60,
      scale: 0.96,
    }),
    center: {
      opacity: 1,
      x: 0,
      scale: 1,
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir > 0 ? -60 : 60,
      scale: 0.96,
    }),
  }

  return (
    <section
      id="testimonials"
      aria-label="Testimonials"
      className="relative overflow-hidden"
      style={{
        padding: '100px 0',
        backgroundColor: '#FFFFFF',
      }}
    >
      {/* Background decorations */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: '10%',
          right: '-60px',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245, 166, 35, 0.05) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: '10%',
          left: '-40px',
          width: '200px',
          height: '200px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(27, 79, 138, 0.04) 0%, transparent 70%)',
        }}
      />

      <div className="lp-container">
        <div className="text-center">
          <SectionLabel number="TESTIMONIALS" labelColor="#F5A623" />
        </div>

        <SectionHeading
          title="What Parents & Students Say"
          subtitle="Real experiences from our Evershine Academy family."
        />

        <div
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          className="relative max-w-3xl mx-auto"
        >
          {/* Large decorative quote mark */}
          <div
            className="text-center mb-6 select-none"
            style={{
              fontFamily: 'var(--lp-font-display)',
              fontSize: 'clamp(4rem, 8vw, 7rem)',
              lineHeight: 0.8,
              color: '#F5A623',
              opacity: 0.2,
            }}
          >
            &ldquo;
          </div>

          {/* Quote Card */}
          <div
            className="relative rounded-3xl p-8 md:p-12 min-h-[300px] flex flex-col items-center justify-center"
            style={{
              backgroundColor: '#F9F7F4',
              boxShadow: '0 4px 24px rgba(27, 79, 138, 0.06)',
            }}
          >
            {/* Star Rating */}
            <div className="flex gap-1.5 mb-8">
              {[1, 2, 3, 4, 5].map((star) => (
                <motion.div
                  key={star}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: star * 0.08, duration: 0.3 }}
                >
                  <Star
                    size={20}
                    fill="#F5A623"
                    style={{ color: '#F5A623' }}
                  />
                </motion.div>
              ))}
            </div>

            {/* Quote with AnimatePresence */}
            <AnimatePresence mode="wait" custom={direction}>
              <motion.div
                key={active}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{
                  duration: 0.5,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                className="text-center"
              >
                {/* Oversized italic quote */}
                <blockquote
                  className="mb-8"
                  style={{
                    fontFamily: 'var(--lp-font-display)',
                    fontSize: 'clamp(1.1rem, 2.5vw, 1.5rem)',
                    fontStyle: 'italic',
                    fontWeight: 500,
                    lineHeight: 1.8,
                    color: '#1A1A2E',
                    maxWidth: '580px',
                    margin: '0 auto 32px',
                  }}
                >
                  &ldquo;{current.quote}&rdquo;
                </blockquote>

                {/* Author */}
                <div className="flex items-center justify-center gap-4">
                  {/* Avatar */}
                  <div
                    className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{
                      background: 'linear-gradient(135deg, #1B4F8A, #0f2d52)',
                      boxShadow: '0 4px 16px rgba(27, 79, 138, 0.25)',
                    }}
                  >
                    {current.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-base" style={{ color: '#1B4F8A' }}>
                      {current.name}
                    </p>
                    <p className="text-sm" style={{ color: '#6B7280' }}>
                      {current.role}
                    </p>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation Arrows */}
          <div className="flex items-center justify-center gap-6 mt-8">
            <button
              onClick={prev}
              aria-label="Previous testimonial"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 cursor-pointer"
              style={{
                background: 'rgba(27, 79, 138, 0.08)',
                color: '#1B4F8A',
                border: 'none',
              }}
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            {/* Dots */}
            <div className="flex gap-2">
              {testimonials.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goTo(i)}
                  aria-label={`Go to testimonial ${i + 1}`}
                  className="transition-all duration-400 cursor-pointer"
                  style={{
                    width: i === active ? '32px' : '8px',
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: i === active ? '#F5A623' : '#E5E7EB',
                    border: 'none',
                    boxShadow: i === active ? '0 0 12px rgba(245, 166, 35, 0.35)' : 'none',
                    transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                  }}
                />
              ))}
            </div>

            <button
              onClick={next}
              aria-label="Next testimonial"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 cursor-pointer"
              style={{
                background: 'rgba(27, 79, 138, 0.08)',
                color: '#1B4F8A',
                border: 'none',
              }}
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
