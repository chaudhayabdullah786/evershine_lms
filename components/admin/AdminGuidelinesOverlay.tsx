'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  X, Info, GraduationCap, MapPin, Layers, Clock,
  Users, Calendar, BookOpen, ChevronDown, ChevronUp,
  CheckCircle2
} from 'lucide-react'

const STEPS = [
  {
    step: '1',
    title: 'Academic Years',
    description: 'Create and activate an Academic Year (e.g., 2025-2026). Only one year can be active at a time. Use "Quick Bootstrap" if starting fresh.',
    icon: <Calendar className="w-4 h-4" />,
    color: 'text-indigo-600',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
  },
  {
    step: '2',
    title: 'Define Shifts',
    description: 'Set up Morning, Evening, or Night shifts with start/end times. Students enroll in one section per shift per year.',
    icon: <Clock className="w-4 h-4" />,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
  },
  {
    step: '3',
    title: 'Create Class Sections',
    description: 'Combine Campuses, Batches, and Shifts into Class Sections (e.g., Class 9-A). Choose Fixed or Elective curriculum mode.',
    icon: <Layers className="w-4 h-4" />,
    color: 'text-violet-600',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
  },
  {
    step: '4',
    title: 'Subject Offerings',
    description: 'Link subjects and teachers to class sections. Mark each as mandatory (core) or elective (student choice).',
    icon: <BookOpen className="w-4 h-4" />,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  {
    step: '5',
    title: 'Build Timetables',
    description: 'Schedule subjects into rooms at specific times per day. Then publish the timetable for teachers and students to see.',
    icon: <Users className="w-4 h-4" />,
    color: 'text-orange-600',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  {
    step: '6',
    title: 'Grading & Results',
    description: 'Create grading schemes per section/subject. Teachers enter marks. Once ready, publish results for students to view their report cards.',
    icon: <GraduationCap className="w-4 h-4" />,
    color: 'text-rose-600',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
  },
]

export function AdminGuidelinesOverlay() {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (typeof window === 'undefined') return false
    return !localStorage.getItem('hasSeenAcademicGuide')
  })

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('hasSeenAcademicGuide', 'true')
    }
    setIsExpanded(false)
  }

  if (!isExpanded) {
    return (
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2 text-xs font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-3 py-2 transition-all w-fit"
      >
        <Info className="w-3.5 h-3.5" />
        Show Setup Guide
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">Academic Engine — Setup Guide</p>
            <p className="text-xs text-slate-600">Follow these steps in order to configure your institution</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDismiss}
            className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 bg-white border border-indigo-200 rounded-lg px-2.5 py-1 transition-all"
          >
            Dismiss
          </button>
          <button
            onClick={() => setIsExpanded(false)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-white/60 transition-all"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Steps Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {STEPS.map((s) => (
          <div
            key={s.step}
            className={`flex items-start gap-3 rounded-lg border ${s.border} ${s.bg} p-3`}
          >
            <div className={`w-7 h-7 rounded-full bg-white border ${s.border} flex items-center justify-center flex-shrink-0 shadow-sm`}>
              <span className={`text-xs font-black ${s.color}`}>{s.step}</span>
            </div>
            <div className="min-w-0">
              <div className={`flex items-center gap-1.5 mb-0.5`}>
                <span className={s.color}>{s.icon}</span>
                <p className={`text-xs font-bold ${s.color}`}>{s.title}</p>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{s.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
