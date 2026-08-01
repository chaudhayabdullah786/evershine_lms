'use client'

/**
 * MonthlyMonitoringGrid
 *
 * Renders a single declared monthly monitoring report as a structured,
 * professional grid inspired by the academy's official A4 report format.
 *
 * WHY snapshot rendering: The report `reportData` JSON is a declared snapshot.
 * Rendering it client-side from the already-fetched API response avoids any
 * additional DB queries and gives a consistent "at declaration time" view.
 *
 * Layout:
 *  - Header: Month/Year, class, performance batch badge, rank badge
 *  - Subject marks grid: course columns → Obtained / Total / %
 *  - Custom value rows (e.g. Behavior, Punctuality)
 *  - Summary footer: grand totals, overall percentage, progress bar
 *  - Teacher remarks callout
 */

import { Badge } from '@/components/ui/badge'
import {
  Award,
  Calendar,
  MessageSquare,
  TrendingUp,
  Star,
} from 'lucide-react'

// ── Types (aligned with API response from student-portal/results and guardian-portal) ──

export type MonthlyMonitoringColumn = {
  id: string
  label: string
  type: 'COURSE' | 'CUSTOM'
}

export type MonthlyMonitoringStudentData = {
  courseMarks: Record<string, { totalMarks: number; obtainedMarks: number }>
  customValues: Record<string, string>
  remarks: string
  totalMarks: number
  obtainedMarks: number
  percentage: number
  performanceBatch: string
  rank: number
}

export type MonthlyReportEntry = {
  id: string
  month: number
  year: number
  declaredAt: string | null
  columns: MonthlyMonitoringColumn[]
  student: MonthlyMonitoringStudentData
}

// ── Performance batch config ──────────────────────────────────────────────────

const BATCH_CONFIG: Record<string, { badge: string; bar: string; glow: string; label: string }> = {
  'Ever Shine': {
    badge: 'bg-amber-100 text-amber-800 border-amber-300',
    bar: 'bg-amber-400',
    glow: 'from-amber-50 to-white',
    label: '⭐ Ever Shine',
  },
  Quaid: {
    badge: 'bg-blue-100 text-blue-800 border-blue-300',
    bar: 'bg-blue-500',
    glow: 'from-blue-50 to-white',
    label: '🔵 Quaid',
  },
  Iqbal: {
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    bar: 'bg-emerald-500',
    glow: 'from-emerald-50 to-white',
    label: '🟢 Iqbal',
  },
  Improvement: {
    badge: 'bg-rose-100 text-rose-800 border-rose-300',
    bar: 'bg-rose-500',
    glow: 'from-rose-50 to-white',
    label: '📈 Improvement',
  },
}

function getBatchConf(batch: string) {
  return (
    BATCH_CONFIG[batch] ?? {
      badge: 'bg-slate-100 text-slate-700 border-slate-200',
      bar: 'bg-slate-400',
      glow: 'from-slate-50 to-white',
      label: batch,
    }
  )
}

function pctColor(pct: number) {
  if (pct >= 80) return 'text-emerald-700 font-black'
  if (pct >= 60) return 'text-blue-700 font-bold'
  if (pct >= 33) return 'text-amber-700 font-bold'
  return 'text-rose-700 font-bold'
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

// ── Component ─────────────────────────────────────────────────────────────────

export function MonthlyMonitoringGrid({ report }: { report: MonthlyReportEntry }) {
  const { month, year, declaredAt, columns, student } = report
  const batchConf = getBatchConf(student.performanceBatch)
  const pct = student.percentage
  const progressWidth = Math.min(pct, 100)

  // Separate course columns from custom value columns
  const courseColumns = columns.filter((c) => c.type === 'COURSE')
  const customColumns = columns.filter((c) => c.type === 'CUSTOM')

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className={`bg-gradient-to-r ${batchConf.glow} border-b border-slate-100 px-5 py-4`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Month / Year */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-base leading-tight">
                {MONTH_NAMES[month]} {year}
              </h3>
              <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                Monthly Performance Sheet
                {declaredAt
                  ? ` · Declared ${new Date(declaredAt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`
                  : ''}
              </p>
            </div>
          </div>

          {/* Badges */}
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`border font-bold text-xs py-1 px-3 ${batchConf.badge}`}>
              <Star className="h-3 w-3 mr-1 fill-current opacity-70" />
              {batchConf.label}
            </Badge>
            <Badge className="bg-indigo-100 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-bold text-xs py-1 px-3">
              <Award className="h-3 w-3 mr-1" />
              Rank #{student.rank}
            </Badge>
          </div>
        </div>
      </div>

      {/* ── Course Marks Grid ───────────────────────────────────────────── */}
      {courseColumns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider w-1/2">
                  Subject / Course
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Obtained
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Total
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {courseColumns.map((col, idx) => {
                const marks = student.courseMarks[col.id]
                const colObtained = marks?.obtainedMarks ?? 0
                const colTotal = marks?.totalMarks ?? 0
                const colPct = colTotal > 0 ? Math.round((colObtained / colTotal) * 10000) / 100 : 0

                return (
                  <tr
                    key={col.id}
                    className={`hover:bg-slate-50/60 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/30'}`}
                  >
                    <td className="px-5 py-3">
                      <span className="font-semibold text-slate-800">{col.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-bold text-slate-900">{colObtained}</span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">
                      {colTotal}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-sm ${pctColor(colPct)}`}>
                        {colPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Custom value rows (Behavior, Punctuality, etc.) ─────────────── */}
      {customColumns.length > 0 && (
        <div className="border-t border-slate-100 px-5 py-3">
          <p className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-2">
            Behavioral Indicators
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {customColumns.map((col) => {
              const val = student.customValues[col.id]
              if (!val) return null
              return (
                <div
                  key={col.id}
                  className="flex flex-col rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">
                    {col.label}
                  </span>
                  <span className="text-sm font-bold text-slate-800">{val}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Summary footer ──────────────────────────────────────────────── */}
      <div className="border-t border-slate-200 bg-slate-50/40 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Grand totals */}
          <div className="flex items-baseline gap-2">
            <TrendingUp className="h-4 w-4 text-slate-400 shrink-0" />
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide mr-2">
                Grand Total
              </span>
              <span className="text-xl font-black text-slate-900">
                {student.obtainedMarks}
              </span>
              <span className="text-slate-400 font-normal text-sm">
                {' '}/ {student.totalMarks}
              </span>
            </div>
          </div>

          {/* Overall percentage */}
          <div className={`text-2xl font-black ${pctColor(pct)}`}>
            {pct.toFixed(2)}%
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 w-full bg-slate-200/60 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${batchConf.bar}`}
            style={{ width: `${progressWidth}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 font-medium mt-1">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* ── Teacher Remarks ──────────────────────────────────────────────── */}
      {student.remarks && (
        <div className="border-t border-slate-100 px-5 py-4 bg-white">
          <div className="flex items-start gap-3 bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3">
            <MessageSquare className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500 mb-1">
                Instructor Remarks
              </p>
              <p className="text-sm text-slate-700 leading-relaxed">{student.remarks}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
