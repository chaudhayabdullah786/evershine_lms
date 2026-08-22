/**
 * POST /api/teacher-portal/results/[id]/undeclare
 *
 * Reverts a DECLARED TermResult back to DRAFT state.
 * Allows teachers to fix mistakes after publishing a result.
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params

    const termResult = await prisma.termResult.findUnique({
      where: { id },
      select: {
        id: true,
        classSectionId: true,
        declarationStatus: true,
      },
    })

    if (!termResult) return errors.notFound('Result')

    const canAccessSection = await teacherCanAccessClassSection(teacher.id, termResult.classSectionId)
    if (!canAccessSection) return errors.forbidden('You are not assigned to this class section')

    if (termResult.declarationStatus !== 'DECLARED') {
      return errors.badRequest('Result is not currently declared')
    }

    const undeclared = await prisma.termResult.update({
      where: { id },
      data: {
        declarationStatus: 'DRAFT',
      },
      select: {
        id: true,
        declarationStatus: true,
      },
    })

    return successResponse(undeclared, 'Result undeclared successfully and reverted to draft')
  } catch (err) {
    console.error('[RESULT_UNDECLARE]', err)
    return errors.internal()
  }
}
