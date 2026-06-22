'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AcademicScopeFilters } from '@/components/academic/AcademicScopeFilters'
import { useAcademicHierarchy } from '@/hooks/useAcademicHierarchy'
import type { AcademicScopeState } from '@/lib/academic/types'
import { formatAcademicClassLabel } from '@/lib/academic/hierarchy'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { notify } from '@/lib/notify'
import { Calendar, Plus, Printer, Trash2, Edit2, RefreshCw, Bell } from 'lucide-react'
import { TeacherPicker, type TeacherPickerMode } from '@/components/academic/TeacherPicker'
import { Badge } from '@/components/ui/badge'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Skeleton } from '@/components/ui/skeleton'
import { SESSION_SHIFT_BADGE_CLASS, SESSION_SHIFT_LABELS, sessionShiftFormalLabel, type SessionShift } from '@/lib/validation/shift'
import { isAcademicEnginePrimary } from '@/lib/academic/config'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const subjectColors: Record<string, string> = {
  Mathematics: 'bg-blue-50 text-blue-800 border-blue-200',
  English: 'bg-green-50 text-green-800 border-green-200',
  Science: 'bg-purple-50 text-purple-800 border-purple-200',
  Urdu: 'bg-orange-50 text-orange-800 border-orange-200',
  Islamiat: 'bg-teal-50 text-teal-800 border-teal-200',
  Computer: 'bg-indigo-50 text-indigo-800 border-indigo-200',
  History: 'bg-amber-50 text-amber-800 border-amber-200',
  Art: 'bg-pink-50 text-pink-800 border-pink-200',
  'Physical Education': 'bg-lime-50 text-lime-800 border-lime-200',
  Break: 'bg-gray-100 text-gray-600 border-gray-300 font-bold',
}

export default function TimetablePage() {
  const router = useRouter()
  const { data: session, status: sessionStatus } = useSession()
  const role = session?.user?.role || ''
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const isTeacher = role === 'TEACHER'
  const isStudent = role === 'STUDENT'

  useEffect(() => {
    if (sessionStatus !== 'authenticated') return
    if (isAdmin) {
      router.replace('/dashboard/academic?tab=timetable')
      return
    }
    if (isStudent && isAcademicEnginePrimary()) {
      router.replace('/dashboard/enrollment?tab=courses')
    }
  }, [sessionStatus, isAdmin, isStudent, router])

  const queryClient = useQueryClient()

  // Selected filters for viewing timetable
  const [selectedClassId, setSelectedClassId] = useState<string>('')
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('')
  const [teacherPickerMode, setTeacherPickerMode] = useState<TeacherPickerMode>('scoped')
  const [formPickerMode, setFormPickerMode] = useState<TeacherPickerMode>('scoped')

  // Dialog states
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<any>(null)
  const [isRequestOpen, setIsRequestOpen] = useState(false)
  const [selectedRequestSlot, setSelectedRequestSlot] = useState<any>(null)

  // Form states
  const [formClassId, setFormClassId] = useState('')
  const [formTeacherId, setFormTeacherId] = useState('')
  const [formDayOfWeek, setFormDayOfWeek] = useState(0)
  const [formStartTime, setFormStartTime] = useState('09:00')
  const [formEndTime, setFormEndTime] = useState('09:45')
  const [formSubject, setFormSubject] = useState('')
  const [formAcademicYear, setFormAcademicYear] = useState('2025-2026')
  const [formShift, setFormShift] = useState<SessionShift>('MORNING')
  const [formRequestReason, setFormRequestReason] = useState('')

  const [scope, setScope] = useState<AcademicScopeState>({
    campusId: '',
    batchId: '',
    shift: 'MORNING',
    classId: '',
    houseId: '',
  })
  const hierarchy = useAcademicHierarchy(scope, setScope, {
    mode: 'admin',
    enabled: isAdmin,
  })
  const filterShift = scope.shift

  // Fetch teacher profile if teacher
  const { data: teacherProfile } = useQuery<any>({
    queryKey: ['teacher-profile', session?.user?.id],
    queryFn: () => fetchApi<any>('/api/teachers/profile'),
    enabled: isTeacher,
  })

  // Fetch student profile if student
  const { data: studentProfile } = useQuery<any>({
    queryKey: ['student-profile', session?.user?.id],
    queryFn: () => fetchApi<any>('/api/students/profile'),
    enabled: isStudent,
  })

  const classes = hierarchy.filteredClasses

  useEffect(() => {
    if (scope.classId) {
      setSelectedClassId(scope.classId)
      setFormClassId(scope.classId)
    }
  }, [scope.classId])

  useEffect(() => {
    setFormShift(filterShift)
  }, [filterShift])

  const { data: pendingRequestsData } = useQuery({
    queryKey: ['timetable-requests-pending-count'],
    queryFn: () =>
      fetchPaginatedApi<{ id: string }>('/api/teacher-portal/timetable-requests?status=PENDING&limit=1'),
    enabled: isAdmin,
    staleTime: 30_000,
  })
  const pendingRequestCount = pendingRequestsData?.pagination?.total ?? 0

  // Resolve target filters for timetable retrieval
  let targetClassId = ''
  let targetTeacherId = ''

  if (isStudent) {
    targetClassId = studentProfile?.classId || ''
  } else if (isTeacher) {
    targetTeacherId = teacherProfile?.id || ''
  } else {
    targetClassId = selectedClassId
    targetTeacherId = selectedTeacherId
  }

  // WHY: we derive the teacher's primary shift from their class assignments
  // so that the API shift-filter works correctly for night/evening shifts.
  const teacherShift = (
    teacherProfile?.timetableSlots?.[0]?.classSection?.shift?.code
    ?? teacherProfile?.classes?.[0]?.class?.shift
    ?? undefined
  ) as SessionShift | undefined

  const studentShift = (studentProfile?.shift ?? studentProfile?.class?.shift) as SessionShift | undefined
  const effectiveShift = isStudent ? studentShift : isAdmin ? filterShift : teacherShift

  // Fetch timetable slots based on target filters
  const { data: timetableData, isLoading } = useQuery<any>({
    queryKey: ['timetable-grid', targetClassId, targetTeacherId, effectiveShift],
    queryFn: () => {
      if (targetClassId) {
        let url = `/api/timetable?classId=${targetClassId}`
        if (effectiveShift) url += `&shift=${effectiveShift}`
        return fetchApi<any>(url)
      }
      if (targetTeacherId) {
        // Always pass shift for teachers so night/evening slots are not hidden
        const params = new URLSearchParams()
        if (effectiveShift) params.set('shift', effectiveShift)
        const qs = params.toString()
        return fetchApi<any>(`/api/teachers/${targetTeacherId}/timetable${qs ? `?${qs}` : ''}`)
      }
      return Promise.resolve({ data: [] })
    },
    enabled: !!(targetClassId || targetTeacherId),
  })
  const slots = Array.isArray(timetableData)
    ? timetableData
    : timetableData?.data || []

  // Mutations
  const createMutation = useMutation({
    mutationFn: (newSlot: any) =>
      fetchApi<any>('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSlot),
      }),
    onSuccess: () => {
      notify.success('Timetable slot added successfully')
      queryClient.invalidateQueries({ queryKey: ['timetable-grid'] })
      setIsAddOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      notify.error('Failed to add slot', { description: err.message })
    },
  })

  const updateMutation = useMutation({
    mutationFn: (updated: any) =>
      fetchApi<any>(`/api/timetable/${selectedSlot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated),
      }),
    onSuccess: () => {
      notify.success('Timetable slot updated successfully')
      queryClient.invalidateQueries({ queryKey: ['timetable-grid'] })
      setIsEditOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      notify.error('Failed to update slot', { description: err.message })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () =>
      fetchApi<any>(`/api/timetable/${selectedSlot.id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      notify.success('Timetable slot deleted successfully')
      queryClient.invalidateQueries({ queryKey: ['timetable-grid'] })
      setIsEditOpen(false)
      resetForm()
    },
    onError: (err: any) => {
      notify.error('Failed to delete slot', { description: err.message })
    },
  })

  const requestMutation = useMutation({
    mutationFn: (payload: any) =>
      fetchApi<any>('/api/teacher-portal/timetable-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      notify.success('Timetable change request submitted')
      queryClient.invalidateQueries({ queryKey: ['timetable-grid'] })
      setIsRequestOpen(false)
      setSelectedRequestSlot(null)
    },
    onError: (err: any) => {
      notify.error('Failed to submit request', { description: err.message })
    },
  })

  const resetForm = () => {
    setFormClassId('')
    setFormTeacherId('')
    setFormDayOfWeek(0)
    setFormStartTime('09:00')
    setFormEndTime('09:45')
    setFormSubject('')
    setFormAcademicYear('2025-2026')
    setFormRequestReason('')
    setSelectedSlot(null)
    setSelectedRequestSlot(null)
  }

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formClassId || !formTeacherId || !formSubject || !formStartTime || !formEndTime) {
      notify.error('Please fill in all fields')
      return
    }
    createMutation.mutate({
      classId: formClassId,
      teacherId: formTeacherId,
      dayOfWeek: formDayOfWeek,
      startTime: formStartTime,
      endTime: formEndTime,
      subjectName: formSubject,
      academicYear: formAcademicYear,
      shift: formShift,
    })
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formSubject || !formStartTime || !formEndTime) {
      notify.error('Please fill in all fields')
      return
    }
    updateMutation.mutate({
      startTime: formStartTime,
      endTime: formEndTime,
      subjectName: formSubject,
      ...(formTeacherId && { teacherId: formTeacherId }),
    })
  }

  const handleRequestSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedRequestSlot) return
    if (!formRequestReason.trim()) {
      notify.error('Please provide a reason for the request')
      return
    }

    // WHY conditional ID key: slots from the new Academic Engine have source='engine'
    // and their ID maps to TimetableSlot, not Timetable. Sending the wrong ID type
    // causes a 404 when the API tries to look up the slot in the wrong table.
    const isEngineSlot = selectedRequestSlot.source === 'engine'
    requestMutation.mutate({
      ...(isEngineSlot
        ? { timetableSlotId: selectedRequestSlot.id }
        : { timetableId: selectedRequestSlot.id }),
      slotSource: isEngineSlot ? 'engine' : 'legacy',
      reason: formRequestReason.trim(),
      newDayOfWeek: formDayOfWeek,
      newStartTime: formStartTime,
      newEndTime: formEndTime,
      newSubjectName: formSubject,
    })
  }

  // Pre-load form for editing (admins) or request adjustment (teachers)
  const openEdit = (slot: any) => {
    if (isAdmin) {
      setSelectedSlot(slot)
      setFormStartTime(slot.startTime)
      setFormEndTime(slot.endTime)
      setFormSubject(slot.subjectName)
      setFormTeacherId(slot.teacherId ?? slot.teacher?.id ?? '')
      setIsEditOpen(true)
      return
    }

    if (isTeacher) {
      setSelectedRequestSlot(slot)
      setFormStartTime(slot.startTime)
      setFormEndTime(slot.endTime)
      setFormDayOfWeek(slot.dayOfWeek)
      setFormSubject(slot.subjectName)
      setIsRequestOpen(true)
    }
  }

  // Extract unique sorted time slots to represent table rows
  const timeSlots = Array.from(
    new Set(slots.map((s: any) => `${s.startTime}-${s.endTime}`))
  ).sort()

  const defaultTimeSlots = [
    '09:00-09:45',
    '09:45-10:30',
    '10:30-11:00', // Break
    '11:00-11:45',
    '11:45-12:30',
    '12:30-01:00',
  ]

  const gridSlots = timeSlots.length > 0 ? timeSlots : defaultTimeSlots

  if (sessionStatus === 'loading' || isAdmin) {
    return (
      <div className="p-8 text-center text-gray-500 text-sm">
        {isAdmin ? 'Redirecting to Academic Engine timetable…' : 'Loading…'}
      </div>
    )
  }

  return (
    <motion.div initial="initial" animate="animate" variants={staggerContainer} className="space-y-6 max-w-7xl mx-auto">
      {/* Header Panel */}
      <motion.div variants={fadeUp(0.1)} className="bg-white rounded-2xl border border-slate-200/60 shadow-soft-lg p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
            <Calendar className="w-6 h-6 text-indigo-600" /> Academic Weekly Timetable
          </h1>
          <p className="text-xs text-gray-500 font-semibold mt-1">
            {isStudent
              ? `Weekly schedule for ${studentProfile?.class?.name || 'Assigned Class'}`
              : isTeacher
              ? `Teaching schedule for ${teacherProfile?.firstName} ${teacherProfile?.lastName}`
              : 'Select class or teacher timetable to view or edit.'}
          </p>
          {isStudent && studentShift && (
            <span className={`inline-flex mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full border ${SESSION_SHIFT_BADGE_CLASS[studentShift]}`}>
              {sessionShiftFormalLabel(studentShift)}
            </span>
          )}
          {isTeacher && teacherShift && (
            <span className={`inline-flex mt-2 text-[10px] font-bold px-2.5 py-1 rounded-full border ${SESSION_SHIFT_BADGE_CLASS[teacherShift]}`}>
              {sessionShiftFormalLabel(teacherShift)}
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="border-gray-200 hover:bg-gray-50 font-bold text-xs gap-2"
          >
            <Printer className="w-4 h-4" /> Print Timetable
          </Button>

          {isAdmin && (
            <>
              <Button
                onClick={() => {
                  resetForm()
                  setIsAddOpen(true)
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-2"
              >
                <Plus className="w-4 h-4" /> Add Slot
              </Button>
              <Button
                variant="outline"
                asChild
                className="border-gray-200 hover:bg-gray-50 font-bold text-xs gap-2 relative"
              >
                <Link href="/dashboard/timetable/requests">
                  <Bell className="w-4 h-4" />
                  Review Requests
                  {pendingRequestCount > 0 && (
                    <Badge className="ml-1 bg-amber-500 text-white text-[10px] px-1.5 py-0">
                      {pendingRequestCount}
                    </Badge>
                  )}
                </Link>
              </Button>
            </>
          )}
        </div>
      </motion.div>

      {/* Filter and Scoping Panel */}
      {isAdmin && (
        <motion.div variants={fadeUp(0.2)}>
          <Card className="border-slate-200/60 shadow-soft-md">
          <CardContent className="p-4 space-y-4">
            <AcademicScopeFilters
              hierarchy={hierarchy}
              showHouse
              onScopeChange={() => setSelectedTeacherId('')}
            />
            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 font-semibold mb-3">OR view / edit a teacher&apos;s weekly schedule</p>
              <TeacherPicker
                value={selectedTeacherId}
                onValueChange={(id) => {
                  setSelectedTeacherId(id)
                  setSelectedClassId('')
                  setScope((s) => ({ ...s, classId: '' }))
                }}
                scope={scope}
                mode={teacherPickerMode}
                onModeChange={setTeacherPickerMode}
                label="Teacher schedule"
                showModeToggle
              />
            </div>
            {scope.classId && selectedClassId && (
              <p className="text-xs text-gray-500">
                Showing timetable for {formatAcademicClassLabel(classes.find((c) => c.id === selectedClassId) ?? { id: '', name: '' })}
              </p>
            )}
          </CardContent>
        </Card>
        </motion.div>
      )}

      {/* Grid Rendering */}
      <motion.div variants={fadeUp(0.3)}>
      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : !(targetClassId || targetTeacherId) ? (
        <Card className="p-8 text-center text-gray-400 text-sm shadow-sm">
          Please select a class or teacher to display the timetable grid.
        </Card>
      ) : slots.length === 0 ? (
        <Card className="p-10 text-center shadow-sm border-gray-200">
          <div className="flex flex-col items-center gap-3">
            <Calendar className="w-10 h-10 text-gray-300" />
            <p className="font-bold text-gray-600 text-sm">No timetable published yet</p>
            <p className="text-gray-400 text-xs max-w-sm leading-relaxed">
              {isTeacher
                ? 'Your administrator has not published a timetable for your assigned classes yet. Please contact the Academic Coordinator if you believe this is an error.'
                : 'No active timetable slots found for the selected class or teacher. Ensure slots are created and published in the Academic Engine.'}
            </p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden shadow-sm border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-gray-500">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3.5 text-xs font-black text-gray-500 uppercase tracking-wider w-36">Time Slot</th>
                  {DAYS.map((day) => (
                    <th key={day} className="px-3 py-3.5 text-center text-xs font-black text-gray-500 uppercase tracking-wider">
                      {day}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {gridSlots.map((timeString) => {
                  const [start, end] = timeString.split('-')
                  return (
                    <tr key={timeString} className="hover:bg-gray-50/20 transition-colors">
                      <td className="px-5 py-4 whitespace-nowrap text-xs font-mono font-bold text-gray-700 bg-gray-50/50">
                        {timeString}
                      </td>
                      {DAYS.map((_, dayIndex) => {
                        // Find matching slots
                        const matched = slots.filter(
                          (s: any) =>
                            s.dayOfWeek === dayIndex &&
                            s.startTime === start &&
                            s.endTime === end
                        )

                        return (
                          <td key={dayIndex} className="p-2 min-w-[140px] text-center border-l border-gray-50">
                            {matched.map((item: any) => {
                              const colorClass =
                                subjectColors[item.subjectName] ||
                                'bg-indigo-50 text-indigo-800 border-indigo-200'
                              return (
                                <div
                                  key={item.id}
                                  onClick={() => openEdit(item)}
                                  className={`border rounded-lg p-2.5 shadow-sm text-center transition-all ${colorClass} ${
                                    isAdmin || isTeacher ? 'cursor-pointer hover:shadow hover:scale-[1.01]' : ''
                                  }`}
                                  title={isTeacher ? 'Request an adjustment for this slot' : undefined}
                                >
                                  <div className="font-bold text-xs">{item.subjectName || item.subjectOffering?.subject?.name}</div>
                                  <div className="text-[10px] font-semibold opacity-85 mt-1">
                                    {targetClassId
                                      ? `${item.teacher?.firstName ?? ''} ${item.teacher?.lastName ?? ''}`.trim()
                                      : `${item.className ?? item.class?.name ?? ''}${item.sectionName ? ` - ${item.sectionName}` : ''}`}
                                  </div>
                                  {item.shift && (
                                    <div className="text-[9px] uppercase tracking-wide opacity-80 mt-1">{item.shift}</div>
                                  )}
                                </div>
                              )
                            })}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      </motion.div>

      {/* Add Slot Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-lg">Add Timetable Slot</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              Assign a class, subject, and teacher to a weekly time schedule.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-class" className="text-xs font-bold text-gray-600 mb-1.5 block">Class</Label>
                <select
                  id="add-class"
                  value={formClassId}
                  onChange={(e) => setFormClassId(e.target.value)}
                  className="w-full h-10 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                  required
                >
                  <option value="">Select class...</option>
                  {classes.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <TeacherPicker
                  value={formTeacherId}
                  onValueChange={setFormTeacherId}
                  scope={{ ...scope, classId: formClassId || scope.classId }}
                  mode={formPickerMode}
                  onModeChange={setFormPickerMode}
                  label="Assign teacher *"
                  showModeToggle
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-day" className="text-xs font-bold text-gray-600 mb-1.5 block">Day of Week</Label>
                <select
                  id="add-day"
                  value={formDayOfWeek}
                  onChange={(e) => setFormDayOfWeek(parseInt(e.target.value, 10))}
                  className="w-full h-10 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  {DAYS.map((day, idx) => (
                    <option key={day} value={idx}>
                      {day}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="add-subject" className="text-xs font-bold text-gray-600 mb-1.5 block">Subject Name</Label>
                <Input
                  id="add-subject"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="e.g. Mathematics"
                  required
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-gray-600 mb-1.5 block">Session Shift</Label>
              <select
                value={formShift}
                onChange={(e) => setFormShift(e.target.value as SessionShift)}
                className="w-full h-10 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              >
                <option value="MORNING">{SESSION_SHIFT_LABELS.MORNING}</option>
                <option value="EVENING">{SESSION_SHIFT_LABELS.EVENING}</option>
                <option value="NIGHT">{SESSION_SHIFT_LABELS.NIGHT}</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="add-start" className="text-xs font-bold text-gray-600 mb-1.5 block">Start Time (HH:MM)</Label>
                <Input
                  id="add-start"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  pattern="^\d{2}:\d{2}$"
                  placeholder="09:00"
                  required
                />
              </div>

              <div>
                <Label htmlFor="add-end" className="text-xs font-bold text-gray-600 mb-1.5 block">End Time (HH:MM)</Label>
                <Input
                  id="add-end"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  pattern="^\d{2}:\d{2}$"
                  placeholder="09:45"
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                Create Slot
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Slot Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-lg flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-indigo-600" /> Edit Timetable Slot
            </DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              Modify the subject and timing details for this schedule block.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label className="text-xs font-bold text-gray-400">Class Assigned</Label>
              <p className="text-sm font-bold text-gray-800 bg-gray-50 p-2.5 rounded-lg border mt-1">
                {selectedSlot?.class?.name}
              </p>
            </div>

            <TeacherPicker
              value={formTeacherId}
              onValueChange={setFormTeacherId}
              scope={{
                ...scope,
                classId: selectedSlot?.classId ?? scope.classId,
              }}
              mode={formPickerMode}
              onModeChange={setFormPickerMode}
              label="Reassign teacher"
              showModeToggle
            />

            <div>
              <Label htmlFor="edit-subject" className="text-xs font-bold text-gray-600 mb-1.5 block">Subject Name</Label>
              <Input
                id="edit-subject"
                value={formSubject}
                onChange={(e) => setFormSubject(e.target.value)}
                placeholder="e.g. Mathematics"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-start" className="text-xs font-bold text-gray-600 mb-1.5 block">Start Time</Label>
                <Input
                  id="edit-start"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  pattern="^\d{2}:\d{2}$"
                  required
                />
              </div>

              <div>
                <Label htmlFor="edit-end" className="text-xs font-bold text-gray-600 mb-1.5 block">End Time</Label>
                <Input
                  id="edit-end"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  pattern="^\d{2}:\d{2}$"
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-2 flex justify-between items-center sm:justify-between">
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (confirm('Are you sure you want to delete this timetable slot?')) {
                    deleteMutation.mutate()
                  }
                }}
                className="font-bold flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </Button>

              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setIsEditOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold">
                  Save Changes
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Timetable Request Modal for teachers */}
      <Dialog open={isRequestOpen} onOpenChange={(open) => !open && setIsRequestOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black text-lg">Request Timetable Adjustment</DialogTitle>
            <DialogDescription className="text-xs text-gray-400">
              Submit a request to change this class slot. An admin will review and approve or reject it.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRequestSubmit} className="space-y-4">
            <div>
              <Label className="text-xs font-bold text-gray-600">Original Slot</Label>
              <p className="mt-1 text-sm text-gray-700 rounded-lg border border-gray-200 bg-gray-50 p-3">
                {selectedRequestSlot?.subjectName} — {DAYS[selectedRequestSlot?.dayOfWeek ?? 0]} {selectedRequestSlot?.startTime} to {selectedRequestSlot?.endTime}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="request-day" className="text-xs font-bold text-gray-600 mb-1.5 block">Requested Day</Label>
                <select
                  id="request-day"
                  value={formDayOfWeek}
                  onChange={(e) => setFormDayOfWeek(parseInt(e.target.value, 10))}
                  className="w-full h-10 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                >
                  {DAYS.map((day, idx) => (
                    <option key={day} value={idx}>{day}</option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="request-subject" className="text-xs font-bold text-gray-600 mb-1.5 block">Requested Subject</Label>
                <Input
                  id="request-subject"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="e.g. Mathematics"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="request-start" className="text-xs font-bold text-gray-600 mb-1.5 block">Requested Start</Label>
                <Input
                  id="request-start"
                  value={formStartTime}
                  onChange={(e) => setFormStartTime(e.target.value)}
                  placeholder="09:00"
                />
              </div>
              <div>
                <Label htmlFor="request-end" className="text-xs font-bold text-gray-600 mb-1.5 block">Requested End</Label>
                <Input
                  id="request-end"
                  value={formEndTime}
                  onChange={(e) => setFormEndTime(e.target.value)}
                  placeholder="09:45"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="request-reason" className="text-xs font-bold text-gray-600 mb-1.5 block">Reason for request</Label>
              <Input
                id="request-reason"
                value={formRequestReason}
                onChange={(e) => setFormRequestReason(e.target.value)}
                placeholder="Explain why this change is needed"
              />
            </div>

            <DialogFooter className="pt-2 flex justify-between items-center">
              <Button variant="outline" type="button" onClick={() => setIsRequestOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
                {requestMutation.isLoading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /> Submit Request</>
                ) : (
                  'Submit Request'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  )
}
