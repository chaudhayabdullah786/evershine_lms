/** POST /api/teacher-portal/results/class-sheet/declare */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import { getOrSyncSectionEnrollments } from '@/lib/academic/roster-helper'
import { dispatchBulkNotification } from '@/lib/notifications/dispatch'
import { resolveClassContext } from '@/lib/teacher-access'

const requestSchema = z.object({
  classSectionId: z.string().min(1),
  resultSessionId: z.string().min(1),
})

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile')

    let body: unknown
    try { body = await request.json() } catch { return errors.badRequest('Invalid JSON body') }
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const { classSectionId, resultSessionId } = parsed.data
    const academicYear = await prisma.academicYear.findUnique({
      where: { id: resultSessionId },
      select: { id: true, name: true, isActive: true },
    })
    if (!academicYear) return errors.notFound('Result cycle')
    if (!academicYear.isActive) return errors.badRequest('Only the active academic year can be declared.')
    if (!(await teacherCanAccessClassSection(teacher.id, classSectionId, academicYear.id))) {
      return errors.forbidden('You are not assigned to this class section')
    }

    const classContext = await resolveClassContext(classSectionId)
    const [classTeacher, sectionOfferings] = await Promise.all([
      classContext.legacyClassId
        ? prisma.classTeacher.findFirst({
            where: {
              teacherId: teacher.id,
              classId: classContext.legacyClassId,
              isClassTeacher: true,
              academicYear: academicYear.name,
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      prisma.subjectOffering.findMany({
        where: { classSectionId, academicYearId: academicYear.id, teacherId: teacher.id },
        select: { id: true, teacherId: true },
      }),
    ])
    const allSectionOfferings = await prisma.subjectOffering.findMany({
      where: { classSectionId, academicYearId: academicYear.id },
      select: { id: true, teacherId: true },
    })
    const hasExplicitSubjectAssignments = allSectionOfferings.some((offering) => Boolean(offering.teacherId))
    if (!classTeacher && (sectionOfferings.length > 0 || hasExplicitSubjectAssignments)) {
      return errors.forbidden('Only the assigned class teacher can declare the complete class result.')
    }

    const [initialEnrollments, offerings, results] = await Promise.all([
      prisma.studentEnrollment.findMany({
        where: { classSectionId, academicYearId: academicYear.id, status: 'ACTIVE' },
        select: { studentId: true, student: { select: { userId: true } } },
      }),
      prisma.subjectOffering.findMany({
        where: { classSectionId, academicYearId: academicYear.id },
        select: { id: true, subject: { select: { name: true } } },
      }),
      prisma.termResult.findMany({
        where: { classSectionId, examSessionId: resultSessionId },
        select: {
          id: true,
          studentId: true,
          declarationStatus: true,
          subjectResults: {
            select: {
              subjectOfferingId: true,
              resultStatus: true,
              obtainedMarks: true,
              isAbsent: true,
              isNotApplicable: true,
            },
          },
        },
      }),
    ])
    let enrollments = initialEnrollments

    // Some migrated sections have students represented in the legacy Student
    // model but no active StudentEnrollment row yet. Use the same idempotent
    // roster bridge as the class sheet and task marks workflow before
    // rejecting declaration.
    if (enrollments.length === 0) {
      const resolved = await getOrSyncSectionEnrollments(classSectionId, academicYear.id)
      enrollments = resolved.enrollments.map((enrollment) => ({
        studentId: enrollment.studentId,
        // The roster helper intentionally selects a minimal student shape;
        // notifications remain best-effort for legacy-synced rows.
        student: { userId: '' },
      }))
    }

    if (enrollments.length === 0) return errors.badRequest('No active students are enrolled in this section.')
    if (offerings.length === 0) {
      return errors.badRequest('No offered subjects are configured for this section.')
    }

    const enrolledStudentIds = new Set(enrollments.map((enrollment) => enrollment.studentId))
    // Ignore stale drafts left by students who are no longer enrolled. They
    // must not block or be accidentally published by the current declaration.
    const scopedResults = results.filter((result) => enrolledStudentIds.has(result.studentId))
    const resultByStudent = new Map(scopedResults.map((result) => [result.studentId, result]))
    const missingStudents = enrollments.filter((enrollment) => !resultByStudent.has(enrollment.studentId))
    if (missingStudents.length > 0) {
      return errors.badRequest(`Save every student before declaring the class result. ${missingStudents.length} student(s) are still missing.`)
    }

    const offeringNames = new Map(offerings.map((offering) => [offering.id, offering.subject.name]))
    for (const result of scopedResults) {
      const scoreByOffering = new Map(result.subjectResults.map((score) => [score.subjectOfferingId, score]))
      const missingOffering = offerings.find((offering) => !scoreByOffering.has(offering.id))
      if (missingOffering) {
        return errors.badRequest(`Complete ${offeringNames.get(missingOffering.id) ?? 'all subjects'} for every student before declaring.`)
      }
      const pending = result.subjectResults.find((score) =>
        !score.isAbsent &&
        !score.isNotApplicable &&
        (score.resultStatus === 'Pending' || score.obtainedMarks === null)
      )
      if (pending) {
        return errors.badRequest('Every subject must have marks, Absent, or N/A before the class can be declared.')
      }
      if (result.declarationStatus === 'DECLARED') {
        return errors.conflict('This class result is already declared and locked.')
      }
    }

    const declaredAt = new Date()
    const declared = await prisma.$transaction(async (tx) => {
      let updateResult
      try {
        updateResult = await tx.termResult.updateMany({
          where: {
            classSectionId,
            examSessionId: resultSessionId,
            declarationStatus: 'DRAFT',
            studentId: { in: [...enrolledStudentIds] },
          },
          data: { declarationStatus: 'DECLARED', declaredAt, declaredById: session.user.id },
        })
      } catch (error) {
        // Older production schemas may not yet contain declaration audit columns.
        const message = String((error as { message?: string })?.message ?? '')
        if (!message.includes('declaredAt') && !message.includes('declaredById')) throw error
        updateResult = await tx.termResult.updateMany({
          where: {
            classSectionId,
            examSessionId: resultSessionId,
            declarationStatus: 'DRAFT',
            studentId: { in: [...enrolledStudentIds] },
          },
          data: { declarationStatus: 'DECLARED' },
        })
      }

      const declaredRows = await tx.termResult.findMany({
        where: {
          classSectionId,
          examSessionId: resultSessionId,
          declarationStatus: 'DECLARED',
          studentId: { in: [...enrolledStudentIds] },
        },
        select: { id: true, overallPercentage: true },
        orderBy: { overallPercentage: 'desc' },
      })
      for (let index = 0; index < declaredRows.length; index += 1) {
        await tx.termResult.update({ where: { id: declaredRows[index].id }, data: { classPosition: index + 1 } })
      }
      return updateResult.count
    })

    const studentUserIds = enrollments.map((enrollment) => enrollment.student.userId).filter((id): id is string => Boolean(id))
    if (studentUserIds.length > 0) {
      try {
        await dispatchBulkNotification({
          userIds: studentUserIds,
          title: 'Result Published',
          message: 'Your class result has been declared. Check your student portal.',
          type: 'RESULT_PUBLISHED',
          relatedId: resultSessionId,
        })
      } catch (notificationError) {
        console.error('[TEACHER_CLASS_RESULT_NOTIFY]', notificationError)
      }
    }

    return successResponse({ declaredCount: declared }, 'Class result declared successfully')
  } catch (error) {
    console.error('[TEACHER_CLASS_RESULT_DECLARE]', error)
    return errors.internal()
  }
}
