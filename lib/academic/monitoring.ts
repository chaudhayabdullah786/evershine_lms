export type DailyPerformanceGrade = 'EXCELLENT' | 'GOOD' | 'NORMAL' | 'POOR'

export type MonitoringMetadata = {
  grade: DailyPerformanceGrade
  remarks: string
  isStarOfDay: boolean
  isConcern: boolean
}

const META_PREFIX = '__MONITORING_META__:'

export const DAILY_GRADE_OPTIONS: Array<{
  value: DailyPerformanceGrade
  label: string
  scoreRatio: number
  tone: 'green' | 'blue' | 'slate' | 'red'
}> = [
  { value: 'EXCELLENT', label: 'Excellent', scoreRatio: 1, tone: 'green' },
  { value: 'GOOD', label: 'Good', scoreRatio: 0.8, tone: 'blue' },
  { value: 'NORMAL', label: 'Normal', scoreRatio: 0.6, tone: 'slate' },
  { value: 'POOR', label: 'Poor', scoreRatio: 0.35, tone: 'red' },
]

export function dailyGradeLabel(grade: DailyPerformanceGrade | string | null | undefined): string {
  return DAILY_GRADE_OPTIONS.find((option) => option.value === grade)?.label ?? 'Normal'
}

export function dailyGradeScore(grade: DailyPerformanceGrade, maxScore: number): number {
  const option = DAILY_GRADE_OPTIONS.find((item) => item.value === grade)
  const ratio = option?.scoreRatio ?? 0.6
  return Math.round(maxScore * ratio * 100) / 100
}

export function deriveDailyGradeFromScore(score: number | null | undefined, maxScore: number): DailyPerformanceGrade {
  if (!score || maxScore <= 0) return 'NORMAL'
  const pct = (score / maxScore) * 100
  if (pct >= 90) return 'EXCELLENT'
  if (pct >= 75) return 'GOOD'
  if (pct >= 50) return 'NORMAL'
  return 'POOR'
}

export function encodeMonitoringRemarks(input: MonitoringMetadata): string {
  const payload = {
    grade: input.grade,
    isStarOfDay: input.isStarOfDay,
    isConcern: input.isConcern,
    remarks: input.remarks.trim(),
  }
  return `${META_PREFIX}${JSON.stringify(payload)}`
}

export function decodeMonitoringRemarks(
  rawRemarks: string | null | undefined,
  score?: number | null,
  maxScore: number = 20
): MonitoringMetadata {
  const fallbackGrade = deriveDailyGradeFromScore(score, maxScore)
  if (!rawRemarks) {
    return {
      grade: fallbackGrade,
      remarks: '',
      isStarOfDay: false,
      isConcern: fallbackGrade === 'POOR',
    }
  }

  if (!rawRemarks.startsWith(META_PREFIX)) {
    return {
      grade: fallbackGrade,
      remarks: rawRemarks,
      isStarOfDay: false,
      isConcern: fallbackGrade === 'POOR',
    }
  }

  try {
    const parsed = JSON.parse(rawRemarks.slice(META_PREFIX.length)) as Partial<MonitoringMetadata>
    const grade = DAILY_GRADE_OPTIONS.some((option) => option.value === parsed.grade)
      ? parsed.grade as DailyPerformanceGrade
      : fallbackGrade

    return {
      grade,
      remarks: typeof parsed.remarks === 'string' ? parsed.remarks : '',
      isStarOfDay: Boolean(parsed.isStarOfDay),
      isConcern: Boolean(parsed.isConcern) || grade === 'POOR',
    }
  } catch {
    return {
      grade: fallbackGrade,
      remarks: rawRemarks,
      isStarOfDay: false,
      isConcern: fallbackGrade === 'POOR',
    }
  }
}


export function stripCourseNameFromMonitoringRemarks(
  remarks: string | null | undefined,
  courseName: string
): string {
  const trimmed = remarks?.trim() ?? ''
  if (!trimmed) return ''
  const escapedCourseName = courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return trimmed.replace(new RegExp(`^${escapedCourseName}\\s*:\\s*`, 'i'), '').trim()
}

export function toDailyMonitoringPortalEntry(input: {
  rawRemarks: string | null | undefined
  score?: number | null
  maxScore?: number | null
  courseName: string
  grade?: string | null
  highlight?: string | null
}) {
  const metadata = decodeMonitoringRemarks(input.rawRemarks, input.score, input.maxScore ?? 20)
  const grade = input.grade ?? metadata.grade
  const highlight = input.highlight ?? (metadata.isStarOfDay ? 'STAR_OF_THE_DAY' : metadata.isConcern ? 'POOR' : null)
  return {
    remarks: stripCourseNameFromMonitoringRemarks(metadata.remarks, input.courseName),
    grade,
    highlight,
  }
}

export function derivePerformanceGroup(percentage: number): string {
  if (percentage >= 90) return 'Ever Shine Group'
  if (percentage >= 80) return 'Quaid Group'
  if (percentage >= 60) return 'Iqbal Group'
  return 'Improvement Group'
}

export function monitoringStatusCriteria() {
  return [
    { label: 'Ever Shine Group', min: 90, max: 100 },
    { label: 'Quaid Group', min: 80, max: 89 },
    { label: 'Iqbal Group', min: 60, max: 79 },
    { label: 'Improvement Group', min: 0, max: 59 },
  ]
}
