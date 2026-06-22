/**
 * GET  /api/teacher-portal/results
 *   — Lists all TermResults for the authenticated teacher's sections.
 *   Query: ?classSectionId&examSessionId&status=DRAFT|DECLARED
 *
 * POST /api/teacher-portal/results
 *   — Creates or upserts a TermResult + SubjectResults for a student.
 *   Body: { studentId, classSectionId, examSessionId, subjectResults[], teacherRemarks? }
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { derivePerformanceBatch, deriveGrade, deriveResultStatus } from '@/lib/academic/result-utils'
import { errors, successResponse, createdResponse } from '@/lib/api-response'

// ── Input validation ──────────────────────────────────────────────────────────

const subjectResultSchema = z.object({
  subjectOfferingId: z.string().min(1),
  totalMarks: z.number().int().positive(),
  obtainedMarks: z.number().min(0).nullable(), // null = Input Decide Later
  isAbsent: z.boolean().default(false),
  isNotApplicable: z.boolean().default(false),
  remarks: z.string().max(500).optional(),
})

const createResultSchema = z.object({
  studentId: z.string().min(1),
  classSectionId: z.string().min(1),
  examSessionId: z.string().min(1),
  teacherRemarks: z.string().max(1000).optional(),
  subjectResults: z.array(subjectResultSchema).min(1),
})

// ── GET Handler ───────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { searchParams } = new URL(req.url)
    const classSectionId = searchParams.get('classSectionId')
    const examSessionId = searchParams.get('examSessionId')
    const status = searchParams.get('status')

    const offerings = await prisma.subjectOffering.findMany({
      where: { teacherId: teacher.id },
      select: { classSectionId: true },
      distinct: ['classSectionId'],
    })
    const allowedSectionIds = offerings.map((o) => o.classSectionId)

    const results = await prisma.termResult.findMany({
      where: {
        ...(classSectionId ? { classSectionId } : {}),
        ...(examSessionId ? { examSessionId } : {}),
        ...(status ? { declarationStatus: status as 'DRAFT' | 'DECLARED' } : {}),
        ...(allowedSectionIds ? { classSectionId: { in: allowedSectionIds } } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fatherName: true,
            rollNumber: true,
            registrationNumber: true,
          },
        },
        classSection: {
          select: { className: true, sectionName: true },
        },
        subjectResults: {
          include: {
            subjectOffering: {
              include: { subject: { select: { name: true, code: true } } },
            },
          },
        },
        declaredBy: {
          select: { id: true, email: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    return successResponse(results)
  } catch (err) {
    console.error('[TEACHER_RESULTS_GET]', err)
    return errors.internal()
  }
}

// ── POST Handler ──────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const body = await req.json()
    const parsed = createResultSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation(parsed.error)
    }

    const { studentId, classSectionId, examSessionId, teacherRemarks, subjectResults } = parsed.data

    // Guard: Teacher may only post results for sections they teach
    const offering = await prisma.subjectOffering.findFirst({
      where: { classSectionId, teacherId: teacher.id },
    })
    if (!offering) return errors.forbidden('Not assigned to this section')

    // Compute aggregates from provided subject results
    const validResults = subjectResults.filter(
      (sr) => !sr.isAbsent && !sr.isNotApplicable && sr.obtainedMarks !== null
    )
    const totalObtained = validResults.reduce((sum, sr) => sum + (sr.obtainedMarks ?? 0), 0)
    const totalPossible = validResults.reduce((sum, sr) => sum + sr.totalMarks, 0)
    const overallPercentage =
      totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 100 * 100) / 100 : 0
    const grade = deriveGrade(overallPercentage)
    const performanceBatch = derivePerformanceBatch(overallPercentage)

    // Upsert TermResult + SubjectResults atomically
    const result = await prisma.$transaction(async (tx) => {
      const termResult = await tx.termResult.upsert({
        where: {
          studentId_classSectionId_examSessionId: {
            studentId,
            classSectionId,
            examSessionId,
          },
        },
        create: {
          studentId,
          classSectionId,
          examSessionId,
          overallPercentage,
          grade,
          performanceBatch,
          teacherRemarks: teacherRemarks ?? null,
          teacherId: teacher.id,
          customFields: null,
          declarationStatus: 'DRAFT',
        },
        update: {
          overallPercentage,
          grade,
          performanceBatch,
          teacherRemarks: teacherRemarks ?? undefined,
          teacherId: teacher.id,
          updatedAt: new Date(),
        },
      })

      // Upsert each SubjectResult
      for (const sr of subjectResults) {
        const percentage =
          !sr.isAbsent && !sr.isNotApplicable && sr.obtainedMarks !== null && sr.totalMarks > 0
            ? Math.round((sr.obtainedMarks / sr.totalMarks) * 100 * 100) / 100
            : null

        const resultStatus = deriveResultStatus({
          isAbsent: sr.isAbsent,
          isNotApplicable: sr.isNotApplicable,
          obtainedMarks: sr.obtainedMarks,
          totalMarks: sr.totalMarks,
        })

        const subjectGrade = percentage !== null ? deriveGrade(percentage) : null
        const subjectBatch = percentage !== null ? derivePerformanceBatch(percentage) : null

        await tx.subjectResult.upsert({
          where: {
            termResultId_subjectOfferingId: {
              termResultId: termResult.id,
              subjectOfferingId: sr.subjectOfferingId,
            },
          },
          create: {
            termResultId: termResult.id,
            subjectOfferingId: sr.subjectOfferingId,
            totalMarks: sr.totalMarks,
            obtainedMarks: sr.obtainedMarks,
            isAbsent: sr.isAbsent,
            isNotApplicable: sr.isNotApplicable,
            percentage,
            grade: subjectGrade,
            resultStatus,
            performanceBatch: subjectBatch,
            remarks: sr.remarks ?? null,
          },
          update: {
            totalMarks: sr.totalMarks,
            obtainedMarks: sr.obtainedMarks,
            isAbsent: sr.isAbsent,
            isNotApplicable: sr.isNotApplicable,
            percentage,
            grade: subjectGrade,
            resultStatus,
            performanceBatch: subjectBatch,
            remarks: sr.remarks ?? undefined,
            updatedAt: new Date(),
          },
        })
      }

      // Recalculate class positions for this section+exam (runs inside tx)
      await recalculatePositions(tx, classSectionId, examSessionId)

      return tx.termResult.findUnique({
        where: { id: termResult.id },
        include: { subjectResults: true },
      })
    })

    return createdResponse(result)
  } catch (err) {
    console.error('[TEACHER_RESULTS_POST]', err)
    return errors.internal()
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function recalculatePositions(
  tx: Prisma.TransactionClient,
  classSectionId: string,
  examSessionId: string
): Promise<void> {
  const declared = await tx.termResult.findMany({
    where: {
      classSectionId,
      examSessionId,
      declarationStatus: 'DECLARED',
    },
    select: { id: true, overallPercentage: true },
  })

  const sorted = [...declared].sort((a, b) =>
    Number(b.overallPercentage) - Number(a.overallPercentage)
  )

  for (let i = 0; i < sorted.length; i++) {
    await tx.termResult.update({
      where: { id: sorted[i].id },
      data: { classPosition: i + 1 },
    })
  }
}
