'use client'

import { use } from 'react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ArrowLeft, UserCircle, Phone, MapPin, GraduationCap,
  CreditCard, CalendarCheck, FileText, AlertCircle, Pencil
} from 'lucide-react'
import Link from 'next/link'
import { Skeleton } from '@/components/ui/skeleton'
import { StudentEnrollmentsPanel } from '@/components/students/StudentEnrollmentsPanel'
import type { StudentEnrollmentRow } from '@/components/students/StudentEnrollmentsPanel'
import { StudentGuardianPanel } from '@/components/students/StudentGuardianPanel'
import { StudentPromotionPanel } from '@/components/students/StudentPromotionPanel'
import { StudentTimelineCard } from '@/components/students/StudentTimelineCard'
import { StudentAdminToolbar } from '@/components/students/StudentAdminToolbar'

interface StudentDetail {
  id: string
  firstName: string
  lastName: string
  fatherName: string
  registrationNumber: string
  admissionNumber?: string
  cnicBForm: string
  dateOfBirth: string
  gender: string
  bloodGroup?: string
  religion?: string
  nationality: string
  address: string
  city: string
  province: string
  postalCode?: string
  phoneNumber: string
  emergencyContact: string
  email?: string
  section?: string
  rollNumber?: string
  academicYear: string
  admissionDate: string
  enrollmentStatus: string
  feeStatus: string
  totalFeeAmount: number
  paidAmount: number
  dueAmount: number
  profilePicture?: string
  idCardQRCode?: string
  campus: { id: string; name: string; code: string }
  batch: { id: string; name: string; code?: string }
  class?: { id: string; name: string; grade: number }
  house?: { id: string; name: string; color: string }
  campusId?: string
  batchId?: string
  guardians?: Array<{
    id: string
    firstName: string
    lastName: string
    phoneNumber: string
    email?: string
    relationship: string
    cnic: string
  }>
  enrollments?: StudentEnrollmentRow[]
  user?: { id: string; email: string }
}

interface AttendanceRecord {
  id: string
  date: string
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED'
  remarks?: string
}

interface FeeInvoice {
  id: string
  challanNumber: string
  month: string
  totalAmount: number
  paidAmount: number
  status: string
  dueDate: string
}

const ENROLLMENT_BADGE: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  SUSPENDED: 'bg-red-100 text-red-800',
  GRADUATED: 'bg-gray-100 text-gray-700',
  WITHDRAWN: 'bg-gray-100 text-gray-500',
  ON_LEAVE: 'bg-orange-100 text-orange-800',
}

const FEE_BADGE: Record<string, string> = {
  PAID: 'bg-green-100 text-green-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  PARTIALLY_PAID: 'bg-blue-100 text-blue-800',
  OVERDUE: 'bg-red-100 text-red-800',
}

const ATTENDANCE_BADGE: Record<string, string> = {
  PRESENT: 'text-green-700',
  ABSENT: 'text-red-700',
  LATE: 'text-yellow-700',
  EXCUSED: 'text-blue-700',
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-4">
      <dt className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-36 flex-shrink-0 pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-900 font-medium">{value || <span className="text-gray-300">—</span>}</dd>
    </div>
  )
}

export default function StudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { data: session } = useSession()
  const role = session?.user?.role as string | undefined
  const isAdmin = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const isStudentUser = role === 'STUDENT'

  const { data: student, isLoading, error } = useQuery<StudentDetail>({
    queryKey: ['student', id],
    queryFn: () => fetchApi<StudentDetail>(`/api/students/${id}`),
  })

  const { data: feesData } = useQuery({
    queryKey: ['student-fees', id],
    queryFn: () => fetchPaginatedApi<FeeInvoice>(`/api/fees?studentId=${id}&limit=10`),
    enabled: !!id,
  })

  const { data: attendanceData } = useQuery({
    queryKey: ['student-attendance', id],
    queryFn: () => fetchPaginatedApi<AttendanceRecord>(`/api/attendance?studentId=${id}&limit=30`),
    enabled: !!id,
  })

  const { data: engineAttendanceRaw } = useQuery({
    queryKey: ['student-engine-attendance', id],
    queryFn: () =>
      fetchApi<Array<{ id: string; attendanceDate: string; status: string; studentEnrollment?: { classSection?: { className: string; sectionName: string } } }>>(
        `/api/enrollment-attendance?studentId=${id}&limit=30`
      ),
    enabled: !!id,
  })
  const engineAttendance = Array.isArray(engineAttendanceRaw)
    ? engineAttendanceRaw
    : (engineAttendanceRaw as { data?: typeof engineAttendanceRaw })?.data ?? []

  const fees = feesData?.data ?? []
  const attendanceRecords = attendanceData?.data ?? []
  const canGenerateStudentDocuments = isAdmin || (isStudentUser && student?.user?.id === session?.user?.id)

  // Attendance summary
  const attSummary = attendanceRecords.reduce(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc },
    {} as Record<string, number>
  )

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1"><Skeleton className="h-64 rounded-xl" /></div>
          <div className="lg:col-span-2"><Skeleton className="h-64 rounded-xl" /></div>
        </div>
      </div>
    )
  }

  if (error || !student) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>Student not found or you don't have permission to view this profile.</span>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Top bar */}
      <div className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white/95 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/students">
            <Button variant="outline" size="icon" className="h-9 w-9">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-indigo-600">Student profile</p>
            <h1 className="text-2xl font-semibold text-slate-900">
              {student.firstName} {student.lastName}
            </h1>
            <p className="text-sm text-slate-500 font-mono">{student.registrationNumber}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {isAdmin && (
            <>
              <StudentAdminToolbar
                studentId={student.id}
                registrationNumber={student.registrationNumber}
                enrollmentStatus={student.enrollmentStatus}
                enrollments={student.enrollments}
              />
              <Link href={`/dashboard/students/${id}/edit`}>
                <Button variant="outline" size="sm" className="gap-2">
                  <Pencil className="w-4 h-4" />
                  Edit Profile
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Avatar + status */}
        <div className="space-y-4 lg:col-span-1">
          <Card className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-600 via-blue-600 to-sky-500 text-white shadow-sm">
            <CardContent className="p-6 flex flex-col items-center text-center text-white">
              {student.profilePicture ? (
                <img
                  src={student.profilePicture}
                  alt={student.firstName}
                  className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md mb-4"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-black text-3xl mb-4 border-4 border-white shadow-md">
                  {student.firstName[0]}{student.lastName[0]}
                </div>
              )}
              <h2 className="text-xl font-semibold text-white">{student.firstName} {student.lastName}</h2>
              <p className="text-sm text-indigo-100">{student.fatherName}'s son/daughter</p>

              <div className="mt-3 flex flex-wrap gap-2 justify-center">
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${ENROLLMENT_BADGE[student.enrollmentStatus]}`}>
                  {student.enrollmentStatus.replace('_', ' ')}
                </span>
                <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${FEE_BADGE[student.feeStatus]}`}>
                  {student.feeStatus.replace('_', ' ')}
                </span>
              </div>

              <div className="mt-4 w-full space-y-2 text-left text-sm text-indigo-100">
                <div className="flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-indigo-200" />
                  {student.class ? student.class.name : 'Class not assigned'}
                  {student.section && ` — Section ${student.section}`}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-200" />
                  {student.campus.name} · {student.batch.name}
                </div>
                {student.house && (
                  <div className="flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full border border-white/40 flex-shrink-0" style={{ background: student.house.color }} />
                    {student.house.name} House
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Fee summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-green-600" />
                Fee Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Total Fee</span>
                <span className="font-medium">Rs {Number(student.totalFeeAmount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Paid</span>
                <span className="font-medium text-green-700">Rs {Number(student.paidAmount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-2">
                <span className="text-gray-600">Due</span>
                <span className={Number(student.dueAmount) > 0 ? 'text-red-600' : 'text-gray-400'}>
                  Rs {Number(student.dueAmount).toLocaleString()}
                </span>
              </div>
              <Link href={`/dashboard/fees?studentId=${student.id}`}>
                <Button variant="outline" size="sm" className="w-full mt-2 text-xs gap-1.5">
                  <FileText className="w-3.5 h-3.5" /> View Challans
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Attendance summary */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <CalendarCheck className="w-4 h-4 text-purple-600" />
                Attendance (Last 30)
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-2">
              {(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const).map((s) => (
                <div key={s} className="text-center p-2 rounded-lg bg-gray-50">
                  <p className={`text-lg font-bold ${ATTENDANCE_BADGE[s]}`}>{attSummary[s] ?? 0}</p>
                  <p className="text-xs text-gray-400 capitalize">{s.toLowerCase()}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Right: Details */}
        <div className="lg:col-span-2 space-y-4">
          {/* Personal Info */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <InfoRow label="Full Name" value={`${student.firstName} ${student.lastName}`} />
                <InfoRow label="Father's Name" value={student.fatherName} />
                <InfoRow label="Date of Birth" value={new Date(student.dateOfBirth).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })} />
                <InfoRow label="Gender" value={student.gender} />
                <InfoRow label="B-Form / CNIC" value={student.cnicBForm} />
                <InfoRow label="Blood Group" value={student.bloodGroup} />
                <InfoRow label="Religion" value={student.religion} />
                <InfoRow label="Nationality" value={student.nationality} />
              </dl>
            </CardContent>
          </Card>

          {/* Contact */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">Contact & Address</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <InfoRow label="Phone" value={student.phoneNumber} />
                <InfoRow label="Emergency" value={student.emergencyContact} />
                <InfoRow label="Email" value={student.email} />
                <InfoRow label="Address" value={student.address} />
                <InfoRow label="City" value={`${student.city}, ${student.province} ${student.postalCode ?? ''}`} />
              </dl>
            </CardContent>
          </Card>

          {/* Academic */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-gray-600">Academic Placement (Legacy)</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-3">
                <InfoRow label="Campus" value={student.campus.name} />
                <InfoRow label="Batch" value={student.batch.name} />
                <InfoRow label="Class" value={student.class?.name} />
                <InfoRow label="Section" value={student.section} />
                <InfoRow label="Roll Number" value={student.rollNumber} />
                <InfoRow label="Academic Year" value={student.academicYear} />
                <InfoRow label="Admission Date" value={new Date(student.admissionDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })} />
                <InfoRow label="Adm. Number" value={student.admissionNumber} />
              </dl>
            </CardContent>
          </Card>

          <StudentEnrollmentsPanel
            studentId={student.id}
            campusId={student.campus.id}
            batchId={student.batch?.id}
            canManage={isAdmin}
          />

          <StudentPromotionPanel
            studentId={student.id}
            studentName={`${student.firstName} ${student.lastName}`}
            enrollments={student.enrollments ?? []}
            canManage={isAdmin}
          />

          <StudentGuardianPanel
            studentId={student.id}
            guardians={student.guardians ?? []}
            canManage={isAdmin}
          />

          {engineAttendance.length > 0 && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-gray-600">Section Attendance (Engine)</CardTitle>
                <Link href="/dashboard/attendance/sections">
                  <Button variant="ghost" size="sm" className="text-xs">Open roster</Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0 divide-y max-h-48 overflow-y-auto">
                {engineAttendance.slice(0, 15).map((r) => (
                  <div key={r.id} className="flex justify-between px-4 py-2 text-xs">
                    <span>
                      {new Date(r.attendanceDate).toLocaleDateString('en-PK')}
                      {r.studentEnrollment?.classSection && (
                        <span className="text-gray-400 ml-1">
                          · {r.studentEnrollment.classSection.className}-{r.studentEnrollment.classSection.sectionName}
                        </span>
                      )}
                    </span>
                    <span className={ATTENDANCE_BADGE[r.status] ?? 'text-gray-600'}>{r.status}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent Fees */}
          {fees.length > 0 && (
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm text-gray-600">Recent Fee Challans</CardTitle>
                <Link href={`/dashboard/fees?studentId=${student.id}`}>
                  <Button variant="ghost" size="sm" className="text-xs">View all</Button>
                </Link>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {fees.map((f) => (
                    <div key={f.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-sm font-medium">{f.month}</p>
                        <p className="text-xs font-mono text-gray-400">{f.challanNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">Rs {Number(f.totalAmount).toLocaleString()}</p>
                        <span className={`text-xs ${
                          f.status === 'PAID' ? 'text-green-600' :
                          f.status === 'OVERDUE' ? 'text-red-600' : 'text-yellow-600'
                        }`}>{f.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {isAdmin && <StudentTimelineCard studentId={student.id} />}

          {canGenerateStudentDocuments && (
            <Card>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-gray-900">Official Documents</p>
                  <p className="text-xs text-gray-500">Generate and download official student records</p>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/dashboard/documents?studentId=${student.id}&doc=student_profile`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <UserCircle className="w-4 h-4" /> Profile
                    </Button>
                  </Link>
                  <Link href={`/dashboard/documents?studentId=${student.id}&doc=id_card`}>
                    <Button variant="outline" size="sm" className="gap-2">
                      <FileText className="w-4 h-4" /> ID Card
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
