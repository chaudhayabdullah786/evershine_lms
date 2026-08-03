'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { GraduationCap, Plus, Loader2, Pencil, Trash2, RotateCcw, Check, X, ChevronDown, ChevronUp } from 'lucide-react'
import { notify } from '@/lib/notify'
import { SESSION_SHIFT_BADGE_CLASS, SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'
import Link from 'next/link'

export interface StudentEnrollmentRow {
  id: string
  rollNumber: string
  status: string
  deliveryMode: string
  academicYear: { id: string; name: string; isActive: boolean; isLocked: boolean }
  classSection: {
    id: string
    className: string
    sectionName: string
    grade?: number | null
    campus: { name: string; code: string }
    batch: { name: string; code: string }
    shift: { code: SessionShift; name: string; startTime: string; endTime: string }
  }
  subjectEnrollments?: Array<{
    subjectOffering: { subject: { name: string; code: string } }
  }>
}

interface ClassSectionOption {
  id: string
  className: string
  sectionName: string
  grade?: number
  campus: { code: string }
  batch: { code: string }
  shift: { code: SessionShift; name: string }
}

interface InlineEditState {
  rollNumber: string
  deliveryMode: 'PHYSICAL' | 'ONLINE' | 'HYBRID'
}

interface Props {
  studentId: string
  campusId: string
  batchId?: string
  canManage?: boolean
  compact?: boolean
}

export function StudentEnrollmentsPanel({
  studentId,
  campusId,
  batchId,
  canManage = false,
  compact = false,
}: Props) {
  const qc = useQueryClient()

  // ── Add enrollment form state ────────────────────────────────────────────
  const [showAdd, setShowAdd] = useState(false)
  const [classSectionId, setClassSectionId] = useState('')
  const [rollNumber, setRollNumber] = useState('')
  const [deliveryMode, setDeliveryMode] = useState<'PHYSICAL' | 'ONLINE' | 'HYBRID'>('PHYSICAL')

  // ── Inline edit state ────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<InlineEditState>({ rollNumber: '', deliveryMode: 'PHYSICAL' })

  // ── History section toggle ───────────────────────────────────────────────
  const [showHistory, setShowHistory] = useState(false)

  // ── Re-enroll state ──────────────────────────────────────────────────────
  const [reEnrollingId, setReEnrollingId] = useState<string | null>(null)
  const [reEnrollRoll, setReEnrollRoll] = useState('')

  // ── Data fetching ────────────────────────────────────────────────────────
  const { data: enrollmentsRaw, isLoading } = useQuery({
    queryKey: ['student-enrollments', studentId],
    queryFn: () => fetchApi<StudentEnrollmentRow[]>(`/api/students/${studentId}/enrollments`),
  })

  const enrollments = Array.isArray(enrollmentsRaw)
    ? enrollmentsRaw
    : (enrollmentsRaw as { data?: StudentEnrollmentRow[] })?.data ?? []

  const { data: sectionsRaw } = useQuery({
    queryKey: ['class-sections', campusId, batchId],
    queryFn: () => {
      const params = new URLSearchParams({ campusId })
      if (batchId) params.set('batchId', batchId)
      return fetchApi<ClassSectionOption[]>(`/api/class-sections?${params}`)
    },
    enabled: (showAdd || !!reEnrollingId) && !!campusId,
  })

  const sections = Array.isArray(sectionsRaw)
    ? sectionsRaw
    : (sectionsRaw as { data?: ClassSectionOption[] })?.data ?? []

  // ── Derived state ────────────────────────────────────────────────────────
  const active    = enrollments.filter((e) => e.status === 'ACTIVE')
  const withdrawn = enrollments.filter((e) => e.status !== 'ACTIVE')

  // ── Mutations ────────────────────────────────────────────────────────────

  const addMutation = useMutation({
    mutationFn: () =>
      fetchApi(`/api/students/${studentId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify({ classSectionId, rollNumber, deliveryMode }),
      }),
    onSuccess: () => {
      notify.success('Section enrollment added')
      qc.invalidateQueries({ queryKey: ['student-enrollments', studentId] })
      qc.invalidateQueries({ queryKey: ['student', studentId] })
      setShowAdd(false)
      setClassSectionId('')
      setRollNumber('')
    },
    onError: (err: Error) => notify.error(err.message || 'Failed to add enrollment'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: InlineEditState }) =>
      fetchApi(`/api/student-enrollments/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      notify.success('Enrollment updated')
      qc.invalidateQueries({ queryKey: ['student-enrollments', studentId] })
      setEditingId(null)
    },
    onError: (err: Error) => notify.error(err.message || 'Failed to update enrollment'),
  })

  // WHY soft-delete via WITHDRAWN status:
  // Historical marks, attendance, and assessments recorded against this enrollment
  // must be retained. Hard deletion would cascade-destroy them, violating audit requirements.
  const withdrawMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/student-enrollments/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Student withdrawn from section. Historical records are preserved.')
      qc.invalidateQueries({ queryKey: ['student-enrollments', studentId] })
      qc.invalidateQueries({ queryKey: ['student', studentId] })
    },
    onError: (err: Error) => notify.error(err.message || 'Failed to withdraw enrollment'),
  })

  // Re-enroll: create a fresh enrollment for the same student in the same or different section
  const reEnrollMutation = useMutation({
    mutationFn: ({ sectionId, roll }: { sectionId: string; roll: string }) =>
      fetchApi(`/api/students/${studentId}/enrollments`, {
        method: 'POST',
        body: JSON.stringify({ classSectionId: sectionId, rollNumber: roll, deliveryMode: 'PHYSICAL' }),
      }),
    onSuccess: () => {
      notify.success('Student re-enrolled successfully')
      qc.invalidateQueries({ queryKey: ['student-enrollments', studentId] })
      qc.invalidateQueries({ queryKey: ['student', studentId] })
      setReEnrollingId(null)
      setReEnrollRoll('')
    },
    onError: (err: Error) => notify.error(err.message || 'Failed to re-enroll'),
  })

  // ── Handler helpers ──────────────────────────────────────────────────────

  function startEdit(e: StudentEnrollmentRow) {
    setEditingId(e.id)
    setEditForm({ rollNumber: e.rollNumber, deliveryMode: e.deliveryMode as InlineEditState['deliveryMode'] })
  }

  function handleWithdraw(e: StudentEnrollmentRow) {
    if (e.academicYear.isLocked) {
      notify.error('Cannot withdraw from a locked academic year.')
      return
    }
    if (!confirm(`Withdraw ${e.classSection.className}-${e.classSection.sectionName} enrollment?\nHistorical attendance and marks will be preserved.`)) return
    withdrawMutation.mutate(e.id)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : undefined}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-indigo-600" />
              Academic Engine Enrollments
            </CardTitle>
            <CardDescription className="text-xs">
              Section placements with full lifecycle management (edit · withdraw · re-enroll).
            </CardDescription>
          </div>
          {canManage && (
            <Button variant="outline" size="sm" className="gap-1 text-xs h-8 shrink-0" onClick={() => setShowAdd((v) => !v)}>
              <Plus className="w-3.5 h-3.5" />
              Add section
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* ── Add enrollment form ─────────────────────────────────────── */}
        {showAdd && canManage && (
          <div className="p-3 rounded-lg border border-indigo-200 bg-indigo-50/50 space-y-3">
            <p className="text-xs font-semibold text-indigo-800">New section enrollment</p>
            <div className="space-y-1">
              <Label className="text-xs">Class section</Label>
              <Select value={classSectionId} onValueChange={setClassSectionId}>
                <SelectTrigger className="h-9 text-sm bg-white">
                  <SelectValue placeholder="Select section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.className}-{s.sectionName} · {s.shift.name} · {s.campus.code}/{s.batch.code}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Roll number</Label>
                <Input className="h-9 text-sm bg-white" value={rollNumber} onChange={(e) => setRollNumber(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Delivery</Label>
                <Select value={deliveryMode} onValueChange={(v) => setDeliveryMode(v as typeof deliveryMode)}>
                  <SelectTrigger className="h-9 text-sm bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PHYSICAL">Physical</SelectItem>
                    <SelectItem value="ONLINE">Online</SelectItem>
                    <SelectItem value="HYBRID">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" disabled={!classSectionId || !rollNumber || addMutation.isPending} onClick={() => addMutation.mutate()}>
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save enrollment'}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {/* ── Active enrollments ──────────────────────────────────────── */}
        {isLoading ? (
          <p className="text-xs text-gray-400">Loading enrollments…</p>
        ) : active.length === 0 ? (
          <p className="text-xs text-gray-500">
            No active section enrollments. Use{' '}
            <Link href="/dashboard/academic" className="text-blue-600 underline">Academic Engine</Link>
            {' '}or add a section above.
          </p>
        ) : (
          <ul className="space-y-2">
            {active.map((e) => {
              const shift     = e.classSection.shift.code
              const isEditing = editingId === e.id
              const isLocked  = e.academicYear.isLocked

              return (
                <li key={e.id} className="rounded-xl border bg-gray-50/80 overflow-hidden">
                  {/* Main row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {e.classSection.className} — Section {e.classSection.sectionName}
                        <span className="text-gray-400 font-normal ml-1">· Roll {e.rollNumber}</span>
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {e.academicYear.name} · {e.classSection.campus.code} · {e.classSection.batch.name} · {e.deliveryMode}
                      </p>
                      {e.subjectEnrollments && e.subjectEnrollments.length > 0 && (
                        <p className="text-[10px] text-gray-400 mt-1">
                          {e.subjectEnrollments.length} subject(s) enrolled
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${SESSION_SHIFT_BADGE_CLASS[shift]}`}>
                        {SESSION_SHIFT_LABELS[shift]}
                      </span>
                      <Badge variant="outline" className="text-[10px]">{e.status}</Badge>
                      {isLocked && <Badge variant="secondary" className="text-[10px]">Locked</Badge>}
                      <Link href={`/dashboard/attendance/sections?sectionId=${e.classSection.id}`}>
                        <Button variant="ghost" size="sm" className="text-xs h-7">Attendance</Button>
                      </Link>
                      {canManage && !isLocked && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-indigo-600"
                            title="Edit roll number / delivery mode"
                            onClick={() => isEditing ? setEditingId(null) : startEdit(e)}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-slate-500 hover:text-red-600"
                            title="Withdraw from this section"
                            disabled={withdrawMutation.isPending}
                            onClick={() => handleWithdraw(e)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Inline edit panel */}
                  {isEditing && canManage && (
                    <div className="border-t border-indigo-100 bg-indigo-50/40 px-3 py-2.5 flex flex-col sm:flex-row gap-2 items-end">
                      <div className="space-y-1 flex-1">
                        <Label className="text-xs">Roll number</Label>
                        <Input
                          className="h-8 text-xs bg-white"
                          value={editForm.rollNumber}
                          onChange={(ev) => setEditForm((f) => ({ ...f, rollNumber: ev.target.value }))}
                        />
                      </div>
                      <div className="space-y-1 w-40">
                        <Label className="text-xs">Delivery mode</Label>
                        <Select
                          value={editForm.deliveryMode}
                          onValueChange={(v) => setEditForm((f) => ({ ...f, deliveryMode: v as InlineEditState['deliveryMode'] }))}
                        >
                          <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PHYSICAL">Physical</SelectItem>
                            <SelectItem value="ONLINE">Online</SelectItem>
                            <SelectItem value="HYBRID">Hybrid</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          disabled={updateMutation.isPending}
                          onClick={() => updateMutation.mutate({ id: e.id, data: editForm })}
                        >
                          {updateMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* ── Historical / withdrawn enrollments ──────────────────────── */}
        {!compact && withdrawn.length > 0 && (
          <div className="pt-2 border-t border-dashed border-gray-200">
            <button
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => setShowHistory((v) => !v)}
            >
              {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              {withdrawn.length} historical enrollment{withdrawn.length !== 1 ? 's' : ''} on record
            </button>

            {showHistory && (
              <ul className="space-y-1.5 mt-2">
                {withdrawn.map((e) => (
                  <li key={e.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg border border-dashed border-gray-200 bg-gray-50/40">
                    <div>
                      <p className="text-xs font-medium text-gray-600">
                        {e.classSection.className}-{e.classSection.sectionName}
                        <span className="text-gray-400 font-normal ml-1">· {e.academicYear.name}</span>
                      </p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {e.classSection.campus.code} · Roll {e.rollNumber} · {e.deliveryMode}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {e.status.toLowerCase()}
                      </Badge>

                      {/* Re-enroll only when academic year is not locked */}
                      {canManage && !e.academicYear.isLocked && (
                        reEnrollingId === e.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-7 w-24 text-xs"
                              placeholder="Roll no."
                              value={reEnrollRoll}
                              onChange={(ev) => setReEnrollRoll(ev.target.value)}
                            />
                            <Select
                              value={classSectionId || e.classSection.id}
                              onValueChange={setClassSectionId}
                            >
                              <SelectTrigger className="h-7 w-40 text-xs"><SelectValue placeholder="Section" /></SelectTrigger>
                              <SelectContent>
                                {sections.length > 0
                                  ? sections.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                      {s.className}-{s.sectionName} · {s.shift.name}
                                    </SelectItem>
                                  ))
                                  : <SelectItem value={e.classSection.id}>
                                    {e.classSection.className}-{e.classSection.sectionName} (same)
                                  </SelectItem>
                                }
                              </SelectContent>
                            </Select>
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1"
                              disabled={!reEnrollRoll || reEnrollMutation.isPending}
                              onClick={() => reEnrollMutation.mutate({
                                sectionId: classSectionId || e.classSection.id,
                                roll: reEnrollRoll,
                              })}
                            >
                              {reEnrollMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7" onClick={() => setReEnrollingId(null)}>
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs text-indigo-600 border-indigo-200"
                            onClick={() => { setReEnrollingId(e.id); setReEnrollRoll(e.rollNumber); setClassSectionId(e.classSection.id) }}
                          >
                            <RotateCcw className="w-3 h-3" />
                            Re-enroll
                          </Button>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
