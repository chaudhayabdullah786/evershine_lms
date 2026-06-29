'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AcademicScopeFilters } from '@/components/academic/AcademicScopeFilters'
import { useAcademicHierarchy } from '@/hooks/useAcademicHierarchy'
import type { AcademicScopeState } from '@/lib/academic/types'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  BarChart2, Medal, TrendingUp, Plus, Pencil, Trash2, RefreshCw, Download,
  ClipboardList, CheckCircle, XCircle, Save,
} from 'lucide-react'
import { notify } from '@/lib/notify'
import { useSession } from 'next-auth/react'
import { isAcademicEnginePrimary } from '@/lib/academic/config'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Exam {
  id: string
  name: string
  totalMarks: number
  classId: string
  class: { name: string }
}

interface ResultRow {
  id: string
  totalMarks: number
  obtainedMarks: number
  grade: string
  percentage: number
  status: string
  student: { id: string; firstName: string; lastName: string; registrationNumber: string }
  exam: { id: string; name: string; totalMarks: number }
  subject: { name: string }
}

interface Student {
  id: string
  firstName: string
  lastName: string
  registrationNumber: string
  rollNumber?: string
}

// ─── Grade helpers ─────────────────────────────────────────────────────────────

const GRADE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-800',
  'A':  'bg-green-100 text-green-700',
  'B+': 'bg-blue-100 text-blue-700',
  'B':  'bg-blue-50 text-blue-600',
  'C':  'bg-yellow-100 text-yellow-700',
  'D':  'bg-orange-100 text-orange-700',
  'F':  'bg-red-100 text-red-700',
}

function PctBar({ pct }: { pct: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-gray-100 rounded-full h-1.5 flex-shrink-0">
        <div
          className={`h-1.5 rounded-full ${pct >= 80 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500'}`}
          style={{ width: `${Math.min(100, pct)}%` }}
        />
      </div>
      <span className="text-sm tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  )
}

// ─── Enter Results Dialog ──────────────────────────────────────────────────────

interface EntryRow {
  studentId: string
  firstName: string
  lastName: string
  registrationNumber: string
  obtainedMarks: string
  totalMarks: string
}

function EnterResultsDialog({
  exam,
  open,
  onClose,
  onSaved,
  isTeacher = false,
}: {
  exam: Exam | null
  open: boolean
  onClose: () => void
  onSaved: () => void
  isTeacher?: boolean
}) {
  const [rows, setRows] = useState<EntryRow[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const loadStudents = useCallback(async () => {
    if (!exam) return
    setLoading(true)
    try {
      // Fetch existing results first
      const existing = await fetchPaginatedApi<ResultRow>(`/api/results?examId=${exam.id}&limit=200`)
      if (existing.data.length > 0) {
        // Pre-populate from existing results
        const seen = new Set<string>()
        const populated: EntryRow[] = []
        existing.data.forEach((r) => {
          if (!seen.has(r.student.registrationNumber)) {
            seen.add(r.student.registrationNumber)
            populated.push({
              studentId: r.student.id,
              firstName: r.student.firstName,
              lastName: r.student.lastName,
              registrationNumber: r.student.registrationNumber,
              obtainedMarks: String(r.obtainedMarks),
              totalMarks: String(r.totalMarks),
            })
          }
        })
        setRows(populated)
      }
      setLoaded(true)
    } catch (err: any) {
      notify.error('Failed to load students', { description: err.message })
    } finally {
      setLoading(false)
    }
  }, [exam])

  const loadClassStudents = useCallback(async () => {
    if (!exam) return
    setLoading(true)
    try {
      const url = isTeacher
        ? `/api/teacher-portal/my-students?limit=200&classId=${exam.classId}`
        : `/api/students?limit=200&isActive=true`
      const data = await fetchApi<any>(url)
      const studentList = Array.isArray(data) ? data : (data?.data ?? [])
      
      setRows(
        (studentList ?? []).map((s: any) => ({
          studentId: s.id,
          firstName: s.firstName,
          lastName: s.lastName,
          registrationNumber: s.registrationNumber,
          obtainedMarks: '',
          totalMarks: String(exam.totalMarks),
        }))
      )
      setLoaded(true)
    } catch (err: any) {
      notify.error('Failed to load students', { description: err.message })
    } finally {
      setLoading(false)
    }
  }, [exam, isTeacher])

  const updateRow = (idx: number, field: 'obtainedMarks' | 'totalMarks', val: string) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, [field]: val } : r)))
  }

  const handleSave = async () => {
    if (!exam) return
    const filled = rows.filter((r) => r.obtainedMarks !== '' && r.studentId)
    if (filled.length === 0) {
      notify.error('Enter marks for at least one student')
      return
    }
    for (const r of filled) {
      const obt = parseInt(r.obtainedMarks)
      const tot = parseInt(r.totalMarks)
      if (isNaN(obt) || isNaN(tot) || obt < 0 || tot < 1) {
        notify.error(`Invalid marks for ${r.firstName} ${r.lastName}`)
        return
      }
      if (obt > tot) {
        notify.error(`Obtained marks exceed total for ${r.firstName} ${r.lastName}`)
        return
      }
    }
    setSaving(true)
    try {
      await fetchApi('/api/results', {
        method: 'POST',
        body: JSON.stringify({
          examId: exam.id,
          results: filled.map((r) => ({
            studentId: r.studentId,
            obtainedMarks: parseInt(r.obtainedMarks),
            totalMarks: parseInt(r.totalMarks),
          })),
        }),
      })
      notify.success(`Results saved for ${filled.length} students`)
      onSaved()
      onClose()
    } catch (err: any) {
      notify.error('Failed to save results', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Enter Results — {exam?.name}</DialogTitle>
          <DialogDescription>
            {exam ? `${exam.class.name} · Total Marks: ${exam.totalMarks}` : 'Loading exam details...'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-3">
          <Button size="sm" variant="outline" onClick={loadStudents} disabled={loading}>
            {loading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
            Load Existing Results
          </Button>
          <Button size="sm" variant="outline" onClick={loadClassStudents} disabled={loading}>
            Load All Students
          </Button>
        </div>

        {loaded && (
          <div className="flex-1 overflow-y-auto border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Student</TableHead>
                  <TableHead>Reg. No.</TableHead>
                  <TableHead className="w-28">Obtained</TableHead>
                  <TableHead className="w-28">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium text-sm">
                      {r.firstName} {r.lastName}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-500">{r.registrationNumber}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={parseInt(r.totalMarks) || undefined}
                        className="h-7 text-sm"
                        placeholder="—"
                        value={r.obtainedMarks}
                        onChange={(e) => updateRow(idx, 'obtainedMarks', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        className="h-7 text-sm"
                        value={r.totalMarks}
                        onChange={(e) => updateRow(idx, 'totalMarks', e.target.value)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loaded && (
          <div className="flex-1 flex items-center justify-center text-gray-400 border rounded-lg py-16">
            <div className="text-center">
              <ClipboardList className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm">Click one of the Load buttons above to begin entering results.</p>
            </div>
          </div>
        )}

        <DialogFooter className="mt-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !loaded}>
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Saving…</> : <><Save className="w-4 h-4 mr-2" />Save Results</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Edit Result Dialog ────────────────────────────────────────────────────────

function EditResultDialog({
  result,
  onClose,
  onSaved,
}: {
  result: ResultRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [obtainedMarks, setObtainedMarks] = useState(String(result?.obtainedMarks ?? ''))
  const [totalMarks, setTotalMarks] = useState(String(result?.totalMarks ?? ''))
  const [saving, setSaving] = useState(false)

  if (!result) return null

  const handleSave = async () => {
    const obt = parseInt(obtainedMarks)
    const tot = parseInt(totalMarks)
    if (isNaN(obt) || isNaN(tot)) { notify.error('Invalid marks'); return }
    if (obt > tot) { notify.error('Obtained marks exceed total'); return }
    setSaving(true)
    try {
      // result.id might be composite e.g. "resultId-detailId" — use the root id
      const rootId = result.id.includes('-') ? result.id.split('-')[0] : result.id
      await fetchApi(`/api/results/${rootId}`, {
        method: 'PATCH',
        body: JSON.stringify({ obtainedMarks: obt, totalMarks: tot }),
      })
      notify.success('Result updated')
      onSaved()
      onClose()
    } catch (err: any) {
      notify.error('Failed to update', { description: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Result</DialogTitle>
          <DialogDescription>
            {result.student.firstName} {result.student.lastName} · {result.exam.name}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Obtained Marks</Label>
            <Input
              type="number" min={0}
              value={obtainedMarks}
              onChange={(e) => setObtainedMarks(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Total Marks</Label>
            <Input
              type="number" min={1}
              value={totalMarks}
              onChange={(e) => setTotalMarks(e.target.value)}
            />
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            Grade and percentage will be auto-calculated on save.
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Saving…</> : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const defaultResultsScope = (): AcademicScopeState => ({
  campusId: '',
  batchId: '',
  shift: 'MORNING',
  classId: '',
  houseId: '',
})

export default function ResultsPage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const role = session?.user?.role as string | undefined
  // Only Admins and Teachers may mutate results; Super Admins are view-only.
  const canManage = role === 'ADMIN' || role === 'TEACHER'
  const queryClient = useQueryClient()

  useEffect(() => {
    if (sessionStatus !== 'authenticated' || !isAcademicEnginePrimary()) return
    if (role === 'STUDENT') router.replace('/dashboard/academics')
    else if (role === 'PARENT' || role === 'GUARDIAN') router.replace('/dashboard/my-children')
  }, [sessionStatus, role, router])

  const [scope, setScope] = useState<AcademicScopeState>(defaultResultsScope)
  const hierarchy = useAcademicHierarchy(scope, setScope, {
    mode: role === 'TEACHER' ? 'teacher' : 'admin',
    loadCampuses: role !== 'TEACHER',
    enabled: !!session?.user,
  })

  const [selectedExamId, setSelectedExamId] = useState('')
  const [enterOpen, setEnterOpen] = useState(false)
  const [editResult, setEditResult] = useState<ResultRow | null>(null)
  const [deleteResult, setDeleteResult] = useState<ResultRow | null>(null)
  const [deleting, setDeleting] = useState(false)

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/results/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          examId: selectedExamId,
          format: 'excel',
        }),
      })
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `results_${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    },
    onSuccess: () => notify.success('Results exported successfully'),
    onError: (e: Error) => notify.error(e.message),
  })

  // Fetch exams
  const { data: examsData } = useQuery({
    queryKey: ['exams-list'],
    queryFn: () => fetchApi<Exam[]>('/api/exams'),
  })
  const exams = examsData ?? []

  const filteredExams = useMemo(() => {
    if (!scope.classId) return exams
    return exams.filter((e) => e.classId === scope.classId)
  }, [exams, scope.classId])

  const selectedExam = exams.find((e) => e.id === selectedExamId) ?? null

  // Fetch results for selected exam
  const { data: resultsData, isLoading } = useQuery({
    queryKey: ['results', selectedExamId],
    queryFn: () => fetchPaginatedApi<ResultRow>(`/api/results?examId=${selectedExamId}&limit=200`),
    enabled: !!selectedExamId,
  })
  const results = resultsData?.data ?? []

  // Deduplicate by student (take overall row or first subject)
  const studentResults = results.reduce<ResultRow[]>((acc, r) => {
    const exists = acc.find((x) => x.student.registrationNumber === r.student.registrationNumber)
    if (!exists) acc.push(r)
    return acc
  }, [])

  // Stats
  const avg = studentResults.length > 0
    ? studentResults.reduce((s, r) => s + r.percentage, 0) / studentResults.length
    : 0
  const passed = studentResults.filter((r) => r.status === 'PASS').length
  const highest = studentResults.length > 0 ? Math.max(...studentResults.map((r) => r.percentage)) : 0

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['results', selectedExamId] })

  const handleDelete = async () => {
    if (!deleteResult) return
    setDeleting(true)
    try {
      const rootId = deleteResult.id.includes('-') ? deleteResult.id.split('-')[0] : deleteResult.id
      await fetchApi(`/api/results/${rootId}`, { method: 'DELETE' })
      notify.success('Result deleted')
      setDeleteResult(null)
      invalidate()
    } catch (err: any) {
      notify.error('Failed to delete', { description: err.message })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Results</h1>
          <p className="text-sm text-gray-500">View and manage student examination results.</p>
        </div>
        {canManage && selectedExamId && (
          <div className="flex gap-2">
            <Button className="gap-2" onClick={() => setEnterOpen(true)}>
              <Plus className="w-4 h-4" /> Enter / Update Results
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => exportMutation.mutate()} disabled={exportMutation.isPending}>
              <Download className="w-4 h-4" /> Export
            </Button>
          </div>
        )}
      </div>

      {/* Scope + exam selector */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-4">
        <AcademicScopeFilters
          hierarchy={hierarchy}
          showCampusBatch={role !== 'TEACHER'}
          showHouse
          showShift
          showClass
          requireCampusForClass={role !== 'TEACHER'}
          onScopeChange={() => setSelectedExamId('')}
        />
        <div className="max-w-lg border-t pt-4">
          <Label className="mb-2 block">Select Examination</Label>
          <Select value={selectedExamId} onValueChange={setSelectedExamId}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an exam to view results…" />
            </SelectTrigger>
            <SelectContent>
              {filteredExams.length === 0 ? (
                <SelectItem value="__none" disabled>
                  {scope.classId ? 'No exams for this class' : 'Select a class or pick from all exams below'}
                </SelectItem>
              ) : null}
              {(scope.classId ? filteredExams : exams).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} — {e.class.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {selectedExamId && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><BarChart2 className="w-5 h-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Class Average</p>
                <p className="text-2xl font-bold text-gray-900">{avg.toFixed(1)}%</p>
              </div>
            </div>
            <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg"><TrendingUp className="w-5 h-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Pass Rate</p>
                <p className="text-2xl font-bold text-gray-900">
                  {studentResults.length > 0 ? `${((passed / studentResults.length) * 100).toFixed(0)}%` : '—'}
                </p>
              </div>
            </div>
            <div className="bg-white rounded-xl border p-4 flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg"><Medal className="w-5 h-5 text-yellow-600" /></div>
              <div>
                <p className="text-xs text-gray-500">Highest Score</p>
                <p className="text-2xl font-bold text-gray-900">{highest.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Results table */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50">
                    <TableHead className="w-8">#</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Obtained</TableHead>
                    <TableHead>Percentage</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    {canManage && <TableHead className="w-24">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: canManage ? 8 : 7 }).map((__, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : studentResults.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={canManage ? 8 : 7} className="h-32 text-center text-gray-400">
                        No results recorded for this examination yet.
                        {canManage && (
                          <Button
                            variant="link"
                            className="ml-2 text-blue-600 p-0 h-auto"
                            onClick={() => setEnterOpen(true)}
                          >
                            Enter results now →
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ) : (
                    studentResults.map((r, idx) => (
                      <TableRow key={r.id} className={`hover:bg-gray-50/50 ${r.status === 'FAIL' ? 'bg-red-50/20' : ''}`}>
                        <TableCell className="text-gray-400 text-sm">{idx + 1}</TableCell>
                        <TableCell>
                          <p className="font-medium text-sm">{r.student.firstName} {r.student.lastName}</p>
                          <p className="text-xs text-gray-400 font-mono">{r.student.registrationNumber}</p>
                        </TableCell>
                        <TableCell className="text-sm">{r.totalMarks}</TableCell>
                        <TableCell className="text-sm font-medium">{r.obtainedMarks}</TableCell>
                        <TableCell><PctBar pct={r.percentage} /></TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded font-bold ${GRADE_COLORS[r.grade] ?? 'bg-gray-100 text-gray-600'}`}>
                            {r.grade}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className={`flex items-center gap-1 text-xs font-medium ${r.status === 'PASS' ? 'text-green-700' : 'text-red-700'}`}>
                            {r.status === 'PASS'
                              ? <CheckCircle className="w-3.5 h-3.5" />
                              : <XCircle className="w-3.5 h-3.5" />}
                            {r.status}
                          </span>
                        </TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-amber-600 hover:bg-amber-50"
                                onClick={() => setEditResult(r)}
                                title="Edit result"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="h-7 w-7 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => setDeleteResult(r)}
                                title="Delete result"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </>
      )}

      {!selectedExamId && (
        <div className="bg-white border rounded-xl p-16 text-center text-gray-400">
          <BarChart2 className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">Select an examination to view results</p>
        </div>
      )}

      {/* Dialogs */}
      <EnterResultsDialog
        exam={selectedExam}
        open={enterOpen}
        onClose={() => setEnterOpen(false)}
        onSaved={invalidate}
        isTeacher={role === 'TEACHER'}
      />
      <EditResultDialog
        result={editResult}
        onClose={() => setEditResult(null)}
        onSaved={invalidate}
      />

      {/* Delete Confirmation */}
      <Dialog open={!!deleteResult} onOpenChange={(o) => !o && setDeleteResult(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Result</DialogTitle>
            <DialogDescription>
              Delete result for <strong>{deleteResult?.student.firstName} {deleteResult?.student.lastName}</strong>?
              This cannot be undone but results can be re-entered.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteResult(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" />Deleting…</> : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
