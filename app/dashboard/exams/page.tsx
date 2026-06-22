'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AcademicScopeFilters } from '@/components/academic/AcademicScopeFilters'
import { useAcademicHierarchy } from '@/hooks/useAcademicHierarchy'
import type { AcademicScopeState } from '@/lib/academic/types'
import { filterClassesByScope } from '@/lib/academic/hierarchy'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  BookOpen, Calendar, Plus, RefreshCw, Pencil, Trash2, Eye, Users, ClipboardList,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { isAcademicEnginePrimary } from '@/lib/academic/config'
import { Badge } from '@/components/ui/badge'
import { motion } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Campus {
  id: string
  name: string
}

interface ClassRecord {
  id: string
  name: string
  grade: number
  section?: string
  shift?: 'MORNING' | 'EVENING'
  campusId: string
  batchId?: string
  campus: Campus
  academicYear: string
}

interface Exam {
  id: string
  name: string
  startDate: string
  endDate: string
  totalMarks: number
  isActive: boolean
  academicYear: string
  classId: string
  class: { name: string; campus?: { name: string } }
  _count: { results: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  upcoming: { label: 'Upcoming', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  active:   { label: 'Active',   className: 'bg-green-100 text-green-700 border-green-200' },
  completed:{ label: 'Completed',className: 'bg-gray-100 text-gray-500 border-gray-200' },
} as const

function getExamStatus(start: string, end: string): keyof typeof STATUS_CONFIG {
  const now = Date.now()
  if (now < new Date(start).getTime()) return 'upcoming'
  if (now <= new Date(end).getTime()) return 'active'
  return 'completed'
}

const CURRENT_YEAR = `${new Date().getFullYear()}-${new Date().getFullYear() + 1}`

const EMPTY_CREATE_FORM = {
  name: '',
  classIds: [] as string[],
  academicYear: CURRENT_YEAR,
  startDate: '',
  endDate: '',
  totalMarks: 100,
}

const EMPTY_EDIT_FORM = {
  name: '',
  classId: '',
  academicYear: CURRENT_YEAR,
  startDate: '',
  endDate: '',
  totalMarks: 100,
}

// ─── Campus-Grouped Class Selector ────────────────────────────────────────────

function ClassSelector({
  classes,
  campuses,
  value,
  onChange,
}: {
  classes: ClassRecord[]
  campuses: Campus[]
  value: string
  onChange: (v: string) => void
}) {
  const groups = campuses.map(campus => ({
    campus,
    classes: classes.filter(c => c.campusId === campus.id)
  })).sort((a, b) => a.campus.name.localeCompare(b.campus.name))

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue placeholder="Select a class" />
      </SelectTrigger>
      <SelectContent>
        {groups.length === 0 ? (
          <SelectItem value="__loading" disabled>Loading classes…</SelectItem>
        ) : (
          groups.map(({ campus, classes: campusClasses }) => (
            <SelectGroup key={campus.id}>
              <SelectLabel className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-2 py-1.5 bg-gray-50">
                🏫 {campus.name}
              </SelectLabel>
              {campusClasses.length === 0 ? (
                <SelectItem value={`__empty_${campus.id}`} disabled className="text-gray-400 italic">
                  No classes available
                </SelectItem>
              ) : (
                campusClasses
                  .sort((a, b) => a.grade - b.grade || (a.section ?? '').localeCompare(b.section ?? ''))
                  .map((cls) => (
                    <SelectItem key={cls.id} value={cls.id} className="pl-4">
                      {cls.name}
                    </SelectItem>
                  ))
              )}
            </SelectGroup>
          ))
        )}
      </SelectContent>
    </Select>
  )
}

// ─── Exam Form (shared by Create & Edit) ──────────────────────────────────────

function MultiClassSelector({
  classes,
  campuses,
  value,
  onChange,
}: {
  classes: ClassRecord[]
  campuses: Campus[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const groups = campuses.map(campus => ({
    campus,
    classes: classes.filter(c => c.campusId === campus.id)
  })).sort((a, b) => a.campus.name.localeCompare(b.campus.name))

  const toggle = (id: string) => {
    if (value.includes(id)) onChange(value.filter(v => v !== id))
    else onChange([...value, id])
  }

  const toggleCampus = (campusClasses: ClassRecord[]) => {
    const classIds = campusClasses.map(c => c.id)
    const allSelected = classIds.every(id => value.includes(id))
    if (allSelected) {
      onChange(value.filter(v => !classIds.includes(v)))
    } else {
      const newValues = new Set([...value, ...classIds])
      onChange(Array.from(newValues))
    }
  }

  return (
    <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-3 bg-white">
      {groups.length === 0 && <p className="text-sm text-gray-400 p-2">Loading classes...</p>}
      {groups.map(({ campus, classes: campusClasses }) => {
        const classIds = campusClasses.map(c => c.id)
        const allSelected = classIds.length > 0 && classIds.every(id => value.includes(id))
        const someSelected = classIds.some(id => value.includes(id))
        return (
          <div key={campus.id} className="space-y-1">
            <div 
              className="flex items-center gap-2 px-2 py-1 bg-gray-50 rounded hover:bg-gray-100 cursor-pointer text-sm font-medium"
              onClick={() => toggleCampus(campusClasses)}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${allSelected ? 'bg-indigo-600 border-indigo-600 text-white' : someSelected ? 'bg-indigo-100 border-indigo-600' : 'border-gray-300'}`}>
                {allSelected && <svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                {!allSelected && someSelected && <div className="w-2 h-2 bg-indigo-600 rounded-sm" />}
              </div>
              🏫 {campus.name}
            </div>
            {campusClasses.length === 0 ? (
              <p className="text-xs text-gray-400 pl-8 italic">No classes available. Create them in the Classes module first.</p>
            ) : (
              <div className="grid grid-cols-2 gap-1 pl-4">
                {campusClasses.sort((a, b) => a.grade - b.grade || (a.section ?? '').localeCompare(b.section ?? '')).map((cls) => (
                  <div 
                    key={cls.id} 
                    className="flex items-center gap-2 px-2 py-1 hover:bg-gray-50 rounded cursor-pointer text-sm text-gray-600"
                    onClick={() => toggle(cls.id)}
                  >
                    <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center ${value.includes(cls.id) ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-300'}`}>
                      {value.includes(cls.id) && <svg width="8" height="6" viewBox="0 0 10 8" fill="none"><path d="M1 4L3.5 6.5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                    {cls.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function CreateExamForm({
  form,
  onChange,
  classes,
  campuses,
}: {
  form: typeof EMPTY_CREATE_FORM
  onChange: (patch: Partial<typeof EMPTY_CREATE_FORM>) => void
  classes: ClassRecord[]
  campuses: Campus[]
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label>Exam Name <span className="text-red-500">*</span></Label>
        <Input
          placeholder="e.g. Mid-Term Examination"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Classes <span className="text-red-500">*</span></Label>
        <MultiClassSelector
          classes={classes}
          campuses={campuses}
          value={form.classIds}
          onChange={(v) => onChange({ classIds: v })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Academic Year <span className="text-red-500">*</span></Label>
        <Input
          placeholder="2025-2026"
          value={form.academicYear}
          onChange={(e) => onChange({ academicYear: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start Date <span className="text-red-500">*</span></Label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>End Date <span className="text-red-500">*</span></Label>
          <Input
            type="date"
            value={form.endDate}
            min={form.startDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Total Marks</Label>
        <Input
          type="number"
          min={10}
          value={form.totalMarks}
          onChange={(e) => onChange({ totalMarks: parseInt(e.target.value) || 100 })}
        />
      </div>
    </div>
  )
}

function EditExamForm({
  form,
  onChange,
  classes,
  campuses,
}: {
  form: typeof EMPTY_EDIT_FORM
  onChange: (patch: Partial<typeof EMPTY_EDIT_FORM>) => void
  classes: ClassRecord[]
  campuses: Campus[]
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label>Exam Name <span className="text-red-500">*</span></Label>
        <Input
          placeholder="e.g. Mid-Term Examination"
          value={form.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Class <span className="text-red-500">*</span></Label>
        <ClassSelector
          classes={classes}
          campuses={campuses}
          value={form.classId}
          onChange={(v) => onChange({ classId: v })}
        />
      </div>

      <div className="space-y-1.5">
        <Label>Academic Year <span className="text-red-500">*</span></Label>
        <Input
          placeholder="2025-2026"
          value={form.academicYear}
          onChange={(e) => onChange({ academicYear: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Start Date <span className="text-red-500">*</span></Label>
          <Input
            type="date"
            value={form.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>End Date <span className="text-red-500">*</span></Label>
          <Input
            type="date"
            value={form.endDate}
            min={form.startDate}
            onChange={(e) => onChange({ endDate: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Total Marks</Label>
        <Input
          type="number"
          min={10}
          value={form.totalMarks}
          onChange={(e) => onChange({ totalMarks: parseInt(e.target.value) || 100 })}
        />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const defaultExamScope = (): AcademicScopeState => ({
  campusId: '',
  batchId: '',
  shift: 'MORNING',
  classId: '',
  houseId: '',
})

export default function ExamsPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const role = session?.user?.role as string | undefined
  const canCreate = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const queryClient = useQueryClient()

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !isAcademicEnginePrimary()) return
    if (role === 'STUDENT') router.replace('/dashboard/enrollment?tab=results')
    else if (role === 'PARENT' || role === 'GUARDIAN') router.replace('/dashboard/my-children')
  }, [sessionStatus, role, router])

  const [listScope, setListScope] = useState<AcademicScopeState>(defaultExamScope)
  const listHierarchy = useAcademicHierarchy(listScope, setListScope, {
    mode: 'admin',
    enabled: !!session?.user,
  })

  // Dialog states
  const [createOpen, setCreateOpen] = useState(false)
  const [editExam, setEditExam] = useState<Exam | null>(null)
  const [viewExam, setViewExam] = useState<Exam | null>(null)
  const [deleteExam, setDeleteExam] = useState<Exam | null>(null)

  const [createForm, setCreateForm] = useState({ ...EMPTY_CREATE_FORM })
  const [editForm, setEditForm] = useState({ ...EMPTY_EDIT_FORM })

  // Fetch all exams
  const { data: examsData, isLoading } = useQuery<Exam[]>({
    queryKey: ['exams'],
    queryFn: () => fetchApi<Exam[]>('/api/exams'),
  })
  const exams = useMemo(() => examsData ?? [], [examsData])

  // Fetch all classes (SUPER_ADMIN gets all campuses now)
  const { data: classesRaw } = useQuery<ClassRecord[]>({
    queryKey: ['classes-all'],
    queryFn: () => fetchApi<ClassRecord[]>('/api/classes'),
    enabled: createOpen || !!editExam,
    staleTime: 5 * 60 * 1000,
  })
  const allClasses = useMemo(() => classesRaw ?? [], [classesRaw])

  const scopedClassesForForms = useMemo((): ClassRecord[] => {
    const base = allClasses as ClassRecord[]
    if (!createOpen && !editExam) return base
    return filterClassesByScope(base, {
      campusId: listScope.campusId || undefined,
      batchId: listScope.batchId || undefined,
      shift: listScope.shift,
    }) as ClassRecord[]
  }, [allClasses, createOpen, editExam, listScope])

  // Fetch all campuses to explicitly display them even if empty
  const { data: campusesRaw } = useQuery<Campus[]>({
    queryKey: ['campuses'],
    queryFn: () => fetchApi<Campus[]>('/api/campuses'),
    enabled: createOpen || !!editExam,
    staleTime: Infinity,
  })
  const campuses = campusesRaw ?? []

  const visibleExams = useMemo(() => {
    if (!listScope.campusId && !listScope.classId) return exams
    return exams.filter((e) => {
      const cls = allClasses.find((c) => c.id === e.classId)
      if (!cls) return true
      if (listScope.classId && e.classId !== listScope.classId) return false
      if (listScope.campusId && cls.campusId !== listScope.campusId) return false
      if (listScope.batchId && cls.batchId !== listScope.batchId) return false
      return true
    })
  }, [exams, allClasses, listScope])

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: (f: typeof EMPTY_CREATE_FORM) =>
      fetchApi('/api/exams', {
        method: 'POST',
        body: JSON.stringify({
          ...f,
          startDate: new Date(f.startDate + 'T00:00:00').toISOString(),
          endDate: new Date(f.endDate + 'T23:59:59').toISOString(),
          totalMarks: Number(f.totalMarks),
        }),
      }),
    onSuccess: () => {
      notify.success('Exam(s) scheduled successfully')
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      setCreateOpen(false)
      setCreateForm({ ...EMPTY_CREATE_FORM })
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to schedule exams'
      notify.error('Failed to schedule exams', { description: message })
    },
  })

  const editMutation = useMutation({
    mutationFn: ({ id, f }: { id: string; f: typeof EMPTY_EDIT_FORM }) =>
      fetchApi(`/api/exams/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...f,
          startDate: f.startDate ? new Date(f.startDate + 'T00:00:00').toISOString() : undefined,
          endDate: f.endDate ? new Date(f.endDate + 'T23:59:59').toISOString() : undefined,
          totalMarks: Number(f.totalMarks),
        }),
      }),
    onSuccess: () => {
      notify.success('Exam updated successfully')
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      setEditExam(null)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to update exam'
      notify.error('Failed to update exam', { description: message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/exams/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Exam removed')
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      setDeleteExam(null)
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Failed to delete exam'
      notify.error('Failed to delete exam', { description: message })
    },
  })

  // ── Handlers ───────────────────────────────────────────────────────────────

  const validateCreateForm = (f: typeof EMPTY_CREATE_FORM) => {
    if (!f.name.trim()) { notify.error('Exam name is required'); return false }
    if (f.classIds.length === 0) { notify.error('Please select at least one class'); return false }
    if (!f.startDate) { notify.error('Start date is required'); return false }
    if (!f.endDate) { notify.error('End date is required'); return false }
    if (new Date(f.endDate) < new Date(f.startDate)) { notify.error('End date must be after start date'); return false }
    if (!/^\d{4}-\d{4}$/.test(f.academicYear)) { notify.error('Academic Year must be in format YYYY-YYYY'); return false }
    return true
  }

  const validateEditForm = (f: typeof EMPTY_EDIT_FORM) => {
    if (!f.name.trim()) { notify.error('Exam name is required'); return false }
    if (!f.classId) { notify.error('Please select a class'); return false }
    if (!f.startDate) { notify.error('Start date is required'); return false }
    if (!f.endDate) { notify.error('End date is required'); return false }
    if (new Date(f.endDate) < new Date(f.startDate)) { notify.error('End date must be after start date'); return false }
    if (!/^\d{4}-\d{4}$/.test(f.academicYear)) { notify.error('Academic Year must be in format YYYY-YYYY'); return false }
    return true
  }

  const openEdit = (exam: Exam) => {
    const fmtDate = (iso: string) => iso ? new Date(iso).toISOString().split('T')[0] : ''
    setEditForm({
      name: exam.name,
      classId: exam.classId,
      academicYear: exam.academicYear,
      startDate: fmtDate(exam.startDate),
      endDate: fmtDate(exam.endDate),
      totalMarks: exam.totalMarks,
    })
    setEditExam(exam)
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="space-y-5">
      {/* Header */}
      <motion.div variants={fadeUp(0.1)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <BookOpen className="w-6 h-6" />
            </div>
            Examinations
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium ml-11">Schedule and manage academic examinations across all campuses.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/exams/date-sheets">
            <Button variant="outline" className="gap-2">
              <Calendar className="w-4 h-4" /> Date Sheets
            </Button>
          </Link>
          {canCreate && (
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 shadow-sm" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" /> Schedule Exam
            </Button>
          )}
        </div>
      </motion.div>

      <motion.div variants={fadeUp(0.2)} className="bg-white rounded-2xl border border-slate-200/60 shadow-soft-md p-4">
        <p className="text-xs text-slate-500 mb-3">
          Narrow exams by campus, batch, and session. Class list in Schedule Exam uses the same scope.
        </p>
        <AcademicScopeFilters
          hierarchy={listHierarchy}
          showHouse
          showClass
          onScopeChange={() => {}}
        />
      </motion.div>

      {/* Exam grid */}
      <motion.div variants={fadeUp(0.3)}>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
          </div>
        ) : visibleExams.length === 0 ? (
          <div className="col-span-full">
            <EmptyState 
              icon={BookOpen}
              title="No exams scheduled yet"
              description={canCreate ? "Click 'Schedule Exam' to add your first exam." : "No exams match the selected filters."}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleExams.map((exam) => {
            const status = getExamStatus(exam.startDate, exam.endDate)
            const cfg = STATUS_CONFIG[status]
            const start = new Date(exam.startDate)
            const end = new Date(exam.endDate)
            return (
              <Card key={exam.id} className="hover:shadow-md transition-shadow group relative overflow-hidden">
                {/* Status stripe */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${
                  status === 'upcoming' ? 'bg-blue-400' : status === 'active' ? 'bg-green-400' : 'bg-gray-300'
                }`} />

                <CardContent className="p-5 pt-6">
                  <div className="flex items-start justify-between mb-3">
                    {/* Date badge */}
                    <div className="w-11 h-11 rounded-xl bg-purple-100 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-[9px] font-bold text-purple-600 leading-none uppercase">
                        {start.toLocaleDateString('en', { month: 'short' })}
                      </span>
                      <span className="text-sm font-black text-purple-800 leading-none">{start.getDate()}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Badge variant="outline" className={`text-xs ${cfg.className}`}>
                        {cfg.label}
                      </Badge>
                      {canCreate && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                            title="View details"
                            onClick={() => setViewExam(exam)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                            title="Edit exam"
                            onClick={() => openEdit(exam)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                            title="Delete exam"
                            onClick={() => setDeleteExam(exam)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>

                  <h3 className="font-semibold text-gray-900 mb-0.5 truncate">{exam.name}</h3>
                  <p className="text-xs text-gray-500 mb-0.5">{exam.class.name}</p>
                  {exam.class.campus && (
                    <p className="text-xs text-indigo-500 font-medium mb-2">🏫 {exam.class.campus.name}</p>
                  )}
                  <p className="text-xs text-gray-400 mb-3">{exam.academicYear}</p>

                  <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
                    <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                    {start.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                    {' — '}
                    {end.toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <ClipboardList className="w-3.5 h-3.5" />
                        {exam.totalMarks} marks
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {exam._count.results} results
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      </motion.div>

      {/* ── Create Exam Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule New Exam</DialogTitle>
            <DialogDescription>
              Create an exam for any class across Boys or Girls Campus.
            </DialogDescription>
          </DialogHeader>
          <CreateExamForm
            form={createForm}
            onChange={(patch) => setCreateForm((f) => ({ ...f, ...patch }))}
            classes={scopedClassesForForms}
            campuses={campuses}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={() => validateCreateForm(createForm) && createMutation.mutate(createForm)}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Scheduling…</>
                : 'Schedule Exam'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Exam Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!editExam} onOpenChange={(o) => !o && setEditExam(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Exam</DialogTitle>
            <DialogDescription>Update the details for this exam.</DialogDescription>
          </DialogHeader>
          <EditExamForm
            form={editForm}
            onChange={(patch) => setEditForm((f) => ({ ...f, ...patch }))}
            classes={scopedClassesForForms}
            campuses={campuses}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditExam(null)}>Cancel</Button>
            <Button
              onClick={() =>
                editExam && validateEditForm(editForm) && editMutation.mutate({ id: editExam.id, f: editForm })
              }
              disabled={editMutation.isPending}
            >
              {editMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Saving…</>
                : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── View Exam Dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!viewExam} onOpenChange={(o) => !o && setViewExam(null)}>
        <DialogContent className="max-w-sm" aria-describedby={undefined}>
          <DialogHeader>
            <DialogTitle>{viewExam?.name}</DialogTitle>
          </DialogHeader>
          {viewExam && (() => {
            const status = getExamStatus(viewExam.startDate, viewExam.endDate)
            const cfg = STATUS_CONFIG[status]
            return (
              <div className="space-y-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Status</span>
                  <Badge variant="outline" className={cfg.className}>{cfg.label}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Class</span>
                  <span className="font-medium">{viewExam.class.name}</span>
                </div>
                {viewExam.class.campus && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Campus</span>
                    <span className="font-medium text-indigo-600">{viewExam.class.campus.name}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Academic Year</span>
                  <span className="font-medium">{viewExam.academicYear}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Start Date</span>
                  <span className="font-medium">
                    {new Date(viewExam.startDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">End Date</span>
                  <span className="font-medium">
                    {new Date(viewExam.endDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Total Marks</span>
                  <span className="font-bold text-gray-900">{viewExam.totalMarks}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Results Entered</span>
                  <span className="font-medium">{viewExam._count.results} students</span>
                </div>
              </div>
            )
          })()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewExam(null)}>Close</Button>
            {canCreate && (
              <Button onClick={() => { openEdit(viewExam!); setViewExam(null) }}>
                <Pencil className="w-4 h-4 mr-2" /> Edit
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ───────────────────────────────────────── */}
      <Dialog open={!!deleteExam} onOpenChange={(o) => !o && setDeleteExam(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Exam</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <strong>{deleteExam?.name}</strong>? This action is reversible by an administrator but will hide the exam from all listings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteExam(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteExam && deleteMutation.mutate(deleteExam.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending
                ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Deleting…</>
                : 'Delete Exam'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
