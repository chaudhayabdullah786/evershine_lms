'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { AccessDenied } from '@/components/AccessDenied'
import { LIKERT_LABELS } from '@/lib/validation/feedback'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notify'
import { Users, BarChart2, MessageSquareHeart, TrendingUp, TrendingDown, Minus } from 'lucide-react'

type Cycle = { id: string; label: string; year: number; month: number; isOpen: boolean }

type TeacherRow = {
  teacher: {
    id: string
    firstName: string
    lastName: string
    employeeId: string
    campus: { name: string }
    batch?: { name: string } | null
  }
  feedbackCount: number
  summary: { averageScore: number; positivePct: number; negativePct: number; neutralPct: number }
  sentiment: 'positive' | 'negative' | 'mixed'
}

type ServiceRow = {
  category: string
  summary: { averageScore: number; positivePct: number; negativePct: number; neutralPct: number }
  studentResponses: number
  guardianResponses: number
  questions: Array<{
    id: string
    text: string
    summary: { averageScore: number; positivePct: number; negativePct: number; neutralPct: number }
  }>
}

type SummaryStats = {
  totalSubmissions: number
  studentSubmissions: number
  guardianSubmissions: number
  suggestions: Array<{ role: string; suggestions: Record<string, string> }>
}

type SummaryData = {
  cycle: Cycle | null
  cycles: Cycle[]
  teachers: TeacherRow[]
  serviceFeedback: ServiceRow[]
  stats: SummaryStats | null
}

const CATEGORY_LABELS: Record<string, string> = {
  LMS_SERVICES: 'LMS & Digital Services',
  ACADEMY_SERVICES: 'Academy Services & Facilities',
  MANAGEMENT: 'Management',
  ACCOUNTS: 'Accounts',
}

export default function FeedbackHubPage() {
  const { data: session } = useSession()
  const role = session?.user?.role
  const canReviewFeedback = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const qc = useQueryClient()
  const [cycleId, setCycleId] = useState('')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('teachers')

  const { data: summary } = useQuery<SummaryData>({
    queryKey: ['feedback-admin-summary', cycleId],
    queryFn: () =>
      fetchApi<SummaryData>(
        `/api/feedback/admin/summary${cycleId ? `?cycleId=${cycleId}` : ''}`
      ),
    enabled: canReviewFeedback,
  })

  const { data: detail } = useQuery({
    queryKey: ['feedback-teacher-detail', selectedTeacherId, cycleId],
    queryFn: () =>
      fetchApi<{
        teacher: TeacherRow['teacher']
        summary: TeacherRow['summary']
        submissions: Array<{
          id: string
          submittedAt: string
          comments: string | null
          student: { firstName: string; lastName: string; rollNumber: string | null }
          placement: { campus: string; batch: string; section: string; shift: string }
          answers: Array<{ question: string; response: keyof typeof LIKERT_LABELS }>
        }>
      }>(
        `/api/feedback/admin/teachers/${selectedTeacherId}?cycleId=${summary?.cycle?.id ?? cycleId}`
      ),
    enabled: !!selectedTeacherId && !!(summary?.cycle?.id ?? cycleId),
  })

  const activeCycleId = cycleId || summary?.cycle?.id || ''
  const selectedCycle = (summary?.cycles ?? []).find((c) => c.id === activeCycleId) ?? summary?.cycle

  const toggleCycle = useMutation({
    mutationFn: (payload: { id: string; isOpen: boolean }) =>
      fetchApi(`/api/feedback/admin/cycles/${payload.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isOpen: payload.isOpen }),
      }),
    onSuccess: () => {
      notify.success('Feedback period updated.')
      qc.invalidateQueries({ queryKey: ['feedback-admin-summary'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const sentimentClass = (s: string) =>
    s === 'positive'
      ? 'bg-green-100 text-green-800'
      : s === 'negative'
        ? 'bg-red-100 text-red-800'
        : 'bg-amber-100 text-amber-800'

  const stats = summary?.stats

  if (!canReviewFeedback) {
    return <AccessDenied title="Feedback Hub" message="Administrators review monthly feedback here." />
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <MessageSquareHeart className="w-6 h-6 text-violet-600" /> Feedback Hub
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Review confidential feedback from students and guardians. Aggregated insights help drive data-driven meetings.
        </p>
      </div>

      {/* Summary Stats */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Total Responses</p>
              <p className="text-3xl font-black text-blue-900 mt-1">{stats.totalSubmissions}</p>
              <p className="text-xs text-blue-500 mt-1">
                {stats.studentSubmissions} students · {stats.guardianSubmissions} guardians
              </p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-green-600 uppercase tracking-wider">Teacher Reviews</p>
              <p className="text-3xl font-black text-green-900 mt-1">{(summary?.teachers ?? []).length}</p>
              <p className="text-xs text-green-500 mt-1">Teachers evaluated this period</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-violet-50 to-purple-50 border-violet-200">
            <CardContent className="p-5">
              <p className="text-xs font-bold text-violet-600 uppercase tracking-wider">Service Categories</p>
              <p className="text-3xl font-black text-violet-900 mt-1">{(summary?.serviceFeedback ?? []).length}</p>
              <p className="text-xs text-violet-500 mt-1">LMS, Academy, Management, Accounts</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Cycle Selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feedback Period</CardTitle>
          <CardDescription>Open cycles require students and guardians to submit feedback.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <Select
            value={activeCycleId}
            onValueChange={(v) => {
              setCycleId(v)
              setSelectedTeacherId(null)
            }}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {(summary?.cycles ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label} {c.isOpen ? '(open)' : '(closed)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedCycle && (
            <Button
              variant={selectedCycle.isOpen ? 'destructive' : 'default'}
              disabled={toggleCycle.isPending}
              onClick={() =>
                toggleCycle.mutate({ id: selectedCycle.id, isOpen: !selectedCycle.isOpen })
              }
            >
              {selectedCycle.isOpen ? 'Close feedback period' : 'Open feedback period'}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Tabbed Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="teachers" className="gap-1.5 text-xs sm:text-sm">
            <Users className="w-4 h-4" /> Teacher Feedback
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-1.5 text-xs sm:text-sm">
            <BarChart2 className="w-4 h-4" /> Service Feedback
          </TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-1.5 text-xs sm:text-sm">
            <MessageSquareHeart className="w-4 h-4" /> Suggestions
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Teacher Feedback ───────────────────────────── */}
        <TabsContent value="teachers" className="mt-4">
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Teachers Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[32rem] overflow-y-auto">
                {(summary?.teachers ?? []).length === 0 ? (
                  <p className="text-sm text-gray-500">No teacher feedback for this period yet.</p>
                ) : (
                  (summary?.teachers ?? []).map((row) => (
                    <button
                      key={row.teacher.id}
                      type="button"
                      onClick={() => setSelectedTeacherId(row.teacher.id)}
                      className={`w-full text-left border rounded-lg p-3 hover:bg-gray-50 transition-colors ${
                        selectedTeacherId === row.teacher.id ? 'ring-2 ring-blue-500' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <p className="font-semibold text-sm">
                            {row.teacher.firstName} {row.teacher.lastName}
                          </p>
                          <p className="text-xs text-gray-500">
                            {row.teacher.campus.name}
                            {row.teacher.batch ? ` · ${row.teacher.batch.name}` : ''} · {row.feedbackCount} responses
                          </p>
                        </div>
                        <Badge className={sentimentClass(row.sentiment)}>{row.sentiment}</Badge>
                      </div>
                      <p className="text-xs mt-2 text-gray-600">
                        Score {row.summary.averageScore}% · 👍 {row.summary.positivePct}% · 👎 {row.summary.negativePct}%
                      </p>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Student Submissions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-h-[32rem] overflow-y-auto">
                {!selectedTeacherId ? (
                  <p className="text-sm text-gray-500">Select a teacher to see submitted evaluations.</p>
                ) : (
                  (detail?.submissions ?? []).map((sub) => (
                    <div key={sub.id} className="border rounded-lg p-3 text-sm space-y-2">
                      <div className="flex justify-between">
                        <p className="font-semibold">
                          {sub.student.firstName} {sub.student.lastName}
                          {sub.student.rollNumber ? ` · ${sub.student.rollNumber}` : ''}
                        </p>
                        <span className="text-xs text-gray-400">
                          {new Date(sub.submittedAt).toLocaleDateString()}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">
                        {sub.placement.campus} · {sub.placement.batch} · {sub.placement.section} · {sub.placement.shift}
                      </p>
                      <ul className="text-xs space-y-1">
                        {sub.answers.map((a, i) => (
                          <li key={i}>
                            {a.question} <span className="font-medium">{LIKERT_LABELS[a.response]}</span>
                          </li>
                        ))}
                      </ul>
                      {sub.comments && (
                        <p className="text-xs italic text-gray-600 border-t pt-2">{sub.comments}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Tab: Service Feedback ───────────────────────────── */}
        <TabsContent value="services" className="mt-4 space-y-4">
          {(summary?.serviceFeedback ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-gray-500 text-sm">
                No service feedback received for this period. Service feedback is collected from both students and guardians.
              </CardContent>
            </Card>
          ) : (
            (summary?.serviceFeedback ?? []).map((sf) => (
              <Card key={sf.category}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        {CATEGORY_LABELS[sf.category] || sf.category}
                      </CardTitle>
                      <CardDescription>
                        {sf.studentResponses} student · {sf.guardianResponses} guardian responses
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {sf.summary.averageScore >= 70 ? (
                        <TrendingUp className="w-5 h-5 text-green-600" />
                      ) : sf.summary.averageScore <= 40 ? (
                        <TrendingDown className="w-5 h-5 text-red-600" />
                      ) : (
                        <Minus className="w-5 h-5 text-amber-600" />
                      )}
                      <span className="text-xl font-black text-gray-900">{sf.summary.averageScore}%</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Score bar */}
                  <div className="flex gap-1 h-3 rounded-full overflow-hidden mb-4">
                    <div className="bg-green-400 transition-all" style={{ width: `${sf.summary.positivePct}%` }} />
                    <div className="bg-amber-300 transition-all" style={{ width: `${sf.summary.neutralPct}%` }} />
                    <div className="bg-red-400 transition-all" style={{ width: `${sf.summary.negativePct}%` }} />
                  </div>
                  <div className="flex gap-4 text-xs text-gray-500 mb-4">
                    <span>👍 {sf.summary.positivePct}% positive</span>
                    <span>😐 {sf.summary.neutralPct}% neutral</span>
                    <span>👎 {sf.summary.negativePct}% negative</span>
                  </div>

                  {/* Per-question breakdown */}
                  <div className="space-y-3">
                    {sf.questions.map((q) => (
                      <div key={q.id} className="border rounded-lg p-3">
                        <p className="text-sm font-medium text-gray-800 mb-2">{q.text}</p>
                        <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                          <div className="bg-green-400" style={{ width: `${q.summary.positivePct}%` }} />
                          <div className="bg-amber-300" style={{ width: `${q.summary.neutralPct}%` }} />
                          <div className="bg-red-400" style={{ width: `${q.summary.negativePct}%` }} />
                        </div>
                        <p className="text-[11px] text-gray-400 mt-1">
                          Score: {q.summary.averageScore}% · 👍 {q.summary.positivePct}% · 👎 {q.summary.negativePct}%
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* ── Tab: Suggestions ────────────────────────────────── */}
        <TabsContent value="suggestions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Written Suggestions</CardTitle>
              <CardDescription>
                Free-text feedback from students and guardians. Use these insights for monthly review meetings.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 max-h-[40rem] overflow-y-auto">
              {(!stats?.suggestions || stats.suggestions.length === 0) ? (
                <p className="text-sm text-gray-500">No written suggestions for this period.</p>
              ) : (
                stats.suggestions.map((entry, idx) => {
                  const entries = Object.entries(entry.suggestions).filter(([, v]) => v.trim())
                  if (entries.length === 0) return null
                  return (
                    <div key={idx} className="border rounded-lg p-4 space-y-2">
                      <Badge variant="outline" className="text-[10px]">
                        {entry.role === 'STUDENT' ? '🎓 Student' : '👨‍👩‍👧 Guardian'}
                      </Badge>
                      {entries.map(([cat, text]) => (
                        <div key={cat}>
                          <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                            {CATEGORY_LABELS[cat] || cat}
                          </p>
                          <p className="text-sm text-gray-700 mt-0.5">{text}</p>
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <p className="text-xs text-gray-500">
        Manage shift times under{' '}
        <Link href="/dashboard/academic?tab=shifts" className="text-blue-600 underline">
          Academic Engine → Shifts
        </Link>
        . Enroll students in multiple shifts via separate class sections per year.
      </p>
    </div>
  )
}
