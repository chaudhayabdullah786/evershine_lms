'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { fetchApi } from '@/lib/api-client'
import { useSession } from 'next-auth/react'
import { notify } from '@/lib/notify'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import {
  GraduationCap, Save, Loader2, CheckCircle2, PlusCircle,
  Trash2, Edit2, Award, BarChart3, Eye,
} from 'lucide-react'
import { AccessDenied } from '@/components/AccessDenied'

// ── Types ─────────────────────────────────────────────────────────────────────

type ClassSection = { id: string; className: string; sectionName: string }
type ExamSession = { id: string; name: string; term: string }
type Student = { id: string; firstName: string; lastName: string; rollNumber: string; fatherName: string }
type SubjectOffering = { id: string; subject: { name: string; code: string } }

type SubjectEntry = {
  subjectOfferingId: string
  subjectName: string
  totalMarks: number
  obtainedMarks: string
  isAbsent: boolean
  isNotApplicable: boolean
  remarks: string
}

type CustomField = { label: string; value: string }

const PERFORMANCE_BATCH_OPTIONS = [
  'Ever Shine',
  'Quaid',
  'Iqbal',
  'Improvement',
] as const

function batchColor(batch: string) {
  if (batch === 'Ever Shine') return 'bg-emerald-100 text-emerald-800'
  if (batch === 'Quaid') return 'bg-blue-100 text-blue-800'
  if (batch === 'Iqbal') return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-800'
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function TeacherResultEntryPage() {
  const { data: session, status } = useSession()
  const qc = useQueryClient()

  const [classSectionId, setClassSectionId] = useState('')
  const [examSessionId, setExamSessionId] = useState('')
  const [studentId, setStudentId] = useState('')
  const [teacherRemarks, setTeacherRemarks] = useState('')
  const [subjectEntries, setSubjectEntries] = useState<SubjectEntry[]>([])
  const [newField, setNewField] = useState<CustomField>({ label: '', value: '' })
  const [editReason, setEditReason] = useState('')
  const [showDeclareDialog, setShowDeclareDialog] = useState(false)
  const [selectedResultId, setSelectedResultId] = useState('')
  const searchParams = useSearchParams()
  const resultId = searchParams.get('resultId') ?? ''

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: sections = [] } = useQuery<ClassSection[]>({
    queryKey: ['teacher-sections'],
    queryFn: () => fetchApi<ClassSection[]>('/api/teacher-portal/sections'),
    enabled: session?.user?.role === 'TEACHER',
  })

  const { data: examSessions = [] } = useQuery<ExamSession[]>({
    queryKey: ['exam-sessions'],
    queryFn: () => fetchApi<ExamSession[]>('/api/exam-sessions'),
    enabled: true,
  })

  const { data: students = [] } = useQuery<Student[]>({
    queryKey: ['section-students', classSectionId],
    queryFn: () => fetchApi<Student[]>(`/api/teacher-portal/sections/${classSectionId}/students`),
    enabled: !!classSectionId,
  })

  const { data: sectionOfferings = [] } = useQuery<SubjectOffering[]>({
    queryKey: ['section-offerings', classSectionId],
    queryFn: () => fetchApi<SubjectOffering[]>(`/api/teacher-portal/sections/${classSectionId}/offerings`),
    enabled: !!classSectionId && !resultId,
  })

  useEffect(() => {
    if (!classSectionId || resultId) return
    setSubjectEntries(sectionOfferings.map((o) => ({
      subjectOfferingId: o.id,
      subjectName: o.subject.name,
      totalMarks: 100,
      obtainedMarks: '',
      isAbsent: false,
      isNotApplicable: false,
      remarks: '',
    })))
  }, [classSectionId, resultId, sectionOfferings])

  type ExistingResult = {
    id: string
    studentId: string
    declarationStatus?: 'DECLARED' | string
    performanceBatch?: string
    customFields?: CustomField[] | null
  }

  type ResultDetail = {
    id: string
    studentId: string
    classSectionId: string
    examSessionId: string
    teacherRemarks?: string | null
    subjectResults: Array<{
      id: string
      subjectOfferingId: string
      totalMarks: number
      obtainedMarks: number | null
      isAbsent: boolean
      isNotApplicable: boolean
      remarks?: string | null
      subjectOffering: { subject: { name: string } }
    }>
  }

  const { data: resultDetail, error: resultDetailError } = useQuery<ResultDetail | null>({
    queryKey: ['result-detail', resultId],
    queryFn: () => fetchApi<ResultDetail | null>(`/api/teacher-portal/results/${resultId}`),
    enabled: !!resultId,
  })

  useEffect(() => {
    if (!resultDetail) return
    setClassSectionId(resultDetail.classSectionId)
    setExamSessionId(resultDetail.examSessionId)
    setStudentId(resultDetail.studentId)
    setTeacherRemarks(resultDetail.teacherRemarks ?? '')
    setSelectedResultId(resultDetail.id)
    setSubjectEntries(resultDetail.subjectResults.map((sr) => ({
      subjectOfferingId: sr.subjectOfferingId,
      subjectName: sr.subjectOffering.subject.name,
      totalMarks: sr.totalMarks,
      obtainedMarks: sr.obtainedMarks === null ? '' : String(sr.obtainedMarks),
      isAbsent: sr.isAbsent,
      isNotApplicable: sr.isNotApplicable,
      remarks: sr.remarks ?? '',
    })))
  }, [resultDetail])

  useEffect(() => {
    if (!resultDetailError) return
    notify.error(resultDetailError instanceof Error ? resultDetailError.message : 'Failed to load result details')
  }, [resultDetailError])

  const { data: existingResult } = useQuery<ExistingResult | null>({
    queryKey: ['existing-result', studentId, classSectionId, examSessionId],
    queryFn: () =>
      fetchApi<ExistingResult[]>(
        `/api/teacher-portal/results?classSectionId=${classSectionId}&examSessionId=${examSessionId}`
      ).then((arr) => arr.find((r) => r.studentId === studentId) ?? null),
    enabled: !!(studentId && classSectionId && examSessionId),
  })

  // ── Mutations ────────────────────────────────────────────────────────────────

  const saveResult = useMutation({
    mutationFn: () =>
      fetchApi('/api/teacher-portal/results', {
        method: 'POST',
        body: JSON.stringify({
          studentId,
          classSectionId,
          examSessionId,
          teacherRemarks,
          subjectResults: subjectEntries.map((e) => ({
            subjectOfferingId: e.subjectOfferingId,
            totalMarks: e.totalMarks,
            obtainedMarks: e.obtainedMarks === '' ? null : Number(e.obtainedMarks),
            isAbsent: e.isAbsent,
            isNotApplicable: e.isNotApplicable,
            remarks: e.remarks,
          })),
        }),
      }),
    onSuccess: () => {
      notify.success('Result saved as draft')
      qc.invalidateQueries({ queryKey: ['existing-result'] })
      if (resultId) qc.invalidateQueries({ queryKey: ['result-detail', resultId] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const declareResult = useMutation({
    mutationFn: (resultId: string) =>
      fetchApi(`/api/teacher-portal/results/${resultId}/declare`, { method: 'POST' }),
    onSuccess: () => {
      notify.success('Result declared — students notified')
      setShowDeclareDialog(false)
      qc.invalidateQueries({ queryKey: ['existing-result'] })
      if (resultId) qc.invalidateQueries({ queryKey: ['result-detail', resultId] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const addCustomField = useMutation({
    mutationFn: () =>
      fetchApi(`/api/teacher-portal/results/${existingResult?.id}/custom-fields`, {
        method: 'POST',
        body: JSON.stringify(newField),
      }),
    onSuccess: () => {
      notify.success('Custom field added')
      setNewField({ label: '', value: '' })
      qc.invalidateQueries({ queryKey: ['existing-result'] })
      if (resultId) qc.invalidateQueries({ queryKey: ['result-detail', resultId] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteCustomField = useMutation({
    mutationFn: (index: number) =>
      fetchApi(`/api/teacher-portal/results/${existingResult?.id}/custom-fields`, {
        method: 'DELETE',
        body: JSON.stringify({ index }),
      }),
    onSuccess: () => {
      notify.success('Custom field removed')
      qc.invalidateQueries({ queryKey: ['existing-result'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const overrideBatch = useMutation({
    mutationFn: (batch: string) =>
      fetchApi(`/api/teacher-portal/results/${existingResult?.id}/performance-batch`, {
        method: 'PATCH',
        body: JSON.stringify({ performanceBatch: batch, reason: editReason }),
      }),
    onSuccess: () => {
      notify.success('Performance batch updated')
      setEditReason('')
      qc.invalidateQueries({ queryKey: ['existing-result'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  // ── Guard ─────────────────────────────────────────────────────────────────────

  if (status === 'loading') return null
  if (session?.user?.role !== 'TEACHER') return <AccessDenied title="Result Entry" message="Teachers only." />

  const isEditing = !!resultId
  const isDeclared = existingResult?.declarationStatus === 'DECLARED'
  const canDeclare = existingResult && !isDeclared

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const updateEntry = (idx: number, field: keyof SubjectEntry, val: string | number | boolean) => {
    setSubjectEntries((prev) => prev.map((e, i) => i === idx ? { ...e, [field]: val } : e))
  }

  const computedPct = (() => {
    const valid = subjectEntries.filter((e) => !e.isAbsent && !e.isNotApplicable && e.obtainedMarks !== '')
    const obtained = valid.reduce((s, e) => s + Number(e.obtainedMarks), 0)
    const possible = valid.reduce((s, e) => s + e.totalMarks, 0)
    return possible > 0 ? Math.round((obtained / possible) * 100 * 100) / 100 : 0
  })()

  const autoPerformanceBatch =
    computedPct >= 90 ? 'Ever Shine'
    : computedPct >= 75 ? 'Quaid'
    : computedPct >= 50 ? 'Iqbal'
    : 'Improvement'

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <GraduationCap className="w-7 h-7 text-indigo-600" />
            {isEditing ? 'Edit Result' : 'Result Entry'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Enter term result marks. The system auto-calculates percentage, grade, and performance batch.
            <br />This workspace is teacher-owned: save drafts, declare results, and manage student grade cards without SuperAdmin changes.
          </p>
        </div>
      </div>

      {/* Step 1 — Select context */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Select Class, Exam &amp; Student</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Class Section</Label>
            <Select value={classSectionId} onValueChange={(v) => { setClassSectionId(v); setStudentId('') }}>
              <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.className} — {s.sectionName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Exam Session</Label>
            <Select value={examSessionId} onValueChange={setExamSessionId}>
              <SelectTrigger><SelectValue placeholder="Select exam" /></SelectTrigger>
              <SelectContent>
                {examSessions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name} — {e.term}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Student</Label>
            <Select value={studentId} onValueChange={setStudentId} disabled={!classSectionId}>
              <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.firstName} {s.lastName} — Roll {s.rollNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Existing result status banner */}
      {existingResult && (
        <div className={`rounded-xl border px-4 py-3 flex items-center justify-between gap-3 ${isDeclared ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
          <div className="flex items-center gap-2 text-sm font-medium">
            {isDeclared ? <CheckCircle2 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            {isDeclared ? 'Result declared — visible to student' : 'Draft saved — not yet visible to student'}
          </div>
          {existingResult.performanceBatch && (
            <Badge className={batchColor(existingResult.performanceBatch)}>
              <Award className="w-3 h-3 mr-1" />
              {existingResult.performanceBatch}
            </Badge>
          )}
        </div>
      )}

      {/* Step 2 — Subject Marks */}
      {studentId && classSectionId && examSessionId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">2. Enter Subject Marks</CardTitle>
              <CardDescription>Leave blank for “Input Decide Later” (IDL). Check Absent or N/A as needed.</CardDescription>
            </div>
            {computedPct > 0 && (
              <div className="text-right">
                <p className="text-xs text-slate-400">Live preview</p>
                <p className="text-2xl font-bold text-slate-900">{computedPct}%</p>
                <Badge className={`mt-1 text-xs ${batchColor(autoPerformanceBatch)}`}>
                  {autoPerformanceBatch}
                </Badge>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 px-1">
              <span className="col-span-3">Subject</span>
              <span className="col-span-2 text-center">Total</span>
              <span className="col-span-2 text-center">Obtained</span>
              <span className="col-span-1 text-center">Absent</span>
              <span className="col-span-1 text-center">N/A</span>
              <span className="col-span-3">Remarks</span>
            </div>
            <Separator />
            {subjectEntries.map((entry, idx) => (
              <div key={entry.subjectOfferingId} className="grid grid-cols-12 gap-2 items-center">
                <span className="col-span-3 text-sm font-medium text-slate-700 truncate">{entry.subjectName}</span>
                <div className="col-span-2">
                  <Input
                    type="number" min={1} className="h-8 text-center text-xs"
                    value={entry.totalMarks}
                    disabled={isDeclared}
                    onChange={(e) => updateEntry(idx, 'totalMarks', parseInt(e.target.value) || 100)}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    type="number" min={0} max={entry.totalMarks}
                    placeholder="IDL" className="h-8 text-center text-xs"
                    value={entry.obtainedMarks}
                    disabled={entry.isAbsent || entry.isNotApplicable || isDeclared}
                    onChange={(e) => updateEntry(idx, 'obtainedMarks', e.target.value)}
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  <Checkbox
                    checked={entry.isAbsent}
                    disabled={isDeclared}
                    onCheckedChange={(v) => updateEntry(idx, 'isAbsent', !!v)}
                  />
                </div>
                <div className="col-span-1 flex justify-center">
                  <Checkbox
                    checked={entry.isNotApplicable}
                    disabled={isDeclared}
                    onCheckedChange={(v) => updateEntry(idx, 'isNotApplicable', !!v)}
                  />
                </div>
                <div className="col-span-3">
                  <Input
                    placeholder="Optional remark" className="h-8 text-xs"
                    value={entry.remarks}
                    disabled={isDeclared}
                    onChange={(e) => updateEntry(idx, 'remarks', e.target.value)}
                  />
                </div>
              </div>
            ))}

            {/* Teacher Remarks */}
            <Separator className="my-2" />
            <div className="space-y-1.5">
              <Label className="text-xs">Overall Teacher Remarks</Label>
              <Textarea
                placeholder="Optional overall remarks for this student's result…"
                className="text-sm resize-none"
                rows={2}
                value={teacherRemarks}
                disabled={isDeclared}
                onChange={(e) => setTeacherRemarks(e.target.value)}
              />
            </div>

            {/* Actions */}
            {!isDeclared && (
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={() => saveResult.mutate()}
                  disabled={saveResult.isPending}
                  className="gap-2"
                >
                  {saveResult.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Draft
                </Button>
                {canDeclare && (
                  <AlertDialog open={showDeclareDialog} onOpenChange={setShowDeclareDialog}>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                        <CheckCircle2 className="w-4 h-4" />
                        Declare Result
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Declare this result?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Once declared, the result becomes visible to the student on their portal. Class positions will be recalculated and notifications sent. This action cannot be undone without SuperAdmin access.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => declareResult.mutate(existingResult?.id)}
                          disabled={declareResult.isPending}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          {declareResult.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                          Yes, Declare
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3 — Custom Fields */}
      {existingResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-500" />
              3. Custom Result Card Fields
            </CardTitle>
            <CardDescription>Add extra rows to the printed result card (e.g. “Co-curricular Activity”, “House Points”).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Existing custom fields */}
            {(existingResult.customFields as CustomField[] | null)?.map((f, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                <span className="text-sm font-medium text-slate-700 flex-1">{f.label}</span>
                <span className="text-sm text-slate-500">{f.value}</span>
                {!isDeclared && (
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-700"
                    onClick={() => deleteCustomField.mutate(i)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            ))}

            {/* Add new field */}
            {!isDeclared && (
              <div className="flex gap-2 pt-1">
                <Input
                  placeholder="Field label (e.g. Co-curricular)"
                  className="text-sm h-9"
                  value={newField.label}
                  onChange={(e) => setNewField((f) => ({ ...f, label: e.target.value }))}
                />
                <Input
                  placeholder="Value"
                  className="text-sm h-9 w-40"
                  value={newField.value}
                  onChange={(e) => setNewField((f) => ({ ...f, value: e.target.value }))}
                />
                <Button
                  variant="outline" size="sm" className="gap-1.5 h-9 px-3"
                  disabled={!newField.label || addCustomField.isPending}
                  onClick={() => addCustomField.mutate()}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  Add
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 4 — Performance Batch Override */}
      {existingResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-500" />
              4. Performance Batch
            </CardTitle>
            <CardDescription>
              Auto-assigned: <strong>{autoPerformanceBatch}</strong>.
              Override if required (audit-logged).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PERFORMANCE_BATCH_OPTIONS.map((batch) => (
                <Badge
                  key={batch}
                  className={`cursor-pointer px-3 py-1.5 text-xs ${existingResult.performanceBatch === batch ? batchColor(batch) + ' ring-2 ring-offset-1 ring-indigo-400' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  onClick={() => !isDeclared && setSelectedResultId(batch)}
                >
                  {batch}
                </Badge>
              ))}
            </div>
            {!isDeclared && selectedResultId && (
              <div className="flex gap-2 items-center pt-1">
                <Input
                  placeholder="Reason for override (required)"
                  className="text-sm h-9"
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                />
                <Button
                  size="sm" className="h-9 px-3"
                  disabled={!editReason || overrideBatch.isPending}
                  onClick={() => overrideBatch.mutate(selectedResultId)}
                >
                  {overrideBatch.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit2 className="w-4 h-4" />}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
