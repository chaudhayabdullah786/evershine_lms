'use client'
/**
 * _components.tsx — Shared field components & constants for the admission wizard.
 *
 * WHY separate file: Keeps the 900+ line page.tsx focused on form logic.
 * All presentation primitives and static data live here.
 *
 * DESIGN: Enterprise "navy-gold" palette matching academy branding.
 */

import { Label } from '@/components/ui/label'
import {
  AlertCircle,
  BookOpen,
  User,
  GraduationCap,
  ClipboardList,
  Users,
  Send,
} from 'lucide-react'

/* ── Field Primitives ─────────────────────────────────────────── */

export function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-red-600 mt-1.5 font-medium animate-in fade-in slide-in-from-top-1 duration-200">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
      {message}
    </p>
  )
}

export function FL({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <Label className="text-[13px] font-semibold text-slate-700 tracking-wide">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </Label>
  )
}

export function FRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">{children}</div>
}

export function FGroup({ children, full }: { children: React.ReactNode; full?: boolean }) {
  return (
    <div
      className={`space-y-2 ${full ? 'sm:col-span-2' : ''} rounded-xl p-0.5 transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:ring-offset-1 focus-within:ring-offset-white`}
    >
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pb-4 mb-3 border-b border-slate-200/80">
      <div className="h-8 w-1.5 rounded-full bg-gradient-to-b from-blue-600 to-indigo-600" />
      <h3 className="text-lg font-bold text-slate-900 tracking-tight">{children}</h3>
    </div>
  )
}

/* ── Step Metadata ────────────────────────────────────────────── */

export const STEP_META = [
  { label: 'Program',   desc: 'Select your class, course group & campus preference',   icon: BookOpen },
  { label: 'Student',   desc: 'Personal identity, contact & residential address',       icon: User },
  { label: 'Academics', desc: 'Previous academic history & document uploads',            icon: GraduationCap },
  { label: 'Interview', desc: 'Prior academic result details for evaluation',            icon: ClipboardList },
  { label: 'Guardian',  desc: 'Parent or guardian contact & employment details',         icon: Users },
  { label: 'Review',    desc: 'Confirm your details, accept terms & submit',            icon: Send },
]

/* ── Static Data Constants ────────────────────────────────────── */

export const PAKISTAN_PROVINCES = [
  'Punjab', 'Sindh', 'Khyber Pakhtunkhwa', 'Balochistan',
  'Gilgit-Baltistan', 'Azad Jammu & Kashmir', 'Islamabad Capital Territory',
]

export const FATHER_QUALIFICATIONS = [
  'Below Primary', 'Primary (Class 5)', 'Middle (Class 8)',
  'Matriculation (Class 10)', 'Intermediate (Class 12)',
  'Bachelor\'s Degree', 'Master\'s Degree', 'PhD / Doctorate', 'Professional Degree',
]

export const FATHER_OCCUPATIONS = [
  'Government Service', 'Private Service', 'Business / Self-Employed',
  'Farming / Agriculture', 'Teaching', 'Doctor / Medical',
  'Engineer', 'Lawyer', 'Army / Police / Paramilitary',
  'Labour / Daily Wage', 'Retired', 'Deceased', 'Other',
]

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

export const RELATIONSHIPS = [
  'Father', 'Mother', 'Brother', 'Sister', 'Uncle', 'Aunt', 'Grandfather',
  'Grandmother', 'Legal Guardian', 'Other',
]

export const ACADEMIC_LEVELS = [
  { value: 'PG_TO_5TH',  label: 'Play Group to 5th' },
  { value: '6_TO_PRE_9TH', label: '6th to Pre 9th' },
  { value: '9TH',        label: '9th (Matric Part-I)' },
  { value: '10TH',       label: '10th (Matric Part-II)' },
  { value: '11TH',       label: '11th (Inter Part-I)' },
  { value: '12TH',       label: '12th (Inter Part-II)' },
  { value: 'O_LEVEL',    label: 'O Level' },
  { value: 'A_LEVEL',    label: 'A Level' },
  { value: 'ADP',        label: 'ADP' },
  { value: 'BS',         label: 'BS' },
  { value: 'OTHER',      label: 'Other' },
]

export const REPEATER_SUBJECTS = [
  'Physics', 'Chemistry', 'Bio/Math', 'Urdu', 'English', 'Islamiat / Pak Study', 'Other'
]

export const GUARDIAN_EMPLOYMENT_STATUSES = [
  { value: 'GOVT',    label: 'Government Employed' },
  { value: 'PRIVATE', label: 'Private Sector' },
  { value: 'BUSINESS',label: 'Business Owner' },
  { value: 'NONE',    label: 'Unemployed / Retired / N/A' },
]

export const ACADEMIC_GROUPS = [
  'Basics', 'Computer Group', 'Biology Group', 'Arts',
  'Pre Medical', 'Pre Engineering', 'I.C.S',
  'F.A', 'F.A (IT)', 'F.Sc', 'I.Com', 'G.Science',
  'O Level', 'A Level', 'ADP', 'Diploma',
  // Quranic & Islamic programs
  'Hifz-ul-Quran', 'Nazra Quran', 'Quranic Studies',
  'Other'
]

// WHY no COURSE_FEE_ESTIMATE_MAP: Fee structures are managed by the Super Admin
// at approval time, not hardcoded in the frontend. Hardcoded fees would drift
// from actual institutional pricing and create data integrity issues. The admin
// enters the exact fee amounts during the admission approval workflow.

/**
 * Delivery modes for course enrollment.
 * WHY exported: Used by both the public admission form and the admin admission wizard
 * to let applicants/admins select how the student will attend classes.
 */
export const DELIVERY_MODES = [
  { value: 'PHYSICAL', label: '🏫 On-Campus (Physical)' },
  { value: 'ONLINE', label: '💻 Online' },
  { value: 'HYBRID', label: '🔄 Hybrid (On-Campus + Online)' },
] as const

export const MARKETING_SOURCES = [
  'Newspaper', 'Banners', 'Outdoor Hoardings', 'Streamers (Pent)',
  'Brochure/Leaflet', 'SMS', 'ESA Website', 'Facebook/Google',
  'Family/Friends', 'TV', 'Cable', 'FM Radio', 'Seminar',
  'Letter', 'Telemarketing', 'Box Board', 'Others'
]

/* ── Admission Rules (from physical form page 2) ──────────────── */

export const ADMISSION_RULES = [
  'Fee once deposited is neither refundable nor adjustable in any case.',
  'Session timings are subject to the availability of the teachers and can be amended if required.',
  'Parents must attend the office regularly within mentioned time to discuss the progress of the student.',
  'AWC will be applied to late and absentees. Moreover pay your academy dues within mentioned dates.',
  'Misconduct of any type will be culpable.',
  'Any damage caused by the student will be charged accordingly.',
  'Institution is relieved of responsibility (legal, etc.) in case of any injury, damage or loss, which is beyond its control.',
  'Use of mobile phones and wearing jewelry is strictly prohibited in the campus premises.',
  'Institution will not, in any case, be responsible for any loss suffered by a student.',
  'It is mandatory for every student to attend the ESA EVENTS.',
  'Registration is mandatory for every student every year.',
  'Decisions of the administration will be final, in any case.',
]
