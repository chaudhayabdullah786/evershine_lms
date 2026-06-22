import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { z } from 'zod'

const postSchema = z.object({
  assessmentId: z.string().cuid(),
  scores: z.array(
    z.object({
      studentEnrollmentId: z.string().cuid(),
      obtainedMarks: z.number().min(0),
    })
  ),
})

/** Teacher grade entry: list offerings/assessments or submit bulk marks. */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden()

  const teacher = await prisma.teacher.findUnique({ where: { userId: session.user.id } })
  if (!teacher) return errors.notFound('Teacher')

  const assessmentId = new URL(request.url).searchParams.get('assessmentId')
  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return successResponse({ academicYear: null, offerings: [], assessment: null, roster: [] })

  const offerings = await prisma.subjectOffering.findMany({
    where: {
      academicYearId: activeYear.id,
      teacherId: teacher.id,
    },
    include: {
      subject: true,
      classSection: { select: { id: true, className: true, sectionName: true } },
    },
  })

  if (!assessmentId) {
    const schemes = offerings.length > 0 ? await prisma.academicGradingScheme.findMany({
      where: {
        academicYearId: activeYear.id,
        OR: offerings.map((o) => ({
          classSectionId: o.classSectionId,
          subjectId: o.subjectId,
        })),
      },
      include: {
        components: { include: { assessments: { orderBy: { dueDate: 'asc' } } } },
        subject: true,
      },
    }) : []
    return successResponse({ academicYear: activeYear, offerings, schemes })
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      gradingComponent: {
        include: {
          gradingScheme: { include: { subject: true, classSection: true } },
        },
      },
      scores: true,
    },
  })
  if (!assessment) return errors.notFound('Assessment')

  const scheme = assessment.gradingComponent.gradingScheme
  if (scheme.classSectionId) {
    const owns = offerings.some(
      (o) => o.classSectionId === scheme.classSectionId && o.subjectId === scheme.subjectId
    )
    if (!owns) return errors.forbidden('You are not assigned to this subject')
  }

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      academicYearId: activeYear.id,
      classSectionId: scheme.classSectionId,
      status: 'ACTIVE',
      subjectEnrollments: {
        some: {
          status: 'APPROVED',
          subjectOffering: { subjectId: scheme.subjectId },
        },
      },
    },
    include: {
      student: { select: { firstName: true, lastName: true, rollNumber: true } },
    },
    orderBy: { rollNumber: 'asc' },
  })

  const roster = enrollments.map((e) => {
    const existing = assessment.scores.find((s) => s.studentEnrollmentId === e.id)
    return {
      studentEnrollmentId: e.id,
      rollNumber: e.rollNumber,
      student: e.student,
      obtainedMarks: existing?.obtainedMarks ?? null,
      scoreId: existing?.id ?? null,
    }
  })

  return successResponse({
    academicYear: activeYear,
    assessment: {
      id: assessment.id,
      title: assessment.title,
      dueDate: assessment.dueDate,
      maxMarks: assessment.gradingComponent.maxMarks,
      componentName: assessment.gradingComponent.name,
      schemePublished: scheme.isPublished,
      subject: scheme.subject,
      classSection: scheme.classSection,
    },
    roster,
  })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden()

  const teacher = await prisma.teacher.findUnique({ where: { userId: session.user.id } })
  if (!teacher) return errors.notFound('Teacher')

  const parsed = postSchema.safeParse(await request.json())
  if (!parsed.success) return errors.validation(parsed.error)

  const assessment = await prisma.assessment.findUnique({
    where: { id: parsed.data.assessmentId },
    include: {
      gradingComponent: { include: { gradingScheme: true } },
    },
  })
  if (!assessment) return errors.notFound('Assessment')

  if (assessment.gradingComponent.gradingScheme.isPublished) {
    return errors.forbidden('Cannot edit marks after results are published')
  }

  const maxMarks = assessment.gradingComponent.maxMarks
  for (const s of parsed.data.scores) {
    if (s.obtainedMarks > maxMarks) {
      return errors.validation({
        errors: [{ path: ['obtainedMarks'], message: `Marks cannot exceed ${maxMarks}` }],
      } as never)
    }
  }

  const offering = await prisma.subjectOffering.findFirst({
    where: {
      teacherId: teacher.id,
      subjectId: assessment.gradingComponent.gradingScheme.subjectId,
      classSectionId: assessment.gradingComponent.gradingScheme.classSectionId,
    },
  })
  if (!offering) return errors.forbidden('Not your assigned subject')

  const saved = await prisma.$transaction(async (tx) => {
    const rows = []
    for (const s of parsed.data.scores) {
      const row = await tx.assessmentScore.upsert({
        where: {
          assessmentId_studentEnrollmentId: {
            assessmentId: parsed.data.assessmentId,
            studentEnrollmentId: s.studentEnrollmentId,
          },
        },
        create: {
          assessmentId: parsed.data.assessmentId,
          studentEnrollmentId: s.studentEnrollmentId,
          obtainedMarks: s.obtainedMarks,
        },
        update: { obtainedMarks: s.obtainedMarks },
      })
      rows.push(row)
    }
    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'AssessmentScore',
        entityId: parsed.data.assessmentId,
        changes: { count: rows.length },
      },
    })
    return rows
  })

  return successResponse(saved, 'Marks saved')
}
