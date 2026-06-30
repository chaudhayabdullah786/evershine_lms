/**
 * Role-Based Access Control (RBAC) Matrix
 *
 * WHY data-driven RBAC (not if/else chains): A matrix keeps permissions
 * auditable in one place. Adding a new role or resource only requires
 * updating this file, not hunting through 20 route handlers.
 *
 * TRADEOFF: This is a coarse-grained RBAC. Row-level security (e.g., a
 * teacher may only read their own assigned classes) is enforced in the
 * service layer, not here.
 */

import type { Role } from '@prisma/client'

export type Action = 'create' | 'read' | 'update' | 'delete'
export type AcademicResource =
  | 'students'
  | 'teachers'
  | 'batches'
  | 'campuses'
  | 'classes'
  | 'houses'
  | 'fees'
  | 'attendance'
  | 'documents'
  | 'users'
  | 'audit_logs'
  | 'dashboard'
  | 'results'
  | 'exams'
  | 'announcements'
  | 'calendar'
  | 'academic_years'
  | 'shifts'
  | 'class_sections'
  | 'subject_offerings'
  | 'subject_enrollments'
  | 'timetable_engine'
  | 'grading_engine'
  | 'promotions'
  | 'fee_penalties'
  | 'teacher_penalties'
  | 'expenses'

type Resource = AcademicResource

type PermissionMap = Record<Role, Record<Resource, Action[]>>

// WHY typed as const: Ensures exhaustive coverage — TypeScript will error
// if a new Role or Resource is added without updating this matrix.
const PERMISSIONS: PermissionMap = {
  SUPER_ADMIN: {
    students: ['create', 'read', 'update', 'delete'],
    teachers: ['create', 'read', 'update', 'delete'],
    batches: ['create', 'read', 'update', 'delete'],
    campuses: ['create', 'read', 'update', 'delete'],
    classes: ['create', 'read', 'update', 'delete'],
    houses: ['create', 'read', 'update', 'delete'],
    fees: ['create', 'read', 'update', 'delete'],
    attendance: ['create', 'read', 'update', 'delete'],
    documents: ['create', 'read', 'update', 'delete'],
    users: ['create', 'read', 'update', 'delete'],
    audit_logs: ['read'],
    dashboard: ['read'],
    results: ['read'],
    exams: ['read'],
    announcements: ['create', 'read', 'update', 'delete'],
    calendar: ['create', 'read', 'update', 'delete'],
    academic_years: ['create', 'read', 'update', 'delete'],
    shifts: ['create', 'read', 'update', 'delete'],
    class_sections: ['create', 'read', 'update', 'delete'],
    subject_offerings: ['create', 'read', 'update', 'delete'],
    subject_enrollments: ['create', 'read', 'update', 'delete'],
    timetable_engine: ['create', 'read', 'update', 'delete'],
    grading_engine: ['read'],
    promotions: ['create', 'read', 'update', 'delete'],
    fee_penalties: ['create', 'read', 'update', 'delete'],
    teacher_penalties: ['create', 'read', 'update', 'delete'],
    expenses: ['create', 'read', 'update', 'delete'],
  },
  ADMIN: {
    students: ['create', 'read', 'update', 'delete'],
    teachers: ['create', 'read', 'update', 'delete'],
    batches: ['create', 'read', 'update', 'delete'],
    campuses: ['read', 'update'],
    classes: ['create', 'read', 'update', 'delete'],
    houses: ['read', 'update', 'delete'],
    fees: ['create', 'read', 'update', 'delete'],
    attendance: ['create', 'read', 'update', 'delete'],
    documents: ['create', 'read', 'update', 'delete'],
    users: ['read'],
    audit_logs: ['read'],
    dashboard: ['read'],
    results: ['create', 'read', 'update', 'delete'],
    exams: ['create', 'read', 'update', 'delete'],
    announcements: ['create', 'read', 'update', 'delete'],
    calendar: ['create', 'read', 'update', 'delete'],
    academic_years: ['create', 'read', 'update'],
    shifts: ['read', 'update'],
    class_sections: ['create', 'read', 'update', 'delete'],
    subject_offerings: ['create', 'read', 'update', 'delete'],
    subject_enrollments: ['create', 'read', 'update', 'delete'],
    timetable_engine: ['create', 'read', 'update', 'delete'],
    grading_engine: ['create', 'read', 'update', 'delete'],
    promotions: ['create', 'read', 'update', 'delete'],
    fee_penalties: ['create', 'read', 'update', 'delete'],
    teacher_penalties: ['create', 'read', 'update'],
    expenses: ['create', 'read', 'update', 'delete'],
  },
  TEACHER: {
    students: ['read'],
    teachers: ['read'],
    batches: ['read'],
    campuses: ['read'],
    classes: ['read'],
    houses: ['read'],
    fees: ['read'],
    // WHY: Teachers can create and read attendance for their assigned classes
    attendance: ['create', 'read'],
    documents: ['read'],
    users: [],
    audit_logs: [],
    dashboard: ['read'],
    results: ['create', 'read', 'update', 'delete'],
    exams: ['read'],
    announcements: ['read'],
    calendar: ['read'],
    academic_years: ['read'],
    shifts: ['read'],
    class_sections: ['read'],
    subject_offerings: ['read'],
    subject_enrollments: ['read'],
    timetable_engine: ['read'],
    grading_engine: ['create', 'read'],
    promotions: [],
    fee_penalties: [],
    teacher_penalties: ['read'],
    expenses: [],
  },
  STUDENT: {
    students: ['read'],
    teachers: ['read'],
    batches: ['read'],
    campuses: ['read'],
    classes: ['read'],
    houses: ['read'],
    fees: ['read'],
    attendance: ['read'],
    documents: ['read'],
    users: [],
    audit_logs: [],
    dashboard: ['read'],
    results: ['read'],
    exams: ['read'],
    announcements: ['read'],
    calendar: ['read'],
    academic_years: ['read'],
    shifts: ['read'],
    class_sections: ['read'],
    subject_offerings: ['read'],
    subject_enrollments: ['create', 'read'],
    timetable_engine: ['read'],
    grading_engine: ['read'],
    promotions: [],
    fee_penalties: ['read'],
    teacher_penalties: [],
    expenses: [],
  },
  PARENT: {
    students: ['read'],
    teachers: ['read'],
    batches: ['read'],
    campuses: ['read'],
    classes: ['read'],
    houses: ['read'],
    fees: ['read'],
    attendance: ['read'],
    documents: ['read'],
    users: [],
    audit_logs: [],
    dashboard: ['read'],
    results: ['read'],
    exams: ['read'],
    announcements: ['read'],
    calendar: ['read'],
    academic_years: ['read'],
    shifts: ['read'],
    class_sections: ['read'],
    subject_offerings: ['read'],
    subject_enrollments: ['read'],
    timetable_engine: ['read'],
    grading_engine: ['read'],
    promotions: [],
    fee_penalties: ['read'],
    teacher_penalties: [],
    expenses: [],
  },
  ACCOUNTANT: {
    students: ['read'],
    teachers: [],
    batches: [],
    campuses: ['read'],
    // Allow accountants to read class records so finance workflows can
    // filter by class/section when issuing invoices or exporting reports.
    classes: ['read'],
    houses: [],
    fees: ['create', 'read', 'update'],
    attendance: [],
    documents: [],
    users: [],
    audit_logs: ['read'],
    dashboard: ['read'],
    results: [],
    exams: [],
    announcements: ['read'],
    calendar: ['read'],
    academic_years: ['read'],
    shifts: ['read'],
    class_sections: ['read'],
    subject_offerings: ['read'],
    subject_enrollments: ['read'],
    timetable_engine: ['read'],
    grading_engine: ['read'],
    promotions: [],
    fee_penalties: ['create', 'read', 'update'],
    teacher_penalties: [],
    expenses: ['create', 'read', 'update', 'delete'],
  },
  GUARDIAN: {
    students: ['read'],
    teachers: ['read'],
    batches: ['read'],
    campuses: ['read'],
    classes: ['read'],
    houses: ['read'],
    fees: ['read'],
    attendance: ['read'],
    documents: ['read'],
    users: [],
    audit_logs: [],
    dashboard: ['read'],
    results: ['read'],
    exams: ['read'],
    announcements: ['read'],
    calendar: ['read'],
    academic_years: ['read'],
    shifts: ['read'],
    class_sections: ['read'],
    subject_offerings: ['read'],
    subject_enrollments: ['read'],
    timetable_engine: ['read'],
    grading_engine: ['read'],
    promotions: [],
    fee_penalties: ['read'],
    teacher_penalties: [],
    expenses: [],
  },
}

/**
 * Check if a role has permission to perform an action on a resource.
 * @param role - The user's role from the session
 * @param resource - The resource being accessed
 * @param action - The action being attempted
 * @returns true if permitted, false otherwise
 */
export function checkPermission(role: Role, resource: Resource, action: Action): boolean {
  const allowed = PERMISSIONS[role]?.[resource] ?? []
  return allowed.includes(action)
}

/**
 * Returns the allowed actions for a role on a resource.
 * Useful for building role-aware UI navigation.
 */
export function getAllowedActions(role: Role, resource: Resource): Action[] {
  return PERMISSIONS[role]?.[resource] ?? []
}

/**
 * Default permission matrix used for admin configuration and fallback checks.
 */
export const DEFAULT_PERMISSION_MATRIX = PERMISSIONS

/** Roles that have admin-level system access */
export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN']

/** Roles that can mark attendance */
export const ATTENDANCE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'TEACHER']

/** Roles that can manage financial records */
export const FINANCE_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTANT']
