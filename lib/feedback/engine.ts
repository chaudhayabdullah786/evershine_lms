import { prisma } from '@/lib/prisma'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import type { FeedbackLikertResponse } from '@prisma/client'

const DEFAULT_QUESTIONS = [
  'The teacher explains concepts clearly.',
  'The teacher is punctual and well-prepared for class.',
  'The teacher treats students with respect.',
  'I am satisfied with this teacher’s teaching overall.',
  'The teacher provides helpful feedback on my work.',
]

const LIKERT_SCORE: Record<FeedbackLikertResponse, number> = {
  STRONGLY_AGREE: 2,
  AGREE: 1,
  NEUTRAL: 0,
  DISAGREE: -1,
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** Ensure default questionnaire exists. */
export async function ensureFeedbackQuestions(): Promise<number> {
  const count = await prisma.feedbackQuestion.count({ where: { isActive: true } })
  if (count > 0) return count

  await prisma.$transaction(
    DEFAULT_QUESTIONS.map((text, orderIndex) =>
      prisma.feedbackQuestion.create({ data: { text, orderIndex, isActive: true } })
    )
  )
  return DEFAULT_QUESTIONS.length
}

/**
 * Open cycle for the previous calendar month (forced feedback after month ends).
 * Also ensures current month cycle exists for preview.
 */
export async function ensureMonthlyFeedbackCycles(): Promise<void> {
  await ensureFeedbackQuestions()
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const cycles = [
    { year: prev.getFullYear(), month: prev.getMonth() + 1, isOpen: true },
    { year: now.getFullYear(), month: now.getMonth() + 1, isOpen: false },
  ]

  for (const c of cycles) {
    await prisma.monthlyFeedbackCycle.upsert({
      where: { year_month: { year: c.year, month: c.month } },
      create: {
        year: c.year,
        month: c.month,
        label: monthLabel(c.year, c.month),
        isOpen: c.isOpen,
        opensAt: new Date(c.year, c.month - 1, 1),
      },
      update: { isOpen: c.isOpen, label: monthLabel(c.year, c.month) },
    })
  }
}

/** Sync institution shift windows to canonical defaults (admin-configurable afterward). */
export async function syncInstitutionShiftTimes(): Promise<number> {
  const { SESSION_SHIFT_TIMES } = await import('@/lib/validation/shift')
  let updated = 0
  for (const code of ['MORNING', 'EVENING', 'NIGHT'] as const) {
    const result = await prisma.shift.updateMany({
      where: { code },
      data: {
        startTime: SESSION_SHIFT_TIMES[code].start,
        endTime: SESSION_SHIFT_TIMES[code].end,
      },
    })
    updated += result.count
  }
  return updated
}

export type PendingTeacherFeedback = {
  teacherId: string
  teacherName: string
  studentEnrollmentId: string
  classSectionLabel: string
  campusName: string
  batchName: string
  shiftName: string
  subjects: string[]
}

/** Teachers the student must rate for an open cycle (from approved subject enrollments). */
export async function getPendingTeachersForStudent(
  studentId: string,
  cycleId: string
): Promise<PendingTeacherFeedback[]> {
  const activeYear = await getActiveAcademicYear()
  if (!activeYear) return []

  const enrollments = await prisma.studentEnrollment.findMany({
    where: {
      studentId,
      academicYearId: activeYear.id,
      status: 'ACTIVE',
    },
    include: {
      classSection: {
        include: { campus: true, batch: true, shift: true },
      },
      subjectEnrollments: {
        where: { status: 'APPROVED' },
        include: {
          subjectOffering: {
            include: {
              subject: true,
              teacher: { select: { id: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  })

  const submitted = await prisma.feedbackAnswer.findMany({
    where: {
      targetTeacherId: { not: null },
      submission: { cycleId, studentId },
    },
    select: { targetTeacherId: true },
  })
  const submittedSet = new Set(submitted.map((s) => s.targetTeacherId).filter(Boolean))

  const map = new Map<string, PendingTeacherFeedback>()

  for (const enr of enrollments) {
    const section = enr.classSection
    for (const se of enr.subjectEnrollments) {
      const teacher = se.subjectOffering.teacher
      if (!teacher) continue
      if (submittedSet.has(teacher.id)) continue

      const key = `${teacher.id}:${enr.id}`
      const existing = map.get(key)
      const subjectName = se.subjectOffering.subject.name
      if (existing) {
        if (!existing.subjects.includes(subjectName)) {
          existing.subjects.push(subjectName)
        }
        continue
      }

      map.set(key, {
        teacherId: teacher.id,
        teacherName: `${teacher.firstName} ${teacher.lastName}`,
        studentEnrollmentId: enr.id,
        classSectionLabel: `${section.className}-${section.sectionName}`,
        campusName: section.campus.name,
        batchName: section.batch.name,
        shiftName: section.shift.name,
        subjects: [subjectName],
      })
    }
  }

  return Array.from(map.values())
}

export async function getOpenFeedbackCycleForStudents() {
  await ensureMonthlyFeedbackCycles()
  return prisma.monthlyFeedbackCycle.findFirst({
    where: { isOpen: true },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })
}

export function summarizeLikertAnswers(
  answers: { response: FeedbackLikertResponse }[]
): {
  averageScore: number
  positivePct: number
  negativePct: number
  neutralPct: number
  total: number
} {
  if (answers.length === 0) {
    return { averageScore: 0, positivePct: 0, negativePct: 0, neutralPct: 0, total: 0 }
  }
  let sum = 0
  let positive = 0
  let negative = 0
  let neutral = 0
  for (const a of answers) {
    sum += LIKERT_SCORE[a.response]
    if (a.response === 'STRONGLY_AGREE' || a.response === 'AGREE') positive++
    else if (a.response === 'DISAGREE') negative++
    else neutral++
  }
  const total = answers.length
  const maxScore = 2
  const avgNorm = ((sum / total + maxScore) / (2 * maxScore)) * 100
  return {
    averageScore: Number(avgNorm.toFixed(1)),
    positivePct: Number(((positive / total) * 100).toFixed(1)),
    negativePct: Number(((negative / total) * 100).toFixed(1)),
    neutralPct: Number(((neutral / total) * 100).toFixed(1)),
    total,
  }
}
