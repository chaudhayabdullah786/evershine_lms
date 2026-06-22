'use client'

/**
 * components/ui/section-label.tsx — Editorial section numbering
 * 
 * emmpo.com-inspired "01 ──" label placed above section headings.
 * Creates premium editorial feel with numbered sections.
 */

interface SectionLabelProps {
  number: string
  labelColor?: string
}

export function SectionLabel({ number, labelColor = 'var(--lp-secondary)' }: SectionLabelProps) {
  return (
    <div className="flex items-center gap-3 mb-6">
      <span
        className="text-xs font-bold tracking-widest uppercase"
        style={{ color: labelColor, fontFamily: 'var(--lp-font-body)' }}
      >
        {number}
      </span>
      <div
        className="h-px w-10"
        style={{ background: labelColor }}
      />
    </div>
  )
}
