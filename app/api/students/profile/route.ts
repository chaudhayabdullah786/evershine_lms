import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET() {
  try {
    const session = await auth()
    if (!session || session.user.role !== 'STUDENT') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      include: {
        campus: { select: { name: true, code: true } },
        class: { select: { name: true, grade: true, shift: true } },
        batch: { select: { name: true, code: true } },
        house: { select: { name: true, color: true } },
        guardians: true
      }
    })

    if (!student) {
      return NextResponse.json({ success: false, error: 'Student profile not found' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      data: student
    })
  } catch (error) {
    console.error('[STUDENT_PROFILE_GET]', error)
    return NextResponse.json({ success: false, error: 'Failed to fetch student profile' }, { status: 500 })
  }
}
