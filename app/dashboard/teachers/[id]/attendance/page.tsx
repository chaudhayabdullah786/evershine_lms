'use client'

/**
 * /dashboard/teachers/[id]/attendance
 *
 * Monthly attendance calendar for a teacher.
 *
 * Roles:
 *   - SUPER_ADMIN / ADMIN: can mark attendance for any day
 *   - TEACHER: read-only view of own attendance
 *
 * Design decisions:
 *  - Calendar grid renders the current month by default; navigable with prev/next
 *  - Each cell is a click target (admin only) — no separate mark form needed
 *  - Status pills below the grid show monthly summary stats
 *  - Uses optimistic UI: updates local state immediately, then syncs server
 */

import { useCallback, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { useSession } from 'next-auth/react'
import { notify } from '@/lib/notify'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  AlertCircle,
} from 'lucide-react'
import Link from 'next/link'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'

// ── Types ─────────────────────────────────────────────────────────────────────
// WHY: Mirrors the Prisma AttendanceStatus enum exactly — ON_LEAVE is not defined
// in the schema. Use EXCUSED for planned leave/absence with admin remarks.
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

interface AttendanceRecord {
  id: string
  date: string
  shift?: SessionShift
  status: AttendanceStatus
  remarks?: string
  createdAt: string
}

// ── Config ────────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; color: string; bg: string; border: string; Icon: typeof CheckCircle2 }
> = {
  PRESENT: {
    label: 'Present',
    color: 'text-green-700',
    bg: 'bg-green-100',
    border: 'border-green-300',
    Icon: CheckCircle2,
  },
  ABSENT: {
    label: 'Absent',
    color: 'text-red-700',
    bg: 'bg-red-100',
    border: 'border-red-300',
    Icon: XCircle,
  },
  LATE: {
    label: 'Late',
    color: 'text-amber-700',
    bg: 'bg-amber-100',
    border: 'border-amber-300',
    Icon: Clock,
  },
  // EXCUSED covers planned leave — ON_LEAVE is not in the Prisma enum
  EXCUSED: {
    label: 'Excused / Leave',
    color: 'text-blue-700',
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    Icon: AlertCircle,
  },
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateKey(date: Date): string {
  return date.toISOString().split('T')[0]
}

function buildCalendarGrid(year: number, month: number): (Date | null)[][] {
  const firstDay = new Date(year, month, 1)
  const lastDay = new Date(year, month + 1, 0)
  const startDow = firstDay.getDay() // 0=Sun
  const weeks: (Date | null)[][] = []
  let week: (Date | null)[] = Array(startDow).fill(null)

  for (let d = 1; d <= lastDay.getDate(); d++) {
    week.push(new Date(year, month, d))
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TeacherAttendancePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const { data: session } = useSession()
  const queryClient = useQueryClient()

  const role = session?.user?.role as string | undefined
  const canMark = role === 'SUPER_ADMIN' || role === 'ADMIN'

  const today = new Date()
  const [viewMonth, setViewMonth] = useState(today.getMonth())   // 0-indexed
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [sessionShift, setSessionShift] = useState<SessionShift>('MORNING')

  // Optimistic local overrides { 'YYYY-MM-DD': AttendanceStatus }
  const [optimistic, setOptimistic] = useState<Record<string, AttendanceStatus>>({})

  // Pending mark state (to show the status picker)
  const [pendingDate, setPendingDate] = useState<string | null>(null)

  // ── Fetch teacher details ───────────────────────────────────────────────────
  const { data: teacherRaw, isLoading: loadingTeacher } = useQuery({
    queryKey: ['teacher-detail', id],
    queryFn: () => fetchApi<any>(`/api/teachers/${id}`),
    enabled: !!id,
    staleTime: 60_000,
  })
  const teacher = teacherRaw?.data ?? teacherRaw

  // ── Fetch attendance records for current month ─────────────────────────────
  const attendanceKey = ['teacher-attendance', id, viewYear, viewMonth + 1, sessionShift]
  const { data: attendanceRaw, isLoading: loadingAttendance } = useQuery({
    queryKey: attendanceKey,
    queryFn: () =>
      fetchApi<any>(
        `/api/teachers/${id}/attendance?month=${viewMonth + 1}&year=${viewYear}&shift=${sessionShift}&limit=31`
      ),
    enabled: !!id,
    staleTime: 30_000,
  })

  // Build a map of date → record from the fetched list
  const recordMap = useMemo(() => {
    const records: AttendanceRecord[] =
      attendanceRaw?.data ?? attendanceRaw?.data ?? []
    return records.reduce<Record<string, AttendanceRecord>>((acc, r) => {
      acc[toDateKey(new Date(r.date))] = r
      return acc
    }, {})
  }, [attendanceRaw])

  // ── Mark attendance mutation ───────────────────────────────────────────────
  const markMutation = useMutation({
    mutationFn: async ({ date, status }: { date: string; status: AttendanceStatus }) => {
      return fetchApi(`/api/teachers/${id}/attendance`, {
        method: 'POST',
        body: JSON.stringify({ date, status, shift: sessionShift }),
      })
    },
    onMutate: ({ date, status }) => {
      // Optimistic update
      setOptimistic((prev) => ({ ...prev, [date]: status }))
      setPendingDate(null)
    },
    onSuccess: (_, { date, status }) => {
      notify.success(`Attendance marked: ${status} for ${date}`)
      queryClient.invalidateQueries({ queryKey: attendanceKey })
    },
    onError: (err: any, { date }) => {
      // Roll back optimistic
      setOptimistic((prev) => {
        const next = { ...prev }
        delete next[date]
        return next
      })
      notify.error('Failed to mark attendance', { description: err.message })
    },
  })

  // ── Calendar navigation ────────────────────────────────────────────────────
  const prevMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 0) { setViewYear((y) => y - 1); return 11 }
      return m - 1
    })
    setOptimistic({})
    setPendingDate(null)
  }, [setPendingDate])

  const nextMonth = useCallback(() => {
    setViewMonth((m) => {
      if (m === 11) { setViewYear((y) => y + 1); return 0 }
      return m + 1
    })
    setOptimistic({})
    setPendingDate(null)
  }, [setPendingDate])

  // ── Calendar grid ──────────────────────────────────────────────────────────
  const calendarGrid = useMemo(
    () => buildCalendarGrid(viewYear, viewMonth),
    [viewYear, viewMonth]
  )

  // ── Monthly stats ──────────────────────────────────────────────────────────
  const allRecords = useMemo(() => {
    const fetched: AttendanceRecord[] = attendanceRaw?.data ?? []
    const merged: Record<string, AttendanceStatus> = {}
    fetched.forEach((r) => { merged[toDateKey(new Date(r.date))] = r.status })
    Object.entries(optimistic).forEach(([k, v]) => { merged[k] = v })
    return merged
  }, [attendanceRaw, optimistic])

  const stats = useMemo(() => {
    const values = Object.values(allRecords)
    return {
      present: values.filter((s) => s === 'PRESENT').length,
      absent: values.filter((s) => s === 'ABSENT').length,
      late: values.filter((s) => s === 'LATE').length,
      excused: values.filter((s) => s === 'EXCUSED').length,
      total: values.length,
    }
  }, [allRecords])

  // ── Status for a given date ────────────────────────────────────────────────
  const getStatus = (dateKey: string): AttendanceStatus | null => {
    if (optimistic[dateKey]) return optimistic[dateKey]
    return recordMap[dateKey]?.status ?? null
  }

  const isToday = (date: Date) => toDateKey(date) === toDateKey(today)
  const isFuture = (date: Date) => date > today
  const isPast = (date: Date) => toDateKey(date) !== toDateKey(today) && date < today

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loadingTeacher) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  if (!teacher) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center text-sm text-red-600">
          Teacher not found or access denied.
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/teachers">
          <Button variant="outline" size="icon" className="h-9 w-9 flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 truncate">
            Attendance — {teacher.firstName} {teacher.lastName}
          </h1>
          <p className="text-xs text-gray-400 font-mono">
            {teacher.employeeId} · {teacher.designation}
          </p>
        </div>
        {canMark && (
          <span className="ml-auto text-[10px] bg-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-full flex-shrink-0">
            MARKING MODE
          </span>
        )}
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="space-y-1.5 flex-1 max-w-xs">
          <Label>Coaching Session</Label>
          <Select
            value={sessionShift}
            onValueChange={(v) => {
              setSessionShift(v as SessionShift)
              setOptimistic({})
              setPendingDate(null)
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MORNING">{SESSION_SHIFT_LABELS.MORNING}</SelectItem>
              <SelectItem value="EVENING">{SESSION_SHIFT_LABELS.EVENING}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-xs text-gray-500 sm:pb-2">
          Calendar shows <strong>{SESSION_SHIFT_LABELS[sessionShift]}</strong> attendance only.
        </p>
      </div>

      {/* Stats pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {(
          [
            { label: 'Present',      count: stats.present, ...STATUS_CONFIG.PRESENT },
            { label: 'Absent',       count: stats.absent,  ...STATUS_CONFIG.ABSENT  },
            { label: 'Late',         count: stats.late,    ...STATUS_CONFIG.LATE    },
            { label: 'Excused',      count: stats.excused, ...STATUS_CONFIG.EXCUSED },
          ] as Array<{ label: string; count: number; color: string; bg: string; border: string; Icon: typeof CheckCircle2 }>
        ).map((s) => (
          <div
            key={s.label}
            className={`rounded-xl border p-3 ${s.bg} ${s.border} flex items-center gap-3`}
          >
            <s.Icon className={`w-5 h-5 ${s.color} flex-shrink-0`} />
            <div>
              <p className={`text-xl font-black ${s.color}`}>{s.count}</p>
              <p className={`text-[10px] font-bold ${s.color} opacity-70`}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Calendar */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">

        {/* Month navigator */}
        <div className="flex items-center justify-between px-5 py-3 border-b bg-gray-50">
          <Button variant="ghost" size="icon" onClick={prevMonth} className="h-8 w-8">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-sm font-bold text-gray-800">
            {MONTH_NAMES[viewMonth]} {viewYear}
          </div>
          <Button variant="ghost" size="icon" onClick={nextMonth} className="h-8 w-8">
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Day name headers */}
        <div className="grid grid-cols-7 border-b">
          {DAY_NAMES.map((d) => (
            <div key={d} className="py-2 text-center text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar cells */}
        {loadingAttendance ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="divide-y">
            {calendarGrid.map((week, wi) => (
              <div key={wi} className="grid grid-cols-7">
                {week.map((date, di) => {
                  if (!date) {
                    return <div key={di} className="h-14 bg-gray-50/50" />
                  }

                  const dateKey = toDateKey(date)
                  const status = getStatus(dateKey)
                  const cfg = status ? STATUS_CONFIG[status] : null
                  const isCurrentDay = isToday(date)
                  const isFutureDay = isFuture(date)
                  const isWeekend = date.getDay() === 0 // Sunday off

                  return (
                    <div
                      key={di}
                      onClick={() => {
                        if (!canMark || isFutureDay || isWeekend) return
                        setPendingDate((prev) => (prev === dateKey ? null : dateKey))
                      }}
                      className={[
                        'h-14 flex flex-col items-center justify-center relative transition-all select-none',
                        canMark && !isFutureDay && !isWeekend
                          ? 'cursor-pointer hover:bg-gray-50'
                          : '',
                        isCurrentDay ? 'ring-2 ring-indigo-400 ring-inset' : '',
                        isWeekend ? 'bg-gray-50/50' : '',
                        pendingDate === dateKey ? 'bg-indigo-50' : '',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'text-xs font-bold',
                          isCurrentDay ? 'text-indigo-600' : 'text-gray-700',
                          isFutureDay ? 'text-gray-300' : '',
                          isWeekend ? 'text-gray-300' : '',
                        ].join(' ')}
                      >
                        {date.getDate()}
                      </span>

                      {/* Status indicator */}
                      {cfg && (
                        <span
                          className={`mt-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded ${cfg.bg} ${cfg.color} leading-none`}
                        >
                          {cfg.label === 'Excused' ? 'EXC' : cfg.label.substring(0, 3).toUpperCase()}
                        </span>
                      )}

                      {/* No status — show dot for past days */}
                      {!cfg && isPast(date) && !isWeekend && (
                        <span className="mt-0.5 w-1 h-1 rounded-full bg-gray-200" />
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}

        {/* Status picker — shown when a date cell is clicked */}
        {pendingDate && canMark && (
          <div className="border-t bg-indigo-50/70 px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-gray-800">
                Mark attendance for{' '}
                <span className="text-indigo-700">
                  {new Date(pendingDate + 'T00:00:00').toLocaleDateString('en-PK', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-gray-400"
                onClick={() => setPendingDate(null)}
              >
                Cancel
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((status) => {
                const cfg = STATUS_CONFIG[status]
                const isActive = getStatus(pendingDate) === status
                return (
                  <button
                    key={status}
                    type="button"
                    disabled={markMutation.isPending}
                    onClick={() => markMutation.mutate({ date: pendingDate, status })}
                    className={[
                      'flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-all',
                      isActive
                        ? `${cfg.bg} ${cfg.color} ${cfg.border} ring-2 ring-offset-1 ring-current`
                        : `bg-white ${cfg.color} ${cfg.border} hover:${cfg.bg}`,
                      markMutation.isPending ? 'opacity-60 cursor-not-allowed' : '',
                    ].join(' ')}
                  >
                    <cfg.Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
        <span className="font-semibold text-gray-500">Legend:</span>
        {(Object.keys(STATUS_CONFIG) as AttendanceStatus[]).map((s) => {
          const cfg = STATUS_CONFIG[s]
          return (
            <span key={s} className={`flex items-center gap-1 font-medium ${cfg.color}`}>
              <span className={`w-2.5 h-2.5 rounded-sm ${cfg.bg} ${cfg.border} border inline-block`} />
              {cfg.label}
            </span>
          )
        })}
        {canMark && (
          <span className="ml-auto text-[10px] text-gray-300">
            Click any past/today cell to mark
          </span>
        )}
      </div>

    </div>
  )
}
