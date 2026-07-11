/**
 * GET  /api/teacher-portal/monthly-monitoring
 *   ?classSectionId&month&year&academicYearId
 *   — Loads the teacher-owned monthly snapshot or an editable section roster.
 *
 * POST /api/teacher-portal/monthly-monitoring
 *   — Saves a snapshot MonthlyMonitoringReport for historical reference.
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { derivePerformanceBatch } from '@/lib/academic/result-utils'
import { type MonthlyMonitoringRepository } from '@/lib/academic/monitoring-report'
import { decodeMonitoringRemarks } from '@/lib/academic/monitoring'

export const dynamic = 'force-dynamic'

// Kept narrow while the local generated Prisma client is refreshed during deploy.
const monitoringModel = prisma.monthlyMonitoringReport as unknown as MonthlyMonitoringRepository

const saveSchema = z.object({
  classSectionId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
  academicYearId: z.string().min(1),
  reportData: z.record(z.string(), z.unknown()),
})

const monthlyColumnSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().trim().min(1).max(100),
  type: z.enum(['COURSE', 'CUSTOM']).default('CUSTOM'),
})

const monthlyStudentSchema = z.object({
  studentId: z.string().min(1),
  courseMarks: z.record(z.string(), z.object({
    totalMarks: z.number().finite().min(0).max(100000),
    obtainedMarks: z.number().finite().min(0).max(100000),
  })).default({}),
  customValues: z.record(z.string(), z.string().max(500)).default({}),
  remarks: z.string().max(1000).default(''),
})

const monthlyDataSchema = z.object({
  columns: z.array(monthlyColumnSchema).min(1).max(80),
  students: z.array(monthlyStudentSchema).min(1).max(1000),
})

const monitoringTypeSchema = z.enum(['daily', 'monthly', 'yearly'])

function parseLocalDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function stripCourseNameFromRemarks(remarks: string | null, courseName: string): string {
  const trimmed = remarks?.trim() ?? ''
  if (!trimmed) return ''
  const escapedCourseName = courseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return trimmed.replace(new RegExp(`^${escapedCourseName}\\s*:\\s*`, 'i'), '').trim()
}

function calculateMonthlySnapshot(input: unknown, enrollments: Array<{ studentId: string; student: { firstName: string; lastName: string; fatherName: string | null; rollNumber: string | null } }>, classSectionId: string) {
  const parsed = monthlyDataSchema.safeParse(input)
  if (!parsed.success) throw new Error('Monthly report columns and student marks are invalid.')
  const columnIds = new Set(parsed.data.columns.map((column) => column.id))
  if (columnIds.size !== parsed.data.columns.length) {
    throw new Error('Each monthly report column must have a unique identifier.')
  }
  const courseColumnIds = new Set(parsed.data.columns.filter((column) => column.type === 'COURSE').map((column) => column.id))
  const customColumnIds = new Set(parsed.data.columns.filter((column) => column.type === 'CUSTOM').map((column) => column.id))
  const enrollmentMap = new Map(enrollments.map((e) => [e.studentId, e]))
  const seen = new Set<string>()
  const rows = parsed.data.students.map((entry, index) => {
    const enrollment = enrollmentMap.get(entry.studentId)
    if (!enrollment || seen.has(entry.studentId)) throw new Error('Every selected student must be actively enrolled in this section and appear once.')
    seen.add(entry.studentId)
    for (const [columnId, mark] of Object.entries(entry.courseMarks)) {
      if (!courseColumnIds.has(columnId)) throw new Error('Marks can only be entered for marks columns in this report.')
      if (mark.obtainedMarks > mark.totalMarks) throw new Error('Obtained marks cannot exceed total marks.')
    }
    for (const columnId of Object.keys(entry.customValues)) {
      if (!customColumnIds.has(columnId)) throw new Error('Custom values can only be entered for custom columns in this report.')
    }
    const totalMarks = Object.values(entry.courseMarks).reduce((sum, mark) => sum + mark.totalMarks, 0)
    const obtainedMarks = Object.values(entry.courseMarks).reduce((sum, mark) => sum + mark.obtainedMarks, 0)
    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 10000) / 100 : 0
    return {
      serial: index + 1,
      studentId: entry.studentId,
      name: `${enrollment.student.firstName} ${enrollment.student.lastName}`.trim(),
      fatherName: enrollment.student.fatherName,
      rollNumber: enrollment.student.rollNumber ?? '',
      courseMarks: entry.courseMarks,
      customValues: entry.customValues,
      remarks: entry.remarks.trim(),
      totalMarks,
      obtainedMarks,
      percentage,
      performanceBatch: derivePerformanceBatch(percentage),
      rank: 0,
    }
  })
  ;[...rows].sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name)).forEach((row, index) => { row.rank = index + 1 })
  return { classSectionId, columns: parsed.data.columns, students: rows, statusCriteria: [
    { label: 'Ever Shine Group', min: 90, max: 100 },
    { label: 'Quaid Group', min: 80, max: 89.99 },
    { label: 'Iqbal Group', min: 60, max: 79.99 },
    { label: 'Improvement Group', min: 0, max: 59.99 },
  ] }
}

export async function GET(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['TEACHER', 'SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
      return errors.forbidden()
    }

    const { searchParams } = new URL(req.url)
    const classSectionId = searchParams.get('classSectionId')
    const academicYearId = searchParams.get('academicYearId')
    const typeResult = monitoringTypeSchema.safeParse(searchParams.get('type') ?? 'monthly')
    const dateStr = searchParams.get('date')
    const month = parseInt(searchParams.get('month') ?? '0')
    const year = parseInt(searchParams.get('year') ?? '0')

    if (!classSectionId || !academicYearId) {
      return errors.badRequest('classSectionId and academicYearId are required')
    }
    if (!typeResult.success) return errors.badRequest('type must be daily, monthly, or yearly')

    const type = typeResult.data
    let teacherId: string | undefined
    if (session.user.role === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
      })
      if (!teacher) return errors.forbidden('Your teacher profile is not available')
      teacherId = teacher.id
    }

    let periodStart: Date
    let periodEnd: Date
    const isDaily = type === 'daily'
    const isYearly = type === 'yearly'

    if (isDaily) {
      if (!dateStr) return errors.badRequest('date is required for daily monitoring')
      const date = parseLocalDate(dateStr)
      if (!date) return errors.badRequest('date must use YYYY-MM-DD format')
      periodStart = new Date(date)
      periodStart.setHours(0, 0, 0, 0)
      periodEnd = new Date(date)
      periodEnd.setHours(23, 59, 59, 999)
    } else if (isYearly) {
      if (!year) return errors.badRequest('year is required for yearly monitoring')
      periodStart = new Date(year, 0, 1)
      periodEnd = new Date(year, 11, 31, 23, 59, 59, 999)
    } else {
      if (!month || !year) return errors.badRequest('month and year are required for monthly monitoring')
      periodStart = new Date(year, month - 1, 1)
      periodEnd = new Date(year, month, 0, 23, 59, 59, 999)
    }

    // 1. Get all active enrollments for section
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { classSectionId, academicYearId, status: 'ACTIVE' },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            fatherName: true,
            rollNumber: true,
          },
        },
      },
      orderBy: { rollNumber: 'asc' },
    })

    // 2. Get all SubjectOfferings for this section
    const offerings = await prisma.subjectOffering.findMany({
      where: { classSectionId, academicYearId, ...(teacherId ? { teacherId } : {}) },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { subject: { name: 'asc' } },
    })
    if (teacherId && offerings.length === 0) {
      return errors.forbidden('You are not assigned to a subject in this class section')
    }

    if (type === 'monthly') {
      const snapshot = await monitoringModel.findUnique({
        where: { classSectionId_month_year_academicYearId: { classSectionId, month, year, academicYearId } },
        select: { reportData: true, declarationStatus: true, declaredAt: true },
      })
      if (snapshot) {
        return successResponse({
          ...(snapshot.reportData as Record<string, unknown>),
          type: 'monthly',
          month,
          year,
          declarationStatus: snapshot.declarationStatus,
          declaredAt: snapshot.declaredAt,
          isPersisted: true,
        }, 'Monthly monitoring report loaded successfully')
      }
      const initial = calculateMonthlySnapshot({
        columns: offerings.map((o) => ({ id: o.id, label: o.subject.name, type: 'COURSE' })),
        students: enrollments.map((e) => ({ studentId: e.studentId, courseMarks: {}, customValues: {}, remarks: '' })),
      }, enrollments, classSectionId)
      return successResponse({ ...initial, type: 'monthly', month, year, declarationStatus: 'DRAFT', isPersisted: false }, 'Monthly monitoring report ready for entry')
    }

    // 3. Get DailyPerformanceScores for this section/period
    const studentIds = enrollments.map((e) => e.studentId)
    const offeringIds = offerings.map((o) => o.id)

    const scores = await prisma.dailyPerformanceScore.findMany({
      where: {
        studentId: { in: studentIds },
        subjectOfferingId: { in: offeringIds },
        date: { gte: periodStart, lte: periodEnd },
      },
    })
    const offeringsById = new Map(offerings.map((offering) => [offering.id, offering]))
    const enrollmentByStudentId = new Map(enrollments.map((enrollment) => [enrollment.studentId, enrollment]))

    if (isDaily) {
      const dailyEntries = scores.flatMap((score, index) => {
        const enrollment = enrollmentByStudentId.get(score.studentId)
        const offering = offeringsById.get(score.subjectOfferingId)
        if (!offering || !enrollment) return []
        const metadata = decodeMonitoringRemarks(score.remarks, Number(score.score), offering.maxDailyScore)
        const storedScore = score as typeof score & { grade?: string | null; highlight?: string | null }
        const courseName = offering.subject.name
        const grade = storedScore.grade ?? metadata.grade
        const highlight = storedScore.highlight ?? (metadata.isStarOfDay ? 'STAR_OF_THE_DAY' : metadata.isConcern ? 'POOR' : null)
        return [{
          serial: index + 1,
          studentId: score.studentId,
          rollNumber: enrollment.student.rollNumber ?? '',
          name: `${enrollment.student.firstName} ${enrollment.student.lastName}`.trim(),
          courseName,
          remarks: stripCourseNameFromRemarks(metadata.remarks, courseName),
          highlight,
          grade,
          score: Number(score.score),
          isAbsent: score.isAbsent,
        }]
      })
      const students = enrollments.map((enrollment, index) => {
        const subjectScores: Record<string, number> = {}
        const subjectGrades: Record<string, string> = {}
        const subjectRemarks: Record<string, string[]> = {}
        const remarks: string[] = []
        let totalMarks = 0
        let obtainedMarks = 0
        let isStarOfDay = false
        let isConcern = false
        for (const offering of offerings) {
          const score = scores.find((item) => item.studentId === enrollment.studentId && item.subjectOfferingId === offering.id)
          const metadata = decodeMonitoringRemarks(score?.remarks, score ? Number(score.score) : null, offering.maxDailyScore)
          const storedScore = score as (typeof scores)[number] & { grade?: string | null; highlight?: string | null } | undefined
          const grade = storedScore?.grade ?? metadata.grade
          const highlight = storedScore?.highlight ?? (metadata.isStarOfDay ? 'STAR_OF_THE_DAY' : metadata.isConcern ? 'POOR' : null)
          const remark = stripCourseNameFromRemarks(metadata.remarks, offering.subject.name)
          subjectScores[offering.id] = score ? Number(score.score) : 0
          subjectGrades[offering.id] = grade
          subjectRemarks[offering.id] = remark ? [remark] : []
          if (remark) remarks.push(`${offering.subject.name}: ${remark}`)
          obtainedMarks += score ? Number(score.score) : 0
          totalMarks += offering.maxDailyScore
          isStarOfDay ||= highlight === 'STAR_OF_THE_DAY'
          isConcern ||= highlight === 'POOR'
        }
        const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 10000) / 100 : 0
        return {
          serial: index + 1,
          studentId: enrollment.studentId,
          name: `${enrollment.student.firstName} ${enrollment.student.lastName}`.trim(),
          fatherName: enrollment.student.fatherName,
          rollNumber: enrollment.student.rollNumber ?? '',
          subjectScores,
          subjectGrades,
          subjectRemarks,
          dailyRemarks: remarks.join(' | '),
          isStarOfDay,
          isConcern,
          totalMarks,
          obtainedMarks,
          percentage,
          performanceBatch: derivePerformanceBatch(percentage),
          rank: 0,
        }
      })
      ;[...students].sort((a, b) => b.obtainedMarks - a.obtainedMarks || a.name.localeCompare(b.name)).forEach((student, index) => { student.rank = index + 1 })
      return successResponse({
        type: 'daily',
        date: dateStr,
        classSectionId,
        subjects: offerings.map((offering) => ({ id: offering.id, name: offering.subject.name, code: offering.subject.code, maxDailyScore: offering.maxDailyScore })),
        students,
        dailyEntries,
        columns: ['Serial Number', 'Roll Number', 'Student Name', 'Course Name', 'Remarks', 'Highlight', 'Grade'],
      }, 'Daily monitoring report loaded successfully')
    }

    const scoringDays = new Map<string, Set<string>>()
    for (const score of scores) {
      const dates = scoringDays.get(score.subjectOfferingId) ?? new Set<string>()
      dates.add(score.date.toISOString().slice(0, 10))
      scoringDays.set(score.subjectOfferingId, dates)
    }
    const students = enrollments.map((enrollment, index) => {
      const subjectScores: Record<string, number> = {}
      const subjectRemarks: Record<string, string[]> = {}
      const remarks: string[] = []
      let totalMarks = 0
      let obtainedMarks = 0
      for (const offering of offerings) {
        const studentScores = scores.filter((score) => score.studentId === enrollment.studentId && score.subjectOfferingId === offering.id)
        const subjectTotal = studentScores.reduce((sum, score) => sum + Number(score.score), 0)
        const uniqueRemarks = Array.from(new Set(studentScores.map((score) => stripCourseNameFromRemarks(
          decodeMonitoringRemarks(score.remarks, Number(score.score), offering.maxDailyScore).remarks,
          offering.subject.name,
        )).filter(Boolean)))
        subjectScores[offering.id] = subjectTotal
        subjectRemarks[offering.id] = uniqueRemarks
        if (uniqueRemarks.length) remarks.push(`${offering.subject.name}: ${uniqueRemarks.join('; ')}`)
        obtainedMarks += subjectTotal
        totalMarks += (scoringDays.get(offering.id)?.size ?? 0) * offering.maxDailyScore
      }
      const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 10000) / 100 : 0
      return {
        serial: index + 1,
        studentId: enrollment.studentId,
        name: `${enrollment.student.firstName} ${enrollment.student.lastName}`.trim(),
        fatherName: enrollment.student.fatherName,
        rollNumber: enrollment.student.rollNumber ?? '',
        subjectScores,
        subjectRemarks,
        remarks: remarks.join(' | '),
        totalMarks,
        obtainedMarks,
        percentage,
        performanceBatch: derivePerformanceBatch(percentage),
        rank: 0,
      }
    })
    ;[...students].sort((a, b) => b.obtainedMarks - a.obtainedMarks || a.name.localeCompare(b.name)).forEach((student, index) => { student.rank = index + 1 })
    return successResponse({
      type: 'yearly',
      year,
      classSectionId,
      subjects: offerings.map((offering) => ({ id: offering.id, name: offering.subject.name, code: offering.subject.code, maxDailyScore: offering.maxDailyScore })),
      students,
      statusCriteria: [
        { label: 'Ever Shine Group', min: 90, max: 100 },
        { label: 'Quaid Group', min: 80, max: 89.99 },
        { label: 'Iqbal Group', min: 60, max: 79.99 },
        { label: 'Improvement Group', min: 0, max: 59.99 },
      ],
    }, 'Yearly monitoring report aggregated successfully')

  } catch (err) {
    console.error('[MONITORING_REPORT_GET]', err)
    return errors.internal()
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['TEACHER', 'SUPER_ADMIN', 'ADMIN'].includes(session.user.role)) {
      return errors.forbidden()
    }

    const body = await req.json()
    const parsed = saveSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const enrollments = await prisma.studentEnrollment.findMany({
      where: { classSectionId: parsed.data.classSectionId, academicYearId: parsed.data.academicYearId, status: 'ACTIVE' },
      include: { student: { select: { firstName: true, lastName: true, fatherName: true, rollNumber: true } } },
    })
    if (!enrollments.length) return errors.badRequest('No active students are enrolled in this section.')
    if (session.user.role === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({ where: { userId: session.user.id }, select: { id: true } })
      const assigned = teacher && await prisma.subjectOffering.findFirst({ where: { classSectionId: parsed.data.classSectionId, academicYearId: parsed.data.academicYearId, teacherId: teacher.id }, select: { id: true } })
      if (!assigned) return errors.forbidden('You are not assigned to this class section.')
    }
    let reportData: ReturnType<typeof calculateMonthlySnapshot>
    try { reportData = calculateMonthlySnapshot(parsed.data.reportData, enrollments, parsed.data.classSectionId) } catch (error) { return errors.badRequest(error instanceof Error ? error.message : 'Invalid monthly report data.') }
    const existingReport = await monitoringModel.findUnique({
      where: {
        classSectionId_month_year_academicYearId: {
          classSectionId: parsed.data.classSectionId,
          month: parsed.data.month,
          year: parsed.data.year,
          academicYearId: parsed.data.academicYearId,
        },
      },
    })
    if (existingReport?.declarationStatus === 'DECLARED') {
      return errors.badRequest('Declared monthly monitoring reports are locked and cannot be edited.')
    }
    const report = await monitoringModel.upsert({
      where: {
        classSectionId_month_year_academicYearId: {
          classSectionId: parsed.data.classSectionId,
          month: parsed.data.month,
          year: parsed.data.year,
          academicYearId: parsed.data.academicYearId,
        },
      },
      create: {
        classSectionId: parsed.data.classSectionId,
        month: parsed.data.month,
        year: parsed.data.year,
        academicYearId: parsed.data.academicYearId,
        generatedById: session.user.id,
        reportData,
      },
      update: {
        generatedById: session.user.id,
        reportData,
      },
    })

    return createdResponse(report, 'Monthly monitoring report saved successfully')
  } catch (err) {
    console.error('[MONTHLY_MONITORING_POST]', err)
    return errors.internal()
  }
}
