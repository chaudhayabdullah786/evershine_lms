/**
 * GET /api/teacher-portal/sections
 *
 * Returns class sections assigned to the teacher.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access sections')

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return successResponse([])

    const sections = await prisma.classSection.findMany({
      where: {
        isActive: true,
        subjectOfferings: {
          some: { teacherId: teacher.id }
        }
      },
      select: {
        id: true,
        className: true,
        sectionName: true,
      }
    })

    return successResponse(sections)
  } catch (err) {
    console.error('[TEACHER_SECTIONS_GET]', err)
    return errors.internal()
  }
}
