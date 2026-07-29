'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Users, ClipboardList, Megaphone, UserCheck, Wallet,
  ClipboardCheck, BarChart2, LineChart, Target,
} from 'lucide-react'
import Link from 'next/link'

const TEACHER_QUICK_LINKS = [
  {
    href: '/dashboard/teacher/students',
    icon: Users,
    label: 'My Students',
    description: 'View students in your assigned classes',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100',
    iconBg: 'bg-indigo-100',
  },
  {
    href: '/dashboard/attendance',
    icon: ClipboardCheck,
    label: 'Student Attendance',
    description: 'Take roll call for assigned classes',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100',
    iconBg: 'bg-emerald-100',
  },
  {
    href: '/dashboard/teacher/tasks',
    icon: ClipboardList,
    label: 'Tasks & Marks',
    description: 'Create assignments and enter student marks',
    color: 'bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100',
    iconBg: 'bg-violet-100',
  },
  {
    href: '/dashboard/teacher/announcements',
    icon: Megaphone,
    label: 'Announcements',
    description: 'Share messages and links with your classes',
    color: 'bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100',
    iconBg: 'bg-amber-100',
  },
  {
    href: '/dashboard/teacher/leaves',
    icon: UserCheck,
    label: 'Student Leaves',
    description: 'Review pending leave requests',
    color: 'bg-rose-50 text-rose-700 border-rose-100 hover:bg-rose-100',
    iconBg: 'bg-rose-100',
  },
  {
    href: '/dashboard/teacher/results',
    icon: BarChart2,
    label: 'Exam Results',
    description: 'View and declare student exam results',
    color: 'bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100',
    iconBg: 'bg-blue-100',
  },
  {
    href: '/dashboard/teacher/daily-scores',
    icon: Target,
    label: 'Daily Scores',
    description: 'Enter daily PST performance scores for students',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-100 hover:bg-cyan-100',
    iconBg: 'bg-cyan-100',
  },
  {
    href: '/dashboard/teacher/hr',
    icon: Wallet,
    label: 'HR & Salary',
    description: 'View salary slips and submit applications',
    color: 'bg-teal-50 text-teal-700 border-teal-100 hover:bg-teal-100',
    iconBg: 'bg-teal-100',
  },
  {
    href: '/dashboard/teacher/monthly-monitoring',
    icon: LineChart,
    label: 'Monthly Monitoring',
    description: 'View monthly monitoring and student groups',
    color: 'bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100',
    iconBg: 'bg-orange-100',
  },
]

export default function TeacherPortalIndexPage() {
  const { data: session } = useSession()
  const router = useRouter()

  const { data: teacherLeaves = [] } = useQuery<{ status: 'PENDING' | 'APPROVED' | 'REJECTED' }[]>({
    queryKey: ['teacher-leaves-summary'],
    queryFn: () => fetchApi<{ status: 'PENDING' | 'APPROVED' | 'REJECTED' }[]>('/api/teacher-portal/leaves'),
    enabled: session?.user?.role === 'TEACHER',
  })

  const pendingLeavesCount = teacherLeaves.filter((leave) => leave.status === 'PENDING').length

  // Non-teachers hitting /dashboard/teacher/* should be redirected
  useEffect(() => {
    if (session?.user && session.user.role !== 'TEACHER') {
      router.replace('/dashboard')
    }
  }, [session, router])

  const name = session?.user?.name?.split(' ')[0] ?? 'Teacher'

  return (
    <div className="p-3.5 sm:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-8">
      {/* Header Banner */}
      <Card className="overflow-hidden rounded-2xl sm:rounded-[28px] bg-slate-950/95 text-white shadow-xl ring-1 ring-slate-900/10">
        <div className="p-5 sm:p-8 lg:p-10">
          <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] sm:tracking-[0.35em] text-slate-400">Teacher Portal</p>
              <h1 className="mt-2 sm:mt-4 text-2xl font-semibold tracking-tight text-white sm:text-4xl">
                Welcome back, {name}
              </h1>
              <p className="mt-2 sm:mt-3 max-w-2xl text-xs sm:text-sm leading-relaxed text-slate-300">
                Manage your classes, student progress, announcements, and requests from a single professional portal built for classroom workflows.
              </p>
            </div>
            <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-white/5 p-4 sm:p-5 text-left sm:text-right shrink-0">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.25em] sm:tracking-[0.35em] text-slate-400">Today</p>
              <p className="mt-1 sm:mt-3 text-base sm:text-xl font-semibold text-white">
                {new Date().toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Leave Status Alert */}
      <Card className="rounded-2xl sm:rounded-[24px] border border-slate-200 bg-white/90 shadow-sm">
        <div className="p-4 sm:p-6 flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-slate-500 font-semibold">Leave review status</p>
            <p className="mt-1 text-base sm:text-lg font-semibold text-slate-900">{pendingLeavesCount} pending student leave request{pendingLeavesCount === 1 ? '' : 's'}</p>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">Stay on top of approved, rejected, and pending leave workflows for your assigned students.</p>
          </div>
          <Link href="/dashboard/teacher/leaves" className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl sm:rounded-2xl bg-slate-900 px-4 py-2.5 sm:py-3 text-xs sm:text-sm font-semibold text-white transition hover:bg-slate-800 shrink-0">
            Open Student Leaves
          </Link>
        </div>
      </Card>

      {/* My Shifts Summary Card */}
      <MyShiftsSummary />

      {/* Quick Access Section */}
      <div>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-[0.2em] sm:tracking-[0.24em] text-slate-500">Quick access</h2>
            <p className="mt-1 text-xs sm:text-sm text-slate-600">Open the most important teacher workflows with a single tap.</p>
          </div>
        </div>

        <div className="mt-4 sm:mt-5 grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {TEACHER_QUICK_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`group relative overflow-hidden rounded-2xl sm:rounded-[24px] border border-slate-200/80 bg-white p-4 sm:p-5 transition duration-150 hover:-translate-y-0.5 hover:shadow-lg flex items-start sm:block gap-3.5 sm:gap-0 ${link.color}`}
              aria-label={link.label}
            >
              <div className={`flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl ${link.iconBg} transition duration-150 group-hover:scale-105 shrink-0`}>
                <link.icon className="h-5 w-5" />
              </div>
              <div className="sm:mt-4 min-w-0 flex-1">
                <p className="font-semibold text-sm text-slate-900 leading-tight">{link.label}</p>
                <p className="mt-1 sm:mt-2 text-xs leading-relaxed text-slate-600">{link.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Admin Disclaimer Banner */}
      <Card className="rounded-2xl sm:rounded-[24px] border border-amber-100 bg-amber-50 p-4 sm:px-6 sm:py-5 text-amber-900 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-semibold text-xs sm:text-sm">Reminder — Read-only student records</p>
            <p className="text-xs sm:text-sm text-amber-800/90 leading-relaxed">
              You can view student profiles and class details here, but direct record edits are handled by the Admin team. Use <strong>Request Admin Action</strong> on the My Students page when follow-up is needed.
            </p>
          </div>
          <div className="inline-flex self-start sm:self-auto items-center gap-2 rounded-xl bg-amber-100/80 px-3 py-1.5 text-[10px] sm:text-xs font-semibold uppercase tracking-[0.15em] text-amber-900 shrink-0">
            <span>Best practice</span>
          </div>
        </div>
      </Card>
    </div>
  )
}

// ── My Shifts Summary Sub-Component ─────────────────────────────────────────
const SHIFT_BADGE_CLASSES: Record<string, string> = {
  MORNING: 'bg-amber-100 text-amber-800 border-amber-200',
  EVENING: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  NIGHT: 'bg-violet-100 text-violet-800 border-violet-200',
}

function MyShiftsSummary() {
  const { data: session } = useSession()

  const { data: assignmentsRaw, isLoading } = useQuery<{
    shifts: Array<{
      code: string
      label: string
      sections: Array<{
        className: string
        sectionName: string
        subject: string
        studentCount: number
        deliveryMode: string
      }>
    }>
    totalSections: number
    totalStudents: number
    activeShifts: string[]
    academicYear?: string
  }>({
    queryKey: ['teacher-my-assignments'],
    queryFn: () => fetchApi('/api/teacher-portal/my-assignments'),
    enabled: session?.user?.role === 'TEACHER',
  })

  const assignments = assignmentsRaw

  if (isLoading) {
    return (
      <Card className="rounded-2xl sm:rounded-[24px] border border-slate-200 bg-white/90 shadow-sm">
        <div className="p-4 sm:p-6 animate-pulse space-y-3">
          <div className="h-4 w-36 bg-slate-200 rounded" />
          <div className="h-6 w-48 bg-slate-200 rounded" />
        </div>
      </Card>
    )
  }

  if (!assignments || assignments.shifts.length === 0) return null

  return (
    <Card className="rounded-2xl sm:rounded-[24px] border border-slate-200 bg-white/90 shadow-sm overflow-hidden">
      <div className="p-4 sm:p-6 space-y-4">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-slate-500 font-semibold">My Teaching Profile</p>
            <p className="mt-1 text-base sm:text-lg font-semibold text-slate-900">
              {assignments.totalSections} class section{assignments.totalSections !== 1 ? 's' : ''} · {assignments.totalStudents} student{assignments.totalStudents !== 1 ? 's' : ''}
            </p>
            {assignments.academicYear && (
              <p className="mt-0.5 text-xs text-slate-500">{assignments.academicYear}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {assignments.activeShifts.map((code) => (
              <Badge
                key={code}
                variant="outline"
                className={`text-[10px] sm:text-xs font-bold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full ${SHIFT_BADGE_CLASSES[code] ?? 'bg-gray-100 text-gray-700'}`}
              >
                {assignments.shifts.find((s) => s.code === code)?.label ?? code}
              </Badge>
            ))}
          </div>
        </div>

        {/* Shift breakdown */}
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {assignments.shifts.map((shift) => (
            <div key={shift.code} className={`rounded-xl sm:rounded-2xl border p-3.5 sm:p-4 ${SHIFT_BADGE_CLASSES[shift.code]?.replace('text-', 'border-').split(' ')[0]} bg-white`}>
              <p className="text-xs sm:text-sm font-bold text-slate-800">{shift.label}</p>
              <div className="mt-2 space-y-1.5">
                {shift.sections.slice(0, 4).map((sec, i) => (
                  <div key={i} className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-slate-900">{sec.className}-{sec.sectionName}</span>
                    <span className="text-slate-400">·</span>
                    <span className="truncate max-w-[120px]">{sec.subject}</span>
                    {sec.deliveryMode !== 'PHYSICAL' && (
                      <span className="text-[9px] bg-cyan-100 text-cyan-700 px-1 py-0.5 rounded">
                        {sec.deliveryMode === 'ONLINE' ? '💻' : '🔄'}
                      </span>
                    )}
                  </div>
                ))}
                {shift.sections.length > 4 && (
                  <p className="text-[10px] text-slate-400 font-medium">+{shift.sections.length - 4} more sections</p>
                )}
              </div>
              <p className="mt-2.5 text-[10px] text-slate-500 font-medium border-t pt-1.5 border-slate-100">
                {shift.sections.reduce((s, sec) => s + sec.studentCount, 0)} enrolled students
              </p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  )
}
