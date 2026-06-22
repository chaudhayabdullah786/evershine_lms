/**
 * AcademyLogo — renders the official bglogo.png (500×500, transparent bg)
 * served via /api/logo from the designs/ directory.
 *
 * variant  | use-case
 * ─────────┼──────────────────────────────────────────────────
 * primary  | Hero sections, login page, about/cover pages
 * compact  | Navbar, sidebar, document headers
 * icon     | Small UI placements, loading screens
 */

import React from 'react'

type AcademyLogoVariant = 'primary' | 'compact' | 'icon'

interface AcademyLogoProps {
  className?: string
  variant?: AcademyLogoVariant
  /** @deprecated – transparent bg means theme filters are no longer needed */
  theme?: string
  /** @deprecated – transparent bg means heroCard wrapping is no longer needed */
  heroCard?: boolean
}

const LOGO_SRC = '/api/logo'
const LOGO_ALT = 'EverShine Academy'

export const AcademyLogo = ({
  className,
  variant = 'icon',
  theme,
}: AcademyLogoProps) => {
  /* ──────────────────────────────────────────
   * PRIMARY — large, centered, for hero / login
   * Use scale to compensate for the transparent padding in bglogo.png
   * ────────────────────────────────────────── */
  if (variant === 'primary') {
    return (
      <div className={`relative flex items-center justify-center overflow-hidden ${className ?? 'w-40 h-40'}`}>
        <img
          src={LOGO_SRC}
          alt={LOGO_ALT}
          className="w-full h-full object-contain scale-[1.75]"
          draggable={false}
        />
      </div>
    )
  }

  /* ──────────────────────────────────────────
   * COMPACT — logo + wordmark for navbars/sidebars
   * ────────────────────────────────────────── */
  if (variant === 'compact') {
    const isWhiteText = theme === 'mono-white'
    return (
      <div className={`flex items-center gap-2.5 select-none overflow-hidden ${className ?? 'h-10'}`}>
        <div className="h-full aspect-square shrink-0 flex items-center justify-center">
          <img
            src={LOGO_SRC}
            alt={LOGO_ALT}
            className="h-full w-auto object-contain scale-[1.75]"
            draggable={false}
          />
        </div>
        <div className="flex flex-col justify-center leading-none">
          <span className={`text-sm font-black tracking-widest uppercase whitespace-nowrap ${isWhiteText ? 'text-white' : 'text-blue-950'}`}
                style={{ letterSpacing: '0.1em' }}>
            EVERSHINE
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-[0.2em] whitespace-nowrap mt-0.5 ${isWhiteText ? 'text-blue-200' : 'text-slate-500'}`}>
            ACADEMY
          </span>
        </div>
      </div>
    )
  }

  /* ──────────────────────────────────────────
   * ICON — smallest form, logo only
   * ────────────────────────────────────────── */
  return (
    <div className={`relative flex items-center justify-center overflow-hidden ${className ?? 'w-10 h-10'}`}>
      <img
        src={LOGO_SRC}
        alt={LOGO_ALT}
        className="w-full h-full object-contain scale-[1.75]"
        draggable={false}
      />
    </div>
  )
}
