'use client'

import { useAppStore } from '@/lib/store'
import { signOut, useSession } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi, fetchPaginatedApi } from '@/lib/api-client'
import { motion, AnimatePresence } from 'framer-motion'
import { notificationPanel, pulseRing, sidebarSlide } from '@/lib/animations'
import { PageTransition } from '@/components/shared/page-transition'
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CreditCard,
  ClipboardCheck,
  FileText,
  LogOut,
  Menu,
  X,
  BookOpen,
  BarChart2,
  Megaphone,
  CalendarDays,
  Building,
  Settings,
  ChevronRight,
  CalendarClock,
  AlertOctagon,
  HelpCircle,
  Banknote,
  Bell,
  UserCheck,
  Wallet,
  ClipboardList,
  ShieldCheck,
  KeyRound,
  Inbox,
  LineChart,
  Target,
} from 'lucide-react'
import { AcademyLogo } from '@/components/AcademyLogo'
import { ArcLineBrand } from '@/components/ArcLineBrand'
import { Breadcrumbs } from '@/components/layout/Breadcrumbs'
import { MobileNav } from '@/components/layout/MobileNav'
import { isAcademicEnginePrimary } from '@/lib/academic/config'
import { CompulsoryFeedbackBlocker } from '@/components/student/CompulsoryFeedbackBlocker'
import { RulesAgreementBlocker } from '@/components/student/RulesAgreementBlocker'
import { GuardianFeedbackModal } from '@/components/feedback/GuardianFeedbackModal'
import { FeeOverdueModal } from '@/components/student/FeeOverdueModal'

// ─── Role-gated nav items ─────────────────────────────────────────────────────
// WHY data-driven: Adding a new route only requires updating this array.
// The 'roles' array is an allowlist — empty = all roles can see it.
interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles?: string[] // if empty/undefined → visible to all authenticated users
  /** Hidden when NEXT_PUBLIC_ACADEMIC_ENGINE_PRIMARY is true (default). */
  legacy?: boolean
}

// Global nav — shown to all roles (subject to per-item 'roles' filter)
const NAV_ITEMS: NavItem[] = [
  { name: 'Dashboard',       href: '/dashboard',              icon: LayoutDashboard },
  { name: 'Admin Workspace', href: '/dashboard/admin',        icon: ShieldCheck,     roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Permissions',     href: '/dashboard/admin/permissions',      icon: ShieldCheck,     roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Role Assumptions', href: '/dashboard/admin/role-assumptions', icon: KeyRound,    roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Credential Management', href: '/dashboard/admin/credential-management', icon: KeyRound, roles: ['SUPER_ADMIN'] },
  { name: 'Admissions',      href: '/dashboard/admissions',   icon: ClipboardCheck,  roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Landing Leads',   href: '/dashboard/leads',        icon: Inbox,           roles: ['SUPER_ADMIN', 'ADMIN'] },
  // Teachers use /dashboard/teacher/students (scoped). Admins use the global view.
  { name: 'Students',        href: '/dashboard/students',     icon: Users,           roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { name: 'Staff Directory',  href: '/dashboard/teachers',     icon: Users,           roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Fees',            href: '/dashboard/fees',         icon: CreditCard,      roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'STUDENT', 'PARENT', 'GUARDIAN'] },
  { name: 'Accounting Hub',   href: '/dashboard/accountant',    icon: Wallet,          roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { name: 'Fee Collection',  href: '/dashboard/accountant/fees', icon: CreditCard,     roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { name: 'Expense Ledger',  href: '/dashboard/accountant/expenses', icon: Wallet,     roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { name: 'Financial Reports', href: '/dashboard/accountant/reports', icon: BarChart2, roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { name: 'Leaves',          href: '/dashboard/leaves',       icon: CalendarClock,   roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT', 'STUDENT'] },
  { name: 'Complaints',      href: '/dashboard/complaints',   icon: AlertOctagon,    roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'ACCOUNTANT', 'STUDENT', 'PARENT', 'GUARDIAN'] },
  { name: 'Academic Queries',href: '/dashboard/queries',      icon: HelpCircle,      roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT'] },
  // Staff Salaries global page: admin/accountant only. Teachers use HR Portal.
  { name: 'Staff Salaries',  href: '/dashboard/salaries',     icon: Banknote,        roles: ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT'] },
  { name: 'Attendance', href: '/dashboard/attendance/sections', icon: ClipboardCheck, roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Class Attendance (Legacy)', href: '/dashboard/attendance/legacy', icon: ClipboardCheck, roles: ['SUPER_ADMIN', 'ADMIN'], legacy: true },
  { name: 'Exams',           href: '/dashboard/exams',        icon: BookOpen,        roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
  { name: 'Results',         href: '/dashboard/results',      icon: BarChart2,       roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER'] },
  { name: 'Announcements',   href: '/dashboard/announcements',icon: Megaphone,       roles: ['SUPER_ADMIN', 'ADMIN', 'GUARDIAN', 'PARENT', 'STUDENT'] },
  { name: 'Calendar',        href: '/dashboard/calendar',     icon: CalendarDays },
  { name: 'My Courses',      href: '/dashboard/enrollment',   icon: BookOpen,        roles: ['STUDENT'] },
  { name: 'Timetable',       href: '/dashboard/timetable',    icon: CalendarClock,   roles: ['SUPER_ADMIN', 'ADMIN', 'TEACHER', 'STUDENT'] },
  { name: 'Documents',       href: '/dashboard/documents',    icon: FileText,        roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Campuses',        href: '/dashboard/campuses',     icon: Building,        roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Batches',         href: '/dashboard/batches',      icon: BookOpen,        roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Classes (Legacy)', href: '/dashboard/classes',      icon: GraduationCap,   roles: ['SUPER_ADMIN', 'ADMIN'], legacy: true },
  { name: 'Academic Engine', href: '/dashboard/academic',     icon: ClipboardList,   roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Penalty Policies', href: '/dashboard/policies',    icon: ShieldCheck,     roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Promotions',      href: '/dashboard/promotions',   icon: GraduationCap,   roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Report Cards',    href: '/dashboard/report-cards', icon: FileText,        roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'Teacher Feedback', href: '/dashboard/teacher-feedback', icon: BarChart2,   roles: ['SUPER_ADMIN', 'ADMIN'] },
  { name: 'My Children',     href: '/dashboard/my-children',  icon: Users,           roles: ['PARENT', 'GUARDIAN'] },
  { name: 'Settings',        href: '/dashboard/settings',     icon: Settings },
]

// Teacher-exclusive nav — only shown when role === 'TEACHER'
const TEACHER_NAV_ITEMS: NavItem[] = [
  { name: 'My Students',        href: '/dashboard/teacher/students',          icon: Users },
  { name: 'Attendance & QR',    href: '/dashboard/teacher/attendance',        icon: ClipboardCheck },
  { name: 'My Announcements',   href: '/dashboard/teacher/announcements',     icon: Megaphone },
  { name: 'Tasks & Marks',      href: '/dashboard/teacher/tasks',             icon: ClipboardList },
  { name: 'Daily Scores',       href: '/dashboard/teacher/daily-scores',      icon: Target },
  { name: 'Grade Entry',        href: '/dashboard/teacher/grade-entry',       icon: GraduationCap },
  { name: 'Student Targets',    href: '/dashboard/teacher/targets',           icon: Target },
  { name: 'Exam Results',       href: '/dashboard/teacher/results',           icon: BarChart2 },
  { name: 'Monthly Monitoring', href: '/dashboard/teacher/monthly-monitoring', icon: LineChart },
  { name: 'Student Leaves',     href: '/dashboard/teacher/leaves',            icon: UserCheck },
  { name: 'HR & Salary',        href: '/dashboard/teacher/hr',                icon: Wallet },
]

function isNavItemVisible(item: NavItem, role: string): boolean {
  if (!item.roles || item.roles.length === 0) return true
  return item.roles.includes(role)
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession()
  const router = useRouter()
  const pathname = usePathname()
  const { sidebarOpen, setSidebarOpen, setUser } = useAppStore()
  const role = (session?.user?.role as string) ?? ''

  // Log a warning in production when role is missing from session
  // This helps diagnose environment-specific auth issues.
  useEffect(() => {
    if (status === 'authenticated' && !role) {
      console.warn(
        '[DASHBOARD] Role is empty in session — RBAC nav filtering will hide all role-gated items. ' +
        'Check NEXTAUTH_URL, NEXTAUTH_SECRET, and whether trustHost: true is set in auth config.',
        'session user:', session?.user,
      )
    }
  }, [status, role, session])

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
    } else if (session?.user) {
      setUser({
        id: session.user.id,
        email: session.user.email!,
        role: role,
        name: session.user.name ?? '',
        campusId: session.user.campusId as string | null,
      })
    }
  }, [session, status, router, setUser, role])

  // Close sidebar whenever route changes (mobile UX)
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname, setSidebarOpen])

  if (status === 'loading') {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading your workspace...</p>
        </div>
      </div>
    )
  }

  const enginePrimary = isAcademicEnginePrimary()
  const visibleNav = NAV_ITEMS.filter(
    (item) => isNavItemVisible(item, role) && (!enginePrimary || !item.legacy)
  )
  const isTeacher   = role === 'TEACHER'

  const getRoleBadge = (r: string) => {
    const map: Record<string, { label: string; className: string }> = {
      SUPER_ADMIN: { label: 'Super Admin', className: 'bg-red-100 text-red-700' },
      ADMIN: { label: 'Admin', className: 'bg-blue-100 text-blue-700' },
      TEACHER: { label: 'Teacher', className: 'bg-green-100 text-green-700' },
      STUDENT: { label: 'Student', className: 'bg-purple-100 text-purple-700' },
      PARENT: { label: 'Parent', className: 'bg-orange-100 text-orange-700' },
      ACCOUNTANT: { label: 'Account Manager', className: 'bg-teal-100 text-teal-700' },
      GUARDIAN: { label: 'Guardian', className: 'bg-yellow-100 text-yellow-700' },
    }
    return map[r] ?? { label: r, className: 'bg-gray-100 text-gray-700' }
  }

  const roleBadge = getRoleBadge(role)

  // Active detection: startsWith handles sub-routes correctly
  // Special case: /dashboard exact match only (not all /dashboard/*)
  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
        <AnimatePresence>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        {/* Sidebar */}
        <AnimatePresence mode="wait">
          <motion.aside
            variants={sidebarSlide}
            initial={sidebarOpen ? "animate" : "initial"}
            animate={sidebarOpen ? "animate" : "initial"}
            className={`fixed inset-y-0 left-0 bg-white border-r border-slate-200 w-64 z-[60] flex flex-col md:relative md:translate-x-0 md:!transform-none shadow-soft-lg md:shadow-none`}
          >
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-gray-100 flex-shrink-0">
          <Link href="/dashboard" className="flex items-center gap-3">
            <AcademyLogo variant="compact" className="h-10" />
          </Link>
          <button className="md:hidden p-1 rounded-md hover:bg-gray-100" onClick={() => setSidebarOpen(false)}>
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          <div className="space-y-0.5">
            {visibleNav.map((item) => {
              const active = isActive(item.href)
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                    active
                      ? 'bg-blue-50 text-blue-700 font-semibold border-l-[3px] border-blue-600 pl-[9px]'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? 'text-blue-600' : ''}`} />
                    {item.name}
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 transition-all duration-200 ${active ? 'opacity-70 text-blue-500' : 'opacity-0 group-hover:opacity-40'}`} />
                </Link>
              )
            })}

            {/* Teacher-exclusive section */}
            {isTeacher && (
              <>
                <div className="pt-3 pb-1 px-3">
                  <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-400">Teacher Hub</p>
                </div>
                {TEACHER_NAV_ITEMS.map((item) => {
                  const active = isActive(item.href)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`group flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 ${
                        active
                          ? 'bg-emerald-50 text-emerald-700 font-semibold border-l-[3px] border-emerald-600 pl-[9px]'
                          : 'text-gray-600 hover:bg-emerald-50/50 hover:text-emerald-800'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <item.icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-200 group-hover:scale-110 ${active ? 'text-emerald-600' : ''}`} />
                        {item.name}
                      </div>
                      <ChevronRight className={`w-3.5 h-3.5 transition-all duration-200 ${active ? 'opacity-70 text-emerald-500' : 'opacity-0 group-hover:opacity-40'}`} />
                    </Link>
                  )
                })}
              </>
            )}
          </div>
        </nav>

        {/* User info at bottom */}
        <div className="flex-shrink-0 border-t border-gray-100 p-3 space-y-2">
          <div className="flex items-center gap-3 px-2 py-2 rounded-xl bg-gray-50/80">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 ring-2 ring-white shadow-sm">
              {session?.user?.name?.[0] ?? session?.user?.email?.[0] ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">
                {session?.user?.name ?? session?.user?.email}
              </p>
              <span className={`inline-flex text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${roleBadge.className}`}>
                {roleBadge.label}
              </span>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-500 rounded-lg hover:bg-red-50 hover:text-red-600 transition-all duration-200 group"
          >
            <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Sign out
          </button>
          <div className="text-center pt-1 border-t border-gray-100">
            <ArcLineBrand prefix="Powered by" />
          </div>
        </div>
      </motion.aside>
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top header */}
        <header className="h-16 border-b border-gray-200/80 bg-white/95 backdrop-blur-sm flex items-center px-4 md:px-6 gap-4 flex-shrink-0 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
          <button
            className="md:hidden p-2 rounded-xl hover:bg-gray-100 transition-colors"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="w-5 h-5 text-gray-600" />
          </button>

          {/* Breadcrumb-style current page name */}
          <div className="flex-1 min-w-0">
            <Breadcrumbs pathname={pathname} />
          </div>

          {/* Right: notification bell + user info */}
          <div className="flex items-center gap-2 sm:gap-3">
            <NotificationBell />
            <div className="hidden sm:flex items-center gap-3 pl-3 border-l border-gray-200">
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-800 leading-tight">{session?.user?.name ?? session?.user?.email}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${roleBadge.className}`}>
                  {roleBadge.label}
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-sm ring-2 ring-gray-100 shadow-sm">
                {session?.user?.name?.[0] ?? '?'}
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 overflow-auto p-4 pb-24 sm:p-6 md:pb-6 relative bg-slate-50/50" style={{ paddingBottom: 'clamp(6rem, calc(6rem + env(safe-area-inset-bottom, 0px)), 8rem)' }}>
          <PageTransition>
            {role === 'STUDENT' && (
              <>
                {/* RulesAgreementBlocker fires first — gates access on first login.
                    CompulsoryFeedbackBlocker only runs once rules are accepted. */}
                <RulesAgreementBlocker />
                <CompulsoryFeedbackBlocker />
                <FeeOverdueModal />
              </>
            )}
            {(role === 'PARENT' || role === 'GUARDIAN') && (
              <>
                <GuardianFeedbackModal />
                <FeeOverdueModal />
              </>
            )}
            {children}
          </PageTransition>
        </div>
        <div className="md:hidden">
          <MobileNav pathname={pathname} role={role} />
        </div>
      </main>
    </div>
  )
}

// ─── Notification Bell Component ─────────────────────────────────────────────
interface Notif { id: string; title: string; message: string; type: string; isRead: boolean; createdAt: string }

function NotificationBell() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetchPaginatedApi<Notif>('/api/notifications?limit=20'),
    refetchInterval: 30000, // poll every 30s
  })

  const notifications = data?.data ?? []
  const unreadCount = notifications.filter(n => !n.isRead).length

  const markAllMutation = useMutation({
    mutationFn: () => fetchApi('/api/notifications', { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markOneMutation = useMutation({
    mutationFn: (id: string) => fetchApi(`/api/notifications/${id}`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const typeColor = (type: string) => {
    if (type === 'LEAVE_APPROVED') return 'border-l-4 border-emerald-500'
    if (type === 'LEAVE_REJECTED') return 'border-l-4 border-rose-500'
    if (type === 'COMPLAINT_RESOLVED') return 'border-l-4 border-blue-500'
    return 'border-l-4 border-slate-300'
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <motion.span
            variants={pulseRing}
            animate="animate"
            className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[9px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center leading-none"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={notificationPanel}
            initial="initial"
            animate="animate"
            exit="exit"
            className="absolute right-0 top-full mt-2 w-72 sm:w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden"
          >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="font-bold text-sm text-slate-800">Notifications</span>
            {unreadCount > 0 && (
              <button onClick={() => markAllMutation.mutate()} className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-50">
            {notifications.length === 0 ? (
              <div className="py-10 text-center text-sm text-slate-400">
                <Bell className="w-8 h-8 mx-auto mb-2 text-slate-200" />
                No notifications
              </div>
            ) : notifications.map(n => (
              <button
                key={n.id}
                onClick={() => { if (!n.isRead) markOneMutation.mutate(n.id) }}
                className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${typeColor(n.type)} ${
                  n.isRead ? 'opacity-60' : 'bg-indigo-50/20'
                }`}
              >
                <p className={`text-xs font-semibold text-slate-800 ${!n.isRead ? 'font-bold' : ''}`}>{n.title}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug line-clamp-2">{n.message}</p>
                <p className="text-[10px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </motion.div>
      )}
      </AnimatePresence>
    </div>
  )
}
