'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi, PaginatedResult } from '@/lib/api-client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Users, GraduationCap, DollarSign, AlertCircle,
  TrendingUp, CheckCircle, Calendar, UserPlus,
  CreditCard, ClipboardCheck, BookOpen, Award,
  MapPin, School, Wallet, ReceiptText, Banknote, BarChart2
} from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { Skeleton } from '@/components/ui/skeleton'

// Shape returned by GET /api/dashboard
interface DashboardData {
  students: {
    total: number
    active: number
    feePending: number
    feeOverdue: number
  }
  teachers: { total: number }
  finance: {
    totalCollected: number
    totalPending: number
    reserveFundBalance: number
    latestReserveContribution: {
      amount: number
      periodLabel: string
      transactionDate: string
    } | null
  }
  attendance: {
    todayPresent: number
    todayTotal: number
    attendanceRate: number
  }
  upcomingExams: Array<{
    id: string
    name: string
    startDate: string
    endDate: string
    class: { name: string }
  }>
  recentAdmissions: Array<{
    id: string
    firstName: string
    lastName: string
    registrationNumber: string
    admissionDate: string
    campus: { name: string }
    batch: { name: string }
  }>
}

function StatCard({
  title, value, sub, icon: Icon, color, href
}: {
  title: string
  value: string | number
  sub?: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  href?: string
}) {
  const content = (
    <Card className="group hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 cursor-pointer">
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
            <p className={`text-3xl font-bold ${color}`}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1.5">{sub}</p>}
          </div>
          <div className={`p-3 rounded-xl ${color.replace('text-', 'bg-').replace('-600', '-50').replace('-700', '-50')} transition-transform duration-200 group-hover:scale-110`}>
            <Icon className={`w-6 h-6 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}

function SkeletonCard() {
  return (
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-32" />
      </CardContent>
    </Card>
  )
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const [renderedAt] = useState(() => Date.now())
  const role = session?.user?.role as string | undefined
  const isAdminOrAbove = role === 'SUPER_ADMIN' || role === 'ADMIN'
  const isAccountant = role === 'ACCOUNTANT'

  // WHY: Guardians/parents have no use for the admin dashboard — redirect to children portal
  useEffect(() => {
    if (role === 'PARENT' || role === 'GUARDIAN') {
      router.replace('/dashboard/my-children')
    }
  }, [role, router])
  const isFinanceStaff = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'].includes(role || '')
  const isTeacher = role === 'TEACHER'

  const { data, isLoading, error } = useQuery<DashboardData>({
    queryKey: ['dashboard-metrics'],
    queryFn: () => fetchApi<DashboardData>('/api/dashboard'),
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    enabled: role !== 'STUDENT' // Don't fetch admin metrics for students
  })

  const { data: leaveSummary } = useQuery<PaginatedResult<{ id: string }>>({
    queryKey: ['dashboard-leaves-summary'],
    queryFn: () => fetchPaginatedApi<{ id: string }>('/api/leaves?limit=1'),
    enabled: isAdminOrAbove || isFinanceStaff,
  })

  const leaveCount = leaveSummary?.pagination.total ?? 0

  const { data: studentProfile, isLoading: isLoadingStudent } = useQuery<any>({
    queryKey: ['student-profile', session?.user?.id],
    queryFn: () => fetchApi<any>(`/api/students/profile`),
    enabled: role === 'STUDENT'
  })

  const { data: teacherProfileRaw, isLoading: isLoadingTeacher } = useQuery<any>({
    queryKey: ['teacher-profile', session?.user?.id],
    queryFn: () => fetchApi<any>(`/api/teachers/profile`),
    enabled: role === 'TEACHER'
  })
  const teacherProfile = teacherProfileRaw ?? null

  const { data: teacherTimetable, isLoading: isLoadingTimetable } = useQuery<any>({
    queryKey: ['teacher-timetable', teacherProfile?.id],
    queryFn: () => fetchApi<any>(`/api/teachers/${teacherProfile?.id}/timetable`),
    enabled: !!teacherProfile?.id
  })

  const teacherTimetableSlots = Array.isArray(teacherTimetable)
    ? teacherTimetable
    : teacherTimetable?.data ?? []

  const OVERDUE_DIALOG_DISMISS_KEY = 'dashboardOverdueFeeDialogDismissed'
  const [isOverdueDialogOpen, setIsOverdueDialogOpen] = useState(true)
  const [isOverdueDialogDismissed, setIsOverdueDialogDismissed] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    try {
      return window.sessionStorage.getItem(OVERDUE_DIALOG_DISMISS_KEY) === 'true'
    } catch {
      return false
    }
  })

  const isStudentOrGuardian = ['STUDENT', 'PARENT', 'GUARDIAN'].includes(role || '')
  
  const { data: overdueFees } = useQuery<any>({
    queryKey: ['overdue-fees'],
    queryFn: () => fetchPaginatedApi<any>('/api/fees?status=OVERDUE&limit=1'),
    enabled: isStudentOrGuardian
  })
  const hasOverdueFee = overdueFees?.data && overdueFees.data.length > 0
  const firstOverdueFee = overdueFees?.data?.[0]

  const closeOverdueDialog = () => {
    try {
      window.sessionStorage.setItem(OVERDUE_DIALOG_DISMISS_KEY, 'true')
    } catch {
      // ignore storage failures and still close the dialog
    }

    setIsOverdueDialogOpen(false)
    setIsOverdueDialogDismissed(true)
  }

  const isOverdueDialogVisible = isStudentOrGuardian && hasOverdueFee && isOverdueDialogOpen && !isOverdueDialogDismissed

  // Normalizing JS dayOfWeek to DB dayOfWeek (0=Monday, ..., 6=Sunday)
  const jsDay = new Date().getDay()
  const dbDay = jsDay === 0 ? 6 : jsDay - 1
  const todayClasses = teacherTimetableSlots.filter((slot: any) => slot.dayOfWeek === dbDay)

  // Quick actions vary by role
  const quickActions = [
    ...(isAdminOrAbove ? [
      { label: 'New Admission', href: '/dashboard/students/admission', icon: UserPlus, color: 'bg-blue-600 hover:bg-blue-700' },
      { label: 'Generate Challan', href: '/dashboard/fees/generate', icon: CreditCard, color: 'bg-green-600 hover:bg-green-700' },
    ] : []),
    ...(isTeacher || isAdminOrAbove ? [
      { label: 'Mark Attendance', href: '/dashboard/attendance', icon: ClipboardCheck, color: 'bg-purple-600 hover:bg-purple-700' },
    ] : []),
    ...(isAdminOrAbove ? [
      { label: 'Add Teacher', href: '/dashboard/teachers/new', icon: GraduationCap, color: 'bg-orange-600 hover:bg-orange-700' },
    ] : []),
    ...(isFinanceStaff ? [
      { label: 'Finance Hub', href: '/dashboard/accountant', icon: Wallet, color: 'bg-teal-600 hover:bg-teal-700' },
      { label: 'Expense Ledger', href: '/dashboard/accountant/expenses', icon: ReceiptText, color: 'bg-amber-600 hover:bg-amber-700' },
      { label: 'Financial Reports', href: '/dashboard/accountant/reports', icon: BarChart2, color: 'bg-emerald-600 hover:bg-emerald-700' },
      { label: 'Payroll Ledger', href: '/dashboard/salaries', icon: Banknote, color: 'bg-indigo-600 hover:bg-indigo-700' },
    ] : []),
    ...((isAdminOrAbove || isFinanceStaff) ? [
      { label: leaveCount > 0 ? `Leave Requests (${leaveCount})` : 'Leave Requests', href: '/dashboard/leaves', icon: Calendar, color: 'bg-amber-600 hover:bg-amber-700' },
    ] : []),
  ]

  if (error) return (
    <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-lg flex items-center gap-3 text-destructive">
      <AlertCircle className="w-5 h-5 flex-shrink-0" />
      <div>
        <p className="font-medium">Failed to load dashboard</p>
        <p className="text-sm">{(error as Error).message}</p>
      </div>
    </div>
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          {role === 'STUDENT' && (
            <div className="bg-blue-100 text-blue-700 p-2 rounded-lg">
              <GraduationCap className="w-5 h-5" />
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {role === 'STUDENT' ? 'Student Portal' : 'Welcome back'}{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}
          </h1>
        </div>
        <p className="text-gray-500 mt-1">
          {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Student Welcome Banner & Quick Info */}
      {role === 'STUDENT' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 text-white overflow-hidden relative">
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4">
              <School className="w-64 h-64" />
            </div>
            <CardContent className="p-8 relative z-10">
              <h2 className="text-2xl font-bold mb-2">Welcome to Evershaheen Academy!</h2>
              <p className="text-blue-100 mb-4 max-w-md">
                We're glad to have you here. This is your central hub for classes, results, and fee management.
              </p>
              <div className="flex gap-4 mb-6">
                <Link
                  href="/dashboard/enrollment"
                  className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-white border border-white/30 hover:bg-white/30 transition-colors"
                >
                  <BookOpen className="w-4 h-4" /> My Courses
                </Link>
                <Link
                  href="/dashboard/enrollment"
                  className="inline-flex items-center gap-2 rounded-lg bg-white/20 px-4 py-2 text-sm font-semibold text-white border border-white/30 hover:bg-white/30 transition-colors"
                >
                  <Award className="w-4 h-4" /> My Results
                </Link>
                <Link
                  href="/dashboard/documents?doc=student_profile"
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-500/80 px-4 py-2 text-sm font-semibold text-white border border-indigo-400 hover:bg-indigo-500 transition-colors shadow-sm"
                >
                  <BookOpen className="w-4 h-4" /> Academic Profile
                </Link>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 border border-white/20">
                  <p className="text-xs text-blue-100 uppercase font-bold tracking-wider mb-1">Registration No</p>
                  <p className="font-mono font-bold text-lg">{studentProfile?.registrationNumber || 'EA/2026/...'}</p>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-lg p-3 border border-white/20">
                  <p className="text-xs text-blue-100 uppercase font-bold tracking-wider mb-1">Current Status</p>
                  <p className="font-bold text-lg flex items-center gap-2">
                    <span className="inline-flex w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                    Enrolled
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-600" /> Academic Placement
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Campus</span>
                <span className="text-sm font-semibold">{studentProfile?.campus?.name || 'Loading...'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Class</span>
                <span className="text-sm font-semibold">{studentProfile?.class?.name || 'Unassigned'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-50">
                <span className="text-sm text-gray-500">Batch</span>
                <span className="text-sm font-semibold">{studentProfile?.batch?.name || 'Regular'}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-gray-500">Academic Year</span>
                <span className="text-sm font-semibold">{studentProfile?.academicYear || '2026'}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Teacher Welcome Banner & Quick Info */}
      {role === 'TEACHER' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 bg-gradient-to-br from-indigo-600 to-blue-700 text-white overflow-hidden relative shadow-md">
            <div className="absolute right-0 bottom-0 opacity-10 translate-x-1/4 translate-y-1/4">
              <School className="w-64 h-64" />
            </div>
            <CardContent className="p-8 relative z-10">
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {teacherProfile?.profilePicture ? (
                  <img 
                    src={teacherProfile.profilePicture} 
                    alt={teacherProfile.firstName} 
                    className="w-24 h-24 rounded-xl border-4 border-white/20 object-cover shadow-md flex-shrink-0"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-xl border-4 border-white/20 bg-white/10 backdrop-blur-md flex items-center justify-center text-white font-bold text-3xl shadow-md flex-shrink-0">
                    {teacherProfile?.firstName?.[0] || '?'}{teacherProfile?.lastName?.[0] || ''}
                  </div>
                )}
                <div className="text-center sm:text-left">
                  <h2 className="text-2xl font-black mb-1">{teacherProfile?.firstName} {teacherProfile?.lastName}</h2>
                  <p className="text-indigo-100 font-semibold text-sm">{teacherProfile?.designation} • {teacherProfile?.specialization || 'Generalist'}</p>
                  
                  <div className="flex flex-wrap justify-center sm:justify-start gap-4 mt-4">
                    <div className="bg-white/10 backdrop-blur-md rounded-lg py-1.5 px-3 border border-white/20 text-center sm:text-left">
                      <p className="text-[9px] text-indigo-100 uppercase font-bold tracking-wider">Employee ID</p>
                      <p className="font-mono font-bold text-sm">{teacherProfile?.employeeId || 'ESA-TCH-...'}</p>
                    </div>
                    <div className="bg-white/10 backdrop-blur-md rounded-lg py-1.5 px-3 border border-white/20 text-center sm:text-left">
                      <p className="text-[9px] text-indigo-100 uppercase font-bold tracking-wider">Joining Date</p>
                      <p className="font-bold text-sm">
                        {teacherProfile?.joiningDate ? new Date(teacherProfile.joiningDate).toLocaleDateString('en-PK', { month: 'short', day: 'numeric', year: 'numeric' }) : '--'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-indigo-700">
                <MapPin className="w-4 h-4" /> Academic Assignment
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs text-gray-500 font-medium">Primary Campus</span>
                <span className="text-xs font-bold text-gray-800">{teacherProfile?.campus?.name || 'Boys Campus'}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-xs text-gray-500 font-medium">Assigned Batch</span>
                <span className="text-xs font-bold text-gray-800">{teacherProfile?.batch?.name || 'Regular'}</span>
              </div>
              <div className="flex flex-col gap-1.5 py-1">
                <span className="text-xs text-gray-500 font-medium">Assigned Classes</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {teacherProfile?.classes && teacherProfile.classes.length > 0 ? (
                    teacherProfile.classes.map((c: any) => (
                      <span key={c.classId} className="inline-flex items-center text-[10px] font-bold px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {c.class.name} {c.isClassTeacher ? '👑' : ''}
                      </span>
                    ))
                  ) : (
                    <span className="text-xs text-gray-400 font-medium italic">No classes assigned</span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stat Cards - Show for Admin, Hide most for Student */}
      {role !== 'STUDENT' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <StatCard
              title="Total Students"
              value={data?.students.total.toLocaleString() ?? 0}
              sub={`${data?.students.active ?? 0} currently active`}
              icon={Users}
              color="text-blue-600"
              href="/dashboard/students"
            />
            <StatCard
              title="Teaching Staff"
              value={data?.teachers.total.toLocaleString() ?? 0}
              sub="Across all campuses"
              icon={GraduationCap}
              color="text-indigo-600"
              href="/dashboard/teachers"
            />
            <StatCard
              title="Today's Attendance"
              value={`${data?.attendance.attendanceRate ?? 0}%`}
              sub={`${data?.attendance.todayPresent ?? 0} / ${data?.attendance.todayTotal ?? 0} students present`}
              icon={CheckCircle}
              color={
                (data?.attendance.attendanceRate ?? 0) >= 85
                  ? 'text-green-600'
                  : (data?.attendance.attendanceRate ?? 0) >= 70
                  ? 'text-yellow-600'
                  : 'text-red-600'
              }
              href="/dashboard/attendance"
            />
            {(isAdminOrAbove || isAccountant) && (
              <>
                <StatCard
                  title="Fee Collected"
                  value={`Rs ${(data?.finance.totalCollected ?? 0).toLocaleString()}`}
                  sub="All time payments received"
                  icon={TrendingUp}
                  color="text-green-600"
                  href="/dashboard/fees"
                />
                <StatCard
                  title="Fee Pending"
                  value={`Rs ${(data?.finance.totalPending ?? 0).toLocaleString()}`}
                  sub={`${data?.students.feePending ?? 0} students with pending fees`}
                  icon={DollarSign}
                  color="text-yellow-600"
                  href="/dashboard/fees"
                />
                <StatCard
                  title="Overdue Fees"
                  value={data?.students.feeOverdue ?? 0}
                  sub="Students with overdue payments"
                  icon={AlertCircle}
                  color="text-red-600"
                  href="/dashboard/fees"
                />
                {role === 'SUPER_ADMIN' && (
                  <StatCard
                    title="Reserve Fund"
                    value={`Rs ${(data?.finance.reserveFundBalance ?? 0).toLocaleString()}`}
                    sub={data?.finance.latestReserveContribution
                      ? `Latest: Rs ${data.finance.latestReserveContribution.amount.toLocaleString()} for ${data.finance.latestReserveContribution.periodLabel}`
                      : 'No reserve allocations yet'}
                    icon={Wallet}
                    color="text-teal-700"
                    href="/dashboard/admin/reserve-fund"
                  />
                )}
              </>
            )}
          </>
        )}
        </div>
      )}
      
      {/* Overdue Fee Warning Modal */}
      {isOverdueDialogVisible && (
        <Dialog
          open={isOverdueDialogVisible}
          onOpenChange={(open) => {
            if (!open) {
              closeOverdueDialog()
            }
          }}
        >
          <DialogContent className="sm:max-w-md border-red-200 bg-red-50" showCloseButton>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-700 font-bold text-xl">
                <AlertCircle className="w-6 h-6" />
                FEE CHALLAN OVERDUE NOTICE
              </DialogTitle>
              <DialogDescription className="text-red-900 mt-2">
                Dear Student/Guardian, your fee invoice <strong>{firstOverdueFee.challanNumber}</strong> for <strong>{firstOverdueFee.month}</strong> is past its due date.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-white p-4 rounded-lg border border-red-200 shadow-sm mt-2 space-y-2">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-mono">Rs {Number(firstOverdueFee.subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-sm text-red-600 font-medium">
                <span>Late Fee</span>
                <span className="font-mono">+ Rs {Number(firstOverdueFee.lateFee).toLocaleString()}</span>
              </div>
              <div className="border-t pt-2 mt-2 flex justify-between items-center font-black text-lg text-blue-900">
                <span>Total Due</span>
                <span className="font-mono">Rs {Number(firstOverdueFee.totalAmount).toLocaleString()}</span>
              </div>
            </div>
            <p className="text-xs text-red-600 mt-2 font-medium">
              Please submit payment of PKR {Number(firstOverdueFee.totalAmount).toLocaleString()} and upload the deposit screenshot immediately to avoid further late fee penalties or suspension of portal access.
            </p>
            <DialogFooter className="mt-4" showCloseButton>
              <Link href={`/dashboard/fees/${firstOverdueFee.id}`} className="w-full">
                <Button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold h-11">
                  View Invoice & Upload Payment Proof
                </Button>
              </Link>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Student Specific Stats */}
      {role === 'STUDENT' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          <StatCard
            title="Attendance"
            value="--"
            sub="Monthly average"
            icon={ClipboardCheck}
            color="text-purple-600"
            href="/dashboard/attendance"
          />
          <StatCard
            title="Pending Exams"
            value="0"
            sub="Exams this week"
            icon={BookOpen}
            color="text-amber-600"
            href="/dashboard/exams"
          />
          <StatCard
            title="My Results"
            value="View →"
            sub="Latest performance"
            icon={Award}
            color="text-indigo-600"
            href="/dashboard/academics"
          />
          <StatCard
            title="Fee Status"
            value={studentProfile?.dueAmount > 0 ? `Rs ${studentProfile.dueAmount.toLocaleString()}` : 'Paid'}
            sub={studentProfile?.dueAmount > 0 ? 'Payment pending' : 'No outstanding dues'}
            icon={CreditCard}
            color={studentProfile?.dueAmount > 0 ? 'text-red-600' : 'text-green-600'}
            href="/dashboard/fees"
          />
        </div>
      )}

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {quickActions.map((action) => (
              <Link key={action.href} href={action.href}>
                <div className="group flex flex-col items-center gap-2.5 p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-200 hover:shadow-md transition-all duration-200 cursor-pointer text-center">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-gray-50 transition-transform duration-200 group-hover:scale-110`}>
                    <action.icon className={`w-5 h-5 ${action.color.split(' ')[0].replace('bg-', 'text-')}`} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 leading-tight">{action.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Lower panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Schedule (Teachers only) */}
        {role === 'TEACHER' ? (
          <Card className="shadow-md">
            <CardHeader className="flex flex-row items-center justify-between pb-3 border-b border-gray-50">
              <CardTitle className="text-base font-bold text-indigo-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" /> Today's Schedule
              </CardTitle>
              <Link href="/dashboard/timetable">
                <Button variant="ghost" size="sm" className="text-xs text-indigo-700 hover:text-indigo-800 font-bold">
                  View Full Timetable →
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {isLoadingTimetable ? (
                <div className="p-4 space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : todayClasses.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  <ClipboardCheck className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                  No classes scheduled for today.
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {todayClasses.map((slot: any) => (
                    <div key={slot.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/50 transition-colors">
                      <div className="w-24 text-xs font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2.5 py-1 rounded-md text-center">
                        {slot.startTime} - {slot.endTime}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-gray-900 truncate">
                          {slot.subjectName}
                        </p>
                        <p className="text-xs text-gray-500 font-semibold mt-0.5">
                          {slot.class.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : role !== 'STUDENT' ? (
          /* Recent Admissions */
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-base font-semibold">Recent Admissions</CardTitle>
              <Link href="/dashboard/students">
                <Button variant="ghost" size="sm" className="text-xs text-gray-500">
                  View all →
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="w-8 h-8 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-3.5 w-32 mb-1" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-3 w-16" />
                    </div>
                  ))}
                </div>
              ) : (data?.recentAdmissions ?? []).length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">No recent admissions</div>
              ) : (
                <div className="divide-y">
                  {(data?.recentAdmissions ?? []).map((s) => (
                    <Link
                      key={s.id}
                      href={`/dashboard/students/${s.id}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm flex-shrink-0">
                        {s.firstName[0]}{s.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">
                          {s.firstName} {s.lastName}
                        </p>
                        <p className="text-xs text-gray-500">{s.registrationNumber} · {s.campus.name}</p>
                      </div>
                      <div className="text-xs text-gray-400 flex-shrink-0">
                        {new Date(s.admissionDate).toLocaleDateString('en-PK', { month: 'short', day: 'numeric' })}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Upcoming Exams */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-semibold">Upcoming Exams</CardTitle>
            <Link href="/dashboard/exams">
              <Button variant="ghost" size="sm" className="text-xs text-gray-500">
                View all →
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="w-10 h-10 rounded-lg" />
                    <div className="flex-1">
                      <Skeleton className="h-3.5 w-28 mb-1" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (data?.upcomingExams ?? []).length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">
                <BookOpen className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                No upcoming exams scheduled
              </div>
            ) : (
              <div className="divide-y">
                {(data?.upcomingExams ?? []).map((exam) => {
                  const start = new Date(exam.startDate)
                  const daysUntil = Math.ceil((start.getTime() - renderedAt) / (1000 * 60 * 60 * 24))
                  return (
                    <div key={exam.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="w-10 h-10 rounded-lg bg-purple-100 flex flex-col items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-purple-700 leading-none">
                          {start.toLocaleDateString('en', { month: 'short' }).toUpperCase()}
                        </span>
                        <span className="text-sm font-black text-purple-800 leading-none">
                          {start.getDate()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-gray-900 truncate">{exam.name}</p>
                        <p className="text-xs text-gray-500">{exam.class.name}</p>
                      </div>
                      <div className="flex-shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          daysUntil <= 3
                            ? 'bg-red-100 text-red-700'
                            : daysUntil <= 7
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {daysUntil === 0 ? 'Today' : daysUntil === 1 ? 'Tomorrow' : `${daysUntil}d`}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
