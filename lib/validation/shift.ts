import { z } from 'zod'

// Canonical session shift values for Evershaheen Academy (09:00–21:00 operating window).
// Morning: 09:00–12:00 | Evening: 15:00–18:00 | Night: 18:00–21:00
export const sessionShiftSchema = z.enum(['MORNING', 'EVENING', 'NIGHT'], {
  errorMap: () => ({ message: "Shift must be 'MORNING', 'EVENING', or 'NIGHT'" }),
})

export type SessionShift = z.infer<typeof sessionShiftSchema>

export const SESSION_SHIFT_LABELS: Record<SessionShift, string> = {
  MORNING: '🌅 Morning',
  EVENING: '🌆 Evening',
  NIGHT: '🌙 Night',
}

/** Default session windows (admin can override per Shift row in Academic Engine). */
export const SESSION_SHIFT_TIMES: Record<SessionShift, { start: string; end: string }> = {
  MORNING: { start: '09:00', end: '12:00' },
  EVENING: { start: '15:00', end: '18:00' },
  NIGHT: { start: '18:00', end: '21:00' },
}

/**
 * Academy attendance policy constants.
 * WHY centralised: The check-in API and the teacher HR page both reference
 * these values. Keeping them in one place prevents drift.
 */
export const ATTENDANCE_POLICY = {
  /** Minutes after shift start before a check-in is considered "late". */
  defaultGraceMinutes: 30,
  /** Number of penalty-free late arrivals allowed per calendar month. */
  freeLatePasses: 1,
} as const

export const SESSION_SHIFT_BADGE_CLASS: Record<SessionShift, string> = {
  MORNING: 'bg-amber-100 text-amber-800 border-amber-200',
  EVENING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  NIGHT: 'bg-violet-100 text-violet-800 border-violet-200',
}

/** Display label without emoji (for PDFs and formal docs). */
export function sessionShiftFormalLabel(shift: SessionShift): string {
  const labels: Record<SessionShift, string> = {
    MORNING: 'Morning Session',
    EVENING: 'Evening Session',
    NIGHT: 'Night Session',
  }
  return labels[shift]
}

export function formatClassWithShift(name: string, shift?: SessionShift | null): string {
  if (!shift) return name
  const short: Record<SessionShift, string> = {
    MORNING: 'Morning',
    EVENING: 'Evening',
    NIGHT: 'Night',
  }
  return `${name} · ${short[shift]}`
}
