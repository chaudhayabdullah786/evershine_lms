/**
 * lib/services/academic-upgrades-service.ts
 * Academic Upgrades Service Layer
 *
 * Encapsulates all transactional business logic for the 8 LMS feature upgrades.
 * Every write operation is wrapped in a Prisma $transaction to guarantee
 * atomicity — partial writes that leave data in an inconsistent state are a
 * hard failure condition, not an acceptable trade-off.
 *
 * Method names are stable public API surface — routes and tests depend on them.
 * Rename only with a coordinated update across callers.
 *
 * Complexity: All rank calculations are O(n log n) due to sort.
 * All batch inserts use createMany (O(1) round trips).
 */

import { prisma } from '@/lib/prisma'
import { EnrollmentType, ResultDeclarationStatus } from '@prisma/client'
import { Decimal } from '@prisma/client/runtime/library'

// ─── Grade / batch helpers ────────────────────────────────────────────────────
function calculateGrade(pct: number): string {
  if (pct >= 90) return 'A+'
  if (pct >= 80) return 'A'
  if (pct >= 70) return 'B'
  if (pct >= 60) return 'C'
  if (pct >= 50) return 'D'
  return 'F'
}

function getPerformanceBatch(pct: number): string {
  if (pct >= 90) return 'EXCELLENT'
  if (pct >= 75) return 'VERY_GOOD'
  if (pct >= 50) return 'GOOD'
  return 'FAIL'
}

// ─────────────────────────────────────────────────────────────────────────────
// Input types (mirrors validated Zod output — avoids re-importing Zod in tests)
// ─────────────────────────────────────────────────────────────────────────────
export interface EnrollmentUpdateInput {
  studentId:      string
  academicYearId: string
  enrollmentType: EnrollmentType
  reason:         string
  updatedById:    string           // maps to changedById on EnrollmentTypeAuditLog
  courseScope?:   string
  timetableScope?: string
}

export interface DateSheetSlotInput {
  subjectOfferingId: string        // FK — required by ExamDateSheetSlot
  examDate:          string        // YYYY-MM-DD
  startTime:         string
  endTime:           string
  roomNumber?:       string
}

export interface SaveDateSheetInput {
  classSectionId: string
  examSessionId:  string
  title:          string
  slots:          DateSheetSlotInput[]
  createdById:    string           // Required FK on ExamDateSheet
}

export interface ScoreInput {
  subjectOfferingId: string        // FK — required by SubjectResult
  totalMarks:        number
  obtainedMarks:     number | null  // null = "Input Decide Later"
  isAbsent?:         boolean
  isNotApplicable?:  boolean
  remarks?:          string
}

export interface SubmitScoresInput {
  classSectionId: string
  examSessionId:  string
  studentId:      string
  scores:         ScoreInput[]
  teacherId:      string
}

export interface DailyPerformanceRecordInput {
  studentId: string
  score:     number
  isAbsent?: boolean
  remarks?:  string
}

export interface SubmitDailyPerformanceInput {
  subjectOfferingId: string
  date:              string
  records:           DailyPerformanceRecordInput[]
  teacherId:         string
}

export interface StudentTargetInput {
  studentId:        string
  targetGrade:      string
  targetPercentage?: number
}

export interface AssignTargetsInput {
  classSectionId:    string
  subjectOfferingId: string
  targets:           StudentTargetInput[]
  assignedById:      string
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 4: Enrollment Type Auditing
// ─────────────────────────────────────────────────────────────────────────────
export class AcademicUpgradesService {

  static async updateStudentEnrollmentType(input: EnrollmentUpdateInput) {
    return prisma.$transaction(async (tx) => {
      const enrollment = await tx.studentEnrollment.findFirst({
        where: { studentId: input.studentId, academicYearId: input.academicYearId },
      })
      if (!enrollment) {
        throw new Error('No enrollment found for this student in the specified academic year.')
      }

      const previousType = enrollment.enrollmentType as EnrollmentType

      await tx.studentEnrollment.update({
        where: { id: enrollment.id },
        data: {
          enrollmentType: input.enrollmentType,
          courseScope:    input.courseScope    ? { scope: input.courseScope }    : undefined,
          timetableScope: input.timetableScope ? { scope: input.timetableScope } : undefined,
        },
      })

      // Audit log — field name is changedById (NOT updatedById) per schema
      const auditLog = await tx.enrollmentTypeAuditLog.create({
        data: {
          studentId:   input.studentId,
          previousType,
          newType:     input.enrollmentType,
          changedById: input.updatedById,
          reason:      input.reason,
        },
      })

      return auditLog
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FEATURE 3: Exam Date Sheets
  // ─────────────────────────────────────────────────────────────────────────────
  static async saveDateSheet(input: SaveDateSheetInput) {
    return prisma.$transaction(async (tx) => {
      const dateSheet = await tx.examDateSheet.upsert({
        where: {
          classSectionId_examSessionId: {
            classSectionId: input.classSectionId,
            examSessionId:  input.examSessionId,
          },
        },
        create: {
          classSectionId: input.classSectionId,
          examSessionId:  input.examSessionId,
          title:          input.title,
          isPublished:    true,
          createdById:    input.createdById,
        },
        update: {
          title:       input.title,
          isPublished: true,
          version:     { increment: 1 },
        },
      })

      // Replace slots atomically
      await tx.examDateSheetSlot.deleteMany({ where: { dateSheetId: dateSheet.id } })

      if (input.slots.length > 0) {
        await tx.examDateSheetSlot.createMany({
          data: input.slots.map((s) => ({
            dateSheetId:       dateSheet.id,
            subjectOfferingId: s.subjectOfferingId,
            examDate:          new Date(s.examDate),
            startTime:         s.startTime,
            endTime:           s.endTime,
            roomNumber:        s.roomNumber ?? null,
          })),
        })
      }

      return dateSheet
    })
  }

  static async getDateSheetSlots(classSectionId: string, examSessionId: string) {
    const sheet = await prisma.examDateSheet.findUnique({
      where: { classSectionId_examSessionId: { classSectionId, examSessionId } },
      include: {
        slots: {
          include: { subjectOffering: { include: { subject: true } } },
          orderBy: { examDate: 'asc' },
        },
      },
    })
    return sheet?.slots ?? []
  }

  static async getStudentDateSheet(studentId: string, examSessionId?: string) {
    const enrollment = await prisma.studentEnrollment.findFirst({
      where: { studentId, status: 'ACTIVE' },
      select: { classSectionId: true },
    })
    if (!enrollment) throw new Error('Student has no active enrollment.')

    const sheet = await prisma.examDateSheet.findFirst({
      where: {
        classSectionId: enrollment.classSectionId,
        isPublished:    true,
        ...(examSessionId && { examSessionId }),
      },
      include: {
        slots: {
          include: { subjectOffering: { include: { subject: true } } },
          orderBy: { examDate: 'asc' },
        },
        overrides: { where: { studentId } },
      },
    })
    if (!sheet) return null

    // Merge base slots with any student-specific overrides
    const slots = sheet.slots.map((slot) => {
      const override = sheet.overrides.find(
        (o) => o.subjectOfferingId === slot.subjectOfferingId,
      )
      return override
        ? { ...slot, examDate: override.examDate, startTime: override.startTime, endTime: override.endTime, isOverridden: true }
        : { ...slot, isOverridden: false }
    })

    return { title: sheet.title, version: sheet.version, slots }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FEATURE 5: Term Results & Class Ranking
  // ─────────────────────────────────────────────────────────────────────────────
  static async submitStudentScores(input: SubmitScoresInput) {
    return prisma.$transaction(async (tx) => {
      // Ensure TermResult header row exists
      const termResult = await tx.termResult.upsert({
        where: {
          studentId_classSectionId_examSessionId: {
            studentId:      input.studentId,
            classSectionId: input.classSectionId,
            examSessionId:  input.examSessionId,
          },
        },
        create: {
          studentId:         input.studentId,
          classSectionId:    input.classSectionId,
          examSessionId:     input.examSessionId,
          overallPercentage: new Decimal(0),
          grade:             'F',
          performanceBatch:  'FAIL',
          declarationStatus: ResultDeclarationStatus.DRAFT,
        },
        update: {},
      })

      // Replace all subject results atomically
      await tx.subjectResult.deleteMany({ where: { termResultId: termResult.id } })

      let totalMaxMarks    = 0
      let totalObtained    = 0
      let hasDeferred      = false

      const rows = input.scores.map((s) => {
        const isAbsent        = s.isAbsent        ?? false
        const isNotApplicable = s.isNotApplicable ?? false

        let pct:   number | null = null
        let grade: string | null = null
        let batch: string | null = null

        if (!isNotApplicable) {
          if (isAbsent) {
            pct   = 0
            grade = 'F'
            batch = 'FAIL'
            totalMaxMarks += s.totalMarks
          } else if (s.obtainedMarks !== null) {
            pct   = (s.obtainedMarks / s.totalMarks) * 100
            grade = calculateGrade(pct)
            batch = getPerformanceBatch(pct)
            totalMaxMarks   += s.totalMarks
            totalObtained   += s.obtainedMarks
          } else {
            hasDeferred = true
          }
        }

        return {
          termResultId:      termResult.id,
          subjectOfferingId: s.subjectOfferingId,
          totalMarks:        s.totalMarks,
          obtainedMarks:     s.obtainedMarks !== null ? new Decimal(s.obtainedMarks) : null,
          isAbsent,
          isNotApplicable,
          percentage:        pct !== null ? new Decimal(pct) : null,
          grade,
          remarks:           s.remarks ?? null,
          performanceBatch:  batch,
        }
      })

      if (rows.length > 0) {
        await tx.subjectResult.createMany({ data: rows })
      }

      // Recalculate cumulative stats
      let overallPct   = 0
      let overallGrade = 'F'
      let overallBatch = 'FAIL'

      if (totalMaxMarks > 0 && !hasDeferred) {
        overallPct   = (totalObtained / totalMaxMarks) * 100
        overallGrade = calculateGrade(overallPct)
        overallBatch = getPerformanceBatch(overallPct)
      }

      return tx.termResult.update({
        where: { id: termResult.id },
        data: {
          overallPercentage: new Decimal(overallPct),
          grade:             overallGrade,
          performanceBatch:  overallBatch,
        },
        include: { subjectResults: true },
      })
    })
  }

  static async toggleResultDeclaration(
    classSectionId: string,
    examSessionId:  string,
    declare:        boolean,
  ) {
    return prisma.$transaction(async (tx) => {
      const status = declare
        ? ResultDeclarationStatus.DECLARED
        : ResultDeclarationStatus.DRAFT

      await tx.termResult.updateMany({
        where: { classSectionId, examSessionId },
        data:  { declarationStatus: status },
      })

      if (declare) {
        // Compute dense rank for class position
        const results = await tx.termResult.findMany({
          where:   { classSectionId, examSessionId },
          orderBy: { overallPercentage: 'desc' },
        })

        let rank = 1
        for (let i = 0; i < results.length; i++) {
          if (i > 0 && results[i].overallPercentage.toNumber() < results[i - 1].overallPercentage.toNumber()) {
            rank = i + 1
          }
          await tx.termResult.update({
            where: { id: results[i].id },
            data:  { classPosition: rank },
          })
        }
      } else {
        await tx.termResult.updateMany({
          where: { classSectionId, examSessionId },
          data:  { classPosition: null },
        })
      }

      return { declarationStatus: status }
    })
  }

  static async getStudentTermResults(studentId: string, examSessionId?: string, declaredOnly = false) {
    const whereClause: any = {
      studentId,
      ...(declaredOnly && { declarationStatus: 'DECLARED' }),
    }
    if (examSessionId && examSessionId !== 'all') {
      whereClause.examSessionId = examSessionId
      return prisma.termResult.findFirst({
        where: whereClause,
        include: {
          classSection: {
            select: {
              className: true,
              sectionName: true,
            }
          },
          subjectResults: {
            include: { subjectOffering: { include: { subject: true } } },
          },
        },
      })
    }

    return prisma.termResult.findMany({
      where: whereClause,
      include: {
        classSection: {
          select: {
            className: true,
            sectionName: true,
          }
        },
        subjectResults: {
          include: { subjectOffering: { include: { subject: true } } },
        },
      },
      orderBy: { examSessionId: 'desc' },
    })
  }

  static async getClassResultsSheet(classSectionId: string, examSessionId: string) {
    return prisma.termResult.findMany({
      where: { classSectionId, examSessionId },
      include: {
        student: {
          select: {
            id:                 true,
            firstName:          true,
            lastName:           true,
            rollNumber:         true,
            registrationNumber: true,
          },
        },
        subjectResults: {
          include: { subjectOffering: { include: { subject: true } } },
        },
      },
      orderBy: { classPosition: { sort: 'asc', nulls: 'last' } },
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FEATURE 6: Daily Performance Scoring
  // ─────────────────────────────────────────────────────────────────────────────
  static async submitDailyPerformance(input: SubmitDailyPerformanceInput) {
    return prisma.$transaction(async (tx) => {
      const date = new Date(input.date)

      // Fetch configurable max for this offering
      const offering = await tx.subjectOffering.findUnique({
        where: { id: input.subjectOfferingId },
        select: { maxDailyScore: true },
      })
      if (!offering) throw new Error('Subject offering not found')

      const maxScore = offering.maxDailyScore

      // Validate all scores against the dynamic max
      for (const r of input.records) {
        if (!r.isAbsent && r.score > maxScore) {
          throw new Error(
            `Score ${r.score} exceeds the maximum allowed marks (${maxScore}) for this subject offering`
          )
        }
      }

      // Replace that day's records atomically
      await tx.dailyPerformanceScore.deleteMany({
        where: { subjectOfferingId: input.subjectOfferingId, date },
      })

      const data = input.records.map((r) => ({
        subjectOfferingId: input.subjectOfferingId,
        studentId:         r.studentId,
        date,
        score:             new Decimal(r.score),
        isAbsent:          r.isAbsent ?? false,
        remarks:           r.remarks  ?? null,
        markedById:        input.teacherId,
      }))

      if (data.length > 0) {
        await tx.dailyPerformanceScore.createMany({ data })
      }

      return { count: data.length, date: input.date }
    })
  }

  static async getStudentDailyPerformanceLogs(
    studentId:         string,
    subjectOfferingId?: string,
    startDate?:        Date,
    endDate?:          Date,
  ) {
    return prisma.dailyPerformanceScore.findMany({
      where: {
        studentId,
        ...(subjectOfferingId && { subjectOfferingId }),
        ...((startDate || endDate) && {
          date: {
            ...(startDate && { gte: startDate }),
            ...(endDate   && { lte: endDate }),
          },
        }),
      },
      include: {
        subjectOffering: { include: { subject: true } },
      },
      orderBy: { date: 'desc' },
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FEATURE 7: Monthly Test Comparison Report
  // Time complexity: O(n) student lookups after two O(n) DB reads.
  // ─────────────────────────────────────────────────────────────────────────────
  static async getMonthlyTestComparisonReport(
    classSectionId:        string,
    currentExamSessionId:  string,
    previousExamSessionId: string,
  ) {
    const [currentResults, previousResults] = await Promise.all([
      prisma.termResult.findMany({
        where: { classSectionId, examSessionId: currentExamSessionId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, rollNumber: true } },
          subjectResults: { include: { subjectOffering: { include: { subject: true } } } },
        },
      }),
      prisma.termResult.findMany({
        where: { classSectionId, examSessionId: previousExamSessionId },
        include: {
          student: { select: { id: true, firstName: true, lastName: true } },
          subjectResults: { include: { subjectOffering: { include: { subject: true } } } },
        },
      }),
    ])

    const calcStats = (list: any[]) => {
      if (list.length === 0) return { total: 0, pass: 0, fail: 0, avg: 0 }
      let pass = 0, fail = 0, sum = 0
      for (const r of list) {
        const p = r.overallPercentage.toNumber()
        sum += p
        p >= 50 ? pass++ : fail++
      }
      return { total: list.length, pass, fail, avg: Math.round((sum / list.length) * 10) / 10 }
    }

    // Index by studentId for O(1) lookup
    const prevMap = new Map(previousResults.map((r) => [r.studentId, r]))

    const details = currentResults.map((cur) => {
      const prev = prevMap.get(cur.studentId)
      const curPct  = cur.overallPercentage.toNumber()
      const prevPct = prev ? prev.overallPercentage.toNumber() : null

      return {
        studentId:   cur.studentId,
        rollNumber:  cur.student.rollNumber ?? '—',
        name:        `${cur.student.firstName} ${cur.student.lastName}`,
        previous:    prev
          ? { percentage: prevPct!.toFixed(1), grade: prev.grade, status: prevPct! >= 50 ? 'PASS' : 'FAIL' }
          : null,
        current:     {
          percentage: curPct.toFixed(1),
          grade:      cur.grade,
          status:     curPct >= 50 ? 'PASS' : 'FAIL',
        },
        improvement: prev && prevPct !== null
          ? Math.round((curPct - prevPct) * 10) / 10
          : null,
      }
    })

    return {
      aggregates: {
        previous: calcStats(previousResults),
        current:  calcStats(currentResults),
      },
      details,
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // FEATURE 8: Marks Achievement Targets
  // ─────────────────────────────────────────────────────────────────────────────
  static async assignTargets(input: AssignTargetsInput) {
    // Grade → percentage boundary lookup
    const gradeBounds: Record<string, [number, number]> = {
      'A+': [90, 100],
      'A':  [80, 89.9],
      'B':  [70, 79.9],
      'C':  [60, 69.9],
      'D':  [50, 59.9],
    }

    return prisma.$transaction(async (tx) => {
      const saved = []
      for (const t of input.targets) {
        const [minPct, maxPct] = gradeBounds[t.targetGrade] ?? [50, 100]
        const record = await tx.targetAssignment.upsert({
          where: {
            studentId_subjectOfferingId: {
              studentId:        t.studentId,
              subjectOfferingId: input.subjectOfferingId,
            },
          },
          create: {
            studentId:        t.studentId,
            subjectOfferingId: input.subjectOfferingId,
            targetGrade:      t.targetGrade,
            minPercentage:    new Decimal(minPct),
            maxPercentage:    new Decimal(maxPct),
            assignedById:     input.assignedById,
          },
          update: {
            targetGrade:   t.targetGrade,
            minPercentage: new Decimal(minPct),
            maxPercentage: new Decimal(maxPct),
            assignedById:  input.assignedById,
          },
        })
        saved.push(record)
      }
      return saved
    })
  }

  static async getTargetAchievementAnalysis(classSectionId: string, subjectOfferingId?: string) {
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { classSectionId, status: 'ACTIVE' },
      include: {
        student: {
          include: {
            targetAssignments: {
              where: subjectOfferingId ? { subjectOfferingId } : {},
            },
            termResults: {
              where: { classSectionId, declarationStatus: ResultDeclarationStatus.DECLARED },
              include: {
                subjectResults: subjectOfferingId
                  ? { where: { subjectOfferingId }, include: { subjectOffering: { include: { subject: true } } } }
                  : true,
              },
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
      },
    })

    let met = 0, unmet = 0, noTarget = 0

    const details = enrollments.map((enr) => {
      const student = enr.student
      const target  = student.targetAssignments[0] ?? null
      const result  = student.termResults[0] ?? null

      let actualPct:   number | null = null
      let actualGrade: string | null = null

      if (result) {
        if (subjectOfferingId && result.subjectResults.length > 0) {
          const sr = result.subjectResults[0]
          actualPct   = sr.percentage?.toNumber() ?? null
          actualGrade = sr.grade ?? null
        } else {
          actualPct   = result.overallPercentage.toNumber()
          actualGrade = result.grade
        }
      }

      let status: string
      if (!target) {
        noTarget++
        status = 'NO_TARGET'
      } else if (actualPct === null) {
        status = 'NO_RESULT'
      } else {
        const achieved = actualPct >= target.minPercentage.toNumber()
        status = achieved ? 'MET' : 'UNMET'
        achieved ? met++ : unmet++
      }

      return {
        studentId:   student.id,
        name:        `${student.firstName} ${student.lastName}`,
        rollNumber:  enr.rollNumber ?? '—',
        targetGrade: target?.targetGrade ?? '—',
        targetRange: target
          ? `${target.minPercentage.toFixed(0)}%–${target.maxPercentage.toFixed(0)}%`
          : '—',
        actualPercentage: actualPct !== null ? `${actualPct.toFixed(1)}%` : '—',
        actualGrade:      actualGrade ?? '—',
        status,
      }
    })

    return {
      summary: { met, unmet, noTarget, total: enrollments.length },
      details,
    }
  }
}
