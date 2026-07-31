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
import {
  Users, ClipboardCheck, BarChart2, Calendar, CreditCard, Loader2,
  Download, Plus, Send, Award, CheckCircle2, XCircle, BookOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadReportCardForEnrollment } from '@/lib/academic/download-report-card'
import { notify } from '@/lib/notify'
import { SESSION_SHIFT_LABELS } from '@/lib/validation/shift'
import Link from 'next/link'
import { FeePaymentDialog } from '@/components/features/guardian/FeePaymentDialog'
import { Upload, Clock } from 'lucide-react'
import { MonitoringReportPanel } from '@/components/academic/MonitoringReportPanel'

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Child = {
  id: string
  firstName: string
  lastName: string
  registrationNumber: string
  rollNumber: string | null
  campus: { name: string }
  batch: { name: string } | null
}

type ChildAcademic = {
  student: Child
  activeYear: { name: string } | null
  enrollmentId: string | null
  enrollment: {
    rollNumber: string
    deliveryMode: string
    classSection: {
      className: string
      sectionName: string
      shift?: { code: string }
    }
    subjectEnrollments: Array<{
      subjectOffering: { subject: { name: string }; teacher?: { firstName: string; lastName: string } }
    }>
  } | null
  attendance: {
    summary: { present: number; absent: number; late: number; attendancePct: number | null }
    records: Array<{ attendanceDate: string; status: string }>
  }
  results: Array<{ subjectName: string; percentage: number; grade: string; isPassed: boolean }>
  declaredResults: Array<{
    id: string
    examSessionId: string
    examSessionLabel: string
    sectionLabel: string
    shiftName: string | null
    declarationStatus: string
    overallPercentage: number
    grade: string
    classPosition: number | null
    performanceBatch: string | null
    teacherRemarks: string | null
    customFields: Array<{ label: string; value: string }>
    declaredAt: string | null
    subjects: Array<{
      id: string
      subjectName: string
      subjectCode: string | null
      totalMarks: number
      obtainedMarks: number | null
      percentage: number | null
      grade: string
      resultStatus: string
      isAbsent: boolean
      isNotApplicable: boolean
      remarks: string | null
    }>
  }>
  taskResults: Array<{
    id: string
    taskId: string
    title: string
    type: string
    dueDate: string | null
    maxMarks: number
    obtainedMarks: number
    percentage: number
    remarks: string | null
    subjectName: string
    subjectCode: string | null
    classLabel: string
    shiftName: string | null
    updatedAt: string
  }>
  overallPercentage: number | null
  timetable: Array<{
    dayOfWeek: number
    startTime: string
    endTime: string
    subjectOffering: { subject: { name: string } }
    teacher: { firstName: string; lastName: string }
  }>
  feeInvoices: Array<{
    id: string
    challanNumber: string
    month: string
    totalAmount: number
    paidAmount: number
    status: string
    dueDate: string
    penaltyAmount: number
    proofStatus: string | null
  }>
  monitoringReports: {
    daily: Array<{ date: string; courseName: string; remarks: string | null; grade: string | null; highlight: string | null }>
    monthly: Array<{
      id: string
      month: number
      year: number
      declaredAt: string | null
      columns: Array<{ id: string; label: string; type: 'COURSE' | 'CUSTOM' }>
      student: {
        courseMarks: Record<string, { totalMarks: number; obtainedMarks: number }>
        customValues: Record<string, string>
        remarks: string
        totalMarks: number
        obtainedMarks: number
        percentage: number
        performanceBatch: string
        rank: number
      }
    }>
  }
}

type ChildLeave = {
  id: string
  startDate: string
  endDate: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  reason: string
  remarks: string | null
  createdAt: string
}

export default function MyChildrenPage() {
  const { data: session, status } = useSession()
  const qc = useQueryClient()
  const [selectedChildId, setSelectedChildId] = useState('')
  const [downloadingCard, setDownloadingCard] = useState(false)
  const [showLeaveForm, setShowLeaveForm] = useState(false)
  const [leaveType, setLeaveType] = useState('CASUAL')
  const [leaveStart, setLeaveStart] = useState('')
  const [leaveEnd, setLeaveEnd] = useState('')
  const [leaveReason, setLeaveReason] = useState('')
  
  // Payment Proof Modal State
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [selectedInvoice, setSelectedInvoice] = useState<ChildAcademic['feeInvoices'][number] | null>(null)

  const role = session?.user?.role
  const allowed = role === 'PARENT' || role === 'GUARDIAN'

  const { data: children, isLoading: loadingChildren } = useQuery({
    queryKey: ['guardian-children'],
    queryFn: () => fetchApi<Child[]>('/api/guardian-portal/children'),
    enabled: allowed,
  })

  const childId = selectedChildId || children?.[0]?.id || ''

  const { data: childLeaves, isLoading: loadingChildLeaves } = useQuery({
    queryKey: ['guardian-child-leaves', childId],
    queryFn: () => fetchApi<ChildLeave[]>(`/api/guardian-portal/children/${childId}/leaves`),
    enabled: !!childId && allowed,
  })

  const { data: academic, isLoading: loadingAcademic } = useQuery({
    queryKey: ['guardian-child-academic', childId],
    queryFn: () => fetchApi<ChildAcademic>(`/api/guardian-portal/children/${childId}/academic`),
    enabled: !!childId && allowed,
  })
  const declaredResults = academic?.declaredResults ?? []


  const submitLeave = useMutation({
    mutationFn: (payload: { leaveType: string; startDate: string; endDate: string; reason: string }) =>
      fetchApi(`/api/guardian-portal/children/${childId}/leaves`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      notify.success('Leave application submitted successfully!')
      setShowLeaveForm(false)
      setLeaveType('CASUAL')
      setLeaveStart('')
      setLeaveEnd('')
      setLeaveReason('')
      qc.invalidateQueries({ queryKey: ['guardian-child-leaves', childId] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (status === 'loading') return null
  if (!allowed) {
    return (
      <AccessDenied
        title="My Children"
        message="Parents and guardians can monitor linked students' attendance, results, and fees here."
      />
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Users className="w-7 h-7 text-emerald-600" />
          My Children
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          View attendance, published results, timetable, and fee status (read-only).
        </p>
      </div>

      {loadingChildren ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading children…
        </div>
      ) : (children ?? []).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-gray-600">
            No students are linked to your account. Please contact the school office to link your child.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="pt-6">
              <Select value={childId} onValueChange={setSelectedChildId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select child" />
                </SelectTrigger>
                <SelectContent>
                  {(children ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName} · {c.registrationNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {loadingAcademic ? (
            <div className="flex items-center gap-2 text-gray-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading academic records…
            </div>
          ) : academic ? (
            <Tabs defaultValue="overview">
              <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <TabsList className="w-max min-w-full justify-start">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
                <TabsTrigger value="fees">Fees</TabsTrigger>
                <TabsTrigger value="leaves">Leaves</TabsTrigger>
              </TabsList>
              </div>

              <TabsContent value="overview" className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {academic.student.firstName} {academic.student.lastName}
                    </CardTitle>
                    <CardDescription>
                      {academic.activeYear?.name ?? 'No active year'} · {academic.student.campus.name}
                      {academic.student.batch ? ` · ${academic.student.batch.name}` : ''}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid sm:grid-cols-2 gap-4 text-sm">
                    {academic.enrollment ? (
                      <>
                        <div>
                          <p className="text-gray-500">Section</p>
                          <p className="font-semibold">
                            {academic.enrollment.classSection.className}-
                            {academic.enrollment.classSection.sectionName}
                          </p>
                        </div>
                        <div>
                          <p className="text-gray-500">Shift · Mode</p>
                          <p className="font-semibold">
                            {academic.enrollment.classSection.shift?.code
                              ? SESSION_SHIFT_LABELS[
                                  academic.enrollment.classSection.shift.code as keyof typeof SESSION_SHIFT_LABELS
                                ]
                              : '—'}{' '}
                            · {academic.enrollment.deliveryMode}
                          </p>
                        </div>
                      </>
                    ) : (
                      <p className="text-gray-500 sm:col-span-2">No enrollment for the active academic year.</p>
                    )}
                  </CardContent>
                </Card>

                {academic.timetable.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4" /> Timetable
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm space-y-1">
                      {academic.timetable.map((t) => (
                        <div key={`${t.dayOfWeek}-${t.startTime}`} className="flex justify-between border-b py-1">
                          <span>
                            {DAY_NAMES[t.dayOfWeek]} {t.startTime}–{t.endTime}
                          </span>
                          <span>{t.subjectOffering.subject.name}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="attendance" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardCheck className="w-5 h-5 text-green-600" />
                      Attendance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="mb-4 grid grid-cols-2 gap-3 text-center text-sm sm:grid-cols-4">
                      <div className="bg-green-50 rounded p-2">
                        <p className="font-bold text-green-700">{academic.attendance.summary.present}</p>
                        <p className="text-xs">Present</p>
                      </div>
                      <div className="bg-red-50 rounded p-2">
                        <p className="font-bold text-red-700">{academic.attendance.summary.absent}</p>
                        <p className="text-xs">Absent</p>
                      </div>
                      <div className="bg-yellow-50 rounded p-2">
                        <p className="font-bold text-yellow-700">{academic.attendance.summary.late}</p>
                        <p className="text-xs">Late</p>
                      </div>
                      <div className="bg-indigo-50 rounded p-2">
                        <p className="font-bold text-indigo-700">
                          {academic.attendance.summary.attendancePct != null
                            ? `${academic.attendance.summary.attendancePct}%`
                            : '—'}
                        </p>
                        <p className="text-xs">Rate</p>
                      </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto text-sm">
                      {academic.attendance.records.map((r, i) => (
                        <div key={i} className="flex justify-between py-1 border-b">
                          <span>{new Date(r.attendanceDate).toLocaleDateString('en-PK')}</span>
                          <Badge variant="outline">{r.status}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="results" className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart2 className="w-5 h-5 text-purple-600" />
                      Published Results
                    </CardTitle>
                    {academic.enrollmentId && (declaredResults.length > 0 || academic.results.length > 0) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-2 w-fit"
                        disabled={downloadingCard}
                        onClick={async () => {
                          setDownloadingCard(true)
                          try {
                            await downloadReportCardForEnrollment(academic.enrollmentId!)
                            notify.success('Report card downloaded')
                          } catch (e) {
                            notify.error(e instanceof Error ? e.message : 'Download failed')
                          } finally {
                            setDownloadingCard(false)
                          }
                        }}
                      >
                        {downloadingCard ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Download report card (PDF)
                      </Button>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {declaredResults.length === 0 ? (
                      academic.results.length === 0 ? (
                        <div className="rounded-xl border border-dashed bg-slate-50 px-4 py-8 text-center">
                          <BookOpen className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                          <p className="text-sm font-medium text-slate-700">No declared results yet</p>
                          <p className="mt-1 text-xs text-slate-500">Results appear here after the teacher declares them.</p>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {academic.results.map((result) => (
                            <div key={result.subjectName} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                              <span className="font-medium">{result.subjectName}</span>
                              <span className="flex items-center gap-2">
                                {result.percentage}% <Badge>{result.grade}</Badge>
                              </span>
                            </div>
                          ))}
                        </div>
                      )
                    ) : declaredResults.map((result) => (
                      <article key={result.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                        <div className="flex flex-col gap-3 border-b bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-sm font-bold text-slate-900">{result.examSessionLabel}</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {result.sectionLabel}{result.shiftName ? ` · ${result.shiftName}` : ''}
                              {result.declaredAt ? ` · Declared ${new Date(result.declaredAt).toLocaleDateString('en-PK')}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Overall</p>
                              <p className="text-xl font-bold text-purple-700">{result.overallPercentage.toFixed(1)}%</p>
                            </div>
                            <Badge className="px-3 py-1 text-sm">{result.grade}</Badge>
                          </div>
                        </div>

                        {(result.classPosition || result.performanceBatch) && (
                          <div className="flex flex-wrap gap-2 border-b px-4 py-3">
                            {result.classPosition ? (
                              <Badge variant="outline" className="gap-1.5">
                                <Award className="h-3.5 w-3.5" /> Class position #{result.classPosition}
                              </Badge>
                            ) : null}
                            {result.performanceBatch ? (
                              <Badge variant="outline">Batch: {result.performanceBatch}</Badge>
                            ) : null}
                          </div>
                        )}

                        <div className="divide-y">
                          {result.subjects.map((subject) => {
                            const status = subject.resultStatus.toLowerCase()
                            const isPassed = status === 'pass'
                            const marks = subject.isAbsent
                              ? 'Absent'
                              : subject.isNotApplicable
                                ? 'N/A'
                                : `${subject.obtainedMarks ?? 0}/${subject.totalMarks}`

                            return (
                              <div key={subject.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-slate-900">{subject.subjectName}</p>
                                  {subject.remarks ? <p className="text-xs text-slate-500">{subject.remarks}</p> : null}
                                </div>
                                <div className="flex items-center justify-between gap-3 sm:justify-end">
                                  <span className="text-sm font-semibold text-slate-700">{marks}</span>
                                  <Badge variant="outline">{subject.grade}</Badge>
                                  <span className={`flex items-center gap-1 text-xs font-medium ${isPassed ? 'text-emerald-700' : 'text-rose-700'}`}>
                                    {isPassed ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                                    {subject.resultStatus}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                        </div>

                        {result.customFields.length > 0 ? (
                          <div className="border-t bg-slate-50/50 px-4 py-3">
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Additional assessments</p>
                            <div className="grid gap-2 sm:grid-cols-2">
                              {result.customFields.map((field, index) => (
                                <div key={`${field.label}-${index}`} className="flex items-start justify-between gap-3 rounded-lg border bg-white px-3 py-2 text-sm">
                                  <span className="font-medium text-slate-600">{field.label}</span>
                                  <span className="break-words text-right font-semibold text-slate-900">{field.value || '—'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {result.teacherRemarks ? (
                          <div className="border-t px-4 py-3">
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Teacher remarks</p>
                            <p className="mt-1 text-sm italic text-slate-700">&ldquo;{result.teacherRemarks}&rdquo;</p>
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardCheck className="w-5 h-5 text-violet-600" />
                      Assignments & Task Marks
                    </CardTitle>
                    <CardDescription>Saved task marks for this child, including obtained marks, total marks, percentage, and teacher remarks.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {academic.taskResults.length === 0 ? (
                      <p className="text-sm text-gray-500">No assignment or task marks have been published yet.</p>
                    ) : academic.taskResults.map((task) => (
                      <div key={task.id} className="flex flex-col gap-2 rounded border p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{task.title}</p>
                          <p className="text-xs text-slate-500">
                            {task.subjectName} · {task.classLabel}{task.shiftName ? <> · {task.shiftName}</> : null}{task.dueDate ? <> · Due {new Date(task.dueDate).toLocaleDateString('en-PK')}</> : null}
                          </p>
                          {task.remarks && <p className="mt-1 text-xs text-slate-600">Remarks: {task.remarks}</p>}
                        </div>
                        <div className="flex items-center gap-2 sm:justify-end">
                          <span className="font-semibold text-slate-900">{task.obtainedMarks}/{task.maxMarks}</span>
                          <Badge variant={task.percentage >= 60 ? 'default' : 'destructive'}>{task.percentage.toFixed(1)}%</Badge>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <ClipboardCheck className="w-5 h-5 text-indigo-600" />
                      Monitoring Reports
                    </CardTitle>
                    <CardDescription>Daily feedback is visible after teacher save; monthly reports are visible after declaration.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-800">Recent daily monitoring</h3>
                      {academic.monitoringReports.daily.length === 0 ? <p className="text-sm text-gray-500">No daily monitoring entries yet.</p> : (
                        <div className="space-y-2">
                          {academic.monitoringReports.daily.map((entry, index) => (
                            <div key={`${entry.date}-${entry.courseName}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm">
                              <div><p className="font-medium">{entry.courseName}</p><p className="text-xs text-slate-500">{new Date(entry.date).toLocaleDateString('en-PK')} · Grade: {entry.grade ?? '—'} · {entry.highlight === 'STAR_OF_THE_DAY' ? 'Star of the Day' : entry.highlight === 'POOR' ? 'Poor' : 'No highlight'}</p></div>
                              <p className="max-w-md text-slate-600">{entry.remarks || '—'}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="mb-2 text-sm font-semibold text-slate-800">Declared monthly monitoring</h3>
                      {academic.monitoringReports.monthly.length === 0 ? <p className="text-sm text-gray-500">No monthly monitoring report has been declared yet.</p> : (
                        <div className="space-y-3">
                          {academic.monitoringReports.monthly.map((report) => (
                            <div key={report.id} className="rounded-lg border p-4">
                              <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold">{new Date(report.year, report.month - 1, 1).toLocaleString('en', { month: 'long', year: 'numeric' })}</p><Badge>{report.student.performanceBatch} · Rank {report.student.rank}</Badge></div>
                              <p className="mt-2 font-semibold text-slate-800">{report.student.obtainedMarks}/{report.student.totalMarks} · {report.student.percentage.toFixed(2)}%</p>
                              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                                {report.columns.map((column) => column.type === 'COURSE' ? <p key={column.id} className="rounded bg-slate-50 px-3 py-2"><span className="font-medium">{column.label}:</span> {report.student.courseMarks[column.id]?.obtainedMarks ?? 0}/{report.student.courseMarks[column.id]?.totalMarks ?? 0}</p> : report.student.customValues[column.id] ? <p key={column.id} className="rounded bg-slate-50 px-3 py-2"><span className="font-medium">{column.label}:</span> {report.student.customValues[column.id]}</p> : null)}
                              </div>
                              {report.student.remarks && <p className="mt-3 text-sm text-slate-600"><span className="font-medium text-slate-800">Teacher remarks:</span> {report.student.remarks}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="monitoring" className="mt-4">
                <MonitoringReportPanel
                  endpoint={`/api/guardian-portal/children/${childId}/monitoring`}
                  title={`${academic.student.firstName}'s Academic Monitoring`}
                />
              </TabsContent>

              <TabsContent value="fees" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <CreditCard className="w-5 h-5 text-blue-600" />
                      Fee Challans
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {academic.feeInvoices.length === 0 ? (
                      <p className="text-gray-500">No fee records.</p>
                    ) : (
                      academic.feeInvoices.map((inv) => (
                        <div
                          key={inv.challanNumber}
                          className="flex flex-wrap justify-between items-center border rounded p-3 gap-2"
                        >
                          <div>
                            <p className="font-medium">{inv.month}</p>
                            <p className="text-xs text-gray-500">{inv.challanNumber}</p>
                          </div>
                          <div className="text-right">
                            <p>
                              Rs {Number(inv.paidAmount)} / {Number(inv.totalAmount)}
                            </p>
                            <Badge 
                              variant={
                                inv.status === 'PAID' ? 'default' :
                                inv.status === 'OVERDUE' ? 'destructive' : 
                                inv.status === 'CANCELLED' ? 'secondary' : 'default'
                              }
                            >
                              {inv.status}
                            </Badge>
                            {Number(inv.penaltyAmount) > 0 && (
                              <p className="text-xs text-red-600">Penalty: Rs {inv.penaltyAmount}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2 shrink-0">
                            <Link
                              href={`/dashboard/fees/${inv.id}`}
                              className="text-xs text-blue-600 hover:underline text-center border border-blue-200 px-3 py-1 rounded"
                            >
                              View challan
                            </Link>
                            
                            {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                              inv.proofStatus === 'PENDING' ? (
                                <Badge variant="outline" className="flex items-center gap-1 text-[10px]">
                                  <Clock className="w-3 h-3" /> Awaiting Approval
                                </Badge>
                              ) : (
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="h-7 text-xs"
                                  onClick={() => {
                                    setSelectedInvoice(inv)
                                    setPaymentDialogOpen(true)
                                  }}
                                >
                                  <Upload className="w-3 h-3 mr-1" />
                                  Upload Proof
                                </Button>
                              )
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="leaves" className="mt-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="w-5 h-5 text-rose-600" /> Leave Requests
                      </CardTitle>
                      <CardDescription>
                        Track and apply for leave requests for your child.
                      </CardDescription>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setShowLeaveForm(!showLeaveForm)}
                      className="gap-1.5 bg-rose-600 hover:bg-rose-700"
                    >
                      <Plus className="w-4 h-4" /> Apply for Leave
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Leave Application Form */}
                    {showLeaveForm && (
                      <div className="rounded-2xl border-2 border-rose-200 bg-rose-50/50 p-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                        <h4 className="font-bold text-rose-800 text-sm">New Leave Application</h4>
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Leave Type</label>
                            <select
                              value={leaveType}
                              onChange={(e) => setLeaveType(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
                            >
                              <option value="CASUAL">Casual Leave</option>
                              <option value="SICK">Sick Leave</option>
                              <option value="EMERGENCY">Emergency</option>
                              <option value="OTHER">Other</option>
                            </select>
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">Start Date</label>
                            <input
                              type="date"
                              value={leaveStart}
                              onChange={(e) => setLeaveStart(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-gray-600 block mb-1">End Date</label>
                            <input
                              type="date"
                              value={leaveEnd}
                              onChange={(e) => setLeaveEnd(e.target.value)}
                              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-gray-600 block mb-1">Reason</label>
                          <textarea
                            rows={3}
                            value={leaveReason}
                            onChange={(e) => setLeaveReason(e.target.value)}
                            placeholder="Please explain the reason for leave..."
                            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-rose-400 focus:border-rose-400"
                          />
                        </div>
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowLeaveForm(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="gap-1.5 bg-rose-600 hover:bg-rose-700"
                            disabled={submitLeave.isPending || !leaveStart || !leaveEnd || !leaveReason.trim()}
                            onClick={() => submitLeave.mutate({
                              leaveType,
                              startDate: leaveStart,
                              endDate: leaveEnd,
                              reason: leaveReason.trim(),
                            })}
                          >
                            {submitLeave.isPending ? (
                              <><Loader2 className="w-3 h-3 animate-spin" /> Submitting...</>
                            ) : (
                              <><Send className="w-3 h-3" /> Submit Application</>
                            )}
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Leave History */}
                    {loadingChildLeaves ? (
                      <div className="text-sm text-gray-500">Loading leave history…</div>
                    ) : !childLeaves || childLeaves.length === 0 ? (
                      <div className="text-sm text-gray-500 py-4 text-center">
                        No leave requests found. Click &quot;Apply for Leave&quot; to submit a new request.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {childLeaves.map((leave) => (
                          <div key={leave.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{new Date(leave.startDate).toLocaleDateString('en-PK')} — {new Date(leave.endDate).toLocaleDateString('en-PK')}</p>
                                <p className="text-sm text-slate-600">{leave.reason}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant={leave.status === 'APPROVED' ? 'default' : leave.status === 'REJECTED' ? 'destructive' : 'outline'}>
                                  {leave.status}
                                </Badge>
                                <span className="text-xs text-slate-500">Applied {new Date(leave.createdAt).toLocaleDateString('en-PK')}</span>
                              </div>
                            </div>
                            {leave.remarks && (
                              <p className="mt-3 text-sm text-slate-500">Remarks: {leave.remarks}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : null}
        </>
      )}

      {/* Payment Upload Modal */}
      <FeePaymentDialog 
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        studentId={childId}
        invoice={selectedInvoice}
      />
    </div>
  )
}
