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
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import {
  ClipboardList, Plus, Save, ChevronLeft, ChevronRight,
  Users, Edit3, Trash2, MoreHorizontal, Pencil,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSession } from 'next-auth/react'
import { formatClassWithShift, type SessionShift } from '@/lib/validation/shift'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClassRecord {
  id: string
  name: string
  section: string
  classSectionId?: string | null
  legacyClassId?: string | null
  shift?: SessionShift
  campus?: { name: string; code?: string; city?: string }
  batch?: { name: string; code?: string; academicLevel?: string }
}

interface SubjectRecord {
  id: string
  name: string
  code: string
  classId: string
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
  ASSIGNMENT: 'bg-blue-100 text-blue-700',
  QUIZ:       'bg-violet-100 text-violet-700',
  CP:         'bg-amber-100 text-amber-700',
  MID_TERM:   'bg-red-100 text-red-700',
  FINAL_TERM: 'bg-rose-100 text-rose-700',
  OTHER:      'bg-gray-100 text-gray-600',
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: cols }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full max-w-[120px]" /></TableCell>
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

  // Fetch subjects for selected class
  const { data: subjectsRaw } = useQuery({
    queryKey: ['subjects-for-class', form.classId],
    queryFn:  () => fetchApi<SubjectRecord[]>(`/api/classes/${form.classId}/subjects`),
    enabled:  !!form.classId,
  })
  const subjects = subjectsRaw ?? []

  const mutation = useMutation({
    mutationFn: () => {
      // WHY match by c.id: The Select value is c.id (set in the dropdown).
      // c.id may be a legacy Class ID or a ClassSection ID depending on assignment source.
      const selectedClass = classes.find((c) => c.id === form.classId)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.classId || !form.subjectId) { notify.error('Select a class and subject'); return }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" />
            Create New Task
          </DialogTitle>
          <DialogDescription>
            Create an assignment, quiz, or class performance task for students.
          </DialogDescription>
        </DialogHeader>

        {classes.length === 0 ? (
          <div className="py-8 text-center text-gray-500">
            <p className="mb-4">No classes assigned to you.<br />Please contact your administrator.</p>
            <Button variant="outline" onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Class *</Label>
                <Select
                  value={form.classId}
                  onValueChange={(v) => setForm(p => ({ ...p, classId: v, subjectId: '' }))}
                  disabled={classes.length === 0}
                >
                  <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
                  <SelectContent>
                    {classes.map(c => (
                      <SelectItem key={c.id} value={c.id}>
                        {formatClassWithShift(c.name, c.shift)} ({c.section || 'N/A'}) — {c.campus?.name || 'No Campus'} [{c.batch?.name || 'No Batch'}]
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Subject *</Label>
                <Select
                  value={form.subjectId}
                  onValueChange={(v) => setForm(p => ({ ...p, subjectId: v }))}
                  disabled={!form.classId}
                >
                  <SelectTrigger><SelectValue placeholder={form.classId ? 'Select subject' : '— pick class first —'} /></SelectTrigger>
                  <SelectContent>
                    {subjects.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.name} ({s.code})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Title *</Label>
              <Input
                required
                placeholder="e.g. Chapter 3 Quiz or Mid-Term Assignment"
                value={form.title}
                onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TASK_TYPE_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
              <Label>Max Marks</Label>
              <Input
                type="number"
                min="1"
                max="1000"
                value={form.maxMarks}
                onChange={(e) => setForm(p => ({ ...p, maxMarks: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Due Date (optional)</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm(p => ({ ...p, dueDate: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              rows={2}
              placeholder="Any additional instructions for students…"
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              className="resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <Plus className="w-4 h-4" />
              {mutation.isPending ? 'Creating…' : 'Create Task'}
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
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-indigo-600" />
            Enter Marks: {task.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-3 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TASK_TYPE_COLORS[task.type]}`}>
              {TASK_TYPE_LABELS[task.type]}
            </span>
            <span className="text-xs text-gray-500">
              {task.subject.name} · {task.class.name} ({task.class.section})
            </span>
            <span className="text-xs font-semibold text-gray-700">
              Max: {task.maxMarks} marks
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Quick-fill toolbar */}
        <div className="flex items-center gap-2 py-2 border-y flex-shrink-0 bg-gray-50 px-1">
          <span className="text-xs text-gray-500">Quick fill all:</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => markAll(String(task.maxMarks))}>
            Full marks
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => markAll('0')}>
            Zero
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => markAll(String(Math.round(task.maxMarks * 0.6)))}>
            60%
          </Button>
        </div>

        {/* Scrollable table */}
        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500 text-sm">Loading student roster…</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <Users className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No students found for this class.</p>
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-gray-50 z-10">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Reg / Roll</TableHead>
                  <TableHead className="w-36">
                    Marks <span className="text-gray-400 font-normal">/ {task.maxMarks}</span>
                  </TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead className="w-12 text-center">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row, idx) => {
                  const current = marks[row.studentId]
                  const obtainedNum = parseFloat(current?.obtainedMarks ?? String(row.obtainedMarks)) || 0
                  const pct = task.maxMarks > 0 ? Math.round((obtainedNum / task.maxMarks) * 100) : 0
                  const isInvalid = obtainedNum > task.maxMarks
                  return (
                    <TableRow key={row.studentId} className={isInvalid ? 'bg-red-50' : ''}>
                      <TableCell className="text-gray-400 text-sm">{idx + 1}</TableCell>
                      <TableCell>
                        <p className="font-medium text-sm text-gray-900">
                          {row.student.firstName} {row.student.lastName}
                        </p>
                      </TableCell>
                      <TableCell>
                        <p className="font-mono text-xs text-gray-600">{row.student.registrationNumber}</p>
                        {row.student.rollNumber && (
                          <p className="text-[10px] text-gray-400">Roll #{row.student.rollNumber}</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max={task.maxMarks}
                          step="0.5"
                          className={`h-8 text-sm font-mono ${isInvalid ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                          value={current?.obtainedMarks ?? String(row.obtainedMarks)}
                          onChange={(e) => updateMark(row.studentId, 'obtainedMarks', e.target.value)}
                        />
                        {isInvalid && (
                          <p className="text-[10px] text-red-500 mt-0.5">Exceeds max</p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8 text-xs"
                          placeholder="Optional remark…"
                          value={current?.remarks ?? (row.remarks ?? '')}
                          onChange={(e) => updateMark(row.studentId, 'remarks', e.target.value)}
                        />
                      </TableCell>
                      <TableCell className="text-center">
                        <span className={`text-xs font-semibold ${
                          pct >= 80 ? 'text-emerald-600' :
                          pct >= 60 ? 'text-blue-600' :
                          pct >= 40 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {pct}%
                        </span>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 pt-3 border-t">
          <Button type="button" variant="outline" onClick={onClose}>Close</Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !isDirty}
            className="gap-2"
          >
            <Save className="w-4 h-4" />
            {saveMutation.isPending ? 'Saving…' : isDirty ? 'Save Marks' : 'Saved'}
          </Button>
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
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-5 h-5 text-indigo-600" />
            Edit Task
          </DialogTitle>
          <DialogDescription>
            Update task details. Class and subject cannot be changed.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="rounded-lg bg-gray-50 border p-3 text-sm text-gray-600">
            <span className="font-medium text-gray-800">{task.class.name} ({task.class.section})</span>
            {' · '}
            <span>{task.subject.name} ({task.subject.code})</span>
          </div>

          <div className="space-y-1.5">
            <Label>Title *</Label>
            <Input
              required
              value={form.title}
              onChange={(e) => setForm(p => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_TYPE_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Max Marks</Label>
              <Input
                type="number" min="1" max="1000"
                value={form.maxMarks}
                onChange={(e) => setForm(p => ({ ...p, maxMarks: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Due Date (optional)</Label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => setForm(p => ({ ...p, dueDate: e.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
              className="resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending} className="gap-2">
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
  const { data: classesRaw, isLoading: classesLoading } = useQuery({
    queryKey: ['teacher-classes'],
    queryFn:  () => fetchApi<ClassRecord[]>('/api/teacher-portal/classes'),
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
      <div className="flex items-center justify-center min-h-[400px] text-gray-400">
        <p className="text-sm">Access Restricted</p>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-indigo-600" />
            Tasks & Marks
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Create assignments and quizzes, then enter marks for each student.
          </p>
        </div>
        <Button onClick={() => setCreate(true)} className="gap-2">
          <Plus className="w-4 h-4" /> Create Task
        </Button>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="p-4 border-b flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-medium text-gray-500">Filter by class:</span>
            <Select
              value={classFilter || '_all'}
              onValueChange={(v) => { setClass(v === '_all' ? '' : v); setPage(1) }}
            >
              <SelectTrigger className="w-48 h-8 text-sm">
                <SelectValue placeholder="All Classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All Classes</SelectItem>
                {classes.map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {formatClassWithShift(c.name, c.shift)} ({c.section || 'N/A'}) — {c.campus?.name || 'No Campus'} [{c.batch?.name || 'No Batch'}]
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto text-xs text-gray-400">
            {pagination ? `${pagination.total} tasks` : ''}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 text-xs uppercase tracking-wide">
                <TableHead>Task</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Class / Subject</TableHead>
                <TableHead>Max Marks</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton cols={6} />
              ) : tasks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center">
                    <div className="flex flex-col items-center gap-2 text-gray-400">
                      <ClipboardList className="w-8 h-8 text-gray-300" />
                      <span className="text-sm">No tasks created yet. Click &quot;Create Task&quot; to get started.</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                tasks.map((task) => (
                  <TableRow key={task.id} className="hover:bg-indigo-50/20 transition-colors">
                    <TableCell>
                      <p className="font-medium text-gray-900 text-sm">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-gray-400 truncate max-w-[220px]">{task.description}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TASK_TYPE_COLORS[task.type]}`}>
                        {TASK_TYPE_LABELS[task.type]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-gray-800">{task.class.name} ({task.class.section})</p>
                      <p className="text-xs text-gray-400">{task.subject.name} · {task.subject.code}</p>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-semibold text-gray-800">{task.maxMarks}</span>
                    </TableCell>
                    <TableCell>
                      {task.dueDate ? (
                        <span className="text-xs text-gray-600">
                          {new Date(task.dueDate).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          className="gap-1.5 h-8 text-xs"
                          onClick={() => setMarkTask(task)}
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Marks
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditTask(task)}>
                              <Pencil className="w-3.5 h-3.5 mr-2" /> Edit Task
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-red-600 focus:text-red-600"
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
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              {((page - 1) * limit) + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0"
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium text-gray-700 px-1">{page} / {pagination.totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0"
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

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTask} onOpenChange={(o) => !o && setDeleteTask(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteTask?.title}&quot;? This will also remove all student marks for this task. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction>
            <Button
              variant="destructive"
              onClick={() => deleteTask && deleteMutation.mutate(deleteTask.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete Task'}
            </Button>
          </AlertDialogAction>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
