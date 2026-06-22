/**
 * lib/pdf-upgrades.ts
 * Client-side direct PDF generation using jsPDF for Date Sheets and Result Cards.
 *
 * Enforces Evershaheen Academy branding standards:
 * - Title: EVERSHAHEEN ACADEMY
 * - Slogan: "We Make your Children More Valueable"
 * - Address: Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony
 * - Contacts: Boys: 0328-4010522, Girls: 0324-8985526
 */

import jsPDF from 'jspdf'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function toGray(r: number, g: number, b: number): number {
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
}

function setFillColor(pdf: jsPDF, r: number, g: number, b: number, bw?: boolean) {
  if (bw) {
    const val = toGray(r, g, b)
    pdf.setFillColor(val, val, val)
  } else {
    pdf.setFillColor(r, g, b)
  }
}

function setTextColor(pdf: jsPDF, r: number, g: number, b: number, bw?: boolean) {
  if (bw) {
    const val = toGray(r, g, b)
    pdf.setTextColor(val, val, val)
  } else {
    pdf.setTextColor(r, g, b)
  }
}

function setDrawColor(pdf: jsPDF, r: number, g: number, b: number, bw?: boolean) {
  if (bw) {
    const val = toGray(r, g, b)
    pdf.setDrawColor(val, val, val)
  } else {
    pdf.setDrawColor(r, g, b)
  }
}

function drawSignatureLine(pdf: jsPDF, label: string, x: number, y: number, bw?: boolean) {
  setDrawColor(pdf, 107, 114, 128, bw)
  pdf.setLineWidth(0.4)
  pdf.line(x - 30, y, x + 30, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  setTextColor(pdf, 55, 65, 81, bw)
  pdf.text(label, x, y + 5, { align: 'center' })
}

function drawBrandingHeader(pdf: jsPDF, title: string, subtitle: string, logoUrl?: string, bw?: boolean) {
  // Top border stripe
  setFillColor(pdf, 30, 58, 138, bw) // Navy
  pdf.rect(0, 0, 210, 4, 'F')

  // Logo placeholder or image
  if (logoUrl) {
    try {
      const type = logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      pdf.addImage(logoUrl, type, 15, 8, 20, 20)
    } catch (e) {
      // Draw placeholder circle
      setFillColor(pdf, 241, 245, 249, bw)
      pdf.circle(25, 18, 10, 'F')
    }
  } else {
    // Default branding badge
    setFillColor(pdf, 241, 245, 249, bw)
    pdf.circle(25, 18, 10, 'F')
  }

  // Header Title
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(16)
  setTextColor(pdf, 30, 58, 138, bw)
  pdf.text('EVERSHAHEEN ACADEMY', 105, 12, { align: 'center' })

  // Slogan
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(8.5)
  setTextColor(pdf, 13, 148, 136, bw) // Teal
  pdf.text('"We Make your Children More Valueable"', 105, 17, { align: 'center' })

  // Details
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  setTextColor(pdf, 75, 85, 99, bw)
  pdf.text('Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony', 105, 22, { align: 'center' })
  pdf.text('Contact: Boys Campus: 0328-4010522 | Girls Campus: 0324-8985526', 105, 26, { align: 'center' })

  // Divider
  setDrawColor(pdf, 30, 58, 138, bw)
  pdf.setLineWidth(0.6)
  pdf.line(15, 29, 195, 29)

  // Report Title Box
  setFillColor(pdf, 239, 246, 255, bw)
  pdf.rect(15, 33, 180, 8, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  setTextColor(pdf, 30, 58, 138, bw)
  pdf.text(title.toUpperCase(), 105, 38, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  setTextColor(pdf, 107, 114, 128, bw)
  pdf.text(subtitle, 195, 38, { align: 'right' })
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 3: Exam Date Sheets PDF Export
// ─────────────────────────────────────────────────────────────────────────────
export interface ExamSlotPDFData {
  subjectName: string
  examDate: string
  startTime: string
  endTime: string
  roomNumber?: string
}

export interface DateSheetPDFOptions {
  className: string
  sectionName: string
  examSessionTitle: string
  slots: ExamSlotPDFData[]
  logoUrl?: string
  colorMode?: 'color' | 'bw'
}

export function generateExamDateSheetPDF(options: DateSheetPDFOptions): jsPDF {
  const bw = options.colorMode === 'bw'
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Background
  setFillColor(pdf, 255, 255, 255, bw)
  pdf.rect(0, 0, 210, 297, 'F')

  // Header
  drawBrandingHeader(
    pdf,
    `OFFICIAL EXAM DATE SHEET`,
    `Class: ${options.className}-${options.sectionName} | Term: ${options.examSessionTitle}`,
    options.logoUrl,
    bw
  )

  // Sub-title / Instructions box
  let y = 48
  setFillColor(pdf, 254, 243, 199, bw) // Amber
  pdf.roundedRect(15, y, 180, 15, 2, 2, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  setTextColor(pdf, 146, 64, 14, bw) // Dark amber
  pdf.text('IMPORTANT INSTRUCTIONS FOR STUDENTS:', 18, y + 4)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.text('1. Students must bring their official printed ID Card and Date Sheet in the examination hall.', 18, y + 8)
  pdf.text('2. Please arrive at least 15 minutes before the start time. Late entrance is not allowed.', 18, y + 12)

  // Table Headers
  y += 22
  setFillColor(pdf, 30, 58, 138, bw) // Navy
  pdf.rect(15, y, 180, 8, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  setTextColor(pdf, 255, 255, 255, bw)
  pdf.text('S.No', 20, y + 5)
  pdf.text('Date & Day', 32, y + 5)
  pdf.text('Subject Name', 75, y + 5)
  pdf.text('Start Time', 130, y + 5)
  pdf.text('End Time', 155, y + 5)
  pdf.text('Room', 180, y + 5)

  // Table Body Rows
  y += 8
  pdf.setFont('helvetica', 'normal')
  setTextColor(pdf, 17, 24, 39, bw)

  options.slots.forEach((slot, idx) => {
    // Zebra striping
    if (idx % 2 === 1) {
      setFillColor(pdf, 248, 250, 252, bw)
      pdf.rect(15, y, 180, 8, 'F')
    }

    // Border line below
    setDrawColor(pdf, 226, 232, 240, bw)
    pdf.setLineWidth(0.3)
    pdf.line(15, y + 8, 195, y + 8)

    const dateObj = new Date(slot.examDate)
    const formattedDate = dateObj.toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' })

    pdf.text((idx + 1).toString(), 20, y + 5)
    pdf.text(formattedDate, 32, y + 5)
    pdf.text(slot.subjectName, 75, y + 5)
    pdf.text(slot.startTime, 130, y + 5)
    pdf.text(slot.endTime, 155, y + 5)
    pdf.text(slot.roomNumber || '—', 180, y + 5)

    y += 8
  })

  // Signatures at bottom
  drawSignatureLine(pdf, 'Principal Signature', 55, 265, bw)
  drawSignatureLine(pdf, 'Controller Examination', 155, 265, bw)

  // Official Seal
  setDrawColor(pdf, 30, 58, 138, bw)
  pdf.setLineWidth(0.5)
  pdf.circle(105, 265, 12, 'S')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  setTextColor(pdf, 30, 58, 138, bw)
  pdf.text('EXAM OFFICE', 105, 263, { align: 'center' })
  pdf.text('SEAL', 105, 267, { align: 'center' })

  // Footer
  y = 280
  setDrawColor(pdf, 30, 58, 138, bw)
  pdf.line(15, y, 195, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  setTextColor(pdf, 107, 114, 128, bw)
  pdf.text('This date sheet is generated dynamically by Evershaheen Academy Examination System. Verify at office.', 105, y + 5, { align: 'center' })

  return pdf
}

// ─────────────────────────────────────────────────────────────────────────────
// FEATURE 5: High-Fidelity Result Cards PDF Export
// ─────────────────────────────────────────────────────────────────────────────
export interface SubjectResultPDFData {
  subjectName: string
  totalMarks: number
  obtainedMarks: number | null
  isAbsent: boolean
  isNotApplicable: boolean
  percentage: number | null
  grade: string | null
  remarks?: string
}

export interface ResultCardPDFOptions {
  studentName: string
  fatherName: string
  registrationNumber: string
  rollNumber: string
  className: string
  sectionName: string
  examSessionTitle: string
  overallPercentage: number
  overallGrade: string
  performanceBatch: string
  classPosition: number | null
  subjects: SubjectResultPDFData[]
  logoUrl?: string
  qrCodeUrl?: string
  colorMode?: 'color' | 'bw'
}

export function generateResultCardPDF(options: ResultCardPDFOptions): jsPDF {
  const bw = options.colorMode === 'bw'
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Background
  setFillColor(pdf, 255, 255, 255, bw)
  pdf.rect(0, 0, 210, 297, 'F')

  // Branding Header
  drawBrandingHeader(
    pdf,
    `OFFICIAL STUDENT RESULT CARD`,
    `Exam Session: ${options.examSessionTitle}`,
    options.logoUrl,
    bw
  )

  // Student Info Cards Layout
  let y = 46
  setFillColor(pdf, 248, 250, 252, bw)
  pdf.roundedRect(15, y, 180, 26, 2, 2, 'F')
  setDrawColor(pdf, 226, 232, 240, bw)
  pdf.roundedRect(15, y, 180, 26, 2, 2, 'S')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  
  // Left Column
  setTextColor(pdf, 107, 114, 128, bw)
  pdf.text('Student Name:', 20, y + 6)
  pdf.text('Father Name:', 20, y + 12)
  pdf.text('Registration No:', 20, y + 18)
  
  pdf.setFont('helvetica', 'bold')
  setTextColor(pdf, 17, 24, 39, bw)
  pdf.text(options.studentName.toUpperCase(), 48, y + 6)
  pdf.text(options.fatherName, 48, y + 12)
  pdf.text(options.registrationNumber, 48, y + 18)

  // Right Column
  pdf.setFont('helvetica', 'bold')
  setTextColor(pdf, 107, 114, 128, bw)
  pdf.text('Class & Section:', 110, y + 6)
  pdf.text('Roll Number:', 110, y + 12)
  pdf.text('Exam Session:', 110, y + 18)

  pdf.setFont('helvetica', 'bold')
  setTextColor(pdf, 17, 24, 39, bw)
  pdf.text(`${options.className} - ${options.sectionName}`, 138, y + 6)
  pdf.text(options.rollNumber, 138, y + 12)
  pdf.text(options.examSessionTitle, 138, y + 18)

  // Subject marks breakdown table
  y += 32
  setFillColor(pdf, 30, 58, 138, bw) // Navy Header
  pdf.rect(15, y, 180, 8, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  setTextColor(pdf, 255, 255, 255, bw)
  pdf.text('Subject Name', 20, y + 5.5)
  pdf.text('Total Marks', 85, y + 5.5, { align: 'center' })
  pdf.text('Obtained Marks', 115, y + 5.5, { align: 'center' })
  pdf.text('Percentage', 145, y + 5.5, { align: 'center' })
  pdf.text('Grade', 170, y + 5.5, { align: 'center' })
  pdf.text('Status', 188, y + 5.5, { align: 'center' })

  y += 8
  pdf.setFont('helvetica', 'normal')
  setTextColor(pdf, 17, 24, 39, bw)

  let calculatedTotalPossible = 0
  let calculatedTotalObtained = 0

  options.subjects.forEach((sub, idx) => {
    // Zebra Striping
    if (idx % 2 === 1) {
      setFillColor(pdf, 248, 250, 252, bw)
      pdf.rect(15, y, 180, 8, 'F')
    }

    setDrawColor(pdf, 226, 232, 240, bw)
    pdf.setLineWidth(0.3)
    pdf.line(15, y + 8, 195, y + 8)

    pdf.text(sub.subjectName, 20, y + 5.5)
    pdf.text(sub.totalMarks.toString(), 85, y + 5.5, { align: 'center' })

    let obtainedStr = '—'
    let percentageStr = '—'
    let gradeStr = '—'
    let passFailStatus = '—'

    if (sub.isNotApplicable) {
      obtainedStr = 'N/A'
    } else if (sub.isAbsent) {
      obtainedStr = 'ABSENT'
      percentageStr = '0.0%'
      gradeStr = 'F'
      passFailStatus = 'FAIL'
      calculatedTotalPossible += sub.totalMarks
    } else if (sub.obtainedMarks !== null) {
      obtainedStr = sub.obtainedMarks.toString()
      percentageStr = sub.percentage !== null ? `${sub.percentage.toFixed(1)}%` : '—'
      gradeStr = sub.grade || '—'
      passFailStatus = (sub.percentage || 0) >= 50 ? 'PASS' : 'FAIL'
      calculatedTotalPossible += sub.totalMarks
      calculatedTotalObtained += sub.obtainedMarks
    } else {
      obtainedStr = 'Decide Later'
    }

    pdf.text(obtainedStr, 115, y + 5.5, { align: 'center' })
    pdf.text(percentageStr, 145, y + 5.5, { align: 'center' })
    pdf.text(gradeStr, 170, y + 5.5, { align: 'center' })
    
    // Status text color: red if FAIL or ABSENT, green if PASS
    if (passFailStatus === 'FAIL' || obtainedStr === 'ABSENT') {
      setTextColor(pdf, 220, 38, 38, bw) // red
    } else if (passFailStatus === 'PASS') {
      setTextColor(pdf, 22, 163, 74, bw) // green
    }
    pdf.text(passFailStatus, 188, y + 5.5, { align: 'center' })
    setTextColor(pdf, 17, 24, 39, bw) // Reset color

    y += 8
  })

  // Cumulative Summary Block
  y += 6
  setFillColor(pdf, 240, 253, 250, bw) // Mint bg
  pdf.roundedRect(15, y, 180, 24, 2, 2, 'F')
  setDrawColor(pdf, 204, 251, 241, bw)
  pdf.roundedRect(15, y, 180, 24, 2, 2, 'S')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  setTextColor(pdf, 17, 24, 39, bw)
  pdf.text('Marks Obtained:', 20, y + 7)
  pdf.text('Total Possible:', 20, y + 17)
  pdf.text('Final Percentage:', 85, y + 7)
  pdf.text('Overall Grade:', 85, y + 17)
  pdf.text('Performance Group:', 140, y + 7)
  pdf.text('Class Position:', 140, y + 17)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  setTextColor(pdf, 13, 148, 136, bw)
  pdf.text(calculatedTotalObtained.toString(), 46, y + 7)
  pdf.text(calculatedTotalPossible.toString(), 46, y + 17)
  pdf.text(`${options.overallPercentage.toFixed(1)}%`, 112, y + 7)
  pdf.text(options.overallGrade, 112, y + 17)
  pdf.text(options.performanceBatch, 170, y + 7)
  
  const posText = options.classPosition !== null ? `${options.classPosition} Position` : 'Pending'
  pdf.text(posText, 170, y + 17)

  // QR verification code + verification label
  if (options.qrCodeUrl) {
    try {
      const type = options.qrCodeUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      pdf.addImage(options.qrCodeUrl, type, 15, 230, 24, 24)
      
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(5.5)
      setTextColor(pdf, 107, 114, 128, bw)
      pdf.text('SCAN QR CODE TO VERIFY', 27, 258, { align: 'center' })
    } catch (e) {
      // ignore
    }
  }

  // Signatures at bottom
  drawSignatureLine(pdf, 'Class Teacher Signature', 75, 245, bw)
  drawSignatureLine(pdf, 'Principal Stamp & Sign', 155, 245, bw)

  // Official Stamp
  setDrawColor(pdf, 30, 58, 138, bw)
  pdf.setLineWidth(0.5)
  pdf.circle(115, 242, 10, 'S')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5)
  setTextColor(pdf, 30, 58, 138, bw)
  pdf.text('EVERSHAHEEN', 115, 240, { align: 'center' })
  pdf.text('ACADEMY', 115, 244, { align: 'center' })

  // Bottom Footer
  y = 280
  setDrawColor(pdf, 30, 58, 138, bw)
  pdf.line(15, y, 195, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  setTextColor(pdf, 107, 114, 128, bw)
  pdf.text('Evershaheen Academy Management System © All Rights Reserved. For any corrections, contact the examination controller.', 105, y + 5, { align: 'center' })

  return pdf
}
