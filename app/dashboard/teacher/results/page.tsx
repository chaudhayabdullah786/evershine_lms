'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import { useSession } from 'next-auth/react'
import { notify } from '@/lib/notify'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { Loader2, CheckCircle2, Eye, Trash2, PenLine, Award, BarChart3 } from 'lucide-react'
import Link from 'next/link'
import { AccessDenied } from '@/components/AccessDenied'

type TermResult = {
  id: string
  declarationStatus: 'DRAFT' | 'DECLARED'
  overallPercentage: number | null
  grade: string | null
  performanceBatch: string | null
  classPosition: number | null
  teacherRemarks: string | null
  declaredAt: string | null
  student: { id: string; firstName: string; lastName: string; rollNumber: string }
  classSection: { className: string; sectionName: string }
}

type ClassSection = { id: string; className: string; sectionName: string }
type ExamSession = { id: string; name: string; term: string }

function batchColor(batch: string | null) {
  if (batch === 'Ever Shine') return 'bg-emerald-100 text-emerald-800'
  if (batch === 'Quaid') return 'bg-blue-100 text-blue-800'
  if (batch === 'Iqbal') return 'bg-amber-100 text-amber-800'
  return 'bg-rose-100 text-rose-800'
}

export default function TeacherResultsListPage() {
  const { data: session, status } = useSession()
  const qc = useQueryClient()

  const [classSectionId, setClassSectionId] = useState('')
  const [examSessionId, setExamSessionId] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  const { data: sections = [] } = useQuery<ClassSection[]>({
    queryKey: ['teacher-sections'],
    queryFn: () => fetchApi<ClassSection[]>('/api/teacher-portal/sections'),
    enabled: session?.user?.role === 'TEACHER',
  })

  const { data: examSessions = [] } = useQuery<ExamSession[]>({
    queryKey: ['exam-sessions'],
    queryFn: () => fetchApi<ExamSession[]>('/api/exam-sessions'),
  })

  const params = new URLSearchParams()
  if (classSectionId) params.set('classSectionId', classSectionId)
  if (examSessionId) params.set('examSessionId', examSessionId)
  if (filterStatus) params.set('status', filterStatus)

  const { data: resultsPage, isLoading } = useQuery({
    queryKey: ['teacher-results-list', classSectionId, examSessionId, filterStatus],
    queryFn: () =>
      fetchPaginatedApi<TermResult>(`/api/teacher-portal/results?${params.toString()}`),
    enabled: session?.user?.role === 'TEACHER',
  })

  const results = resultsPage?.data ?? []

  const declareResult = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/teacher-portal/results/${id}/declare`, { method: 'POST' }),
    onSuccess: () => {
      notify.success('Result declared — student notified')
      qc.invalidateQueries({ queryKey: ['teacher-results-list'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const deleteResult = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/teacher-portal/results/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      notify.success('Draft deleted')
      qc.invalidateQueries({ queryKey: ['teacher-results-list'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (status === 'loading') return null
  if (session?.user?.role !== 'TEACHER') return <AccessDenied title="Results" message="Teachers only." />

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-indigo-600" />
            Term Results
          </h1>
          <p className="text-sm text-slate-500 mt-1">View, manage, and declare student results.</p>
        </div>
        <Link href="/dashboard/teacher/grade-entry">
          <Button className="gap-2">
            <PenLine className="w-4 h-4" />
            Enter New Result
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5 grid gap-3 sm:grid-cols-3">
          <div>
            <Select value={classSectionId} onValueChange={(value) => setClassSectionId(value === '__all__' ? '' : value)}>
              <SelectTrigger><SelectValue placeholder="All sections" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sections</SelectItem>
                {sections.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.className} — {s.sectionName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={examSessionId} onValueChange={(value) => setExamSessionId(value === '__all__' ? '' : value)}>
              <SelectTrigger><SelectValue placeholder="All exam sessions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All sessions</SelectItem>
                {examSessions.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Select value={filterStatus} onValueChange={(value) => setFilterStatus(value === '__all__' ? '' : value)}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All statuses</SelectItem>
                <SelectItem value="DRAFT">Drafts only</SelectItem>
                <SelectItem value="DECLARED">Declared only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-sm">
              No results found. Adjust filters or enter a new result.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Section</TableHead>
                  <TableHead className="text-center">%</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                  <TableHead>Batch</TableHead>
                  <TableHead className="text-center">Rank</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{r.student.firstName} {r.student.lastName}</p>
                        <p className="text-xs text-slate-400">Roll {r.student.rollNumber}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.classSection.className}—{r.classSection.sectionName}
                    </TableCell>
                    <TableCell className="text-center font-semibold">
                      {r.overallPercentage != null ? `${Number(r.overallPercentage).toFixed(1)}%` : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.grade ? (
                        <Badge variant="outline" className="font-bold">{r.grade}</Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      {r.performanceBatch ? (
                        <Badge className={`text-xs ${batchColor(r.performanceBatch)}`}>
                          <Award className="w-3 h-3 mr-1" />
                          {r.performanceBatch}
                        </Badge>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {r.classPosition ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.declarationStatus === 'DECLARED' ? 'default' : 'secondary'}
                        className={r.declarationStatus === 'DECLARED' ? 'bg-emerald-100 text-emerald-800' : ''}>
                        {r.declarationStatus === 'DECLARED' ? (
                          <><CheckCircle2 className="w-3 h-3 mr-1" />Declared</>
                        ) : (
                          <><Eye className="w-3 h-3 mr-1" />Draft</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Declare action */}
                        {r.declarationStatus === 'DRAFT' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Declare
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Declare result for {r.student.firstName}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will publish the result to the student portal and dispatch a notification. Class positions will be recalculated.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => declareResult.mutate(r.id)}
                                  className="bg-emerald-600 hover:bg-emerald-700"
                                >
                                  Declare
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}

                        {/* Edit — back to entry page */}
                        <Link href={`/dashboard/teacher/grade-entry?resultId=${r.id}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <PenLine className="w-3.5 h-3.5" />
                          </Button>
                        </Link>

                        {/* Delete draft only */}
                        {r.declarationStatus === 'DRAFT' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-500 hover:text-rose-700">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This removes the draft result for {r.student.firstName} {r.student.lastName}. You can re-enter it later.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteResult.mutate(r.id)}
                                  className="bg-rose-600 hover:bg-rose-700"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
