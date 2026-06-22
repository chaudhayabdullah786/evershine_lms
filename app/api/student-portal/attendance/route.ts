import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'

/** Student read-only attendance for current academic year enrollment. */
export async function GET() {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'STUDENT') return errors.forbidden()

  const student = await prisma.student.findUnique({ where: { userId: session.user.id } })
  if (!student) return errors.notFound('Student')

  const activeYear = await getActiveAcademicYear()
  if (!activeYear) {
    return successResponse({ records: [], summary: null, academicYear: null })
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: { studentId: student.id, academicYearId: activeYear.id, status: 'ACTIVE' },
  })
  if (!enrollments.length) {
    return successResponse({ records: [], summary: null, academicYear: activeYear })
  }

  const records = await prisma.enrollmentAttendanceRecord.findMany({
    where: { studentEnrollmentId: { in: enrollments.map((e) => e.id) } },
    orderBy: { attendanceDate: 'desc' },
    take: 120,
  })

  const summary = {
    present: records.filter((r) => r.status === 'PRESENT').length,
    absent: records.filter((r) => r.status === 'ABSENT').length,
    late: records.filter((r) => r.status === 'LATE').length,
    excused: records.filter((r) => r.status === 'EXCUSED').length,
    total: records.length,
  }

  const attendancePct =
    summary.total > 0
      ? Math.round(((summary.present + summary.late + summary.excused) / summary.total) * 100)
      : null

  return successResponse({
    academicYear: activeYear,
    enrollmentId: enrollments[0].id,
    records,
    summary: { ...summary, attendancePct },
  })
}

