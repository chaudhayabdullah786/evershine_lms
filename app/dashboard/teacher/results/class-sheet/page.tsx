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

type ClassSection = { id: string; className: string; sectionName: string }
type ResultSession = { id: string; name: string; type: string; status: string }
type CellStatus = 'MARKS' | 'ABSENT' | 'NA'
type Cell = { value: string; status: CellStatus }
type Sheet = {
  resultSession: ResultSession
  section: { id: string; className: string; sectionName: string; shift: { name: string; code: string } | null }
  subjects: Array<{ id: string; name: string; code: string; totalMarks: number }>
  canDeclare: boolean
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
  const initializedKey = useRef('')

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

  const contextKey = `${classSectionId}:${resultSessionId}`
  useEffect(() => {
    if (!sheet || initializedKey.current === contextKey) return
    initializedKey.current = contextKey
    const next: Record<string, Record<string, Cell>> = {}
    for (const student of sheet.students) {
      const scoreMap = new Map((student.result?.subjectResults ?? []).map((score) => [score.subjectOfferingId, score]))
      next[student.id] = Object.fromEntries(sheet.subjects.map((subject) => [subject.id, createCell(scoreMap.get(subject.id))]))
    }
    setCells(next)
  }, [contextKey, sheet])

  const saveDrafts = useMutation({
    mutationFn: () => {
      if (!sheet) throw new Error('Select a class section and result cycle first.')
      return fetchApi('/api/teacher-portal/results/class-sheet', {
        method: 'POST',
        body: JSON.stringify({
          classSectionId,
          resultSessionId,
          rows: sheet.students.map((student) => ({
            studentId: student.id,
            subjectResults: sheet.subjects.map((subject) => {
              const cell = cells[student.id]?.[subject.id] ?? { value: '', status: 'MARKS' as const }
              return {
                subjectOfferingId: subject.id,
                totalMarks: subject.totalMarks,
                obtainedMarks: cell.status === 'MARKS' && cell.value.trim() !== '' ? Number(cell.value) : null,
                isAbsent: cell.status === 'ABSENT',
                isNotApplicable: cell.status === 'NA',
              }
            }),
          })),
        }),
      })
    },
    onSuccess: () => {
      notify.success('Class result drafts saved')
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
        <Card>
          <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-base">2. Enter class marks</CardTitle>
              <CardDescription>{sheet.section.className} — {sheet.section.sectionName} · {sheet.students.length} active students · {sheet.subjects.length} courses</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="secondary">Saved: {summary.saved}/{sheet.students.length}</Badge>
              <Badge className={summary.pending > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}>Pending cells: {summary.pending}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {sheetLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
            ) : sheet.students.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">No active students are enrolled in this section.</p>
            ) : sheet.subjects.length === 0 ? (
              <p className="py-10 text-center text-sm text-amber-700">No offered courses are assigned for this section. Ask administration to configure the section subjects first.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full min-w-[900px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="sticky left-0 z-10 bg-slate-50 px-3 py-3">Student</th>
                      {sheet.subjects.map((subject) => <th key={subject.id} className="min-w-[150px] px-3 py-3">{subject.name}<span className="block normal-case text-[10px] font-normal">{subject.code} · /{subject.totalMarks}</span></th>)}
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
                          {sheet.subjects.map((subject) => {
                            const cell = cells[student.id]?.[subject.id] ?? { value: '', status: 'MARKS' as const }
                            return (
                              <td key={subject.id} className="space-y-1 px-3 py-3">
                                <Input
                                  type="number" min={0} max={subject.totalMarks} placeholder={cell.status === 'MARKS' ? 'Pending' : cell.status}
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
                          <td className="px-3 py-3">
                            {student.result?.id ? <Link className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline" href={`/dashboard/teacher/grade-entry?resultId=${student.result.id}`}><ExternalLink className="h-3 w-3" />Details</Link> : <span className="text-xs text-slate-400">Save first</span>}
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
      )}
    </div>
  )
}

export default function TeacherClassResultSheetPage() {
  return <ClassResultSheetInner />
}
