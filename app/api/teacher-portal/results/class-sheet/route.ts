/**
 * Teacher class-result workspace.
 *
 * A result cycle is an AcademicYear id for now. Keeping the identifier
 * opaque preserves compatibility with existing TermResult rows while giving
 * the teacher a report-card workflow that is independent of scheduled Exams.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { getOrSyncSectionEnrollments } from '@/lib/academic/roster-helper'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import { deriveGrade, derivePerformanceBatch, deriveResultStatus } from '@/lib/academic/result-utils'
import { resolveClassContext } from '@/lib/teacher-access'

const scoreSchema = z.object({
  subjectOfferingId: z.string().min(1),
  totalMarks: z.coerce.number().int().positive(),
  obtainedMarks: z.number().min(0).nullable(),
  isAbsent: z.boolean().default(false),
  isNotApplicable: z.boolean().default(false),
  remarks: z.string().max(500).optional(),
}).superRefine((score, ctx) => {
  if (score.isAbsent && score.isNotApplicable) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['isNotApplicable'], message: 'A subject cannot be both absent and N/A.' })
  }
  if (score.obtainedMarks !== null && score.obtainedMarks > score.totalMarks) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['obtainedMarks'], message: 'Obtained marks cannot exceed total marks.' })
  }
})

const rowSchema = z.object({
  studentId: z.string().min(1),
  teacherRemarks: z.string().max(1000).optional(),
  customFields: z.array(z.object({ label: z.string().trim().min(1).max(100), value: z.string().max(500) })).max(50).optional(),
  subjectResults: z.array(scoreSchema).min(1).max(100),
}).superRefine((row, ctx) => {
  const offeringIds = row.subjectResults.map((score) => score.subjectOfferingId)
  if (new Set(offeringIds).size !== offeringIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['subjectResults'], message: 'Each course may appear only once per student.' })
  }
})

const bulkSchema = z.object({
  classSectionId: z.string().min(1),
  resultSessionId: z.string().min(1),
  rows: z.array(rowSchema).min(1).max(300),
}).superRefine((body, ctx) => {
  const studentIds = body.rows.map((row) => row.studentId)
  if (new Set(studentIds).size !== studentIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rows'], message: 'Each student may appear only once per save.' })
  }
})

async function getTeacher() {
  const session = await auth()
  if (!session?.user) return { error: errors.unauthorized() as Response }
  if (session.user.role !== 'TEACHER') return { error: errors.forbidden('Only teachers can access class results') as Response }

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return { error: errors.notFound('Teacher profile') as Response }
  return { teacher }
}

async function loadContext(classSectionId: string, resultSessionId: string, teacherId: string) {
  const academicYear = await prisma.academicYear.findUnique({
    where: { id: resultSessionId },
    select: { id: true, name: true, isActive: true },
  })
  if (!academicYear) return { error: errors.notFound('Result cycle') as Response }
  if (!academicYear.isActive) return { error: errors.badRequest('Only the active academic year can be used for new class results.') as Response }

  if (!(await teacherCanAccessClassSection(teacherId, classSectionId, academicYear.id))) {
    return { error: errors.forbidden('You are not assigned to this class section.') as Response }
  }

  const section = await prisma.classSection.findUnique({
    where: { id: classSectionId },
    select: {
      id: true,
      className: true,
      sectionName: true,
      shift: { select: { name: true, code: true } },
    },
  })
  if (!section) return { error: errors.notFound('Class section') as Response }

  let enrollments = await prisma.studentEnrollment.findMany({
    where: { classSectionId, academicYearId: academicYear.id, status: 'ACTIVE' },
    select: {
      studentId: true,
      rollNumber: true,
      student: { select: { id: true, firstName: true, lastName: true, fatherName: true, registrationNumber: true } },
    },
    orderBy: [{ rollNumber: 'asc' }, { student: { firstName: 'asc' } }],
  })

  if (enrollments.length === 0) {
    const resolved = await getOrSyncSectionEnrollments(classSectionId, academicYear.id)
    enrollments = resolved.enrollments.map((enrollment) => ({
      studentId: enrollment.studentId,
      rollNumber: enrollment.rollNumber,
      student: enrollment.student,
    })) as typeof enrollments
  }

  const allOfferings = await prisma.subjectOffering.findMany({
    where: { classSectionId, teacherId: teacherId, academicYearId: academicYear.id },
    select: { id: true, teacherId: true },
  })
  const sectionOfferings = await prisma.subjectOffering.findMany({
    where: { classSectionId, academicYearId: academicYear.id },
    select: { id: true, teacherId: true, subject: { select: { id: true, name: true, code: true } } },
    orderBy: { subject: { name: 'asc' } },
  })
  const classContext = await resolveClassContext(classSectionId)
  const classTeacher = classContext.legacyClassId
    ? await prisma.classTeacher.findFirst({
        where: {
          teacherId,
          classId: classContext.legacyClassId,
          isClassTeacher: true,
          academicYear: academicYear.name,
        },
        select: { id: true },
      })
    : null
  // A class teacher may complete the full report card. A subject teacher may
  // draft only the offerings assigned to them; they cannot publish a partial
  // class report.
  // If no offering has a teacher assigned yet, a scoped timetable/class
  // teacher may still work the full section. Once any subject is explicitly
  // assigned, a non-class teacher is limited to their own offerings.
  const hasExplicitSubjectAssignments = sectionOfferings.some((offering) => Boolean(offering.teacherId))
  const canManageAllOfferings = Boolean(classTeacher) || !hasExplicitSubjectAssignments
  const assignedOfferingIds = new Set(allOfferings.map((offering) => offering.id))
  const offerings = canManageAllOfferings
    ? sectionOfferings
    : sectionOfferings.filter((offering) => assignedOfferingIds.has(offering.id))

  const studentIds = enrollments.map((row) => row.studentId)
  const results = studentIds.length > 0
    ? await prisma.termResult.findMany({
        where: { classSectionId, examSessionId: academicYear.id, studentId: { in: studentIds } },
        select: {
          id: true,
          studentId: true,
          declarationStatus: true,
          overallPercentage: true,
          grade: true,
          performanceBatch: true,
          teacherRemarks: true,
          customFields: true,
          subjectResults: {
            select: {
              subjectOfferingId: true,
              totalMarks: true,
              obtainedMarks: true,
              isAbsent: true,
              isNotApplicable: true,
              remarks: true,
            },
          },
        },
      })
    : []
  const resultByStudent = new Map(results.map((result) => [result.studentId, result]))

  return {
    academicYear,
    section,
    offerings,
    enrollments,
    results,
    resultByStudent,
    canManageAllOfferings,
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const classSectionId = searchParams.get('classSectionId')
    const resultSessionId = searchParams.get('resultSessionId')
    if (!classSectionId || !resultSessionId) return errors.badRequest('classSectionId and resultSessionId are required')

    const teacherContext = await getTeacher()
    if ('error' in teacherContext) return teacherContext.error
    const context = await loadContext(classSectionId, resultSessionId, teacherContext.teacher.id)
    if ('error' in context) return context.error
    return successResponse({
      resultSession: {
        id: context.academicYear.id,
        name: `${context.academicYear.name} — Annual Result`,
        type: 'ANNUAL',
        status: 'OPEN',
      },
      section: context.section,
      subjects: context.offerings.map((offering) => ({
        id: offering.id,
        name: offering.subject.name,
        code: offering.subject.code,
        totalMarks: context.results
          .flatMap((result) => result.subjectResults)
          .find((score) => score.subjectOfferingId === offering.id)?.totalMarks ?? 100,
      })),
      canDeclare: context.canManageAllOfferings,
      students: (() => {
        const visibleOfferingIds = new Set(context.offerings.map((offering) => offering.id))
        return context.enrollments.map((enrollment) => {
          const result = context.resultByStudent.get(enrollment.studentId)
          return {
            id: enrollment.studentId,
            firstName: enrollment.student.firstName,
            lastName: enrollment.student.lastName,
            fatherName: enrollment.student.fatherName ?? '',
            registrationNumber: enrollment.student.registrationNumber,
            rollNumber: enrollment.rollNumber,
            result: result
              ? {
                  id: result.id,
                  declarationStatus: result.declarationStatus,
                  overallPercentage: Number(result.overallPercentage),
                  grade: result.grade,
                  performanceBatch: result.performanceBatch,
                  teacherRemarks: result.teacherRemarks,
                  customFields: result.customFields,
                  subjectResults: result.subjectResults
                    .filter((score) => context.canManageAllOfferings || visibleOfferingIds.has(score.subjectOfferingId))
                    .map((score) => ({
                      ...score,
                      obtainedMarks: score.obtainedMarks === null ? null : Number(score.obtainedMarks),
                    })),
                }
              : null,
          }
        })
      })(),
    })
  } catch (error) {
    console.error('[TEACHER_CLASS_RESULT_GET]', error)
    return errors.internal()
  }
}

export async function POST(request: NextRequest) {
  try {
    const teacherContext = await getTeacher()
    if ('error' in teacherContext) return teacherContext.error

    let body: unknown
    try { body = await request.json() } catch { return errors.badRequest('Invalid JSON body') }
    const parsed = bulkSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const { classSectionId, resultSessionId, rows } = parsed.data
    const context = await loadContext(classSectionId, resultSessionId, teacherContext.teacher.id)
    if ('error' in context) return context.error
    const enrolledStudentIds = new Set(context.enrollments.map((row) => row.studentId))
    const allowedOfferingIds = new Set(context.offerings.map((offering) => offering.id))
    const invalidStudent = rows.find((row) => !enrolledStudentIds.has(row.studentId))
    if (invalidStudent) return errors.forbidden('One or more students are not actively enrolled in this section.')

    const invalidOffering = rows
      .flatMap((row) => row.subjectResults)
      .find((score) => !allowedOfferingIds.has(score.subjectOfferingId))
    if (invalidOffering) return errors.forbidden('One or more subjects are not offered in this section or are not assigned to you.')

    const existingDeclared = context.results.filter(
      (result) => rows.some((row) => row.studentId === result.studentId) && result.declarationStatus === 'DECLARED'
    )
    if (existingDeclared.length > 0) {
      return errors.conflict('Declared results are locked. Reopen them before editing.')
    }

    const saved = await prisma.$transaction(async (tx) => {
      const output = []
      for (const row of rows) {
        const normalizedScores = row.subjectResults.map((score) => {
          const isAbsent = score.isAbsent ?? false
          const isNotApplicable = score.isNotApplicable ?? false
          return {
            ...score,
            isAbsent,
            isNotApplicable,
            obtainedMarks: isAbsent || isNotApplicable ? null : score.obtainedMarks,
          }
        })
        const result = await tx.termResult.upsert({
          where: {
            studentId_classSectionId_examSessionId: {
              studentId: row.studentId,
              classSectionId,
              examSessionId: resultSessionId,
            },
          },
          create: {
            studentId: row.studentId,
            classSectionId,
            examSessionId: resultSessionId,
            overallPercentage: 0,
            grade: deriveGrade(0),
            performanceBatch: derivePerformanceBatch(0),
            teacherRemarks: row.teacherRemarks ?? undefined,
            customFields: row.customFields ?? undefined,
            teacherId: teacherContext.teacher.id,
            declarationStatus: 'DRAFT',
          },
          update: {
            overallPercentage: 0,
            grade: deriveGrade(0),
            performanceBatch: derivePerformanceBatch(0),
            // Omitted details mean "leave the existing value unchanged".
            // This lets the class grid update marks without erasing custom
            // fields or teacher remarks entered in the detail editor.
            teacherRemarks: row.teacherRemarks !== undefined ? row.teacherRemarks : undefined,
            customFields: row.customFields !== undefined ? row.customFields : undefined,
            teacherId: teacherContext.teacher.id,
            updatedAt: new Date(),
          },
        })

        await tx.subjectResult.deleteMany({
          where: context.canManageAllOfferings
            ? { termResultId: result.id }
            : { termResultId: result.id, subjectOfferingId: { in: [...allowedOfferingIds] } },
        })
        await tx.subjectResult.createMany({
          data: normalizedScores.map((score) => {
            const percentage = !score.isAbsent && !score.isNotApplicable && score.obtainedMarks !== null
              ? Math.round((score.obtainedMarks / score.totalMarks) * 100 * 100) / 100
              : null
            return {
              termResultId: result.id,
              subjectOfferingId: score.subjectOfferingId,
              totalMarks: score.totalMarks,
              obtainedMarks: score.obtainedMarks,
              isAbsent: score.isAbsent,
              isNotApplicable: score.isNotApplicable,
              percentage,
              grade: percentage === null ? null : deriveGrade(percentage),
              resultStatus: deriveResultStatus({
                isAbsent: score.isAbsent,
                isNotApplicable: score.isNotApplicable,
                obtainedMarks: score.obtainedMarks,
                totalMarks: score.totalMarks,
              }),
              performanceBatch: percentage === null ? null : derivePerformanceBatch(percentage),
              remarks: score.remarks ?? null,
            }
          }),
        })

        const allScores = await tx.subjectResult.findMany({
          where: { termResultId: result.id },
          select: { totalMarks: true, obtainedMarks: true, isAbsent: true, isNotApplicable: true },
        })
        const validScores = allScores.filter((score) => !score.isAbsent && !score.isNotApplicable && score.obtainedMarks !== null)
        const totalObtained = validScores.reduce((sum, score) => sum + Number(score.obtainedMarks ?? 0), 0)
        const totalPossible = validScores.reduce((sum, score) => sum + score.totalMarks, 0)
        const overallPercentage = totalPossible > 0
          ? Math.round((totalObtained / totalPossible) * 100 * 100) / 100
          : 0
        await tx.termResult.update({
          where: { id: result.id },
          data: {
            overallPercentage,
            grade: deriveGrade(overallPercentage),
            performanceBatch: derivePerformanceBatch(overallPercentage),
          },
        })
        output.push(result.id)
      }
      return output
    })

    return successResponse({ savedCount: saved.length }, 'Class result drafts saved successfully')
  } catch (error) {
    console.error('[TEACHER_CLASS_RESULT_POST]', error)
    return errors.internal()
  }
}
