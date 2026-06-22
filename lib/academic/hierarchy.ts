import { formatClassWithShift, type SessionShift } from '@/lib/validation/shift'
import type { AcademicClassRecord, AcademicScopeState } from './types'

export const ACADEMIC_NONE = '__none__'

/** Performance house is mandatory whenever the selected batch has houses defined. */
export function performanceHouseRequired(hasHouses: boolean): boolean {
  return hasHouses
}

/** Admin scope is complete when campus + batch are set, and house when the batch has houses. */
export function isAdminAcademicScopeReady(
  scope: Pick<AcademicScopeState, 'campusId' | 'batchId' | 'houseId'>,
  hasHouses: boolean
): boolean {
  if (!scope.campusId || !scope.batchId) return false
  if (performanceHouseRequired(hasHouses) && !scope.houseId) return false
  return true
}

/** Teacher/student placement (campus form) uses the same batch + house rules. */
export function isPlacementScopeReady(
  campusId: string,
  batchId: string,
  houseId: string,
  hasHouses: boolean
): boolean {
  return isAdminAcademicScopeReady({ campusId, batchId, houseId }, hasHouses)
}

/** Human-readable label for class dropdowns (attendance, teachers, exams, etc.). */
export function formatAcademicClassLabel(c: AcademicClassRecord): string {
  const shiftPart = formatClassWithShift(c.name, c.shift ?? undefined)
  const section = c.section ? ` · Sec ${c.section}` : ''
  const campus = c.campus?.name ? ` — ${c.campus.name}` : ''
  const batch = c.batch?.name ? ` [${c.batch.name}]` : ''
  return `${shiftPart}${section}${campus}${batch}`
}

/** Client-side filter: campus → batch → session shift. */
export function filterClassesByScope(
  classes: AcademicClassRecord[],
  opts: {
    campusId?: string
    batchId?: string
    shift?: SessionShift
  }
): AcademicClassRecord[] {
  return classes.filter((c) => {
    if (opts.campusId && c.campusId !== opts.campusId) return false
    if (opts.batchId && c.batchId !== opts.batchId) return false
    if (opts.shift && c.shift && c.shift !== opts.shift) return false
    return true
  })
}

/** Sort classes by grade then section for consistent dropdown order. */
export function sortClasses(classes: AcademicClassRecord[]): AcademicClassRecord[] {
  return [...classes].sort((a, b) => {
    const g = (a.grade ?? 0) - (b.grade ?? 0)
    if (g !== 0) return g
    return (a.section ?? '').localeCompare(b.section ?? '')
  })
}

/** Current academic year string (Pakistan-style Jul–Jun approximation). */
export function currentAcademicYear(): string {
  const y = new Date().getFullYear()
  const m = new Date().getMonth()
  // Academic year typically starts around April/May in Pakistan schools
  if (m >= 3) return `${y}-${y + 1}`
  return `${y - 1}-${y}`
}
