/**
 * GET /api/guardian/wards/[studentId]/attendance
 * Returns attendance breakdown for a specific ward.
 * Accepts optional ?month=YYYY-MM parameter.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { assertGuardianOwnsStudent } from '@/lib/guardian/assert-ownership'
import { guardianAttendanceQuerySchema } from '@/lib/validation/guardian'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'GUARDIAN') return errors.forbidden()

  const { studentId } = await params
  
  try {
    await assertGuardianOwnsStudent(session.user.id, studentId)
  } catch (error: any) {
    return errors.forbidden(error.message)
  }

  const { searchParams } = new URL(request.url)
  const parsed = guardianAttendanceQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const monthParam = parsed.data.month
  
  let startDate: Date
  let endDate: Date

  if (monthParam) {
    const [year, month] = monthParam.split('-').map(Number)
    startDate = new Date(year, month - 1, 1)
    endDate = new Date(year, month, 0) // last day of month
  } else {
    // Default to current month
    const now = new Date()
    startDate = new Date(now.getFullYear(), now.getMonth(), 1)
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  }

  const attendance = await prisma.studentAttendance.findMany({
    where: {
      studentId,
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: 'asc' },
  })

  // Calculate summary metrics
  const summary = {
    present: 0,
    absent: 0,
    late: 0,
    leave: 0,
    total: attendance.length,
  }

  for (const record of attendance) {
    if (record.status === 'PRESENT') summary.present++
    else if (record.status === 'ABSENT') summary.absent++
    else if (record.status === 'LATE') summary.late++
    else if (record.status === 'LEAVE') summary.leave++
  }

  return successResponse({
    summary,
    records: attendance,
    period: {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
    },
  })
}
