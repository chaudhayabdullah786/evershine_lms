'use client'

import { Suspense, useState, useRef } from 'react'
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
import { BookOpen, Calendar, CheckCircle2, Clock, Loader2, ClipboardCheck, BarChart2, Download, Target, TrendingUp, ArrowUpRight, Star, AlertTriangle, Trophy, Award, GraduationCap, ChevronDown, ChevronUp } from 'lucide-react'
import { useState as useLocalState } from 'react'
import { SESSION_SHIFT_LABELS } from '@/lib/validation/shift'
import { downloadPdf } from '@/lib/pdf'
import ResultReportCard, { type ReportCardResult, type ReportCardStudent } from '@/components/academic/ResultReportCard'
import { TaskMarksPanel, type TaskResultItem } from '@/components/academic/TaskMarksPanel'
import { MonthlyMonitoringGrid } from '@/components/academic/MonthlyMonitoringGrid'
import { getDisplayedPosition, type ResultCardConfig } from '@/lib/academic/result-card-config'

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

type DeclaredSubject = {
  subjectId: string
  subjectName: string
  subjectCode: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string
  resultStatus: string
  isPassed: boolean
  isAbsent: boolean
  isNotApplicable: boolean
  remarks: string | null
  performanceBatch: string | null
}

type DeclaredResult = {
  termResultId: string
  examSessionId: string
  examSessionLabel: string
  sectionLabel: string
  shiftName: string | null
  overallPercentage: number
  grade: string
  classPosition: number | null
  manualPosition: number | null
  resultCardConfig?: ResultCardConfig
  performanceBatch: string
  teacherRemarks: string | null
  customFields: Array<{ label: string; value: string }>
  declaredAt: string | null
  subjects: DeclaredSubject[]
}

type ExamResultDetail = {
  id: string
  subjectId: string
  subjectName: string
  subjectCode: string
  totalMarks: number
  obtainedMarks: number
  grade: string
  isPassed: boolean
}

type ExamResultItem = {
  id: string
  examId: string
  examName: string
  startDate: string
  endDate: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  grade: string
  isPassed: boolean
  remarks: string | null
  details: ExamResultDetail[]
}

type ResultsData = {
  academicYear: { name: string } | null
  overallPercentage: number | null
  overallGrade: string | null
  latestExamSession: string | null
  latestPerformanceBatch: string | null
  latestClassPosition: number | null
  latestTeacherRemarks: string | null
  declaredResults: DeclaredResult[]
  examResults: ExamResultItem[]
  results: Array<{
    subjectName: string
    subjectCode: string
    schemeName: string
    percentage: number
    grade: string
    isPassed: boolean
    breakdown: Array<{ component: string; weight: number; obtained: number; maxMarks: number }>
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
  taskResults: TaskResultItem[]
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
  student?: {
    id?: string
    firstName?: string
    lastName?: string
    fatherName?: string
    registrationNumber?: string
    rollNumber?: string | null
    profilePicture?: string | null
    shift?: string | null
    deliveryMode?: string | null
    house?: { name: string; color: string } | null
    campus?: { name: string } | null
    batch?: { name: string } | null
    class?: { name: string; grade: number } | null
  }
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
    subjectOffering: {
      subject: { name: string; code?: string }
      teacher?: { firstName: string; lastName: string }
    }
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

const PORTAL_TABS = ['courses', 'attendance', 'results', 'tasks', 'targets'] as const
type PortalTab = (typeof PORTAL_TABS)[number]

// ── Monitoring Component ──────────────────────────────────────────────────────
function MonitoringCard({ results }: { results: ResultsData | undefined }) {
  return (
    <Card className="border border-slate-200 shadow-sm">
      <CardHeader className="bg-slate-50/50 border-b pb-4">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="w-5 h-5 text-indigo-600" />
          <div>
            <CardTitle className="text-base font-bold text-slate-900">Academic & Behavior Monitoring</CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Real-time daily feedback and declared monthly monitoring reports.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-indigo-600" />
            Recent Daily Monitoring
          </h3>
          {(results?.monitoringReports?.daily ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-dashed rounded-lg p-6 text-center">
              No daily performance records found for this period.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="bg-slate-50/70 border-b text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <tr>
                    <th className="p-3.5">Date</th>
                    <th className="p-3.5">Course</th>
                    <th className="p-3.5">Grade</th>
                    <th className="p-3.5 text-center">Status highlight</th>
                    <th className="p-3.5">Teacher remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(results?.monitoringReports?.daily ?? []).map((entry, index) => {
                    const isStar = entry.highlight === 'STAR_OF_THE_DAY'
                    const isConcern = entry.highlight === 'POOR'
                    return (
                      <tr
                        key={`${entry.date}-${entry.courseName}-${index}`}
                        className={`hover:bg-slate-50/50 transition-colors ${
                          isStar ? 'bg-amber-50/30' : isConcern ? 'bg-rose-50/20' : ''
                        }`}
                      >
                        <td className="p-3.5 font-medium text-slate-600">
                          {new Date(entry.date).toLocaleDateString('en-PK', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="p-3.5 font-semibold text-slate-900">{entry.courseName}</td>
                        <td className="p-3.5">
                          <span className="inline-flex items-center justify-center font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                            {entry.grade ?? '—'}
                          </span>
                        </td>
                        <td className="p-3.5 text-center">
                          {isStar && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 border border-amber-200">
                              <Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Star of the Day
                            </span>
                          )}
                          {isConcern && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800 border border-rose-200">
                              <AlertTriangle className="h-3 w-3 text-rose-500" /> Needs Improvement
                            </span>
                          )}
                          {!isStar && !isConcern && <span className="text-slate-400">—</span>}
                        </td>
                        <td className="p-3.5 text-slate-600 max-w-xs truncate">{entry.remarks || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-800 flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-600" />
            Declared Monthly Performance Sheets
          </h3>
          {(results?.monitoringReports?.monthly ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 bg-slate-50 border border-dashed rounded-lg p-6 text-center">
              No academic monthly sheets declared yet for this session.
            </p>
          ) : (
            <div className="space-y-4">
              {(results?.monitoringReports?.monthly ?? []).map((report) => (
                <MonthlyMonitoringGrid key={report.id} report={report} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
    )
  }

// ── Results Tab Component ─────────────────────────────────────────────────────
/**
 * ResultsTabContent renders each declared exam session as a premium
 * ResultReportCard. Per-session download captures the card DOM via
 * downloadPdf() for pixel-perfect PDF output.
 *
 * WHY DOM-capture: the on-screen card already contains all custom fields,
 * student photo, academy branding, and signature lines. Duplicating this
 * rendering in jsPDF primitives would be fragile and drift out of sync.
 */
function ResultsTabContent({
  results,
  student,
  sessionName,
}: {
  results: ResultsData | undefined
  student: PortalData['student']
  sessionName?: string | null
}) {
  const [expandedSession, setExpandedSession] = useLocalState<string | null>(null)
  const [expandedExam, setExpandedExam] = useLocalState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  // Refs keyed by termResultId for per-session DOM capture
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const hasDeclared = (results?.declaredResults ?? []).length > 0
  const hasExamResults = (results?.examResults ?? []).length > 0

  const cardStudent: ReportCardStudent = {
    firstName: student?.firstName,
    lastName: student?.lastName,
    fatherName: student?.fatherName,
    registrationNumber: student?.registrationNumber,
    rollNumber: student?.rollNumber,
    profilePicture: student?.profilePicture,
    campus: student?.campus,
    batch: student?.batch,
    class: student?.class,
  }

  function formatDate(dateStr: string) {
    if (!dateStr) return '—'
    try {
      return new Date(dateStr).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  async function handleDownload(sessionResult: ReportCardResult) {
    const el = cardRefs.current[sessionResult.termResultId]
    if (!el) {
      notify.error('Report card element not found. Please expand the card first.')
      return
    }
    setDownloadingId(sessionResult.termResultId)
    try {
      await downloadPdf({
        element: el,
        filename: `${(student?.firstName ?? 'Student').replace(/\s+/g, '_')}-${sessionResult.examSessionLabel.replace(/\s+/g, '_')}-ReportCard`,
        orientation: 'portrait',
        format: 'a4',
        scale: 3,
      })
      notify.success('Report card downloaded successfully.')
    } catch (e) {
      notify.error(e instanceof Error ? e.message : 'Failed to download report card.')
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Declared Term Results Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <BarChart2 className="w-5 h-5 text-purple-600" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Declared Term Results</h3>
            <p className="text-xs text-slate-500">
              Official marks sheets published and verified by the administration.
            </p>
          </div>
        </div>

        {!hasDeclared ? (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="text-center">
                <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-900">No Declared Results Found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Your results for this session have not been declared yet. Results appear here immediately after the administration declares them.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          (results?.declaredResults ?? []).map((sessionResult) => {
            const isExpanded = expandedSession === sessionResult.termResultId
            const isDownloading = downloadingId === sessionResult.termResultId

            const batchColorClass =
              sessionResult.performanceBatch === 'Ever Shine'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : sessionResult.performanceBatch === 'Quaid'
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : sessionResult.performanceBatch === 'Iqbal'
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-rose-100 text-rose-800 border-rose-200'

            return (
              <div
                key={sessionResult.termResultId}
                className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm"
              >
                {/* Accordion Header */}
                <div
                  className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gradient-to-r from-slate-50 to-white cursor-pointer hover:from-slate-100/60 transition-colors border-b"
                  onClick={() => setExpandedSession(isExpanded ? null : sessionResult.termResultId)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                      <Award className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                        {sessionResult.examSessionLabel}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {sessionResult.sectionLabel}{sessionResult.shiftName ? ` · ${sessionResult.shiftName}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-auto">
                    <div className="text-right">
                      <span className="text-xl font-black text-slate-900">
                        {sessionResult.overallPercentage.toFixed(1)}%
                      </span>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        <Badge className={`${batchColorClass} text-[10px] font-bold border py-0`}>
                          {sessionResult.performanceBatch}
                        </Badge>
                        {getDisplayedPosition(sessionResult.resultCardConfig, sessionResult.classPosition, sessionResult.manualPosition) !== null && (
                          <Badge className="bg-slate-900 hover:bg-slate-900 text-white text-[10px] font-bold py-0">
                            Rank #{getDisplayedPosition(sessionResult.resultCardConfig, sessionResult.classPosition, sessionResult.manualPosition)}
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Download button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50 text-xs h-8 font-semibold flex-shrink-0"
                      disabled={isDownloading}
                      onClick={(e) => {
                        e.stopPropagation()
                        // Auto-expand card first so the ref is populated
                        if (!isExpanded) {
                          setExpandedSession(sessionResult.termResultId)
                          // small settle delay for DOM to render before capture
                          setTimeout(() => handleDownload(sessionResult as ReportCardResult), 300)
                        } else {
                          handleDownload(sessionResult as ReportCardResult)
                        }
                      }}
                    >
                      {isDownloading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      PDF
                    </Button>

                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    )}
                  </div>
                </div>

                {/* Expanded: Full ResultReportCard */}
                {isExpanded && (
                  <div className="p-4 sm:p-6 bg-slate-50/40">
                    <ResultReportCard
                      ref={(el) => { cardRefs.current[sessionResult.termResultId] = el }}
                      result={sessionResult as ReportCardResult}
                      student={cardStudent}
                      sessionName={sessionName}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Individual Exam Marks Section */}
      <div className="space-y-4 border-t pt-6">
        <div className="flex items-center gap-2 px-1">
          <ClipboardCheck className="w-5 h-5 text-indigo-600" />
          <div>
            <h3 className="text-base font-bold text-slate-900">Individual Exam Marks</h3>
            <p className="text-xs text-slate-500">
              Subject-wise breakdown and scoring details from conducted class examinations.
            </p>
          </div>
        </div>

        {!hasExamResults ? (
          <Card>
            <CardContent className="pt-12 pb-12">
              <div className="text-center">
                <ClipboardCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h4 className="text-sm font-bold text-slate-900">No Exam Marks Found</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  No individual exam results have been recorded or published for you yet in the active year.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          (results?.examResults ?? []).map((examResult) => {
            const isExamExpanded = expandedExam === examResult.id
            const totalObtained = examResult.obtainedMarks
            const totalPossible = examResult.totalMarks
            const pct = examResult.percentage
            const grade = examResult.grade
            const passed = examResult.isPassed

            const gradeBadgeColor =
              grade === 'A+' || grade === 'A'
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : grade.startsWith('B')
                ? 'bg-blue-100 text-blue-800 border-blue-200'
                : grade.startsWith('C')
                ? 'bg-amber-100 text-amber-800 border-amber-200'
                : 'bg-rose-100 text-rose-800 border-rose-200'

            return (
              <div
                key={examResult.id}
                className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-sm"
              >
                {/* Accordion Header */}
                <div
                  className="flex flex-wrap items-center justify-between gap-4 p-4 bg-gradient-to-r from-slate-50 to-white cursor-pointer hover:from-slate-100/60 transition-colors border-b"
                  onClick={() => setExpandedExam(isExamExpanded ? null : examResult.id)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0">
                      <ClipboardCheck className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                        {examResult.examName}
                      </h4>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {examResult.startDate.split('T')[0] === examResult.endDate.split('T')[0]
                          ? formatDate(examResult.startDate)
                          : `${formatDate(examResult.startDate)} - ${formatDate(examResult.endDate)}`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 ml-auto">
                    <div className="text-right">
                      <span className="text-xl font-black text-slate-900">
                        {totalObtained} / {totalPossible} ({pct.toFixed(1)}%)
                      </span>
                      <div className="flex items-center justify-end gap-1.5 mt-0.5">
                        <Badge className={`${gradeBadgeColor} text-[10px] font-bold border py-0`}>
                          Grade: {grade}
                        </Badge>
                        <Badge className={`${passed ? 'bg-emerald-100 text-emerald-800 border-emerald-200' : 'bg-rose-100 text-rose-800 border-rose-200'} text-[10px] font-bold border py-0`}>
                          {passed ? 'PASS' : 'FAIL'}
                        </Badge>
                      </div>
                    </div>

                    {isExamExpanded ? (
                      <ChevronUp className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                    )}
                  </div>
                </div>

                {/* Expanded content */}
                {isExamExpanded && (
                  <div className="p-4 bg-slate-50/30 space-y-4">
                    {examResult.remarks && (
                      <div className="bg-slate-50 border rounded-lg p-3 text-xs text-slate-600 italic">
                        <strong>Remarks: </strong>"{examResult.remarks}"
                      </div>
                    )}

                    {examResult.details && examResult.details.length > 0 ? (
                      <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#173B7A] text-white text-[10px] font-bold uppercase tracking-wider">
                                <th className="px-4 py-2 text-left font-semibold">Subject</th>
                                <th className="px-4 py-2 text-center font-semibold">Obtained Marks</th>
                                <th className="px-4 py-2 text-center font-semibold">Total Marks</th>
                                <th className="px-4 py-2 text-center font-semibold">Percentage</th>
                                <th className="px-4 py-2 text-center font-semibold">Grade</th>
                                <th className="px-4 py-2 text-center font-semibold">Status</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                              {examResult.details.map((detail) => {
                                const detailPct = detail.totalMarks > 0 ? (detail.obtainedMarks / detail.totalMarks) * 100 : 0
                                const detailPassed = detail.isPassed
                                const detailGradeBadgeColor =
                                  detail.grade === 'A+' || detail.grade === 'A'
                                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                                    : detail.grade.startsWith('B')
                                    ? 'text-blue-700 bg-blue-50 border-blue-200'
                                    : detail.grade.startsWith('C')
                                    ? 'text-amber-700 bg-amber-50 border-amber-200'
                                    : 'text-rose-700 bg-rose-50 border-rose-200'

                                return (
                                  <tr key={detail.id} className="hover:bg-slate-50/50">
                                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                                      {detail.subjectName}
                                      <span className="text-[10px] text-slate-400 block font-normal">{detail.subjectCode}</span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center font-bold text-slate-900">{detail.obtainedMarks}</td>
                                    <td className="px-4 py-2.5 text-center text-slate-500">{detail.totalMarks}</td>
                                    <td className="px-4 py-2.5 text-center font-semibold text-indigo-600">{detailPct.toFixed(1)}%</td>
                                    <td className="px-4 py-2.5 text-center">
                                      <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-bold border ${detailGradeBadgeColor}`}>
                                        {detail.grade}
                                      </span>
                                    </td>
                                    <td className="px-4 py-2.5 text-center">
                                      {detailPassed ? (
                                        <span className="inline-block text-[9px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                          Pass
                                        </span>
                                      ) : (
                                        <span className="inline-block text-[9px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold border border-rose-200">
                                          Fail
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-6 text-xs text-slate-400 bg-white border rounded-xl">
                        No subject-wise details available for this exam.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function StudentEnrollmentPageInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const qc = useQueryClient()
  const [selected, setSelected] = useState<string[]>([])


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

  // Derived helpers
  const studentName = `${data?.student?.firstName ?? ''} ${data?.student?.lastName ?? ''}`.trim()
  const initials = [data?.student?.firstName?.[0], data?.student?.lastName?.[0]].filter(Boolean).join('').toUpperCase()
  const shiftLabel = section?.shift?.code
    ? SESSION_SHIFT_LABELS[section.shift.code as keyof typeof SESSION_SHIFT_LABELS]
    : section?.shift?.name ?? '—'

  return (
    <div className="space-y-6">

      {/* ── Premium Hero Profile Card ─────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-800 shadow-xl">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rounded-full bg-indigo-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-8 -left-8 h-40 w-40 rounded-full bg-emerald-500/15 blur-2xl" />

        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          {/* Avatar */}
          <div className="shrink-0">
            {data?.student?.profilePicture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.student.profilePicture}
                alt={studentName}
                className="h-20 w-20 rounded-2xl object-cover ring-4 ring-white/20 shadow-lg"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-400 to-indigo-600 text-2xl font-black text-white shadow-lg ring-4 ring-white/20">
                {initials || <GraduationCap className="h-9 w-9" />}
              </div>
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black text-white truncate">{studentName || 'My Academic Portal'}</h1>
            <p className="text-indigo-300 text-sm mt-0.5">
              {data?.activeYear?.name ?? 'Current Academic Year'}
              {data?.student?.campus ? ` · ${data.student.campus.name}` : ''}
            </p>

            {/* Chip row */}
            <div className="mt-3 flex flex-wrap gap-2">
              {section && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm border border-white/10">
                  <BookOpen className="h-3.5 w-3.5 text-indigo-300" />
                  {section.className}-{section.sectionName}
                </span>
              )}
              {shiftLabel !== '—' && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm border border-white/10">
                  <Clock className="h-3.5 w-3.5 text-amber-300" />
                  {shiftLabel} Shift
                </span>
              )}
              {data?.enrollment?.deliveryMode && (
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm border border-white/10">
                  {data.enrollment.deliveryMode}
                </span>
              )}
              {data?.student?.house && (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm border border-white/10"
                  style={{ backgroundColor: `${data.student.house.color}33` }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: data.student.house.color }} />
                  {data.student.house.name} House
                </span>
              )}
            </div>
          </div>

          {/* Roll number badge */}
          {data?.enrollment?.rollNumber && (
            <div className="shrink-0 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">Roll No.</p>
              <p className="text-2xl font-black text-white">{data.enrollment.rollNumber}</p>
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-2 divide-x divide-white/10 border-t border-white/10 sm:grid-cols-4">
          {[
            { label: 'Campus', value: section?.campus?.name ?? data?.student?.campus?.name ?? '—' },
            { label: 'Batch', value: section?.batch?.name ?? data?.student?.batch?.name ?? '—' },
            {
              label: 'Subjects',
              // WHY aggregate: multi-shift students have subject enrollments per
              // enrollment record, not on the top-level subjectEnrollments field.
              value: (data?.enrollments ?? []).reduce(
                (sum, enr) => sum + ((enr as { subjectEnrollments?: unknown[] }).subjectEnrollments?.length ?? 0),
                data?.subjectEnrollments?.length ?? 0
              ) || (data?.subjectEnrollments?.length ?? 0),
            },
            { label: 'Semester', value: data?.activeYear?.name ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="px-4 py-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400">{label}</p>
              <p className="mt-0.5 truncate text-sm font-bold text-white">{String(value)}</p>
            </div>
          ))}
        </div>
      </div>

      {data?.message && !data.enrollment && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6 text-amber-900 text-sm">{data.message}</CardContent>
        </Card>
      )}

      {(data?.enrollments?.length ?? 0) > 1 && (
        <Card className="border-indigo-200 bg-indigo-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">All Shift Enrollments</CardTitle>
            <CardDescription>You are enrolled in multiple sessions this academic year.</CardDescription>
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

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          router.replace(`/dashboard/enrollment?tab=${v}`, { scroll: false })
        }}
      >
        <TabsList>
          <TabsTrigger value="courses">Courses &amp; Timetable</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="tasks">Task Marks</TabsTrigger>
          <TabsTrigger value="targets">My Targets</TabsTrigger>
        </TabsList>

        <TabsContent value="courses" className="mt-4 space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* ── My Subjects — grouped by shift for multi-shift students ─── */}
            {(() => {
              // Build a list of {shiftLabel, subjectEnrollments} per enrollment.
          // For single-shift students this renders one unlabelled card.
          // For multi-shift students each shift gets its own labelled card.
          const allEnrollments = (data?.enrollments ?? []) as Array<{
            id: string
            rollNumber: string
            classSection: {
              className: string
              sectionName: string
              shift?: { name: string; code: string }
            }
            subjectEnrollments?: PortalData['subjectEnrollments']
          }>

          // Fall back to the top-level subjectEnrollments if freshEnrollments
          // doesn't carry them (older API response shape)
          const slots =
            allEnrollments.length > 0 && allEnrollments.some((e) => (e.subjectEnrollments?.length ?? 0) > 0)
              ? allEnrollments
              : [{ id: 'primary', rollNumber: data?.enrollment?.rollNumber ?? '', classSection: data?.enrollment?.classSection ?? { className: '', sectionName: '' }, subjectEnrollments: data?.subjectEnrollments }]

          const multiShift = slots.length > 1

          return (
            <div className="space-y-4">
              {slots.map((enr) => {
                const subs = enr.subjectEnrollments ?? []
                const shiftName = enr.classSection.shift?.name
                const cardTitle = multiShift && shiftName
                  ? `${enr.classSection.className}-${enr.classSection.sectionName} · ${shiftName} · Roll ${enr.rollNumber}`
                  : 'My Subjects'

                return (
                  <Card key={enr.id} className="border border-slate-200 shadow-sm">
                    <CardHeader className="bg-slate-50/50 border-b pb-4">
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-5 h-5 text-indigo-600" />
                        <div>
                          <CardTitle className="text-base font-bold text-slate-900">{cardTitle}</CardTitle>
                          <CardDescription className="text-xs text-slate-500 mt-0.5">
                            {section?.curriculumMode === 'FIXED'
                              ? 'Mandatory subjects are assigned automatically by the academy.'
                              : 'Electives require admin approval after you submit choices.'}
                          </CardDescription>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-4">
                      {subs.length === 0 ? (
                        <div className="text-center py-10">
                          <BookOpen className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                          <p className="text-sm font-semibold text-slate-500">No subjects assigned yet.</p>
                          <p className="text-xs text-slate-400 mt-1">Contact the administration to complete your enrollment.</p>
                        </div>
                      ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {subs.map((se) => (
                            <div
                              key={se.id}
                              className="group relative flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/40 p-4 transition-all hover:border-indigo-200 hover:bg-indigo-50/30 hover:shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-2 mb-3">
                                <div className="min-w-0">
                                  <p className="font-bold text-slate-900 text-sm leading-tight truncate">
                                    {se.subjectOffering.subject.name}
                                  </p>
                                  {se.subjectOffering.subject.code && (
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mt-0.5">
                                      {se.subjectOffering.subject.code}
                                    </p>
                                  )}
                                </div>
                                <Badge
                                  className={`shrink-0 text-[10px] font-bold py-0.5 ${
                                    se.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                                    se.status === 'PENDING'  ? 'bg-amber-100 text-amber-800 border-amber-200' :
                                    'bg-rose-100 text-rose-800 border-rose-200'
                                  }`}
                                >
                                  {se.status}
                                </Badge>
                              </div>
                              {se.subjectOffering.teacher ? (
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[10px] font-black text-indigo-700">
                                    {se.subjectOffering.teacher.firstName[0]}{se.subjectOffering.teacher.lastName[0]}
                                  </div>
                                  <p className="text-xs text-slate-500 truncate">
                                    {se.subjectOffering.teacher.firstName} {se.subjectOffering.teacher.lastName}
                                  </p>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400 italic">Teacher TBA</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )
        })()}

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
                            {slot.teacher ? `${slot.teacher.firstName} ${slot.teacher.lastName}` : '—'}
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

          <MonitoringCard results={results} />
        </TabsContent>

        <TabsContent value="results" className="mt-4 space-y-4">
          <ResultsTabContent
            results={results}
            student={data?.student}
            sessionName={data?.activeYear?.name}
          />
        </TabsContent>

        {/* ── Task Marks Tab ────────────────────────────────────────── */}
        <TabsContent value="tasks" className="mt-4 space-y-4">
          <div className="flex items-center gap-2 px-1 mb-2">
            <ClipboardCheck className="w-5 h-5 text-teal-600" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Task &amp; Assignment Marks</h3>
              <p className="text-xs text-slate-500">
                Subject-wise breakdown of all tasks graded by your teachers.
              </p>
            </div>
          </div>
          <TaskMarksPanel taskResults={results?.taskResults ?? []} />
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
