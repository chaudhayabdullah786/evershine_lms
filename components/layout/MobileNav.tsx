'use client'

import Link from 'next/link'
import { BookOpen, CalendarClock, LayoutDashboard, Settings, Users } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const ROLE_NAV_MAP: Record<string, NavItem[]> = {
  STUDENT: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/enrollment', label: 'Academics', icon: BookOpen },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  PARENT: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/my-children', label: 'Children', icon: Users },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  GUARDIAN: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/my-children', label: 'Children', icon: Users },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  TEACHER: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/teacher/students', label: 'Students', icon: Users },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  SUPER_ADMIN: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/students', label: 'Students', icon: Users },
    { href: '/dashboard/fees', label: 'Fees', icon: BookOpen },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  ADMIN: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/students', label: 'Students', icon: Users },
    { href: '/dashboard/fees', label: 'Fees', icon: BookOpen },
    { href: '/dashboard/settings', label: 'Profile', icon: Settings },
  ],
  ACCOUNTANT: [
    { href: '/dashboard', label: 'Home', icon: LayoutDashboard },
    { href: '/dashboard/fees', label: 'Fees', icon: BookOpen },
    { href: '/dashboard/timetable', label: 'Timetable', icon: CalendarClock },
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
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-[11px] transition-colors ${
                active ? 'text-primary-600' : 'text-slate-500 hover:text-slate-900'
              }`}
              aria-current={active ? 'page' : undefined}
            >
              <Icon className={`h-5 w-5 ${active ? 'text-primary-600' : 'text-slate-500'}`} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
