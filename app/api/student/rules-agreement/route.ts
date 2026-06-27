import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ rulesAccepted: true }) // only students need to agree
    }

    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { rulesAccepted: true }
    })

    if (!student) {
      return NextResponse.json({ error: 'Student profile not found' }, { status: 404 })
    }

    return NextResponse.json({ rulesAccepted: student.rulesAccepted })
  } catch (error) {
    console.error('Rules agreement GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Update rulesAccepted to true
    const student = await prisma.student.update({
      where: { userId: session.user.id },
      data: { rulesAccepted: true }
    })

    // Log the agreement event — WHY: Provides an auditable record of when the student
    // acknowledged institutional policies; critical for any future dispute resolution.
    await prisma.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'ACCEPT_TERMS',
        entityType: 'Student',
        entityId: student.id,
        changes: {
          rulesAccepted: { before: false, after: true },
          acceptedAt: new Date().toISOString(),
        },
        ipAddress: request.headers.get('x-forwarded-for') ?? request.headers.get('x-real-ip') ?? 'Unknown',
        userAgent: request.headers.get('user-agent') ?? 'Unknown',
      }
    })

    return NextResponse.json({ success: true, rulesAccepted: student.rulesAccepted })
  } catch (error) {
    console.error('Rules agreement POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
