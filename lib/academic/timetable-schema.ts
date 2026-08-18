import { errors } from '@/lib/api-response'

/**
 * The timetable engine needs the additive columns introduced by the MySQL
 * reconciliation script. Keep this message actionable without exposing SQL or
 * database internals to the browser.
 */
export const TIMETABLE_SCHEMA_SYNC_MESSAGE =
  'Timetable storage is not up to date. Run the approved timetable schema reconciliation on the production database, then try again.'

export function isTimetableSchemaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const candidate = error as { code?: unknown; message?: unknown }
  const code = typeof candidate.code === 'string' ? candidate.code : ''
  const message = typeof candidate.message === 'string' ? candidate.message : ''

  // Prisma P2021/P2022 cover missing timetable tables/columns. The message
  // check is intentionally narrow so unrelated database errors remain 500s.
  return (
    code === 'P2021' ||
    (code === 'P2022' && /(TimetableSlot|TimetableTemplate|slotType|templateId)/i.test(message))
  )
}

export function timetablePersistenceError(error: unknown, operation: string) {
  console.error(`[TIMETABLE] ${operation} failed`, error)
  return isTimetableSchemaError(error)
    ? errors.schemaOutOfDate(TIMETABLE_SCHEMA_SYNC_MESSAGE)
    : errors.internal()
}
