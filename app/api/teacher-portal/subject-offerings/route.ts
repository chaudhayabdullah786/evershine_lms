/**
 * GET /api/teacher-portal/subject-offerings
 *
 * Returns active subject offerings assigned to the requesting teacher,
 * including class section and subject details.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access subject offerings')

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return successResponse([])

    const activeYear = await getActiveAcademicYear()
    if (!activeYear) return successResponse([])

    const offerings = await prisma.subjectOffering.findMany({
      where: {
        teacherId: teacher.id,
        academicYearId: activeYear.id,
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        classSection: {
          select: {
            id: true,
            className: true,
            sectionName: true,
          },
        },
      },
      orderBy: [
        { classSection: { className: 'asc' } },
        { classSection: { sectionName: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    })

    return successResponse(offerings)
  } catch (err) {
    console.error('[TEACHER_OFFERINGS_GET]', err)
    return errors.internal()
  }
}
