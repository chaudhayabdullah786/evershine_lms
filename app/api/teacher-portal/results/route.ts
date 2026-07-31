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
import { getTeacherClassSectionIds, teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'

// ── Input validation ──────────────────────────────────────────────────────────

const subjectResultSchema = z.object({
  subjectOfferingId: z.string().min(1),
  totalMarks: z.number().int().positive(),
  obtainedMarks: z.number().min(0).nullable(),
  isAbsent: z.boolean().default(false),
  isNotApplicable: z.boolean().default(false),
  remarks: z.string().max(500).optional(),
}).superRefine((value, ctx) => {
  if (value.isAbsent && value.isNotApplicable) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['isNotApplicable'],
      message: 'A subject cannot be marked both Absent and N/A.',
    })
  }

  if (value.obtainedMarks !== null && value.obtainedMarks > value.totalMarks) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['obtainedMarks'],
      message: 'Obtained marks cannot exceed total marks.',
    })
  }
})

const createResultSchema = z.object({
  studentId: z.string().min(1),
  classSectionId: z.string().min(1),
  examSessionId: z.string().min(1),
  teacherRemarks: z.string().max(1000).optional(),
  subjectResults: z.array(subjectResultSchema).min(1),
})

function errorMentionsColumn(error: unknown, columnName: string): boolean {
  if (!error || typeof error !== 'object') return false

  const withMeta = error as {
    code?: string
    meta?: { column?: unknown; field_name?: unknown; target?: unknown }
    message?: string
  }
  const metaValues = [
    withMeta.meta?.column,
    withMeta.meta?.field_name,
    withMeta.meta?.target,
  ].filter(Boolean).map(String)

  return (
    withMeta.code === 'P2022' && metaValues.some((value) => value.includes(columnName))
  ) || String(withMeta.message ?? '').includes(columnName)
}

const termResultListSelect = {
  id: true,
  studentId: true,
  classSectionId: true,
  examSessionId: true,
  declarationStatus: true,
  overallPercentage: true,
  grade: true,
  performanceBatch: true,
  classPosition: true,
  teacherRemarks: true,
  customFields: true,
  declaredAt: true,
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
} satisfies Prisma.TermResultSelect

const legacySafeTermResultListSelect = {
  ...termResultListSelect,
  declaredAt: false,
} satisfies Prisma.TermResultSelect

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

    const allowedSectionIds = await getTeacherClassSectionIds(teacher.id)
    if (allowedSectionIds.length === 0) return successResponse([])
    if (classSectionId && !allowedSectionIds.includes(classSectionId)) {
      return errors.forbidden('You are not assigned to this class section')
    }

    const where: Prisma.TermResultWhereInput = {
      classSectionId: { in: classSectionId ? [classSectionId] : allowedSectionIds },
      ...(examSessionId ? { examSessionId } : {}),
      ...(status ? { declarationStatus: status as 'DRAFT' | 'DECLARED' } : {}),
    }
    const orderBy = { createdAt: 'desc' } satisfies Prisma.TermResultOrderByWithRelationInput

    let results
    try {
      results = await prisma.termResult.findMany({
        where,
        select: termResultListSelect,
        orderBy,
      })
    } catch (error) {
      if (!errorMentionsColumn(error, 'declaredAt') && !errorMentionsColumn(error, 'declaredById')) {
        throw error
      }

      console.warn('[TEACHER_RESULTS_GET_SCHEMA_FALLBACK]', error)
      const legacyResults = await prisma.termResult.findMany({
        where,
        select: legacySafeTermResultListSelect,
        orderBy,
      })
      results = legacyResults.map((result) => ({ ...result, declaredAt: null }))
    }

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
    const normalizedSubjectResults = subjectResults.map((subjectResult) => ({
      ...subjectResult,
      obtainedMarks: subjectResult.isAbsent || subjectResult.isNotApplicable ? null : subjectResult.obtainedMarks,
    }))

    const enrollment = await prisma.studentEnrollment.findFirst({
      where: {
        studentId,
        classSectionId,
        status: 'ACTIVE',
      },
      select: { id: true },
    })
    if (!enrollment) {
      return errors.badRequest('Selected student is not actively enrolled in this class section.')
    }

    const canAccessSection = await teacherCanAccessClassSection(teacher.id, classSectionId)
    if (!canAccessSection) {
      return errors.forbidden('You are not assigned to this class section.')
    }

    const offeringIds = [...new Set(normalizedSubjectResults.map((sr) => sr.subjectOfferingId))]
    const teacherAssignedOfferings = await prisma.subjectOffering.findMany({
      where: { classSectionId, teacherId: teacher.id },
      select: { id: true },
    })
    const teacherAssignedOfferingIds = new Set(teacherAssignedOfferings.map((offering) => offering.id))
    const validOfferings = await prisma.subjectOffering.findMany({
      where: {
        id: { in: offeringIds },
        classSectionId,
        ...(teacherAssignedOfferings.length > 0 ? { teacherId: teacher.id } : {}),
      },
      select: { id: true },
    })
    if (validOfferings.length !== offeringIds.length) {
      return errors.forbidden(
        teacherAssignedOfferingIds.size > 0
          ? 'One or more selected subjects are not assigned to you for this section.'
          : 'One or more selected subjects do not belong to this section.'
      )
    }

    // Compute aggregates from provided subject results
    const validResults = normalizedSubjectResults.filter(
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
      for (const sr of normalizedSubjectResults) {
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
