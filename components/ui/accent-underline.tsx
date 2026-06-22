'use client'

/**
 * components/ui/accent-underline.tsx — Wavy SVG underline
 *
 * emmpo.com-inspired animated underline for key headline words.
 * Draws in on scroll using the drawUnderline keyframe.
 *
 * Usage: <AccentUnderline>Excellence</AccentUnderline>
 */

interface AccentUnderlineProps {
  children: React.ReactNode
  color?: string
}

export function AccentUnderline({
  children,
  color = 'var(--lp-secondary)',
}: AccentUnderlineProps) {
  return (
    <span className="relative inline-block">
      {children}
      <svg
        className="absolute -bottom-1 left-0 w-full h-2"
        viewBox="0 0 200 8"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 5 Q25 0, 50 5 T100 5 T150 5 T200 5"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{
            strokeDasharray: 200,
            strokeDashoffset: 0,
            animation: 'drawUnderline 1s var(--ease-out) forwards',
          }}
        />
      </svg>
    </span>
  )
}
