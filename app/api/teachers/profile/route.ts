import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'TEACHER') {
      return errors.unauthorized()
    }

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      include: {
        campus: { select: { name: true, code: true } },
        batch: { select: { name: true } },
        classes: { include: { class: { select: { name: true, grade: true, section: true, shift: true } } } },
        // WHY: classSections is needed so the timetable page can derive the teacher's
        // shift (MORNING/EVENING/NIGHT) and pass it as a query param to the
        // timetable API, ensuring night-shift slots are not silently filtered out.
        timetableSlots: {
          where: { isPublished: true },
          take: 1,
          include: {
            classSection: {
              select: { shift: { select: { code: true } } }
            }
          }
        }
      }
    })

    if (!teacher) {
      return errors.notFound('Teacher profile')
    }

    return successResponse(teacher)
  } catch (error) {
    console.error('[TEACHER_PROFILE_GET]', error)
    return errors.internal()
  }
}
