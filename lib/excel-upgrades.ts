/**
 * lib/excel-upgrades.ts
 * Client-side Excel report downloads for academic upgrades.
 *
 * Implements styling and branding conventions:
 * - Title: EVERSHAHEEN ACADEMY
 * - Slogan: "We Make your Children More Valueable"
 * - Address: Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony
 * - Contacts: Boys: 0328-4010522, Girls: 0324-8985526
 */

import * as XLSX from 'xlsx'

// ─── Branding Block Generator ───────────────────────────────────────────────
function buildBrandingHeader(title: string, subtitle: string): string[][] {
  return [
    ['EVERSHAHEEN ACADEMY'],
    ['"We Make your Children More Valueable"'],
    ['Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony (Boys: 0328-4010522 | Girls: 0324-8985526)'],
    [`Report: ${title}`],
    [`Sub-category: ${subtitle}`],
    [`Generated Date: ${new Date().toLocaleDateString('en-PK')}`],
    [''], // spacer
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 1: Attendance Roster Report (Matching attendence.png / sectionwise)
// ─────────────────────────────────────────────────────────────────────────────
interface AttendanceRow {
  studentName: string
  fatherName: string
  registrationNumber: string
  rollNumber: string
  gender: string
  guardianName: string
  contactNo: string
  totalDays: number
  totalPresents: number
  percentage: number
}

export function downloadSectionAttendanceExcel(
  metadata: { className: string; sectionName: string; shift: string; period: string },
  records: AttendanceRow[]
): void {
  const wb = XLSX.utils.book_new()
  const header = [
    'Serial #',
    'Reg #',
    'Roll No',
    'Student Name',
    'Father Name',
    'Gender',
    'Guardian Name',
    'Contact No',
    'No. of Days',
    'Total Presents',
    'Present in %age',
  ]

  const rows = records.map((r, idx) => [
    idx + 1,
    r.registrationNumber,
    r.rollNumber,
    r.studentName,
    r.fatherName,
    r.gender,
    r.guardianName,
    r.contactNo,
    r.totalDays,
    r.totalPresents,
    `${r.percentage.toFixed(1)}%`,
  ])

  const content = [
    ...buildBrandingHeader(
      `Section Attendance Report (${metadata.className} - ${metadata.sectionName})`,
      `Shift: ${metadata.shift} | Period: ${metadata.period}`
    ),
    header,
    ...rows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(content)
  ws['!cols'] = [
    { wch: 8 },  // S#
    { wch: 15 }, // Reg
    { wch: 10 }, // Roll
    { wch: 25 }, // Name
    { wch: 25 }, // Father
    { wch: 10 }, // Gender
    { wch: 25 }, // Guardian
    { wch: 18 }, // Contact
    { wch: 12 }, // Total Days
    { wch: 15 }, // Presents
    { wch: 18 }, // Percentage
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Attendance')
  XLSX.writeFile(wb, `ESA_Attendance_${metadata.className}_${metadata.sectionName}_${metadata.period.replace(/\s+/g, '_')}.xlsx`)
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 2: Enrolled Student Records Export
// ─────────────────────────────────────────────────────────────────────────────
interface EnrolledStudentRow {
  registrationNumber: string
  rollNumber: string
  name: string
  gender: string
  fatherName: string
  guardianName: string
  contactNo: string
  enrollmentType: string
  houseName: string
}

export function downloadEnrolledStudentRecordsExcel(
  metadata: { campusName: string; className: string; sectionName: string },
  students: EnrolledStudentRow[]
): void {
  const wb = XLSX.utils.book_new()
  const header = [
    'S.No.',
    'Reg #',
    'Roll No',
    'Student Name',
    'Gender',
    'Father Name',
    'Guardian Name',
    'Contact No',
    'Enrollment Type',
    'Performance House',
  ]

  const rows = students.map((s, idx) => [
    idx + 1,
    s.registrationNumber,
    s.rollNumber,
    s.name,
    s.gender,
    s.fatherName,
    s.guardianName,
    s.contactNo,
    s.enrollmentType,
    s.houseName,
  ])

  const content = [
    ...buildBrandingHeader(
      `Enrolled Student Records Registry (${metadata.campusName})`,
      `Class: ${metadata.className} | Section: ${metadata.sectionName}`
    ),
    header,
    ...rows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(content)
  ws['!cols'] = [
    { wch: 8 },  // S#
    { wch: 15 }, // Reg
    { wch: 10 }, // Roll
    { wch: 25 }, // Name
    { wch: 10 }, // Gender
    { wch: 25 }, // Father Name
    { wch: 25 }, // Guardian Name
    { wch: 18 }, // Contact No
    { wch: 18 }, // Enrollment Type
    { wch: 20 }, // House
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Student Register')
  XLSX.writeFile(wb, `ESA_Student_Register_${metadata.className}_${metadata.sectionName}.xlsx`)
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 6: Daily Performance Scoring Export
// ─────────────────────────────────────────────────────────────────────────────
interface DailyPerformanceRow {
  rollNumber: string
  registrationNumber: string
  studentName: string
  score: number
  isAbsent: boolean
  remarks: string
}

export function downloadDailyPerformanceExcel(
  metadata: { subjectName: string; className: string; sectionName: string; date: string },
  records: DailyPerformanceRow[]
): void {
  const wb = XLSX.utils.book_new()
  const header = ['Roll No', 'Reg #', 'Student Name', 'Score (1-10)', 'Attendance Status', 'Remarks']

  const rows = records.map((r) => [
    r.rollNumber,
    r.registrationNumber,
    r.studentName,
    r.isAbsent ? 'N/A' : r.score,
    r.isAbsent ? 'ABSENT' : 'PRESENT',
    r.remarks,
  ])

  const content = [
    ...buildBrandingHeader(
      `Daily Performance Scores (${metadata.subjectName})`,
      `Class: ${metadata.className}-${metadata.sectionName} | Date: ${metadata.date}`
    ),
    header,
    ...rows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(content)
  ws['!cols'] = [
    { wch: 10 }, // Roll No
    { wch: 15 }, // Reg No
    { wch: 25 }, // Name
    { wch: 14 }, // Score
    { wch: 18 }, // Attendance
    { wch: 35 }, // Remarks
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Daily Performance')
  XLSX.writeFile(wb, `ESA_Daily_Performance_${metadata.subjectName.replace(/\s+/g, '_')}_${metadata.date}.xlsx`)
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 7: Monthly Results Comparison (Side-by-side Layout)
// ─────────────────────────────────────────────────────────────────────────────
interface SubjectComparisonRow {
  subjectName: string
  prevTotal: number
  prevPass: number
  prevFail: number
  prevAvg: number
  currTotal: number
  currPass: number
  currFail: number
  currAvg: number
  progress: string // e.g., "+5.2% Improvement" or "-2.1% Decline"
}

export function downloadMonthlyComparisonExcel(
  metadata: { className: string; sectionName: string; prevMonth: string; currMonth: string },
  comparisons: SubjectComparisonRow[]
): void {
  const wb = XLSX.utils.book_new()

  const subHeader = [
    'Subject',
    'Total Marks',
    'Pass Count',
    'Fail Count',
    'Average (%)',
    'Total Marks',
    'Pass Count',
    'Fail Count',
    'Average (%)',
    'Performance Progress',
  ]

  const rows = comparisons.map((c) => [
    c.subjectName,
    c.prevTotal,
    c.prevPass,
    c.prevFail,
    `${c.prevAvg.toFixed(1)}%`,
    c.currTotal,
    c.currPass,
    c.currFail,
    `${c.currAvg.toFixed(1)}%`,
    c.progress,
  ])

  const branding = buildBrandingHeader(
    `Monthly Test Results Comparison`,
    `Class: ${metadata.className}-${metadata.sectionName} (${metadata.prevMonth} vs ${metadata.currMonth})`
  )

  // Double-header columns representation
  const mainHeader = ['', `PREVIOUS MONTH (${metadata.prevMonth})`, '', '', '', `CURRENT MONTH (${metadata.currMonth})`, '', '', '', '']
  
  const content = [
    ...branding,
    mainHeader,
    subHeader,
    ...rows,
  ]

  const ws = XLSX.utils.aoa_to_sheet(content)
  ws['!cols'] = [
    { wch: 20 }, // Subject
    { wch: 12 }, // Prev Total
    { wch: 12 }, // Prev Pass
    { wch: 12 }, // Prev Fail
    { wch: 14 }, // Prev Avg
    { wch: 12 }, // Curr Total
    { wch: 12 }, // Curr Pass
    { wch: 12 }, // Curr Fail
    { wch: 14 }, // Curr Avg
    { wch: 22 }, // Progress
  ]

  // Add sheet merge configurations to clean up previous vs current months header labels
  ws['!merges'] = [
    { s: { r: branding.length, c: 1 }, e: { r: branding.length, c: 4 } }, // previous month merge
    { s: { r: branding.length, c: 5 }, e: { r: branding.length, c: 8 } }, // current month merge
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Results Comparison')
  XLSX.writeFile(wb, `ESA_Monthly_Comparison_${metadata.className}_${metadata.sectionName}.xlsx`)
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 8: Marks Achievement Targets (Collective & Individual)
// ─────────────────────────────────────────────────────────────────────────────
interface TargetIndividualRow {
  rollNumber: string
  registrationNumber: string
  studentName: string
  assignedTargetGrade: string
  assignedTargetRange: string
  actualGrade: string
  actualPercentage: string
  status: string
}

export function downloadTargetAnalysisExcel(
  metadata: { subjectName: string; className: string; sectionName: string },
  data: {
    collective: { met: number; notMet: number; noTarget: number; total: number }
    individual: TargetIndividualRow[]
  }
): void {
  const wb = XLSX.utils.book_new()

  // 1. Collective Summary sheet
  const collectiveRows = [
    ...buildBrandingHeader(`Achievement Target Summary - ${metadata.subjectName}`, `Class: ${metadata.className}-${metadata.sectionName}`),
    ['COLLECTIVE PERFORMANCE METRIC SUMMARY'],
    ['Metric Description', 'Student Counts'],
    ['Total Class Strength', data.collective.total],
    ['Targets Successfully Met', data.collective.met],
    ['Targets Not Met (Underperforming)', data.collective.notMet],
    ['No Custom Targets Assigned', data.collective.noTarget],
    ['Success Percentage', `${((data.collective.met / (data.collective.total || 1)) * 100).toFixed(1)}%`],
  ]

  const wsCollective = XLSX.utils.aoa_to_sheet(collectiveRows)
  wsCollective['!cols'] = [{ wch: 35 }, { wch: 18 }]

  // 2. Individual Breakdown sheet
  const individualHeader = [
    'Roll No',
    'Reg #',
    'Student Name',
    'Assigned Target Grade',
    'Target Score Range',
    'Actual Grade achieved',
    'Actual Score % achieved',
    'Achievement Target Status',
  ]

  const individualRows = data.individual.map((ind) => [
    ind.rollNumber,
    ind.registrationNumber,
    ind.studentName,
    ind.assignedTargetGrade,
    ind.assignedTargetRange,
    ind.actualGrade,
    ind.actualPercentage,
    ind.status,
  ])

  const individualContent = [
    ...buildBrandingHeader(`Achievement Target Breakdown - ${metadata.subjectName}`, `Class: ${metadata.className}-${metadata.sectionName}`),
    individualHeader,
    ...individualRows,
  ]

  const wsIndividual = XLSX.utils.aoa_to_sheet(individualContent)
  wsIndividual['!cols'] = [
    { wch: 10 }, // Roll No
    { wch: 15 }, // Reg
    { wch: 25 }, // Name
    { wch: 22 }, // Target Grade
    { wch: 20 }, // Target Range
    { wch: 22 }, // Actual Grade
    { wch: 22 }, // Actual %
    { wch: 25 }, // Status
  ]

  XLSX.utils.book_append_sheet(wb, wsCollective, 'Summary Stats')
  XLSX.utils.book_append_sheet(wb, wsIndividual, 'Individual Grades')
  
  XLSX.writeFile(wb, `ESA_Target_Analysis_${metadata.subjectName.replace(/\s+/g, '_')}_${metadata.className}.xlsx`)
}
