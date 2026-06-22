'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchLegacyApi, fetchPaginatedApi } from '@/lib/api-client'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { notify } from '@/lib/notify'
import {
  CheckCircle, XCircle, Clock, AlertCircle, Save, RefreshCw, CalendarDays, QrCode, FileSpreadsheet, BarChart2
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { useSession } from 'next-auth/react'
import QRScannerModal from '@/components/QRScannerModal'
import { formatClassWithShift, SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'
import { AcademicScopeFilters } from '@/components/academic/AcademicScopeFilters'
import { useAcademicHierarchy } from '@/hooks/useAcademicHierarchy'
import type { AcademicScopeState } from '@/lib/academic/types'
import { formatAcademicClassLabel } from '@/lib/academic/hierarchy'
import { LegacyEngineBanner } from '@/components/academic/LegacyEngineBanner'

type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'

interface StudentAttendanceRow {
  studentId: string
  firstName: string
  lastName: string
  registrationNumber: string
  rollNumber?: string
  status: AttendanceStatus
  remarks: string
}

const STATUS_OPTS: { value: AttendanceStatus; label: string; icon: React.ComponentType<{ className?: string }>; color: string }[] = [
  { value: 'PRESENT', label: 'P', icon: CheckCircle, color: 'bg-green-100 text-green-700 border-green-300 hover:bg-green-200' },
  { value: 'ABSENT', label: 'A', icon: XCircle, color: 'bg-red-100 text-red-700 border-red-300 hover:bg-red-200' },
  { value: 'LATE', label: 'L', icon: Clock, color: 'bg-yellow-100 text-yellow-700 border-yellow-300 hover:bg-yellow-200' },
  { value: 'EXCUSED', label: 'E', icon: AlertCircle, color: 'bg-blue-100 text-blue-700 border-blue-300 hover:bg-blue-200' },
]

const STATUS_ACTIVE: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-green-500 text-white border-green-500',
  ABSENT: 'bg-red-500 text-white border-red-500',
  LATE: 'bg-yellow-500 text-white border-yellow-500',
  EXCUSED: 'bg-blue-500 text-white border-blue-500',
}

const defaultScope = (): AcademicScopeState => ({
  campusId: '',
  batchId: '',
  shift: 'MORNING',
  classId: '',
  houseId: '',
})

export default function AttendancePage() {
  const queryClient = useQueryClient()
  const [scope, setScope] = useState<AcademicScopeState>(defaultScope)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [roster, setRoster] = useState<StudentAttendanceRow[]>([])
  const [isRosterLoaded, setIsRosterLoaded] = useState(false)
  const [isLoadingRoster, setIsLoadingRoster] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [alreadySubmitted, setAlreadySubmitted] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [rangeExportOpen, setRangeExportOpen] = useState(false)
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  const { data: session } = useSession()
  const isTeacher = session?.user?.role === 'TEACHER'

  const hierarchy = useAcademicHierarchy(scope, setScope, {
    mode: isTeacher ? 'teacher' : 'admin',
    loadCampuses: !isTeacher,
    enabled: !!session?.user,
  })

  const { scope: academicScope, selectedClass } = hierarchy
  const selectedClassId = academicScope.classId
  const sessionShift = academicScope.shift

  const resetRoster = () => {
    setIsRosterLoaded(false)
    setRoster([])
    setAlreadySubmitted(false)
  }

  const loadRoster = async () => {
    if (!selectedClassId) {
      notify.error('Select campus, batch (optional), session, and class first')
      return
    }
    setIsLoadingRoster(true)
    setAlreadySubmitted(false)

    try {
      const existingEndpoint = isTeacher
        ? `/api/teacher-portal/attendance?classId=${selectedClassId}&date=${date}&shift=${sessionShift}&limit=100`
        : `/api/attendance?classId=${selectedClassId}&date=${date}&shift=${sessionShift}&limit=100`
      const existingData = await fetchPaginatedApi<{ student: StudentAttendanceRow; status: AttendanceStatus; remarks?: string }>(existingEndpoint)

      if (existingData.data.length > 0) {
        setAlreadySubmitted(true)
        setRoster(
          existingData.data.map((r) => ({
            studentId: (r as any).student.id,
            firstName: (r as any).student.firstName,
            lastName: (r as any).student.lastName,
            registrationNumber: (r as any).student.registrationNumber,
            rollNumber: (r as any).student.rollNumber,
            status: r.status as AttendanceStatus,
            remarks: r.remarks ?? '',
          }))
        )
      } else {
        let studentsUrl = isTeacher
          ? `/api/teacher-portal/my-students?classSectionId=${selectedClassId}&limit=100`
          : `/api/students?classId=${selectedClassId}&limit=100`
        if (academicScope.houseId) studentsUrl += `&houseId=${academicScope.houseId}`
        if (academicScope.shift) studentsUrl += `&shift=${academicScope.shift}`

        const studentsData = await fetchPaginatedApi<any>(studentsUrl)
        setRoster(
          studentsData.data.map((s: any) => ({
            studentId: s.id,
            firstName: s.firstName,
            lastName: s.lastName,
            registrationNumber: s.registrationNumber,
            rollNumber: s.rollNumber,
            status: 'PRESENT' as AttendanceStatus,
            remarks: '',
          }))
        )
      }
      setIsRosterLoaded(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      notify.error('Failed to load roster', { description: message })
    } finally {
      setIsLoadingRoster(false)
    }
  }

  const updateStatus = (studentId: string, status: AttendanceStatus) => {
    setRoster((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, status } : r))
    )
  }

  const updateRemarks = (studentId: string, remarks: string) => {
    setRoster((prev) =>
      prev.map((r) => (r.studentId === studentId ? { ...r, remarks } : r))
    )
  }

  const markAll = (status: AttendanceStatus) => {
    setRoster((prev) => prev.map((r) => ({ ...r, status })))
  }

  const handleSubmit = async () => {
    if (!selectedClassId || roster.length === 0) return
    setIsSubmitting(true)

    try {
      const endpoint = isTeacher ? '/api/teacher-portal/attendance' : '/api/attendance'
      await fetchLegacyApi(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          classId: selectedClassId,
          date,
          shift: sessionShift,
          records: roster.map((r) => ({
            studentId: r.studentId,
            status: r.status,
            remarks: r.remarks || undefined,
          })),
        }),
      })
      notify.success(`Attendance saved for ${roster.length} students`)
      queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] })
      setAlreadySubmitted(true)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      notify.error('Failed to save attendance', { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  const exportToExcel = () => {
    if (!selectedClass || roster.length === 0) return
    if (isTeacher) {
      const url = `/api/teacher-portal/attendance/export?classId=${selectedClassId}&date=${date}&shift=${sessionShift}`
      window.open(url, '_blank')
    } else {
      const data = roster.map((r) => ({
        'Registration Number': r.registrationNumber,
        'Roll Number': r.rollNumber || 'N/A',
        'First Name': r.firstName,
        'Last Name': r.lastName,
        'Status': r.status,
        'Remarks': r.remarks,
      }))
      const worksheet = XLSX.utils.json_to_sheet(data)
      const workbook = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance')
      XLSX.writeFile(workbook, `Attendance_${selectedClass.name}_${date}.xlsx`)
    }
  }

  const exportPeriodic = async () => {
    if (!selectedClassId || !rangeStart || !rangeEnd) {
      notify.error('Please select a class and both start/end dates')
      return
    }
    if (rangeStart > rangeEnd) {
      notify.error('Start date must be before end date')
      return
    }
    setIsExporting(true)
    try {
      const url = `/api/teacher-portal/attendance/export?classId=${selectedClassId}&startDate=${rangeStart}&endDate=${rangeEnd}&shift=${sessionShift}`
      window.open(url, '_blank')
      setRangeExportOpen(false)
      notify.success('Periodic attendance report downloaded')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      notify.error('Export failed', { description: message })
    } finally {
      setIsExporting(false)
    }
  }

  const handleDetected = (code: string) => {
    const scannedVal = code.trim().toLowerCase()
    const studentIdx = roster.findIndex(
      (r) =>
        r.registrationNumber.toLowerCase() === scannedVal ||
        (r.rollNumber && r.rollNumber.toLowerCase() === scannedVal)
    )
    if (studentIdx !== -1) {
      updateStatus(roster[studentIdx].studentId, 'PRESENT')
      notify.success(`✓ ${roster[studentIdx].firstName} ${roster[studentIdx].lastName} marked PRESENT`)
    } else {
      notify.error(`Student not found in roster: ${code}`)
    }
  }

  const summary = roster.reduce(
    (acc, r) => {
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    {} as Record<AttendanceStatus, number>
  )

  const canLoadRoster =
    !!selectedClassId &&
    (isTeacher || hierarchy.scopeReady)

  const isAdmin = session?.user?.role === 'SUPER_ADMIN' || session?.user?.role === 'ADMIN'

  return (
    <div className="space-y-5">
      {isAdmin && (
        <LegacyEngineBanner
          title="Legacy class attendance"
          message="For the current academic year, use Section Attendance (academic engine) so records tie to StudentEnrollment and appear in parent/student portals."
          primaryHref="/dashboard/attendance/sections"
          primaryLabel="Open section attendance (recommended)"
        />
      )}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Attendance</h1>
          <p className="text-sm text-gray-500">
            Mark daily student attendance by campus, batch, session, and class.
            {isTeacher ? ' Showing your assigned classes only.' : ''}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-4">
        <AcademicScopeFilters
          hierarchy={hierarchy}
          showCampusBatch={!isTeacher}
          showHouse={!isTeacher}
          showShift
          showClass
          requireCampusForClass={!isTeacher}
          onScopeChange={resetRoster}
        />
        {!isTeacher && !hierarchy.scopeReady && academicScope.campusId && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Select batch{hierarchy.houseRequired ? ' and performance house' : ''} to load classes for this campus.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end border-t pt-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5" />
              Date
            </Label>
            <Input
              type="date"
              value={date}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => {
                setDate(e.target.value)
                resetRoster()
              }}
            />
          </div>

          <Button
            onClick={loadRoster}
            disabled={!canLoadRoster || isLoadingRoster}
            className="w-full sm:w-auto gap-2"
          >
            {isLoadingRoster ? (
              <><RefreshCw className="w-4 h-4 animate-spin" /> Loading...</>
            ) : (
              'Load Roster'
            )}
          </Button>
        </div>

      </div>

      {isRosterLoaded && (
        <>
          <div className="bg-white rounded-xl border shadow-sm p-4 space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold text-gray-800">
                  {selectedClass ? formatAcademicClassLabel(selectedClass) : ''} — {SESSION_SHIFT_LABELS[sessionShift]} — {new Date(date + 'T00:00:00').toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h2>
                <div className="flex flex-wrap gap-3 mt-2 text-sm">
                  <span className="text-green-700 font-medium">✓ Present: {summary.PRESENT ?? 0}</span>
                  <span className="text-red-700 font-medium">✗ Absent: {summary.ABSENT ?? 0}</span>
                  <span className="text-yellow-700 font-medium">⏱ Late: {summary.LATE ?? 0}</span>
                  <span className="text-blue-700 font-medium">~ Excused: {summary.EXCUSED ?? 0}</span>
                </div>
              </div>

              {!alreadySubmitted && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs text-gray-500 self-center">Mark all:</span>
                  {STATUS_OPTS.map((s) => (
                    <button
                      key={s.value}
                      onClick={() => markAll(s.value)}
                      className={`text-xs px-2.5 py-1 rounded-md border font-medium transition-colors ${s.color}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 mt-3 sm:mt-0">
                <Button variant="outline" className="h-9 px-3 text-xs gap-1.5" onClick={exportToExcel}>
                  <FileSpreadsheet className="w-4 h-4" /> Export Excel
                </Button>
                {isTeacher && (
                  <Button
                    variant="outline"
                    className="h-9 px-3 text-xs gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                    onClick={() => setRangeExportOpen(true)}
                  >
                    <BarChart2 className="w-4 h-4" /> Periodic Report
                  </Button>
                )}
                <Button
                  variant={cameraOpen ? 'default' : 'outline'}
                  className="h-9 px-3 text-xs gap-1.5"
                  onClick={() => setCameraOpen(true)}
                  disabled={alreadySubmitted || roster.length === 0}
                >
                  <QrCode className="w-4 h-4" /> Camera Scanner
                </Button>
              </div>
            </div>

            {alreadySubmitted && (
              <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                Attendance for this class and date has already been submitted. Showing existing records (admins can re-submit after clearing records in the database if needed).
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Reg. No.</TableHead>
                  <TableHead className="w-56">Status</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {roster.map((student, idx) => (
                  <TableRow key={student.studentId} className={student.status === 'ABSENT' ? 'bg-red-50/40' : ''}>
                    <TableCell className="text-gray-400 text-sm">{idx + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {student.firstName} {student.lastName}
                      </div>
                      {student.rollNumber && (
                        <div className="text-xs text-gray-400">Roll #{student.rollNumber}</div>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-600">
                      {student.registrationNumber}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1.5">
                        {STATUS_OPTS.map((opt) => {
                          const isSelected = student.status === opt.value
                          return (
                            <button
                              key={opt.value}
                              disabled={alreadySubmitted}
                              onClick={() => updateStatus(student.studentId, opt.value)}
                              className={`w-8 h-8 rounded-md border text-xs font-bold transition-colors flex items-center justify-center
                                ${isSelected ? STATUS_ACTIVE[opt.value] : `bg-white border-gray-200 text-gray-400 ${alreadySubmitted ? '' : 'hover:bg-gray-100'}`}`}
                              title={opt.value}
                            >
                              {opt.label}
                            </button>
                          )
                        })}
                      </div>
                    </TableCell>
                    <TableCell>
                      {!alreadySubmitted ? (
                        <Input
                          className="h-7 text-xs"
                          placeholder="optional note"
                          value={student.remarks}
                          onChange={(e) => updateRemarks(student.studentId, e.target.value)}
                        />
                      ) : (
                        <span className="text-xs text-gray-500">{student.remarks || '—'}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {!alreadySubmitted && roster.length > 0 && (
              <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
                <p className="text-sm text-gray-500">{roster.length} students in roster</p>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                >
                  {isSubmitting ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="w-4 h-4" /> Submit Attendance</>
                  )}
                </Button>
              </div>
            )}
          </div>
        </>
      )}

      {!isRosterLoaded && !isLoadingRoster && (
        <div className="bg-white rounded-xl border shadow-sm p-12 text-center text-gray-400">
          <CalendarDays className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">
            {isTeacher
              ? 'Select session and class, then click Load Roster'
              : 'Select campus, batch, session, and class, then click Load Roster'}
          </p>
          <p className="text-sm mt-1">You can mark attendance for today or any past date.</p>
        </div>
      )}

      <QRScannerModal
        open={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onDetected={handleDetected}
      />

      <Dialog open={rangeExportOpen} onOpenChange={(o) => !o && setRangeExportOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-600" />
              Periodic Attendance Report
            </DialogTitle>
            <DialogDescription>
              Export a pivot-table report with P/A/L status per student per day across a date range.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600">
              Class: {selectedClass ? formatClassWithShift(selectedClass.name, selectedClass.shift) : '—'}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> Start Date
                </Label>
                <Input
                  type="date"
                  value={rangeStart}
                  max={rangeEnd || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setRangeStart(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <CalendarDays className="w-3.5 h-3.5" /> End Date
                </Label>
                <Input
                  type="date"
                  value={rangeEnd}
                  min={rangeStart}
                  max={new Date().toISOString().split('T')[0]}
                  onChange={(e) => setRangeEnd(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRangeExportOpen(false)}>Cancel</Button>
            <Button
              onClick={exportPeriodic}
              disabled={isExporting || !selectedClassId || !rangeStart || !rangeEnd}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {isExporting ? (
                <><RefreshCw className="w-4 h-4 animate-spin" /> Exporting...</>
              ) : (
                <><FileSpreadsheet className="w-4 h-4" /> Export Excel</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
