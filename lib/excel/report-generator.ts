/**
 * Branded Excel Report Generator — Evershaheen Academy
 *
 * WHY: Server-side .xlsx generation using ExcelJS, shared by all export endpoints.
 * Every exported workbook is professionally branded with:
 * - Academy header row (navy, bold 16pt)
 * - Report title + generation timestamp
 * - Styled column headers with auto-filter and frozen row
 * - Zebra-striped data rows
 * - Conditional status formatting (color-coded cells)
 * - Auto-calculated column widths
 * - Print area and landscape orientation
 *
 * TRADEOFF: ExcelJS adds ~2 MB to the server bundle. Justified because
 * CSV exports lack formatting, are unusable in Pakistani admin contexts
 * where non-technical staff expect styled Excel reports.
 */

import ExcelJS from 'exceljs'
import { addBrandLogo, LOGO_PLACEMENT } from '@/lib/excel/brand-logo'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ColumnDef {
  header: string
  key: string
  width?: number
  style?: Partial<ExcelJS.Style>
  // WHY: Forces text format for phone/CNIC columns that Excel auto-converts to numbers
  forceText?: boolean
}

interface BrandedWorkbookOptions {
  title: string          // e.g. "Visitor Inquiries Report"
  subtitle?: string      // e.g. "Status: ALL | Date: Jun 2026"
  sheetName: string      // e.g. "Inquiries"
  columns: ColumnDef[]
  rows: Record<string, unknown>[]
  statusColumn?: string  // column key for conditional formatting
  summaryRow?: Record<string, string | number>  // footer summary
}

// ── Brand Constants ──────────────────────────────────────────────────────────

const NAVY = '1B4F8A'
const GOLD = 'F5A623'
const WHITE = 'FFFFFF'
const LIGHT_GREY = 'F5F5F5'
const HEADER_FONT: Partial<ExcelJS.Font> = {
  name: 'Calibri',
  size: 16,
  bold: true,
  color: { argb: WHITE },
}

// WHY: Status-specific colors match the dashboard badge colors for visual consistency.
const STATUS_COLORS: Record<string, string> = {
  // Amber — awaiting action
  PENDING: 'FEF3C7',
  NEW: 'FEF3C7',
  // Green — completed/approved
  APPROVED: 'DCFCE7',
  RESOLVED: 'DCFCE7',
  // Red — rejected/spam
  DECLINED: 'FEE2E2',
  SPAM: 'FEE2E2',
  // Blue — in progress
  UNDER_REVIEW: 'DBEAFE',
  SEEN: 'DBEAFE',
  INTERVIEW_SCHEDULED: 'DBEAFE',
  REPLIED: 'DBEAFE',
  // Grey — paused
  ON_HOLD: 'F3F4F6',
}

// ── Main Generator ───────────────────────────────────────────────────────────

export async function createBrandedWorkbook(
  options: BrandedWorkbookOptions
): Promise<ExcelJS.Workbook> {
  const { title, subtitle, sheetName, columns, rows, statusColumn, summaryRow } = options

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Evershaheen Academy LMS'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9, // A4
      margins: {
        left: 0.4,
        right: 0.4,
        top: 0.5,
        bottom: 0.5,
        header: 0.3,
        footer: 0.3,
      },
    },
  })

  const totalCols = columns.length

  // ── Row 1: Academy branding header ──────────────────────────────────────

  sheet.mergeCells(1, 1, 1, totalCols)
  const brandCell = sheet.getCell(1, 1)
  brandCell.value = 'EVERSHAHEEN ACADEMY'
  brandCell.font = HEADER_FONT
  brandCell.alignment = { horizontal: 'center', vertical: 'middle' }
  brandCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: NAVY },
  }
  sheet.getRow(1).height = 36

  // ── Logo Embedding (via shared brand-logo utility) ─────────────────────
  const logoImageId = await addBrandLogo(workbook)
  if (logoImageId !== null) {
    sheet.addImage(logoImageId, {
      tl: { col: 0, row: 0 },
      ext: LOGO_PLACEMENT.crest,
    })
  }

  // ── Row 2: Report title + timestamp ─────────────────────────────────────

  sheet.mergeCells(2, 1, 2, totalCols)
  const titleCell = sheet.getCell(2, 1)
  const now = new Date()
  const timestamp = now.toLocaleDateString('en-PK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  titleCell.value = `${title}${subtitle ? ` — ${subtitle}` : ''} | Generated: ${timestamp}`
  titleCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: NAVY } }
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'F0F4F8' },
  }
  sheet.getRow(2).height = 22

  // ── Row 3: Empty separator ──────────────────────────────────────────────

  sheet.getRow(3).height = 8

  // ── Row 4: Column headers ──────────────────────────────────────────────

  const headerRow = sheet.getRow(4)
  columns.forEach((col, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = col.header
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: NAVY },
    }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = {
      bottom: { style: 'thin', color: { argb: GOLD } },
    }
  })
  headerRow.height = 24

  // Freeze rows above data (header rows + column headers)
  sheet.views = [{ state: 'frozen', ySplit: 4, xSplit: 0 }]

  // Auto-filter on header row
  sheet.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: totalCols },
  }

  // ── Data rows ──────────────────────────────────────────────────────────

  rows.forEach((row, rowIdx) => {
    const excelRow = sheet.getRow(5 + rowIdx)
    const isOdd = rowIdx % 2 === 1

    columns.forEach((col, colIdx) => {
      const cell = excelRow.getCell(colIdx + 1)
      const value = row[col.key]

      // Format phone/CNIC as text to prevent Excel number conversion
      if (col.forceText && value != null) {
        cell.value = String(value)
        cell.numFmt = '@' // text format
      } else if (value instanceof Date) {
        cell.value = value
        cell.numFmt = 'DD-MMM-YYYY hh:mm AM/PM'
      } else {
        cell.value = value as ExcelJS.CellValue
      }

      cell.font = { name: 'Calibri', size: 9 }
      cell.alignment = { vertical: 'middle', wrapText: col.key === 'message' || col.key === 'address' || col.key === 'adminNotes' }

      // Zebra striping
      if (isOdd) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: LIGHT_GREY },
        }
      }

      // Conditional status formatting
      if (statusColumn && col.key === statusColumn && typeof value === 'string') {
        const statusColor = STATUS_COLORS[value]
        if (statusColor) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: statusColor },
          }
          cell.font = { name: 'Calibri', size: 9, bold: true }
        }
      }

      // Apply column-specific styles
      if (col.style) {
        Object.assign(cell, col.style)
      }
    })

    excelRow.height = 18
  })

  // ── Summary / Footer row ──────────────────────────────────────────────

  if (summaryRow) {
    const footerRowIdx = 5 + rows.length + 1 // one blank row gap
    const footerRow = sheet.getRow(footerRowIdx)
    columns.forEach((col, colIdx) => {
      const cell = footerRow.getCell(colIdx + 1)
      const val = summaryRow[col.key]
      if (val !== undefined) {
        cell.value = val as ExcelJS.CellValue
      }
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: NAVY } }
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'E8ECF0' },
      }
      cell.border = {
        top: { style: 'double', color: { argb: NAVY } },
      }
    })
    footerRow.height = 22
  }

  // ── Column widths (auto-calculate) ─────────────────────────────────────

  columns.forEach((col, idx) => {
    const sheetCol = sheet.getColumn(idx + 1)

    if (col.width) {
      sheetCol.width = col.width
    } else {
      // Calculate from header + longest data value, capped at 50
      let maxLen = col.header.length
      for (const row of rows) {
        const val = row[col.key]
        if (val != null) {
          const len = String(val).length
          if (len > maxLen) maxLen = len
        }
      }
      sheetCol.width = Math.min(maxLen + 4, 50)
    }
  })

  return workbook
}

// ── Helper: Workbook → Buffer for API response ───────────────────────────────

export async function workbookToBuffer(workbook: ExcelJS.Workbook): Promise<Buffer> {
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

// ── Helper: Generate download filename with date ─────────────────────────────

export function generateExcelFilename(prefix: string): string {
  const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return `evershaheen_${prefix}_${date}.xlsx`
}
