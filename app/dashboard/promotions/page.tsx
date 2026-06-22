'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AccessDenied } from '@/components/AccessDenied'
import { notify } from '@/lib/notify'
import { GraduationCap, Lock, RefreshCw, Loader2, Wand2, CheckSquare } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

type WizardRow = {
  studentId: string
  rollNumber: string
  firstName: string
  lastName: string
  overallPercentage: number | null
  isPassing: boolean
  suggestedStatus: 'PROMOTED' | 'RETAINED' | 'GRADUATED'
  suggestedToSectionId: string | null
  suggestedToSectionLabel: string | null
  status: 'PROMOTED' | 'RETAINED' | 'GRADUATED'
  toClassSectionId: string | null
  included: boolean
}

export default function PromotionsPage() {
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const deepStudentId = searchParams.get('studentId')
  const deepFromYearId = searchParams.get('fromYearId')
  const deepFromSectionId = searchParams.get('fromSectionId')

  const qc = useQueryClient()
  const role = session?.user?.role

  const [fromYearId, setFromYearId] = useState('')
  const [toYearId, setToYearId] = useState('')
  const [fromSectionId, setFromSectionId] = useState('')
  const [toSectionId, setToSectionId] = useState('')
  const [promotionStatus, setPromotionStatus] = useState<'PROMOTED' | 'RETAINED' | 'GRADUATED'>('PROMOTED')
  const [selectedStudents, setSelectedStudents] = useState<string[]>([])
  const [wizardRows, setWizardRows] = useState<WizardRow[]>([])
  const [wizardLoaded, setWizardLoaded] = useState(false)
  const [passThreshold, setPassThreshold] = useState('33')
  const [rolloverForm, setRolloverForm] = useState({
    newYearName: '2026-2027',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
  })

  const { data: years } = useQuery({
    queryKey: ['academic-years'],
    queryFn: () => fetchApi<any[]>('/api/academic-years'),
    enabled: role === 'SUPER_ADMIN' || role === 'ADMIN',
  })

  const { data: sections } = useQuery({
    queryKey: ['class-sections'],
    queryFn: () => fetchApi<any[]>('/api/class-sections'),
    enabled: role === 'SUPER_ADMIN' || role === 'ADMIN',
  })

  const { data: eligible } = useQuery({
    queryKey: ['promotion-eligible', fromSectionId, fromYearId],
    queryFn: () =>
      fetchApi<Array<{ id: string; studentId: string; rollNumber: string; student: { firstName: string; lastName: string } }>>(
        `/api/promotions?classSectionId=${fromSectionId}&academicYearId=${fromYearId}`
      ),
    enabled: !!fromSectionId && !!fromYearId,
  })

  useEffect(() => {
    if (deepFromYearId) setFromYearId(deepFromYearId)
    if (deepFromSectionId) setFromSectionId(deepFromSectionId)
  }, [deepFromYearId, deepFromSectionId])

  const eligibleList = Array.isArray(eligible)
    ? eligible
    : (eligible as { data?: Array<{ studentId: string }> })?.data ?? []

  useEffect(() => {
    if (!deepStudentId || !eligibleList.length) return
    if (selectedStudents.includes(deepStudentId)) return
    const inSection = eligibleList.some((e) => e.studentId === deepStudentId)
    if (inSection) setSelectedStudents([deepStudentId])
  }, [deepStudentId, eligibleList, selectedStudents])

  const { data: wizardData, isFetching: wizardLoading, refetch: loadWizard } = useQuery({
    queryKey: ['promotion-wizard', fromYearId, fromSectionId, passThreshold],
    queryFn: () =>
      fetchApi<{
        suggestedToSectionLabel: string | null
        rows: Array<Omit<WizardRow, 'status' | 'toClassSectionId' | 'included'>>
      }>(
        `/api/promotions/suggest?fromAcademicYearId=${fromYearId}&fromClassSectionId=${fromSectionId}&passThreshold=${passThreshold}`
      ),
    enabled: false,
  })

  const bulkPromote = useMutation({
    mutationFn: () =>
      fetchApi('/api/promotions/bulk', {
        method: 'POST',
        body: JSON.stringify({
          fromAcademicYearId: fromYearId,
          toAcademicYearId: toYearId,
          fromClassSectionId: fromSectionId,
          items: wizardRows
            .filter((r) => r.included)
            .map((r) => ({
              studentId: r.studentId,
              status: r.status,
              toClassSectionId: r.toClassSectionId,
            })),
        }),
      }),
    onSuccess: (data: Array<{ studentId: string; ok: boolean }>) => {
      const ok = data.filter((d) => d.ok).length
      notify.success(`Bulk promotion applied (${ok}/${data.length} ok)`)
      setWizardRows([])
      setWizardLoaded(false)
      qc.invalidateQueries({ queryKey: ['promotion-eligible'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const promote = useMutation({
    mutationFn: () =>
      fetchApi('/api/promotions', {
        method: 'POST',
        body: JSON.stringify({
          fromAcademicYearId: fromYearId,
          toAcademicYearId: toYearId,
          fromClassSectionId: fromSectionId,
          toClassSectionId: promotionStatus === 'PROMOTED' ? toSectionId : fromSectionId,
          studentIds: selectedStudents,
          status: promotionStatus,
        }),
      }),
    onSuccess: () => {
      notify.success('Promotion completed')
      setSelectedStudents([])
      qc.invalidateQueries({ queryKey: ['promotion-eligible'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const lockYear = useMutation({
    mutationFn: (yearId: string) =>
      fetchApi(`/api/academic-years/${yearId}/lock`, { method: 'POST' }),
    onSuccess: () => {
      notify.success('Academic year locked')
      qc.invalidateQueries({ queryKey: ['academic-years'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const rollover = useMutation({
    mutationFn: () =>
      fetchApi('/api/academic-years/rollover', {
        method: 'POST',
        body: JSON.stringify({
          fromYearId,
          ...rolloverForm,
          activateNewYear: true,
        }),
      }),
    onSuccess: (data: { newYear?: { id: string; name: string } }) => {
      notify.success('New academic year created')
      if (data?.newYear?.id) setToYearId(data.newYear.id)
      qc.invalidateQueries({ queryKey: ['academic-years'] })
    },
    onError: (e: Error) => notify.error(e.message),
  })

  if (status === 'loading') return null
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return <AccessDenied title="Promotions" message="Administrators manage year-end progression here." />
  }

  const fromYear = (years ?? []).find((y: { id: string }) => y.id === fromYearId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <GraduationCap className="w-7 h-7 text-indigo-600" />
          Promotions & Year-End
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Lock the outgoing year, open the next academic year, then promote students with full history preserved.
        </p>
        {deepStudentId && (
          <p className="mt-2 text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2">
            Opened from student profile — section/year pre-filled; student auto-selected when roster loads.
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="w-4 h-4" /> Year-end lock & rollover
            </CardTitle>
            <CardDescription>Complete this BEFORE batch promotion. Step 1: Lock old year. Step 2: Create new year.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-900">
              <p className="font-semibold mb-1">📋 Workflow Checklist:</p>
              <ul className="space-y-1 ml-3">
                <li>☐ Select 2026-2027 year and lock it</li>
                <li>☐ Create new year (2027-2028) and activate</li>
                <li>☐ Then use Step 3 to promote students</li>
              </ul>
            </div>
            <div>
              <Label>Outgoing year</Label>
              <Select value={fromYearId} onValueChange={setFromYearId}>
                <SelectTrigger><SelectValue placeholder="Select year" /></SelectTrigger>
                <SelectContent>
                  {(years ?? []).map((y: { id: string; name: string; isLocked: boolean }) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name} {y.isLocked ? '✓ (locked)' : '(open)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">This is the year you're ending</p>
            </div>
            <Button
              variant="outline"
              className="w-full gap-2"
              disabled={!fromYearId || lockYear.isPending || fromYear?.isLocked}
              onClick={() => lockYear.mutate(fromYearId)}
            >
              {lockYear.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
              {fromYear?.isLocked ? '✓ Year locked' : 'Step 1: Lock outgoing year'}
            </Button>
            {!fromYear?.isLocked && fromYearId && (
              <p className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1">Click above to lock the year before creating a new one</p>
            )}
            <hr />
            <div><Label>New year name</Label><Input value={rolloverForm.newYearName} onChange={(e) => setRolloverForm({ ...rolloverForm, newYearName: e.target.value })} placeholder="e.g., 2027-2028" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Start</Label><Input type="date" value={rolloverForm.startDate} onChange={(e) => setRolloverForm({ ...rolloverForm, startDate: e.target.value })} /></div>
              <div><Label>End</Label><Input type="date" value={rolloverForm.endDate} onChange={(e) => setRolloverForm({ ...rolloverForm, endDate: e.target.value })} /></div>
            </div>
            <Button
              className="w-full gap-2 bg-green-600 hover:bg-green-700"
              disabled={!fromYearId || rollover.isPending || !fromYear?.isLocked}
              onClick={() => rollover.mutate()}
            >
              {rollover.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Step 2: Create and activate new year
            </Button>
          </CardContent>
        </Card>

        <Card className={!toYearId ? 'border-amber-300 bg-amber-50/30' : ''}>
          <CardHeader>
            <CardTitle className="text-base">Batch promotion</CardTitle>
            <CardDescription>Step 3: Move students to the next class section in the new year.</CardDescription>
            {!toYearId && (
              <p className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1 mt-2">
                ⚠️ First, complete the rollover to create the new academic year (see Step 1).
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label>Target academic year</Label>
              <Select value={toYearId} onValueChange={setToYearId}>
                <SelectTrigger className={!toYearId ? 'border-amber-300' : ''}>
                  <SelectValue placeholder={
                    (years ?? []).filter((y: { isLocked: boolean }) => !y.isLocked).length === 0
                      ? 'No active years — complete rollover first'
                      : 'Select target year'
                  } />
                </SelectTrigger>
                <SelectContent>
                  {(years ?? []).length === 0 ? (
                    <div className="p-2 text-xs text-gray-500">No academic years found</div>
                  ) : (
                    (years ?? []).filter((y: { isLocked: boolean }) => !y.isLocked).map((y: { id: string; name: string }) => (
                      <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {(years ?? []).length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Showing {(years ?? []).filter((y: { isLocked: boolean }) => !y.isLocked).length} of {(years ?? []).length} years (locked years hidden)
                </p>
              )}
            </div>
            <div>
              <Label>From section (outgoing)</Label>
              <Select value={fromSectionId} onValueChange={(v) => { setFromSectionId(v); setSelectedStudents([]) }}>
                <SelectTrigger><SelectValue placeholder="From section" /></SelectTrigger>
                <SelectContent>
                  {(sections ?? []).map((s: { id: string; className: string; sectionName: string }) => (
                    <SelectItem key={s.id} value={s.id}>{s.className}-{s.sectionName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Action</Label>
              <Select value={promotionStatus} onValueChange={(v) => setPromotionStatus(v as typeof promotionStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PROMOTED">Promote to next class</SelectItem>
                  <SelectItem value="RETAINED">Retain (repeat year)</SelectItem>
                  <SelectItem value="GRADUATED">Graduate</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {promotionStatus === 'PROMOTED' && (
              <div>
                <Label>To section (new year)</Label>
                <Select value={toSectionId} onValueChange={setToSectionId}>
                  <SelectTrigger><SelectValue placeholder="To section" /></SelectTrigger>
                  <SelectContent>
                    {(sections ?? []).map((s: { id: string; className: string; sectionName: string }) => (
                      <SelectItem key={s.id} value={s.id}>{s.className}-{s.sectionName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1 bg-gray-50">
              {!fromSectionId ? (
                <p className="text-xs text-gray-500 p-2">Select a "From section" above to see eligible students</p>
              ) : eligibleList.length === 0 ? (
                <p className="text-xs text-gray-500 p-2">No students in this section</p>
              ) : (
                eligibleList.map((e: { id: string; studentId: string; rollNumber: string; student: { firstName: string; lastName: string } }) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white p-1 rounded">
                    <input
                      type="checkbox"
                      checked={selectedStudents.includes(e.studentId)}
                      onChange={(ev) => {
                        setSelectedStudents((prev) =>
                          ev.target.checked
                            ? [...prev, e.studentId]
                            : prev.filter((id) => id !== e.studentId)
                        )
                      }}
                    />
                    {e.student.firstName} {e.student.lastName} (Roll {e.rollNumber})
                  </label>
                ))
              )}
            </div>
            <Button
              className="w-full"
              disabled={
                !fromYearId ||
                !toYearId ||
                !fromSectionId ||
                selectedStudents.length === 0 ||
                (promotionStatus === 'PROMOTED' && !toSectionId) ||
                promote.isPending
              }
              onClick={() => promote.mutate()}
            >
              {promote.isPending ? 'Processing…' : `Apply to ${selectedStudents.length} student(s)`}
            </Button>
            {!toYearId && (
              <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
                ❌ Complete the rollover (Step 1 & 2) to enable promotions
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Wand2 className="w-4 h-4" /> Smart promotion wizard
          </CardTitle>
          <CardDescription>
            Uses published grades to suggest promote / retain / graduate per student, then applies in one batch.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-4 gap-3">
            <div>
              <Label>Pass threshold (%)</Label>
              <Input value={passThreshold} onChange={(e) => setPassThreshold(e.target.value)} type="number" min={0} max={100} />
            </div>
            <div className="sm:col-span-3 flex items-end gap-2">
              <Button
                variant="outline"
                className="gap-2"
                disabled={!fromYearId || !fromSectionId || wizardLoading}
                onClick={async () => {
                  const { data } = await loadWizard()
                  if (!data) return
                  setWizardRows(
                    data.rows.map((r) => ({
                      ...r,
                      status: r.suggestedStatus,
                      toClassSectionId: r.suggestedToSectionId,
                      included: true,
                    }))
                  )
                  setWizardLoaded(true)
                  notify.success(
                    data.suggestedToSectionLabel
                      ? `Suggested target: ${data.suggestedToSectionLabel}`
                      : 'Suggestions loaded (no auto next section — set targets manually)'
                  )
                }}
              >
                {wizardLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                Load suggestions
              </Button>
              {wizardData?.suggestedToSectionLabel && (
                <Badge variant="secondary">Next class: {wizardData.suggestedToSectionLabel}</Badge>
              )}
            </div>
          </div>

          {wizardLoaded && wizardRows.length > 0 && (
            <>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWizardRows((rows) => rows.map((r) => ({ ...r, included: true })))}
                >
                  <CheckSquare className="w-3 h-3 mr-1" /> Select all
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setWizardRows((rows) => rows.map((r) => ({ ...r, included: false })))}
                >
                  Clear selection
                </Button>
              </div>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>Student</TableHead>
                      <TableHead>Roll</TableHead>
                      <TableHead>%</TableHead>
                      <TableHead>Pass</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Target section</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wizardRows.map((row, idx) => (
                      <TableRow key={row.studentId}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={row.included}
                            onChange={(ev) => {
                              const included = ev.target.checked
                              setWizardRows((rows) =>
                                rows.map((r, i) => (i === idx ? { ...r, included } : r))
                              )
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.firstName} {row.lastName}
                        </TableCell>
                        <TableCell>{row.rollNumber}</TableCell>
                        <TableCell>{row.overallPercentage ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={row.isPassing ? 'default' : 'destructive'}>
                            {row.isPassing ? 'Pass' : 'Fail'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={row.status}
                            onValueChange={(v) => {
                              const status = v as WizardRow['status']
                              setWizardRows((rows) =>
                                rows.map((r, i) =>
                                  i === idx
                                    ? {
                                        ...r,
                                        status,
                                        toClassSectionId:
                                          status === 'GRADUATED'
                                            ? null
                                            : status === 'RETAINED'
                                              ? fromSectionId
                                              : r.suggestedToSectionId ?? r.toClassSectionId,
                                      }
                                    : r
                                )
                              )
                            }}
                          >
                            <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="PROMOTED">Promote</SelectItem>
                              <SelectItem value="RETAINED">Retain</SelectItem>
                              <SelectItem value="GRADUATED">Graduate</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          {row.status === 'GRADUATED' ? (
                            <span className="text-xs text-gray-500">—</span>
                          ) : (
                            <Select
                              value={row.toClassSectionId ?? ''}
                              onValueChange={(v) => {
                                setWizardRows((rows) =>
                                  rows.map((r, i) =>
                                    i === idx ? { ...r, toClassSectionId: v || null } : r
                                  )
                                )
                              }}
                            >
                              <SelectTrigger className="h-8 min-w-[140px]">
                                <SelectValue placeholder="Section" />
                              </SelectTrigger>
                              <SelectContent>
                                {(sections ?? []).map((s: { id: string; className: string; sectionName: string }) => (
                                  <SelectItem key={s.id} value={s.id}>
                                    {s.className}-{s.sectionName}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Button
                className="w-full"
                disabled={
                  !toYearId ||
                  wizardRows.filter((r) => r.included).length === 0 ||
                  bulkPromote.isPending ||
                  wizardRows.some(
                    (r) =>
                      r.included &&
                      r.status !== 'GRADUATED' &&
                      !r.toClassSectionId
                  )
                }
                onClick={() => bulkPromote.mutate()}
              >
                {bulkPromote.isPending
                  ? 'Applying…'
                  : `Apply wizard to ${wizardRows.filter((r) => r.included).length} student(s)`}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
