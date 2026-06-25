'use client'

/**
 * HeroSection — Full-width banner image display + banner carousel.
 * 
 * Architecture:
 * Part 1: Static banner.png displayed full-width at top, NO overlay,
 *         with a zoom-out entrance animation for visual impact.
 * Part 2: Below the banner — rotating banner carousel with text overlay
 *         for additional academy banners.
 * 
 * The primary banner is shown as-is — the designed image contains
 * all necessary branding, so no text overlay is needed.
 */

import Image from 'next/image'
import { motion } from 'framer-motion'
import { useBannerRotation } from '@/hooks/use-banner-rotation'
import type { BannerImage } from '@/types/landing'
import { ChevronDown, Sparkles, GraduationCap, Phone, MapPin } from 'lucide-react'

interface HeroSectionProps {
  banners: BannerImage[]
  academyName: string
  tagline: string
  subTagline: string
  onApplyClick: () => void
}

export default function HeroSection({
  banners,
  onApplyClick,
}: HeroSectionProps) {
  // The first banner (banner-3.png = banner.png) is shown statically
  // Remaining banners rotate in the carousel below
  const carouselBanners = banners.slice(1)
  const { activeIndex, goTo } = useBannerRotation(carouselBanners.length, 5000)

  const handleExplore = () => {
    const el = document.querySelector('#about')
    if (el) el.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section id="hero">
      {/* ─── Part 1: Primary Banner — Full Width, No Overlay ─── */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          overflow: 'hidden',
          backgroundColor: '#F5F3EF',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            scale: { duration: 1.8, ease: [0.25, 0.46, 0.45, 0.94] },
            opacity: { duration: 0.8, ease: 'easeOut' },
          }}
          style={{
            width: '100%',
            lineHeight: 0,
          }}
        >
          <Image
            src={banners[0]?.src || '/assets/images/banner/banner-3.png'}
            alt={banners[0]?.alt || 'Evershine Academy — We Make Your Children More Valuable'}
            width={1983}
            height={793}
            priority
            sizes="100vw"
            style={{
              width: '100%',
              height: 'auto',
              display: 'block',
              objectFit: 'contain',
            }}
          />
        </motion.div>

        {/* Subtle bottom gradient blend into next section */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: '40px',
            background: 'linear-gradient(to top, #0D1B2A, transparent)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* ─── Part 2: CTA Strip + Banner Carousel ─── */}
      <div
        style={{
          position: 'relative',
          background: 'linear-gradient(135deg, #0D1B2A 0%, #1B3A5C 50%, #0D1B2A 100%)',
          overflow: 'hidden',
        }}
      >
        {/* Animated background particles */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          {[...Array(6)].map((_, i) => (
            <motion.div
              key={i}
              style={{
                position: 'absolute',
                width: `${40 + i * 20}px`,
                height: `${40 + i * 20}px`,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(245,166,35,${0.04 + i * 0.01}) 0%, transparent 70%)`,
                top: `${10 + i * 15}%`,
                left: `${5 + i * 16}%`,
              }}
              animate={{
                y: [0, -20, 0],
                x: [0, 10, 0],
                scale: [1, 1.2, 1],
              }}
              transition={{
                duration: 6 + i,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: i * 0.5,
              }}
            />
          ))}
        </div>

        {/* Quick Info Bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '16px',
            padding: '24px 16px 8px',
            position: 'relative',
            zIndex: 2,
          }}
        >
          {[
            { icon: <GraduationCap size={15} />, text: 'Playgroup → Matric → College' },
            { icon: <Sparkles size={15} />, text: 'Morning · Evening · Night' },
            { icon: <MapPin size={15} />, text: 'Boys & Girls Campuses' },
          ].map((pill, i) => (
            <motion.span
              key={pill.text}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.6 + i * 0.12 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: '24px',
                backgroundColor: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.9)',
                fontSize: '0.82rem',
                fontWeight: 500,
                backdropFilter: 'blur(8px)',
              }}
            >
              {pill.icon}
              {pill.text}
            </motion.span>
          ))}
        </motion.div>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.8 }}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '14px',
            padding: '24px 16px',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <motion.button
            whileHover={{ scale: 1.04, y: -2, boxShadow: '0 8px 32px rgba(245,166,35,0.5)' }}
            whileTap={{ scale: 0.97 }}
            onClick={onApplyClick}
            style={{
              padding: '14px 44px',
              backgroundColor: '#F5A623',
              color: '#0D1B2A',
              borderRadius: '12px',
              border: 'none',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(245,166,35,0.35)',
              letterSpacing: '0.02em',
            }}
          >
            Apply for Admission
          </motion.button>

          <motion.a
            href="tel:03284010522"
            whileHover={{ scale: 1.04, y: -2, backgroundColor: 'rgba(255,255,255,0.15)' }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 36px',
              backgroundColor: 'rgba(255,255,255,0.08)',
              color: '#FFFFFF',
              borderRadius: '12px',
              border: '1.5px solid rgba(255,255,255,0.2)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'none',
              backdropFilter: 'blur(8px)',
            }}
          >
            <Phone size={16} />
            0328-4010522
          </motion.a>

          <motion.button
            whileHover={{ scale: 1.04, y: -2, backgroundColor: 'rgba(255,255,255,0.12)' }}
            whileTap={{ scale: 0.97 }}
            onClick={handleExplore}
            style={{
              padding: '14px 36px',
              backgroundColor: 'rgba(255,255,255,0.06)',
              color: '#FFFFFF',
              borderRadius: '12px',
              border: '1.5px solid rgba(255,255,255,0.15)',
              fontSize: '1rem',
              fontWeight: 600,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            Explore Academy ↓
          </motion.button>
        </motion.div>

        {/* ─── Rotating Banner Carousel ─── */}
        {carouselBanners.length > 0 && (
          <div style={{ padding: '8px 16px 32px', position: 'relative', zIndex: 2 }}>
            <div
              style={{
                position: 'relative',
                maxWidth: '1200px',
                margin: '0 auto',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 12px 48px rgba(0,0,0,0.4)',
                backgroundColor: '#F5F3EF',
              }}
            >
              {/* Stable carousel canvas prevents layout shift while slides load. */}
              <div
                aria-hidden="true"
                style={{
                  width: '100%',
                  aspectRatio: '1672 / 941',
                }}
              />

              {/* Carousel images — absolutely positioned over the spacer */}
              {carouselBanners.map((banner, i) => (
                <div
                  key={banner.src}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    opacity: i === activeIndex ? 1 : 0,
                    transition: 'opacity 1s ease-in-out',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#F5F3EF',
                  }}
                >
                  <Image
                    src={banner.src}
                    alt={banner.alt}
                    fill
                    priority={i === 0}
                    sizes="(max-width: 768px) 100vw, 1200px"
                    style={{
                      objectFit: 'contain',
                      objectPosition: 'center',
                    }}
                  />
                </div>
              ))}

              {/* Subtle gradient overlay for dot visibility */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '60px',
                  background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)',
                  pointerEvents: 'none',
                }}
              />

              {/* Dots */}
              <div
                style={{
                  position: 'absolute',
                  bottom: '14px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  display: 'flex',
                  gap: '8px',
                  zIndex: 3,
                }}
              >
                {carouselBanners.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    aria-label={`Go to banner ${i + 1}`}
                    style={{
                      width: i === activeIndex ? '28px' : '8px',
                      height: '8px',
                      borderRadius: '4px',
                      backgroundColor: i === activeIndex ? '#F5A623' : 'rgba(255,255,255,0.5)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
                      boxShadow: i === activeIndex ? '0 0 10px rgba(245,166,35,0.5)' : 'none',
                    }}
                  />
                ))}
              </div>

              {/* Banner badge */}
              {carouselBanners[activeIndex]?.badge && (
                <motion.div
                  key={activeIndex}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4 }}
                  style={{
                    position: 'absolute',
                    top: '16px',
                    left: '16px',
                    padding: '6px 16px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(245,166,35,0.9)',
                    color: '#FFF',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    backdropFilter: 'blur(4px)',
                  }}
                >
                  {carouselBanners[activeIndex].badge}
                </motion.div>
              )}
            </div>
          </div>
        )}

        {/* Scroll Indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          onClick={handleExplore}
          style={{
            textAlign: 'center',
            paddingBottom: '20px',
            cursor: 'pointer',
            position: 'relative',
            zIndex: 2,
          }}
        >
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          >
            <ChevronDown size={28} color="rgba(255,255,255,0.5)" />
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}
