export interface NotificationCounts {
  total: number
  modules: Record<string, number>
}

export const NOTIFICATION_TYPE_TO_MODULE: Record<string, string> = {
  // Finance and payment workflows
  FEE_INVOICE_GENERATED: 'fees',
  FEE_OVERDUE: 'fees',
  FEE_REMINDER: 'fees',
  FEE_STATUS_UPDATE: 'fees',
  FEE_UPDATE: 'fees',
  PROOF_RECEIVED: 'fees',
  PROOF_APPROVED: 'fees',
  PROOF_REJECTED: 'fees',

  // Admissions and lead intake
  ADMISSION_APPROVED: 'admissions',
  ADMISSION_DECLINED: 'admissions',
  LEAD_SUBMITTED: 'leads',
  STAFF_APP_SUBMITTED: 'staff',

  // Staff, HR, and attendance
  SALARY_SLIP_ISSUED: 'salaries',
  ATTENDANCE_ALERT: 'attendance',
  LEAVE_SUBMITTED: 'leaves',
  LEAVE_APPROVED: 'leaves',
  LEAVE_REJECTED: 'leaves',

  // Academics
  RESULT_PUBLISHED: 'results',
  DATE_SHEET_PUBLISHED: 'results',
  DAILY_SCORE_POSTED: 'daily-scores',
  TARGET_ASSIGNED: 'targets',
  TASK_CREATED: 'tasks',
  TASK_UPDATED: 'tasks',
  TASK_DELETED: 'tasks',
  TASK_MARKED: 'tasks',

  // Requests and communications
  QUERY_RECEIVED: 'queries',
  QUERY_ANSWERED: 'queries',
  COMPLAINT_SUBMITTED: 'complaints',
  COMPLAINT_RESOLVED: 'complaints',
  TIMETABLE_REQUEST: 'timetable',
  TIMETABLE_UPDATE: 'timetable',
  TIMETABLE_CHANGE: 'timetable',
  ANNOUNCEMENT: 'announcements',
}

export const NAV_LABEL_TO_NOTIFICATION_MODULE: Record<string, string> = {
  'Admissions': 'admissions',
  'Landing Leads': 'leads',
  'Staff Directory': 'staff',
  'Fees': 'fees',
  'Fee Collection': 'fees',
  'Accounting Hub': 'fees',
  'Staff Salaries': 'salaries',
  'Leaves': 'leaves',
  'Student Leaves': 'leaves',
  'Complaints': 'complaints',
  'Academic Queries': 'queries',
  'Attendance': 'attendance',
  'Student Attendance': 'attendance',
  'Staff Attendance': 'attendance',
  'Class Attendance (Legacy)': 'attendance',
  'Results': 'results',
  'Exam Results': 'results',
  'Daily Scores': 'daily-scores',
  'Student Targets': 'targets',
  'Tasks & Marks': 'tasks',
  'Timetable': 'timetable',
  'Announcements': 'announcements',
  'My Announcements': 'announcements',
  'My Children': 'my-children',
  'Finance': 'fees',
  'Expenses': 'fees',
}

export function getNotificationModuleForType(type: string): string | null {
  return NOTIFICATION_TYPE_TO_MODULE[type] ?? null
}

export function getNotificationModuleForNavLabel(label: string): string | null {
  return NAV_LABEL_TO_NOTIFICATION_MODULE[label] ?? null
}

export function summarizeNotificationCounts(types: Array<{ type: string }>): NotificationCounts {
  const modules: Record<string, number> = {}

  for (const { type } of types) {
    const moduleKey = getNotificationModuleForType(type)
    if (!moduleKey) continue
    modules[moduleKey] = (modules[moduleKey] ?? 0) + 1
  }

  return {
    total: types.length,
    modules,
  }
}
