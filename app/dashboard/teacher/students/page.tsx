'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { notify } from '@/lib/notify'
import {
  Search, ChevronLeft, ChevronRight, Users, MapPin, Building2,
  GraduationCap, Filter, SendHorizonal, UserX, ShieldAlert,
  CalendarDays, Phone, Mail, Hash,
} from 'lucide-react'
import { useSession } from 'next-auth/react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: string
  registrationNumber: string
  rollNumber: string | null
  firstName: string
  lastName: string
  fatherName: string
  gender: string
  dateOfBirth: string
  enrollmentStatus: string
  profilePicture: string | null
  phoneNumber: string
  email: string | null
  section: string | null
  academicYear: string
  campus: { id: string; name: string; code: string; city: string }
  batch:  { id: string; name: string; code: string; academicYear: string }
  class:  { id: string; name: string; section: string; grade: number } | null
  house:  { id: string; name: string; color: string } | null
}

interface ClassRecord {
  id: string
  name: string
  section: string
  batchId: string
  campusId: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ENROLLMENT_STYLES: Record<string, string> = {
  ACTIVE:     'bg-emerald-100 text-emerald-800 border-emerald-200',
  SUSPENDED:  'bg-red-100 text-red-800 border-red-200',
  GRADUATED:  'bg-indigo-100 text-indigo-800 border-indigo-200',
  WITHDRAWN:  'bg-gray-100 text-gray-700 border-gray-200',
  ON_LEAVE:   'bg-amber-100 text-amber-800 border-amber-200',
}

const GENDER_ICON: Record<string, string> = { MALE: '♂', FEMALE: '♀' }

// ─── Sub-components ───────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 6 }).map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full max-w-[120px]" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// ─── Request-to-Admin Dialog ──────────────────────────────────────────────────

interface RequestDialogProps {
  student: Student | null
  open: boolean
  onClose: () => void
}

function RequestAdminDialog({ student, open, onClose }: RequestDialogProps) {
  const [requestType, setRequestType] = useState<string>('SUSPEND')
  const [reason, setReason]           = useState('')
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      fetchApi('/api/teacher-portal/applications', {
        method: 'POST',
        body: JSON.stringify({
          type: 'OTHER',
          title: `${requestType === 'SUSPEND' ? 'Suspension' : requestType === 'RE_ENROLL' ? 'Re-Enrolment' : requestType === 'WITHDRAW' ? 'Withdrawal' : 'Student Action'} Request — ${student?.registrationNumber}`,
          description: `Student: ${student?.firstName} ${student?.lastName} (${student?.registrationNumber})\nClass: ${student?.class?.name ?? 'N/A'} | Batch: ${student?.batch?.name}\nCampus: ${student?.campus?.name}\n\nReason:\n${reason}`,
        }),
      }),
    onSuccess: () => {
      notify.success('Request sent to Admin successfully')
      queryClient.invalidateQueries({ queryKey: ['teacher-applications'] })
      setReason('')
      onClose()
    },
    onError: (err: any) => {
      notify.error(err.message || 'Failed to send request')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!reason.trim()) { notify.error('Please provide a reason'); return }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Request Admin Action
          </DialogTitle>
          <DialogDescription>
            This request will be sent to the Admin for review and action. You cannot directly modify student records.
          </DialogDescription>
        </DialogHeader>

        {student && (
          <div className="py-1 px-3 bg-gray-50 rounded-lg border text-sm space-y-0.5">
            <p className="font-semibold text-gray-900">{student.firstName} {student.lastName}</p>
            <p className="text-gray-500 text-xs">{student.registrationNumber} · {student.class?.name ?? 'No class'} · {student.campus.code}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Action Type</Label>
            <Select value={requestType} onValueChange={setRequestType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUSPEND">Request Suspension</SelectItem>
                <SelectItem value="RE_ENROLL">Request Re-Enrolment</SelectItem>
                <SelectItem value="WITHDRAW">Request Withdrawal</SelectItem>
                <SelectItem value="SECTION_CHANGE">Request Section Change</SelectItem>
                <SelectItem value="OTHER">Other Request</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Detailed Reason *</Label>
            <Textarea
              required
              rows={4}
              placeholder="Explain why this action is needed. Be specific so the Admin can act on it quickly."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="resize-none"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={mutation.isPending} className="gap-2">
              <SendHorizonal className="w-4 h-4" />
              {mutation.isPending ? 'Sending...' : 'Send to Admin'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── Student Detail Drawer ────────────────────────────────────────────────────

interface StudentDetailDialogProps {
  student: Student | null
  open: boolean
  onClose: () => void
  onRequestAction: () => void
}

function StudentDetailDialog({ student, open, onClose, onRequestAction }: StudentDetailDialogProps) {
  if (!student) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Student Profile</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Avatar + Name */}
          <div className="flex items-center gap-4">
            {student.profilePicture ? (
              <img
                src={student.profilePicture}
                alt={student.firstName}
                className="w-16 h-16 rounded-full object-cover ring-2 ring-indigo-100"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xl font-bold flex-shrink-0">
                {student.firstName[0]}{student.lastName[0]}
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold text-gray-900">{student.firstName} {student.lastName}</h2>
              <p className="text-sm text-gray-500">{student.fatherName}</p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ENROLLMENT_STYLES[student.enrollmentStatus] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {student.enrollmentStatus.replace('_', ' ')}
                </span>
                <span className="text-xs text-gray-400">{GENDER_ICON[student.gender]} {student.gender}</span>
              </div>
            </div>
          </div>

          {/* Grid: Academic & Campus Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="Reg. No" value={student.registrationNumber} mono />
            <InfoRow icon={<Hash className="w-3.5 h-3.5" />} label="Roll No" value={student.rollNumber ?? '—'} mono />
            <InfoRow icon={<GraduationCap className="w-3.5 h-3.5" />} label="Class" value={student.class ? `${student.class.name} (${student.class.section})` : '—'} />
            <InfoRow icon={<Users className="w-3.5 h-3.5" />} label="Batch" value={`${student.batch.name} (${student.batch.code})`} />
            <InfoRow icon={<Building2 className="w-3.5 h-3.5" />} label="Campus" value={`${student.campus.name} — ${student.campus.city}`} />
            <InfoRow icon={<CalendarDays className="w-3.5 h-3.5" />} label="Academic Year" value={student.academicYear} />
            {student.house && (
              <div className="col-span-2 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: student.house.color }} />
                <span className="text-gray-500 text-xs">House:</span>
                <span className="text-gray-800 font-medium text-xs">{student.house.name}</span>
              </div>
            )}
          </div>

          {/* Contact */}
          <div className="border-t pt-3 grid grid-cols-2 gap-3 text-sm">
            <InfoRow icon={<Phone className="w-3.5 h-3.5" />} label="Phone" value={student.phoneNumber} />
            <InfoRow icon={<Mail className="w-3.5 h-3.5" />} label="Email" value={student.email ?? '—'} />
          </div>
        </div>

        <DialogFooter className="mt-4 flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
          <Button
            variant="outline"
            className="flex-1 gap-2 text-amber-700 border-amber-200 hover:bg-amber-50"
            onClick={() => { onClose(); onRequestAction() }}
          >
            <UserX className="w-4 h-4" /> Request Admin Action
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({
  icon, label, value, mono = false,
}: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="text-gray-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] text-gray-400 leading-none">{label}</p>
        <p className={`text-gray-800 mt-0.5 ${mono ? 'font-mono text-xs' : 'text-sm font-medium'}`}>{value}</p>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TeacherMyStudentsPage() {
  const { data: session } = useSession()
  const isTeacher = session?.user?.role === 'TEACHER'

  const [page, setPage]                         = useState(1)
  const [search, setSearch]                     = useState('')
  const [classFilter, setClassFilter]           = useState('')
  const [enrollmentFilter, setEnrollmentFilter] = useState('')
  const [showFilters, setShowFilters]           = useState(false)
  const [selectedStudent, setSelectedStudent]   = useState<Student | null>(null)
  const [detailOpen, setDetailOpen]             = useState(false)
  const [requestOpen, setRequestOpen]           = useState(false)

  const limit = 25

  // ── Fetch classes this teacher teaches ─────────────────────────────────────
  const { data: classesRaw } = useQuery({
    queryKey: ['teacher-classes'],
    queryFn: () => fetchApi<ClassRecord[]>('/api/teacher-portal/classes'),
    enabled: isTeacher,
    staleTime: 5 * 60 * 1000,
  })
  const classes = classesRaw ?? []

  // ── Fetch students ─────────────────────────────────────────────────────────
  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))
  if (search)           params.set('search', search)
  if (classFilter)      params.set('classId', classFilter)
  if (enrollmentFilter) params.set('enrollmentStatus', enrollmentFilter)

  const { data, isLoading } = useQuery({
    queryKey: ['teacher-my-students', page, search, classFilter, enrollmentFilter],
    queryFn: () => fetchPaginatedApi<Student>(`/api/teacher-portal/my-students?${params.toString()}`),
    enabled: isTeacher,
    staleTime: 30_000,
  })

  const students   = data?.data ?? []
  const pagination = data?.pagination

  const statusCounts = students.reduce((acc, student) => {
    acc[student.enrollmentStatus] = (acc[student.enrollmentStatus] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const handleSearch = (val: string) => { setSearch(val); setPage(1) }

  if (!isTeacher) {
    return (
      <div className="flex items-center justify-center min-h-[400px] text-gray-400">
        <div className="text-center space-y-2">
          <ShieldAlert className="w-10 h-10 mx-auto text-gray-300" />
          <p className="text-sm font-medium">Access Restricted</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5 p-6">
      {/* ── Header ── */}
      <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white px-6 py-5 shadow-sm sm:px-8 sm:py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
              <Users className="w-6 h-6 text-indigo-600" />
              My Students
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600 max-w-2xl">
              View student records for your assigned classes, track enrollment status, and submit admin requests from a clean, teacher-first dashboard.
            </p>
          </div>
          <Button
            variant="outline"
            className="gap-2 text-amber-700 border-amber-200 hover:bg-amber-50 text-sm"
            onClick={() => { setSelectedStudent(null); setRequestOpen(true) }}
          >
            <SendHorizonal className="w-4 h-4" />
            Request Admin Action
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Total students</p>
            <p className="mt-3 text-3xl font-semibold text-slate-900">
              {pagination ? pagination.total.toLocaleString() : students.length}
            </p>
            <p className="mt-1 text-sm text-slate-500">Across all matched records</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Active</p>
            <p className="mt-3 text-3xl font-semibold text-emerald-700">
              {(statusCounts.ACTIVE ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-500">On this page</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">On leave</p>
            <p className="mt-3 text-3xl font-semibold text-amber-700">
              {(statusCounts.ON_LEAVE ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-500">On this page</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Suspended</p>
            <p className="mt-3 text-3xl font-semibold text-red-700">
              {(statusCounts.SUSPENDED ?? 0).toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-slate-500">On this page</p>
          </div>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
        <div className="p-4 border-b flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search name, reg no, roll no, father name…"
              className="pl-9"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>

          {/* Class quick-filter */}
          <Select
            value={classFilter || '_all'}
            onValueChange={(v) => { setClassFilter(v === '_all' ? '' : v); setPage(1) }}
          >
            <SelectTrigger className="w-48 text-sm">
              <SelectValue placeholder="All Classes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_all">All Classes</SelectItem>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.section})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setShowFilters((v) => !v)}
          >
            <Filter className="w-4 h-4" />
            More{' '}
            {enrollmentFilter && (
              <span className="ml-1 w-2 h-2 bg-indigo-500 rounded-full inline-block" />
            )}
          </Button>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="p-4 border-b bg-gray-50 flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Enrollment Status</label>
              <Select
                value={enrollmentFilter || '_all'}
                onValueChange={(v) => { setEnrollmentFilter(v === '_all' ? '' : v); setPage(1) }}
              >
                <SelectTrigger className="h-8 text-sm w-44">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ON_LEAVE">On Leave</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
                  <SelectItem value="GRADUATED">Graduated</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-gray-500 h-8"
              onClick={() => {
                setEnrollmentFilter('')
                setClassFilter('')
                setSearch('')
                setPage(1)
              }}
            >
              Clear filters
            </Button>
          </div>
        )}

        {/* ── Table ── */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 text-xs uppercase tracking-wide">
                <TableHead className="py-3">Student</TableHead>
                <TableHead>Roll / Reg No.</TableHead>
                <TableHead>Class & Batch</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>House</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-36 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-7 h-7 text-gray-300" />
                      <span className="text-sm">
                        {search ? `No students found for "${search}"` : 'No students found'}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                students.map((student) => (
                  <TableRow
                    key={student.id}
                    className="hover:bg-indigo-50/30 transition-colors cursor-pointer"
                    onClick={() => {
                      setSelectedStudent(student)
                      setDetailOpen(true)
                    }}
                  >
                    {/* Student */}
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {student.profilePicture ? (
                          <img
                            src={student.profilePicture}
                            alt={student.firstName}
                            className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-200"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                            {student.firstName[0]}{student.lastName[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {student.firstName} {student.lastName}
                          </p>
                          <p className="text-[11px] text-gray-400 truncate">{student.fatherName}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* Roll / Reg */}
                    <TableCell>
                      <p className="font-mono text-xs text-gray-600">{student.registrationNumber}</p>
                      {student.rollNumber && (
                        <p className="text-[10px] text-gray-400">Roll #{student.rollNumber}</p>
                      )}
                    </TableCell>

                    {/* Class & Batch */}
                    <TableCell>
                      <p className="text-sm font-medium text-gray-800">
                        {student.class ? student.class.name : <span className="text-gray-400 text-xs">Unassigned</span>}
                      </p>
                      <p className="text-[11px] text-gray-400">{student.batch.name} · {student.batch.code}</p>
                    </TableCell>

                    {/* Campus */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <div>
                          <p className="text-xs font-semibold text-indigo-600">{student.campus.code}</p>
                          <p className="text-[10px] text-gray-400">{student.campus.city}</p>
                        </div>
                      </div>
                    </TableCell>

                    {/* House */}
                    <TableCell>
                      {student.house ? (
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ background: student.house.color }}
                          />
                          <span className="text-xs font-medium text-gray-700">{student.house.name}</span>
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </TableCell>

                    {/* Status */}
                    <TableCell>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${
                          ENROLLMENT_STYLES[student.enrollmentStatus] ?? 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {student.enrollmentStatus.replace('_', ' ')}
                      </span>
                    </TableCell>

                    {/* Action */}
                    <TableCell
                      className="text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 text-xs"
                          onClick={() => {
                            setSelectedStudent(student)
                            setDetailOpen(true)
                          }}
                        >
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                          title="Send a request to Admin"
                          onClick={() => {
                            setSelectedStudent(student)
                            setRequestOpen(true)
                          }}
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline" size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-medium text-gray-700 px-2">
                {page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline" size="sm"
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page >= pagination.totalPages}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Info callout ── */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm">
        <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-amber-800">Read-only view</p>
          <p className="text-amber-700 text-xs mt-0.5">
            You can view student academic details but cannot add, suspend, or modify student records directly.
            Use the <strong>Request Admin Action</strong> button to submit a request — the Admin will review and act on it.
          </p>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <StudentDetailDialog
        student={selectedStudent}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onRequestAction={() => setRequestOpen(true)}
      />

      <RequestAdminDialog
        student={selectedStudent}
        open={requestOpen}
        onClose={() => { setRequestOpen(false); setSelectedStudent(null) }}
      />
    </div>
  )
}
