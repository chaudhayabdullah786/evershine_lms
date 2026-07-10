/**
 * Performance Batch Derivation — shared utility used by both auto-calculation
 * and manual override validation.
 *
 * Labels (aligned with Excel/UI display scale):
 *   ≥ 90  → "Ever Shine Group"
 *   80–89 → "Quaid Group"
 *   60–79 → "Iqbal Group"
 *   < 60  → "Improvement Group"
 *
 * WHY function not DB lookup: Batch thresholds are institution-constants for
 * Evershaheen Academy. If configurable thresholds are needed in future, replace
 * this with a SystemSetting lookup without changing call sites.
 */
export function derivePerformanceBatch(percentage: number): string {
  if (percentage >= 90) return 'Ever Shine Group'
  if (percentage >= 80) return 'Quaid Group'
  if (percentage >= 60) return 'Iqbal Group'
  return 'Improvement Group'
}

/**
 * Derives result status string for display on result cards and exports.
 */
export function deriveResultStatus(params: {
  isAbsent: boolean
  isNotApplicable: boolean
  obtainedMarks: number | null
  totalMarks: number
  passingMarks?: number
}): string {
  if (params.isAbsent) return 'Absent'
  if (params.isNotApplicable) return 'N/A'
  if (params.obtainedMarks === null) return 'Pending'
  const passing = params.passingMarks ?? Math.ceil(params.totalMarks * 0.33)
  return params.obtainedMarks >= passing ? 'Pass' : 'Fail'
}

/**
 * Derives letter grade from percentage.
 * Standard Pakistani board grading scale.
 */
export function deriveGrade(percentage: number): string {
  if (percentage >= 90) return 'A+'
  if (percentage >= 80) return 'A'
  if (percentage >= 70) return 'B'
  if (percentage >= 60) return 'C'
  if (percentage >= 50) return 'D'
  return 'F'
}
