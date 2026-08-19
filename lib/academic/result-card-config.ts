import { z } from 'zod'

export const RESULT_CARD_POSITION_MODES = ['HIDDEN', 'SYSTEM_APPROVED', 'MANUAL'] as const
export type ResultCardPositionMode = (typeof RESULT_CARD_POSITION_MODES)[number]

export const resultCardConfigSchema = z.object({
  examTitleOverride: z.string().trim().max(120).nullable().optional(),
  academyNameOverride: z.string().trim().max(120).nullable().optional(),
  showStudentInfo: z.boolean().default(true),
  showSubjectNames: z.boolean().default(true),
  showTotalMarks: z.boolean().default(true),
  showObtainedMarks: z.boolean().default(true),
  showPercentage: z.boolean().default(true),
  showGrade: z.boolean().default(true),
  showResultStatus: z.boolean().default(true),
  showTeacherRemarks: z.boolean().default(true),
  showPerformanceBatch: z.boolean().default(true),
  showCustomFields: z.boolean().default(true),
  showClassPosition: z.boolean().default(false),
  positionMode: z.enum(RESULT_CARD_POSITION_MODES).default('HIDDEN'),
})

export type ResultCardConfig = z.infer<typeof resultCardConfigSchema>

export const DEFAULT_RESULT_CARD_CONFIG: ResultCardConfig = {
  examTitleOverride: null,
  academyNameOverride: null,
  showStudentInfo: true,
  showSubjectNames: true,
  showTotalMarks: true,
  showObtainedMarks: true,
  showPercentage: true,
  showGrade: true,
  showResultStatus: true,
  showTeacherRemarks: true,
  showPerformanceBatch: true,
  showCustomFields: true,
  showClassPosition: false,
  positionMode: 'HIDDEN',
}

/** Normalize an API/database value and enforce the safe default of no rank. */
export function parseResultCardConfig(value: unknown): ResultCardConfig {
  const parsed = resultCardConfigSchema.safeParse(value ?? {})
  if (!parsed.success) return DEFAULT_RESULT_CARD_CONFIG
  const config = { ...DEFAULT_RESULT_CARD_CONFIG, ...parsed.data }
  if (!config.showClassPosition) config.positionMode = 'HIDDEN'
  return config
}

export function getDisplayedPosition(
  configValue: unknown,
  systemPosition: number | null | undefined,
  manualPosition: number | null | undefined,
): number | null {
  const config = parseResultCardConfig(configValue)
  if (!config.showClassPosition) return null
  const value = config.positionMode === 'MANUAL' ? manualPosition : systemPosition
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null
}

export function toNumericMark(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(String(value))
  return Number.isFinite(numeric) ? numeric : null
}

export function formatExamSessionLabel(value: unknown): string {
  const raw = String(value ?? '').trim()
  if (!raw) return 'Official Result Card'
  return raw
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase())
}
