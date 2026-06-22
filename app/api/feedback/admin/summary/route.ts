import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { summarizeLikertAnswers } from '@/lib/feedback/engine'
import type { Role, FeedbackLikertResponse } from '@prisma/client'

export async function GET(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'teachers', 'read')
  if (denied) return denied

  const cycleId = new URL(request.url).searchParams.get('cycleId')
  const cycle = cycleId
    ? await prisma.monthlyFeedbackCycle.findUnique({ where: { id: cycleId } })
    : await prisma.monthlyFeedbackCycle.findFirst({
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
      })

  const cycles = await prisma.monthlyFeedbackCycle.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: 24,
  })

  if (!cycle) return successResponse({ cycle: null, cycles, teachers: [], serviceFeedback: [], stats: null })

  // ── Teacher feedback (from student submissions) ───────────────────────────
  const submissions = await prisma.studentFeedbackSubmission.findMany({
    where: { cycleId: cycle.id },
    include: {
      answers: {
        include: {
          question: { select: { category: true, text: true } },
          targetTeacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              employeeId: true,
              campus: { select: { name: true } },
              batch: { select: { name: true } },
            },
          },
        },
      },
      student: {
        select: { id: true, firstName: true, lastName: true, rollNumber: true },
      },
    },
  })

  // Aggregate teacher-targeted answers
  const byTeacher = new Map<
    string,
    {
      teacher: NonNullable<typeof submissions[0]['answers'][0]['targetTeacher']>
      feedbackCount: number
      allAnswers: { response: FeedbackLikertResponse }[]
    }
  >()

  for (const sub of submissions) {
    for (const ans of sub.answers) {
      if (!ans.targetTeacher) continue
      const cur = byTeacher.get(ans.targetTeacher.id) ?? {
        teacher: ans.targetTeacher,
        feedbackCount: 0,
        allAnswers: [],
      }
      cur.allAnswers.push({ response: ans.response })
      byTeacher.set(ans.targetTeacher.id, cur)
    }
  }

  // Count unique submissions per teacher
  const submissionsByTeacher = new Map<string, Set<string>>()
  for (const sub of submissions) {
    for (const ans of sub.answers) {
      if (!ans.targetTeacher) continue
      const set = submissionsByTeacher.get(ans.targetTeacher.id) ?? new Set()
      set.add(sub.id)
      submissionsByTeacher.set(ans.targetTeacher.id, set)
    }
  }

  const teachers = Array.from(byTeacher.entries()).map(([teacherId, row]) => {
    const summary = summarizeLikertAnswers(row.allAnswers)
    return {
      teacher: row.teacher,
      feedbackCount: submissionsByTeacher.get(teacherId)?.size ?? 0,
      summary,
      sentiment:
        summary.positivePct >= 70
          ? 'positive'
          : summary.negativePct >= 40
            ? 'negative'
            : 'mixed',
    }
  })
  teachers.sort((a, b) => b.summary.averageScore - a.summary.averageScore)

  // ── Service feedback (LMS + Academy — from both students and guardians) ───
  const serviceCategories = ['LMS_SERVICES', 'ACADEMY_SERVICES', 'MANAGEMENT', 'ACCOUNTS'] as const
  const serviceAnswers = await prisma.feedbackAnswer.findMany({
    where: {
      submission: { cycleId: cycle.id },
      question: { category: { in: [...serviceCategories] } },
    },
    include: {
      question: { select: { id: true, text: true, category: true } },
      submission: { select: { submitterRole: true } },
    },
  })

  // Group by category
  const byCategory = new Map<string, {
    category: string
    answers: { response: FeedbackLikertResponse }[]
    studentCount: number
    guardianCount: number
    questions: Map<string, { text: string; answers: { response: FeedbackLikertResponse }[] }>
  }>()

  for (const ans of serviceAnswers) {
    const cat = ans.question.category
    const cur = byCategory.get(cat) ?? {
      category: cat,
      answers: [],
      studentCount: 0,
      guardianCount: 0,
      questions: new Map(),
    }
    cur.answers.push({ response: ans.response })
    if (ans.submission.submitterRole === 'STUDENT') cur.studentCount++
    else cur.guardianCount++

    const qEntry = cur.questions.get(ans.question.id) ?? { text: ans.question.text, answers: [] }
    qEntry.answers.push({ response: ans.response })
    cur.questions.set(ans.question.id, qEntry)

    byCategory.set(cat, cur)
  }

  const serviceFeedback = Array.from(byCategory.values()).map((row) => ({
    category: row.category,
    summary: summarizeLikertAnswers(row.answers),
    studentResponses: row.studentCount,
    guardianResponses: row.guardianCount,
    questions: Array.from(row.questions.entries()).map(([id, q]) => ({
      id,
      text: q.text,
      summary: summarizeLikertAnswers(q.answers),
    })),
  }))

  // ── Response rate stats ───────────────────────────────────────────────────
  const totalStudentSubmissions = submissions.filter((s) => s.submitterRole === 'STUDENT').length
  const totalGuardianSubmissions = submissions.filter(
    (s) => s.submitterRole === 'PARENT' || s.submitterRole === 'GUARDIAN'
  ).length

  // Collect all suggestions
  const allSuggestions: { role: string; suggestions: Record<string, string> }[] = []
  for (const sub of submissions) {
    if (sub.suggestions && typeof sub.suggestions === 'object') {
      allSuggestions.push({
        role: sub.submitterRole,
        suggestions: sub.suggestions as Record<string, string>,
      })
    }
  }

  const stats = {
    totalSubmissions: submissions.length,
    studentSubmissions: totalStudentSubmissions,
    guardianSubmissions: totalGuardianSubmissions,
    suggestions: allSuggestions,
  }

  return successResponse({ cycle, cycles, teachers, serviceFeedback, stats })
}
