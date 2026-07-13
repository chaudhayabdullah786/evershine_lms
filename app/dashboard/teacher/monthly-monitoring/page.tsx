'use client'

import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Download, Loader2, Plus, Save, Trash2, MessageCircle, HelpCircle } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { derivePerformanceBatch } from '@/lib/academic/result-utils'
import { downloadMonitoringExcel, type MonitoringStudentRow } from '@/lib/excel/monitoring-report'
import { notify } from '@/lib/notify'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

type Column = { id: string; label: string; type: 'COURSE' | 'CUSTOM' }
type Mark = { totalMarks: number; obtainedMarks: number }
type StudentRow = {
  serial: number
  studentId: string
  name: string
  fatherName: string | null
  rollNumber: string
  courseMarks: Record<string, Mark>
  customValues: Record<string, string>
  remarks: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  performanceBatch: string
  performanceBatchOverride?: string
  rank: number
}
type Report = {
  columns: Column[]
  students: StudentRow[]
  declarationStatus: 'DRAFT' | 'DECLARED'
  isPersisted: boolean
}

type DailyEntry = {
  serial: number
  studentId: string
  rollNumber: string
  name: string
  courseName: string
  remarks: string | null
  highlight: string | null
  grade: string | null
  score: number
  isAbsent: boolean
}

type DailyReport = {
  type: 'daily'
  date: string
  subjects: Array<{ id: string; name: string; code: string; maxDailyScore: number }>
  dailyEntries: DailyEntry[]
}
type AcademicYear = { id: string; name: string; isActive: boolean }
type Section = { id: string; className: string; sectionName: string }

const MONTHS = Array.from({ length: 12 }, (_, index) => ({
  value: index + 1,
  label: new Date(2020, index, 1).toLocaleString('en', { month: 'long' }),
}))

function reportSignature(report: Report): string {
  return JSON.stringify({
    columns: report.columns,
    students: report.students.map(({ studentId, courseMarks, customValues, remarks, performanceBatch, performanceBatchOverride }) => ({
      studentId,
      courseMarks,
      customValues,
      remarks,
      performanceBatch,
      performanceBatchOverride,
    })),
  })
}

function recalculateReport(report: Report): Report {
  const courseColumnIds = new Set(report.columns.filter((column) => column.type === 'COURSE').map((column) => column.id))
  const calculatedStudents = report.students.map((student) => {
    const marks = Object.entries(student.courseMarks)
      .filter(([columnId]) => courseColumnIds.has(columnId))
      .map(([, mark]) => mark)
    const totalMarks = marks.reduce((sum, mark) => sum + mark.totalMarks, 0)
    const obtainedMarks = marks.reduce((sum, mark) => sum + mark.obtainedMarks, 0)
    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 10000) / 100 : 0
    return {
      ...student,
      totalMarks,
      obtainedMarks,
      percentage,
      performanceBatch: student.performanceBatchOverride || student.performanceBatch || derivePerformanceBatch(percentage),
      rank: 0,
    }
  })

  const rankedStudentIds = [...calculatedStudents]
    .sort((left, right) => right.percentage - left.percentage || left.name.localeCompare(right.name))
    .map((student) => student.studentId)

  return {
    ...report,
    students: calculatedStudents.map((student) => ({
      ...student,
      rank: rankedStudentIds.indexOf(student.studentId) + 1,
    })),
  }
}

function groupCount(report: Report, group: string): number {
  return report.students.filter((student) => student.performanceBatch === group).length
}

export default function MonthlyMonitoringPage() {
  const queryClient = useQueryClient()
  const router = useRouter()
  const [academicYearId, setAcademicYearId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [month, setMonth] = useState(new Date().getMonth() + 1)
  const [year, setYear] = useState(new Date().getFullYear())
  const [reportMode, setReportMode] = useState<'monthly' | 'daily'>('monthly')
  const [dailyDate, setDailyDate] = useState(new Date().toLocaleDateString('en-CA'))
  const [draft, setDraft] = useState<Report | null>(null)
  const [savedSignature, setSavedSignature] = useState('')

  const { data: years = [] } = useQuery<AcademicYear[]>({
    queryKey: ['academic-years'],
    queryFn: () => fetchApi('/api/academic-years'),
  })
  const { data: sections = [] } = useQuery<Section[]>({
    queryKey: ['teacher-sections'],
    queryFn: () => fetchApi('/api/teacher-portal/sections'),
  })

  useEffect(() => {
    if (!academicYearId && years.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- initializes the selection from the asynchronously loaded academic years.
      setAcademicYearId(years.find((record) => record.isActive)?.id ?? years[0].id)
    }
  }, [academicYearId, years])

  const query = useQuery<Report>({
    queryKey: ['monthly-monitoring-editor', sectionId, academicYearId, month, year],
    enabled: reportMode === 'monthly' && Boolean(sectionId && academicYearId),
    queryFn: () => fetchApi(
      `/api/teacher-portal/monthly-monitoring?type=monthly&classSectionId=${sectionId}&academicYearId=${academicYearId}&month=${month}&year=${year}`,
    ),
  })

  const dailyQuery = useQuery<DailyReport>({
    queryKey: ['daily-monitoring-report', sectionId, academicYearId, dailyDate],
    enabled: reportMode === 'daily' && Boolean(sectionId && academicYearId && dailyDate),
    queryFn: () => fetchApi(
      `/api/teacher-portal/monthly-monitoring?type=daily&classSectionId=${sectionId}&academicYearId=${academicYearId}&date=${dailyDate}`,
    ),
  })

  useEffect(() => {
    if (query.data) {
      const normalized = recalculateReport(query.data)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- query data is copied into an editable draft, never mutated directly.
      setDraft(normalized)
      setSavedSignature(reportSignature(normalized))
    }
  }, [query.data])

  const calculatedDraft = useMemo(() => (draft ? recalculateReport(draft) : null), [draft])
  const isDirty = Boolean(calculatedDraft && reportSignature(calculatedDraft) !== savedSignature)
  const selectedSection = sections.find((section) => section.id === sectionId)

  const handleWhatsAppShare = () => {
    if (!dailyQuery.data?.dailyEntries || dailyQuery.data.dailyEntries.length === 0) return

    const entries = dailyQuery.data.dailyEntries
    const dateStr = dailyDate
    const sectionName = selectedSection ? `${selectedSection.className} — ${selectedSection.sectionName}` : 'Section'

    let message = `*EVERSHINE ACADEMY*\n`
    message += `*Daily Academic Monitoring Report*\n`
    message += `----------------------------------\n`
    message += `*Class & Section:* ${sectionName}\n`
    message += `*Date:* ${dateStr}\n\n`
    message += `*Student Performance Summary:*\n`

    entries.forEach((entry) => {
      const roll = entry.rollNumber ? `Roll ${entry.rollNumber}` : `S.No ${entry.serial}`
      const highlightEmoji = entry.highlight === 'STAR_OF_THE_DAY' ? ' ⭐' : entry.highlight === 'POOR' ? ' ⚠️' : ''
      const gradeText = entry.grade ? ` (Grade: ${entry.grade})` : ''
      
      message += `• *${entry.name}* (${roll}):\n`
      message += `  Subject: ${entry.courseName}${gradeText}${highlightEmoji}\n`
      if (entry.remarks) {
        message += `  Remarks: _${entry.remarks}_\n`
      }
    })

    message += `----------------------------------\n`
    message += `Generated via Evershine Academy LMS.`

    const encodedText = encodeURIComponent(message)
    window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank')
  }

  const persistDraft = async () => {
    if (!calculatedDraft) throw new Error('Select a section before saving the report.')
    return fetchApi('/api/teacher-portal/monthly-monitoring', {
      method: 'POST',
      body: JSON.stringify({
        classSectionId: sectionId,
        month,
        year,
        academicYearId,
        reportData: {
          columns: calculatedDraft.columns,
          students: calculatedDraft.students.map(({ studentId, courseMarks, customValues, remarks, performanceBatch, performanceBatchOverride }) => ({
            studentId,
            courseMarks,
            customValues,
            remarks,
            performanceBatch,
            performanceBatchOverride,
          })),
        },
      }),
    })
  }

  const save = useMutation({
    mutationFn: persistDraft,
    onSuccess: async () => {
      notify.success('Monthly monitoring draft saved.')
      await queryClient.invalidateQueries({ queryKey: ['monthly-monitoring-editor'] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const declare = useMutation({
    mutationFn: () => fetchApi('/api/teacher-portal/monthly-monitoring/declare', {
      method: 'POST',
      body: JSON.stringify({ classSectionId: sectionId, month, year, academicYearId }),
    }),
    onSuccess: async () => {
      notify.success('Monthly monitoring report declared and published.')
      await queryClient.invalidateQueries({ queryKey: ['monthly-monitoring-editor'] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const revertDeclaration = useMutation({
    mutationFn: () => fetchApi('/api/teacher-portal/monthly-monitoring/declare', {
      method: 'DELETE',
      body: JSON.stringify({ classSectionId: sectionId, month, year, academicYearId }),
    }),
    onSuccess: async () => {
      notify.success('Monthly monitoring report reverted to draft.')
      await queryClient.invalidateQueries({ queryKey: ['monthly-monitoring-editor'] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const updateDraft = (updater: (report: Report) => Report) => {
    setDraft((current) => (current ? updater(current) : current))
  }

  const addColumn = (type: Column['type']) => {
    updateDraft((current) => ({
      ...current,
      columns: [
        ...current.columns,
        {
          id: `${type === 'COURSE' ? 'mark' : 'field'}-${Date.now()}`,
          label: type === 'COURSE' ? 'New marks column' : 'New custom field',
          type,
        },
      ],
    }))
  }

  const updateColumnLabel = (columnId: string, label: string) => {
    updateDraft((current) => ({
      ...current,
      columns: current.columns.map((column) => column.id === columnId ? { ...column, label } : column),
    }))
  }

  const removeColumn = (columnId: string) => {
    updateDraft((current) => ({
      ...current,
      columns: current.columns.filter((column) => column.id !== columnId),
      students: current.students.map((student) => {
        const courseMarks = { ...student.courseMarks }
        const customValues = { ...student.customValues }
        delete courseMarks[columnId]
        delete customValues[columnId]
        return { ...student, courseMarks, customValues }
      }),
    }))
  }

  const updateMark = (studentId: string, columnId: string, field: keyof Mark, value: string) => {
    const parsed = Number(value)
    const marksValue = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
    updateDraft((current) => ({
      ...current,
      students: current.students.map((student) => {
        if (student.studentId !== studentId) return student
        const currentMark = student.courseMarks[columnId] ?? { totalMarks: 0, obtainedMarks: 0 }
        return {
          ...student,
          courseMarks: { ...student.courseMarks, [columnId]: { ...currentMark, [field]: marksValue } },
        }
      }),
    }))
  }

  const updateCustomValue = (studentId: string, columnId: string, value: string) => {
    updateDraft((current) => ({
      ...current,
      students: current.students.map((student) => student.studentId === studentId
        ? { ...student, customValues: { ...student.customValues, [columnId]: value } }
        : student),
    }))
  }

  const updateRemarks = (studentId: string, remarks: string) => {
    updateDraft((current) => ({
      ...current,
      students: current.students.map((student) => student.studentId === studentId ? { ...student, remarks } : student),
    }))
  }

  const updatePerformanceBatchOverride = (studentId: string, performanceBatchOverride: string) => {
    updateDraft((current) => ({
      ...current,
      students: current.students.map((student) => student.studentId === studentId
        ? { ...student, performanceBatchOverride, performanceBatch: performanceBatchOverride }
        : student),
    }))
  }

  const canSave = reportMode === 'monthly' && Boolean(calculatedDraft && (isDirty || !calculatedDraft.isPersisted) && calculatedDraft.declarationStatus === 'DRAFT')
  const canDeclare = reportMode === 'monthly' && Boolean(calculatedDraft?.isPersisted && !isDirty && calculatedDraft.declarationStatus === 'DRAFT')
  const exportRows: MonitoringStudentRow[] = (calculatedDraft?.students ?? []).map((student) => ({
    ...student,
    subjectScores: Object.fromEntries(
      calculatedDraft?.columns
        .filter((column) => column.type === 'COURSE')
        .map((column) => [column.id, student.courseMarks[column.id]?.obtainedMarks ?? 0]) ?? [],
    ),
  }))
  const dailyExportRows: MonitoringStudentRow[] = (dailyQuery.data?.dailyEntries ?? []).map((entry) => ({
    serial: entry.serial,
    studentId: entry.studentId,
    name: entry.name,
    fatherName: null,
    rollNumber: entry.rollNumber,
    subjectScores: {},
    totalMarks: 0,
    obtainedMarks: entry.score,
    percentage: 0,
    performanceBatch: '',
    rank: 0,
    courseName: entry.courseName,
    remarks: entry.remarks,
    highlight: entry.highlight,
    grade: entry.grade,
  }))

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Academic Monitoring Portal</h1>
          <p className="mt-1 text-sm text-slate-500">Create, edit, export, and publish professional daily and monthly monitoring reports.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={reportMode === 'monthly' ? 'default' : 'outline'} onClick={() => setReportMode('monthly')}>Edit Monthly Monitoring Report</Button>
          <Button variant={reportMode === 'daily' ? 'default' : 'outline'} onClick={() => setReportMode('daily')}>Edit Daily Monitoring Report</Button>
          {reportMode === 'monthly' && <Button variant="outline" onClick={() => addColumn('COURSE')} disabled={!calculatedDraft || calculatedDraft.declarationStatus === 'DECLARED'}>
            <Plus className="mr-2 h-4 w-4" />Add marks column
          </Button>}
          {reportMode === 'monthly' && <Button variant="outline" onClick={() => addColumn('CUSTOM')} disabled={!calculatedDraft || calculatedDraft.declarationStatus === 'DECLARED'}>
            <Plus className="mr-2 h-4 w-4" />Add custom field
          </Button>}
          {reportMode === 'monthly' && <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending}>
            {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save draft
          </Button>}
          {reportMode === 'monthly' && calculatedDraft?.declarationStatus === 'DRAFT' && (
            <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => declare.mutate()} disabled={!canDeclare || declare.isPending}>
              {declare.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Declare & publish
            </Button>
          )}
          {reportMode === 'monthly' && calculatedDraft?.declarationStatus === 'DECLARED' && (
            <Button className="bg-amber-600 hover:bg-amber-700" onClick={() => revertDeclaration.mutate()} disabled={revertDeclaration.isPending}>
              {revertDeclaration.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Revert to Draft
            </Button>
          )}
          {reportMode === 'daily' && sectionId && (
            <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold" onClick={() => router.push(`/dashboard/teacher/daily-scores?sectionId=${sectionId}&date=${dailyDate}`)}>
              Edit Daily Scores
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-4 pt-6 md:grid-cols-4">
          <Select value={academicYearId} onValueChange={setAcademicYearId}>
            <SelectTrigger><SelectValue placeholder="Academic year" /></SelectTrigger>
            <SelectContent>{years.map((record) => <SelectItem key={record.id} value={record.id}>{record.name}{record.isActive ? ' (Active)' : ''}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger><SelectValue placeholder="Class section" /></SelectTrigger>
            <SelectContent>{sections.map((section) => <SelectItem key={section.id} value={section.id}>{section.className} — {section.sectionName}</SelectItem>)}</SelectContent>
          </Select>
          {reportMode === 'monthly' ? (
            <>
              <Select value={String(month)} onValueChange={(value) => setMonth(Number(value))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((record) => <SelectItem key={record.value} value={String(record.value)}>{record.label}</SelectItem>)}</SelectContent>
              </Select>
              <Input aria-label="Calendar year" type="number" min={2020} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} />
            </>
          ) : (
            <Input aria-label="Daily report date" type="date" value={dailyDate} onChange={(event) => setDailyDate(event.target.value)} />
          )}
        </CardContent>
      </Card>

      {!sectionId ? (
        <Card><CardContent className="py-16 text-center text-slate-500">Select a class section to build its monitoring report.</CardContent></Card>
      ) : reportMode === 'daily' ? (
        dailyQuery.isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-6">
            <Card className="border-indigo-100 bg-indigo-50/50 shadow-sm">
              <CardContent className="p-4 flex gap-3 text-sm text-indigo-950">
                <HelpCircle className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-indigo-900">Daily Monitoring Instructions & Guide</p>
                  <p className="text-indigo-800/90 text-xs">
                    This section displays the aggregated daily scores, grades, highlights (e.g. Star of the Day), and comments entered by teachers for each student.
                  </p>
                  <ul className="list-disc pl-5 space-y-1 mt-2 text-indigo-800/80 text-xs">
                    <li>If you need to make changes, correct errors, or input new daily scores, click the <strong className="text-indigo-900">Edit Daily Scores</strong> button in the top right to go directly to the evaluation sheet.</li>
                    <li>To save a digital copy or share offline, use the <strong className="text-indigo-900">Download Excel</strong> option below.</li>
                    <li>Use <strong className="text-indigo-900">Share via WhatsApp</strong> to instantly share student performance reports with parent groups or campus coordinators.</li>
                  </ul>
                </div>
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle>{selectedSection?.className} — {selectedSection?.sectionName} · {dailyDate}</CardTitle>
                <CardDescription>Daily report format: Serial Number, Roll Number, Student Name, Course Name, Remarks, Highlight, and teacher-assigned Grade.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto p-0">
              {(dailyQuery.data?.dailyEntries ?? []).length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-500">No daily monitoring entries found for this date. Use Daily Scores to save student grades and remarks first.</div>
              ) : (
                <Table className="min-w-[900px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>S.No</TableHead><TableHead>Roll No</TableHead><TableHead>Student Name</TableHead><TableHead>Course Name</TableHead><TableHead>Remarks</TableHead><TableHead>Highlight</TableHead><TableHead>Grade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(dailyQuery.data?.dailyEntries ?? []).map((entry) => (
                      <TableRow key={`${entry.studentId}-${entry.courseName}-${entry.serial}`}>
                        <TableCell>{entry.serial}</TableCell>
                        <TableCell>{entry.rollNumber || '—'}</TableCell>
                        <TableCell className="font-semibold">{entry.name}</TableCell>
                        <TableCell>{entry.courseName}</TableCell>
                        <TableCell>{entry.remarks || '—'}</TableCell>
                        <TableCell>{entry.highlight === 'STAR_OF_THE_DAY' ? 'Star of the Day' : entry.highlight === 'POOR' ? 'Poor of the Day' : '—'}</TableCell>
                        <TableCell className="font-semibold">{entry.grade ?? '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          </div>
        )
      ) : query.isLoading || !calculatedDraft ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Ever Shine Group', 'border-amber-200 bg-amber-50 text-amber-900'],
              ['Quaid Group', 'border-blue-200 bg-blue-50 text-blue-900'],
              ['Iqbal Group', 'border-emerald-200 bg-emerald-50 text-emerald-900'],
              ['Improvement Group', 'border-rose-200 bg-rose-50 text-rose-900'],
            ].map(([group, styles]) => (
              <Card key={group} className={styles}><CardContent className="p-4"><p className="text-xs font-medium">{group}</p><p className="mt-1 text-2xl font-bold">{groupCount(calculatedDraft, group)}</p></CardContent></Card>
            ))}
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>{selectedSection?.className} — {selectedSection?.sectionName} · {MONTHS[month - 1].label} {year}</CardTitle>
              <CardDescription>
                Student and father details are taken from the active enrollment. Totals, percentage, group, and rank update automatically from the marks you enter.
                {isDirty && ' Save this draft before publishing.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table className="min-w-[1300px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>S.No</TableHead><TableHead>Roll No</TableHead><TableHead>Student Name</TableHead><TableHead>Father&apos;s Name</TableHead>
                    {calculatedDraft.columns.map((column) => (
                      <TableHead key={column.id} className="min-w-[200px]">
                        <div className="flex items-center gap-1">
                          <Input aria-label={`${column.label} column title`} disabled={calculatedDraft.declarationStatus === 'DECLARED'} value={column.label} onChange={(event) => updateColumnLabel(column.id, event.target.value)} className="h-8 font-semibold" />
                          <Button aria-label={`Remove ${column.label}`} disabled={calculatedDraft.declarationStatus === 'DECLARED' || calculatedDraft.columns.length === 1} size="icon" variant="ghost" onClick={() => removeColumn(column.id)}><Trash2 className="h-3.5 w-3.5 text-rose-600" /></Button>
                        </div>
                        <span className="mt-1 block text-[10px] font-normal text-slate-500">{column.type === 'COURSE' ? 'Total / obtained marks' : 'Custom value'}</span>
                      </TableHead>
                    ))}
                    <TableHead>Total</TableHead><TableHead>Obtained</TableHead><TableHead>%</TableHead><TableHead>Group / batch</TableHead><TableHead>Rank</TableHead><TableHead className="min-w-[220px]">Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculatedDraft.students.map((student) => (
                    <TableRow key={student.studentId}>
                      <TableCell>{student.serial}</TableCell><TableCell>{student.rollNumber || '—'}</TableCell><TableCell className="font-semibold">{student.name}</TableCell><TableCell>{student.fatherName ?? '—'}</TableCell>
                      {calculatedDraft.columns.map((column) => {
                        const mark = student.courseMarks[column.id] ?? { totalMarks: 0, obtainedMarks: 0 }
                        const invalidMark = mark.obtainedMarks > mark.totalMarks
                        return <TableCell key={column.id}>
                          {column.type === 'COURSE' ? (
                            <div className="flex gap-2">
                              <Input aria-label={`${student.name} ${column.label} total marks`} disabled={calculatedDraft.declarationStatus === 'DECLARED'} type="number" min={0} placeholder="Total" value={mark.totalMarks || ''} onChange={(event) => updateMark(student.studentId, column.id, 'totalMarks', event.target.value)} />
                              <Input aria-label={`${student.name} ${column.label} obtained marks`} disabled={calculatedDraft.declarationStatus === 'DECLARED'} className={invalidMark ? 'border-rose-500 focus-visible:ring-rose-500' : ''} type="number" min={0} placeholder="Obt." value={mark.obtainedMarks || ''} onChange={(event) => updateMark(student.studentId, column.id, 'obtainedMarks', event.target.value)} />
                            </div>
                          ) : <Input aria-label={`${student.name} ${column.label}`} disabled={calculatedDraft.declarationStatus === 'DECLARED'} value={student.customValues[column.id] ?? ''} onChange={(event) => updateCustomValue(student.studentId, column.id, event.target.value)} />}
                        </TableCell>
                      })}
                      <TableCell>{student.totalMarks}</TableCell><TableCell>{student.obtainedMarks}</TableCell><TableCell className="font-semibold">{student.percentage.toFixed(2)}%</TableCell>
                      <TableCell>
                        <Select
                          disabled={calculatedDraft.declarationStatus === 'DECLARED'}
                          value={student.performanceBatch}
                          onValueChange={(val) => updatePerformanceBatchOverride(student.studentId, val)}
                        >
                          <SelectTrigger className="w-[170px] h-9">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Ever Shine Group">Ever Shine Group</SelectItem>
                            <SelectItem value="Quaid Group">Quaid Group</SelectItem>
                            <SelectItem value="Iqbal Group">Iqbal Group</SelectItem>
                            <SelectItem value="Improvement Group">Improvement Group</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{student.rank}</TableCell>
                      <TableCell><Input aria-label={`${student.name} remarks`} disabled={calculatedDraft.declarationStatus === 'DECLARED'} value={student.remarks} onChange={(event) => updateRemarks(student.studentId, event.target.value)} placeholder="Teacher remarks" /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}

      {((reportMode === 'monthly' && calculatedDraft) || (reportMode === 'daily' && dailyExportRows.length > 0)) && (
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await downloadMonitoringExcel({
                  type: reportMode,
                  classSectionLabel: `${selectedSection?.className ?? ''} - ${selectedSection?.sectionName ?? ''}`,
                  dateLabel: reportMode === 'monthly' ? `${MONTHS[month - 1].label} ${year}` : dailyDate,
                  academicYear: years.find((record) => record.id === academicYearId)?.name ?? '',
                  teacherName: 'Assigned instructor',
                  subjects: reportMode === 'monthly'
                    ? calculatedDraft!.columns.filter((column) => column.type === 'COURSE').map((column) => ({ id: column.id, name: column.label, code: '' }))
                    : dailyQuery.data?.subjects ?? [],
                  students: reportMode === 'monthly' ? exportRows : dailyExportRows,
                })
                notify.success('Excel report downloaded.')
              } catch (error) {
                notify.error(error instanceof Error ? error.message : 'Unable to generate the Excel report.')
              }
            }}
          >
            <Download className="mr-2 h-4 w-4" />Download Excel
          </Button>

          {reportMode === 'daily' && dailyExportRows.length > 0 && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-2"
              onClick={handleWhatsAppShare}
            >
              <MessageCircle className="h-4 w-4" />
              Share via WhatsApp
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
