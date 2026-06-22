'use client'

import { Suspense, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AccessDenied } from '@/components/AccessDenied'
import { notify } from '@/lib/notify'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookOpen, Calendar, CheckCircle2, Clock, Loader2, ClipboardCheck, BarChart2, Download, Target, TrendingUp, ArrowUpRight } from 'lucide-react'
import { downloadReportCardForEnrollment } from '@/lib/academic/download-report-card'
import { SESSION_SHIFT_LABELS } from '@/lib/validation/shift'

type AttendanceData = {
  academicYear: { name: string } | null
  summary: {
    present: number
    absent: number
    late: number
    excused: number
    total: number
    attendancePct: number | null
  } | null
  records: Array<{ id: string; attendanceDate: string; status: string; remarks?: string | null }>
}

type ResultsData = {
  academicYear: { name: string } | null
  overallPercentage: number | null
  overallGrade: string | null
  results: Array<{
    subjectName: string
    subjectCode: string
    schemeName: string
    percentage: number
    grade: string
    isPassed: boolean
    breakdown: Array<{ component: string; weight: number; obtained: number; maxMarks: number }>
  }>
}

type TargetItem = {
  id: string
  subjectName: string
  subjectCode: string
  className: string
  sectionName: string
  targetGrade: string
  targetRange: { min: number; max: number }
  currentPercentage: number | null
  scoresCount: number
  status: 'ON_TRACK' | 'CLOSE' | 'BELOW' | 'NO_DATA'
  assignedBy: string
  updatedAt: string
}

type TargetsData = {
  targets: TargetItem[]
  summary: {
    totalTargets: number
    onTrack: number
    close: number
    below: number
    noData: number
  }
}

const DAY_NAMES = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type PortalData = {
  student?: { house?: { name: string; color: string } | null }
  activeYear: { id: string; name: string; isLocked: boolean } | null
  enrollments?: Array<{
    id: string
    rollNumber: string
    classSection: { className: string; sectionName: string; shift?: { name: string; code: string } }
  }>
  enrollment: {
    id: string
    rollNumber: string
    deliveryMode: string
    classSection: {
      className: string
      sectionName: string
      curriculumMode: string
      shift?: { name: string; code: string }
      campus?: { name: string }
      batch?: { name: string }
    }
  } | null
  eligibleElectives: Array<{
    id: string
    subject: { name: string; code: string }
    teacher?: { firstName: string; lastName: string }
    electiveGroup?: { name: string; maxSelections: number }
  }>
  subjectEnrollments: Array<{
    id: string
    status: string
    subjectOffering: { subject: { name: string }; teacher?: { firstName: string; lastName: string } }
  }>
  timetable: Array<{
    dayOfWeek: number
    startTime: string
    endTime: string
    subjectOffering: { subject: { name: string } }
    teacher: { firstName: string; lastName: string }
    room?: { name: string } | null
  }>
  timetablesByEnrollment?: Array<{
    studentEnrollmentId: string
    shift?: { name: string; code: string }
    classSection: { className: string; sectionName: string }
    slots: PortalData['timetable']
  }>
  canSelectElectives: boolean
  message?: string
}

const statusBadge: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const PORTAL_TABS = ['courses', 'attendance', 'results', 'targets'] as const
type PortalTab = (typeof PORTAL_TABS)[number]

function StudentEnrollmentPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])
  const [downloadingCard, setDownloadingCard] = useState(false)

  const tabParam = searchParams.get('tab')
  const activeTab: PortalTab = PORTAL_TABS.includes(tabParam as PortalTab)
    ? (tabParam as PortalTab)
    : 'courses'

  const { data, isLoading } = useQuery({
    queryKey: ['student-enrollment-portal'],
    queryFn: () => fetchApi<PortalData>('/api/student-portal/enrollment'),
    enabled: session?.user?.role === 'STUDENT',
  })

  const { data: attendance } = useQuery({
    queryKey: ['student-attendance-portal'],
    queryFn: () => fetchApi<AttendanceData>('/api/student-portal/attendance'),
    enabled: session?.user?.role === 'STUDENT',
  })

  const { data: results } = useQuery({
    queryKey: ['student-results-portal'],
    queryFn: () => fetchApi<ResultsData>('/api/student-portal/results'),
    enabled: session?.user?.role === 'STUDENT',
  })

  const { data: targetsResponse } = useQuery({
    queryKey: ['student-targets-portal'],
    queryFn: () => fetchApi<TargetsData>('/api/student-portal/targets'),
    enabled: session?.user?.role === 'STUDENT',
  })

  const submitElectives = useMutation({
    mutationFn: () =>
      fetchApi('/api/student-portal/electives', {
        method: 'POST',
        body: JSON.stringify({
          studentEnrollmentId: data?.enrollment?.id,
          subjectOfferingIds: selected,
        }),
      }),
    onSuccess: () => {
      notify.success('Elective choices submitted for admin approval')
      setSelected([])
      qc.invalidateQueries({ queryKey: ['student-enrollment-portal'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (status === 'loading') return null
  if (session?.user?.role !== 'STUDENT') {
    return (
      <AccessDenied
        title="My Courses"
        message="This page is for enrolled students to view subjects, electives, and timetable."
      />
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 gap-2">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading your academic profile…
      </div>
    )
  }

  const section = data?.enrollment?.classSection

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen className="w-7 h-7 text-blue-600" />
          My Academic Portal
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          {data?.activeYear?.name ?? 'Academic year'} — courses, attendance, and published results.
        </p>
      </div>

      {data?.message && !data.enrollment && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-amber-900 text-sm">{data.message}</CardContent>
        </Card>
      )}

      {(data?.enrollments?.length ?? 0) > 1 && (
        <Card className="border-indigo-200 bg-indigo-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">All shift enrollments</CardTitle>
            <CardDescription>You are enrolled in multiple sessions this year.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {(data?.enrollments ?? []).map((enr: { id: string; rollNumber: string; classSection: { className: string; sectionName: string; shift?: { name: string; code: string } } }) => (
              <Badge key={enr.id} variant="outline" className="bg-white">
                {enr.classSection.className}-{enr.classSection.sectionName} ·{' '}
                {enr.classSection.shift?.name ?? 'Shift'} · Roll {enr.rollNumber}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {section && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Academic Placement</CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-gray-500">Section</p>
              <p className="font-semibold">
                {section.className}-{section.sectionName}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Campus · Batch</p>
              <p className="font-semibold">
                {section.campus?.name} · {section.batch?.name}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Shift</p>
              <p className="font-semibold">
                {section.shift?.code
                  ? SESSION_SHIFT_LABELS[section.shift.code as keyof typeof SESSION_SHIFT_LABELS]
                  : section.shift?.name}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Mode · Roll</p>
              <p className="font-semibold">
                {data?.enrollment?.deliveryMode} · {data?.enrollment?.rollNumber}
              </p>
            </div>
            {data?.student?.house && (
              <div>
                <p className="text-gray-500">House</p>
                <p className="font-semibold inline-flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: data.student.house.color }}
                  />
                  {data.student.house.name}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          router.replace(`/dashboard/enrollment?tab=${v}`, { scroll: false })
        }}
      >
        <TabsList>
          <TabsTrigger value="courses">Courses & Timetable</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="targets">My Targets</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4 space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">My Subjects</CardTitle>
            <CardDescription>
              {section?.curriculumMode === 'FIXED'
                ? 'Mandatory subjects are assigned automatically.'
                : 'Electives require admin approval after you submit choices.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.subjectEnrollments ?? []).length === 0 ? (
              <p className="text-sm text-gray-500">No subject enrollments yet.</p>
            ) : (
              data?.subjectEnrollments.map((se) => (
                <div key={se.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div>
                    <p className="font-medium">{se.subjectOffering.subject.name}</p>
                    {se.subjectOffering.teacher && (
                      <p className="text-xs text-gray-500">
                        {se.subjectOffering.teacher.firstName} {se.subjectOffering.teacher.lastName}
                      </p>
                    )}
                  </div>
                  <Badge className={statusBadge[se.status] ?? ''}>{se.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {data?.canSelectElectives && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Choose Electives</CardTitle>
              <CardDescription>Select subjects and submit for admin approval.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {(data?.eligibleElectives ?? []).map((o) => (
                <label
                  key={o.id}
                  className="flex items-start gap-3 border rounded-lg p-3 cursor-pointer hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                    checked={selected.includes(o.id)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSelected((prev) =>
                        checked ? [...prev, o.id] : prev.filter((id) => id !== o.id)
                      )
                    }}
                  />
                  <div className="flex-1">
                    <p className="font-medium">{o.subject.name}</p>
                    <p className="text-xs text-gray-500">
                      {o.teacher ? `${o.teacher.firstName} ${o.teacher.lastName}` : 'Teacher TBA'}
                      {o.electiveGroup ? ` · Group: ${o.electiveGroup.name} (max ${o.electiveGroup.maxSelections})` : ''}
                    </p>
                  </div>
                </label>
              ))}
              <Button
                className="w-full gap-2"
                disabled={selected.length === 0 || submitElectives.isPending}
                onClick={() => submitElectives.mutate()}
              >
                {submitElectives.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Submit for Approval
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {(data?.timetablesByEnrollment?.length
        ? data.timetablesByEnrollment
        : [{ studentEnrollmentId: 'default', classSection: section ?? { className: '', sectionName: '' }, shift: section?.shift, slots: data?.timetable ?? [] }]
      ).map((block) => {
        const shiftLabel =
          block.shift?.code && block.shift.code in SESSION_SHIFT_LABELS
            ? SESSION_SHIFT_LABELS[block.shift.code as keyof typeof SESSION_SHIFT_LABELS]
            : block.shift?.name ?? 'Session'
        return (
          <Card key={block.studentEnrollmentId}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                {block.classSection.className} {block.classSection.sectionName} — {shiftLabel}
              </CardTitle>
              <CardDescription>Published timetable for this session (read-only).</CardDescription>
            </CardHeader>
            <CardContent>
              {block.slots.length === 0 ? (
                <p className="text-sm text-gray-500 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Timetable not published yet for this session.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="py-2 pr-4">Day</th>
                        <th className="py-2 pr-4">Time</th>
                        <th className="py-2 pr-4">Subject</th>
                        <th className="py-2 pr-4">Teacher</th>
                        <th className="py-2">Room</th>
                      </tr>
                    </thead>
                    <tbody>
                      {block.slots.map((slot) => (
                        <tr
                          key={`${block.studentEnrollmentId}-${slot.dayOfWeek}-${slot.startTime}`}
                          className="border-b border-gray-50"
                        >
                          <td className="py-2 pr-4 font-medium">{DAY_NAMES[slot.dayOfWeek]}</td>
                          <td className="py-2 pr-4">
                            {slot.startTime} – {slot.endTime}
                          </td>
                          <td className="py-2 pr-4">{slot.subjectOffering.subject.name}</td>
                          <td className="py-2 pr-4">
                            {slot.teacher.firstName} {slot.teacher.lastName}
                          </td>
                          <td className="py-2">{slot.room?.name ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
        </TabsContent>

        <TabsContent value="attendance" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardCheck className="w-5 h-5 text-green-600" />
                Attendance Summary
              </CardTitle>
              <CardDescription>Section attendance recorded by your teachers (read-only).</CardDescription>
            </CardHeader>
            <CardContent>
              {attendance?.summary ? (
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
                  <div className="text-center p-3 rounded-lg bg-green-50">
                    <p className="text-2xl font-bold text-green-700">{attendance.summary.present}</p>
                    <p className="text-xs text-green-600">Present</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50">
                    <p className="text-2xl font-bold text-red-700">{attendance.summary.absent}</p>
                    <p className="text-xs text-red-600">Absent</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-yellow-50">
                    <p className="text-2xl font-bold text-yellow-700">{attendance.summary.late}</p>
                    <p className="text-xs text-yellow-600">Late</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50">
                    <p className="text-2xl font-bold text-blue-700">{attendance.summary.excused}</p>
                    <p className="text-xs text-blue-600">Excused</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-indigo-50">
                    <p className="text-2xl font-bold text-indigo-700">
                      {attendance.summary.attendancePct != null ? `${attendance.summary.attendancePct}%` : '—'}
                    </p>
                    <p className="text-xs text-indigo-600">Rate</p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-500">No attendance records yet.</p>
              )}
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="py-2">Date</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(attendance?.records ?? []).map((r) => (
                      <tr key={r.id} className="border-b border-gray-50">
                        <td className="py-2">{new Date(r.attendanceDate).toLocaleDateString('en-PK')}</td>
                        <td className="py-2">
                          <Badge className={statusBadge[r.status] ?? ''}>{r.status}</Badge>
                        </td>
                        <td className="py-2 text-gray-500">{r.remarks ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
              <CardDescription>
                Only subjects with published grading schemes appear here.
              </CardDescription>
              {data?.enrollment?.id && (results?.results ?? []).length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-2 w-fit"
                  disabled={downloadingCard}
                  onClick={async () => {
                    setDownloadingCard(true)
                    try {
                      await downloadReportCardForEnrollment(data.enrollment!.id)
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
            <CardContent className="space-y-4">
              {results?.overallPercentage != null && (
                <div className="rounded-lg bg-purple-50 border border-purple-100 p-4 flex justify-between items-center">
                  <span className="font-medium text-purple-900">Overall average</span>
                  <span className="text-xl font-bold text-purple-700">
                    {results.overallPercentage}% · {results.overallGrade}
                  </span>
                </div>
              )}
              {(results?.results ?? []).length === 0 ? (
                <p className="text-sm text-gray-500">
                  No published results yet. Results appear after teachers enter marks and administration publishes grading schemes.
                </p>
              ) : (
                results?.results.map((r) => (
                  <div key={r.subjectCode} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold">{r.subjectName}</p>
                        <p className="text-xs text-gray-500">{r.schemeName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold">{r.percentage}%</p>
                        <Badge className={r.isPassed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                          {r.grade} · {r.isPassed ? 'Pass' : 'Fail'}
                        </Badge>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-1 text-xs text-gray-600">
                      {r.breakdown.map((b) => (
                        <div key={b.component}>
                          {b.component} ({b.weight}%): {b.obtained}/{b.maxMarks}
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="targets" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="w-5 h-5 text-indigo-600" />
                My Academic Targets
              </CardTitle>
              <CardDescription>
                Targets assigned by your teacher. Track your progress towards achieving them.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Summary Stats */}
              {targetsResponse?.summary && targetsResponse.summary.totalTargets > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="text-center p-3 rounded-lg bg-green-50 border border-green-100">
                    <p className="text-xl font-bold text-green-700">{targetsResponse.summary.onTrack}</p>
                    <p className="text-xs text-green-600 font-medium">On Track</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <p className="text-xl font-bold text-amber-700">{targetsResponse.summary.close}</p>
                    <p className="text-xs text-amber-600 font-medium">Close</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-red-50 border border-red-100">
                    <p className="text-xl font-bold text-red-700">{targetsResponse.summary.below}</p>
                    <p className="text-xs text-red-600 font-medium">Below Target</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <p className="text-xl font-bold text-slate-700">{targetsResponse.summary.noData}</p>
                    <p className="text-xs text-slate-500 font-medium">No Data Yet</p>
                  </div>
                </div>
              )}

              {/* Target Cards */}
              {(targetsResponse?.targets ?? []).length === 0 ? (
                <div className="text-center py-8">
                  <Target className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 font-medium">
                    No targets assigned yet by your teacher.
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Targets will appear here once your teacher assigns performance goals.
                  </p>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-4">
                  {targetsResponse?.targets.map((target) => {
                    const statusConfig = {
                      ON_TRACK: {
                        bgClass: 'bg-green-50 border-green-200',
                        badgeClass: 'bg-green-100 text-green-800',
                        label: 'On Track',
                        icon: <CheckCircle2 className="w-4 h-4 text-green-600" />,
                        progressColor: 'bg-green-500',
                      },
                      CLOSE: {
                        bgClass: 'bg-amber-50 border-amber-200',
                        badgeClass: 'bg-amber-100 text-amber-800',
                        label: 'Almost There',
                        icon: <TrendingUp className="w-4 h-4 text-amber-600" />,
                        progressColor: 'bg-amber-500',
                      },
                      BELOW: {
                        bgClass: 'bg-red-50 border-red-200',
                        badgeClass: 'bg-red-100 text-red-800',
                        label: 'Below Target',
                        icon: <ArrowUpRight className="w-4 h-4 text-red-600" />,
                        progressColor: 'bg-red-500',
                      },
                      NO_DATA: {
                        bgClass: 'bg-slate-50 border-slate-200',
                        badgeClass: 'bg-slate-100 text-slate-600',
                        label: 'No Scores Yet',
                        icon: <Clock className="w-4 h-4 text-slate-400" />,
                        progressColor: 'bg-slate-300',
                      },
                    }

                    const config = statusConfig[target.status]
                    const progressWidth =
                      target.currentPercentage !== null
                        ? Math.min((target.currentPercentage / target.targetRange.max) * 100, 100)
                        : 0

                    return (
                      <div
                        key={target.id}
                        className={`rounded-xl border p-4 transition-all hover:shadow-sm ${config.bgClass}`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-semibold text-gray-900">{target.subjectName}</p>
                            <p className="text-xs text-gray-500">{target.subjectCode}</p>
                          </div>
                          <Badge className={config.badgeClass}>
                            {config.icon}
                            <span className="ml-1">{config.label}</span>
                          </Badge>
                        </div>

                        {/* Target & Current Score */}
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="bg-white/80 rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Target</p>
                            <p className="text-lg font-bold text-indigo-700">
                              {target.targetGrade}
                              <span className="text-xs font-normal text-gray-400 ml-1">
                                ({target.targetRange.min}–{target.targetRange.max}%)
                              </span>
                            </p>
                          </div>
                          <div className="bg-white/80 rounded-lg p-2.5 border border-gray-100">
                            <p className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Current</p>
                            <p className="text-lg font-bold text-gray-900">
                              {target.currentPercentage !== null
                                ? `${target.currentPercentage}%`
                                : '—'}
                              {target.scoresCount > 0 && (
                                <span className="text-xs font-normal text-gray-400 ml-1">
                                  ({target.scoresCount} scores)
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200/60 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${config.progressColor}`}
                            style={{ width: `${progressWidth}%` }}
                          />
                        </div>

                        <p className="text-[10px] text-gray-400 mt-2">
                          Assigned by {target.assignedBy} · Updated {new Date(target.updatedAt).toLocaleDateString('en-PK')}
                        </p>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

export default function StudentEnrollmentPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24 text-gray-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading your academic profile…
        </div>
      }
    >
      <StudentEnrollmentPageInner />
    </Suspense>
  )
}
