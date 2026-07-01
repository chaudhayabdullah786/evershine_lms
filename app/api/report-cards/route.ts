import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { buildReportCardForEnrollment } from '@/lib/academic/report-card'
import { assertGuardianAccessToStudent } from '@/lib/academic/guardian'
import type { Role } from '@prisma/client'

/** GET ?studentEnrollmentId= | ?classSectionId=&academicYearId= */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const params = new URL(request.url).searchParams
  const studentEnrollmentId = params.get('studentEnrollmentId')
  const classSectionId = params.get('classSectionId')
  const academicYearId = params.get('academicYearId')

  if (studentEnrollmentId) {
    const enrollment = await prisma.studentEnrollment.findUnique({
      where: { id: studentEnrollmentId },
      include: { student: { select: { userId: true, id: true } } },
    })
    if (!enrollment) return errors.notFound('Enrollment')

    if (session.user.role === 'STUDENT') {
      const own = await prisma.student.findUnique({ where: { userId: session.user.id } })
      if (!own || own.id !== enrollment.studentId) return errors.forbidden()
    } else if (['PARENT', 'GUARDIAN'].includes(session.user.role)) {
      const ok = await assertGuardianAccessToStudent(session.user.id, enrollment.studentId)
      if (!ok) return errors.forbidden()
    } else {
      const denied = requirePermission(session.user.role as Role, 'grading_engine', 'read')
      if (denied) return denied
    }

    const card = await buildReportCardForEnrollment(studentEnrollmentId)
    if (!card) return errors.notFound('Report card data')
    if (card.subjects.length === 0) {
      return errors.forbidden('No published results for this student yet')
    }
    return successResponse(card)
  }

  const denied = requirePermission(session.user.role as Role, 'grading_engine', 'read')
  if (denied) return denied

  if (!classSectionId || !academicYearId) {
    return errors.validation({
      errors: [{ path: ['classSectionId'], message: 'classSectionId and academicYearId required for class export' }],
    } as never)
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      classSectionId,
      academicYearId,
      status: { in: ['ACTIVE', 'PROMOTED', 'RETAINED', 'TRANSFERRED', 'GRADUATED'] },
    },
    orderBy: { rollNumber: 'asc' },
  })

  const cards = []
  for (const e of enrollments) {
    const card = await buildReportCardForEnrollment(e.id)
    if (card && card.subjects.length > 0) {
      cards.push({ enrollmentId: e.id, ...card })
    }
  }

  return successResponse({ count: cards.length, cards })
}
