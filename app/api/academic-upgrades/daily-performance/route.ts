/**
 * GET  /api/academic-upgrades/daily-performance  — query student performance logs
 * POST /api/academic-upgrades/daily-performance  — submit/replace a day's scoring batch
 *
 * Authorization:
 *   GET  — any role with students.read
 *   POST — roles with grading_engine.create (TEACHER, ADMIN, SUPER_ADMIN)
 */
import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { AcademicUpgradesService, type SubmitDailyPerformanceInput } from '@/lib/services/academic-upgrades-service'
import { submitDailyPerformanceSchema } from '@/lib/validation/academic-upgrades'
import { prisma } from '@/lib/prisma'
import type { Role } from '@prisma/client'
import { decodeMonitoringRemarks } from '@/lib/academic/monitoring'
import { teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'students', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const studentId        = searchParams.get('studentId')
  const subjectOfferingId = searchParams.get('subjectOfferingId')
  const startDate        = searchParams.get('startDate')
  const endDate          = searchParams.get('endDate')
  const date             = searchParams.get('date')

  if (!studentId) {
    if (subjectOfferingId && date) {
      try {
        const offering = await prisma.subjectOffering.findUnique({
          where: { id: subjectOfferingId },
        })
        if (!offering) return errors.notFound('Subject offering')

        // Ensure teacher can access this offering's class section.
        if (role === 'TEACHER') {
          const teacher = await prisma.teacher.findUnique({
            where: { userId: session.user.id },
            select: { id: true },
          })
          if (!teacher || !(await teacherCanAccessClassSection(teacher.id, offering.classSectionId, offering.academicYearId))) {
            return errors.forbidden('Only an assigned teacher can view these scores')
          }
        }

        const enrollments = await prisma.studentEnrollment.findMany({
          where: {
            classSectionId: offering.classSectionId,
            status: 'ACTIVE',
          },
          include: {
            student: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                rollNumber: true,
              },
            },
          },
          orderBy: [
            { rollNumber: 'asc' },
            { student: { firstName: 'asc' } },
          ],
        })

        const parsedDate = new Date(date)
        const existingScores = await prisma.dailyPerformanceScore.findMany({
          where: {
            subjectOfferingId,
            date: parsedDate,
          },
        })

        const roster = enrollments.map((enr) => {
          const existing = existingScores.find((s) => s.studentId === enr.studentId) as (typeof existingScores[number] & { grade?: string | null; highlight?: 'STAR_OF_THE_DAY' | 'POOR' | null }) | undefined
          const score = existing ? existing.score.toNumber() : null
          const metadata = decodeMonitoringRemarks(existing?.remarks, score, offering.maxDailyScore)
          const grade = existing?.grade ?? metadata.grade
          const highlight = existing?.highlight ?? (metadata.isStarOfDay ? 'STAR_OF_THE_DAY' : metadata.isConcern ? 'POOR' : null)

          return {
            studentId: enr.studentId,
            rollNumber: enr.rollNumber ?? enr.student.rollNumber ?? '—',
            name: `${enr.student.firstName} ${enr.student.lastName}`,
            score,
            isAbsent: existing ? existing.isAbsent : false,
            remarks: metadata.remarks,
            grade,
            highlight,
            performanceGrade: grade,
            isStarOfDay: highlight === 'STAR_OF_THE_DAY',
            isConcern: highlight === 'POOR',
          }
        })

        return successResponse({
          maxDailyScore: offering.maxDailyScore,
          roster,
        })
      } catch (err: unknown) {
        return errors.badRequest(err instanceof Error ? err.message : 'Failed to fetch roster daily scores.')
      }
    }
    return errors.badRequest('studentId or both subjectOfferingId and date query parameters are required.')
  }

  try {
    const logs = await AcademicUpgradesService.getStudentDailyPerformanceLogs(
      studentId,
      subjectOfferingId ?? undefined,
      startDate ? new Date(startDate) : undefined,
      endDate   ? new Date(endDate)   : undefined,
    )
    return successResponse(logs)
  } catch (err: unknown) {
    return errors.badRequest(err instanceof Error ? err.message : 'Failed to fetch performance logs.')
  }
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'grading_engine', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() }
  catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON body' }] } as never) }

  const parsed = submitDailyPerformanceSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  try {
    if (role === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!teacher) return errors.forbidden('Your teacher profile is not available')

      const offering = await prisma.subjectOffering.findUnique({
        where: { id: parsed.data.subjectOfferingId },
        select: { id: true, classSectionId: true, academicYearId: true },
      })
      if (!offering || !(await teacherCanAccessClassSection(teacher.id, offering.classSectionId, offering.academicYearId))) {
        return errors.forbidden('Only an assigned teacher can save these scores')
      }
    }

    const payload: SubmitDailyPerformanceInput = {
      subjectOfferingId: parsed.data.subjectOfferingId!,
      date: parsed.data.date!,
      records: parsed.data.records!.map((record) => ({
        studentId: record.studentId!,
        score: record.score!,
        isAbsent: record.isAbsent,
        grade: record.grade ?? record.performanceGrade,
        highlight: record.highlight ?? (record.isStarOfDay ? 'STAR_OF_THE_DAY' : record.isConcern ? 'POOR' : null),
        remarks: record.remarks,
        performanceGrade: record.performanceGrade,
        isStarOfDay: record.isStarOfDay,
        isConcern: record.isConcern,
      })),
      teacherId: session.user.id,
    }
    const result = await AcademicUpgradesService.submitDailyPerformance(payload)
    return successResponse(result, `${result.count} daily performance records saved for ${result.date}.`)
  } catch (err: unknown) {
    return errors.badRequest(err instanceof Error ? err.message : 'Failed to submit daily performance records.')
  }
}
