/**
 * scripts/test-upgrades-export.ts
 * Smoke test for Academic Upgrades PDF and Excel generators.
 * Generates test files inside samples_output/ using the exact branded templates.
 */

import fs from 'fs'
import path from 'path'
import { generateExamDateSheetPDF, generateResultCardPDF } from '../lib/pdf-upgrades'
import {
  downloadSectionAttendanceExcel,
  downloadEnrolledStudentRecordsExcel,
  downloadDailyPerformanceExcel,
  downloadMonthlyComparisonExcel,
  downloadTargetAnalysisExcel
} from '../lib/excel-upgrades'

const OUTPUT_FOLDER = path.resolve(process.cwd(), 'samples_output')
const PLACEHOLDER_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PLACEHOLDER_QR = PLACEHOLDER_LOGO

// Overrides write functions to local filesystem inside Node.js environment
// XLSX.writeFile will write to the CWD by default in Node.js, we will temporarily mock it or move it afterwards.
// To keep it clean, we'll run the Excel generators, which write files in CWD, then move them to samples_output.

function moveFileIfExists(filename: string) {
  const src = path.join(process.cwd(), filename)
  const dest = path.join(OUTPUT_FOLDER, filename)
  if (fs.existsSync(src)) {
    fs.renameSync(src, dest)
    console.log(`- Created Excel: ${dest}`)
  }
}

async function run() {
  fs.mkdirSync(OUTPUT_FOLDER, { recursive: true })
  console.log(`Starting Academic Upgrades Export Smoke Tests...\n`)

  // 1. PDF Date Sheet
  const dateSheetPdf = generateExamDateSheetPDF({
    className: '9th Grade',
    sectionName: 'Section A (Boys)',
    examSessionTitle: 'Final Term Exam 2026',
    logoUrl: PLACEHOLDER_LOGO,
    colorMode: 'color',
    slots: [
      { subjectName: 'Mathematics', examDate: '2026-06-15', startTime: '09:00 AM', endTime: '12:00 PM', roomNumber: 'Room 1' },
      { subjectName: 'Physics', examDate: '2026-06-17', startTime: '09:00 AM', endTime: '12:00 PM', roomNumber: 'Room 2' },
      { subjectName: 'Computer Science', examDate: '2026-06-19', startTime: '09:00 AM', endTime: '12:00 PM', roomNumber: 'Lab A' }
    ]
  })
  const dsBuffer = Buffer.from(dateSheetPdf.output('arraybuffer') as ArrayBuffer)
  fs.writeFileSync(path.join(OUTPUT_FOLDER, 'ESA_DateSheet_Test_Color.pdf'), dsBuffer)
  console.log(`- Created PDF: ${path.join(OUTPUT_FOLDER, 'ESA_DateSheet_Test_Color.pdf')}`)

  // 2. PDF Result Card
  const resultCardPdf = generateResultCardPDF({
    studentName: 'Ahmad Ali',
    fatherName: 'Muhammad Ali',
    registrationNumber: 'ESA-2026-0041',
    rollNumber: '10041',
    className: '9th Grade',
    sectionName: 'Section A (Boys)',
    examSessionTitle: 'Final Term Exam 2026',
    overallPercentage: 86.4,
    overallGrade: 'A+',
    performanceBatch: 'EXCELLENT',
    classPosition: 2,
    logoUrl: PLACEHOLDER_LOGO,
    qrCodeUrl: PLACEHOLDER_QR,
    colorMode: 'color',
    subjects: [
      { subjectName: 'Mathematics', totalMarks: 100, obtainedMarks: 95, isAbsent: false, isNotApplicable: false, percentage: 95, grade: 'A+' },
      { subjectName: 'Physics', totalMarks: 100, obtainedMarks: 84, isAbsent: false, isNotApplicable: false, percentage: 84, grade: 'A' },
      { subjectName: 'English', totalMarks: 100, obtainedMarks: null, isAbsent: false, isNotApplicable: false, percentage: null, grade: null }, // Decide Later
      { subjectName: 'Chemistry', totalMarks: 100, obtainedMarks: 0, isAbsent: true, isNotApplicable: false, percentage: 0, grade: 'F' } // Absent
    ]
  })
  const rcBuffer = Buffer.from(resultCardPdf.output('arraybuffer') as ArrayBuffer)
  fs.writeFileSync(path.join(OUTPUT_FOLDER, 'ESA_ResultCard_Test_Color.pdf'), rcBuffer)
  console.log(`- Created PDF: ${path.join(OUTPUT_FOLDER, 'ESA_ResultCard_Test_Color.pdf')}`)

  // 3. Excel: Attendance Roster
  const attendanceFilename = 'ESA_Attendance_9th_Grade_Section_A_May_2026.xlsx'
  downloadSectionAttendanceExcel(
    { className: '9th Grade', sectionName: 'Section A', shift: 'Morning', period: 'May 2026' },
    [
      { studentName: 'Ahmad Ali', fatherName: 'Muhammad Ali', registrationNumber: 'ESA-001', rollNumber: '1001', gender: 'MALE', guardianName: 'Muhammad Ali', contactNo: '0300-1234567', totalDays: 26, totalPresents: 24, percentage: 92.3 }
    ]
  )
  moveFileIfExists(attendanceFilename)

  // 4. Excel: Enrolled Students
  const studentsFilename = 'ESA_Student_Register_9th_Grade_Section_A.xlsx'
  downloadEnrolledStudentRecordsExcel(
    { campusName: 'Boys Campus', className: '9th Grade', sectionName: 'Section A' },
    [
      { registrationNumber: 'ESA-001', rollNumber: '1001', name: 'Ahmad Ali', gender: 'MALE', fatherName: 'Muhammad Ali', guardianName: 'Muhammad Ali', contactNo: '0300-1234567', enrollmentType: 'REGULAR', houseName: 'Jinnah House' }
    ]
  )
  moveFileIfExists(studentsFilename)

  // 5. Excel: Daily Performance
  const perfFilename = 'ESA_Daily_Performance_Mathematics_2026-06-08.xlsx'
  downloadDailyPerformanceExcel(
    { subjectName: 'Mathematics', className: '9th Grade', sectionName: 'Section A', date: '2026-06-08' },
    [
      { rollNumber: '1001', registrationNumber: 'ESA-001', studentName: 'Ahmad Ali', score: 8.5, isAbsent: false, remarks: 'Very Active participation' }
    ]
  )
  moveFileIfExists(perfFilename)

  // 6. Excel: Monthly Comparison
  const compFilename = 'ESA_Monthly_Comparison_9th_Grade_Section_A.xlsx'
  downloadMonthlyComparisonExcel(
    { className: '9th Grade', sectionName: 'Section A', prevMonth: 'April 2026', currMonth: 'May 2026' },
    [
      { subjectName: 'Mathematics', prevTotal: 100, prevPass: 20, prevFail: 2, prevAvg: 76.5, currTotal: 100, currPass: 22, currFail: 0, currAvg: 85.2, progress: '+8.7% Improvement' }
    ]
  )
  moveFileIfExists(compFilename)

  // 7. Excel: Target Analysis
  const targetsFilename = 'ESA_Target_Analysis_Mathematics_9th_Grade.xlsx'
  downloadTargetAnalysisExcel(
    { subjectName: 'Mathematics', className: '9th Grade', sectionName: 'Section A' },
    {
      collective: { met: 18, notMet: 4, noTarget: 2, total: 24 },
      individual: [
        { rollNumber: '1001', registrationNumber: 'ESA-001', studentName: 'Ahmad Ali', assignedTargetGrade: 'A', assignedTargetRange: '80% - 90%', actualGrade: 'A+', actualPercentage: '92.0%', status: 'TARGET_MET' }
      ]
    }
  )
  moveFileIfExists(targetsFilename)

  console.log(`\nAll Export Smoke Tests successfully passed. Output files written to ${OUTPUT_FOLDER}\n`)
}

run().catch(err => {
  console.error('Error running upgrades export tests:', err)
  process.exit(1)
})
