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
import { Users, ClipboardCheck, BarChart2, Calendar, CreditCard, Loader2, Download, Plus, Send, BookOpen, Clock, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { downloadReportCardForEnrollment } from '@/lib/academic/download-report-card'
import { notify } from '@/lib/notify'
import { SESSION_SHIFT_LABELS } from '@/lib/validation/shift'
import Link from 'next/link'
import { FeePaymentDialog } from '@/components/features/guardian/FeePaymentDialog'
import { MonitoringReportPanel } from '@/components/academic/MonitoringReportPanel'

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

type Child = {
  id: string
  firstName: string
  lastName: string
  registrationNumber: string
  rollNumber: string | null
  profilePicture: string | null
  shift: string | null
  deliveryMode: string | null
  campus: { name: string }
  batch: { name: string } | null
  house: { name: string; color: string } | null
  class: { name: string; shift: string | null } | null
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
          Monitor academic progress, attendance, results, and fee status for your linked students.
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
          {/* ── Child Selector ───────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            {(children ?? []).map((c) => {
              const initials = `${c.firstName[0]}${c.lastName[0]}`.toUpperCase()
              const isSelected = childId === c.id
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedChildId(c.id)}
                  className={`flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50 shadow-md'
                      : 'border-slate-200 bg-white hover:border-emerald-300 hover:shadow-sm'
                  }`}
                >
                  {c.profilePicture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.profilePicture} alt={c.firstName} className="h-10 w-10 rounded-xl object-cover" />
                  ) : (
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-black ${
                      isSelected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className={`font-bold text-sm truncate ${isSelected ? 'text-emerald-800' : 'text-slate-800'}`}>
                      {c.firstName} {c.lastName}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">{c.registrationNumber}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {loadingAcademic ? (
            <div className="flex items-center gap-2 text-gray-500 py-8">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading academic records…
            </div>
          ) : academic ? (
            <Tabs defaultValue="overview">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="attendance">Attendance</TabsTrigger>
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="monitoring">Monitoring</TabsTrigger>
                <TabsTrigger value="fees">Fees</TabsTrigger>
                <TabsTrigger value="leaves">Leaves</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-4">
                {/* ── Premium Child Hero Card ─────────────────────────── */}
                {(() => {
                  const selectedChild = (children ?? []).find((c) => c.id === childId)
                  const cInitials = selectedChild ? `${selectedChild.firstName[0]}${selectedChild.lastName[0]}`.toUpperCase() : ''
                  const cShift = academic.enrollment?.classSection?.shift?.code
                    ? SESSION_SHIFT_LABELS[academic.enrollment.classSection.shift.code as keyof typeof SESSION_SHIFT_LABELS]
                    : null
                  return (
                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 shadow-xl">
                      <div className="pointer-events-none absolute -top-8 -right-8 h-40 w-40 rounded-full bg-emerald-400/20 blur-3xl" />
                      <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-teal-400/10 blur-2xl" />

                      <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
                        <div className="shrink-0">
                          {selectedChild?.profilePicture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={selectedChild.profilePicture} alt={selectedChild.firstName} className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/20" />
                          ) : (
                            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-700 text-2xl font-black text-white ring-4 ring-white/20">
                              {cInitials}
                            </div>
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h2 className="text-xl font-black text-white">
                            {academic.student.firstName} {academic.student.lastName}
                          </h2>
                          <p className="text-emerald-300 text-sm mt-0.5">
                            {academic.activeYear?.name ?? 'No active year'} · {academic.student.campus.name}
                            {academic.student.batch ? ` · ${academic.student.batch.name}` : ''}
                          </p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {academic.enrollment && (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white border border-white/10">
                                <BookOpen className="h-3.5 w-3.5 text-emerald-300" />
                                {academic.enrollment.classSection.className}-{academic.enrollment.classSection.sectionName}
                              </span>
                            )}
                            {cShift && (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white border border-white/10">
                                <Clock className="h-3.5 w-3.5 text-amber-300" />
                                {cShift} Shift
                              </span>
                            )}
                            {academic.enrollment?.deliveryMode && (
                              <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white border border-white/10">
                                {academic.enrollment.deliveryMode}
                              </span>
                            )}
                          </div>
                        </div>

                        {academic.enrollment?.rollNumber && (
                          <div className="shrink-0 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Roll No.</p>
                            <p className="text-2xl font-black text-white">{academic.enrollment.rollNumber}</p>
                          </div>
                        )}
                      </div>

                      {/* Stats bar */}
                      <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 sm:grid-cols-4">
                        {[
                          { label: 'Attendance', value: academic.attendance.summary.attendancePct != null ? `${academic.attendance.summary.attendancePct}%` : '—' },
                          { label: 'Subjects', value: academic.enrollment?.subjectEnrollments?.length ?? '—' },
                          { label: 'Avg. Result', value: academic.overallPercentage != null ? `${academic.overallPercentage}%` : '—' },
                          { label: 'Invoices', value: academic.feeInvoices?.length ?? 0 },
                        ].map(({ label, value }) => (
                          <div key={label} className="px-4 py-3 text-center">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">{label}</p>
                            <p className="mt-0.5 text-sm font-bold text-white">{String(value)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                {/* Enrolled subjects list */}
                {academic.enrollment && (academic.enrollment.subjectEnrollments ?? []).length > 0 && (
                  <Card className="border-slate-200 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-600" /> Enrolled Subjects
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {academic.enrollment.subjectEnrollments.map((se, idx) => (
                          <div key={idx} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-3 py-2.5 hover:bg-indigo-50/30 transition-colors">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-xs font-black text-indigo-700">
                              {se.subjectOffering.subject.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">{se.subjectOffering.subject.name}</p>
                              {se.subjectOffering.teacher && (
                                <p className="text-[11px] text-slate-400 truncate">
                                  {se.subjectOffering.teacher.firstName} {se.subjectOffering.teacher.lastName}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

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
                    <div className="grid grid-cols-4 gap-3 mb-4 text-center text-sm">
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
                    {academic.enrollmentId && academic.results.length > 0 && (
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
                  <CardContent className="space-y-3">
                    {academic.overallPercentage != null && (
                      <p className="font-semibold text-purple-800">
                        Overall average: {academic.overallPercentage}%
                      </p>
                    )}
                    {academic.results.length === 0 ? (
                      <p className="text-sm text-gray-500">No published results yet.</p>
                    ) : (
                      academic.results.map((r) => (
                        <div key={r.subjectName} className="flex justify-between border rounded p-3">
                          <span className="font-medium">{r.subjectName}</span>
                          <span>
                            {r.percentage}% · <Badge>{r.grade}</Badge>
                          </span>
                        </div>
                      ))
                    )}
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
