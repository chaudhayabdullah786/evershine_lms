import type { NextRequest } from 'next/server'
import { errors } from '@/lib/api-response'
import { isAcademicEnginePrimary } from '@/lib/academic/config'

const MIGRATION_HINTS: Record<string, string> = {
  attendance: 'Use POST /api/enrollment-attendance for section attendance, or open /dashboard/attendance/sections.',
  timetable: 'Use /api/timetable/slots and Academic Engine → Timetable, or set LEGACY_API_ENABLED=true.',
}

/**
 * Blocks legacy Class-based attendance/timetable mutations for admins when the
 * academic engine is primary. Teachers may still use legacy APIs until migrated.
 * Legacy UI sends X-Legacy-Academic-Client: 1; set LEGACY_API_ENABLED=true to allow all.
 */
export function guardLegacyClassMutation(
  request: NextRequest,
  scope: 'attendance' | 'timetable',
  role: string
) {
  if (process.env.LEGACY_API_ENABLED === 'true') return null
  if (!isAcademicEnginePrimary()) return null
  // If the request is NOT from a legacy client, allow it (modern Academic Engine)
  if (request.headers.get('x-legacy-academic-client') !== '1') return null
  if (role === 'TEACHER' || role === 'STUDENT') return null

  return errors.legacyDeprecated(
    `Legacy ${scope} API is disabled for administrators.`,
    MIGRATION_HINTS[scope]
  )
}
