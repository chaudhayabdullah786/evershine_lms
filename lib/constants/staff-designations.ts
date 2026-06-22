/**
 * Staff Designation Constants
 *
 * WHY centralized: Every page that renders or filters by designation imports
 * from this single source of truth. Adding/removing a designation is a one-line
 * change here — no multi-file grep required.
 *
 * TRADEOFF: Using a freeform String in Prisma (not an enum) intentionally —
 * the "Other" option allows admins to define custom designations without a
 * schema migration. The constants here drive UI dropdowns and badge styling.
 */

// ── All available staff designations ─────────────────────────────────────────
export const STAFF_DESIGNATIONS = [
  'Teacher',
  'Senior Teacher',
  'Class Incharge + Teacher',
  'Class Incharge Only',
  'Subject Coordinator',
  'Head of Department',
  'Coordinator',
  'Academic Head',
  'Campus Head',
  'Administrator',
  'Principal',
  'Principal + Vice Principal',
  'Chief Advisor',
  'Security Guard',
  'Sweeper',
  'Other',
] as const

export type StaffDesignation = (typeof STAFF_DESIGNATIONS)[number]

// ── Designation categories ───────────────────────────────────────────────────

/** Designations that grant teaching capabilities (class assignments, grade entry, timetable slots). */
export const TEACHING_DESIGNATIONS: readonly string[] = [
  'Teacher',
  'Senior Teacher',
  'Class Incharge + Teacher',
  'Class Incharge Only',
  'Subject Coordinator',
  'Head of Department',
  'Coordinator',
  'Academic Head',
]

/** Designations for non-teaching support staff (no class/batch/house assignment needed). */
export const NON_TEACHING_DESIGNATIONS: readonly string[] = [
  'Sweeper',
  'Security Guard',
]

/** Leadership designations that may or may not teach. */
export const LEADERSHIP_DESIGNATIONS: readonly string[] = [
  'Campus Head',
  'Administrator',
  'Principal',
  'Principal + Vice Principal',
  'Chief Advisor',
]

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns true if this designation allows class assignments, grade entry,
 * timetable slots, and other teaching-specific features.
 */
export function isTeachingDesignation(designation: string): boolean {
  return TEACHING_DESIGNATIONS.includes(designation)
}

/**
 * Returns true if this designation is non-teaching support staff.
 * Non-teaching staff are exempt from batch/house/class assignment requirements.
 */
export function isNonTeachingDesignation(designation: string): boolean {
  return NON_TEACHING_DESIGNATIONS.includes(designation)
}

/**
 * Returns badge styling and category label for a given designation.
 * Used across the Staff List, Detail Dialog, Edit page, and ID Card.
 */
export function getDesignationBadge(designation: string): {
  className: string
  category: 'Teaching' | 'Support' | 'Leadership'
} {
  if (TEACHING_DESIGNATIONS.includes(designation)) {
    return { className: 'bg-blue-100 text-blue-700 border-blue-200', category: 'Teaching' }
  }
  if (NON_TEACHING_DESIGNATIONS.includes(designation)) {
    return { className: 'bg-amber-100 text-amber-700 border-amber-200', category: 'Support' }
  }
  // Leadership / administrative tier
  return { className: 'bg-purple-100 text-purple-700 border-purple-200', category: 'Leadership' }
}

/**
 * Returns the employee ID prefix based on designation category.
 * Teaching staff → ESA-TCH, Support staff → ESA-SUP, Leadership → ESA-ADM
 */
export function getEmployeeIdPrefix(designation: string): string {
  if (TEACHING_DESIGNATIONS.includes(designation)) return 'ESA-TCH'
  if (NON_TEACHING_DESIGNATIONS.includes(designation)) return 'ESA-SUP'
  return 'ESA-ADM'
}
