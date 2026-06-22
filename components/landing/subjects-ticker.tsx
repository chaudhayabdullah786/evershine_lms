'use client'

/**
 * components/landing/subjects-ticker.tsx — S-04
 *
 * emmpo.com-inspired navy strip with scrolling subject names in italic serif.
 * Communicates curriculum breadth without a long bullet list.
 * Placed between Hero (S-03) and StatsBar (S-05).
 *
 * ACCESSIBILITY: prefers-reduced-motion pauses the animation.
 */

import { SITE_CONFIG } from '@/content/site-config'

export function SubjectsTicker() {
  const subjects = SITE_CONFIG.subjects ?? []
  if (subjects.length === 0) return null

  // Duplicate for seamless infinite loop
  const duplicated = [...subjects, ...subjects]

  return (
    <section
      id="subjects"
      aria-label="Subjects we teach"
      className="relative overflow-hidden py-5"
      style={{ backgroundColor: '#1B4F8A' }}
    >
      <div
        className="flex items-center gap-8 whitespace-nowrap subjects-ticker-track"
        style={{
          animation: 'subjectsScroll 30s linear infinite',
        }}
      >
        {duplicated.map((subject, i) => (
          <span key={`${subject}-${i}`} className="flex items-center gap-8">
            <span
              className="text-lg md:text-xl italic opacity-90"
              style={{
                color: 'rgba(255, 255, 255, 0.85)',
                fontFamily: 'var(--lp-font-display)',
              }}
            >
              {subject}
            </span>
            <span
              className="text-sm"
              style={{ color: 'var(--lp-secondary)' }}
              aria-hidden="true"
            >
              ✦
            </span>
          </span>
        ))}
      </div>

      {/* Fade edges */}
      <div
        className="absolute inset-y-0 left-0 w-16 pointer-events-none"
        style={{ background: 'linear-gradient(to right, #1B4F8A, transparent)' }}
      />
      <div
        className="absolute inset-y-0 right-0 w-16 pointer-events-none"
        style={{ background: 'linear-gradient(to left, #1B4F8A, transparent)' }}
      />

      <style jsx>{`
        @media (prefers-reduced-motion: reduce) {
          .subjects-ticker-track {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  )
}
