'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import {
  ClipboardList, Plus, Save, ChevronLeft, ChevronRight,
  Users, Edit3, Trash2, MoreVertical, Pencil, Calendar,
  Sparkles, CheckCircle2, AlertCircle, Award, BookOpen, Filter, Search,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession } from 'next-auth/react'
import { formatClassWithShift, type SessionShift } from '@/lib/validation/shift'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectRecord {
  id: string
  name: string
  code: string
  classId?: string
}

interface ClassRecord {
  id: string
  name: string
  section: string
  classSectionId?: string | null
  legacyClassId?: string | null
  shift?: SessionShift
  campus?: { name: string; code?: string; city?: string }
  batch?: { name: string; code?: string; academicLevel?: string }
  subjects?: SubjectRecord[]
}

interface TeacherSectionRecord {
  id: string
  className: string
  sectionName: string
  shift?: { code?: string | null; name?: string | null } | null
}

interface SectionOfferingRecord {
  subject?: SubjectRecord | null
}

interface Task {
  id: string
  title: string
  description: string | null
  type: string
  dueDate: string | null
  maxMarks: number
  class: { name: string; section: string }
  subject: { name: string; code: string }
  createdAt: string
}

interface ApiError {
  message?: string
}

interface TaskResultRow {
  studentId: string
  student: {
    id: string
    firstName: string
    lastName: string
    registrationNumber: string
    rollNumber: string | null
  }
  obtainedMarks: number
  remarks: string | null
}

async function fetchCanonicalTeacherClasses(): Promise<ClassRecord[]> {
  const sections = await fetchApi<TeacherSectionRecord[]>('/api/teacher-portal/sections')

  return Promise.all(sections.map(async (section) => {
    // The section endpoint is the source of truth for assignment scope. The
    // offering endpoint is section-authorized and supplies the subjects used
    // by task creation; keep the class visible if one offering lookup fails.
    const offerings = await fetchApi<SectionOfferingRecord[]>(
      `/api/teacher-portal/sections/${encodeURIComponent(section.id)}/offerings`
    ).catch(() => [])
    const subjects = offerings
      .map((offering) => offering.subject)
      .filter((subject): subject is SubjectRecord => Boolean(subject))
      .filter((subject, index, all) => all.findIndex((item) => item.id === subject.id) === index)

    return {
      id: section.id,
      name: section.className,
      section: section.sectionName,
      classSectionId: section.id,
      legacyClassId: null,
      shift: (section.shift?.code ?? section.shift?.name ?? 'MORNING') as SessionShift,
      subjects,
    }
  }))
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TASK_TYPE_LABELS: Record<string, string> = {
  ASSIGNMENT: 'Assignment',
  QUIZ:       'Quiz',
  CP:         'Class Performance',
  MID_TERM:   'Mid-Term',
  FINAL_TERM: 'Final Term',
  OTHER:      'Other',
}

const TASK_TYPE_COLORS: Record<string, string> = {
  ASSIGNMENT: 'bg-blue-100 text-blue-800 border-blue-200',
  QUIZ:       'bg-violet-100 text-violet-800 border-violet-200',
  CP:         'bg-amber-100 text-amber-800 border-amber-200',
  MID_TERM:   'bg-red-100 text-red-800 border-red-200',
  FINAL_TERM: 'bg-rose-100 text-rose-800 border-rose-200',
  OTHER:      'bg-slate-100 text-slate-700 border-slate-200',
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j} className="py-4"><Skeleton className="h-5 w-full max-w-[140px] rounded-lg" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ─── Create Task Dialog ────────────────────────────────────────────────────────

function CreateTaskDialog({
  open, onClose, classes,
}: { open: boolean; onClose: () => void; classes: ClassRecord[] }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    classId:     '',
    subjectId:   '',
    title:       '',
    description: '',
    type:        'ASSIGNMENT',
    dueDate:     '',
    maxMarks:    '100',
  })

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === form.classId) ?? null,
    [classes, form.classId]
  )
  const subjects = selectedClass?.subjects ?? []

  const mutation = useMutation({
    mutationFn: () => {
      return fetchApi('/api/teacher-portal/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          classId: selectedClass?.legacyClassId ?? selectedClass?.classSectionId ?? form.classId,
          classSectionId: selectedClass?.classSectionId ?? null,
          legacyClassId: selectedClass?.legacyClassId ?? null,
          maxMarks: parseInt(form.maxMarks, 10),
          dueDate: form.dueDate || null,
        }),
      })
    },
    onSuccess: () => {
      notify.success('Task created successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-tasks'] })
      onClose()
      setForm({ classId: '', subjectId: '', title: '', description: '', type: 'ASSIGNMENT', dueDate: '', maxMarks: '100' })
    },
    onError: (err: ApiError) => notify.error(err.message || 'Failed to create task'),
  })

  const closeDialog = () => {
    if (!mutation.isPending) onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mutation.isPending) return
    if (!selectedClass) { notify.error('Select a class'); return }
    if (!form.subjectId || !subjects.some((subject) => subject.id === form.subjectId)) {
      notify.error('Select a subject assigned to you for this class')
      return
    }
    if (!form.title.trim()) { notify.error('Enter a task title'); return }
    const maxMarks = Number.parseInt(form.maxMarks, 10)
    if (!Number.isFinite(maxMarks) || maxMarks < 1) { notify.error('Max marks must be at least 1'); return }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
      <DialogContent
        className="max-w-2xl sm:max-w-3xl w-[95vw] rounded-2xl p-4 sm:p-6 max-h-[90vh] overflow-y-auto"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="pb-3 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-2.5 text-lg sm:text-xl font-bold text-slate-900">
            <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Create New Task
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-slate-500 mt-1">
            Create an assignment, quiz, or class performance task for your assigned students.
          </DialogDescription>
        </DialogHeader>

        {classes.length === 0 ? (
          <div className="py-10 text-center text-slate-500 space-y-3">
            <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
            <p className="text-sm font-medium">No active classes assigned to you.<br />Please contact your campus administrator.</p>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Target Class *</Label>
                <Select
                  value={form.classId}
                  onValueChange={(v) => setForm(p => ({ ...p, classId: v, subjectId: '' }))}
                  disabled={classes.length === 0}
                >
                  <SelectTrigger className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent className="max-w-[90vw]">
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id} className="text-xs sm:text-sm py-2">
                        {formatClassWithShift(c.name, c.shift)} ({c.section || 'N/A'}) — {c.campus?.name || 'No Campus'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Subject *</Label>
                <Select
                  value={form.subjectId}
                  onValueChange={(v) => setForm(p => ({ ...p, subjectId: v }))}
                  disabled={!form.classId || subjects.length === 0}
                >
                  <SelectTrigger className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl">
                    <SelectValue
                      placeholder={
                        !form.classId
                          ? 'Select class first'
                          : subjects.length === 0
                            ? 'No assigned subjects'
                            : 'Select subject'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {subjects.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">No subjects assigned for this class.</div>
                    ) : subjects.map(s => (
                      <SelectItem key={s.id} value={s.id} className="text-xs sm:text-sm py-2">
                        {s.name} ({s.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.classId && subjects.length === 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>No subject offering assignment found for this class. Request admin to assign subjects.</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Task Title *</Label>
              <Input
                required
                placeholder="e.g. Chapter 3 Quiz, Lab Report, or Mid-Term Assignment"
                value={form.title}
                onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
                className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Task Category</Label>
                <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TASK_TYPE_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val} className="text-xs sm:text-sm">{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Maximum Marks *</Label>
                <Input
                  type="number"
                  min="1"
                  max="1000"
                  value={form.maxMarks}
                  onChange={(e) => setForm(p => ({ ...p, maxMarks: e.target.value }))}
                  className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl font-semibold"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Due Date (Optional)</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm(p => ({ ...p, dueDate: e.target.value }))}
                  className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Instructions / Description (Optional)</Label>
              <Textarea
                rows={3}
                placeholder="Enter guidelines, google classroom links, or submission details for students…"
                value={form.description}
                onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
                className="resize-none text-xs sm:text-sm border-slate-200 rounded-xl p-3"
              />
            </div>

            <DialogFooter className="pt-4 border-t border-slate-100 flex-col-reverse sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={closeDialog} disabled={mutation.isPending} className="h-10 text-xs sm:text-sm rounded-xl">
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending || !form.classId || !form.subjectId || subjects.length === 0} className="h-10 text-xs sm:text-sm gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
                <Plus className="w-4 h-4" />
                {mutation.isPending ? 'Creating Task…' : 'Publish Task'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Mark Entry Dialog ─────────────────────────────────────────────────────────

function MarkEntryDialog({
  task, open, onClose,
}: { task: Task | null; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [draftMarks, setDraftMarks] = useState<Record<string, { obtainedMarks: string; remarks: string }>>({})
  const [isDirty, setIsDirty] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const { data: resultsRaw, isLoading } = useQuery({
    queryKey: ['task-results', task?.id],
    queryFn:  () => fetchApi<TaskResultRow[]>(`/api/teacher-portal/tasks/${task!.id}/marks`),
    enabled:  !!task?.id,
  })

  const results = useMemo<TaskResultRow[]>(() => Array.isArray(resultsRaw) ? resultsRaw : [], [resultsRaw])

  const marks = useMemo<Record<string, { obtainedMarks: string; remarks: string }>>(() => {
    if (Object.keys(draftMarks).length > 0) return draftMarks

    return results.reduce((acc, r) => {
      acc[r.studentId] = {
        obtainedMarks: String(r.obtainedMarks ?? 0),
        remarks: r.remarks ?? '',
      }
      return acc
    }, {} as Record<string, { obtainedMarks: string; remarks: string }>)
  }, [draftMarks, results])

  // Filtered roster by search query
  const filteredResults = useMemo(() => {
    if (!searchQuery.trim()) return results
    const q = searchQuery.toLowerCase()
    return results.filter(r => 
      `${r.student.firstName} ${r.student.lastName}`.toLowerCase().includes(q) ||
      r.student.registrationNumber.toLowerCase().includes(q) ||
      (r.student.rollNumber && r.student.rollNumber.toLowerCase().includes(q))
    )
  }, [results, searchQuery])

  // Statistics calculation
  const stats = useMemo(() => {
    if (results.length === 0 || !task) return { avgPct: 0, highest: 0, gradedCount: 0 }
    let totalMarks = 0
    let highest = 0
    let gradedCount = 0

    results.forEach(r => {
      const current = marks[r.studentId]
      const val = parseFloat(current?.obtainedMarks ?? String(r.obtainedMarks)) || 0
      totalMarks += val
      if (val > highest) highest = val
      if (val > 0) gradedCount++
    })

    const avgPct = task.maxMarks > 0 ? Math.round((totalMarks / (results.length * task.maxMarks)) * 100) : 0
    return { avgPct, highest, gradedCount }
  }, [results, marks, task])

  const saveMutation = useMutation({
    mutationFn: () => fetchApi(`/api/teacher-portal/tasks/${task!.id}/marks`, {
      method: 'POST',
      body: JSON.stringify({
        records: Object.entries(marks).map(([studentId, v]) => ({
          studentId,
          obtainedMarks: parseFloat(v.obtainedMarks) || 0,
          remarks: v.remarks || undefined,
        })),
      }),
    }),
    onSuccess: () => {
      notify.success('Marks saved successfully')
      queryClient.invalidateQueries({ queryKey: ['task-results', task?.id] })
      setIsDirty(false)
    },
    onError: (err: ApiError) => notify.error(err.message || 'Failed to save marks'),
  })

  const updateMark = (studentId: string, field: 'obtainedMarks' | 'remarks', value: string) => {
    setDraftMarks(prev => ({ ...prev, [studentId]: { ...(prev[studentId] ?? { obtainedMarks: '0', remarks: '' }), [field]: value } }))
    setIsDirty(true)
  }

  const markAll = (val: string) => {
    setDraftMarks(prev => {
      const updated = { ...prev }
      results.forEach(r => {
        updated[r.studentId] = { ...(updated[r.studentId] ?? { remarks: '' }), obtainedMarks: val }
      })
      return updated
    })
    setIsDirty(true)
  }

  if (!task) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl sm:max-w-5xl lg:max-w-6xl w-[96vw] max-h-[92vh] flex flex-col rounded-2xl p-4 sm:p-6 overflow-hidden">
        <DialogHeader className="flex-shrink-0 pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold text-slate-900">
                <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                Enter Marks: <span className="text-indigo-600">{task.title}</span>
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2.5 flex-wrap mt-1 text-xs sm:text-sm text-slate-500">
                <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-semibold border ${TASK_TYPE_COLORS[task.type]}`}>
                  {TASK_TYPE_LABELS[task.type]}
                </span>
                <span>•</span>
                <span className="font-medium text-slate-700">{task.subject.name} ({task.subject.code})</span>
                <span>•</span>
                <span className="font-medium text-slate-700">{task.class.name} ({task.class.section})</span>
              </DialogDescription>
            </div>

            {/* Quick Metrics Bar */}
            <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 shrink-0">
              <div className="text-center px-2">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Students</span>
                <span className="text-xs sm:text-sm font-bold text-slate-800">{results.length}</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div className="text-center px-2">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Class Avg</span>
                <span className="text-xs sm:text-sm font-bold text-indigo-600">{stats.avgPct}%</span>
              </div>
              <div className="h-6 w-px bg-slate-200" />
              <div className="text-center px-2">
                <span className="text-[10px] text-slate-400 font-semibold block uppercase">Max Score</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-600">{task.maxMarks}</span>
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Toolbar: Search + Quick Fill Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 py-3 border-b border-slate-100 bg-slate-50/50 -mx-4 sm:-mx-6 px-4 sm:px-6 shrink-0">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search student by name, roll, reg #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs sm:text-sm border-slate-200 bg-white rounded-xl"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-indigo-500" /> Quick fill all:
            </span>
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium bg-white hover:bg-indigo-50 hover:text-indigo-600 border-slate-200 rounded-lg" onClick={() => markAll(String(task.maxMarks))}>
              Full Marks ({task.maxMarks})
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium bg-white hover:bg-indigo-50 hover:text-indigo-600 border-slate-200 rounded-lg" onClick={() => markAll(String(Math.round(task.maxMarks * 0.8)))}>
              80%
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium bg-white hover:bg-indigo-50 hover:text-indigo-600 border-slate-200 rounded-lg" onClick={() => markAll(String(Math.round(task.maxMarks * 0.6)))}>
              60%
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs font-medium bg-white hover:bg-red-50 hover:text-red-600 border-slate-200 rounded-lg" onClick={() => markAll('0')}>
              Zero
            </Button>
          </div>
        </div>

        {/* Roster Area: Mobile Cards & Desktop Table */}
        <div className="overflow-y-auto flex-1 my-2 rounded-xl border border-slate-200/80 bg-white">
          {isLoading ? (
            <div className="p-12 text-center text-slate-500 space-y-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : filteredResults.length === 0 ? (
            <div className="p-12 text-center text-slate-400 space-y-2">
              <Users className="w-10 h-10 mx-auto text-slate-300" />
              <p className="text-sm font-medium text-slate-600">No students match your query</p>
              <p className="text-xs text-slate-400">Try adjusting your search terms.</p>
            </div>
          ) : (
            <>
              {/* Mobile View Roster (< sm) */}
              <div className="block sm:hidden divide-y divide-slate-100">
                {filteredResults.map((row, idx) => {
                  const current = marks[row.studentId]
                  const obtainedNum = parseFloat(current?.obtainedMarks ?? String(row.obtainedMarks)) || 0
                  const pct = task.maxMarks > 0 ? Math.round((obtainedNum / task.maxMarks) * 100) : 0
                  const isInvalid = obtainedNum > task.maxMarks

                  return (
                    <div key={row.studentId} className={`p-3.5 space-y-3 ${isInvalid ? 'bg-red-50/60' : ''}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {row.student.firstName[0]}{row.student.lastName[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-xs text-slate-900 truncate">
                              #{idx + 1}. {row.student.firstName} {row.student.lastName}
                            </p>
                            <p className="text-[11px] text-slate-500 font-mono">Reg: {row.student.registrationNumber}</p>
                          </div>
                        </div>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          pct >= 80 ? 'bg-emerald-100 text-emerald-700' :
                          pct >= 60 ? 'bg-blue-100 text-blue-700' :
                          pct >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {pct}%
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-slate-500 font-semibold block uppercase mb-1">Marks / {task.maxMarks}</Label>
                          <Input
                            type="number"
                            min="0"
                            max={task.maxMarks}
                            step="0.5"
                            className={`h-9 text-xs font-semibold ${isInvalid ? 'border-red-400 focus-visible:ring-red-400' : 'border-slate-200'}`}
                            value={current?.obtainedMarks ?? String(row.obtainedMarks)}
                            onChange={(e) => updateMark(row.studentId, 'obtainedMarks', e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] text-slate-500 font-semibold block uppercase mb-1">Remarks</Label>
                          <Input
                            className="h-9 text-xs border-slate-200"
                            placeholder="Optional remark..."
                            value={current?.remarks ?? (row.remarks ?? '')}
                            onChange={(e) => updateMark(row.studentId, 'remarks', e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop View Roster (>= sm) */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader className="bg-slate-50 sticky top-0 z-10">
                    <TableRow className="border-b border-slate-200">
                      <TableHead className="w-12 text-center text-xs font-bold text-slate-600">#</TableHead>
                      <TableHead className="text-xs font-bold text-slate-600">Student Name</TableHead>
                      <TableHead className="text-xs font-bold text-slate-600">Reg / Roll Number</TableHead>
                      <TableHead className="w-44 text-xs font-bold text-slate-600">
                        Obtained Marks <span className="text-slate-400 font-normal">/ {task.maxMarks}</span>
                      </TableHead>
                      <TableHead className="text-xs font-bold text-slate-600">Teacher Remarks</TableHead>
                      <TableHead className="w-20 text-center text-xs font-bold text-slate-600">Grade %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredResults.map((row, idx) => {
                      const current = marks[row.studentId]
                      const obtainedNum = parseFloat(current?.obtainedMarks ?? String(row.obtainedMarks)) || 0
                      const pct = task.maxMarks > 0 ? Math.round((obtainedNum / task.maxMarks) * 100) : 0
                      const isInvalid = obtainedNum > task.maxMarks

                      return (
                        <TableRow key={row.studentId} className={`hover:bg-slate-50/80 transition-colors ${isInvalid ? 'bg-red-50/50' : ''}`}>
                          <TableCell className="text-center font-semibold text-xs text-slate-400">{idx + 1}</TableCell>
                          <TableCell className="py-3">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                                {row.student.firstName[0]}{row.student.lastName[0]}
                              </div>
                              <div>
                                <p className="font-semibold text-xs sm:text-sm text-slate-900">
                                  {row.student.firstName} {row.student.lastName}
                                </p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="py-3">
                            <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {row.student.registrationNumber}
                            </span>
                            {row.student.rollNumber && (
                              <span className="ml-2 text-xs text-slate-400 font-medium">
                                (Roll #{row.student.rollNumber})
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <Input
                              type="number"
                              min="0"
                              max={task.maxMarks}
                              step="0.5"
                              className={`h-9 text-xs sm:text-sm font-semibold border-slate-200 rounded-lg ${isInvalid ? 'border-red-400 focus-visible:ring-red-400 bg-red-50' : 'bg-white'}`}
                              value={current?.obtainedMarks ?? String(row.obtainedMarks)}
                              onChange={(e) => updateMark(row.studentId, 'obtainedMarks', e.target.value)}
                            />
                            {isInvalid && (
                              <p className="text-[10px] text-red-500 font-semibold mt-0.5">Exceeds max ({task.maxMarks})</p>
                            )}
                          </TableCell>
                          <TableCell className="py-3">
                            <Input
                              className="h-9 text-xs border-slate-200 rounded-lg bg-white min-w-[200px]"
                              placeholder="Add feedback or remark..."
                              value={current?.remarks ?? (row.remarks ?? '')}
                              onChange={(e) => updateMark(row.studentId, 'remarks', e.target.value)}
                            />
                          </TableCell>
                          <TableCell className="text-center py-3">
                            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                              pct >= 80 ? 'bg-emerald-100 text-emerald-800' :
                              pct >= 60 ? 'bg-blue-100 text-blue-800' :
                              pct >= 40 ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {pct}%
                            </span>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        {/* Footer with Unsaved Changes indicator */}
        <DialogFooter className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 flex items-center gap-2">
            {isDirty ? (
              <span className="flex items-center gap-1.5 font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
                <AlertCircle className="w-3.5 h-3.5" /> Unsaved changes in roster
              </span>
            ) : (
              <span className="flex items-center gap-1.5 font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5" /> All marks synchronized
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 sm:flex-initial h-10 text-xs sm:text-sm rounded-xl">
              Close
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !isDirty}
              className="flex-1 sm:flex-initial h-10 text-xs sm:text-sm gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Saving Marks…' : isDirty ? 'Save All Marks' : 'Saved'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Task Dialog ──────────────────────────────────────────────────────────

function EditTaskDialog({
  task, open, onClose, onSave, isPending,
}: {
  task: Task
  open: boolean
  onClose: () => void
  onSave: (data: Record<string, unknown>) => void
  isPending: boolean
}) {
  const [form, setForm] = useState({
    title:       task.title,
    description: task.description ?? '',
    type:        task.type,
    dueDate:     task.dueDate ? new Date(task.dueDate).toISOString().split('T')[0] : '',
    maxMarks:    String(task.maxMarks),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSave({
      title:       form.title,
      description: form.description || null,
      type:        form.type,
      dueDate:     form.dueDate || null,
      maxMarks:    parseInt(form.maxMarks, 10),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-3xl w-[95vw] rounded-2xl p-4 sm:p-6">
        <DialogHeader className="pb-3 border-b border-slate-100">
          <DialogTitle className="flex items-center gap-2.5 text-lg sm:text-xl font-bold text-slate-900">
            <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
              <Pencil className="w-5 h-5" />
            </div>
            Edit Task Details
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm text-slate-500 mt-1">
            Update task parameters. Class and subject offerings are locked.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3.5 text-xs sm:text-sm text-slate-600 flex items-center justify-between flex-wrap gap-2">
            <div>
              <span className="font-bold text-slate-900 block">{task.class.name} ({task.class.section})</span>
              <span className="text-slate-500 text-xs">{task.subject.name} · {task.subject.code}</span>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${TASK_TYPE_COLORS[task.type]}`}>
              {TASK_TYPE_LABELS[task.type]}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Task Title *</Label>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Task Category</Label>
              <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val} className="text-xs sm:text-sm">{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Maximum Marks</Label>
              <Input
                type="number" min="1" max="1000"
                value={form.maxMarks}
                onChange={(e) => setForm(p => ({ ...p, maxMarks: e.target.value }))}
                className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl font-semibold"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Due Date (Optional)</Label>
              <Input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm(p => ({ ...p, dueDate: e.target.value }))}
                className="h-10 text-xs sm:text-sm border-slate-200 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-700">Description (Optional)</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              className="resize-none text-xs sm:text-sm border-slate-200 rounded-xl p-3"
            />
          </div>

          <DialogFooter className="pt-4 border-t border-slate-100 flex-col-reverse sm:flex-row gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="h-10 text-xs sm:text-sm rounded-xl">Cancel</Button>
            <Button type="submit" disabled={isPending} className="h-10 text-xs sm:text-sm gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold">
              <Save className="w-4 h-4" />
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeacherTasksPage() {
  const { data: session } = useSession()
  const isTeacher = session?.user?.role === 'TEACHER'
  const queryClient = useQueryClient()

  const [page, setPage]         = useState(1)
  const [classFilter, setClass] = useState('')
  const [createOpen, setCreate] = useState(false)
  const [markTask, setMarkTask]  = useState<Task | null>(null)
  const [editTask, setEditTask]  = useState<Task | null>(null)
  const [deleteTask, setDeleteTask] = useState<Task | null>(null)
  const limit = 20

  // Fetch classes for the create dialog filter
  const { data: classesRaw } = useQuery<ClassRecord[]>({
    queryKey: ['teacher-task-sections'],
    queryFn:  fetchCanonicalTeacherClasses,
    enabled:  isTeacher,
    staleTime: 5 * 60 * 1000,
  })
  const classes = classesRaw ?? []

  // Fetch tasks
  const params = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (classFilter) params.set('classId', classFilter)

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-tasks', page, classFilter],
    queryFn:  () => fetchPaginatedApi<Task>(`/api/teacher-portal/tasks?${params.toString()}`),
    enabled:  isTeacher,
    staleTime: 30_000,
  })

  const tasks      = data?.data ?? []
  const pagination = data?.pagination

  // ── Delete mutation ──────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/teacher-portal/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Task deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-tasks'] })
      setDeleteTask(null)
    },
    onError: (err: ApiError) => notify.error(err.message || 'Failed to delete task'),
  })

  // ── Edit mutation ────────────────────────────────────────────────────────
  const editMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      fetchApi(`/api/teacher-portal/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      notify.success('Task updated successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-tasks'] })
      setEditTask(null)
    },
    onError: (err: ApiError) => notify.error(err.message || 'Failed to update task'),
  })

  if (!isTeacher) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-slate-400">
        <p className="text-sm font-medium">Access Restricted to Teacher Account</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl mx-auto p-3.5 sm:p-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 sm:p-6 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600 shrink-0">
              <ClipboardList className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Tasks & Student Marks
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium sm:ml-11">
            Create quizzes, assignments, and performance tasks, then input student scores.
          </p>
        </div>
        <Button onClick={() => setCreate(true)} className="gap-2 h-10 px-5 text-xs sm:text-sm rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold w-full sm:w-auto shadow-md">
          <Plus className="w-4 h-4" /> Create Task
        </Button>
      </div>

      {/* Filter and Content Card */}
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-soft-md overflow-hidden flex flex-col">
        <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row justify-between gap-3 items-start sm:items-center">
          <div className="flex items-center gap-3 flex-wrap w-full sm:w-auto">
            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" /> Filter class:
            </span>
            <Select
              value={classFilter || '_all'}
              onValueChange={(v) => { setClass(v === '_all' ? '' : v); setPage(1) }}
            >
              <SelectTrigger className="w-full sm:w-64 h-9 text-xs sm:text-sm border-slate-200 rounded-xl bg-white">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all" className="text-xs sm:text-sm py-2">All Classes</SelectItem>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id} className="text-xs sm:text-sm py-2">
                    {formatClassWithShift(c.name, c.shift)} ({c.section || 'N/A'}) — {c.campus?.name || 'No Campus'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-xs text-slate-400 font-medium self-end sm:self-auto">
            {pagination ? `${pagination.total} tasks listed` : ''}
          </div>
        </div>

        {/* Mobile View (< sm): Cards Stack */}
        <div className="block sm:hidden divide-y divide-slate-100">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-20 w-full rounded-xl" />
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-slate-400 space-y-2">
              <ClipboardList className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-medium">No tasks found</p>
              <p className="text-xs text-slate-400">Click &quot;Create Task&quot; to publish your first assignment or quiz.</p>
            </div>
          ) : (
            tasks.map((task) => (
              <div key={task.id} className="p-3.5 space-y-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold text-sm text-slate-900">{task.title}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{task.class.name} ({task.class.section}) • {task.subject.name}</p>
                  </div>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold border shrink-0 ${TASK_TYPE_COLORS[task.type]}`}>
                    {TASK_TYPE_LABELS[task.type]}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Max Score</span>
                    <span className="font-bold text-slate-800">{task.maxMarks} Marks</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold block uppercase">Due Date</span>
                    <span className="font-medium text-slate-700">
                      {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' }) : 'No due date'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                    onClick={() => setMarkTask(task)}
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Marks Entry
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg">
                        <MoreVertical className="w-4 h-4 text-slate-600" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40 rounded-xl p-1.5 shadow-xl">
                      <DropdownMenuItem onClick={() => setEditTask(task)} className="text-xs font-medium py-2">
                        <Pencil className="w-3.5 h-3.5 mr-2 text-slate-500" /> Edit Task
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-xs font-medium text-red-600 focus:text-red-600 py-2"
                        onClick={() => setDeleteTask(task)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Task
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View (>= sm): Table */}
        <div className="hidden sm:block overflow-x-auto min-h-[350px]">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow className="border-b border-slate-200">
                <TableHead className="text-xs font-bold text-slate-700">Task Title</TableHead>
                <TableHead className="text-xs font-bold text-slate-700">Category</TableHead>
                <TableHead className="text-xs font-bold text-slate-700">Class & Subject</TableHead>
                <TableHead className="text-xs font-bold text-slate-700">Max Marks</TableHead>
                <TableHead className="text-xs font-bold text-slate-700">Due Date</TableHead>
                <TableHead className="text-right text-xs font-bold text-slate-700 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton cols={6} />
              ) : tasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-48 text-center">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <ClipboardList className="w-10 h-10 text-slate-300" />
                      <span className="text-sm font-medium text-slate-600">No tasks created yet for this selection.</span>
                      <span className="text-xs text-slate-400">Click &quot;Create Task&quot; above to publish your first task.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((task) => (
                  <TableRow key={task.id} className="hover:bg-slate-50/80 transition-colors">
                    <TableCell className="py-4">
                      <p className="font-semibold text-slate-900 text-sm">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-slate-500 truncate max-w-[260px] mt-0.5">{task.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="py-4">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${TASK_TYPE_COLORS[task.type]}`}>
                        {TASK_TYPE_LABELS[task.type]}
                      </span>
                    </TableCell>
                    <TableCell className="py-4">
                      <p className="text-xs sm:text-sm font-semibold text-slate-800">{task.class.name} ({task.class.section})</p>
                      <p className="text-xs text-slate-500 font-medium">{task.subject.name} · {task.subject.code}</p>
                    </TableCell>
                    <TableCell className="py-4">
                      <span className="text-sm font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/80">
                        {task.maxMarks}
                      </span>
                    </TableCell>
                    <TableCell className="py-4">
                      {task.dueDate ? (
                        <span className="text-xs font-medium text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                          {new Date(task.dueDate).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right py-4 pr-6">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          size="sm"
                          className="gap-1.5 h-8 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                          onClick={() => setMarkTask(task)}
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Enter Marks
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 rounded-lg hover:bg-slate-100">
                              <MoreVertical className="w-4 h-4 text-slate-600" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 rounded-xl p-1.5 shadow-xl border-slate-200">
                            <DropdownMenuItem onClick={() => setEditTask(task)} className="text-xs font-medium py-2">
                              <Pencil className="w-3.5 h-3.5 mr-2 text-slate-500" /> Edit Details
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-xs font-medium text-red-600 focus:text-red-600 py-2"
                              onClick={() => setDeleteTask(task)}
                            >
                              <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete Task
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50/50 gap-2.5">
            <p className="text-xs sm:text-sm text-slate-500 font-medium">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total} tasks
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs sm:text-sm font-semibold text-slate-700 px-2">{page} / {pagination.totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0 rounded-lg"
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateTaskDialog open={createOpen} onClose={() => setCreate(false)} classes={classes} />
      <MarkEntryDialog key={markTask?.id ?? 'new-task'} task={markTask} open={!!markTask} onClose={() => setMarkTask(null)} />

      {/* Edit Task Dialog */}
      {editTask && (
        <EditTaskDialog
          task={editTask}
          open={!!editTask}
          onClose={() => setEditTask(null)}
          onSave={(data) => editMutation.mutate({ id: editTask.id, data })}
          isPending={editMutation.isPending}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTask} onOpenChange={(o) => !o && setDeleteTask(null)}>
        <AlertDialogContent className="rounded-2xl max-w-md p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-bold text-slate-900">Delete Task & Associated Marks</AlertDialogTitle>
            <AlertDialogDescription className="text-xs sm:text-sm text-slate-500 mt-2 leading-relaxed">
              Are you sure you want to delete &quot;<span className="font-semibold text-slate-800">{deleteTask?.title}</span>&quot;? This will permanently delete all student marks recorded for this task. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-4 gap-2 flex-col-reverse sm:flex-row">
            <AlertDialogCancel className="h-10 text-xs sm:text-sm rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant="destructive"
                onClick={() => deleteTask && deleteMutation.mutate(deleteTask.id)}
                disabled={deleteMutation.isPending}
                className="h-10 text-xs sm:text-sm rounded-xl font-semibold bg-red-600 hover:bg-red-700"
              >
                {deleteMutation.isPending ? 'Deleting…' : 'Delete Task'}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
