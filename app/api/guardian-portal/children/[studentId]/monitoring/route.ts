import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { assertGuardianAccessToStudent } from '@/lib/academic/guardian'
import { buildStudentMonitoringReport, type MonitoringReportKind } from '@/lib/academic/monitoring-report-service'

export const dynamic = 'force-dynamic'

function parseType(value: string | null): MonitoringReportKind {
  return value === 'yearly' || value === 'monthly' || value === 'daily' ? value : 'daily'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!['PARENT', 'GUARDIAN', 'SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
    return errors.forbidden()
  }

  const { studentId } = await params
  if (['PARENT', 'GUARDIAN'].includes(session.user.role)) {
    const allowed = await assertGuardianAccessToStudent(session.user.id, studentId)
    if (!allowed) return errors.forbidden('You can only view your linked children')
  }

  const { searchParams } = new URL(request.url)
  const type = parseType(searchParams.get('type'))
  const month = Number(searchParams.get('month')) || null
  const year = Number(searchParams.get('year')) || null

  const report = await buildStudentMonitoringReport(studentId, {
    type,
    date: searchParams.get('date'),
    month,
    year,
  })

  return successResponse(report)
}
