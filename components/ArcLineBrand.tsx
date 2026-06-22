/**
 * ArcLineBrand — Reusable attribution component for ArcLine Group.
 *
 * Renders "Built by ArcLine Group" (or custom prefix) with an animated
 * gradient shimmer on "ArcLine Group" text only.
 *
 * The shimmer uses the project's primary palette (blue-600 → indigo-500 → violet-500)
 * defined as `.arcline-brand` in globals.css.
 *
 * VARIANTS:
 *   inline   — single-line, small text for footers/card bottoms
 *   compact  — minimal, just "ArcLine Group" with no prefix
 */

import React from 'react'

type ArcLineBrandVariant = 'inline' | 'compact'

interface ArcLineBrandProps {
  variant?: ArcLineBrandVariant
  /** Override the prefix text (default: "Built by") */
  prefix?: string
  className?: string
}

export function ArcLineBrand({
  variant = 'inline',
  prefix = 'Built by',
  className = '',
}: ArcLineBrandProps) {

  if (variant === 'compact') {
    return (
      <span className={`arcline-brand text-xs tracking-wide ${className}`}>
        ArcLine Group
      </span>
    )
  }

  // inline (default)
  return (
    <span className={`text-[11px] text-slate-400 select-none ${className}`}>
      {prefix}{' '}
      <span className="arcline-brand">ArcLine Group</span>
    </span>
  )
}
