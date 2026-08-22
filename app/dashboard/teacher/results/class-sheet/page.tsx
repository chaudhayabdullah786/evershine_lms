'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { fetchApi } from '@/lib/api-client'
import { notify } from '@/lib/notify'
import { AccessDenied } from '@/components/AccessDenied'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { CheckCircle2, ExternalLink, Loader2, Save, Table2 } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { DEFAULT_RESULT_CARD_CONFIG, parseResultCardConfig, type ResultCardConfig } from '@/lib/academic/result-card-config'

type ClassSection = { id: string; className: string; sectionName: string }
type ResultSession = { id: string; name: string; type: string; status: string }
type CellStatus = 'MARKS' | 'ABSENT' | 'NA'
type Cell = { value: string; status: CellStatus }
type CardConfig = ResultCardConfig
type Sheet = {
  resultSession: ResultSession
  section: { id: string; className: string; sectionName: string; shift: { name: string; code: string } | null }
  subjects: Array<{ id: string; name: string; code: string; totalMarks: number }>
  canDeclare: boolean
  resultCardConfig: CardConfig
  students: Array<{
    id: string
    firstName: string
    lastName: string
    fatherName: string
    registrationNumber: string | null
    rollNumber: string
    result: {
      id: string
      declarationStatus: 'DRAFT' | 'DECLARED'
      manualPosition: number | null
      subjectResults: Array<{
        subjectOfferingId: string
        totalMarks: number
        obtainedMarks: number | null
        isAbsent: boolean
        isNotApplicable: boolean
      }>
    } | null
  }>
}

function createCell(score?: Sheet['students'][number]['result']['subjectResults'][number]): Cell {
  if (!score) return { value: '', status: 'MARKS' }
  return {
    value: score.obtainedMarks === null ? '' : String(score.obtainedMarks),
    status: score.isAbsent ? 'ABSENT' : score.isNotApplicable ? 'NA' : 'MARKS',
  }
}

function ClassResultSheetInner() {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()
  const [classSectionId, setClassSectionId] = useState('')
  const [resultSessionId, setResultSessionId] = useState('')
  const [cells, setCells] = useState<Record<string, Record<string, Cell>>>({})
  const [cardConfig, setCardConfig] = useState<CardConfig>(DEFAULT_RESULT_CARD_CONFIG)
  const [manualPositions, setManualPositions] = useState<Record<string, string>>({})
  const initializedKey = useRef('')
  const configKey = useRef('')

  const { data: sections = [] } = useQuery<ClassSection[]>({
    queryKey: ['teacher-sections'],
    queryFn: () => fetchApi<ClassSection[]>('/api/teacher-portal/sections'),
    enabled: session?.user?.role === 'TEACHER',
  })
  const { data: resultSessions = [] } = useQuery<ResultSession[]>({
    queryKey: ['teacher-result-sessions'],
    queryFn: () => fetchApi<ResultSession[]>('/api/teacher-portal/result-sessions'),
    enabled: session?.user?.role === 'TEACHER',
  })
  const { data: sheet, isLoading: sheetLoading } = useQuery<Sheet>({
    queryKey: ['teacher-class-result-sheet', classSectionId, resultSessionId],
    queryFn: () => fetchApi<Sheet>(`/api/teacher-portal/results/class-sheet?classSectionId=${encodeURIComponent(classSectionId)}&resultSessionId=${encodeURIComponent(resultSessionId)}`),
    enabled: Boolean(classSectionId && resultSessionId),
  })

  const [subjectTotals, setSubjectTotals] = useState<Record<string, number>>({})
  const [customColumns, setCustomColumns] = useState<Array<{ id: string; label: string; totalMarks: number; type: 'MARKS' | 'TEXT' }>>([])
  const [customValues, setCustomValues] = useState<Record<string, Record<string, string>>>({})

  const contextKey = `${classSectionId}:${resultSessionId}`
  useEffect(() => {
    if (!sheet || initializedKey.current === contextKey) return
    initializedKey.current = contextKey
    const next: Record<string, Record<string, Cell>> = {}
    const initialTotals: Record<string, number> = {}
    for (const subject of sheet.subjects) {
      initialTotals[subject.id] = subject.totalMarks
    }
    setSubjectTotals(initialTotals)
    for (const student of sheet.students) {
      const scoreMap = new Map((student.result?.subjectResults ?? []).map((score) => [score.subjectOfferingId, score]))
      next[student.id] = Object.fromEntries(sheet.subjects.map((subject) => [subject.id, createCell(scoreMap.get(subject.id))]))
    }
    setCells(next)
    if (configKey.current !== contextKey) {
      configKey.current = contextKey
      setCardConfig(parseResultCardConfig(sheet.resultCardConfig))
      setManualPositions(Object.fromEntries(sheet.students.map((student) => [student.id, student.result?.manualPosition == null ? '' : String(student.result.manualPosition)])))
    }
  }, [contextKey, sheet])

  const saveCardConfig = useMutation({
    mutationFn: () => fetchApi(`/api/teacher-portal/result-card-config`, {
      method: 'PATCH',
      body: JSON.stringify({ classSectionId, examSessionId: resultSessionId, config: cardConfig }),
    }),
    onSuccess: () => {
      notify.success('Result-card display settings saved')
      queryClient.invalidateQueries({ queryKey: ['teacher-class-result-sheet', classSectionId, resultSessionId] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const saveDrafts = useMutation({
    mutationFn: () => {
      if (!sheet) throw new Error('Select a class section and result cycle first.')
      return fetchApi('/api/teacher-portal/results/class-sheet', {
        method: 'POST',
        body: JSON.stringify({
          classSectionId,
          resultSessionId,
          rows: sheet.students
            .filter((student) => student.result?.declarationStatus !== 'DECLARED')
            .map((student) => {
              const studentCustomFields = customColumns.map((col) => ({
                label: col.label,
              value: customValues[student.id]?.[col.id] ?? '',
            })).filter((f) => f.label.trim().length > 0)

            return {
              studentId: student.id,
              manualPosition: cardConfig.positionMode === 'MANUAL' && manualPositions[student.id]?.trim()
                ? Number(manualPositions[student.id])
                : null,
              customFields: studentCustomFields.length > 0 ? studentCustomFields : undefined,
              subjectResults: sheet.subjects.map((subject) => {
                const cell = cells[student.id]?.[subject.id] ?? { value: '', status: 'MARKS' as const }
                return {
                  subjectOfferingId: subject.id,
                  totalMarks: subjectTotals[subject.id] ?? subject.totalMarks,
                  obtainedMarks: cell.status === 'MARKS' && cell.value.trim() !== '' ? Number(cell.value) : null,
                  isAbsent: cell.status === 'ABSENT',
                  isNotApplicable: cell.status === 'NA',
                }
              }),
            }
          }),
        }),
      })
    },
    onSuccess: () => {
      notify.success('Class result drafts saved')
      queryClient.invalidateQueries({ queryKey: ['teacher-class-result-sheet', classSectionId, resultSessionId] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const saveAndDeclare = useMutation({
    mutationFn: async (studentId: string) => {
      if (!sheet) throw new Error('Select a class section and result cycle first.')
      const student = sheet.students.find(s => s.id === studentId)
      if (!student) throw new Error('Student not found.')

      const studentCustomFields = customColumns.map((col) => ({
        label: col.label,
        value: customValues[student.id]?.[col.id] ?? '',
      })).filter((f) => f.label.trim().length > 0)

      const row = {
        studentId: student.id,
        manualPosition: cardConfig.positionMode === 'MANUAL' && manualPositions[student.id]?.trim()
          ? Number(manualPositions[student.id])
          : null,
        customFields: studentCustomFields.length > 0 ? studentCustomFields : undefined,
        subjectResults: sheet.subjects.map((subject) => {
          const cell = cells[student.id]?.[subject.id] ?? { value: '', status: 'MARKS' as const }
          return {
            subjectOfferingId: subject.id,
            totalMarks: subjectTotals[subject.id] ?? subject.totalMarks,
            obtainedMarks: cell.status === 'MARKS' && cell.value.trim() !== '' ? Number(cell.value) : null,
            isAbsent: cell.status === 'ABSENT',
            isNotApplicable: cell.status === 'NA',
          }
        }),
      }

      const saveRes = await fetchApi<{ savedCount: number, results: Array<{ studentId: string, resultId: string }> }>('/api/teacher-portal/results/class-sheet', {
        method: 'POST',
        body: JSON.stringify({
          classSectionId,
          resultSessionId,
          rows: [row],
        }),
      })

      const savedResult = saveRes.results?.find(r => r.studentId === studentId)
      if (!savedResult) throw new Error('Failed to save draft.')

      await fetchApi(`/api/teacher-portal/results/${savedResult.resultId}/declare`, {
        method: 'POST',
      })
    },
    onSuccess: () => {
      notify.success('Result successfully saved and declared')
      queryClient.invalidateQueries({ queryKey: ['teacher-class-result-sheet', classSectionId, resultSessionId] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const declareClass = useMutation({
    mutationFn: () => fetchApi('/api/teacher-portal/results/class-sheet/declare', {
      method: 'POST',
      body: JSON.stringify({ classSectionId, resultSessionId }),
    }),
    onSuccess: () => {
      notify.success('Class result declared and published')
      queryClient.invalidateQueries({ queryKey: ['teacher-class-result-sheet', classSectionId, resultSessionId] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const undeclareResult = useMutation({
    mutationFn: (resultId: string) => fetchApi(`/api/teacher-portal/results/${resultId}/undeclare`, {
      method: 'POST',
    }),
    onSuccess: () => {
      notify.success('Result reverted to draft')
      queryClient.invalidateQueries({ queryKey: ['teacher-class-result-sheet', classSectionId, resultSessionId] })
    },
    onError: (error: Error) => notify.error(error.message),
  })

  const summary = useMemo(() => {
    const students = sheet?.students ?? []
    const saved = students.filter((student) => Boolean(student.result)).length
    const pending = students.reduce((count, student) => count + (sheet?.subjects ?? []).filter((subject) => {
      const cell = cells[student.id]?.[subject.id]
      return !cell || cell.status === 'MARKS' && cell.value.trim() === ''
    }).length, 0)
    return { saved, pending }
  }, [cells, sheet])

  if (status === 'loading') return null
  if (session?.user?.role !== 'TEACHER') return <AccessDenied title="Class Results" message="Teachers only." />

  const updateCell = (studentId: string, subjectId: string, patch: Partial<Cell>) => {
    setCells((current) => ({
      ...current,
      [studentId]: {
        ...current[studentId],
        [subjectId]: { ...(current[studentId]?.[subjectId] ?? { value: '', status: 'MARKS' as const }), ...patch },
      },
    }))
  }

  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Table2 className="h-7 w-7 text-indigo-600" />
            Class Result Workspace
          </h1>
          <p className="mt-1 text-sm text-slate-500">Review every active student and offered course for the active result cycle.</p>
        </div>
        <Link href="/dashboard/teacher/results">
          <Button variant="outline">Back to Results</Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Choose result cycle and section</CardTitle>
          <CardDescription>Formal exams remain in the Exams page. This screen is for the complete class report-card result.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Result Cycle</Label>
            <Select value={resultSessionId} onValueChange={(value) => { setResultSessionId(value); setClassSectionId(''); initializedKey.current = '' }}>
              <SelectTrigger><SelectValue placeholder="Select active result cycle" /></SelectTrigger>
              <SelectContent>
                {resultSessions.map((cycle) => <SelectItem key={cycle.id} value={cycle.id}>{cycle.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {resultSessions.length === 0 && <p className="text-xs text-amber-600">No active academic year is available for result entry.</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Class Section</Label>
            <Select value={classSectionId} onValueChange={(value) => { setClassSectionId(value); initializedKey.current = '' }} disabled={!resultSessionId}>
              <SelectTrigger><SelectValue placeholder="Select assigned section" /></SelectTrigger>
              <SelectContent>
                {sections.map((section) => <SelectItem key={section.id} value={section.id}>{section.className} — {section.sectionName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {sheet && (
        <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Configure the printed result card</CardTitle>
            <CardDescription>These choices control the student, guardian, and PDF result card. Internal IDs are never printed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="result-card-exam-title">Exam title on card</Label>
                <Input id="result-card-exam-title" value={cardConfig.examTitleOverride ?? ''} placeholder={sheet.resultSession.name} onChange={(event) => setCardConfig((current) => ({ ...current, examTitleOverride: event.target.value || null }))} />
                <p className="text-xs text-slate-500">Leave blank to use the published exam or result-cycle name.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="result-card-academy-name">Academy name on card</Label>
                <Input id="result-card-academy-name" value={cardConfig.academyNameOverride ?? ''} placeholder="Evershine Academy" onChange={(event) => setCardConfig((current) => ({ ...current, academyNameOverride: event.target.value || null }))} />
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-900">Show on the printed card</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {([
                  ['showStudentInfo', 'Student information'],
                  ['showSubjectNames', 'Subject names'],
                  ['showTotalMarks', 'Total marks'],
                  ['showObtainedMarks', 'Obtained marks'],
                  ['showPercentage', 'Percentage'],
                  ['showGrade', 'Grade'],
                  ['showResultStatus', 'Pass / fail status'],
                  ['showPerformanceBatch', 'Performance group'],
                  ['showTeacherRemarks', 'Teacher remarks'],
                  ['showCustomFields', 'Custom assessment fields'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                    <Checkbox checked={cardConfig[key]} onCheckedChange={(checked) => setCardConfig((current) => ({ ...current, [key]: checked }))} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Class position</p>
                  <p className="text-xs text-slate-500">Hidden by default. Only approved or teacher-entered positions are printed.</p>
                </div>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={cardConfig.showClassPosition} onCheckedChange={(checked) => setCardConfig((current) => ({ ...current, showClassPosition: checked, positionMode: checked ? (current.positionMode === 'HIDDEN' ? 'SYSTEM_APPROVED' : current.positionMode) : 'HIDDEN' }))} />
                  Show class position
                </label>
              </div>
              {cardConfig.showClassPosition && (
                <div className="mt-3 max-w-sm space-y-1.5">
                  <Label>Position source</Label>
                  <select className="h-9 w-full rounded-md border border-slate-300 bg-white px-3 text-sm" value={cardConfig.positionMode} onChange={(event) => setCardConfig((current) => ({ ...current, positionMode: event.target.value as CardConfig['positionMode'] }))}>
                    <option value="SYSTEM_APPROVED">Use system rank after teacher approval</option>
                    <option value="MANUAL">Teacher enters each student&apos;s position</option>
                  </select>
                </div>
              )}
            </div>
            <Button className="gap-2" onClick={() => saveCardConfig.mutate()} disabled={saveCardConfig.isPending}>
              {saveCardConfig.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save card settings
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">3. Enter class marks &amp; custom evaluation fields</CardTitle>
              <CardDescription>{sheet.section.className} — {sheet.section.sectionName} · {sheet.students.length} active students · {sheet.subjects.length} courses</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                onClick={() => {
                  const colId = `custom_marks_${Date.now()}`
                  const label = prompt('Enter custom marks column name (e.g. Oral Exam, Practical, Assignment):')
                  if (!label?.trim()) return
                  const maxMarks = parseInt(prompt('Enter total marks for this custom column:', '50') || '50') || 50
                  setCustomColumns((prev) => [...prev, { id: colId, label: label.trim(), totalMarks: maxMarks, type: 'MARKS' }])
                }}
              >
                + Add Marks Column
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1 border-slate-300 text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  const colId = `custom_field_${Date.now()}`
                  const label = prompt('Enter custom field column name (e.g. Conduct, Discipline, Remarks):')
                  if (!label?.trim()) return
                  setCustomColumns((prev) => [...prev, { id: colId, label: label.trim(), totalMarks: 0, type: 'TEXT' }])
                }}
              >
                + Add Custom Field
              </Button>
              <Badge variant="secondary">Saved: {summary.saved}/{sheet.students.length}</Badge>
              <Badge className={summary.pending > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}>Pending cells: {summary.pending}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {sheetLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : sheet.students.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">No active students are enrolled in this section.</p>
            ) : sheet.subjects.length === 0 && customColumns.length === 0 ? (
              <p className="py-10 text-center text-sm text-amber-700">No offered courses are assigned for this section. Ask administration to configure the section subjects first.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3">Student</th>
                      {cardConfig.showClassPosition && cardConfig.positionMode === 'MANUAL' && <th className="min-w-[120px] px-3 py-3">Position</th>}
                      {sheet.subjects.map((subject) => (
                        <th key={subject.id} className="min-w-[160px] px-3 py-3">
                          <div className="flex items-center justify-between gap-1 font-semibold text-slate-800">
                            <span>{subject.name}</span>
                            <span className="text-[10px] text-slate-400">({subject.code})</span>
                          </div>
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-[10px] text-slate-500 font-normal">Total:</span>
                            <input
                              type="number"
                              min={1}
                              className="w-14 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-center text-xs font-bold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none"
                              value={subjectTotals[subject.id] ?? subject.totalMarks}
                              onChange={(e) => {
                                const val = parseInt(e.target.value) || 1
                                setSubjectTotals((prev) => ({ ...prev, [subject.id]: Math.max(1, val) }))
                              }}
                              title="Click to edit custom subject total marks for all students"
                            />
                          </div>
                        </th>
                      ))}
                      {customColumns.map((col) => (
                        <th key={col.id} className="min-w-[160px] px-3 py-3 bg-indigo-50/40">
                          <div className="flex items-center justify-between font-semibold text-indigo-900">
                            <span>{col.label}</span>
                            <button
                              className="text-xs text-rose-500 hover:text-rose-700 ml-1 font-bold"
                              title="Remove custom column"
                              onClick={() => setCustomColumns((prev) => prev.filter((c) => c.id !== col.id))}
                            >
                              ×
                            </button>
                          </div>
                          {col.type === 'MARKS' && (
                            <span className="block normal-case text-[10px] font-normal text-indigo-700">Custom Marks · /{col.totalMarks}</span>
                          )}
                          {col.type === 'TEXT' && (
                            <span className="block normal-case text-[10px] font-normal text-slate-500">Custom Evaluation</span>
                          )}
                        </th>
                      ))}
                      <th className="px-3 py-3">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sheet.students.map((student) => {
                      const declared = student.result?.declarationStatus === 'DECLARED'
                      return (
                        <tr key={student.id} className="align-top">
                          <td className="sticky left-0 z-[1] bg-white px-3 py-3">
                            <p className="font-medium text-slate-900">{student.firstName} {student.lastName}</p>
                            <p className="text-xs text-slate-500">Roll {student.rollNumber}</p>
                          </td>
                          {cardConfig.showClassPosition && cardConfig.positionMode === 'MANUAL' && <td className="px-3 py-3">
                            <Input type="number" min={1} max={sheet.students.length} placeholder="—" value={manualPositions[student.id] ?? ''} disabled={declared} onChange={(event) => setManualPositions((current) => ({ ...current, [student.id]: event.target.value }))} className="h-9" aria-label={`${student.firstName} ${student.lastName} position`} />
                          </td>}
                          {sheet.subjects.map((subject) => {
                            const cell = cells[student.id]?.[subject.id] ?? { value: '', status: 'MARKS' as const }
                            const currentTotal = subjectTotals[subject.id] ?? subject.totalMarks
                            return (
                              <td key={subject.id} className="space-y-1 px-3 py-3">
                                <Input
                                  type="number" min={0} max={currentTotal} placeholder={cell.status === 'MARKS' ? 'Pending' : cell.status}
                                  value={cell.value} disabled={declared || cell.status !== 'MARKS'}
                                  onChange={(event) => updateCell(student.id, subject.id, { value: event.target.value })}
                                  className="h-9"
                                />
                                <select
                                  aria-label={`${student.firstName} ${student.lastName} ${subject.name} status`}
                                  className="h-7 w-full rounded border border-slate-200 bg-white px-1 text-[11px]"
                                  value={cell.status} disabled={declared}
                                  onChange={(event) => updateCell(student.id, subject.id, { status: event.target.value as CellStatus, value: event.target.value === 'MARKS' ? cell.value : '' })}
                                >
                                  <option value="MARKS">Marks</option><option value="ABSENT">Absent</option><option value="NA">N/A</option>
                                </select>
                              </td>
                            )
                          })}
                          {customColumns.map((col) => (
                            <td key={col.id} className="px-3 py-3 bg-indigo-50/20">
                              <Input
                                type={col.type === 'MARKS' ? 'number' : 'text'}
                                min={0}
                                max={col.type === 'MARKS' ? col.totalMarks : undefined}
                                placeholder={col.type === 'MARKS' ? `Max ${col.totalMarks}` : 'Enter value...'}
                                value={customValues[student.id]?.[col.id] ?? ''}
                                disabled={declared}
                                onChange={(e) => {
                                  const val = e.target.value
                                  setCustomValues((prev) => ({
                                    ...prev,
                                    [student.id]: {
                                      ...(prev[student.id] ?? {}),
                                      [col.id]: val,
                                    },
                                  }))
                                }}
                                className="h-9 text-xs"
                              />
                            </td>
                          ))}
                          <td className="px-3 py-3 w-48 shrink-0">
                            {declared ? (
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Declared
                                </span>
                                <button
                                  onClick={() => {
                                    if (confirm('Are you sure you want to undeclare this result? It will be hidden from the student.')) {
                                      undeclareResult.mutate(student.result!.id)
                                    }
                                  }}
                                  disabled={undeclareResult.isPending}
                                  className="text-[10px] font-medium text-rose-500 hover:text-rose-700 hover:underline disabled:opacity-50"
                                >
                                  {undeclareResult.isPending && undeclareResult.variables === student.result?.id ? '...' : 'Undo'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-col gap-1.5">
                                {student.result?.id ? (
                                  <Link className="inline-flex w-fit items-center gap-1 text-xs font-medium text-indigo-600 hover:underline" href={`/dashboard/teacher/grade-entry?resultId=${student.result.id}`}>
                                    <ExternalLink className="h-3 w-3" /> Details / Edit Card
                                  </Link>
                                ) : (
                                  <span className="text-xs text-slate-400">Save first for details</span>
                                )}
                                <button 
                                  onClick={() => saveAndDeclare.mutate(student.id)} 
                                  disabled={saveAndDeclare.isPending}
                                  className="inline-flex w-fit items-center gap-1 text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50"
                                  title="Save current marks for this student and immediately declare the result"
                                >
                                  {saveAndDeclare.isPending && saveAndDeclare.variables === student.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                  Save &amp; Declare
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-3">
              <Button className="gap-2" onClick={() => saveDrafts.mutate()} disabled={saveDrafts.isPending || sheet.students.length === 0 || sheet.subjects.length === 0 || sheet.students.every((student) => student.result?.declarationStatus === 'DECLARED')}>
                {saveDrafts.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Drafts
              </Button>
              {!sheet.canDeclare && <p className="self-center text-xs text-slate-500">Only the assigned class teacher can declare the complete class result.</p>}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="gap-2 border-emerald-300 text-emerald-700" disabled={!sheet.canDeclare || declareClass.isPending || summary.pending > 0 || summary.saved !== sheet.students.length || sheet.students.some((student) => student.result?.declarationStatus === 'DECLARED')}>
                    <CheckCircle2 className="h-4 w-4" /> Declare Class Result
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader><AlertDialogTitle>Publish this class result?</AlertDialogTitle><AlertDialogDescription>All students in this section will see their declared result. Drafts become locked; custom details can only be changed after an authorized reopen.</AlertDialogDescription></AlertDialogHeader>
                  <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => declareClass.mutate()} className="bg-emerald-600 hover:bg-emerald-700">Declare and Publish</AlertDialogAction></AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
        </div>
      )}
    </div>
  )
}

export default function TeacherClassResultSheetPage() {
  return <ClassResultSheetInner />
}
