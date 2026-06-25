'use client'

import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  admin: 'Admin',
  admissions: 'Admissions',
  students: 'Students',
  teachers: 'Teachers',
  fees: 'Fees',
  attendance: 'Attendance',
  exams: 'Exams',
  results: 'Results',
  calendar: 'Calendar',
  timetable: 'Timetable',
  settings: 'Settings',
  reports: 'Reports',
  academics: 'Academics',
  documents: 'Documents',
  campuses: 'Campuses',
  batches: 'Batches',
  leaves: 'Leaves',
  promotions: 'Promotions',
  'report-cards': 'Report Cards',
  'teacher-feedback': 'Teacher Feedback',
  'my-children': 'My Children',
  'student': 'Student',
  'parent': 'Parent',
  'guardian': 'Guardian',
}

const formatSegment = (segment: string) => {
  if (!segment) return ''
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment]
  if (/^\[.+\]$/.test(segment)) return 'Details'

  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (chr) => chr.toUpperCase())
}

export function Breadcrumbs({ pathname }: { pathname: string }) {
  const segments = pathname.split('/').filter(Boolean)

  if (segments.length <= 1) {
    return (
      <p className="text-sm font-semibold text-gray-800 truncate">
        Dashboard
      </p>
    )
  }

  const items = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    return {
      label: formatSegment(segment),
      href,
      isLast: index === segments.length - 1,
    }
  })

  return (
    <nav aria-label="Breadcrumb" className="mt-1 text-sm text-slate-500">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item) => (
          <li key={item.href} className="flex items-center gap-2">
            <Link
              href={item.href}
              className={`transition-colors ${item.isLast ? 'text-slate-700 font-semibold' : 'hover:text-slate-900'}`}
              aria-current={item.isLast ? 'page' : undefined}
            >
              {item.label}
            </Link>
            {!item.isLast && <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
          </li>
        ))}
      </ol>
    </nav>
  )
}
