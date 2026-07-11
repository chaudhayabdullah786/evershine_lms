'use client'

import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Star } from 'lucide-react'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type MonitoringKind = 'daily' | 'monthly' | 'yearly'

type DailySubject = {
  subjectOfferingId: string
  subjectName: string
  performanceGrade: string
  remarks: string
  isAbsent: boolean
  isStarOfDay: boolean
  isConcern: boolean
}

type AggregateSubject = {
  id: string
  name: string
  obtainedMarks: number
  totalMarks: number
  percentage: number
  performanceBatch: string
  remarks: string
}

type DeclaredMonthlyReport = {
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
}

type MonitoringReport = {
  type: MonitoringKind
  periodLabel?: string
  report?: null
  message?: string
  classSection?: { className: string; sectionName: string }
  subjects?: DailySubject[] | AggregateSubject[]
  highlights?: { isStarOfDay: boolean; isConcern: boolean }
  summary?: {
    totalMarks: number
    obtainedMarks: number
    percentage: number
    performanceBatch: string
  }
  monthly?: DeclaredMonthlyReport
}

type Props = {
  endpoint: string
  title?: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function localToday() {
  return new Date().toLocaleDateString('en-CA')
}

export function MonitoringReportPanel({ endpoint, title = 'Monitoring Report' }: Props) {
  const now = new Date()
  const [type, setType] = useState<MonitoringKind>('daily')
  const [date, setDate] = useState(localToday)
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [year, setYear] = useState(String(now.getFullYear()))

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ type })
    if (type === 'daily') params.set('date', date)
    if (type === 'monthly') params.set('month', month)
    if (type !== 'daily') params.set('year', year)
    return params.toString()
  }, [date, month, type, year])

  const { data: raw, isLoading } = useQuery<MonitoringReport | { data: MonitoringReport }>({
    queryKey: ['monitoring-report', endpoint, queryString],
    queryFn: () => fetchApi<MonitoringReport | { data: MonitoringReport }>(`${endpoint}?${queryString}`),
  })
  const report: MonitoringReport | undefined = raw
    ? ('data' in raw ? raw.data : raw)
    : undefined
  const dailySubjects = report?.type === 'daily' ? (report.subjects as DailySubject[] | undefined) ?? [] : []
  const aggregateSubjects = report?.type !== 'daily' ? (report?.subjects as AggregateSubject[] | undefined) ?? [] : []
  const monthlyReport = report?.type === 'monthly' ? report.monthly : undefined

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription>
              {type === 'daily'
                ? 'Daily feedback is qualitative: performance labels, remarks, and follow-up highlights only.'
                : 'Monthly and yearly summaries show accumulated marks, percentages, and performance group.'}
            </CardDescription>
          </div>
          <div className="inline-flex w-fit rounded-md border bg-slate-50 p-1 text-xs font-semibold">
            {(['daily', 'monthly', 'yearly'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={`rounded px-3 py-1.5 capitalize transition ${
                  type === option ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {type === 'daily' ? (
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-600">Report Date</label>
              <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </div>
          ) : (
            <>
              {type === 'monthly' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Month</label>
                  <Select value={month} onValueChange={setMonth}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((label, index) => <SelectItem key={label} value={String(index + 1)}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Calendar Year</label>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, index) => now.getFullYear() - index).map((value) => (
                      <SelectItem key={value} value={String(value)}>{value}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center gap-2 py-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading report...</div>
        ) : !report || report.report === null ? (
          <p className="py-4 text-sm text-slate-500">{report?.message ?? 'No monitoring report is available for this period.'}</p>
        ) : type === 'daily' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2 text-xs font-semibold">
              {report.highlights?.isStarOfDay && <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-amber-900"><Star className="h-3.5 w-3.5" /> Star of the Day</span>}
              {report.highlights?.isConcern && <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-rose-800"><AlertTriangle className="h-3.5 w-3.5" /> Follow-up recommended</span>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {dailySubjects.map((subject) => (
                <div key={subject.subjectOfferingId} className={`rounded-lg border p-3 ${subject.isConcern ? 'border-rose-200 bg-rose-50' : subject.isStarOfDay ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900">{subject.subjectName}</p>
                    <span className="text-xs font-bold text-indigo-700">{subject.isAbsent ? 'Absent' : subject.performanceGrade}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{subject.remarks || 'No remarks added yet.'}</p>
                </div>
              ))}
            </div>
          </div>
        ) : monthlyReport ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3 text-sm sm:grid-cols-4">
              <div><p className="text-xs text-slate-500">Total marks</p><p className="font-bold text-slate-900">{monthlyReport.student.totalMarks}</p></div>
              <div><p className="text-xs text-slate-500">Obtained marks</p><p className="font-bold text-slate-900">{monthlyReport.student.obtainedMarks}</p></div>
              <div><p className="text-xs text-slate-500">Percentage</p><p className="font-bold text-slate-900">{monthlyReport.student.percentage}%</p></div>
              <div><p className="text-xs text-slate-500">Group</p><p className="font-bold text-slate-900">{monthlyReport.student.performanceBatch}</p></div>
            </div>
            <div className="divide-y rounded-lg border">
              {monthlyReport.columns.map((column) => {
                const marks = monthlyReport.student.courseMarks[column.id]
                const value = column.type === 'COURSE'
                  ? marks ? `${marks.obtainedMarks} / ${marks.totalMarks}` : '—'
                  : monthlyReport.student.customValues[column.id] || '—'
                return <div key={column.id} className="flex items-center justify-between gap-4 px-3 py-2 text-sm"><span className="font-semibold text-slate-900">{column.label}</span><span className="text-slate-600">{value}</span></div>
              })}
            </div>
            {monthlyReport.student.remarks && <p className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-700"><span className="font-semibold">Teacher remarks:</span> {monthlyReport.student.remarks}</p>}
          </div>
        ) : (
          <div className="space-y-4">
            {report.summary && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border bg-slate-50 p-3 text-sm sm:grid-cols-4">
                <div><p className="text-xs text-slate-500">Total marks</p><p className="font-bold text-slate-900">{report.summary.totalMarks}</p></div>
                <div><p className="text-xs text-slate-500">Obtained marks</p><p className="font-bold text-slate-900">{report.summary.obtainedMarks}</p></div>
                <div><p className="text-xs text-slate-500">Percentage</p><p className="font-bold text-slate-900">{report.summary.percentage}%</p></div>
                <div><p className="text-xs text-slate-500">Group</p><p className="font-bold text-slate-900">{report.summary.performanceBatch}</p></div>
              </div>
            )}
            <div className="divide-y rounded-lg border">
              {aggregateSubjects.map((subject) => (
                <div key={subject.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-semibold text-slate-900">{subject.name}</span>
                  <span className="text-slate-600">{subject.obtainedMarks} / {subject.totalMarks} · {subject.percentage}% · {subject.performanceBatch}</span>
                  {subject.remarks && <span className="w-full text-xs text-slate-500">{subject.remarks}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
