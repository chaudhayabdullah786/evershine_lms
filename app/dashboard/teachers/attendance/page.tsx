'use client'

/**
 * /dashboard/teachers/attendance
 *
 * Bulk Daily Attendance page for Staff (Teachers).
 *
 * Roles:
 *   - SUPER_ADMIN / ADMIN: can view all teachers in campus/system and mark/edit
 *     their attendance for any date and shift in bulk.
 *   - TEACHER: Redirected / access denied (handled by client-side guard).
 */

import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { useSession } from 'next-auth/react'
import { notify } from '@/lib/notify'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { AccessDenied } from '@/components/AccessDenied'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  Search,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Save,
  Download,
  CalendarDays,
  Users
} from 'lucide-react'
import Link from 'next/link'
import * as XLSX from 'xlsx'
import { SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'

// ── Types ─────────────────────────────────────────────────────────────────────
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

interface TeacherAttendanceRecord {
  id?: string
  status: AttendanceStatus
  hrStatus?: 'PRESENT' | 'LATE' | 'ABSENT' | 'LEAVE' | null
  checkInTime?: string | null
  lateMinutes?: number
  penaltyAmount?: number
  isPenaltyApplied?: boolean
  remarks?: string | null
  createdAt?: string
}

interface TeacherWithAttendance {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  profilePicture?: string | null
  campusId: string
  campus: { name: string; code: string }
  attendance: TeacherAttendanceRecord | null
}

interface BulkApiResponse {
  teachers: TeacherWithAttendance[]
  date: string
  shift: SessionShift
  summary: {
    total: number
    present: number
    late: number
    absent: number
    leave: number
    unmarked: number
  }
}

// ── Config ────────────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<
  AttendanceStatus,
  { label: string; color: string; bg: string; border: string; Icon: typeof CheckCircle }
> = {
  PRESENT: {
    label: 'Present',
    color: 'text-emerald-700 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-200 dark:border-emerald-900/50',
    Icon: CheckCircle
  },
  ABSENT: {
    label: 'Absent',
    color: 'text-rose-700 dark:text-rose-400',
    bg: 'bg-rose-50 dark:bg-rose-950/30',
    border: 'border-rose-200 dark:border-rose-900/50',
    Icon: XCircle
  },
  LATE: {
    label: 'Late',
    color: 'text-amber-700 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    border: 'border-amber-200 dark:border-amber-905/50',
    Icon: Clock
  },
  EXCUSED: {
    label: 'Excused / Leave',
    color: 'text-sky-700 dark:text-sky-400',
    bg: 'bg-sky-50 dark:bg-sky-950/30',
    border: 'border-sky-200 dark:border-sky-900/50',
    Icon: AlertCircle
  }
}

export default function BulkTeacherAttendancePage() {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()

  const role = session?.user?.role as string | undefined
  const isAuthorized = role === 'SUPER_ADMIN' || role === 'ADMIN'

  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [shift, setShift] = useState<SessionShift>('MORNING')
  const [search, setSearch] = useState<string>('')
  
  // Local changes map: { [teacherId]: Partial<TeacherAttendanceRecord> }
  const [localChanges, setLocalChanges] = useState<Record<string, Partial<TeacherAttendanceRecord>>>({})
  // Track which teacher rows are expanded for editing options
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Fetch campus list (for Super Admin selector only)
  const { data: campuses } = useQuery({
    queryKey: ['campuses-list-attendance'],
    queryFn: () => fetchApi<any[]>('/api/campuses'),
    enabled: role === 'SUPER_ADMIN',
    staleTime: 5 * 60 * 1000
  })

  const [selectedCampusId, setSelectedCampusId] = useState<string>('ALL')

  // Build query URL
  const queryUrl = useMemo(() => {
    const params = new URLSearchParams({ date, shift })
    if (role === 'SUPER_ADMIN' && selectedCampusId !== 'ALL') {
      params.set('campusId', selectedCampusId)
    }
    return `/api/teachers/attendance?${params.toString()}`
  }, [date, shift, selectedCampusId, role])

  // Fetch staff bulk list
  const { data: apiData, isLoading, refetch } = useQuery({
    queryKey: ['bulk-teachers-attendance', date, shift, selectedCampusId],
    queryFn: () => fetchApi<BulkApiResponse>(queryUrl),
    enabled: isAuthorized && !!date && !!shift,
    staleTime: 10_000
  })

  // Clear local changes when query data changes or shift/date changes
  useEffect(() => {
    setLocalChanges({})
    setExpandedRows({})
  }, [date, shift, selectedCampusId])

  // Bulk save mutation
  const saveMutation = useMutation({
    mutationFn: (records: any[]) =>
      fetchApi('/api/teachers/attendance', {
        method: 'POST',
        body: JSON.stringify({ records })
      }),
    onSuccess: (data: any) => {
      notify.success(data.message || 'Staff attendance updated successfully')
      setLocalChanges({})
      queryClient.invalidateQueries({ queryKey: ['bulk-teachers-attendance'] })
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to save attendance')
    }
  })

  const teachers = apiData?.teachers ?? []
  
  // Apply local modifications over base API data to get current state
  const mergedTeachers = useMemo(() => {
    return teachers.map((t) => {
      const change = localChanges[t.id]
      const currentAttendance = t.attendance
        ? { ...t.attendance }
        : { status: 'PRESENT' as const } // Default fallback state when unmarked

      const finalAttendance = change
        ? { ...currentAttendance, ...change }
        : t.attendance // Keep null if not marked yet and no local change

      return {
        ...t,
        attendance: finalAttendance
      }
    })
  }, [teachers, localChanges])

  // Statistics summaries based on local state (live updates before save)
  const localSummary = useMemo(() => {
    const list = mergedTeachers
    const total = list.length
    let present = 0
    let late = 0
    let absent = 0
    let leave = 0
    let unmarked = 0

    list.forEach((t) => {
      if (!t.attendance) {
        unmarked++
      } else {
        const st = t.attendance.status
        if (st === 'PRESENT') present++
        else if (st === 'LATE') late++
        else if (st === 'ABSENT') absent++
        else if (st === 'EXCUSED') leave++
      }
    })

    return { total, present, late, absent, leave, unmarked }
  }, [mergedTeachers])

  // Filtered teachers list based on search term
  const filteredTeachers = useMemo(() => {
    if (!search.trim()) return mergedTeachers
    const term = search.toLowerCase()
    return mergedTeachers.filter(
      (t) =>
        t.firstName.toLowerCase().includes(term) ||
        t.lastName.toLowerCase().includes(term) ||
        t.employeeId.toLowerCase().includes(term) ||
        t.designation.toLowerCase().includes(term)
    )
  }, [mergedTeachers, search])

  // Helper to apply status change
  const handleStatusChange = (teacherId: string, status: AttendanceStatus) => {
    setLocalChanges((prev) => {
      const currentChange = prev[teacherId] ?? {}
      const originalRecord = teachers.find((t) => t.id === teacherId)?.attendance

      // If cycling status, set defaults
      const nextChange: Partial<TeacherAttendanceRecord> = {
        ...currentChange,
        status
      }

      // If marked present or excused, clear checkInTime
      if (status === 'PRESENT' || status === 'EXCUSED' || status === 'ABSENT') {
        nextChange.checkInTime = null
      } else if (status === 'LATE' && !nextChange.checkInTime) {
        // Default check in time to now
        const nowStr = new Date().toTimeString().slice(0, 5)
        nextChange.checkInTime = `${date}T${nowStr}:00`
      }

      return {
        ...prev,
        [teacherId]: nextChange
      }
    })
  }

  // Handle detailed overrides (checkInTime, remarks, penalties)
  const handleDetailChange = (teacherId: string, field: string, value: any) => {
    setLocalChanges((prev) => {
      const currentChange = prev[teacherId] ?? {}
      return {
        ...prev,
        [teacherId]: {
          ...currentChange,
          [field]: value
        }
      }
    })
  }

  const toggleRowExpansion = (teacherId: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [teacherId]: !prev[teacherId]
    }))
  }

  // Bulk operation: set all currently filtered teachers to a status
  const handleQuickMarkAll = (status: AttendanceStatus) => {
    const updates: Record<string, Partial<TeacherAttendanceRecord>> = { ...localChanges }
    filteredTeachers.forEach((t) => {
      updates[t.id] = {
        ...(updates[t.id] ?? {}),
        status,
        checkInTime: status === 'LATE' ? `${date}T08:30:00` : null
      }
    })
    setLocalChanges(updates)
    notify.info(`Marked all matching staff as ${status}. Click Save to apply changes.`)
  }

  // Submit all local modifications to bulk POST API
  const handleSave = () => {
    const payload = Object.entries(localChanges).map(([teacherId, record]) => {
      // Find original checkInTime if not modified
      const original = teachers.find((t) => t.id === teacherId)?.attendance
      const status = record.status || original?.status || 'PRESENT'

      const checkInInput = record.checkInTime !== undefined 
        ? record.checkInTime 
        : original?.checkInTime

      return {
        teacherId,
        date,
        shift,
        status,
        checkInTime: checkInInput ? new Date(checkInInput).toISOString() : undefined,
        remarks: record.remarks !== undefined ? record.remarks : original?.remarks,
        penaltyAmount: record.penaltyAmount !== undefined ? Number(record.penaltyAmount) : original?.penaltyAmount,
        isPenaltyApplied: record.isPenaltyApplied !== undefined ? record.isPenaltyApplied : original?.isPenaltyApplied
      }
    })

    if (payload.length === 0) {
      notify.info('No changes to save.')
      return
    }

    saveMutation.mutate(payload)
  }

  // Daily sheet excel export
  const handleExport = () => {
    if (mergedTeachers.length === 0) return
    const exportData = mergedTeachers.map((t, idx) => ({
      'S.No': idx + 1,
      'Employee ID': t.employeeId,
      'Staff Name': `${t.firstName} ${t.lastName}`,
      'Designation': t.designation,
      'Campus Code': t.campus.code,
      'Campus Name': t.campus.name,
      'Date': date,
      'Shift': SESSION_SHIFT_LABELS[shift],
      'Status': t.attendance?.status ?? 'UNMARKED',
      'Arrival Time': t.attendance?.checkInTime
        ? new Date(t.attendance.checkInTime).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })
        : '—',
      'Penalty Amount (PKR)': t.attendance?.penaltyAmount ?? 0,
      'Penalty Applied': t.attendance?.isPenaltyApplied ? 'Yes' : 'No',
      'Admin Remarks': t.attendance?.remarks ?? ''
    }))

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(exportData)
    XLSX.utils.book_append_sheet(wb, ws, 'Staff Attendance')
    XLSX.writeFile(wb, `Staff_Attendance_${date}_${shift}.xlsx`)
    notify.success('Excel spreadsheet exported successfully')
  }

  // Guards & Layout loader
  if (status === 'loading') return null
  if (!isAuthorized) {
    return (
      <AccessDenied
        title="Access Restricted"
        message="Staff daily attendance management is restricted to authorized campus administrators."
      />
    )
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      
      {/* Header Info Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 rounded-xl text-indigo-600 dark:text-indigo-400">
              <UserCheck className="w-6 h-6" />
            </div>
            Daily Staff Attendance
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Campus-level HR log and penalty overrides for coaching shifts.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {Object.keys(localChanges).length > 0 && (
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold shadow-md hover:shadow-lg transition-all"
            >
              {saveMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save {Object.keys(localChanges).length} Change(s)
            </Button>
          )}
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={mergedTeachers.length === 0}
            className="gap-2 border-slate-200 hover:bg-slate-50 dark:border-slate-800"
          >
            <Download className="w-4 h-4" />
            Export Excel
          </Button>
        </div>
      </div>

      {/* Roster Controls Filter Bar */}
      <Card className="border-slate-200/80 shadow-sm">
        <CardContent className="p-4 md:p-6 grid gap-4 md:grid-cols-4">
          
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Attendance Date</Label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Coaching Shift</Label>
            <Select value={shift} onValueChange={(v) => setShift(v as SessionShift)}>
              <SelectTrigger className="border-slate-200 dark:border-slate-800 h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MORNING">{SESSION_SHIFT_LABELS.MORNING}</SelectItem>
                <SelectItem value="EVENING">{SESSION_SHIFT_LABELS.EVENING}</SelectItem>
                <SelectItem value="NIGHT">{SESSION_SHIFT_LABELS.NIGHT}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {role === 'SUPER_ADMIN' && (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Campus Division</Label>
              <Select value={selectedCampusId} onValueChange={setSelectedCampusId}>
                <SelectTrigger className="border-slate-200 dark:border-slate-800 h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Campuses</SelectItem>
                  {campuses?.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5 md:col-span-1">
            <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Search Roster</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search name, code, role..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 border-slate-200 dark:border-slate-800 h-10"
              />
            </div>
          </div>

        </CardContent>
      </Card>

      {/* live updates statistics strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total staff', count: localSummary.total, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700' },
          { label: 'Present', count: localSummary.present, ...STATUS_CONFIG.PRESENT },
          { label: 'Absent', count: localSummary.absent, ...STATUS_CONFIG.ABSENT },
          { label: 'Late', count: localSummary.late, ...STATUS_CONFIG.LATE },
          { label: 'Excused', count: localSummary.leave, ...STATUS_CONFIG.EXCUSED }
        ].map((stat, i) => (
          <div
            key={i}
            className={`rounded-xl border p-4 text-center flex flex-col justify-center ${stat.bg} ${stat.border}`}
          >
            <p className={`text-2xl font-black ${stat.color ?? stat.text}`}>{stat.count}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Quick Mark controls (only if roster is not empty) */}
      {filteredTeachers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5 px-1">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quick Mark All Filtered:</span>
          {(['PRESENT', 'ABSENT', 'EXCUSED'] as AttendanceStatus[]).map((st) => {
            const cfg = STATUS_CONFIG[st]
            return (
              <button
                key={st}
                onClick={() => handleQuickMarkAll(st)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all bg-white hover:bg-slate-50 ${cfg.color} ${cfg.border}`}
              >
                <cfg.Icon className="w-3.5 h-3.5" />
                {cfg.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Main Staff Roster Grid */}
      <Card className="border-slate-200/80 shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            Staff Roster
            <span className="text-xs font-normal text-slate-500">
              ({filteredTeachers.length} showing)
            </span>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-0 divide-y divide-slate-100 dark:divide-slate-800">
          {isLoading ? (
            <div className="p-12 text-center space-y-4">
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
              <Skeleton className="h-10 w-full rounded-lg" />
            </div>
          ) : filteredTeachers.length === 0 ? (
            <div className="p-16 text-center text-slate-500">
              <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="font-semibold">No teachers found.</p>
              <p className="text-xs text-slate-400 mt-1">Check selected campus, division, or search terms.</p>
            </div>
          ) : (
            filteredTeachers.map((t) => {
              const currentRecord = t.attendance
              const statusCfg = currentRecord ? STATUS_CONFIG[currentRecord.status] : null
              const isModified = !!localChanges[t.id]
              const isExpanded = !!expandedRows[t.id]

              return (
                <div key={t.id} className="transition-all hover:bg-slate-50/40">
                  
                  {/* Standard Row Layout */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 gap-4">
                    
                    {/* User profile picture + name info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {t.profilePicture ? (
                        <img
                          src={t.profilePicture}
                          alt={t.firstName}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-700 dark:text-indigo-300 font-bold text-sm">
                          {t.firstName[0]}
                          {t.lastName[0]}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                            {t.firstName} {t.lastName}
                          </p>
                          <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded-full uppercase">
                            {t.campus.code}
                          </span>
                          {isModified && (
                            <span className="text-[9px] font-bold text-amber-600 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.5 rounded border border-amber-200">
                              PENDING
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 font-medium">
                          {t.designation} · <span className="font-mono">{t.employeeId}</span>
                        </p>
                      </div>
                    </div>

                    {/* Quick status selector buttons + edit controls */}
                    <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                      
                      {/* Interactive Status Pills */}
                      <div className="flex rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden">
                        {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as AttendanceStatus[]).map((st) => {
                          const isSelected = currentRecord?.status === st
                          const cfg = STATUS_CONFIG[st]
                          
                          return (
                            <button
                              key={st}
                              type="button"
                              onClick={() => handleStatusChange(t.id, st)}
                              className={`px-3 py-1.5 text-xs font-bold border-r last:border-r-0 border-slate-200 dark:border-slate-800 transition-all ${
                                isSelected
                                  ? `${cfg.bg} ${cfg.color} font-black`
                                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
                              }`}
                              title={cfg.label}
                            >
                              {st === 'EXCUSED' ? 'EXC' : st.substring(0, 3)}
                            </button>
                          )
                        })}
                      </div>

                      {/* Expand details button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleRowExpansion(t.id)}
                        className={`h-8 w-8 text-slate-400 hover:text-slate-600 hover:bg-slate-100 ${isExpanded ? 'bg-slate-100' : ''}`}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>

                      {/* Individual Calendar Link */}
                      <Link href={`/dashboard/teachers/${t.id}/attendance`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs font-semibold text-slate-500 hover:text-indigo-600 border border-transparent hover:border-indigo-100"
                        >
                          Calendar →
                        </Button>
                      </Link>

                    </div>

                  </div>

                  {/* Expanded Custom Details panel */}
                  {isExpanded && (
                    <div className="bg-slate-50/70 dark:bg-slate-900/40 p-4 border-t border-b border-slate-100 dark:border-slate-800 grid gap-4 md:grid-cols-3 text-xs">
                      
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Observed arrival time</Label>
                        <input
                          type="time"
                          value={
                            currentRecord?.checkInTime
                              ? new Date(currentRecord.checkInTime).toTimeString().slice(0, 5)
                              : ''
                          }
                          onChange={(e) => {
                            const val = e.target.value
                            handleDetailChange(t.id, 'checkInTime', val ? `${date}T${val}:00` : null)
                          }}
                          className="flex h-9 w-full rounded-md border border-slate-200 dark:border-slate-800 bg-white px-3 py-1.5 text-xs focus:outline-none"
                        />
                      </div>

                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Penalty Override (PKR)</Label>
                        <Input
                          type="number"
                          min={0}
                          value={currentRecord?.penaltyAmount ?? ''}
                          placeholder="Calculated automatically"
                          onChange={(e) => handleDetailChange(t.id, 'penaltyAmount', e.target.value === '' ? undefined : Number(e.target.value))}
                          className="bg-white border-slate-200 dark:border-slate-800 h-9 text-xs"
                        />
                      </div>

                      <div className="flex items-center gap-2 md:pt-5">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={currentRecord?.isPenaltyApplied === false}
                            onChange={(e) => handleDetailChange(t.id, 'isPenaltyApplied', !e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="font-semibold text-slate-600 dark:text-slate-300">Waive / Remove penalty</span>
                        </label>
                      </div>

                      <div className="md:col-span-3 space-y-1">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase">Admin remarks</Label>
                        <Input
                          value={currentRecord?.remarks ?? ''}
                          placeholder="Add comments / reasons for status correction..."
                          onChange={(e) => handleDetailChange(t.id, 'remarks', e.target.value)}
                          className="bg-white border-slate-200 dark:border-slate-800 h-9 text-xs"
                        />
                      </div>

                    </div>
                  )}

                </div>
              )
            })
          )}
        </CardContent>
      </Card>

    </div>
  )
}
