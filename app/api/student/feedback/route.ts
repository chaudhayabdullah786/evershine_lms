import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { z } from 'zod'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || session.user.role !== 'STUDENT') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the active student profile and their active enrollment
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            classSection: {
              include: {
                subjectOfferings: {
                  where: { teacherId: { not: null } },
                  include: { teacher: true, subject: true }
                }
              }
            }
          }
        }
      }
    })

    if (!student || student.enrollments.length === 0) {
      return NextResponse.json({ error: 'Student enrollment not found' }, { status: 404 })
    }

    const enrollment = student.enrollments[0]
    
    // Find the current open cycle
    const now = new Date()
    const cycle = await prisma.monthlyFeedbackCycle.findFirst({
      where: {
        isOpen: true,
        opensAt: { lte: now },
        OR: [
          { closesAt: null },
          { closesAt: { gte: now } }
        ]
      },
      orderBy: { createdAt: 'desc' }
    })

    if (!cycle) {
      return NextResponse.json({ openCycle: null, isBlocked: false })
    }

    // Check if the student has already submitted
    const submission = await prisma.studentFeedbackSubmission.findUnique({
      where: {
        cycleId_submitterUserId: {
          cycleId: cycle.id,
          submitterUserId: session.user.id
        }
      }
    })

    // Determine if blocked (for example, we block immediately if cycle is open and no submission, or in the last 5 days. For now, if open and unsubmitted = block)
    const isBlocked = !submission

    if (!isBlocked) {
      return NextResponse.json({ openCycle: cycle, submitted: true, isBlocked: false })
    }

    // Extract unique teachers from subject offerings
    const teachersMap = new Map()
    enrollment.classSection.subjectOfferings.forEach(offering => {
      if (offering.teacher) {
        if (!teachersMap.has(offering.teacher.id)) {
          teachersMap.set(offering.teacher.id, {
            id: offering.teacher.id,
            firstName: offering.teacher.firstName,
            lastName: offering.teacher.lastName,
            subjects: []
          })
        }
        teachersMap.get(offering.teacher.id).subjects.push(offering.subject.name)
      }
    })
    const teachers = Array.from(teachersMap.values())

    // Fetch all active questions
    const questions = await prisma.feedbackQuestion.findMany({
      where: { isActive: true },
      orderBy: { orderIndex: 'asc' }
    })

    return NextResponse.json({
      openCycle: cycle,
      submitted: false,
      isBlocked: true,
      teachers,
      questions
    })
  } catch (error) {
    console.error('Feedback GET Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

const FeedbackPayloadSchema = z.object({
  cycleId: z.string(),
  answers: z.array(z.object({
    questionId: z.string(),
    targetTeacherId: z.string().optional().nullable(),
    response: z.enum(['STRONGLY_AGREE', 'AGREE', 'NEUTRAL', 'DISAGREE'])
  })),
  // suggestions: Record<sectionKey, text> — one freetext comment per feedback section
  suggestions: z.record(z.string()).optional().nullable()
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id || (session.user.role !== 'STUDENT' && session.user.role !== 'PARENT')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const json = await request.json()
    const parsed = FeedbackPayloadSchema.parse(json)

    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      include: {
        enrollments: {
          where: { status: 'ACTIVE' }
        }
      }
    })

    if (!student || student.enrollments.length === 0) {
      return NextResponse.json({ error: 'Student not enrolled' }, { status: 400 })
    }

    const enrollment = student.enrollments[0]

    // Verify cycle is open
    const cycle = await prisma.monthlyFeedbackCycle.findUnique({
      where: { id: parsed.cycleId }
    })

    if (!cycle || !cycle.isOpen) {
      return NextResponse.json({ error: 'Feedback cycle is closed or invalid' }, { status: 400 })
    }

    // Create the submission atomically
    await prisma.$transaction(async (tx) => {
      // Resolve real campusId / batchId from classSection upfront
      const section = await tx.classSection.findUnique({ where: { id: enrollment.classSectionId } })

      const submission = await tx.studentFeedbackSubmission.create({
        data: {
          cycleId: cycle.id,
          studentId: student.id,
          studentEnrollmentId: enrollment.id,
          submitterUserId: session.user.id,
          submitterRole: 'STUDENT',
          campusId: section?.campusId ?? enrollment.classSectionId,
          batchId: section?.batchId ?? 'N/A',
          // Persist section-level suggestions as JSON for Admin review
          suggestions: parsed.suggestions ?? undefined,
        }
      })

      // Create answers
      const answersData = parsed.answers.map(ans => ({
        submissionId: submission.id,
        questionId: ans.questionId,
        targetTeacherId: ans.targetTeacherId || null,
        response: ans.response
      }))

      await tx.feedbackAnswer.createMany({
        data: answersData
      })
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Feedback POST Error:', error)
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'You have already submitted feedback for this cycle' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
