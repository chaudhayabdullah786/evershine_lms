/**
 * GET  /api/teacher-portal/monthly-monitoring
 *   ?classSectionId&month&year&academicYearId
 *   — Aggregates DailyPerformanceScore data for the period.
 *     Returns student rows with per-subject scores matching
 *     the monthly monitering report.jpeg grid format.
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

const saveSchema = z.object({
  classSectionId: z.string().min(1),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020),
  academicYearId: z.string().min(1),
  reportData: z.any(),
})

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
    const type = searchParams.get('type') ?? 'monthly'
    const dateStr = searchParams.get('date')
    const month = parseInt(searchParams.get('month') ?? '0')
    const year = parseInt(searchParams.get('year') ?? '0')

    if (!classSectionId || !academicYearId) {
      return errors.badRequest('classSectionId and academicYearId are required')
    }

    let periodStart: Date
    let periodEnd: Date
    let isDaily = type === 'daily'

    if (isDaily) {
      if (!dateStr) return errors.badRequest('date is required for daily monitoring')
      periodStart = new Date(dateStr)
      periodStart.setHours(0,0,0,0)
      periodEnd = new Date(dateStr)
      periodEnd.setHours(23,59,59,999)
    } else {
      if (!month || !year) return errors.badRequest('month and year are required for monthly monitoring')
      periodStart = new Date(year, month - 1, 1)
      periodEnd = new Date(year, month, 0) // last day of month
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
      where: { classSectionId, academicYearId },
      include: { subject: { select: { name: true, code: true } } },
      orderBy: { subject: { name: 'asc' } },
    })

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

    // 4. Build per-student row — sum scores per subject
    // WHY distinct day counting: For monthly aggregation, each day's PST score
    // is out of offering.maxDailyScore. If a student has 25 entries across the
    // month, the total possible is 25 × maxDailyScore per subject.
    // For daily mode (single day), it's exactly maxDailyScore per subject offering.

    // Pre-compute the distinct scoring dates per subject offering across ALL students
    // to establish a fair baseline (same total possible for all students).
    const scoringDaysPerOffering: Record<string, number> = {}
    for (const offering of offerings) {
      const offeringScores = scores.filter((s) => s.subjectOfferingId === offering.id)
      const distinctDays = new Set(offeringScores.map((s) => s.date.toISOString().split('T')[0]))
      // For daily mode there is at most 1 day; for monthly it is however many days had entries
      scoringDaysPerOffering[offering.id] = Math.max(distinctDays.size, isDaily ? 1 : 0)
    }

    const rows = enrollments.map((enrollment, index) => {
      const subjectScores: Record<string, number> = {}
      let totalObtained = 0
      let totalPossible = 0

      for (const offering of offerings) {
        const studentScores = scores.filter(
          (s) => s.studentId === enrollment.studentId && s.subjectOfferingId === offering.id
        )
        const subjectTotal = studentScores.reduce((sum, s) => sum + Number(s.score), 0)
        subjectScores[offering.id] = subjectTotal
        totalObtained += subjectTotal
        // Each scoring day contributes maxDailyScore possible marks per subject
        totalPossible += (scoringDaysPerOffering[offering.id] ?? 1) * offering.maxDailyScore
      }

      const percentage = totalPossible > 0 ? (totalObtained / totalPossible) * 100 : 0

      return {
        serial: index + 1,
        studentId: enrollment.studentId,
        name: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        fatherName: enrollment.student.fatherName,
        rollNumber: enrollment.student.rollNumber ?? '',
        subjectScores,
        totalMarks: totalPossible,
        obtainedMarks: totalObtained,
        percentage: Math.round(percentage * 100) / 100,
        performanceBatch: derivePerformanceBatch(percentage),
        rank: 0,
      }
    })

    // 5. Assign ranks
    const sorted = [...rows].sort((a, b) => b.obtainedMarks - a.obtainedMarks)
    sorted.forEach((row, i) => {
      const original = rows.find((r) => r.studentId === row.studentId)
      if (original) original.rank = i + 1
    })

    return successResponse({
      month: isDaily ? undefined : month,
      year: isDaily ? undefined : year,
      date: isDaily ? dateStr : undefined,
      type,
      classSectionId,
      subjects: offerings.map((o) => ({
        id: o.id,
        name: o.subject.name,
        code: o.subject.code,
        maxDailyScore: o.maxDailyScore,
      })),
      students: rows,
      statusCriteria: [
        { label: 'Ever Shine', min: 90, max: 100 },
        { label: 'Quaid', min: 75, max: 89 },
        { label: 'Iqbal', min: 50, max: 74 },
        { label: 'Improvement', min: 0, max: 49 },
      ],
    }, `${isDaily ? 'Daily' : 'Monthly'} monitoring report aggregated successfully`)
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

    const report = await prisma.monthlyMonitoringReport.upsert({
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
        reportData: parsed.data.reportData ?? {},
      },
      update: {
        generatedById: session.user.id,
        reportData: parsed.data.reportData ?? {},
      },
    })

    return createdResponse(report, 'Monthly monitoring report saved successfully')
  } catch (err) {
    console.error('[MONTHLY_MONITORING_POST]', err)
    return errors.internal()
  }
}
