/**
 * GET /api/academic-upgrades/comparison
 *
 * Feature 7: Monthly Test Results Side-by-Side Comparison Report.
 * Returns aggregate pass/fail/avg statistics and per-student percentage
 * deltas between two exam sessions for the same class section.
 *
 * Query parameters (all required):
 *   classSectionId        — target section
 *   currentExamSessionId  — the later / current term
 *   previousExamSessionId — the earlier / previous term
 *
 * Authorization: Any role with results.read access.
 */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { AcademicUpgradesService } from '@/lib/services/academic-upgrades-service'
import { comparisonQuerySchema } from '@/lib/validation/academic-upgrades'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'results', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)

  const parsed = comparisonQuerySchema.safeParse({
    classSectionId:        searchParams.get('classSectionId'),
    currentExamSessionId:  searchParams.get('currentExamSessionId'),
    previousExamSessionId: searchParams.get('previousExamSessionId'),
  })

  if (!parsed.success) return errors.validation(parsed.error)

  const { classSectionId, currentExamSessionId, previousExamSessionId } = parsed.data

  try {
    const report = await AcademicUpgradesService.getMonthlyTestComparisonReport(
      classSectionId,
      currentExamSessionId,
      previousExamSessionId,
    )
    return successResponse(report)
  } catch (err: any) {
    return errors.badRequest(err.message ?? 'Failed to generate comparison report.')
  }
}
