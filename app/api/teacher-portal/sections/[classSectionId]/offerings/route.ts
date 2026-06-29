/**
 * GET /api/teacher-portal/sections/[classSectionId]/offerings
 *
 * Returns subjects taught by the teacher in a given section.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ classSectionId: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return successResponse([])

    const { classSectionId } = await params

    const offerings = await prisma.subjectOffering.findMany({
      where: {
        classSectionId,
        teacherId: teacher.id,
      },
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    })

    return successResponse(offerings)
  } catch (err) {
    console.error('[TEACHER_SECTION_OFFERINGS_GET]', err)
    return errors.internal()
  }
}
