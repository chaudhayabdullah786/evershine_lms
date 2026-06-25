'use client'

/**
 * AcademyMemories — Premium infinite-scroll carousel for Evershine Memories.
 *
 * Architecture:
 * 1. Section Header with animated badge, heading, and media count
 * 2. Auto-sliding horizontal marquee carousel (CSS animation + JS pause)
 * 3. Separate Video Showcase grid below the carousel for prominent video display
 * 4. Full-featured lightbox with keyboard navigation
 *
 * Animations:
 * - CSS @keyframes for 60fps carousel scrolling
 * - Framer Motion for section entrance, card hover, lightbox transitions
 * - Staggered fade-in for video grid cards
 * - Pulse animation on play buttons
 * - Scale + shadow on card hover
 * - prefers-reduced-motion: static grid fallback
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Play, X, ChevronLeft, ChevronRight, Camera, Film, Pause, Eye } from 'lucide-react'
import ScrollReveal from '@/components/landing/scroll-reveal'
import type { GalleryImage, VideoItem } from '@/types/landing'

/* ─────── Unified Media Item ─────── */
interface MediaItem {
  type: 'image' | 'video'
  src: string
  alt: string
  caption?: string
  poster?: string
  videoSrc?: string
}

/* ─────── Lightbox ─────── */
function Lightbox({
  items,
  activeIndex,
  onClose,
  onPrev,
  onNext,
}: {
  items: MediaItem[]
  activeIndex: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose, onPrev, onNext])

  const current = items[activeIndex]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9000,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '20px',
          right: '24px',
          background: 'rgba(255,255,255,0.12)',
          border: 'none',
          color: '#FFF',
          cursor: 'pointer',
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          backdropFilter: 'blur(8px)',
        }}
        aria-label="Close lightbox"
      >
        <X size={26} />
      </button>

      {/* Prev */}
      {items.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          style={{
            position: 'absolute',
            left: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.12)',
            border: 'none',
            color: '#FFF',
            cursor: 'pointer',
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            backdropFilter: 'blur(8px)',
          }}
          aria-label="Previous"
        >
          <ChevronLeft size={28} />
        </button>
      )}

      {/* Next */}
      {items.length > 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext() }}
          style={{
            position: 'absolute',
            right: '16px',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'rgba(255,255,255,0.12)',
            border: 'none',
            color: '#FFF',
            cursor: 'pointer',
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            backdropFilter: 'blur(8px)',
          }}
          aria-label="Next"
        >
          <ChevronRight size={28} />
        </button>
      )}

      {/* Media Content */}
      <motion.div
        key={activeIndex}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}
      >
        {current.type === 'image' ? (
          <img
            src={current.src}
            alt={current.alt}
            style={{
              maxWidth: '90vw',
              maxHeight: '80vh',
              objectFit: 'contain',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            }}
          />
        ) : (
          <video
            ref={videoRef}
            poster={current.poster}
            controls
            autoPlay
            playsInline
            style={{
              maxWidth: '90vw',
              maxHeight: '80vh',
              borderRadius: '16px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
              backgroundColor: '#000',
            }}
          >
            <source src={current.videoSrc} type="video/mp4" />
          </video>
        )}
      </motion.div>

      {/* Caption Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'absolute',
          bottom: '28px',
          left: '50%',
          transform: 'translateX(-50%)',
          padding: '12px 28px',
          borderRadius: '28px',
          background: 'rgba(255,255,255,0.1)',
          backdropFilter: 'blur(12px)',
          color: '#FFF',
          fontSize: '0.88rem',
          fontWeight: 500,
          textAlign: 'center',
          maxWidth: '600px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        {current.type === 'video' ? <Film size={14} style={{ color: '#F5A623' }} /> : <Camera size={14} />}
        {current.caption || current.alt}
        <span style={{ opacity: 0.5, marginLeft: '8px' }}>
          {activeIndex + 1} / {items.length}
        </span>
      </div>
    </motion.div>
  )
}

/* ─────── Gallery Carousel Card ─────── */
function CarouselCard({
  item,
  onClick,
}: {
  item: MediaItem
  onClick: () => void
}) {
  return (
    <div
      className="lp-memories-card"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick() }}
    >
    <img
  src={item.type === 'video' ? (item.poster || item.src) : item.src}
  alt={item.alt}
  loading="lazy"
  draggable={false}
  style={{
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    backgroundColor: '#000',
    transition: 'none',
  }}
/>

      {/* Video play icon overlay */}
      {item.type === 'video' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255,255,255,0.95)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            }}
          >
            <Play size={24} style={{ color: '#1B4F8A', marginLeft: '3px' }} fill="#1B4F8A" />
          </motion.div>
        </div>
      )}

      {/* Caption overlay */}
      <div className="lp-memories-overlay">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {item.type === 'video' ? (
            <Film size={14} style={{ color: '#F5A623' }} />
          ) : (
            <Camera size={14} style={{ opacity: 0.8 }} />
          )}
          <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>
            {item.caption || item.alt.split(' — ')[0]}
          </span>
        </div>
      </div>

      {/* Type badge */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          padding: '4px 10px',
          borderRadius: '12px',
          background: item.type === 'video' ? 'rgba(245,166,35,0.9)' : 'rgba(27,79,138,0.85)',
          color: '#FFF',
          fontSize: '0.7rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        {item.type === 'video' ? <Film size={10} /> : <Camera size={10} />}
        {item.type === 'video' ? 'Video' : 'Photo'}
      </div>
    </div>
  )
}

/* ─────── Video Showcase Card ─────── */
function VideoShowcaseCard({
  video,
  index,
  onClick,
}: {
  video: VideoItem
  index: number
  onClick: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.95 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay: index * 0.08, ease: 'easeOut' }}
     whileHover={{ y: -2 }}
      onClick={onClick}
      className="lp-video-showcase-card"
      role="button"
      tabIndex={0}
      style={{
        position: 'relative',
        borderRadius: '16px',
        overflow: 'hidden',
        cursor: 'pointer',
        aspectRatio: '16/9',
        backgroundColor: '#111827',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
      }}
    >
    <img
  src={video.poster}
  alt={video.title}
  loading="lazy"
  draggable={false}
  style={{
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    transform: 'none',
    transition: 'none',
  }}
/>

      {/* Dark overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.05) 100%)',
          transition: 'background 0.3s ease',
        }}
      />

      {/* Play button */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <motion.div
          animate={{ scale: [1, 1.08, 1] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #F5A623, #E8330A)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 32px rgba(245,166,35,0.4)',
          }}
        >
          <Play size={28} style={{ color: '#FFF', marginLeft: '3px' }} fill="#FFF" />
        </motion.div>
      </div>

      {/* Title bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '14px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <Film size={14} style={{ color: '#F5A623', flexShrink: 0 }} />
        <span style={{
          color: '#FFF',
          fontSize: '0.85rem',
          fontWeight: 600,
          lineHeight: 1.3,
        }}>
          {video.title}
        </span>
      </div>

      {/* Video badge */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          right: '12px',
          padding: '4px 12px',
          borderRadius: '12px',
          background: 'rgba(245,166,35,0.9)',
          color: '#FFF',
          fontSize: '0.7rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          textTransform: 'uppercase',
        }}
      >
        <Play size={10} fill="#FFF" />
        Video
      </div>
    </motion.div>
  )
}


/* ─────── Main Section ─────── */
interface AcademyMemoriesProps {
  images: GalleryImage[]
  videos: VideoItem[]
}

export default function AcademyMemories({ images, videos }: AcademyMemoriesProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [isPaused, setIsPaused] = useState(false)
  const trackRef = useRef<HTMLDivElement>(null)

  // All media items for the lightbox (images + videos combined)
  const allMedia: MediaItem[] = [
    ...images.map((img): MediaItem => ({
      type: 'image',
      src: img.src,
      alt: img.alt,
      caption: img.caption,
    })),
    ...videos.map((vid): MediaItem => ({
      type: 'video',
      src: vid.poster,
      alt: vid.title,
      caption: vid.title,
      poster: vid.poster,
      videoSrc: vid.src,
    })),
  ]

  // For the photo carousel, use only images
  const carouselItems: MediaItem[] = images.map((img): MediaItem => ({
    type: 'image',
    src: img.src,
    alt: img.alt,
    caption: img.caption,
  }))

  // Triple for infinite scroll illusion
  const tripled = [...carouselItems, ...carouselItems, ...carouselItems]

  const openLightbox = useCallback((index: number) => {
    setLightboxIndex(index)
    setIsPaused(true)
  }, [])

  const openCarouselLightbox = useCallback((tripledIndex: number) => {
    const realIndex = tripledIndex % carouselItems.length
    setLightboxIndex(realIndex)
    setIsPaused(true)
  }, [carouselItems.length])

  const openVideoLightbox = useCallback((videoIndex: number) => {
    // Videos start after images in allMedia
    setLightboxIndex(images.length + videoIndex)
    setIsPaused(true)
  }, [images.length])

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null)
    setIsPaused(false)
  }, [])

  const prevItem = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev - 1 + allMedia.length) % allMedia.length : null
    )
  }, [allMedia.length])

  const nextItem = useCallback(() => {
    setLightboxIndex((prev) =>
      prev !== null ? (prev + 1) % allMedia.length : null
    )
  }, [allMedia.length])

  // ~4s per card for readable pace
  const animDuration = carouselItems.length * 4

  return (
    <section
      id="gallery"
      style={{
        padding: '80px 0 100px',
        backgroundColor: '#0D1B2A',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative background */}
      <div
        style={{
          position: 'absolute',
          top: '-150px',
          right: '-100px',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(245,166,35,0.08) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-100px',
          left: '-100px',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(27,79,138,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <div className="lp-container">
        {/* ─── Section Header ─── */}
        <ScrollReveal>
          <div style={{ textAlign: 'center', marginBottom: '52px' }}>
            <motion.span
              initial={{ opacity: 0, y: -10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 20px',
                borderRadius: '20px',
                backgroundColor: 'rgba(245, 166, 35, 0.12)',
                border: '1px solid rgba(245, 166, 35, 0.25)',
                fontSize: '0.8rem',
                fontWeight: 600,
                color: '#F5A623',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                marginBottom: '20px',
              }}
            >
              <Camera size={14} />
              Campus Life
            </motion.span>

            <h2
              style={{
                fontFamily: 'var(--font-display, Georgia, serif)',
                fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
                fontWeight: 800,
                color: '#FFFFFF',
                lineHeight: 1.15,
                marginBottom: '16px',
              }}
            >
              Evershine{' '}
              <span style={{ color: '#F5A623' }}>Memories</span>
            </h2>

            <p
              style={{
                fontSize: 'clamp(0.9rem, 1.5vw, 1.1rem)',
                color: 'rgba(255,255,255,0.65)',
                maxWidth: '600px',
                margin: '0 auto 24px',
                lineHeight: 1.6,
              }}
            >
              A vibrant collection of moments that define our academy — from rigorous
              academics and hands-on experiments to spirited sports days and creative celebrations.
            </p>

            {/* Media count badges — rendered unconditionally.
                Data comes from static SITE_CONFIG import so counts are
                identical on server and client. No guards needed. */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <motion.span
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: 0.1 }}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 18px',
                  borderRadius: '24px',
                  backgroundColor: 'rgba(27, 79, 138, 0.3)',
                  border: '1px solid rgba(27, 79, 138, 0.4)',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: '#7EB8F5',
                }}
              >
                <Camera size={14} />
                {images.length} Photos
              </motion.span>
              {videos.length > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: 0.2 }}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 18px',
                    borderRadius: '24px',
                    backgroundColor: 'rgba(245, 166, 35, 0.15)',
                    border: '1px solid rgba(245, 166, 35, 0.3)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: '#F5A623',
                  }}
                >
                  <Film size={14} />
                  {videos.length} Videos
                </motion.span>
              )}
            </div>
          </div>
        </ScrollReveal>
      </div>

      {/* ─── Photo Carousel Strip ─── */}
      <div className="lp-memories-carousel" style={{ position: 'relative', marginBottom: '60px' }}>
        {/* Gradient fade edges */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '80px',
            background: 'linear-gradient(to right, #0D1B2A, transparent)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: '80px',
            background: 'linear-gradient(to left, #0D1B2A, transparent)',
            zIndex: 2,
            pointerEvents: 'none',
          }}
        />

        <div
          ref={trackRef}
          className="lp-memories-track"
          style={{
            animationPlayState: isPaused ? 'paused' : 'running',
            animationDuration: `${animDuration}s`,
          }}
        >
          {tripled.map((item, i) => (
            <CarouselCard
              key={`${item.src}-${i}`}
              item={item}
              onClick={() => openCarouselLightbox(i)}
            />
          ))}
        </div>
      </div>

      {/* Pause/Play */}
      <div className="lp-container" style={{ textAlign: 'center', marginBottom: '64px' }}>
        <motion.button
          /*whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }} */
          onClick={() => setIsPaused(!isPaused)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 24px',
            borderRadius: '24px',
            backgroundColor: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.7)',
            fontSize: '0.8rem',
            fontWeight: 500,
            cursor: 'pointer',
            backdropFilter: 'blur(8px)',
            transition: 'all 0.3s ease',
          }}
          aria-label={isPaused ? 'Resume slideshow' : 'Pause slideshow'}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
          {isPaused ? 'Resume Slideshow' : 'Pause Slideshow'}
        </motion.button>
      </div>

      {/* ─── Video Carousel Section ─── */}
      {videos.length > 0 && (
        <>
          <div className="lp-container">
            <ScrollReveal>
              <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: '60px' }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                  style={{
                    height: '3px',
                    background: 'linear-gradient(90deg, #F5A623, #E8330A)',
                    borderRadius: '2px',
                    margin: '0 auto 20px',
                  }}
                />
                <h3
                  style={{
                    fontFamily: 'var(--font-display, Georgia, serif)',
                    fontSize: 'clamp(1.3rem, 3vw, 1.8rem)',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    marginBottom: '8px',
                  }}
                >
                  <Film size={20} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '8px', color: '#F5A623' }} />
                  Academy Videos
                </h3>
                <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
                  Watch our academy in action — click any video to play
                </p>
              </div>
            </ScrollReveal>
          </div>

          {/* Video Carousel — slides opposite direction to photos */}
          <div className="lp-memories-carousel" style={{ position: 'relative' }}>
            {/* Gradient fade edges */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: '80px',
                background: 'linear-gradient(to right, #0D1B2A, transparent)',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                width: '80px',
                background: 'linear-gradient(to left, #0D1B2A, transparent)',
                zIndex: 2,
                pointerEvents: 'none',
              }}
            />

            <div
              className="lp-memories-track lp-memories-track-reverse"
              style={{
                animationPlayState: isPaused ? 'paused' : 'running',
                animationDuration: `${videos.length * 5}s`,
              }}
            >
              {/* Triple for infinite loop */}
              {[...videos, ...videos, ...videos].map((video, i) => (
                <div
                  key={`vid-${video.src}-${i}`}
                  className="lp-memories-card lp-video-carousel-card"
                  onClick={() => openVideoLightbox(i % videos.length)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') openVideoLightbox(i % videos.length) }}
                >
                  <img
                    src={video.poster}
                    alt={video.title}
                    loading="lazy"
                    draggable={false}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      transition: 'none',
                    }}
                  />

                  {/* Dark gradient overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.15) 50%, rgba(0,0,0,0.05) 100%)',
                      pointerEvents: 'none',
                    }}
                  />

                  {/* Pulsing Play Button */}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'none',
                    }}
                  >
                    <motion.div
                      animate={{ scale: [1, 1.12, 1] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      style={{
                        width: '60px',
                        height: '60px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, #F5A623, #E8330A)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 8px 32px rgba(245,166,35,0.4)',
                      }}
                    >
                      <Play size={26} style={{ color: '#FFF', marginLeft: '3px' }} fill="#FFF" />
                    </motion.div>
                  </div>

                  {/* Title overlay */}
                  <div className="lp-memories-overlay" style={{ opacity: 1, transform: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Film size={14} style={{ color: '#F5A623' }} />
                      <span style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                        {video.title}
                      </span>
                    </div>
                    <span style={{ fontSize: '0.72rem', opacity: 0.6, marginTop: '2px' }}>
                      Click to play
                    </span>
                  </div>

                  {/* Video badge */}
                  <div
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      padding: '4px 12px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #F5A623, #E8330A)',
                      color: '#FFF',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      textTransform: 'uppercase',
                      boxShadow: '0 2px 8px rgba(245,166,35,0.3)',
                    }}
                  >
                    <Play size={10} fill="#FFF" />
                    Video
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ─── Lightbox ─── */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            items={allMedia}
            activeIndex={lightboxIndex}
            onClose={closeLightbox}
            onPrev={prevItem}
            onNext={nextItem}
          />
        )}
      </AnimatePresence>
    </section>
  )
}
