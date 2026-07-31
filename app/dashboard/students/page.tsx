'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, ChevronLeft, ChevronRight, SlidersHorizontal, Download, ClipboardList, UserX, FileUp, GraduationCap } from 'lucide-react'
import Link from 'next/link'
import { AccessDenied } from '@/components/AccessDenied'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { notify } from '@/lib/notify'
import { downloadStudentsMasterExcel } from '@/lib/excel'
import { StudentQuickViewDialog } from '@/components/students/StudentQuickViewDialog'
import { SESSION_SHIFT_BADGE_CLASS, SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'
import { motion, AnimatePresence } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'

interface ActiveEnrollment {
  id: string
  rollNumber: string
  classSection: {
    className: string
    sectionName: string
    shift: { code: SessionShift; name: string }
  }
}

interface Student {
  id: string
  firstName: string
  lastName: string
  fatherName: string
  registrationNumber: string
  rollNumber?: string
  gender: string
  enrollmentStatus: string
  feeStatus: string
  dueAmount: number
  profilePicture?: string
  campus: { id: string; name: string; code: string }
  batch: { id: string; name: string; code: string }
  class?: { id: string; name: string; grade: number }
  house?: { id: string; name: string; color: string }
  activeEnrollments?: ActiveEnrollment[]
}

const FEE_STATUS_STYLES: Record<string, string> = {
  PAID: 'bg-green-100 text-green-700 border-green-200',
  PENDING: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-700 border-blue-200',
  OVERDUE: 'bg-red-100 text-red-700 border-red-200',
}

const ENROLLMENT_STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-700',
  SUSPENDED: 'bg-red-100 text-red-700',
  GRADUATED: 'bg-gray-100 text-gray-700',
  WITHDRAWN: 'bg-gray-100 text-gray-500',
  ON_LEAVE: 'bg-orange-100 text-orange-700',
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <TableRow key={i}>
          {Array.from({ length: 8 }).map((__, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

function formatSections(student: Student): string {
  if (student.activeEnrollments && student.activeEnrollments.length > 0) {
    return student.activeEnrollments
      .map((e) => `${e.classSection.className}-${e.classSection.sectionName}`)
      .join(', ')
  }
  return student.class?.name ?? ''
}

export default function StudentsListPage() {
  const { data: session, status } = useSession()
  const queryClient = useQueryClient()
  const userRole = session?.user?.role as string | undefined
  const canManage = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN'
  const canExport = canManage || userRole === 'ACCOUNTANT'
  const canViewStudents = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'].includes(userRole ?? '')

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [feeStatusFilter, setFeeStatusFilter] = useState('')
  const [enrollmentFilter, setEnrollmentFilter] = useState('')
  const [campusFilter, setCampusFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [classSectionFilter, setClassSectionFilter] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [suspendingId, setSuspendingId] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const limit = 20

  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))
  params.set('includeEnrollments', 'true')
  if (search) params.set('search', search)
  if (feeStatusFilter) params.set('feeStatus', feeStatusFilter)
  if (enrollmentFilter) params.set('enrollmentStatus', enrollmentFilter)
  if (campusFilter) params.set('campusId', campusFilter)
  if (batchFilter) params.set('batchId', batchFilter)
  if (classSectionFilter) params.set('classSectionId', classSectionFilter)

  const { data, isLoading } = useQuery({
    queryKey: ['students', page, search, feeStatusFilter, enrollmentFilter, campusFilter, batchFilter, classSectionFilter],
    queryFn: () => fetchPaginatedApi<Student>(`/api/students?${params.toString()}`),
    staleTime: 30_000,
    enabled: canViewStudents,
  })

  const { data: campusesRaw } = useQuery({
    queryKey: ['campuses-list'],
    queryFn: () => fetchApi<Array<{ id: string; name: string; code: string }>>('/api/campuses'),
    enabled: canViewStudents && showFilters,
  })
  const campuses = Array.isArray(campusesRaw) ? campusesRaw : (campusesRaw as { data?: Array<{ id: string; name: string; code: string }> })?.data ?? []

  const { data: batchesRaw } = useQuery({
    queryKey: ['batches-list', campusFilter],
    queryFn: () => fetchApi<Array<{ id: string; name: string; code: string }>>(`/api/batches?campusId=${campusFilter}`),
    enabled: canViewStudents && showFilters && !!campusFilter,
  })
  const batches = Array.isArray(batchesRaw) ? batchesRaw : (batchesRaw as { data?: Array<{ id: string; name: string; code: string }> })?.data ?? []

  const { data: sectionsRaw } = useQuery({
    queryKey: ['sections-filter', campusFilter, batchFilter],
    queryFn: () => {
      const p = new URLSearchParams()
      if (campusFilter) p.set('campusId', campusFilter)
      if (batchFilter) p.set('batchId', batchFilter)
      return fetchApi<Array<{ id: string; className: string; sectionName: string }>>(`/api/class-sections?${p}`)
    },
    enabled: showFilters && !!campusFilter,
  })
  const sections = Array.isArray(sectionsRaw)
    ? sectionsRaw
    : (sectionsRaw as { data?: Array<{ id: string; className: string; sectionName: string }> })?.data ?? []

  const students = data?.data ?? []
  const pagination = data?.pagination

  const handleSearch = (val: string) => {
    setSearch(val)
    setPage(1)
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const exportParams = new URLSearchParams()
      if (campusFilter) exportParams.set('campusId', campusFilter)
      const res = await fetchApi<unknown[]>(`/api/exports/students?${exportParams}`)
      const rows = Array.isArray(res) ? res : (res as { data?: unknown[] })?.data ?? []
      downloadStudentsMasterExcel(rows as Parameters<typeof downloadStudentsMasterExcel>[0])
      notify.success('Student register exported')
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const handleSuspend = async (student: Student) => {
    if (!canManage) return
    if (!confirm(`Suspend ${student.firstName} ${student.lastName} (${student.registrationNumber})?`)) return
    setSuspendingId(student.id)
    try {
      await fetchApi(`/api/students/${student.id}`, { method: 'DELETE' })
      notify.success('Student suspended')
      queryClient.invalidateQueries({ queryKey: ['students'] })
    } catch (err: unknown) {
      notify.error(err instanceof Error ? err.message : 'Failed to suspend')
    } finally {
      setSuspendingId(null)
    }
  }

  if (status === 'loading') return null
  if (!canViewStudents) {
    return (
      <AccessDenied
        title="Student Directory Restricted"
        message="The global student directory is for administrators and accountants only. Teachers can view assigned students from Teacher Portal → My Students."
      />
    )
  }

  return (
    <motion.div 
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      className="space-y-4 sm:space-y-6 max-w-7xl mx-auto p-3.5 sm:p-6"
    >
      <motion.div variants={fadeUp(0.1)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3.5 bg-white p-4 sm:p-5 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-blue-100 rounded-lg text-blue-600 shrink-0">
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            Students Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium sm:ml-11">
            {pagination ? `${pagination.total.toLocaleString()} registered students` : 'Loading…'}
            <span className="mx-2 text-slate-300">•</span>
            <Link href="/dashboard/admissions" className="text-blue-600 hover:text-blue-700 font-semibold hover:underline">
              View admissions queue
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {canExport && (
            <Button variant="outline" size="sm" className="gap-2 flex-1 sm:flex-initial h-9 text-xs" disabled={exporting} onClick={handleExport}>
              <Download className="w-3.5 h-3.5" />
              {exporting ? 'Exporting…' : 'Export Excel'}
            </Button>
          )}
          {canManage && (
            <>
              <Link href="/dashboard/admissions" className="flex-1 sm:flex-initial">
                <Button variant="outline" size="sm" className="gap-2 w-full h-9 text-xs">
                  <ClipboardList className="w-3.5 h-3.5" />
                  Queue
                </Button>
              </Link>
              <Link href="/dashboard/students/import" className="flex-1 sm:flex-initial">
                <Button variant="outline" size="sm" className="gap-2 w-full h-9 text-xs">
                  <FileUp className="w-3.5 h-3.5" />
                  Import
                </Button>
              </Link>
              <Link href="/dashboard/students/admission" className="w-full sm:w-auto">
                <Button className="gap-2 w-full h-9 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  New Admission
                </Button>
              </Link>
            </>
          )}
        </div>
      </motion.div>

      <motion.div variants={fadeUp(0.2)} className="bg-white rounded-2xl border border-slate-200/60 shadow-soft-md overflow-hidden flex flex-col">
        <div className="p-3.5 sm:p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              type="search"
              placeholder="Search name, reg no, roll, father…"
              className="pl-9 h-9 text-xs sm:text-sm"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9 text-xs shrink-0 self-end sm:self-auto"
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Filters
            {(feeStatusFilter || enrollmentFilter || campusFilter || batchFilter || classSectionFilter) && (
              <span className="w-2 h-2 bg-blue-500 rounded-full" />
            )}
          </Button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-4 sm:p-5 border-b border-slate-100 bg-white grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Campus</label>
              <Select value={campusFilter || 'ALL'} onValueChange={(v) => { setCampusFilter(v === 'ALL' ? '' : v); setBatchFilter(''); setClassSectionFilter(''); setPage(1) }}>
                <SelectTrigger className="h-8 text-xs sm:text-sm"><SelectValue placeholder="All campuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All campuses</SelectItem>
                  {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Batch</label>
              <Select value={batchFilter || 'ALL'} onValueChange={(v) => { setBatchFilter(v === 'ALL' ? '' : v); setClassSectionFilter(''); setPage(1) }} disabled={!campusFilter}>
                <SelectTrigger className="h-8 text-xs sm:text-sm"><SelectValue placeholder="All batches" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All batches</SelectItem>
                  {batches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Class section (engine)</label>
              <Select value={classSectionFilter || 'ALL'} onValueChange={(v) => { setClassSectionFilter(v === 'ALL' ? '' : v); setPage(1) }} disabled={!campusFilter}>
                <SelectTrigger className="h-8 text-xs sm:text-sm"><SelectValue placeholder="All sections" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All sections</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.className}-{s.sectionName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Fee status</label>
              <Select value={feeStatusFilter || 'ALL'} onValueChange={(v) => { setFeeStatusFilter(v === 'ALL' ? '' : v); setPage(1) }}>
                <SelectTrigger className="h-8 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="PAID">Paid</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="PARTIALLY_PAID">Partially paid</SelectItem>
                  <SelectItem value="OVERDUE">Overdue</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Enrollment</label>
              <Select value={enrollmentFilter || 'ALL'} onValueChange={(v) => { setEnrollmentFilter(v === 'ALL' ? '' : v); setPage(1) }}>
                <SelectTrigger className="h-8 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="GRADUATED">Graduated</SelectItem>
                  <SelectItem value="WITHDRAWN">Withdrawn</SelectItem>
                  <SelectItem value="ON_LEAVE">On leave</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-gray-500 h-8"
                onClick={() => {
                  setFeeStatusFilter('')
                  setEnrollmentFilter('')
                  setCampusFilter('')
                  setBatchFilter('')
                  setClassSectionFilter('')
                  setSearch('')
                  setPage(1)
                }}
              >
                Clear all
              </Button>
            </div>
          </div>
        </motion.div>
          )}
        </AnimatePresence>

        {/* Mobile View: Cards (< sm) */}
        <div className="block sm:hidden divide-y divide-slate-100">
          {isLoading ? (
            <div className="p-4 space-y-3">
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-16 w-full rounded-xl" />
            </div>
          ) : students.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              <UserX className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-sm font-medium">No students found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting search or filters.</p>
            </div>
          ) : (
            students.map((student) => (
              <div key={student.id} className="p-3.5 space-y-2.5 hover:bg-slate-50 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {student.profilePicture ? (
                      <img src={student.profilePicture} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                        {student.firstName[0]}{student.lastName[0]}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">{student.firstName} {student.lastName}</p>
                      <p className="text-xs text-gray-400 truncate">{student.fatherName}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${ENROLLMENT_STATUS_STYLES[student.enrollmentStatus] ?? ''}`}>
                      {student.enrollmentStatus.replace('_', ' ')}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium ${FEE_STATUS_STYLES[student.feeStatus] ?? ''}`}>
                      {student.feeStatus.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                  <div>
                    <span className="text-gray-400 text-[10px] block uppercase">Reg No</span>
                    <span className="font-mono text-gray-800 font-medium">{student.registrationNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block uppercase">Class / Section</span>
                    <span className="font-medium text-gray-800 truncate block">
                      {formatSections(student) || 'Unassigned'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block uppercase">Campus</span>
                    <span className="font-bold text-blue-600">{student.campus.code}</span>
                  </div>
                  <div>
                    <span className="text-gray-400 text-[10px] block uppercase">Batch</span>
                    <span className="text-gray-600">{student.batch.code}</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" className="h-8 text-xs text-blue-600 border-blue-200" onClick={() => setSelectedStudentId(student.id)}>
                    Quick View
                  </Button>
                  <Link href={`/dashboard/students/${student.id}`}>
                    <Button variant="outline" size="sm" className="h-8 text-xs">Profile</Button>
                  </Link>
                  {canManage && student.enrollmentStatus !== 'SUSPENDED' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-600 h-8 w-8 p-0"
                      disabled={suspendingId === student.id}
                      onClick={() => handleSuspend(student)}
                    >
                      <UserX className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View: Table (>= sm) */}
        <div className="hidden sm:block relative w-full overflow-x-auto min-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Student</TableHead>
                <TableHead>Reg. #</TableHead>
                <TableHead>Sections / Class</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableSkeleton />
              ) : students.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-64">
                    <EmptyState 
                      icon={UserX}
                      title="No students found"
                      description={search || feeStatusFilter || enrollmentFilter ? "Try adjusting your filters to find what you're looking for." : "There are currently no students in the directory."}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                students.map((student) => (
                  <TableRow key={student.id} className="hover:bg-slate-50/80 transition-colors group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {student.profilePicture ? (
                          <img src={student.profilePicture} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                            {student.firstName[0]}{student.lastName[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 truncate">{student.firstName} {student.lastName}</p>
                          <p className="text-xs text-gray-400 truncate">{student.fatherName}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{student.registrationNumber}</TableCell>
                    <TableCell>
                      <div className="text-sm text-gray-800">{formatSections(student) || <span className="text-gray-400 text-xs">Unassigned</span>}</div>
                      {student.activeEnrollments && student.activeEnrollments.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {student.activeEnrollments.map((e) => {
                            const code = e.classSection.shift.code
                            return (
                              <span key={e.id} className={`text-[9px] px-1.5 py-0 rounded border ${SESSION_SHIFT_BADGE_CLASS[code]}`}>
                                {SESSION_SHIFT_LABELS[code]}
                              </span>
                            )
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="font-bold text-blue-600 text-xs">{student.campus.code}</span>
                      <span className="text-gray-400 mx-1">·</span>
                      <span className="text-gray-600 text-xs">{student.batch.code}</span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ENROLLMENT_STATUS_STYLES[student.enrollmentStatus] ?? ''}`}>
                        {student.enrollmentStatus.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${FEE_STATUS_STYLES[student.feeStatus] ?? ''}`}>
                        {student.feeStatus.replace('_', ' ')}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" className="text-blue-600 text-xs" onClick={() => setSelectedStudentId(student.id)}>
                          View →
                        </Button>
                        <Link href={`/dashboard/students/${student.id}`}>
                          <Button variant="ghost" size="sm" className="text-xs hidden sm:inline-flex">Profile</Button>
                        </Link>
                        {canManage && student.enrollmentStatus !== 'SUSPENDED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 p-2 h-8 w-8"
                            disabled={suspendingId === student.id}
                            onClick={() => handleSuspend(student)}
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {pagination && pagination.totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 border-t bg-gray-50 gap-2.5">
            <p className="text-xs sm:text-sm text-gray-500">
              {((page - 1) * limit) + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs sm:text-sm font-medium px-2">{page} / {pagination.totalPages}</span>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      <StudentQuickViewDialog
        studentId={selectedStudentId}
        onClose={() => setSelectedStudentId(null)}
        canEdit={canManage}
      />
    </motion.div>
  )
}
