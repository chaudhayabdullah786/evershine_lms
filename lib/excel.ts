/**
 * lib/excel.ts
 * Client-side Excel report generation using SheetJS (xlsx).
 *
 * WHY SheetJS 0.18.5:
 *   - Pure browser execution — no server load, no API round-trip
 *   - Produces genuine .xlsx (OOXML) files that open natively in Excel,
 *     LibreOffice, and Google Sheets
 *   - Handles large datasets without memory issues (streaming write available)
 *   - MIT-licensed community edition is sufficient for our feature set
 *
 * TRADE-OFF: Column styling (cell backgrounds, fonts) requires the commercial
 *   xlsx-pro edition. We use bold headers via an info row approach as a
 *   professional free-tier substitute.
 */

import * as XLSX from 'xlsx'

// ─── Shared metadata header rows ─────────────────────────────────────────────

function buildMetaRows(reportTitle: string, subtype: string): string[][] {
  const date = new Date().toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })
  return [
    ['EVERSHAHEEN ACADEMY — ADMINISTRATIVE REPORT'],
    [`Report: ${reportTitle}`],
    [`Generated: ${date}`],
    [`Report Type: ${subtype.toUpperCase()}`],
    [''],   // blank spacer row before data
  ]
}

// ─── Type definitions matching API response shapes ────────────────────────────

interface OverdueStudent {
  name: string
  classSection: string
  registrationNumber: string
  rollNumber?: string | null
  dueAmount: number | string
}

interface ReportStudentFeeRecord {
  name: string
  classSection: string
  registrationNumber: string
  rollNumber: string
  totalFee: number
  paidFee: number
  dueFee: number
  status: string
  campus: string
}

interface FeesReportData {
  totalOutstanding: number
  totalCollected: number
  overdueStudentsCount: number
  overdueStudentsList: OverdueStudent[]
  studentsList?: ReportStudentFeeRecord[]
}

interface AttendanceSection {
  classSection: string
  totalStudents: number
  presentToday: number
  absentToday: number
  attendanceRate: number
}

interface ReportStudentAttendanceRecord {
  name: string
  registrationNumber: string
  rollNumber: string
  classSection: string
  campus: string
  totalDays: number
  presents: number
  absents: number
  leaves: number
  attendanceRate: number
  status: string
}

interface AttendanceReportData {
  averagePresence: number
  totalClassesMarked: number
  severeAbsenteesCount: number
  classSectionsList: AttendanceSection[]
  studentsList?: ReportStudentAttendanceRecord[]
}

interface PerformanceSection {
  classSection: string
  runExams: string
  highestScore: string
  classAverage: number
  classStatus: string
}

interface ReportStudentPerformanceRecord {
  name: string
  registrationNumber: string
  rollNumber: string
  classSection: string
  campus: string
  examsCount: number
  avgPercentage: number
  highestPercentage: number
  grade: string
  status: string
}

interface PerformanceReportData {
  averagePercentage: number
  topPerformingClass: string
  strugglingStudentsCount: number
  classSectionsList: PerformanceSection[]
  studentsList?: ReportStudentPerformanceRecord[]
}

// ─── Master Data Exports Type Definitions ─────────────────────────────────────

interface StudentMasterRecord {
  registrationNumber: string
  rollNumber?: string | null
  firstName: string
  lastName: string
  fatherName: string
  gender: string
  dateOfBirth: string
  cnicBForm: string
  bloodGroup?: string | null
  religion?: string | null
  nationality?: string | null
  address?: string | null
  city?: string | null
  province?: string | null
  phoneNumber?: string | null
  emergencyContact?: string | null
  email?: string | null
  section?: string | null
  academicYear: string
  admissionDate: string
  enrollmentStatus: string
  feeStatus: string
  totalFeeAmount: number
  paidAmount: number
  dueAmount: number
  isActive: boolean
  campus?: { name: string; code: string } | null
  batch?: { name: string; code: string } | null
  class?: { name: string; grade: number } | null
  house?: { name: string } | null
}

interface TeacherMasterRecord {
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  specialization: string
  qualification: string
  experience: string
  joiningDate: string
  salary: number | string
  isActive: boolean
  campus?: { name: string; code: string } | null
  classTeachers?: { class: { name: string } }[] | null
  subjectTeachers?: { subject: { name: string }; class: { name: string } }[] | null
}

interface StaffMasterRecord {
  name: string
  role: string
  email: string
  phone: string
  employeeId: string
  department: string
  campusName: string
  status: string
  joinedAt: string
}

interface FeeMasterRecord {
  challanNumber: string
  studentName: string
  registrationNumber: string
  classSection: string
  campus: string
  billingMonth: string
  academicYear: string
  dueDate: string
  subtotal: number
  discount: number
  lateFee: number
  totalAmount: number
  paidAmount: number
  remainingDues: number
  status: string
  proofStatus: string
  bankAccounts: string
  issuedDate: string
}

// ─── Fees Outstanding Deficit Report ─────────────────────────────────────────

export function downloadFeesReportExcel(data: FeesReportData): void {
  const wb = XLSX.utils.book_new()

  // ── Summary Sheet ──────────────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    ...buildMetaRows('Fees Outstanding Deficit Report', 'fees'),
    ['SUMMARY'],
    ['Metric', 'Value'],
    ['Total Outstanding (PKR)', Number(data.totalOutstanding)],
    ['Total Collected (PKR)', Number(data.totalCollected)],
    ['Overdue Student Accounts', data.overdueStudentsCount],
    [''],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)

  // Set column widths for summary sheet
  summarySheet['!cols'] = [{ wch: 35 }, { wch: 25 }]

  // ── Overdue Students Sheet ─────────────────────────────────────────────────
  const overdueHeader = [
    'S.No.',
    'Student Name',
    'Class / Section',
    'Registration No.',
    'Roll No.',
    'Due Amount (PKR)',
    'Status',
  ]

  const overdueRows = data.overdueStudentsList.map((s, i) => [
    i + 1,
    s.name,
    s.classSection,
    s.registrationNumber,
    s.rollNumber ?? 'N/A',
    Number(s.dueAmount),
    'OVERDUE',
  ])

  const overdueData = [
    ...buildMetaRows('Overdue Student Accounts', 'fees'),
    overdueHeader,
    ...overdueRows,
    [''],
    ['', '', '', '', 'TOTAL DUE:', Number(data.totalOutstanding), ''],
  ]

  const overdueSheet = XLSX.utils.aoa_to_sheet(overdueData)
  overdueSheet['!cols'] = [
    { wch: 6 },   // S.No.
    { wch: 28 },  // Name
    { wch: 18 },  // Class
    { wch: 20 },  // Reg No.
    { wch: 12 },  // Roll No.
    { wch: 20 },  // Due Amount
    { wch: 12 },  // Status
  ]

  XLSX.utils.book_append_sheet(wb, overdueSheet, 'Overdue Students')

  // ── All Enrolled Students Sheet ────────────────────────────────────────────
  if (data.studentsList && data.studentsList.length > 0) {
    const detailHeader = [
      'S.No.',
      'Student Name',
      'Registration No.',
      'Roll No.',
      'Class & Section',
      'Campus',
      'Total Fee (PKR)',
      'Paid Amount (PKR)',
      'Outstanding Dues (PKR)',
      'Fee Status',
    ]

    const detailRows = data.studentsList.map((s, i) => [
      i + 1,
      s.name,
      s.registrationNumber,
      s.rollNumber,
      s.classSection,
      s.campus,
      s.totalFee,
      s.paidFee,
      s.dueFee,
      s.status,
    ])

    const detailData = [
      ...buildMetaRows('All Enrolled Students Fee Ledger', 'fees'),
      detailHeader,
      ...detailRows,
    ]

    const detailSheet = XLSX.utils.aoa_to_sheet(detailData)
    detailSheet['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 20 },
      { wch: 12 },
      { wch: 22 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 22 },
      { wch: 15 },
    ]
    XLSX.utils.book_append_sheet(wb, detailSheet, 'All Enrolled Students')
  }
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

  // ── Trigger download ───────────────────────────────────────────────────────
  const filename = `ESA_Fees_Report_${formatDateForFilename()}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ─── Campus Attendance & Presence Report ─────────────────────────────────────

export function downloadAttendanceReportExcel(data: AttendanceReportData): void {
  const wb = XLSX.utils.book_new()

  // ── Summary Sheet ──────────────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    ...buildMetaRows('Campus Attendance & Presence Report', 'attendance'),
    ['SUMMARY'],
    ['Metric', 'Value'],
    ['Average Campus Presence (%)', data.averagePresence],
    ['Total Classes with Attendance Marked', data.totalClassesMarked],
    ['Severe Absentees (Today)', data.severeAbsenteesCount],
    [''],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [{ wch: 42 }, { wch: 20 }]

  // ── Class-wise Breakdown Sheet ─────────────────────────────────────────────
  const attendanceHeader = [
    'S.No.',
    'Class / Section',
    'Total Students',
    'Present Today',
    'Absent Today',
    'Attendance Rate (%)',
    'Status',
  ]

  const attendanceRows = data.classSectionsList.map((c, i) => [
    i + 1,
    c.classSection,
    c.totalStudents,
    c.presentToday,
    c.absentToday,
    c.attendanceRate,
    c.attendanceRate >= 90 ? 'GOOD' : c.attendanceRate >= 75 ? 'SATISFACTORY' : 'ALERT',
  ])

  const classData = [
    ...buildMetaRows('Class-wise Attendance Breakdown', 'attendance'),
    attendanceHeader,
    ...attendanceRows,
  ]

  const classSheet = XLSX.utils.aoa_to_sheet(classData)
  classSheet['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 16 },
    { wch: 16 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
  ]
  XLSX.utils.book_append_sheet(wb, classSheet, 'Class-wise Attendance')

  // ── Detailed Attendance Logs Sheet ─────────────────────────────────────────
  if (data.studentsList && data.studentsList.length > 0) {
    const detailHeader = [
      'S.No.',
      'Student Name',
      'Registration No.',
      'Roll No.',
      'Class & Section',
      'Campus',
      'Total Days',
      'Presents',
      'Absents',
      'Leaves',
      'Attendance Rate (%)',
      'Status',
    ]

    const detailRows = data.studentsList.map((s, i) => [
      i + 1,
      s.name,
      s.registrationNumber,
      s.rollNumber,
      s.classSection,
      s.campus,
      s.totalDays,
      s.presents,
      s.absents,
      s.leaves,
      s.attendanceRate,
      s.status,
    ])

    const detailData = [
      ...buildMetaRows('Enrolled Students Detailed Attendance', 'attendance'),
      detailHeader,
      ...detailRows,
    ]

    const detailSheet = XLSX.utils.aoa_to_sheet(detailData)
    detailSheet['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 20 },
      { wch: 12 },
      { wch: 22 },
      { wch: 22 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 15 },
    ]
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Detailed Attendance Logs')
  }
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

  const filename = `ESA_Attendance_Report_${formatDateForFilename()}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ─── Academic Grade Distribution / Performance Report ────────────────────────

export function downloadPerformanceReportExcel(data: PerformanceReportData): void {
  const wb = XLSX.utils.book_new()

  // ── Summary Sheet ──────────────────────────────────────────────────────────
  const summaryRows: (string | number)[][] = [
    ...buildMetaRows('Academic Grade Distribution Report', 'performance'),
    ['SUMMARY'],
    ['Metric', 'Value'],
    ['Campus Average Percentage (%)', data.averagePercentage],
    ['Top Performing Class', data.topPerformingClass],
    ['Struggling Students (< 50%)', data.strugglingStudentsCount],
    [''],
  ]
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
  summarySheet['!cols'] = [{ wch: 38 }, { wch: 25 }]

  // ── Class Performance Breakdown Sheet ─────────────────────────────────────
  const perfHeader = [
    'S.No.',
    'Class / Section',
    'Exams Conducted',
    'Highest Score',
    'Class Average (%)',
    'Performance Status',
  ]

  const perfRows = data.classSectionsList.map((c, i) => [
    i + 1,
    c.classSection,
    c.runExams,
    c.highestScore,
    c.classAverage,
    c.classStatus,
  ])

  const perfData = [
    ...buildMetaRows('Class-wise Academic Performance', 'performance'),
    perfHeader,
    ...perfRows,
  ]

  const perfSheet = XLSX.utils.aoa_to_sheet(perfData)
  perfSheet['!cols'] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 20 },
    { wch: 16 },
    { wch: 20 },
    { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, perfSheet, 'Class Performance')

  // ── Student Gradebook & Performance Sheet ─────────────────────────────────
  if (data.studentsList && data.studentsList.length > 0) {
    const detailHeader = [
      'S.No.',
      'Student Name',
      'Registration No.',
      'Roll No.',
      'Class & Section',
      'Campus',
      'Exams Attempted',
      'Avg Percentage (%)',
      'Highest Percentage (%)',
      'Performance Grade',
      'Academic Status',
    ]

    const detailRows = data.studentsList.map((s, i) => [
      i + 1,
      s.name,
      s.registrationNumber,
      s.rollNumber,
      s.classSection,
      s.campus,
      s.examsCount,
      s.avgPercentage,
      s.highestPercentage,
      s.grade,
      s.status,
    ])

    const detailData = [
      ...buildMetaRows('Enrolled Students Gradebook & Performance', 'performance'),
      detailHeader,
      ...detailRows,
    ]

    const detailSheet = XLSX.utils.aoa_to_sheet(detailData)
    detailSheet['!cols'] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 20 },
      { wch: 12 },
      { wch: 22 },
      { wch: 22 },
      { wch: 16 },
      { wch: 20 },
      { wch: 22 },
      { wch: 20 },
      { wch: 16 },
    ]
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Student Gradebook & Performance')
  }
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

  const filename = `ESA_Performance_Report_${formatDateForFilename()}.xlsx`
  XLSX.writeFile(wb, filename)
}

// ─── Master Students Excel Export ─────────────────────────────────────────────

export function downloadStudentsMasterExcel(students: StudentMasterRecord[]): void {
  const wb = XLSX.utils.book_new()

  // Header Definition
  const headers = [
    'S.No.',
    'Reg No.',
    'Roll No.',
    'First Name',
    'Last Name',
    'Father Name',
    'Gender',
    'Date of Birth',
    'CNIC / B-Form',
    'Blood Group',
    'Religion',
    'Nationality',
    'Phone Number',
    'Emergency Contact',
    'Email Address',
    'Campus',
    'Batch',
    'Class',
    'Section',
    'House',
    'Academic Year',
    'Admission Date',
    'Enrollment Status',
    'Fee Status',
    'Total Fees (PKR)',
    'Paid Amount (PKR)',
    'Outstanding Dues (PKR)',
    'Account Status',
  ]

  const rows = students.map((s, idx) => [
    idx + 1,
    s.registrationNumber,
    s.rollNumber || 'N/A',
    s.firstName,
    s.lastName,
    s.fatherName,
    s.gender,
    s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('en-PK') : 'N/A',
    s.cnicBForm,
    s.bloodGroup || 'N/A',
    s.religion || 'N/A',
    s.nationality || 'Pakistani',
    s.phoneNumber || 'N/A',
    s.emergencyContact || 'N/A',
    s.email || 'N/A',
    s.campus?.name || 'N/A',
    s.batch?.name || 'N/A',
    s.class?.name || 'N/A',
    s.section || 'N/A',
    s.house?.name || 'N/A',
    s.academicYear,
    s.admissionDate ? new Date(s.admissionDate).toLocaleDateString('en-PK') : 'N/A',
    s.enrollmentStatus,
    s.feeStatus,
    Number(s.totalFeeAmount),
    Number(s.paidAmount),
    Number(s.dueAmount),
    s.isActive ? 'Active' : 'Suspended',
  ])

  // Summary Information
  const totalOutstanding = students.reduce((sum, s) => sum + Number(s.dueAmount), 0)
  const totalPaid = students.reduce((sum, s) => sum + Number(s.paidAmount), 0)
  const totalActive = students.filter(s => s.isActive).length
  const totalSuspended = students.filter(s => !s.isActive).length

  const summarySheetRows = [
    ...buildMetaRows('Students Master Registry', 'students'),
    ['SUMMARY STATISTICS'],
    ['Total Registered Students', students.length],
    ['Active Students', totalActive],
    ['Suspended Students', totalSuspended],
    ['Total Paid Fees (PKR)', totalPaid],
    ['Total Outstanding Fees (PKR)', totalOutstanding],
  ]

  const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetRows)
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }]

  const dataSheetContent = [
    ...buildMetaRows('Detailed Student Profiles', 'students'),
    headers,
    ...rows,
  ]

  const dataSheet = XLSX.utils.aoa_to_sheet(dataSheetContent)
  
  // Set generous column widths
  dataSheet['!cols'] = headers.map(() => ({ wch: 18 }))
  dataSheet['!cols'][0] = { wch: 6 } // S.No.
  dataSheet['!cols'][1] = { wch: 15 } // Reg No.
  dataSheet['!cols'][3] = { wch: 16 } // First
  dataSheet['!cols'][4] = { wch: 16 } // Last
  dataSheet['!cols'][14] = { wch: 25 } // Email

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Student Master List')
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Overview')

  XLSX.writeFile(wb, `ESA_Students_Master_${formatDateForFilename()}.xlsx`)
}

// ─── Master Teachers Excel Export ─────────────────────────────────────────────

export function downloadTeachersMasterExcel(teachers: TeacherMasterRecord[]): void {
  const wb = XLSX.utils.book_new()

  const headers = [
    'S.No.',
    'Employee ID',
    'First Name',
    'Last Name',
    'Designation',
    'Specialization',
    'Qualifications',
    'Experience (Years)',
    'Joining Date',
    'Monthly Salary (PKR)',
    'Status',
    'Campus Assumed',
    'Class Teacher Assignment',
    'Subjects Taught',
  ]

  const rows = teachers.map((t, idx) => {
    const classAssigned = t.classTeachers && t.classTeachers.length > 0
      ? t.classTeachers.map(c => c.class.name).join(', ')
      : 'None'

    const subjectsTaught = t.subjectTeachers && t.subjectTeachers.length > 0
      ? t.subjectTeachers.map(s => `${s.subject.name} (${s.class.name})`).join(', ')
      : 'None'

    return [
      idx + 1,
      t.employeeId,
      t.firstName,
      t.lastName,
      t.designation,
      t.specialization,
      t.qualification,
      t.experience,
      t.joiningDate ? new Date(t.joiningDate).toLocaleDateString('en-PK') : 'N/A',
      Number(t.salary),
      t.isActive ? 'Active' : 'Suspended',
      t.campus?.name || 'N/A',
      classAssigned,
      subjectsTaught,
    ]
  })

  const summarySheetRows = [
    ...buildMetaRows('Teachers Master Registry', 'teachers'),
    ['SUMMARY STATISTICS'],
    ['Total Faculty Members', teachers.length],
    ['Active Faculty', teachers.filter(t => t.isActive).length],
    ['Suspended Faculty', teachers.filter(t => !t.isActive).length],
  ]

  const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetRows)
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }]

  const dataSheetContent = [
    ...buildMetaRows('Detailed Faculty Profiles', 'teachers'),
    headers,
    ...rows,
  ]

  const dataSheet = XLSX.utils.aoa_to_sheet(dataSheetContent)
  dataSheet['!cols'] = headers.map(() => ({ wch: 18 }))
  dataSheet['!cols'][0] = { wch: 6 }
  dataSheet['!cols'][12] = { wch: 25 }
  dataSheet['!cols'][13] = { wch: 35 }

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Faculty Registry')
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Overview')

  XLSX.writeFile(wb, `ESA_Faculty_Master_${formatDateForFilename()}.xlsx`)
}

// ─── Master Staff Excel Export ────────────────────────────────────────────────

export function downloadStaffMasterExcel(staff: StaffMasterRecord[]): void {
  const wb = XLSX.utils.book_new()

  const headers = [
    'S.No.',
    'Name',
    'System Role',
    'Email Address',
    'Phone Number',
    'Employee ID',
    'Department',
    'Campus Assigned',
    'Status',
    'Registration Date',
  ]

  const rows = staff.map((s, idx) => [
    idx + 1,
    s.name,
    s.role,
    s.email,
    s.phone,
    s.employeeId,
    s.department,
    s.campusName,
    s.status,
    s.joinedAt ? new Date(s.joinedAt).toLocaleDateString('en-PK') : 'N/A',
  ])

  const summarySheetRows = [
    ...buildMetaRows('Administrative & Support Staff Registry', 'staff'),
    ['SUMMARY STATISTICS'],
    ['Total Support Staff', staff.length],
    ['Admins Count', staff.filter(s => s.role === 'ADMIN').length],
    ['Accountants Count', staff.filter(s => s.role === 'ACCOUNTANT').length],
    ['Active Status Count', staff.filter(s => s.status === 'Active').length],
  ]

  const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetRows)
  summarySheet['!cols'] = [{ wch: 30 }, { wch: 20 }]

  const dataSheetContent = [
    ...buildMetaRows('Detailed Support Staff Profiles', 'staff'),
    headers,
    ...rows,
  ]

  const dataSheet = XLSX.utils.aoa_to_sheet(dataSheetContent)
  dataSheet['!cols'] = headers.map(() => ({ wch: 18 }))
  dataSheet['!cols'][0] = { wch: 6 }
  dataSheet['!cols'][3] = { wch: 25 }

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Staff Registry')
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Overview')

  XLSX.writeFile(wb, `ESA_Staff_Master_${formatDateForFilename()}.xlsx`)
}

// ─── Master Fees Excel Export ─────────────────────────────────────────────────

export function downloadFeesMasterExcel(fees: FeeMasterRecord[]): void {
  const wb = XLSX.utils.book_new()

  const headers = [
    'S.No.',
    'Challan Number',
    'Student Name',
    'Reg No.',
    'Class & Section',
    'Campus',
    'Billing Month',
    'Academic Year',
    'Due Date',
    'Subtotal (PKR)',
    'Discount (PKR)',
    'Late Fee (PKR)',
    'Total Amount (PKR)',
    'Paid Amount (PKR)',
    'Remaining Dues (PKR)',
    'Payment Status',
    'Proof Status',
    'Bank Instructions',
    'Challan Generation Date',
  ]

  const rows = fees.map((f, idx) => [
    idx + 1,
    f.challanNumber,
    f.studentName,
    f.registrationNumber,
    f.classSection,
    f.campus,
    f.billingMonth,
    f.academicYear,
    f.dueDate ? new Date(f.dueDate).toLocaleDateString('en-PK') : 'N/A',
    f.subtotal,
    f.discount,
    f.lateFee,
    f.totalAmount,
    f.paidAmount,
    f.remainingDues,
    f.status,
    f.proofStatus,
    f.bankAccounts,
    f.issuedDate ? new Date(f.issuedDate).toLocaleDateString('en-PK') : 'N/A',
  ])

  // Dues calculations
  const totalAmount = fees.reduce((sum, f) => sum + f.totalAmount, 0)
  const totalPaid = fees.reduce((sum, f) => sum + f.paidAmount, 0)
  const totalDues = fees.reduce((sum, f) => sum + f.remainingDues, 0)

  const summarySheetRows = [
    ...buildMetaRows('Master Fee Ledger & Invoicing Report', 'fees_ledger'),
    ['SUMMARY FINANCIAL LEDGER'],
    ['Total Invoiced Amount (PKR)', totalAmount],
    ['Total Received Amount (PKR)', totalPaid],
    ['Total Outstanding Balances (PKR)', totalDues],
    ['Total Invoices Issued', fees.length],
    ['Fully Paid Invoices', fees.filter(f => f.status === 'PAID').length],
    ['Partially Paid Invoices', fees.filter(f => f.status === 'PARTIAL').length],
    ['Defaulter Invoices (Overdue)', fees.filter(f => f.status.includes('DEFAULTER')).length],
    ['Unpaid Invoices (Within Due Date)', fees.filter(f => f.status === 'UNPAID').length],
  ]

  const summarySheet = XLSX.utils.aoa_to_sheet(summarySheetRows)
  summarySheet['!cols'] = [{ wch: 35 }, { wch: 25 }]

  const dataSheetContent = [
    ...buildMetaRows('Detailed Invoices & Payments Ledger', 'fees_ledger'),
    headers,
    ...rows,
  ]

  const dataSheet = XLSX.utils.aoa_to_sheet(dataSheetContent)
  dataSheet['!cols'] = headers.map(() => ({ wch: 18 }))
  dataSheet['!cols'][0] = { wch: 6 }
  dataSheet['!cols'][1] = { wch: 25 }
  dataSheet['!cols'][2] = { wch: 22 }

  XLSX.utils.book_append_sheet(wb, dataSheet, 'Ledger Data')
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Financial Overview')

  XLSX.writeFile(wb, `ESA_Fees_Master_${formatDateForFilename()}.xlsx`)
}

// ─── Main dispatcher — called from the documents page ─────────────────────────

/**
 * downloadReportAsExcel
 * Dispatches to the correct typed export function based on the report subtype.
 *
 * @param subtype  - 'fees' | 'attendance' | 'performance'
 * @param data     - Raw API response payload (typed per subtype)
 */
export function downloadReportAsExcel(
  subtype: 'fees' | 'attendance' | 'performance',
  data: Record<string, unknown>
): void {
  switch (subtype) {
    case 'fees':
      downloadFeesReportExcel(data as unknown as FeesReportData)
      break
    case 'attendance':
      downloadAttendanceReportExcel(data as unknown as AttendanceReportData)
      break
    case 'performance':
      downloadPerformanceReportExcel(data as unknown as PerformanceReportData)
      break
    default:
      throw new Error(`[excel.ts] Unknown report subtype: ${subtype}`)
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateForFilename(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

// ─── Student bulk import template ─────────────────────────────────────────────

const STUDENT_IMPORT_HEADERS = [
  'firstName',
  'lastName',
  'fatherName',
  'cnicBForm',
  'dateOfBirth',
  'gender',
  'phoneNumber',
  'emergencyContact',
  'address',
  'city',
  'province',
  'campusCode',
  'batchCode',
  'className',
  'sectionName',
  'rollNumber',
  'shift',
  'totalFeeAmount',
  'guardianFirstName',
  'guardianLastName',
  'guardianCnic',
  'guardianPhone',
  'guardianRelationship',
] as const

export function downloadStudentImportTemplate(): void {
  const wb = XLSX.utils.book_new()
  const instructions = [
    ['EVERSHAHEEN ACADEMY — STUDENT BULK IMPORT TEMPLATE'],
    ['Fill one row per student. Do not change column headers in row 3.'],
    ['dateOfBirth: YYYY-MM-DD | gender: MALE or FEMALE | shift: MORNING, EVENING, or NIGHT'],
    ['campusCode/batchCode: match codes in Academic Engine (e.g. EA, MATRIC)'],
    ['className example: Class 9 | sectionName: A'],
    [],
    [...STUDENT_IMPORT_HEADERS],
    [
      'Ahmed',
      'Khan',
      'Muhammad Khan',
      '3520212345678',
      '2010-05-15',
      'MALE',
      '+923001234567',
      '+923009876543',
      'Madina Town, Gujranwala',
      'Gujranwala',
      'Punjab',
      'EA',
      'MATRIC',
      'Class 9',
      'A',
      '101',
      'MORNING',
      5000,
      'Muhammad',
      'Khan',
      '3520111122222',
      '+923009876543',
      'Father',
    ],
  ]
  const sheet = XLSX.utils.aoa_to_sheet(instructions)
  sheet['!cols'] = STUDENT_IMPORT_HEADERS.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, sheet, 'Students')
  XLSX.writeFile(wb, `ESA_Student_Import_Template_${formatDateForFilename()}.xlsx`)
}

/** Parse uploaded import workbook into row objects (detects header row with firstName). */
export function parseStudentImportFile(file: ArrayBuffer): Record<string, string | number>[] {
  const wb = XLSX.read(file, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '' }) as string[][]
  const headerIdx = matrix.findIndex(
    (row) => row[0]?.toString().trim().toLowerCase() === 'firstname'
  )
  if (headerIdx < 0) {
    return XLSX.utils.sheet_to_json<Record<string, string | number>>(sheet, { defval: '' })
  }
  const headers = matrix[headerIdx].map((h) => String(h).trim())
  const rows: Record<string, string | number>[] = []
  for (let i = headerIdx + 1; i < matrix.length; i++) {
    const line = matrix[i]
    if (!line?.some((c) => String(c).trim())) continue
    const obj: Record<string, string | number> = {}
    headers.forEach((h, j) => {
      if (h) obj[h] = line[j] ?? ''
    })
    rows.push(obj)
  }

  return rows
    .map((row) => {
      const normalized: Record<string, string | number> = {}
      for (const key of Object.keys(row)) {
        const k = key.trim()
        normalized[k] = row[key]
      }
      if (normalized.cnicBForm) {
        normalized.cnicBForm = String(normalized.cnicBForm).replace(/\D/g, '')
      }
      if (normalized.guardianCnic) {
        normalized.guardianCnic = String(normalized.guardianCnic).replace(/\D/g, '')
      }
      if (normalized.gender) {
        normalized.gender = String(normalized.gender).toUpperCase()
      }
      if (normalized.shift) {
        normalized.shift = String(normalized.shift).toUpperCase()
      }
      if (normalized.totalFeeAmount !== '' && normalized.totalFeeAmount != null) {
        normalized.totalFeeAmount = Number(normalized.totalFeeAmount)
      }
      return normalized
    })
    .filter((r) => r.firstName && r.lastName && r.cnicBForm)
}

export function downloadStudentImportFailuresExcel(
  failures: Array<Record<string, string | number> & { importError?: string; importRow?: number }>
): void {
  if (failures.length === 0) return
  const wb = XLSX.utils.book_new()
  const headers = [...STUDENT_IMPORT_HEADERS, 'importError', 'importRow']
  const rows = failures.map((f) =>
    headers.map((h) => (h === 'importError' ? f.importError : h === 'importRow' ? f.importRow : f[h] ?? ''))
  )
  const sheet = XLSX.utils.aoa_to_sheet([
    ['EVERSHAHEEN ACADEMY — FAILED IMPORT ROWS (fix and re-upload)'],
    [],
    headers,
    ...rows,
  ])
  sheet['!cols'] = headers.map(() => ({ wch: 16 }))
  XLSX.utils.book_append_sheet(wb, sheet, 'Failed Rows')
  XLSX.writeFile(wb, `ESA_Student_Import_Failures_${formatDateForFilename()}.xlsx`)
}
