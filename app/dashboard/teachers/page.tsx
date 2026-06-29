'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchPaginatedApi, fetchApi } from '@/lib/api-client'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Search, ChevronLeft, ChevronRight, Users, Phone, Mail, Trash2, MapPin, FileText, UserX } from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { useSession } from 'next-auth/react'
import { AccessDenied } from '@/components/AccessDenied'
import { notify } from '@/lib/notify'
import { generateTeacherProfile } from '@/lib/pdf'
import { SESSION_SHIFT_BADGE_CLASS, SESSION_SHIFT_LABELS, type SessionShift } from '@/lib/validation/shift'
import { motion } from 'framer-motion'
import { fadeUp, staggerContainer } from '@/lib/animations'
import { EmptyState } from '@/components/shared/empty-state'
import { useMemo } from 'react'
import { getDesignationBadge } from '@/lib/constants/staff-designations'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface Teacher {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  specialization?: string
  qualification: string
  experienceYears: number
  phoneNumber: string
  email: string
  profilePicture?: string
  isActive: boolean
  joiningDate: string
  campus: { id: string; name: string; code: string }
  batch?: { id: string; name: string }
  house?: { id: string; name: string }
}

export default function TeachersPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedTeacherId, setSelectedTeacherId] = useState<string | null>(null)
  const [deletingTeacherId, setDeletingTeacherId] = useState<string | null>(null)

  const { data: session, status } = useSession()
  const queryClient = useQueryClient()
  const role = session?.user?.role as string | undefined
  const canAdd = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const canViewTeachers = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const limit = 20

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to deactivate ${name}'s profile?`)) return
    setDeletingTeacherId(id)
    try {
      await fetchApi(`/api/teachers/${id}`, { method: 'DELETE' })
      notify.success(`${name}'s profile deactivated successfully`)
      queryClient.invalidateQueries({ queryKey: ['teachers'] })
    } catch (err: any) {
      notify.error('Failed to deactivate staff member', { description: err.message })
    } finally {
      setDeletingTeacherId(null)
    }
  }

  const params = new URLSearchParams()
  params.set('page', String(page))
  params.set('limit', String(limit))
  if (search) params.set('search', search)

  const { data, isLoading } = useQuery({
    queryKey: ['teachers', page, search],
    queryFn: () => fetchPaginatedApi<Teacher>(`/api/teachers?${params.toString()}`),
    staleTime: 30_000,
    enabled: canViewTeachers,
  })

  const teachers = data?.data ?? []
  const pagination = data?.pagination

  // Route guard: only SUPER_ADMIN and ADMIN can manage staff records
  if (status === 'loading') return null
  if (!canViewTeachers) {
    return (
      <AccessDenied
        title="Staff Directory Restricted"
        message="The staff directory is restricted to administrators. You can view your own profile from the Staff HR Portal."
      />
    )
  }

  return (
    <motion.div 
      initial="initial"
      animate="animate"
      variants={staggerContainer}
      className="space-y-6 max-w-7xl mx-auto"
    >
      <motion.div variants={fadeUp(0.1)} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-soft-lg border border-slate-200/60">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 flex items-center gap-2">
            <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
              <Users className="w-6 h-6" />
            </div>
            Staff Directory
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium ml-11">
            {pagination ? `${pagination.total.toLocaleString()} staff members` : 'Loading...'}
          </p>
        </div>
        {canAdd && (
          <Link href="/dashboard/teachers/new">
            <Button className="gap-2 bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg">
              <Plus className="w-4 h-4" />
              Add Staff Member
            </Button>
          </Link>
        )}
      </motion.div>

      <motion.div variants={fadeUp(0.2)} className="bg-white rounded-2xl border border-slate-200/60 shadow-soft-md overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              type="search"
              placeholder="Search name, employee ID, specialization..."
              className="pl-9 bg-white border-slate-200"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        <div className="relative w-full overflow-x-auto min-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead>Staff Member</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Designation</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Qualification</TableHead>
                <TableHead>Experience</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 8 }).map((__, j) => (
                      <TableCell key={j}><Skeleton className="h-4 w-16" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : teachers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-64">
                    <EmptyState 
                      icon={UserX}
                      title="No staff members found"
                      description={search ? "Try adjusting your search criteria." : "There are no staff members registered in the system yet."}
                    />
                  </TableCell>
                </TableRow>
              ) : (
                teachers.map((t) => (
                  <TableRow key={t.id} className="hover:bg-slate-50/80 transition-colors group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        {t.profilePicture ? (
                          <img src={t.profilePicture} alt={t.firstName} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm flex-shrink-0">
                            {t.firstName[0]}{t.lastName[0]}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-gray-900">{t.firstName} {t.lastName}</p>
                          {t.specialization && <p className="text-xs text-gray-400 truncate">{t.specialization}</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-gray-600">{t.employeeId}</TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const badge = getDesignationBadge(t.designation)
                        return (
                          <span className={`inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.className}`}>
                            {t.designation}
                          </span>
                        )
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-bold text-blue-600">{t.campus.code}</span>
                      <span className="text-xs text-gray-400 ml-1">{t.batch?.name}</span>
                      {t.house?.name && (
                        <span className="ml-2 inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700 border border-yellow-100">
                          {t.house.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">{t.qualification}</TableCell>
                    <TableCell className="text-sm">{t.experienceYears}y</TableCell>
                    <TableCell>
                      <span className={`inline-flex text-xs px-2 py-0.5 rounded-full font-medium ${t.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {t.isActive ? 'Active' : 'Suspended'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="text-xs text-blue-600 hover:bg-blue-50"
                          onClick={() => setSelectedTeacherId(t.id)}
                        >
                          View →
                        </Button>
                        {canAdd && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs text-destructive hover:bg-destructive/10 p-2 h-8 w-8"
                            disabled={deletingTeacherId === t.id}
                            onClick={() => handleDelete(t.id, `${t.firstName} ${t.lastName}`)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-sm text-slate-500 font-medium">
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-8 w-8 p-0 border-slate-200">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm font-semibold px-2">{page} / {pagination.totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))} disabled={page >= pagination.totalPages} className="h-8 w-8 p-0 border-slate-200">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      <TeacherDetailsDialog 
        teacherId={selectedTeacherId} 
        onClose={() => setSelectedTeacherId(null)} 
      />
    </motion.div>
  )
}

function TeacherDetailsDialog({ teacherId, onClose }: { teacherId: string | null; onClose: () => void }) {
  const [exportingPdf, setExportingPdf] = useState(false)
  const { data: teacherRaw, isLoading } = useQuery({
    queryKey: ['teacher-detail', teacherId],
    queryFn: () => fetchApi<any>(`/api/teachers/${teacherId}`),
    enabled: !!teacherId,
  })

  const teacher = teacherRaw?.data ?? teacherRaw

  const assignedShifts = useMemo(() => {
    const shifts = new Set<SessionShift>()
    teacher?.classes?.forEach((c: { class?: { shift?: SessionShift } }) => {
      if (c.class?.shift) shifts.add(c.class.shift)
    })
    return Array.from(shifts)
  }, [teacher])

  const handleExportPDF = async () => {
    if (!teacher) return
    setExportingPdf(true)
    try {
      await generateTeacherProfile({
        employeeId: teacher.employeeId,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        designation: teacher.designation,
        specialization: teacher.specialization,
        qualification: teacher.qualification,
        experienceYears: teacher.experienceYears,
        phoneNumber: teacher.phoneNumber,
        email: teacher.email,
        cnic: teacher.cnic,
        emergencyContact: teacher.emergencyContact,
        address: teacher.address,
        city: teacher.city,
        monthlySalary: teacher.monthlySalary,
        joiningDate: teacher.joiningDate,
        isActive: teacher.isActive,
        campusName: teacher.campus?.name,
        batchName: teacher.batch?.name,
        houseName: teacher.house?.name,
        classes: teacher.classes,
        photo: teacher.profilePicture,
        qrCode: teacher.employeeId,
      })
      notify.success('PDF Profile downloaded successfully')
    } catch (err: any) {
      notify.error('Failed to generate profile PDF', { description: err.message })
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <Dialog open={!!teacherId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto p-6 rounded-xl border shadow-lg bg-white">
        <DialogHeader className="pb-4 border-b flex flex-row items-center justify-between gap-4">
          <div>
            <DialogTitle className="text-lg font-black text-gray-900">Staff Profile Detail</DialogTitle>
            <DialogDescription className="text-xs text-gray-500">Official staff record for Evershine Academy.</DialogDescription>
          </div>
          {!isLoading && teacher && (
            <div className="flex gap-2 flex-shrink-0 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                className="text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold px-3 gap-1.5"
                disabled={exportingPdf}
                onClick={handleExportPDF}
              >
                <FileText className="w-3.5 h-3.5" />
                {exportingPdf ? 'Exporting...' : 'Export PDF'}
              </Button>
              <Link href={`/dashboard/teachers/${teacher.id}/attendance`}>
                <Button size="sm" variant="outline" className="text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold px-3">
                  Attendance
                </Button>
              </Link>
              <Link href={`/dashboard/teachers/${teacher.id}/edit`}>
                <Button size="sm" variant="outline" className="text-xs h-8 border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-bold px-3">
                  Edit Profile
                </Button>
              </Link>
            </div>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-3">
            <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-gray-500 font-medium">Fetching complete staff profile...</p>
          </div>
        ) : !teacher ? (
          <p className="py-6 text-center text-sm text-gray-400">Staff profile not found</p>
        ) : (
          <div className="space-y-6 pt-4 text-gray-700">
            {/* Header info */}
            <div className="flex flex-col sm:flex-row items-center gap-5 bg-gray-50 p-4 rounded-xl border border-gray-100">
              {teacher.profilePicture ? (
                <img 
                  src={teacher.profilePicture} 
                  alt={teacher.firstName} 
                  className="w-20 h-20 rounded-xl object-cover border border-gray-200 shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-blue-100 flex items-center justify-center text-blue-700 font-black text-2xl shadow-sm flex-shrink-0">
                  {teacher.firstName?.[0] || '?'}{teacher.lastName?.[0] || ''}
                </div>
              )}
              <div className="text-center sm:text-left min-w-0">
                <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap">
                  <h3 className="text-lg font-black text-gray-900">{teacher.firstName} {teacher.lastName}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${teacher.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {teacher.isActive ? 'Active' : 'Suspended'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 font-semibold">{teacher.designation} • {teacher.specialization || 'Generalist'}</p>
                <p className="text-[10px] font-mono text-gray-400 mt-1">Employee ID: {teacher.employeeId}</p>
                {assignedShifts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2 justify-center sm:justify-start">
                    {assignedShifts.map((s) => (
                      <span
                        key={s}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${SESSION_SHIFT_BADGE_CLASS[s]}`}
                      >
                        {SESSION_SHIFT_LABELS[s]}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Academic Placement */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Academic Assignment</h4>
              <div className="grid grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100 text-xs">
                <div>
                  <span className="text-gray-500 block font-medium">Campus</span>
                  <span className="font-bold text-gray-800">{teacher.campus?.name || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">Batch</span>
                  <span className="font-bold text-gray-800">{teacher.batch?.name || 'Regular'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">Performance House</span>
                  <span className="font-bold text-gray-800">{teacher.house?.name || '—'}</span>
                </div>
              </div>
            </div>

            {/* Assigned Classes */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Assigned Classes</h4>
              <div className="flex flex-wrap gap-1.5">
                {teacher.classes && teacher.classes.length > 0 ? (
                  teacher.classes.map((c: any) => (
                    <span key={c.classId} className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">
                      {c.class?.name || 'Class'}
                      {c.class?.shift && (
                        <span className={`ml-1 px-1 py-0 rounded border ${SESSION_SHIFT_BADGE_CLASS[c.class.shift as SessionShift]}`}>
                          {c.class.shift === 'EVENING' ? 'Eve' : 'Morn'}
                        </span>
                      )}
                      {c.isClassTeacher ? ' 👑' : ''}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-gray-400 font-medium italic">No classes assigned</span>
                )}
              </div>
            </div>

            {/* Contact & Personal details */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Contact & Personal Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100 text-xs">
                <div>
                  <span className="text-gray-500 block font-medium">Phone Number</span>
                  <span className="font-bold text-gray-800">{teacher.phoneNumber}</span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">Email Address</span>
                  <span className="font-bold text-gray-800">{teacher.email}</span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">CNIC Number</span>
                  <span className="font-bold text-gray-800">{teacher.cnic || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">Emergency Contact</span>
                  <span className="font-bold text-gray-800">{teacher.emergencyContact || 'N/A'}</span>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-gray-500 block font-medium">Address</span>
                  <span className="font-bold text-gray-800">{teacher.address}, {teacher.city}</span>
                </div>
              </div>
            </div>

            {/* Professional & Salary */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">Professional & Financial Details</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-100 text-xs">
                <div>
                  <span className="text-gray-500 block font-medium">Qualification</span>
                  <span className="font-bold text-gray-800 truncate block">{teacher.qualification}</span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">Experience</span>
                  <span className="font-bold text-gray-800">{teacher.experienceYears} Years</span>
                </div>
                <div>
                  <span className="text-gray-500 block font-medium">Monthly Salary</span>
                  <span className="font-bold text-gray-800">Rs {teacher.monthlySalary?.toLocaleString() || 'N/A'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
