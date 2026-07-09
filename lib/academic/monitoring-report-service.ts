import { prisma } from '@/lib/prisma'
import {
  decodeMonitoringRemarks,
  derivePerformanceGroup,
  monitoringStatusCriteria,
} from '@/lib/academic/monitoring'

export type MonitoringReportKind = 'daily' | 'monthly' | 'yearly'

type BuildStudentMonitoringOptions = {
  type: MonitoringReportKind
  date?: string | null
  month?: number | null
  year?: number | null
}

function startOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function endOfDay(date: Date) {
  const copy = new Date(date)
  copy.setHours(23, 59, 59, 999)
  return copy
}

function periodFromOptions(options: BuildStudentMonitoringOptions) {
  const year = options.year ?? new Date().getFullYear()
  if (options.type === 'daily') {
    const day = options.date ? new Date(options.date) : new Date()
    return { start: startOfDay(day), end: endOfDay(day), label: day.toISOString().slice(0, 10) }
  }

  if (options.type === 'yearly') {
    return {
      start: new Date(year, 0, 1),
      end: new Date(year, 11, 31, 23, 59, 59, 999),
      label: String(year),
    }
  }

  const month = options.month ?? (new Date().getMonth() + 1)
  return {
    start: new Date(year, month - 1, 1),
    end: new Date(year, month, 0, 23, 59, 59, 999),
    label: `${year}-${String(month).padStart(2, '0')}`,
  }
}

export async function buildStudentMonitoringReport(studentId: string, options: BuildStudentMonitoringOptions) {
  const enrollment = await prisma.studentEnrollment.findFirst({
    where: { studentId, status: 'ACTIVE' },
    include: {
      academicYear: { select: { id: true, name: true } },
      classSection: { select: { id: true, className: true, sectionName: true } },
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
    orderBy: { createdAt: 'desc' },
  })

  if (!enrollment) {
    return {
      type: options.type,
      report: null,
      message: 'No active academic enrollment found for this student.',
    }
  }

  const period = periodFromOptions(options)
  const offerings = await prisma.subjectOffering.findMany({
    where: {
      classSectionId: enrollment.classSectionId,
      academicYearId: enrollment.academicYearId,
    },
    include: { subject: { select: { id: true, name: true, code: true } } },
    orderBy: { subject: { name: 'asc' } },
  })

  const scores = await prisma.dailyPerformanceScore.findMany({
    where: {
      studentId,
      subjectOfferingId: { in: offerings.map((offering) => offering.id) },
      date: { gte: period.start, lte: period.end },
    },
    orderBy: { date: 'asc' },
  })

  if (options.type === 'daily') {
    const subjectReports = offerings.map((offering) => {
      const score = scores.find((item) => item.subjectOfferingId === offering.id)
      const metadata = decodeMonitoringRemarks(score?.remarks, score ? Number(score.score) : null, offering.maxDailyScore)
      return {
        subjectId: offering.subject.id,
        subjectOfferingId: offering.id,
        subjectName: offering.subject.name,
        subjectCode: offering.subject.code,
        performanceGrade: metadata.grade,
        performanceLabel: metadata.grade,
        remarks: metadata.remarks,
        isAbsent: score?.isAbsent ?? false,
        isStarOfDay: metadata.isStarOfDay,
        isConcern: metadata.isConcern,
      }
    })

    return {
      type: 'daily' as const,
      periodLabel: period.label,
      classSection: enrollment.classSection,
      academicYear: enrollment.academicYear,
      student: enrollment.student,
      subjects: subjectReports,
      highlights: {
        isStarOfDay: subjectReports.some((item) => item.isStarOfDay),
        isConcern: subjectReports.some((item) => item.isConcern),
      },
    }
  }

  const aggregateSubjects = offerings.map((offering) => {
    const offeringScores = scores.filter((item) => item.subjectOfferingId === offering.id)
    const obtainedMarks = offeringScores.reduce((sum, item) => sum + Number(item.score), 0)
    const scoringDays = new Set(offeringScores.map((item) => item.date.toISOString().slice(0, 10))).size
    const totalMarks = scoringDays * offering.maxDailyScore
    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 10000) / 100 : 0

    const remarks = Array.from(new Set(
      offeringScores
        .map((item) => decodeMonitoringRemarks(item.remarks, Number(item.score), offering.maxDailyScore).remarks)
        .filter(Boolean)
    ))

    return {
      id: offering.id,
      subjectId: offering.subject.id,
      name: offering.subject.name,
      code: offering.subject.code,
      obtainedMarks,
      totalMarks,
      percentage,
      performanceBatch: derivePerformanceGroup(percentage),
      remarks: remarks.join('; '),
    }
  })

  const totalObtained = aggregateSubjects.reduce((sum, subject) => sum + subject.obtainedMarks, 0)
  const totalPossible = aggregateSubjects.reduce((sum, subject) => sum + subject.totalMarks, 0)
  const percentage = totalPossible > 0 ? Math.round((totalObtained / totalPossible) * 10000) / 100 : 0

  return {
    type: options.type,
    periodLabel: period.label,
    classSection: enrollment.classSection,
    academicYear: enrollment.academicYear,
    student: enrollment.student,
    subjects: aggregateSubjects,
    summary: {
      totalMarks: totalPossible,
      obtainedMarks: totalObtained,
      percentage,
      performanceBatch: derivePerformanceGroup(percentage),
    },
    statusCriteria: monitoringStatusCriteria(),
  }
}
