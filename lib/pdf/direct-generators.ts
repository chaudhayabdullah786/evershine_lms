import jsPDF from 'jspdf'

type ImageType = 'PNG' | 'JPEG'

function inferImageType(dataUrl: string): ImageType {
  if (dataUrl.startsWith('data:image/png')) return 'PNG'
  return 'JPEG'
}

// Helper: add image if dataUrl present
function addImageIfPresent(pdf: jsPDF, dataUrl: string | undefined, x: number, y: number, w: number, h: number) {
  if (!dataUrl) return
  try {
    const type = inferImageType(dataUrl)
    pdf.addImage(dataUrl, type, x, y, w, h)
  } catch (e) {
    // ignore image errors
  }
}

function toGrayComponent(r: number, g: number, b: number) {
  // luminance approximation
  return Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b)
}

// Normalize and title-case a person's name for exported documents
function formatPersonName(name?: string, fallback?: string) {
  if (!name) return fallback ?? ''
  const cleaned = name.trim().replace(/\s+/g, ' ')
  return cleaned
    .split(' ')
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1).toLowerCase() : ''))
    .join(' ')
}

function setFillColorC(pdf: jsPDF, r: number, g: number, b: number, colorMode?: 'color' | 'bw') {
  if (colorMode === 'bw') {
    const gval = toGrayComponent(r, g, b)
    pdf.setFillColor(gval, gval, gval)
  } else {
    pdf.setFillColor(r, g, b)
  }
}

function setTextColorC(pdf: jsPDF, r: number, g: number, b: number, colorMode?: 'color' | 'bw') {
  if (colorMode === 'bw') {
    const gval = toGrayComponent(r, g, b)
    pdf.setTextColor(gval, gval, gval)
  } else {
    pdf.setTextColor(r, g, b)
  }
}

function setDrawColorC(pdf: jsPDF, r: number, g: number, b: number, colorMode?: 'color' | 'bw') {
  if (colorMode === 'bw') {
    const gval = toGrayComponent(r, g, b)
    pdf.setDrawColor(gval, gval, gval)
  } else {
    pdf.setDrawColor(r, g, b)
  }
}

function drawLogoBadge(pdf: jsPDF, logo?: string, x = 0, y = 0, w = 24, h = 24, colorMode?: 'color' | 'bw') {
  if (!logo) return
  addImageIfPresent(pdf, logo, x, y, w, h)
}

function drawLetterhead(pdf: jsPDF, title: string, subtitle: string, logo?: string, colorMode?: 'color' | 'bw') {
  // small header with logo on left
  setFillColorC(pdf, 255, 255, 255, colorMode)
  pdf.rect(0, 0, 210, 30, 'F')
  if (logo) addImageIfPresent(pdf, logo, 12, 6, 36, 18)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  setTextColorC(pdf, 17, 24, 39, colorMode)
  pdf.text(title, 100, 14, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  setTextColorC(pdf, 55, 65, 81, colorMode)
  pdf.text(subtitle, 100, 20, { align: 'center' })
}

function drawSignatureLine(pdf: jsPDF, label: string, x: number, y: number, colorMode?: 'color' | 'bw') {
  setDrawColorC(pdf, 107, 114, 128, colorMode)
  pdf.line(x - 40, y, x + 40, y)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  setTextColorC(pdf, 55, 65, 81, colorMode)
  pdf.text(label, x, y + 8, { align: 'center' })
}

function formatDateString(d: string) {
  try {
    return new Date(d).toLocaleDateString()
  } catch (e) {
    return d
  }
}

export async function generateIDCardDirect(studentData: {
  name: string
  studentClass: string
  rollNo: string
  registrationNumber?: string
  dateOfBirth?: string
  shift?: 'MORNING' | 'EVENING' | 'NIGHT'
  photo?: string
  qrCode?: string
  logo?: string
  colorMode?: 'color' | 'bw'
}) {
  // CR80 standard card: 85.6 × 54mm, landscape orientation (flip for portrait card)
  // We use portrait orientation so the card reads top-to-bottom like the sample
  const W = 54   // width in mm (portrait)
  const H = 85.6 // height in mm (portrait)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, H] })
  const cm = studentData.colorMode

  // ── FRONT FACE ────────────────────────────────────────────────────────────
  // Background: white
  setFillColorC(pdf, 255, 255, 255, cm)
  pdf.rect(0, 0, W, H, 'F')

  // Header band: navy gradient approximated as solid
  const hdrH = 22
  setFillColorC(pdf, 30, 58, 138, cm)
  pdf.rect(0, 0, W, hdrH, 'F')

  // Decorative circles in header (subtle)
  setFillColorC(pdf, 67, 92, 168, cm)
  pdf.circle(8, 5, 10, 'F')
  pdf.circle(48, 18, 8, 'F')

  // Logo badge in header (top-center)
  if (studentData.logo) {
    // White rounded badge behind logo
    setFillColorC(pdf, 255, 255, 255, cm)
    pdf.roundedRect(W / 2 - 5, 2, 10, 10, 2, 2, 'F')
    addImageIfPresent(pdf, studentData.logo, W / 2 - 4, 2.5, 8, 8)
  }

  // Academy name in header
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  setTextColorC(pdf, 255, 255, 255, cm)
  pdf.text('EVERSHINE', W / 2, 15, { align: 'center' })
  pdf.setFontSize(4)
  pdf.setFont('helvetica', 'normal')
  pdf.text('MADINA TOWN CAMPUS', W / 2, 19, { align: 'center' })

  // Avatar circle (centered, overlapping header/body boundary)
  const avatarY = hdrH - 8
  const avatarR = 9
  setFillColorC(pdf, 255, 255, 255, cm)
  pdf.circle(W / 2, avatarY + avatarR, avatarR + 0.8, 'F') // white ring
  setFillColorC(pdf, 99, 102, 241, cm)
  pdf.circle(W / 2, avatarY + avatarR, avatarR, 'F') // purple bg for avatar

  if (studentData.photo) {
    // Clip circle via a round rect approximation
    pdf.addImage(
      studentData.photo,
      inferImageType(studentData.photo),
      W / 2 - avatarR,
      avatarY,
      avatarR * 2,
      avatarR * 2,
    )
  } else {
    // Initials fallback
    const initials = (studentData.name || 'ST')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    setTextColorC(pdf, 255, 255, 255, cm)
    pdf.text(initials, W / 2, avatarY + avatarR + 3, { align: 'center' })
  }

  let y = hdrH + avatarR * 2 + 4

  // Student Name — bold, all-caps
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  setTextColorC(pdf, 15, 23, 42, cm)
  const nameStr = formatPersonName(studentData.name).toUpperCase()
  pdf.text(nameStr, W / 2, y, { align: 'center' })
  y += 5

  // STUDENT IDENTITY badge
  setFillColorC(pdf, 30, 58, 138, cm)
  pdf.roundedRect(W / 2 - 12, y - 3.5, 24, 6, 3, 3, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(4.5)
  setTextColorC(pdf, 255, 255, 255, cm)
  pdf.text('STUDENT IDENTITY', W / 2, y + 0.2, { align: 'center' })
  y += 8

  // Info grid: 2-column
  const col1 = 4, col2 = W / 2 + 2
  const fieldLabelSize = 4, fieldValSize = 5.5
  const rowH = 8

  const fields: [string, string][] = [
    ['CLASS', studentData.studentClass || '—'],
    ['ROLL NO', studentData.rollNo || 'N/A'],
    ['DATE OF BIRTH', studentData.dateOfBirth
      ? new Date(studentData.dateOfBirth).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—'],
    ['REGISTRATION NO', studentData.registrationNumber || '—'],
  ]

  fields.forEach(([lbl, val], i) => {
    const col = i % 2 === 0 ? col1 : col2
    const row = Math.floor(i / 2)
    const baseY = y + row * rowH

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(fieldLabelSize)
    setTextColorC(pdf, 99, 102, 241, cm)
    pdf.text(lbl, col, baseY)

    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(fieldValSize)
    setTextColorC(pdf, 17, 24, 39, cm)
    pdf.text(val.substring(0, 16), col, baseY + 4)
  })

  // Valid year footer
  setFillColorC(pdf, 30, 58, 138, cm)
  pdf.rect(0, H - 8, W, 8, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(4.5)
  setTextColorC(pdf, 255, 255, 255, cm)
  pdf.text(`VALID: ${new Date().getFullYear()}–${new Date().getFullYear() + 1}`, col1 + 1, H - 3.5)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(4)
  setTextColorC(pdf, 147, 197, 253, cm)
  pdf.text('✦ EVERSHINE', W - 3, H - 3.5, { align: 'right' })

  // ── BACK FACE ─────────────────────────────────────────────────────────────
  pdf.addPage([W, H])
  setFillColorC(pdf, 15, 23, 42, cm)
  pdf.rect(0, 0, W, H, 'F')

  // Policy card (top half)
  setFillColorC(pdf, 30, 41, 66, cm)
  pdf.roundedRect(3, 4, W - 6, 34, 3, 3, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5)
  setTextColorC(pdf, 147, 197, 253, cm)
  pdf.text('IMPORTANT POLICIES', 5, 10)
  setDrawColorC(pdf, 55, 75, 120, cm)
  pdf.line(5, 12, W - 5, 12)

  const policyLines = [
    'This card is property of Evershine Academy.',
    'Carry at all times on campus premises.',
    'Report loss immediately to administration.',
    'Non-transferable under any circumstances.',
    'Return card upon leaving the institution.',
  ]
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(4)
  setTextColorC(pdf, 203, 213, 225, cm)
  policyLines.forEach((line, i) => pdf.text(`• ${line}`, 5, 16 + i * 4.2))

  // Verification card (bottom half)
  setFillColorC(pdf, 255, 255, 255, cm)
  pdf.roundedRect(3, 41, W - 6, 38, 3, 3, 'F')

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5)
  setTextColorC(pdf, 30, 58, 138, cm)
  pdf.text('CARD VERIFICATION', 5, 47)
  setDrawColorC(pdf, 219, 234, 254, cm)
  pdf.line(5, 49, W - 5, 49)

  ;[
    ['Name', formatPersonName(studentData.name)],
    ['Class', studentData.studentClass],
    ['Roll No.', studentData.rollNo || 'N/A'],
  ].forEach(([lbl, val], i) => {
    const fy = 53 + i * 6
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(4)
    setTextColorC(pdf, 99, 102, 241, cm)
    pdf.text(lbl + ':', 5, fy)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(5)
    setTextColorC(pdf, 17, 24, 39, cm)
    pdf.text((val || '—').substring(0, 18), 5, fy + 3)
  })

  // QR Code
  if (studentData.qrCode) {
    setFillColorC(pdf, 239, 246, 255, cm)
    pdf.roundedRect(W - 20, 43, 17, 17, 2, 2, 'F')
    addImageIfPresent(pdf, studentData.qrCode, W - 19, 44, 15, 15)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(3.5)
    setTextColorC(pdf, 99, 102, 241, cm)
    pdf.text('SCAN TO VERIFY', W - 11.5, 62, { align: 'center' })
  }

  // Back footer
  setFillColorC(pdf, 30, 58, 138, cm)
  pdf.rect(0, H - 6, W, 6, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(3.5)
  setTextColorC(pdf, 147, 197, 253, cm)
  pdf.text('evershaheen.edu.pk | Boys: 0328-4010522 | Girls: 0324-8985526', W / 2, H - 2, { align: 'center' })

  return pdf
}


export async function generateBirthdayCertificateDirect(certificateData: {
  recipientName: string
  className?: string
  rollNo?: string
  message?: string
  issuedBy?: string
  date: string
  photo?: string
  qrCode?: string
  logo?: string
  colorMode?: 'color' | 'bw'
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  setFillColorC(pdf, 251, 247, 236, certificateData.colorMode)
  pdf.rect(0, 0, 210, 297, 'F')

  setDrawColorC(pdf, 196, 163, 84, certificateData.colorMode)
  pdf.setLineWidth(2)
  pdf.rect(10, 10, 190, 277)

  drawLetterhead(pdf, 'Birthday Certificate', 'Celebrating Your Special Day', certificateData.logo, certificateData.colorMode)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  setTextColorC(pdf, 87, 59, 12, certificateData.colorMode)
  pdf.text('Evershine Academy', 105, 48, { align: 'center' })

  pdf.setFont('helvetica', 'italic')
  pdf.setFontSize(8)
  setTextColorC(pdf, 100, 70, 20, certificateData.colorMode)
  pdf.text('"We Make your Children More Valuable"', 105, 54, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  setTextColorC(pdf, 87, 59, 12, certificateData.colorMode)
  pdf.text('Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony', 105, 60, { align: 'center' })
  pdf.text('Boys: 0328-4010522 | Girls: 0324-8985526', 105, 65, { align: 'center' })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  setTextColorC(pdf, 20, 27, 52, certificateData.colorMode)
  pdf.text(formatPersonName(certificateData.recipientName), 105, 92, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(12)
  pdf.text(`Class: ${certificateData.className || 'Student'} • Roll No: ${certificateData.rollNo || 'N/A'}`, 105, 102, { align: 'center' })

  const description = certificateData.message ?? 'On this special day, the academy celebrates your achievements and wishes you a year of happiness, growth and excellence.'
  pdf.setFontSize(11)
  setTextColorC(pdf, 53, 65, 85, certificateData.colorMode)
  pdf.text(pdf.splitTextToSize(description, 150), 105, 118, { align: 'center' })

  if (certificateData.photo) {
    setDrawColorC(pdf, 255, 255, 255, certificateData.colorMode)
    setFillColorC(pdf, 254, 243, 199, certificateData.colorMode)
    pdf.roundedRect(85, 130, 40, 40, 20, 20, 'F')
    addImageIfPresent(pdf, certificateData.photo, 87, 132, 36, 36)
  }

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text(`Date of Birth: ${formatDateString(certificateData.date)}`, 105, 195, { align: 'center' })

  if (certificateData.qrCode) {
    addImageIfPresent(pdf, certificateData.qrCode, 160, 230, 35, 35)
  }

  drawSignatureLine(pdf, 'Authorized Signature', 120, 262, certificateData.colorMode)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  setTextColorC(pdf, 0, 0, 0, certificateData.colorMode)
  pdf.text(certificateData.issuedBy ?? 'Evershine Academy', 120, 272, { align: 'center' })

  return pdf
}

export async function generatePerformanceCardDirect(performanceData: {
  name: string
  studentClass: string
  rollNo: string
  term: string
  subjects: Array<{ subject: string; marks: number; grade: string }>
  finalGrade: string
  attendance: string
  conduct: string
  photo?: string
  qrCode?: string
  logo?: string
  colorMode?: 'color' | 'bw'
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  setFillColorC(pdf, 255, 255, 255, performanceData.colorMode)
  pdf.rect(0, 0, 210, 297, 'F')

  drawLetterhead(pdf, 'Performance Card', 'Academic Progress Summary', performanceData.logo, performanceData.colorMode)

  if (performanceData.photo) {
    setDrawColorC(pdf, 226, 232, 240, performanceData.colorMode)
    setFillColorC(pdf, 248, 250, 252, performanceData.colorMode)
    pdf.roundedRect(20, 40, 30, 30, 6, 6, 'F')
    addImageIfPresent(pdf, performanceData.photo, 21, 41, 28, 28)
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  setTextColorC(pdf, 30, 58, 138, performanceData.colorMode)
  pdf.text('Student Details', 58, 44)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  setTextColorC(pdf, 51, 65, 85, performanceData.colorMode)
  pdf.text(`Name: ${formatPersonName(performanceData.name)}`, 58, 52)
  pdf.text(`Class: ${performanceData.studentClass}`, 58, 58)
  pdf.text(`Roll No: ${performanceData.rollNo}`, 58, 64)
  pdf.text(`Term: ${performanceData.term}`, 58, 70)

  const columns = [20, 110, 160]
  const headerY = 88
  setDrawColorC(pdf, 226, 232, 240, performanceData.colorMode)
  setFillColorC(pdf, 240, 249, 255, performanceData.colorMode)
  pdf.rect(columns[0], headerY - 8, 170, 8, 'F')
  pdf.setFont('helvetica', 'bold')
  setTextColorC(pdf, 30, 58, 138, performanceData.colorMode)
  pdf.text('Subject', columns[0] + 2, headerY)
  pdf.text('Marks', columns[1], headerY, { align: 'center' })
  pdf.text('Grade', columns[2], headerY, { align: 'center' })

  pdf.setFont('helvetica', 'normal')
  setTextColorC(pdf, 51, 65, 85, performanceData.colorMode)
  let y = headerY + 8
  performanceData.subjects.forEach((subject) => {
    pdf.text(subject.subject, columns[0] + 2, y)
    pdf.text(subject.marks.toString(), columns[1], y, { align: 'center' })
    pdf.text(subject.grade, columns[2], y, { align: 'center' })
    setDrawColorC(pdf, 226, 232, 240, performanceData.colorMode)
    pdf.line(columns[0], y + 2, columns[0] + 170, y + 2)
    y += 9
  })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.text(`Final Grade: ${performanceData.finalGrade}`, 20, y + 10)
  pdf.setFont('helvetica', 'normal')
  pdf.text(`Attendance: ${performanceData.attendance}`, 20, y + 18)
  pdf.text(`Conduct: ${performanceData.conduct}`, 20, y + 26)

  if (performanceData.qrCode) {
    addImageIfPresent(pdf, performanceData.qrCode, 160, 230, 35, 35)
  }

  drawSignatureLine(pdf, 'Class Teacher', 120, 262, performanceData.colorMode)
  return pdf
}

export async function generateResultCardDirect(data: {
  name: string
  studentClass: string
  rollNo: string
  session: string
  subjects: Array<{ subject: string; marks: number; maxMarks?: number }>
  totalMarks: number
  percentage: number
  grade: string
  photo?: string
  qrCode?: string
  logo?: string
  colorMode?: 'color' | 'bw'
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  setFillColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.rect(0, 0, 210, 297, 'F')

  drawLetterhead(pdf, 'Result Card', 'Official Examination Record', data.logo, data.colorMode)

  if (data.photo) {
    setDrawColorC(pdf, 226, 232, 240, data.colorMode)
    setFillColorC(pdf, 248, 250, 252, data.colorMode)
    pdf.roundedRect(20, 40, 30, 30, 6, 6, 'F')
    addImageIfPresent(pdf, data.photo, 21, 41, 28, 28)
  }

  const textX = data.photo ? 58 : 20

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  setTextColorC(pdf, 17, 24, 39, data.colorMode)
  pdf.text(formatPersonName(data.name), textX, 48)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  setTextColorC(pdf, 55, 65, 81, data.colorMode)
  pdf.text(`Class: ${data.studentClass}`, textX, 56)
  pdf.text(`Roll No: ${data.rollNo}`, textX, 62)
  pdf.text(`Session: ${data.session}`, textX, 68)

  let tableY = 90
  pdf.setFont('helvetica', 'bold')
  pdf.text('Subject', 20, tableY)
  pdf.text('Marks Obtained', 110, tableY)
  pdf.text('Max Marks', 160, tableY)
  pdf.setFont('helvetica', 'normal')
  data.subjects.forEach((s) => {
    tableY += 8
    pdf.text(s.subject, 20, tableY)
    pdf.text((s.marks || 0).toString(), 110, tableY)
    pdf.text((s.maxMarks || 100).toString(), 160, tableY)
  })

  pdf.setFont('helvetica', 'bold')
  pdf.text(`Total: ${data.totalMarks}`, 20, tableY + 12)
  pdf.text(`Percentage: ${data.percentage}%`, 20, tableY + 20)
  pdf.text(`Grade: ${data.grade}`, 20, tableY + 28)

  if (data.qrCode) {
    addImageIfPresent(pdf, data.qrCode, 160, 230, 35, 35)
  }

  drawSignatureLine(pdf, 'Principal', 120, 262, data.colorMode)
  return pdf
}

export async function generateBonafideCertificateDirect(data: {
  studentName: string
  fatherName: string
  className: string
  rollNo: string
  registrationNumber: string
  cnicBForm: string
  shift?: 'MORNING' | 'EVENING' | 'NIGHT'
  issueDate: string
  validUntil?: string
  photo?: string
  qrCode?: string
  logo?: string
  colorMode?: 'color' | 'bw'
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  setFillColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.rect(0, 0, 210, 297, 'F')

  drawLetterhead(pdf, 'Bonafide Certificate', 'Official Student Status Confirmation', data.logo, data.colorMode)

  if (data.photo) {
    setDrawColorC(pdf, 226, 232, 240, data.colorMode)
    setFillColorC(pdf, 248, 250, 252, data.colorMode)
    pdf.roundedRect(20, 40, 32, 32, 6, 6, 'F')
    addImageIfPresent(pdf, data.photo, 21, 41, 30, 30)
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  setTextColorC(pdf, 30, 58, 138, data.colorMode)
  pdf.text('Student Data', 58, 46)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  setTextColorC(pdf, 55, 65, 81, data.colorMode)
  const sName = formatPersonName(data.studentName)
  const fName = formatPersonName(data.fatherName)
  pdf.text(`Name: ${sName}`, 58, 54)
  pdf.text(`Father Name: ${fName}`, 58, 60)
  pdf.text(`Class: ${data.className}`, 58, 66)
  pdf.text(`Roll No: ${data.rollNo}`, 58, 72)
  pdf.text(`Registration No: ${data.registrationNumber}`, 58, 78)

  const sessionLabel = data.shift
    ? (data.shift === 'MORNING' ? 'Morning Session'
      : data.shift === 'EVENING' ? 'Evening Session'
      : 'Night Session')
    : null
  const sessionClause = sessionLabel ? ` (${sessionLabel} coaching)` : ''
  const paragraph1 = `This is to certify that ${sName}, son / daughter of Mr. ${fName}, bearing B-Form / CNIC number ${data.cnicBForm}, is a bonafide student of Evershine Academy, Madina Town Campus, currently enrolled in ${data.className}${sessionClause} under Registration Number ${data.registrationNumber} and Roll Number ${data.rollNo}.`
  const paragraph2 = `The student is active in the ${sessionLabel ?? 'academic'} session ${new Date().getFullYear()}–${new Date().getFullYear() + 1} and is issued this certificate for official verification and record purposes.`

  pdf.setFontSize(10)
  setTextColorC(pdf, 51, 65, 85, data.colorMode)
  pdf.text(pdf.splitTextToSize(paragraph1, 170), 20, 105)
  pdf.text(pdf.splitTextToSize(paragraph2, 170), 20, 125)

  pdf.setFontSize(9)
  setTextColorC(pdf, 75, 85, 99, data.colorMode)
  pdf.text(`Reference: ESA/BON/${data.registrationNumber.slice(-5)}/${new Date().getFullYear()}`, 20, 150)
  pdf.text(`Issued on: ${formatDateString(data.issueDate)}`, 20, 156)
  if (data.validUntil) {
    pdf.text(`Valid Until: ${formatDateString(data.validUntil)}`, 20, 162)
  }

  if (data.qrCode) {
    addImageIfPresent(pdf, data.qrCode, 160, 220, 35, 35)
  }

  drawSignatureLine(pdf, 'Authorized Signature', 120, 262, data.colorMode)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  setTextColorC(pdf, 0, 0, 0, data.colorMode)
  pdf.text('Evershine Academy Administration', 120, 272, { align: 'center' })

  return pdf
}

export async function generateReportDirect(reportData: {
  title: string
  generatedOn: string
  summary: string
  rows: Array<{ label: string; value: string }>
  qrCode?: string
  logo?: string
  colorMode?: 'color' | 'bw'
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  setFillColorC(pdf, 250, 251, 255, reportData.colorMode)
  pdf.rect(0, 0, 210, 297, 'F')

  drawLetterhead(pdf, reportData.title, 'Institutional Operations Report', reportData.logo, reportData.colorMode)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  setTextColorC(pdf, 55, 65, 81, reportData.colorMode)
  pdf.text(`Generated on: ${formatDateString(reportData.generatedOn)}`, 20, 40)

  pdf.setFontSize(11)
  pdf.text(reportData.summary, 20, 50, { maxWidth: 170 })

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  let lineY = 72
  reportData.rows.forEach((row) => {
    pdf.text(row.label, 20, lineY)
    pdf.text(row.value, 110, lineY)
    setDrawColorC(pdf, 224, 231, 255, reportData.colorMode)
    pdf.line(20, lineY + 2, 190, lineY + 2)
    lineY += 10
  })

  if (reportData.qrCode) {
    addImageIfPresent(pdf, reportData.qrCode, 160, 240, 35, 35)
  }

  drawSignatureLine(pdf, 'Report Approved By', 120, 262, reportData.colorMode)
  return pdf
}

export async function generateTeacherProfileDirect(data: {
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  specialization?: string
  qualification: string
  experienceYears: number
  phoneNumber: string
  email: string
  cnic?: string
  emergencyContact?: string
  address: string
  city: string
  monthlySalary?: number
  joiningDate?: string
  isActive: boolean
  campusName?: string
  batchName?: string
  houseName?: string
  classes?: Array<{ class: { name: string }; isClassTeacher: boolean }>
  photo?: string
  qrCode?: string
  logo?: string
  colorMode?: 'color' | 'bw'
}) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  setFillColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.rect(0, 0, 210, 297, 'F')

  drawLetterhead(pdf, 'Staff Profile Document', 'Evershine Academy Official HR Record', data.logo, data.colorMode)

  // Photo / Placeholder on left, employee main details on right
  if (data.photo) {
    setDrawColorC(pdf, 226, 232, 240, data.colorMode)
    setFillColorC(pdf, 248, 250, 252, data.colorMode)
    pdf.roundedRect(20, 40, 32, 32, 6, 6, 'F')
    addImageIfPresent(pdf, data.photo, 21, 41, 30, 30)
  } else {
    setFillColorC(pdf, 239, 246, 255, data.colorMode)
    pdf.roundedRect(20, 40, 32, 32, 6, 6, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    setTextColorC(pdf, 29, 78, 216, data.colorMode)
    pdf.text(`${data.firstName[0]}${data.lastName[0]}`, 36, 58, { align: 'center' })
  }

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  setTextColorC(pdf, 17, 24, 39, data.colorMode)
  const fullName = `${data.firstName} ${data.lastName}`
  pdf.text(fullName, 58, 46)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  setTextColorC(pdf, 75, 85, 99, data.colorMode)
  pdf.text(`${data.designation} • ${data.specialization || 'Generalist'}`, 58, 52)
  pdf.text(`Employee ID: ${data.employeeId}`, 58, 58)
  pdf.text(`Status: ${data.isActive ? 'Active Staff' : 'Suspended Staff'}`, 58, 64)

  // Details grid
  let y = 82
  const drawSectionTitle = (title: string, yPos: number) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    setTextColorC(pdf, 29, 78, 216, data.colorMode)
    pdf.text(title.toUpperCase(), 20, yPos)
    setDrawColorC(pdf, 229, 231, 235, data.colorMode)
    pdf.line(20, yPos + 2, 190, yPos + 2)
  }

  // Personal & Contact Info
  drawSectionTitle('Personal & Contact Information', y)
  y += 10

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  setTextColorC(pdf, 107, 114, 128, data.colorMode)

  const printRow = (label1: string, val1: string, label2: string, val2: string, curY: number) => {
    pdf.setFont('helvetica', 'bold')
    setTextColorC(pdf, 75, 85, 99, data.colorMode)
    pdf.text(label1, 20, curY)
    pdf.text(label2, 110, curY)

    pdf.setFont('helvetica', 'normal')
    setTextColorC(pdf, 17, 24, 39, data.colorMode)
    pdf.text(val1, 55, curY)
    pdf.text(val2, 145, curY)
  }

  printRow('Email:', data.email, 'Phone Number:', data.phoneNumber, y)
  y += 8
  printRow('CNIC:', data.cnic || 'N/A', 'Emergency Contact:', data.emergencyContact || 'N/A', y)
  y += 8
  
  pdf.setFont('helvetica', 'bold')
  setTextColorC(pdf, 75, 85, 99, data.colorMode)
  pdf.text('Address:', 20, y)
  pdf.setFont('helvetica', 'normal')
  setTextColorC(pdf, 17, 24, 39, data.colorMode)
  pdf.text(`${data.address}, ${data.city}`, 55, y)

  y += 16

  // Academic & Placement Info
  drawSectionTitle('Academic Placement & Assignments', y)
  y += 10

  printRow('Campus Name:', data.campusName || 'Madina Town Campus', 'Academic Batch:', data.batchName || 'Regular', y)
  y += 8

  // Performance House (optional)
  pdf.setFont('helvetica', 'bold')
  setTextColorC(pdf, 75, 85, 99, data.colorMode)
  pdf.text('Performance House:', 20, y)
  pdf.setFont('helvetica', 'normal')
  setTextColorC(pdf, 17, 24, 39, data.colorMode)
  pdf.text(data.houseName || '—', 55, y)
  y += 10

  // Classes
  pdf.setFont('helvetica', 'bold')
  setTextColorC(pdf, 75, 85, 99, data.colorMode)
  pdf.text('Assigned Classes:', 20, y)
  pdf.setFont('helvetica', 'normal')
  setTextColorC(pdf, 17, 24, 39, data.colorMode)
  const classList = data.classes && data.classes.length > 0
    ? data.classes.map(c => `${c.class.name}${c.isClassTeacher ? ' (Class Teacher)' : ''}`).join(', ')
    : 'No classes assigned'
  pdf.text(pdf.splitTextToSize(classList, 135), 55, y)

  y += 20

  // Professional & Financial
  drawSectionTitle('Professional & Financial Details', y)
  y += 10

  printRow('Qualification:', data.qualification, 'Experience (Years):', `${data.experienceYears} Years`, y)
  y += 8
  printRow('Monthly Salary:', data.monthlySalary ? `Rs ${data.monthlySalary.toLocaleString()}` : 'N/A', 'Joining Date:', data.joiningDate ? formatDateString(data.joiningDate) : 'N/A', y)

  // QR Code for verification at bottom
  if (data.qrCode) {
    addImageIfPresent(pdf, data.qrCode, 160, 230, 30, 30)
  }

  drawSignatureLine(pdf, 'HR Administrator', 60, 262, data.colorMode)
  drawSignatureLine(pdf, 'Principal Seal', 140, 262, data.colorMode)

  return pdf
}

// ─────────────────────────────────────────────────────────────────────────────
// TEACHER ID CARD — 85×54mm landscape, emerald (#065F46) vs student navy
// DIFFERENTIATION: Left panel is emerald/teal, badge reads "STAFF ID CARD"
// Fields: designation, department, employee ID (NOT class/roll like student card)
// ─────────────────────────────────────────────────────────────────────────────
export interface TeacherIDCardData {
  employeeId: string
  name: string
  designation: string
  department: string
  qualification: string
  phone: string
  campus?: string
  photo?: string
  qrCode?: string
  logo?: string
  colorMode?: 'color' | 'bw'
  validYear?: number
}

export async function generateTeacherIDCardDirect(data: TeacherIDCardData): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [85, 54] })
  const yr = data.validYear ?? new Date().getFullYear()
  const leftW = 26

  // ── FRONT ─────────────────────────────────────────────────────────────────
  setFillColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.rect(0, 0, 85, 54, 'F')

  // Left emerald panel (distinguishes from student navy #1E3A8A)
  setFillColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.roundedRect(0, 0, leftW, 54, 4, 4, 'F')

  drawLogoBadge(pdf, data.logo, 4, 3, 18, 18, data.colorMode)

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(6.5)
  setTextColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.text('EVERSHINE', leftW / 2, 8, { align: 'center' })
  pdf.setFontSize(5.5)
  pdf.text('ACADEMY', leftW / 2, 12, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(4)
  pdf.text(data.campus ?? 'Madina Town', leftW / 2, 16, { align: 'center' })

  // Photo circle
  setFillColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.roundedRect(4, 18, 18, 18, 6, 6, 'F')
  addImageIfPresent(pdf, data.photo, 5, 19, 16, 16)

  // STAFF badge
  setFillColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.roundedRect(3, 38, 20, 13, 3, 3, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  setTextColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.text('STAFF ID', leftW / 2, 43, { align: 'center' })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(4)
  setTextColorC(pdf, 107, 114, 128, data.colorMode)
  pdf.text('Evershaheen Academy', leftW / 2, 48, { align: 'center' })

  // Right info panel
  setDrawColorC(pdf, 226, 232, 240, data.colorMode)
  pdf.roundedRect(leftW + 2, 4, 57, 46, 3, 3, 'S')

  // Name
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8.5)
  setTextColorC(pdf, 15, 23, 42, data.colorMode)
  const nameLines = pdf.splitTextToSize(formatPersonName(data.name), 50)
  pdf.text(nameLines[0], leftW + 4, 13)

  // Field helper
  const field = (label: string, value: string, y: number) => {
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(5)
    setTextColorC(pdf, 6, 95, 70, data.colorMode)
    pdf.text(label, leftW + 4, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(6)
    setTextColorC(pdf, 15, 23, 42, data.colorMode)
    pdf.text(value.substring(0, 28), leftW + 4, y + 4)
  }

  field('DESIGNATION', data.designation, 19)
  field('DEPARTMENT', data.department, 29)
  field('EMP ID', data.employeeId, 39)

  // Validity
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(4.5)
  setTextColorC(pdf, 107, 114, 128, data.colorMode)
  pdf.text(`Valid: ${yr}–${yr + 1}`, 80, 52, { align: 'right' })

  // ── BACK ──────────────────────────────────────────────────────────────────
  pdf.addPage()
  setFillColorC(pdf, 15, 23, 42, data.colorMode)
  pdf.rect(0, 0, 85, 54, 'F')

  // Policies box (left)
  setFillColorC(pdf, 241, 245, 249, data.colorMode)
  pdf.roundedRect(3, 4, 40, 44, 3, 3, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  setTextColorC(pdf, 15, 23, 42, data.colorMode)
  pdf.text('STAFF POLICIES', 7, 10)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(4.5)
  setTextColorC(pdf, 51, 65, 85, data.colorMode)
  const policies = [
    'Property of Evershaheen Academy.',
    'Must be visible at all times on campus.',
    'Report loss to HR within 24 hours.',
    'Non-transferable under any circumstances.',
    'Return upon leaving the institution.',
  ]
  policies.forEach((p, i) => pdf.text(`• ${p}`, 6, 16 + i * 5.5))

  // Verification box (right)
  setFillColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.roundedRect(45, 4, 37, 44, 3, 3, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5.5)
  setTextColorC(pdf, 15, 23, 42, data.colorMode)
  pdf.text('VERIFICATION', 48, 10)
  ;[
    ['Name', formatPersonName(data.name)],
    ['Qualification', data.qualification],
    ['Phone', data.phone],
  ].forEach(([lbl, val], i) => {
    const y = 16 + i * 9
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(4.5)
    setTextColorC(pdf, 6, 95, 70, data.colorMode)
    pdf.text(lbl, 48, y)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(5.5)
    setTextColorC(pdf, 15, 23, 42, data.colorMode)
    pdf.text((val ?? '').substring(0, 22), 48, y + 4)
  })
  // QR code
  if (data.qrCode) {
    setFillColorC(pdf, 241, 245, 249, data.colorMode)
    pdf.roundedRect(53, 34, 16, 16, 2, 2, 'F')
    addImageIfPresent(pdf, data.qrCode, 54, 35, 14, 14)
  }

  // Footer
  setFillColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.rect(0, 50, 85, 4, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(3.5)
  setTextColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.text('www.evershaheen.edu.pk | Boys: 0328-4010522 | Girls: 0324-8985526', 42, 53, { align: 'center' })

  return pdf
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPERIENCE LETTER — A4 portrait, institutional format
// Emerald branding, dynamic responsibilities, dual signature + official seal
// ─────────────────────────────────────────────────────────────────────────────
export interface ExperienceLetterData {
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  department: string
  joiningDate: string
  endDate?: string
  responsibilities: string[]
  principalName: string
  principalTitle: string
  issueDate: string
  referenceNo?: string
  logo?: string
  colorMode?: 'color' | 'bw'
}

export async function generateExperienceLetterDirect(data: ExperienceLetterData): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  setFillColorC(pdf, 255, 255, 255, data.colorMode)
  pdf.rect(0, 0, 210, 297, 'F')

  // Emerald top border stripe
  setFillColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.rect(0, 0, 210, 4, 'F')

  // Letterhead
  drawLetterhead(pdf, 'EVERSHAHEEN ACADEMY', '"We Make your Children More Valuable"', data.logo, data.colorMode)

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  setTextColorC(pdf, 75, 85, 99, data.colorMode)
  pdf.text('Madina Town near Mandiala Warraich Road, Near Labor Gulshan Colony, Faisalabad', 105, 26, { align: 'center' })
  pdf.text('Boys: 0328-4010522 | Girls: 0324-8985526', 105, 30, { align: 'center' })

  // Emerald divider
  setDrawColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.setLineWidth(0.8)
  pdf.line(20, 34, 190, 34)

  // Ref & date row
  const refNo = data.referenceNo ?? `ESA/EXP/${data.employeeId}/${new Date(data.issueDate).getFullYear()}`
  pdf.setFontSize(9)
  setTextColorC(pdf, 75, 85, 99, data.colorMode)
  pdf.text(`Ref No: ${refNo}`, 20, 42)
  pdf.text(`Date: ${formatDateString(data.issueDate)}`, 190, 42, { align: 'right' })

  // Title
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(14)
  setTextColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.text('EXPERIENCE CERTIFICATE', 105, 55, { align: 'center' })
  pdf.setLineWidth(0.4)
  setDrawColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.line(55, 58, 155, 58)

  // Body
  const fullName = `${data.firstName} ${data.lastName}`
  const from = formatDateString(data.joiningDate)
  const to = data.endDate ? formatDateString(data.endDate) : 'Present'
  const tenure = data.endDate ? `from ${from} to ${to}` : `since ${from} and is currently serving in this role`

  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  setTextColorC(pdf, 51, 65, 85, data.colorMode)

  let y = 68
  const para1 = `This is to certify that ${formatPersonName(fullName)}, holding Employee ID ${data.employeeId}, has served as ${data.designation} in the ${data.department} Department at Evershaheen Academy, Madina Town Campus, ${tenure}.`
  pdf.text(pdf.splitTextToSize(para1, 170), 20, y)
  y += 26

  pdf.text(pdf.splitTextToSize(
    `During the tenure, ${data.firstName} has performed the following responsibilities with dedication and professionalism:`,
    170
  ), 20, y)
  y += 14

  pdf.setFontSize(10.5)
  data.responsibilities.slice(0, 6).forEach(r => {
    pdf.text(`\u2022  ${r}`, 26, y)
    y += 7
  })
  y += 4

  pdf.setFontSize(11)
  pdf.text(pdf.splitTextToSize(
    `${formatPersonName(fullName)} has demonstrated excellent professional conduct, punctuality, and commitment throughout the period of service. We wish them the very best in all future endeavors.`,
    170
  ), 20, y)
  y += 22

  pdf.setFontSize(9)
  setTextColorC(pdf, 107, 114, 128, data.colorMode)
  pdf.text('This certificate is issued on official request and is valid for verification purposes only.', 105, y, { align: 'center' })

  // Signature blocks
  drawSignatureLine(pdf, `${data.principalName}\n${data.principalTitle}`, 145, 262, data.colorMode)
  drawSignatureLine(pdf, 'HR Administrator', 60, 262, data.colorMode)

  // Official seal circle
  setDrawColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.setLineWidth(0.6)
  pdf.circle(105, 262, 14, 'S')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(5)
  setTextColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.text('OFFICIAL', 105, 260, { align: 'center' })
  pdf.text('SEAL', 105, 265, { align: 'center' })

  // Bottom border
  setDrawColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.setLineWidth(0.8)
  pdf.line(20, 280, 190, 280)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  setTextColorC(pdf, 107, 114, 128, data.colorMode)
  pdf.text('Evershaheen Academy | Madina Town, Gujranwala | Boys: 0328-4010522 | Girls: 0324-8985526', 105, 285, { align: 'center' })

  // Emerald bottom stripe
  setFillColorC(pdf, 6, 95, 70, data.colorMode)
  pdf.rect(0, 293, 210, 4, 'F')

  return pdf
}
