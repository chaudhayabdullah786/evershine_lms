/**
 * PATCH /api/teacher-portal/results/[id]
 *   — Teacher edits a specific TermResult (marks, remarks, custom fields).
 *   Writes a RetroactiveScoreEditLog entry for audit.
 *
 * DELETE /api/teacher-portal/results/[id]
 *   — Resets TermResult back to DRAFT (soft reset, not DB delete).
 *   Only allowed when declarationStatus === 'DRAFT'.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { derivePerformanceBatch, deriveGrade, deriveResultStatus } from '@/lib/academic/result-utils'
import { errors, successResponse } from '@/lib/api-response'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { resolveClassContext } from '@/lib/teacher-access'

async function resolveTeacherSubjectScope(teacherId: string, classSectionId: string) {
  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return { canManageAll: true, allowedOfferingIds: null as Set<string> | null }

  const offerings = await prisma.subjectOffering.findMany({
    where: { classSectionId, academicYearId: activeYear.id },
    select: { id: true, teacherId: true },
  })
  const classContext = await resolveClassContext(classSectionId)
  const classTeacher = classContext.legacyClassId
    ? await prisma.classTeacher.findFirst({
        where: {
          teacherId,
          classId: classContext.legacyClassId,
          isClassTeacher: true,
          academicYear: activeYear.name,
        },
        select: { id: true },
      })
    : null
  const hasExplicitAssignments = offerings.some((offering) => Boolean(offering.teacherId))
  const canManageAll = Boolean(classTeacher) || !hasExplicitAssignments
  return {
    canManageAll,
    allowedOfferingIds: new Set(
      (canManageAll ? offerings : offerings.filter((offering) => offering.teacherId === teacherId))
        .map((offering) => offering.id)
    ),
  }
}

const resultDetailSelect = {
  id: true,
  studentId: true,
  classSectionId: true,
  examSessionId: true,
  declarationStatus: true,
  overallPercentage: true,
  grade: true,
  performanceBatch: true,
  classPosition: true,
  manualPosition: true,
  teacherRemarks: true,
  customFields: true,
  student: { select: { id: true, firstName: true, lastName: true, rollNumber: true } },
  subjectResults: {
    include: {
      subjectOffering: {
        include: { subject: { select: { name: true, code: true } } },
      },
    },
  },
} as const

export async function GET(
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
    const result = await prisma.termResult.findUnique({
      where: { id },
      select: resultDetailSelect,
    })

    if (!result) return errors.notFound('Result')

    const canAccessSection = await teacherCanAccessClassSection(teacher.id, result.classSectionId)
    if (!canAccessSection) return errors.forbidden('You are not assigned to this class section')

    const subjectScope = await resolveTeacherSubjectScope(teacher.id, result.classSectionId)
    const visibleSubjectResults = subjectScope.canManageAll || !subjectScope.allowedOfferingIds
      ? result.subjectResults
      : result.subjectResults.filter((subjectResult) => subjectScope.allowedOfferingIds?.has(subjectResult.subjectOfferingId))

    return successResponse({ ...result, subjectResults: visibleSubjectResults })
  } catch (err) {
    console.error('[TEACHER_RESULTS_GET_BY_ID]', err)
    return errors.internal()
  }
}

const patchSchema = z.object({
  teacherRemarks: z.string().max(1000).optional(),
  customFields: z
    .array(z.object({ label: z.string().min(1).max(100), value: z.string().max(500) }))
    .optional(),
  subjectResults: z
    .array(
      z.object({
        id: z.string().min(1),
        obtainedMarks: z.number().min(0).nullable(),
        isAbsent: z.boolean().optional(),
        isNotApplicable: z.boolean().optional(),
        remarks: z.string().max(500).optional(),
      })
    )
    .optional(),
  reason: z.string().min(1, 'Edit reason is required').max(500),
})

export async function PATCH(
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
    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const existing = await prisma.termResult.findUnique({
      where: { id },
      select: {
        id: true,
        classSectionId: true,
        declarationStatus: true,
        overallPercentage: true,
        teacherRemarks: true,
        customFields: true,
        subjectResults: true,
      },
    })
    if (!existing) return errors.notFound('Result')
    const { teacherRemarks, customFields, subjectResults, reason } = parsed.data

    if (existing.declarationStatus === 'DECLARED') {
      return errors.conflict('Declared results are locked. Reopen the result before editing.')
    }

    const canAccessSection = await teacherCanAccessClassSection(teacher.id, existing.classSectionId)
    if (!canAccessSection) return errors.forbidden('You are not assigned to this class section')

    const subjectScope = await resolveTeacherSubjectScope(teacher.id, existing.classSectionId)
    if (subjectResults?.length && !subjectScope.canManageAll && subjectScope.allowedOfferingIds) {
      const requestedSubjectResultIds = new Set(subjectResults.map((subjectResult) => subjectResult.id))
      const unauthorizedSubjectResult = existing.subjectResults.find(
        (subjectResult) => requestedSubjectResultIds.has(subjectResult.id) && !subjectScope.allowedOfferingIds?.has(subjectResult.subjectOfferingId)
      )
      if (unauthorizedSubjectResult) {
        return errors.forbidden('You can only edit subject marks assigned to you.')
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Snapshot before state for audit
      const beforeState = JSON.stringify({
        overallPercentage: existing.overallPercentage,
        teacherRemarks: existing.teacherRemarks,
        customFields: existing.customFields,
        subjectResults: existing.subjectResults,
      })

      // Update individual SubjectResults if provided
      if (subjectResults?.length) {
        for (const sr of subjectResults) {
          const current = existing.subjectResults.find((s) => s.id === sr.id)
          if (!current) continue

          const newObtained = sr.obtainedMarks !== undefined ? sr.obtainedMarks : current.obtainedMarks
          const newObtainedNumber = newObtained === null ? null : Number(newObtained)
          const isAbsent = sr.isAbsent ?? current.isAbsent
          const isNotApplicable = sr.isNotApplicable ?? current.isNotApplicable

          const pct =
            !isAbsent && !isNotApplicable && newObtained !== null && current.totalMarks > 0
              ? Math.round((Number(newObtained) / current.totalMarks) * 100 * 100) / 100
              : null

          await tx.subjectResult.update({
            where: { id: sr.id },
            data: {
              obtainedMarks: newObtained,
              isAbsent,
              isNotApplicable,
              percentage: pct,
              grade: pct !== null ? deriveGrade(pct) : null,
              resultStatus: deriveResultStatus({
                isAbsent,
                isNotApplicable,
                obtainedMarks: newObtainedNumber,
                totalMarks: current.totalMarks,
              }),
              performanceBatch: pct !== null ? derivePerformanceBatch(pct) : null,
              remarks: sr.remarks,
              updatedAt: new Date(),
            },
          })
        }
      }

      // Recompute TermResult aggregates
      const freshSubjects = await tx.subjectResult.findMany({
        where: { termResultId: id },
      })
      const valid = freshSubjects.filter(
        (s) => !s.isAbsent && !s.isNotApplicable && s.obtainedMarks !== null
      )
      const totalObt = valid.reduce((acc, s) => acc + Number(s.obtainedMarks), 0)
      const totalPoss = valid.reduce((acc, s) => acc + s.totalMarks, 0)
      const pct = totalPoss > 0 ? Math.round((totalObt / totalPoss) * 100 * 100) / 100 : 0

      const termUpdated = await tx.termResult.update({
        where: { id },
        data: {
          overallPercentage: pct,
          grade: deriveGrade(pct),
          performanceBatch: derivePerformanceBatch(pct),
          teacherRemarks: teacherRemarks !== undefined ? teacherRemarks : existing.teacherRemarks,
          customFields: customFields !== undefined ? customFields : existing.customFields,
          teacherId: teacher.id,
          updatedAt: new Date(),
        },
        select: {
          id: true,
          overallPercentage: true,
          teacherRemarks: true,
          customFields: true,
          subjectResults: true,
        },
      })

      // Write retroactive audit log
      await tx.retroactiveScoreEditLog.create({
        data: {
          entityType: 'TERM_RESULT',
          entityId: id,
          previousMarks: beforeState,
          newMarks: JSON.stringify({
            overallPercentage: termUpdated.overallPercentage,
            teacherRemarks: termUpdated.teacherRemarks,
            customFields: termUpdated.customFields,
          }),
          reason,
          editedById: session.user.id,
        },
      })

      return termUpdated
    })

    return successResponse(updated, 'Result updated successfully')
  } catch (err) {
    console.error('[TEACHER_RESULTS_PATCH]', err)
    return errors.internal()
  }
}

export async function DELETE(
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

    const existing = await prisma.termResult.findUnique({
      where: { id },
      select: {
        id: true,
        classSectionId: true,
        declarationStatus: true,
      },
    })
    if (!existing) return errors.notFound('Result')

    const canAccessSection = await teacherCanAccessClassSection(teacher.id, existing.classSectionId)
    if (!canAccessSection) return errors.forbidden('You are not assigned to this class section')

    if (existing.declarationStatus === 'DECLARED') {
      return errors.badRequest('Declared results cannot be deleted. Contact SuperAdmin.')
    }

    // Soft-reset: delete SubjectResults and the TermResult (draft only)
    await prisma.$transaction([
      prisma.subjectResult.deleteMany({ where: { termResultId: id } }),
      prisma.termResult.delete({ where: { id } }),
    ])

    return successResponse({ message: 'Result draft deleted' }, 'Result draft deleted successfully')
  } catch (err) {
    console.error('[TEACHER_RESULTS_DELETE]', err)
    return errors.internal()
  }
}
