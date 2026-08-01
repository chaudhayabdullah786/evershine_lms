'use client'

/**
 * TaskMarksPanel
 *
 * WHY: Teachers create tasks and assign marks per student. This component
 * aggregates those results subject-wise and renders them as interactive,
 * collapsible cards — scalable as the teacher adds more tasks over the year.
 *
 * TRADEOFF: Grouping is done client-side from an already-fetched array,
 * avoiding an additional API call. At ≤100 task results per student/year
 * this is negligible. If we ever paginate tasks the grouping logic must move
 * server-side.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  ChevronDown,
  ChevronUp,
  BookOpen,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Clock,
  FileText,
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskResultItem = {
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
  classLabel?: string | null
  shiftName?: string | null
  updatedAt: string
}

type SubjectGroup = {
  subjectName: string
  subjectCode: string | null
  totalMax: number
  totalObtained: number
  overallPct: number
  tasks: TaskResultItem[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  ASSIGNMENT:  { label: 'Assignment',  color: 'bg-blue-100 text-blue-800 border-blue-200'     },
  QUIZ:        { label: 'Quiz',        color: 'bg-purple-100 text-purple-800 border-purple-200' },
  CP:          { label: 'Class Participation', color: 'bg-teal-100 text-teal-800 border-teal-200' },
  MID_TERM:    { label: 'Mid Term',    color: 'bg-amber-100 text-amber-800 border-amber-200'   },
  FINAL_TERM:  { label: 'Final Term',  color: 'bg-rose-100 text-rose-800 border-rose-200'      },
  LAB:         { label: 'Lab Work',    color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  PROJECT:     { label: 'Project',     color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  TEST:        { label: 'Test',        color: 'bg-orange-100 text-orange-800 border-orange-200' },
}

function getTypeConfig(type: string) {
  return TASK_TYPE_LABELS[type] ?? { label: type, color: 'bg-slate-100 text-slate-700 border-slate-200' }
}

/**
 * Determines the percentage pill color band.
 * WHY defined thresholds: aligned with the academy's existing grade bands
 * (Pass threshold 33%, Good 60%, Excellent 80%).
 */
function pctColorClass(pct: number): string {
  if (pct >= 80) return 'bg-emerald-100 text-emerald-800'
  if (pct >= 60) return 'bg-blue-100 text-blue-800'
  if (pct >= 33) return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-800'
}

function groupBySubject(tasks: TaskResultItem[]): SubjectGroup[] {
  const map = new Map<string, SubjectGroup>()

  for (const task of tasks) {
    const key = task.subjectName
    if (!map.has(key)) {
      map.set(key, {
        subjectName: task.subjectName,
        subjectCode: task.subjectCode,
        totalMax: 0,
        totalObtained: 0,
        overallPct: 0,
        tasks: [],
      })
    }
    const group = map.get(key)!
    group.tasks.push(task)
    group.totalMax += task.maxMarks
    group.totalObtained += task.obtainedMarks
  }

  // Compute overall percentage per subject after all tasks are accumulated
  for (const group of map.values()) {
    group.overallPct =
      group.totalMax > 0
        ? Math.round((group.totalObtained / group.totalMax) * 10000) / 100
        : 0
  }

  // Sort subjects alphabetically for deterministic render
  return [...map.values()].sort((a, b) => a.subjectName.localeCompare(b.subjectName))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SubjectCard({ group }: { group: SubjectGroup }) {
  const [open, setOpen] = useState(true)
  const pct = group.overallPct
  const pillClass = pctColorClass(pct)

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-shadow hover:shadow-md">
      {/* Subject header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="w-full text-left"
        aria-expanded={open}
      >
        <div className="flex flex-wrap items-center gap-3 px-5 py-4 bg-gradient-to-r from-indigo-50/60 to-white border-b border-slate-100 hover:from-indigo-50 transition-colors">
          {/* Subject icon */}
          <div className="h-9 w-9 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
            <BookOpen className="h-4.5 w-4.5 text-indigo-600" />
          </div>

          {/* Name + code */}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-900 truncate leading-tight">
              {group.subjectName}
            </p>
            {group.subjectCode && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-400 mt-0.5">
                {group.subjectCode}
              </p>
            )}
          </div>

          {/* Aggregate marks */}
          <div className="flex items-center gap-3 ml-auto shrink-0">
            <div className="text-right">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Total Marks</p>
              <p className="font-black text-slate-900 text-base leading-tight">
                {group.totalObtained}
                <span className="text-slate-400 font-normal text-sm"> / {group.totalMax}</span>
              </p>
            </div>
            <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-bold ${pillClass}`}>
              {pct.toFixed(1)}%
            </span>
            <span className="text-slate-400">
              {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </span>
          </div>
        </div>
      </button>

      {/* Task rows */}
      {open && (
        <div className="divide-y divide-slate-50">
          {group.tasks.map((task, idx) => {
            const typeConf = getTypeConfig(task.type)
            const taskPill = pctColorClass(task.percentage)
            const hasRemarks = !!task.remarks

            return (
              <div
                key={task.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50/60 ${
                  idx % 2 === 0 ? '' : 'bg-slate-50/30'
                }`}
              >
                {/* Task number dot */}
                <div className="shrink-0 hidden sm:flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-black text-slate-500">
                  {idx + 1}
                </div>

                {/* Task title */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900 text-sm truncate">{task.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Badge
                      className={`text-[10px] font-bold py-0 border ${typeConf.color}`}
                    >
                      {typeConf.label}
                    </Badge>
                    {task.dueDate && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400 font-medium">
                        <Clock className="h-2.5 w-2.5" />
                        {new Date(task.dueDate).toLocaleDateString('en-PK', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    )}
                  </div>
                  {hasRemarks && (
                    <p className="text-[11px] text-slate-500 italic mt-1 leading-snug">
                      <FileText className="inline h-3 w-3 mr-0.5 opacity-60" />
                      {task.remarks}
                    </p>
                  )}
                </div>

                {/* Marks */}
                <div className="flex items-center gap-3 shrink-0 sm:text-right">
                  <div>
                    <p className="text-[10px] uppercase font-semibold text-slate-400 tracking-wide">Marks</p>
                    <p className="font-bold text-slate-900 text-sm">
                      {task.obtainedMarks}
                      <span className="text-slate-400 font-normal"> / {task.maxMarks}</span>
                    </p>
                  </div>
                  <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold ${taskPill}`}>
                    {task.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export function TaskMarksPanel({ taskResults }: { taskResults: TaskResultItem[] }) {
  const groups = groupBySubject(taskResults)

  const grandMax = groups.reduce((s, g) => s + g.totalMax, 0)
  const grandObtained = groups.reduce((s, g) => s + g.totalObtained, 0)
  const grandPct = grandMax > 0 ? Math.round((grandObtained / grandMax) * 10000) / 100 : 0

  if (taskResults.length === 0) {
    return (
      <Card className="border border-dashed border-slate-200 bg-slate-50/40">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <div className="h-14 w-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <ClipboardList className="h-7 w-7 text-slate-400" />
          </div>
          <h4 className="font-bold text-slate-700 text-sm">No Task Marks Yet</h4>
          <p className="text-xs text-slate-400 mt-1.5 max-w-xs">
            Task marks will appear here as your teacher assigns and grades tasks throughout the session.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Summary stat bar ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-center">
          <p className="text-2xl font-black text-indigo-700">{groups.length}</p>
          <p className="text-xs font-semibold text-indigo-500 mt-0.5">Subjects</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
          <p className="text-2xl font-black text-slate-800">{taskResults.length}</p>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Tasks Graded</p>
        </div>
        <div className="rounded-xl border border-slate-100 bg-white p-4 text-center">
          <p className="text-2xl font-black text-slate-900">
            {grandObtained}
            <span className="text-base font-normal text-slate-400"> / {grandMax}</span>
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Total Marks</p>
        </div>
        <div
          className={`rounded-xl border p-4 text-center ${
            grandPct >= 80
              ? 'bg-emerald-50 border-emerald-100'
              : grandPct >= 60
              ? 'bg-blue-50 border-blue-100'
              : grandPct >= 33
              ? 'bg-amber-50 border-amber-100'
              : 'bg-rose-50 border-rose-100'
          }`}
        >
          <p
            className={`text-2xl font-black ${
              grandPct >= 80
                ? 'text-emerald-700'
                : grandPct >= 60
                ? 'text-blue-700'
                : grandPct >= 33
                ? 'text-amber-700'
                : 'text-rose-700'
            }`}
          >
            {grandPct.toFixed(1)}%
          </p>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">Overall</p>
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center text-[10px] font-semibold text-slate-500 px-1">
        <span className="uppercase tracking-wide">Performance:</span>
        <span className="inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" /> ≥80% Excellent
        </span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="h-3 w-3 text-blue-500" /> ≥60% Good
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3 text-amber-500" /> ≥33% Pass
        </span>
        <span className="inline-flex items-center gap-1">
          <AlertCircle className="h-3 w-3 text-rose-500" /> &lt;33% Below Pass
        </span>
      </div>

      {/* ── Subject groups ───────────────────────────────────────────── */}
      <div className="space-y-3">
        {groups.map((group) => (
          <SubjectCard key={group.subjectName} group={group} />
        ))}
      </div>
    </div>
  )
}
