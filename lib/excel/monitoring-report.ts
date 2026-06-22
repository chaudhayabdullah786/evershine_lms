/**
 * lib/excel/monitoring-report.ts
 *
 * Generates a professionally branded Excel monitoring report using ExcelJS.
 * Supports both daily and monthly reports with:
 * - Academy logo embedded in header
 * - Branded title block with academy name, slogan, and report metadata
 * - Styled data table with conditional formatting for performance groups
 * - Performance classification legend footer
 * - Signature placeholders
 * - Print-optimised page setup (A4 landscape, margins, headers/footers)
 *
 * WHY ExcelJS over SheetJS (xlsx):
 *   SheetJS community edition cannot apply cell styles (fonts, borders, fills,
 *   images). ExcelJS is already in package.json at v4.4.0 and provides full
 *   styling + image support needed for print-quality branded reports.
 */

import ExcelJS from 'exceljs'
import { addBrandLogo, LOGO_PLACEMENT } from '@/lib/excel/brand-logo'

// ─── Branding Constants ─────────────────────────────────────────────────────
const BRAND = {
  name: 'EVERSHINE ACADEMY',
  slogan: '"We Make your Children More Valueable"',
  address: 'Madina Town near Mandiala Warraich Road, Near to Labor Gulshan Colony',
  contacts: 'Boys: 0328-4010522 · Girls: 0324-8985526',
} as const

// ─── Color Palette (aligned with Tailwind classes used in the UI) ───────────
const COLORS = {
  brandPrimary: '1E3A8A',    // indigo-900
  brandAccent: '4338CA',     // indigo-700
  headerBg: '1E293B',        // slate-800
  headerText: 'FFFFFF',
  rowEven: 'F8FAFC',         // slate-50
  rowOdd: 'FFFFFF',
  borderLight: 'CBD5E1',     // slate-300
  borderDark: '94A3B8',      // slate-400
  everShine: 'FEF3C7',       // amber-100
  everShineText: '78350F',   // amber-900
  quaid: 'DBEAFE',           // blue-100
  quaidText: '1E3A8A',       // blue-900
  iqbal: 'DCFCE7',           // green-100
  iqbalText: '14532D',       // green-900
  improvement: 'FFE4E6',     // rose-100
  improvementText: '881337', // rose-900
  footerBg: 'F1F5F9',        // slate-100
} as const

// ─── Types ──────────────────────────────────────────────────────────────────
export interface MonitoringSubject {
  id: string
  name: string
  code: string
}

export interface MonitoringStudentRow {
  serial: number
  studentId: string
  name: string
  fatherName: string | null
  rollNumber: string
  subjectScores: Record<string, number>
  totalMarks: number
  obtainedMarks: number
  percentage: number
  performanceBatch: string
  rank: number
}

export interface MonitoringReportConfig {
  type: 'daily' | 'monthly'
  classSectionLabel: string
  dateLabel: string
  academicYear: string
  teacherName: string
  subjects: MonitoringSubject[]
  students: MonitoringStudentRow[]
}

// ─── Batch → Color Mapping ──────────────────────────────────────────────────
function getBatchFill(batch: string): { bg: string; text: string } {
  switch (batch) {
    case 'Ever Shine':
      return { bg: COLORS.everShine, text: COLORS.everShineText }
    case 'Quaid':
      return { bg: COLORS.quaid, text: COLORS.quaidText }
    case 'Iqbal':
      return { bg: COLORS.iqbal, text: COLORS.iqbalText }
    case 'Improvement':
      return { bg: COLORS.improvement, text: COLORS.improvementText }
    default:
      return { bg: COLORS.rowOdd, text: '000000' }
  }
}

// ─── Thin Border Helper ─────────────────────────────────────────────────────
function thinBorder(color: string = COLORS.borderLight): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: color } }
  return { top: side, bottom: side, left: side, right: side }
}

// ─── Main Export Function ───────────────────────────────────────────────────
export async function downloadMonitoringExcel(config: MonitoringReportConfig): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Evershine Academy LMS'
  wb.created = new Date()

  const sheetName = config.type === 'daily' ? 'Daily Report' : 'Monthly Report'
  const ws = wb.addWorksheet(sheetName, {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0, // auto height
      horizontalCentered: true,
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.3,
        footer: 0.3,
      },
    },
    headerFooter: {
      oddFooter: '&L&8Evershine Academy LMS&C&8Page &P of &N&R&8Generated: &D',
    },
  })

  // ── Column Setup ──────────────────────────────────────────────────────────
  // Columns: Logo placeholder | S.No | Roll No | Student Name | Father Name | [subjects...] | Total | Obtained | % | Group | Rank
  const subjectCount = config.subjects.length
  const fixedColCount = 4 // S.No, Roll, Name, Father (before subjects)
  const trailingColCount = 5 // Total, Obtained, %, Group, Rank
  const totalCols = fixedColCount + subjectCount + trailingColCount

  const columns: Partial<ExcelJS.Column>[] = [
    { width: 6 },  // S.No
    { width: 12 }, // Roll No
    { width: 26 }, // Student Name
    { width: 22 }, // Father Name
  ]
  // Subject columns
  for (let i = 0; i < subjectCount; i++) {
    columns.push({ width: 12 })
  }
  // Trailing columns
  columns.push(
    { width: 10 }, // Total Marks
    { width: 12 }, // Obtained
    { width: 10 }, // %
    { width: 18 }, // Group
    { width: 8 },  // Rank
  )

  // ExcelJS requires at least 1 column — set widths via column property
  columns.forEach((colDef, idx) => {
    const col = ws.getColumn(idx + 1)
    col.width = colDef.width
  })

  // ── Logo Embedding (via shared brand-logo utility) ────────────────────────
  const logoImageId = await addBrandLogo(wb)

  // ── Row Tracker ───────────────────────────────────────────────────────────
  let currentRow = 1

  // ── BRANDING HEADER BLOCK (rows 1-6) ──────────────────────────────────────

  // Row 1: Academy Name (merged from col 3 onward to leave space for logo)
  // WHY col 3: Logo occupies cols 1-2 with proper aspect ratio (180×60).
  // Starting name text at col 3 prevents overlap with the logo image.
  ws.mergeCells(currentRow, 3, currentRow, totalCols)
  const nameCell = ws.getCell(currentRow, 3)
  nameCell.value = BRAND.name
  nameCell.font = { name: 'Calibri', size: 22, bold: true, color: { argb: COLORS.brandPrimary } }
  nameCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(currentRow).height = 45
  currentRow++

  // Row 2: Slogan
  ws.mergeCells(currentRow, 1, currentRow, totalCols)
  const sloganCell = ws.getCell(currentRow, 1)
  sloganCell.value = BRAND.slogan
  sloganCell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: COLORS.brandAccent } }
  sloganCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(currentRow).height = 20
  currentRow++

  // Row 3: Address & Contacts
  ws.mergeCells(currentRow, 1, currentRow, totalCols)
  const addressCell = ws.getCell(currentRow, 1)
  addressCell.value = `${BRAND.address}  |  ${BRAND.contacts}`
  addressCell.font = { name: 'Calibri', size: 9, color: { argb: '64748B' } }
  addressCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(currentRow).height = 18
  currentRow++

  // Row 4: Divider (thin bottom border on merged row)
  ws.mergeCells(currentRow, 1, currentRow, totalCols)
  const dividerCell = ws.getCell(currentRow, 1)
  dividerCell.border = { bottom: { style: 'medium', color: { argb: COLORS.brandPrimary } } }
  ws.getRow(currentRow).height = 6
  currentRow++

  // Row 5: Report Title
  ws.mergeCells(currentRow, 1, currentRow, totalCols)
  const titleCell = ws.getCell(currentRow, 1)
  titleCell.value = config.type === 'daily'
    ? 'DAILY STUDENT PERFORMANCE MONITORING SHEET'
    : 'MONTHLY STUDENT PERFORMANCE MONITORING SHEET'
  titleCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: COLORS.headerBg } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getRow(currentRow).height = 28
  currentRow++

  // Row 6: Metadata grid (Class | Date | Teacher | Academic Year)
  const metaLeft = `Class: ${config.classSectionLabel}    |    ${config.type === 'daily' ? 'Date' : 'Period'}: ${config.dateLabel}`
  const metaRight = `Teacher: ${config.teacherName}    |    Academic Year: ${config.academicYear}`

  // Split into two halves
  const midCol = Math.ceil(totalCols / 2)
  ws.mergeCells(currentRow, 1, currentRow, midCol)
  const metaLeftCell = ws.getCell(currentRow, 1)
  metaLeftCell.value = metaLeft
  metaLeftCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '334155' } }
  metaLeftCell.alignment = { horizontal: 'left', vertical: 'middle' }

  ws.mergeCells(currentRow, midCol + 1, currentRow, totalCols)
  const metaRightCell = ws.getCell(currentRow, midCol + 1)
  metaRightCell.value = metaRight
  metaRightCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '334155' } }
  metaRightCell.alignment = { horizontal: 'right', vertical: 'middle' }

  ws.getRow(currentRow).height = 22
  currentRow++

  // Row 7: Spacer
  ws.getRow(currentRow).height = 6
  currentRow++

  // ── Add Logo (overlaid on top-left of branding block) ─────────────────────
  // WHY 75×75: The official academy logo (bglogo.png) is a square crest
  // with shield, laurels, and motto. Square dimensions preserve aspect ratio.
  if (logoImageId !== null) {
    ws.addImage(logoImageId, {
      tl: { col: 0, row: 0 },
      ext: LOGO_PLACEMENT.crest,
    })
  }

  // ── DATA TABLE HEADER ROW ─────────────────────────────────────────────────
  const headerRow = currentRow
  const headers: string[] = [
    'S.No',
    'Roll No',
    'Student Name',
    "Father's Name",
    ...config.subjects.map((s) => s.name),
    'Total Marks',
    'Obt. Marks',
    '%',
    'Group / Batch',
    'Rank',
  ]

  const row = ws.getRow(headerRow)
  row.height = 24
  headers.forEach((h, idx) => {
    const cell = row.getCell(idx + 1)
    cell.value = h
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.headerText } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder(COLORS.borderDark)
  })
  currentRow++

  // ── DATA ROWS ─────────────────────────────────────────────────────────────
  config.students.forEach((student, idx) => {
    const dataRow = ws.getRow(currentRow)
    dataRow.height = 20
    const isEven = idx % 2 === 0
    const bgColor = isEven ? COLORS.rowEven : COLORS.rowOdd

    const values: (string | number)[] = [
      student.serial,
      student.rollNumber,
      student.name,
      student.fatherName ?? '—',
      ...config.subjects.map((s) => student.subjectScores[s.id] ?? 0),
      student.totalMarks,
      student.obtainedMarks,
      `${student.percentage}%`,
      student.performanceBatch,
      student.rank,
    ]

    values.forEach((val, colIdx) => {
      const cell = dataRow.getCell(colIdx + 1)
      cell.value = val
      cell.font = { name: 'Calibri', size: 10, color: { argb: '1E293B' } }
      cell.alignment = {
        horizontal: colIdx <= 1 || colIdx >= values.length - 2 ? 'center' : (colIdx <= 3 ? 'left' : 'center'),
        vertical: 'middle',
      }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } }
      cell.border = thinBorder()

      // Bold student name
      if (colIdx === 2) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: '0F172A' } }
      }

      // Bold percentage
      if (colIdx === values.length - 3) {
        cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.brandPrimary } }
      }

      // Color-code the Group/Batch column
      if (colIdx === values.length - 2) {
        const { bg, text } = getBatchFill(String(val))
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } }
        cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: text } }
      }

      // Bold rank
      if (colIdx === values.length - 1) {
        cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.brandPrimary } }
      }
    })

    currentRow++
  })

  // ── Spacer ────────────────────────────────────────────────────────────────
  currentRow++

  // ── PERFORMANCE CLASSIFICATION LEGEND ─────────────────────────────────────
  ws.mergeCells(currentRow, 1, currentRow, totalCols)
  const legendTitle = ws.getCell(currentRow, 1)
  legendTitle.value = 'PERFORMANCE CLASSIFICATION SCALE'
  legendTitle.font = { name: 'Calibri', size: 10, bold: true, color: { argb: COLORS.headerBg } }
  legendTitle.alignment = { horizontal: 'left', vertical: 'middle' }
  legendTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.footerBg } }
  legendTitle.border = thinBorder()
  ws.getRow(currentRow).height = 22
  currentRow++

  const legendItems = [
    { label: 'Ever Shine Group', range: '90% – 100%', ...getBatchFill('Ever Shine') },
    { label: 'Quaid Group', range: '75% – 89%', ...getBatchFill('Quaid') },
    { label: 'Iqbal Group', range: '50% – 74%', ...getBatchFill('Iqbal') },
    { label: 'Improvement Group', range: 'Below 50%', ...getBatchFill('Improvement') },
  ]

  legendItems.forEach((item) => {
    const legendRow = ws.getRow(currentRow)
    legendRow.height = 18

    // Label cell (columns 1-3)
    ws.mergeCells(currentRow, 1, currentRow, 3)
    const labelCell = legendRow.getCell(1)
    labelCell.value = `  ● ${item.label}`
    labelCell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: item.text } }
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } }
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' }
    labelCell.border = thinBorder()

    // Range cell (columns 4-5)
    ws.mergeCells(currentRow, 4, currentRow, 5)
    const rangeCell = legendRow.getCell(4)
    rangeCell.value = item.range
    rangeCell.font = { name: 'Calibri', size: 9, color: { argb: '475569' } }
    rangeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: item.bg } }
    rangeCell.alignment = { horizontal: 'left', vertical: 'middle' }
    rangeCell.border = thinBorder()

    currentRow++
  })

  // ── Spacer ────────────────────────────────────────────────────────────────
  currentRow += 2

  // ── SIGNATURE BLOCK ───────────────────────────────────────────────────────
  // Class Teacher Signature (left side)
  ws.mergeCells(currentRow, 1, currentRow, 4)
  const teacherSigCell = ws.getCell(currentRow, 1)
  teacherSigCell.value = '______________________________'
  teacherSigCell.alignment = { horizontal: 'center', vertical: 'bottom' }
  teacherSigCell.font = { name: 'Calibri', size: 10, color: { argb: '64748B' } }

  // Principal Signature (right side)
  const rightStart = totalCols - 3
  ws.mergeCells(currentRow, rightStart, currentRow, totalCols)
  const principalSigCell = ws.getCell(currentRow, rightStart)
  principalSigCell.value = '______________________________'
  principalSigCell.alignment = { horizontal: 'center', vertical: 'bottom' }
  principalSigCell.font = { name: 'Calibri', size: 10, color: { argb: '64748B' } }
  ws.getRow(currentRow).height = 24
  currentRow++

  // Signature labels
  ws.mergeCells(currentRow, 1, currentRow, 4)
  const teacherLabel = ws.getCell(currentRow, 1)
  teacherLabel.value = 'Class Teacher Signature'
  teacherLabel.alignment = { horizontal: 'center', vertical: 'top' }
  teacherLabel.font = { name: 'Calibri', size: 8, bold: true, color: { argb: '64748B' } }

  ws.mergeCells(currentRow, rightStart, currentRow, totalCols)
  const principalLabel = ws.getCell(currentRow, rightStart)
  principalLabel.value = 'Principal Signature'
  principalLabel.alignment = { horizontal: 'center', vertical: 'top' }
  principalLabel.font = { name: 'Calibri', size: 8, bold: true, color: { argb: '64748B' } }

  currentRow += 2

  // ── Electronic verification footer ────────────────────────────────────────
  ws.mergeCells(currentRow, 1, currentRow, totalCols)
  const footerCell = ws.getCell(currentRow, 1)
  footerCell.value = '✓ This report is electronically generated by Evershine Academy LMS. For verification, contact the administration.'
  footerCell.font = { name: 'Calibri', size: 8, italic: true, color: { argb: '94A3B8' } }
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Set Print Area ────────────────────────────────────────────────────────
  // WHY helper: For columns beyond Z (e.g. AA, AB), a single charCode won't work.
  function colLetter(n: number): string {
    let s = ''
    while (n > 0) {
      const rem = (n - 1) % 26
      s = String.fromCharCode(65 + rem) + s
      n = Math.floor((n - 1) / 26)
    }
    return s
  }
  ws.pageSetup.printArea = `A1:${colLetter(totalCols)}${currentRow}`

  // ── Freeze header row ─────────────────────────────────────────────────────
  ws.views = [{ state: 'frozen', ySplit: headerRow, xSplit: 0 }]

  // ── Generate & Download ───────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const timestamp = new Date().toISOString().split('T')[0]
  const safeSection = config.classSectionLabel.replace(/\s+/g, '_')
  const filename = `Evershine_${config.type}_monitoring_${safeSection}_${timestamp}.xlsx`

  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.click()
  URL.revokeObjectURL(link.href)
}
