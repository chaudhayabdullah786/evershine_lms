'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { notify } from '@/lib/notify'
import { Save, Loader2, Download, ClipboardCheck } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

interface RosterRow {
  studentEnrollmentId: string
  rollNumber: string
  student: { firstName: string; lastName: string }
  todayStatus: AttendanceStatus | null
}

const STATUS_BTNS: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']

export default function SectionAttendancePage() {
  const { data: session } = useSession()
  const isAllowed = ['SUPER_ADMIN', 'ADMIN', 'TEACHER'].includes(session?.user?.role ?? '')

  const [classSectionId, setClassSectionId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [batchId, setBatchId] = useState('')
  const [shiftId, setShiftId] = useState('')
  const [houseId, setHouseId] = useState('')
  const [statusMap, setStatusMap] = useState<Record<string, AttendanceStatus>>({})
  const [exportStartDate, setExportStartDate] = useState(new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0])
  const [exportEndDate, setExportEndDate] = useState(new Date().toISOString().split('T')[0])

  const { data: years } = useQuery({
    queryKey: ['academic-years-att'],
    queryFn: () => fetchApi<Array<{ id: string; name: string; isActive: boolean; isLocked: boolean }>>('/api/academic-years'),
    enabled: isAllowed,
  })
  const activeYear = (years ?? []).find((y) => y.isActive)

  const { data: sections } = useQuery({
    queryKey: ['class-sections-att'],
    queryFn: () => fetchApi<any[]>('/api/class-sections'),
    enabled: isAllowed,
  })

  const { data: batches } = useQuery({
    queryKey: ['batches-att'],
    queryFn: () => fetchApi<any[]>('/api/batches'),
    enabled: isAllowed,
  })

  const { data: shifts } = useQuery({
    queryKey: ['shifts-att'],
    queryFn: () => fetchApi<any[]>('/api/shifts'),
    enabled: isAllowed,
  })

  const { data: houses } = useQuery({
    queryKey: ['houses-att'],
    queryFn: () => fetchApi<any[]>('/api/houses'),
    enabled: isAllowed,
  })

  const { data: roster, isLoading, refetch } = useQuery({
    queryKey: ['enrollment-roster', classSectionId, date, batchId, shiftId, houseId],
    queryFn: () => {
      const params = new URLSearchParams({
        classSectionId,
        date,
        ...(batchId && { batchId }),
        ...(shiftId && { shiftId }),
        ...(houseId && { houseId }),
      })
      return fetchApi<{ enrollments: RosterRow[]; stats: any }>(`/api/enrollment-attendance/roster?${params}`)
    },
    enabled: !!classSectionId,
  })

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/enrollment-attendance', {
        method: 'POST',
        body: JSON.stringify({
          classSectionId,
          attendanceDate: date,
          records: (roster?.enrollments ?? []).map((row) => ({
            studentEnrollmentId: row.studentEnrollmentId,
            status: statusMap[row.studentEnrollmentId] ?? row.todayStatus ?? 'PRESENT',
          })),
        }),
      }),
    onSuccess: () => {
      notify.success('Attendance saved (academic engine)')
      refetch()
    },
    onError: (e: Error) => notify.error(e.message),
  })

  const exportMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/enrollment-attendance/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classSectionId,
          startDate: exportStartDate,
          endDate: exportEndDate,
          ...(batchId && { batchId }),
          ...(shiftId && { shiftId }),
          ...(houseId && { houseId }),
        }),
      })
      if (!response.ok) throw new Error('Export failed')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `attendance_${new Date().toISOString().split('T')[0]}.xlsx`
      a.click()
      window.URL.revokeObjectURL(url)
    },
    onSuccess: () => notify.success('Attendance exported successfully'),
    onError: (e: Error) => notify.error(e.message),
  })

  if (!isAllowed) {
    return (
      <div className="p-8 text-center text-gray-500">
        You do not have permission to mark section attendance.
      </div>
    )
  }

  useEffect(() => {
    if (!roster?.enrollments?.length) {
      setStatusMap({})
      return
    }
    const next: Record<string, AttendanceStatus> = {}
    for (const row of roster.enrollments) {
      next[row.studentEnrollmentId] = row.todayStatus ?? 'PRESENT'
    }
    setStatusMap(next)
  }, [roster])

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="space-y-6 max-w-7xl mx-auto">
      <motion.div variants={fadeUp(0.1)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-emerald-100 rounded-lg text-emerald-600">
              <ClipboardCheck className="w-6 h-6" />
            </div>
            Section Attendance
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium ml-11">
            Mark attendance by class section using yearly enrollments.{' '}
            <Link href="/dashboard/attendance/legacy" className="text-indigo-600 hover:underline font-bold">
              Legacy class attendance &rarr;
            </Link>
          </p>
        </div>
      </motion.div>

      {!activeYear && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No active academic year. Run{' '}
          <Link href="/dashboard/academic" className="font-medium underline">
            Academic Engine → Quick bootstrap
          </Link>{' '}
          or create a year before marking attendance.
        </div>
      )}

      {activeYear?.isLocked && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          Academic year <strong>{activeYear.name}</strong> is locked — attendance cannot be changed.
        </div>
      )}

      <motion.div variants={fadeUp(0.2)}>
        <Card className="border border-slate-200/60 shadow-soft-md">
        <CardHeader>
          <CardTitle className="text-base">Select section & date</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Class section *</Label>
              <Select
                value={classSectionId}
                onValueChange={(v) => {
                  setClassSectionId(v)
                  setStatusMap({})
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose section" />
                </SelectTrigger>
                <SelectContent>
                  {(sections ?? []).map((s: { id: string; className: string; sectionName: string; campus?: { name: string } }) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.className}-{s.sectionName} ({s.campus?.name})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <input
                type="date"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          </div>

          {/* Filter options */}
          {classSectionId && (
            <div className="grid sm:grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg border">
              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Filter by Batch</Label>
                <Select value={batchId || 'all'} onValueChange={(v) => setBatchId(v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All batches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All batches</SelectItem>
                    {(batches ?? []).map((b: { id: string; name: string }) => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Filter by Shift</Label>
                <Select value={shiftId || 'all'} onValueChange={(v) => setShiftId(v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All shifts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All shifts</SelectItem>
                    {(shifts ?? []).map((s: { id: string; name: string }) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-gray-600">Filter by House</Label>
                <Select value={houseId || 'all'} onValueChange={(v) => setHouseId(v === 'all' ? '' : v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="All houses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All houses</SelectItem>
                    {(houses ?? []).map((h: { id: string; name: string }) => (
                      <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {activeYear && (
            <p className="text-xs text-gray-500">
              Active year: <strong>{activeYear.name}</strong>
              {activeYear.isLocked ? ' (locked)' : ''}
            </p>
          )}
        </CardContent>
      </Card>
      </motion.div>

      {/* Export Card */}
      {classSectionId && (
        <motion.div variants={fadeUp(0.3)}>
          <Card className="border-blue-200 bg-blue-50/50 shadow-soft-sm">
          <CardHeader>
            <CardTitle className="text-base">Export Attendance</CardTitle>
            <CardDescription>Download attendance records as Excel</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <input
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <input
                  type="date"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() => exportMutation.mutate()}
                  disabled={exportMutation.isPending || !exportStartDate || !exportEndDate}
                >
                  {exportMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export Excel
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>
      )}

      {classSectionId && (
        <motion.div variants={fadeUp(0.4)}>
          <Card className="border border-slate-200/60 shadow-soft-md">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Roster</CardTitle>
              <CardDescription>
                {roster?.enrollments?.length ?? 0} students
                {roster?.stats && ` • Present: ${roster.stats.byHouse ? Object.values(roster.stats.byHouse as any).reduce((sum, h: any) => sum + h.present, 0) : 0}`}
              </CardDescription>
            </div>
            <Button
              className="gap-2"
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                !(roster?.enrollments?.length) ||
                !activeYear ||
                activeYear.isLocked
              }
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save attendance
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : !(roster?.enrollments?.length) ? (
              <p className="text-sm text-amber-700">
                No active enrollments in this section for the current academic year. Enroll students via Admissions or Academic Engine.
              </p>
            ) : (
              (roster?.enrollments ?? []).map((row) => {
                const current =
                  statusMap[row.studentEnrollmentId] ?? row.todayStatus ?? 'PRESENT'
                return (
                  <div
                    key={row.studentEnrollmentId}
                    className="flex flex-wrap items-center justify-between gap-2 border rounded-lg p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {row.student.firstName} {row.student.lastName}
                      </p>
                      <p className="text-xs text-gray-500">Roll {row.rollNumber}</p>
                    </div>
                    <div className="flex gap-1">
                      {STATUS_BTNS.map((st) => (
                        <Button
                          key={st}
                          size="sm"
                          variant={current === st ? 'default' : 'outline'}
                          className="text-xs px-2 h-8"
                          onClick={() =>
                            setStatusMap((m) => ({ ...m, [row.studentEnrollmentId]: st }))
                          }
                        >
                          {st[0]}
                        </Button>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}
    </motion.div>
  )
}
