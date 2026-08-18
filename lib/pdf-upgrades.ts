/**
 * lib/pdf-upgrades.ts
 * Client-side direct PDF generation using jsPDF for Date Sheets and Result Cards.
 *
 * Enforces EverShine Academy branding standards:
 * - Title: EVERSHINE ACADEMY
 * - Slogan: "We Make Your Children More Valuable"
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
  pdf.text('EVERSHINE ACADEMY', 105, 12, { align: 'center' })

  // Slogan
  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(8.5)
  setTextColor(pdf, 37, 99, 235, bw) // Student blue
  pdf.text('"We Make Your Children More Valuable"', 105, 17, { align: 'center' })

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
  setFillColor(pdf, 239, 246, 255, bw) // Student blue soft
  pdf.roundedRect(15, y, 180, 15, 2, 2, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  setTextColor(pdf, 30, 58, 138, bw) // Student navy
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
  pdf.text('This date sheet is generated dynamically by EverShine Academy Examination System. Verify at office.', 105, y + 5, { align: 'center' })

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
  pdf.text('EVERSHINE', 115, 240, { align: 'center' })
  pdf.text('ACADEMY', 115, 244, { align: 'center' })

  // Bottom Footer
  y = 280
  setDrawColor(pdf, 30, 58, 138, bw)
  pdf.line(15, y, 195, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  setTextColor(pdf, 107, 114, 128, bw)
  pdf.text('EverShine Academy Management System © All Rights Reserved. For any corrections, contact the examination controller.', 105, y + 5, { align: 'center' })

  return pdf
}

// ─────────────────────────────────────────────────────────────────────────────
// ROLL NUMBER SLIP / EXAM ADMIT CARD PDF Export
// ─────────────────────────────────────────────────────────────────────────────

export interface SlipExamSlot {
  subjectName: string
  subjectCode: string
  examDate: string   // ISO date string e.g. "2026-07-08T00:00:00.000Z"
  startTime: string  // e.g. "09:00 AM"
  endTime: string    // e.g. "11:00 AM"
  roomNumber: string | null
}

export interface RollNumberSlipPDFOptions {
  studentName: string
  fatherName: string
  registrationNumber: string
  rollNumber: string
  gender: string
  className: string
  sectionName: string
  shiftName: string
  campus: string
  batch: string
  dateSheetTitle: string
  examSessionName: string | null
  slots: SlipExamSlot[]
  photoUrl?: string    // base64 data URL
  logoUrl?: string     // base64 data URL
  colorMode?: 'color' | 'bw'
}

export function generateRollNumberSlipPDF(options: RollNumberSlipPDFOptions): jsPDF {
  const bw = options.colorMode === 'bw'
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  // Colors
  const cNavy  = { r: 30, g: 58, b: 138 }
  const cTeal  = { r: 37, g: 99, b: 235 }
  const cBlue  = { r: 59, g: 130, b: 246 }
  const cAmber = { r: 191, g: 219, b: 254 }
  const cAmberBg = { r: 239, g: 246, b: 255 }
  const cBorder = { r: 203, g: 213, b: 225 }

  // ── Background ──────────────────────────────────────────────────────────────
  setFillColor(pdf, 255, 255, 255, bw)
  pdf.rect(0, 0, 210, 297, 'F')

  // ── Watermark (Center of Page) ──────────────────────────────────────────────
  if (options.logoUrl) {
    try {
      if (typeof (pdf as any).GState === 'function') {
        pdf.saveGraphicsState()
        const gState = new (pdf as any).GState({ opacity: 0.04 })
        pdf.setGState(gState)
        const logoType = options.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
        pdf.addImage(options.logoUrl, logoType, 55, 90, 100, 100)
        pdf.restoreGraphicsState()
      }
    } catch (e) {
      console.warn('[Watermark] Failed to render PDF watermark:', e)
    }
  }

  // ── Top stripe ──────────────────────────────────────────────────────────────
  setFillColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.rect(0, 0, 210, 6, 'F')

  // ── Academy Logo (left) ──────────────────────────────────────────────────────
  const logoX = 14
  const logoY = 9
  const logoW = 18
  const logoH = 18

  if (options.logoUrl) {
    try {
      const logoType = options.logoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      pdf.addImage(options.logoUrl, logoType, logoX, logoY, logoW, logoH)
    } catch {
      // Circle placeholder on failure
      setFillColor(pdf, 241, 245, 249, bw)
      pdf.circle(logoX + logoW / 2, logoY + logoH / 2, 8, 'F')
    }
  } else {
    setFillColor(pdf, 241, 245, 249, bw)
    pdf.circle(logoX + logoW / 2, logoY + logoH / 2, 8, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    setTextColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
    pdf.text('ESA', logoX + logoW / 2, logoY + logoH / 2 + 2, { align: 'center' })
  }

  // ── Student Passport Photo (right) ───────────────────────────────────────
  const photoW = 20
  const photoH = 24
  const photoX = 196 - photoW
  const photoY = 9

  // Photo border frame
  setDrawColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.setLineWidth(0.5)
  pdf.rect(photoX, photoY, photoW, photoH, 'S')

  if (options.photoUrl) {
    try {
      const photoType = options.photoUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG'
      pdf.addImage(options.photoUrl, photoType, photoX + 0.3, photoY + 0.3, photoW - 0.6, photoH - 0.6)
    } catch {
      setFillColor(pdf, 248, 250, 252, bw)
      pdf.rect(photoX + 0.3, photoY + 0.3, photoW - 0.6, photoH - 0.6, 'F')
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6)
      setTextColor(pdf, 156, 163, 175, bw)
      pdf.text('PHOTO', photoX + photoW / 2, photoY + photoH / 2 + 1, { align: 'center' })
    }
  } else {
    setFillColor(pdf, 248, 250, 252, bw)
    pdf.rect(photoX + 0.3, photoY + 0.3, photoW - 0.6, photoH - 0.6, 'F')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    setTextColor(pdf, 156, 163, 175, bw)
    pdf.text('PHOTO', photoX + photoW / 2, photoY + photoH / 2 + 1, { align: 'center' })
  }

  // ── Academy Name & Info (center) ─────────────────────────────────────────────
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  setTextColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.text('EVERSHINE ACADEMY', 105, 14, { align: 'center' })

  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(7.5)
  setTextColor(pdf, cTeal.r, cTeal.g, cTeal.b, bw)
  pdf.text('"We Make Your Children More Valuable"', 105, 18, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  setTextColor(pdf, 107, 114, 128, bw)
  pdf.text('Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony', 105, 21.5, { align: 'center' })
  pdf.text('Boys: 0328-4010522  |  Girls: 0324-8985526', 105, 24.5, { align: 'center' })

  // Document Title Badge
  setFillColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.roundedRect(70, 27, 70, 6, 1, 1, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  setTextColor(pdf, 255, 255, 255, bw)
  pdf.text('ROLL NUMBER SLIP / ADMIT CARD', 105, 31.2, { align: 'center' })

  // Divider line
  setDrawColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.setLineWidth(0.5)
  pdf.line(14, 36, 196, 36)

  // ── Student Information ─────────────────────────────────────────────────────
  let y = 39
  setFillColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.rect(14, y, 182, 6, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  setTextColor(pdf, 255, 255, 255, bw)
  pdf.text('STUDENT INFORMATION', 105, y + 4.2, { align: 'center' })

  // Grid drawing helpers
  y += 6
  const startX  = 14
  const endX    = 196
  const midX    = 105
  const rowH    = 7

  const drawBorderedRow = (rowY: number, hasSplit = true) => {
    setDrawColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
    pdf.setLineWidth(0.3)
    pdf.rect(startX, rowY, endX - startX, rowH, 'S')
    if (hasSplit) {
      pdf.line(midX, rowY, midX, rowY + rowH)
    }
  }

  const printLabelVal = (rowY: number, label: string, val: string, isLeft: boolean, offset: number, isValBold = false, isValTeal = false) => {
    const xBase = isLeft ? startX : midX
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7)
    setTextColor(pdf, 85, 95, 105, bw)
    pdf.text(label + ':', xBase + 2.5, rowY + 4.5)

    if (isValBold) {
      pdf.setFont('times', 'bold') // Use Times for serif style matching Noto Serif
    } else {
      pdf.setFont('helvetica', 'normal')
    }
    pdf.setFontSize(8.5)
    if (isValTeal) {
      setTextColor(pdf, cTeal.r, cTeal.g, cTeal.b, bw)
    } else {
      setTextColor(pdf, 17, 24, 39, bw)
    }
    pdf.text(val, xBase + offset, rowY + 4.5)
  }

  // Row 1: Registration No & Roll No
  drawBorderedRow(y)
  printLabelVal(y, 'REGISTRATION NO', options.registrationNumber, true, 32, false, true)
  printLabelVal(y, 'ROLL NO', options.rollNumber, false, 22, true, true)
  y += rowH

  // Row 2: Student Name (full width)
  drawBorderedRow(y, false)
  printLabelVal(y, 'STUDENT NAME', options.studentName.toUpperCase(), true, 32, true, false)
  y += rowH

  // Row 3: Class/Section & Shift
  drawBorderedRow(y)
  printLabelVal(y, 'CLASS / SECTION', `${options.className} — ${options.sectionName}`, true, 32, true, false)
  printLabelVal(y, 'SHIFT', options.shiftName, false, 22, true, false)
  y += rowH

  // Row 4: Father Name & Gender
  drawBorderedRow(y)
  printLabelVal(y, 'FATHER NAME', options.fatherName, true, 32, true, false)
  printLabelVal(y, 'GENDER', options.gender, false, 22, true, false)
  y += rowH

  // Row 5: Campus & Batch/Program
  drawBorderedRow(y)
  printLabelVal(y, 'CAMPUS', options.campus, true, 32, true, false)
  printLabelVal(y, 'BATCH / PROGRAM', options.batch, false, 35, true, false)
  y += rowH

  // ── Examination Schedule Header ──────────────────────────────────────────────
  y += 4
  setFillColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.rect(14, y, 182, 6, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  setTextColor(pdf, 255, 255, 255, bw)
  const sessionHeader = `EXAMINATION SCHEDULE — ${(options.examSessionName ?? options.dateSheetTitle).toUpperCase()}`
  pdf.text(sessionHeader, 105, y + 4.2, { align: 'center' })

  // ── Table Column Headers ─────────────────────────────────────────────────────
  y += 6
  setFillColor(pdf, cBlue.r, cBlue.g, cBlue.b, bw)
  pdf.rect(14, y, 182, 6.5, 'F')
  setDrawColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.setLineWidth(0.3)
  pdf.rect(14, y, 182, 6.5, 'S')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  setTextColor(pdf, 255, 255, 255, bw)
  pdf.text('S.No', 18, y + 4.5, { align: 'center' })
  pdf.text('Date', 36, y + 4.5)
  pdf.text('Day', 66, y + 4.5, { align: 'center' })
  pdf.text('Subject Name', 78, y + 4.5)
  pdf.text('Start Time', 142, y + 4.5, { align: 'center' })
  pdf.text('End Time', 168, y + 4.5, { align: 'center' })
  pdf.text('Room', 188, y + 4.5, { align: 'center' })

  // ── Table Content Rows ───────────────────────────────────────────────────────
  y += 6.5
  pdf.setFontSize(7.5)

  if (options.slots.length === 0) {
    setFillColor(pdf, 255, 255, 255, bw)
    pdf.rect(14, y, 182, 10, 'F')
    setDrawColor(pdf, cBorder.r, cBorder.g, cBorder.b, bw)
    pdf.rect(14, y, 182, 10, 'S')
    pdf.setFont('helvetica', 'italic')
    setTextColor(pdf, 107, 114, 128, bw)
    pdf.text('No exam slots scheduled.', 105, y + 6, { align: 'center' })
    y += 10
  } else {
    options.slots.forEach((slot, idx) => {
      // Zebra striping
      if (idx % 2 === 0) {
        setFillColor(pdf, 255, 255, 255, bw)
      } else {
        setFillColor(pdf, 239, 246, 255, bw) // Blue tint row
      }
      pdf.rect(14, y, 182, 7.5, 'F')

      setDrawColor(pdf, cBorder.r, cBorder.g, cBorder.b, bw)
      pdf.setLineWidth(0.2)
      pdf.rect(14, y, 182, 7.5, 'S')

      const dateObj = new Date(slot.examDate)
      const dayStr  = dateObj.toLocaleDateString('en-PK', { weekday: 'short' })
      const dateStr = dateObj.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })

      pdf.setFont('helvetica', 'normal')
      setTextColor(pdf, 17, 24, 39, bw)
      pdf.text((idx + 1).toString(), 18, y + 5, { align: 'center' })
      pdf.text(dateStr, 24, y + 5)
      pdf.text(dayStr, 66, y + 5, { align: 'center' })

      // Subject (times bold for serif styling)
      pdf.setFont('times', 'bold')
      setTextColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
      pdf.text(slot.subjectName, 78, y + 5)

      pdf.setFont('helvetica', 'normal')
      setTextColor(pdf, 17, 24, 39, bw)
      pdf.text(slot.startTime, 142, y + 5, { align: 'center' })
      pdf.text(slot.endTime, 168, y + 5, { align: 'center' })
      pdf.text(slot.roomNumber || '—', 188, y + 5, { align: 'center' })

      y += 7.5
    })
  }

  // ── Important Instructions ──────────────────────────────────────────────────
  y += 5
  setFillColor(pdf, cAmberBg.r, cAmberBg.g, cAmberBg.b, bw)
  pdf.roundedRect(14, y, 182, 23, 1, 1, 'F')
  setDrawColor(pdf, cAmber.r, cAmber.g, cAmber.b, bw)
  pdf.setLineWidth(0.3)
  pdf.roundedRect(14, y, 182, 23, 1, 1, 'S')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7.5)
  setTextColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.text('IMPORTANT INSTRUCTIONS:', 17, y + 5)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  setTextColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.text('1.  Students must bring this printed Roll Number Slip and their official ID Card to the examination hall.', 17, y + 10)
  pdf.text('2.  Arrive at least 15 minutes before start time. Entry will NOT be permitted after the exam begins.', 17, y + 14.5)
  pdf.text('3.  Mobile phones, calculators, and unauthorized materials are strictly prohibited in the exam hall.', 17, y + 19)

  // ── Signatures & Stamp Area ──────────────────────────────────────────────────
  y += 23 // Go to bottom of instructions box
  y += 10 // Safe gap of 10mm so the stamp circular outline doesn't overlap the instructions box

  const sigLineY = y + 18

  // Controller signature line
  setDrawColor(pdf, 107, 114, 128, bw)
  pdf.setLineWidth(0.3)
  pdf.line(14, sigLineY, 54, sigLineY)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  setTextColor(pdf, 55, 65, 81, bw)
  pdf.text('Controller of Examinations', 34, sigLineY + 4, { align: 'center' })

  // Principal signature line
  pdf.line(156, sigLineY, 196, sigLineY)
  pdf.text('Principal Signature & Stamp', 176, sigLineY + 4, { align: 'center' })

  // Official Seal Stamp in center
  const sealX = 105
  const sealY = y + 10
  setDrawColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.setLineWidth(0.4)
  pdf.circle(sealX, sealY, 11, 'S')

  pdf.setFont('times', 'bold')
  pdf.setFontSize(6.5)
  setTextColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.text('EVERSHINE', sealX, sealY - 4, { align: 'center' })
  pdf.text('ACADEMY', sealX, sealY - 1, { align: 'center' })
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  setTextColor(pdf, cTeal.r, cTeal.g, cTeal.b, bw)
  pdf.text('OFFICIAL SEAL', sealX, sealY + 3.5, { align: 'center' })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(7)
  setTextColor(pdf, 55, 65, 81, bw)
  pdf.text('Exam Office Stamp', sealX, sigLineY + 4, { align: 'center' })

  // ── Footer ───────────────────────────────────────────────────────────────────
  const footerY = 284
  setDrawColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.setLineWidth(0.4)
  pdf.line(14, footerY, 196, footerY)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  setTextColor(pdf, 156, 163, 175, bw)
  pdf.text('This slip is generated by EverShine Academy LMS. For corrections or re-issuance, contact the Examination Office.', 105, footerY + 4.5, { align: 'center' })

  setFillColor(pdf, cNavy.r, cNavy.g, cNavy.b, bw)
  pdf.rect(0, 292, 210, 5, 'F')

  return pdf
}
