'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { fetchApi } from '@/lib/api-client'
import { getNotificationModuleForNavLabel, type NotificationCounts } from '@/lib/notifications/module-map'
import {
  BookOpen,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
} from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

// Mobile bottom nav — shows the most critical pages per role.
// Items are weighted toward the role's primary workspace so users
// can access their most-used features without opening the sidebar.
const ROLE_NAV_MAP: Record<string, NavItem[]> = {
  STUDENT: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/enrollment', label: 'Academics', icon: BookOpen },
    { href: '/dashboard/fees', label: 'Fees', icon: CreditCard },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  PARENT: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/my-children', label: 'Children', icon: Users },
    { href: '/dashboard/fees', label: 'Fees', icon: CreditCard },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  GUARDIAN: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/my-children', label: 'Children', icon: Users },
    { href: '/dashboard/fees', label: 'Fees', icon: CreditCard },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  TEACHER: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/teacher/students', label: 'Students', icon: Users },
    { href: '/dashboard/teacher/attendance', label: 'Students', icon: ClipboardCheck },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  SUPER_ADMIN: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/admin', label: 'Admin', icon: ShieldCheck },
    { href: '/dashboard/students', label: 'Students', icon: Users },
    { href: '/dashboard/fees', label: 'Fees', icon: CreditCard },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  ADMIN: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/admin', label: 'Admin', icon: ShieldCheck },
    { href: '/dashboard/students', label: 'Students', icon: Users },
    { href: '/dashboard/fees', label: 'Fees', icon: CreditCard },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  ACCOUNTANT: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/accountant', label: 'Finance', icon: Wallet },
    { href: '/dashboard/fees', label: 'Fees', icon: CreditCard },
    { href: '/dashboard/accountant/expenses', label: 'Expenses', icon: BookOpen },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
}

const defaultNav: NavItem[] = [
  { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { href: '/dashboard/students', label: 'Students', icon: Users },
  { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
  { href: '/dashboard/settings', label: 'Profile', icon: Settings },
]

export function MobileNav({ pathname, role }: { pathname: string; role: string }) {
  const navItems = ROLE_NAV_MAP[role] ?? defaultNav

  const { data: countsData } = useQuery({
    queryKey: ['notification-counts'],
    queryFn: () => fetchApi<NotificationCounts>('/api/notifications/counts'),
    refetchInterval: 30000,
  })

  const getBadgeCount = (itemLabel: string) => {
    if (!countsData?.modules) return 0
    const key = getNotificationModuleForNavLabel(itemLabel)
    return key ? (countsData.modules[key] ?? 0) : 0
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    return pathname.startsWith(href)
  }

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white shadow-xl md:hidden">
      <div className="mx-auto flex max-w-4xl justify-between px-4 py-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = isActive(item.href)
          const badgeCount = getBadgeCount(item.label)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] transition-colors ${
                active ? 'text-primary-600' : 'text-slate-500 hover:text-slate-900'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className={`h-5 w-5 ${active ? 'text-primary-600' : 'text-slate-500'}`} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-extrabold min-w-[14px] h-[14px] rounded-full flex items-center justify-center px-0.5 leading-none">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </div>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
