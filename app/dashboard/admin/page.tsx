'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { fetchPaginatedApi } from '@/lib/api-client'
import { AccessDenied } from '@/components/AccessDenied'
import { ActivityLogCard } from '@/components/shared/ActivityLogCard'
import {
  ShieldCheck,
  ClipboardCheck,
  Users,
  GraduationCap,
  CreditCard,
  Building,
  BarChart2,
  CalendarDays,
  FileText,
  Coins,
  KeyRound,
} from 'lucide-react'

const ADMIN_ACTIONS = [
  {
    title: 'Start New Admission',
    description: 'Process a fresh student registration with required documents and fee schedule.',
    href: '/dashboard/students/admission',
    icon: ClipboardCheck,
    badge: 'Admissions',
  },
  {
    title: 'Review Teaching Staff',
    description: 'Open the teacher directory, assign classes, and manage academic assignments.',
    href: '/dashboard/teachers',
    icon: GraduationCap,
    badge: 'Staff',
  },
  {
    title: 'Manage Fee Collections',
    description: 'Review outstanding challans, reconcile payments, and generate new invoices.',
    href: '/dashboard/fees',
    icon: CreditCard,
    badge: 'Finance',
  },
  {
    title: 'Configure Permissions',
    description: 'Review role allowances and create temporary permission overrides for operational exceptions.',
    href: '/dashboard/admin/permissions',
    icon: ShieldCheck,
    badge: 'Security',
  },
  {
    title: 'Assume a role',
    description: 'Create a temporary role assumption for support, troubleshooting, and compliance review.',
    href: '/dashboard/admin/role-assumptions',
    icon: KeyRound,
    badge: 'Support',
  },
  {
    title: 'Academic Engine',
    description: 'Years, shifts, sections, offerings, timetable builder, grading, and electives.',
    href: '/dashboard/academic',
    icon: GraduationCap,
    badge: 'Academic',
  },
  {
    title: 'Penalty Policies & Promotions',
    description: 'Fee/teacher lateness rules, year-end lock, promotion wizard, and report cards.',
    href: '/dashboard/policies',
    icon: BarChart2,
    badge: 'Academic',
  },
  {
    title: 'Configure Campuses & Classes',
    description: 'Update campus details, batch configuration, and class groupings for the school.',
    href: '/dashboard/campuses',
    icon: Building,
    badge: 'Operations',
  },
  {
    title: 'School Calendar & Events',
    description: 'Publish term dates, notice board events, and academic calendar updates.',
    href: '/dashboard/calendar',
    icon: CalendarDays,
    badge: 'Planning',
  },
  {
    title: 'Announcements & Documents',
    description: 'Communicate policy changes, event notices, and important documentation.',
    href: '/dashboard/announcements',
    icon: FileText,
    badge: 'Communication',
  },
]

const ADMIN_OVERVIEW = [
  {
    title: 'Admissions Workflow',
    description: 'Track pending applications, approve intake, and assign seats to new students.',
    icon: ClipboardCheck,
  },
  {
    title: 'Staff Allocation',
    description: 'Coordinate teacher assignments, class schedules, and academic load distribution.',
    icon: Users,
  },
  {
    title: 'Fee Collection Pulse',
    description: 'Monitor outstanding fees, overdue invoices, and payment approvals.',
    icon: CreditCard,
  },
  {
    title: 'Operational Readiness',
    description: 'Keep campuses, batches, and class schedules aligned with the academic calendar.',
    icon: Building,
  },
  {
    title: 'Compliance & Reporting',
    description: 'Capture announcements, documents, and record approvals for auditors.',
    icon: BarChart2,
  },
  {
    title: 'Daily Planner',
    description: 'Ensure daily attendance, timetable review, and event coordination are on track.',
    icon: CalendarDays,
  },
]

export default function AdminWorkspacePage() {
  const { data: session, status } = useSession()
  const role = session?.user?.role as string | undefined
  const isAdminView = role === 'SUPER_ADMIN' || role === 'ADMIN'

  const { data: leaveSummary, isLoading: isLoadingLeaveSummary } = useQuery({
    queryKey: ['admin-leave-summary'],
    queryFn: () => fetchPaginatedApi<{ id: string }>('/api/leaves?limit=1'),
    enabled: isAdminView,
  })

  const leaveCount = leaveSummary?.pagination.total ?? 0

  const actions = useMemo(() => {
    const list = [...ADMIN_ACTIONS]
    if (role === 'SUPER_ADMIN') {
      list.push({
        title: 'Reserve Fund Ledger',
        description: 'Inspect the institutional capital reserve ledger and trace P&L allocations.',
        href: '/dashboard/admin/reserve-fund',
        icon: Coins,
        badge: 'Governance',
      })
    }
    return list
  }, [role])

  if (status === 'loading') {
    return null
  }

  if (!isAdminView) {
    return (
      <AccessDenied
        title="Admin Workspace Restricted"
        message="This section is available only to school administrators. If you need access, please contact your super admin."
      />
    )
  }

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
              <ShieldCheck className="w-4 h-4" />
              Admin Workspace
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-900">School Operations Hub</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Centralize admissions, staff operations, fee collections, and campus configuration in one admin control panel.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Badge variant="secondary">{session?.user?.name ?? 'Administrator'}</Badge>
            <Badge variant="default">{role === 'SUPER_ADMIN' ? 'Super Admin' : 'Admin'}</Badge>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ADMIN_OVERVIEW.map((item) => (
            <div key={item.title} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-slate-800 shadow-sm">
                  <item.icon className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Status</span>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Priority admin actions</CardTitle>
            <CardDescription>Launch the tasks that matter most for day-to-day operations.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {actions.slice(0, 4).map((action) => (
              <div key={action.title} className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm text-slate-700">
                    <action.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">{action.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{action.description}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 items-center justify-between">
                  <Badge variant="outline">{action.badge}</Badge>
                  <Link href={action.href} className="text-sm font-semibold text-blue-600 hover:text-blue-700">
                    Open <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Admin goalboard</CardTitle>
            <CardDescription>Keep your priorities aligned with school operations, compliance, and finance.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Today&apos;s focus</p>
                <p className="mt-2 text-sm text-slate-600">Confirm new admissions, review fee collections, and validate next week&apos;s class assignments.</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-900">Operational checklist</p>
                <ul className="mt-3 space-y-2 text-sm text-slate-600">
                  <li>• Validate attendance rules for the current term</li>
                  <li>• Confirm campus and batch settings</li>
                  <li>• Review overdue fee reconciliation</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="border-amber-100 bg-amber-50 shadow-sm">
          <CardHeader>
            <CardTitle>Leave request queue</CardTitle>
            <CardDescription>Review campus leave requests for students and staff.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-3xl font-black text-slate-900">{isLoadingLeaveSummary ? 'Loading…' : leaveCount}</p>
                <p className="text-sm text-slate-600">Total leave requests pending review.</p>
              </div>
              <Link href="/dashboard/leaves" className="rounded-2xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700">
                Open Leaves
              </Link>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Operational Audit Feed</p>
            <p className="mt-1 text-sm text-slate-500">Recent system activity for announcements, leave requests, complaints, academic queries, and policy changes.</p>
          </div>
          <Link href="/audit" className="text-sm font-semibold text-blue-600 hover:text-blue-700">
            View full audit logs →
          </Link>
        </div>

        <div className="mt-6 grid gap-4 xl:grid-cols-2">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            <ActivityLogCard
              apiUrl="/api/audit-logs?entityType=Announcement&limit=5"
              title="Announcement Activity"
              description="Published, updated, and removed announcements."
              emptyText="No announcement activity has been recorded yet."
            />
            <ActivityLogCard
              apiUrl="/api/audit-logs?entityType=LeaveRequest&limit=5"
              title="Leave Audit"
              description="Leave applications, approvals, and review actions."
              emptyText="No leave activity has been recorded yet."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-2">
            <ActivityLogCard
              apiUrl="/api/audit-logs?entityType=Complaint&limit=5"
              title="Complaint Activity"
              description="Complaint filings, resolutions, and administrative actions."
              emptyText="No complaint activity has been recorded yet."
            />
            <ActivityLogCard
              apiUrl="/api/audit-logs?entityType=StudentQuery&limit=5"
              title="Academic Query Audit"
              description="Student query submissions and teacher/admin responses."
              emptyText="No academic query activity has been recorded yet."
            />
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <ActivityLogCard
            apiUrl="/api/audit-logs?entityType=TeacherPenaltyPolicy&limit=5"
            title="Penalty Policy Audit"
            description="Teacher penalty and late-policy changes."
            emptyText="No penalty policy changes have been recorded yet."
          />
          <ActivityLogCard
            apiUrl="/api/audit-logs?limit=5"
            title="System-Wide Audit"
            description="Latest system-wide audit entries, including fee, attendance, and administrative actions."
            emptyText="No system audit entries are available yet."
          />
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {actions.map((action) => (
          <Card key={action.title} className="group hover:border-blue-500 hover:shadow-md transition-all">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                  <action.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">{action.title}</p>
                  <p className="text-xs uppercase tracking-[0.24em] text-slate-400">{action.badge}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm leading-relaxed text-slate-600">{action.description}</p>
              <Link href={action.href} className="inline-flex items-center text-sm font-semibold text-blue-600 hover:text-blue-700">
                Launch <span aria-hidden="true" className="ml-1">→</span>
              </Link>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  )
}
