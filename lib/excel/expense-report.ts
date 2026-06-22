/**
 * Expense Report Excel Builder
 */

import ExcelJS from 'exceljs'
import { Expense } from '@prisma/client'

type ExpenseWithAccountant = Expense & {
  accountant: { firstName: string; lastName: string }
  campus: { name: string }
}

export async function buildExpenseReport(
  expenses: ExpenseWithAccountant[],
  filters: { start?: string; end?: string; category?: string }
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Evershaheen Academy'
  workbook.lastModifiedBy = 'Account Manager'
  workbook.created = new Date()

  const periodLabel = filters.start && filters.end 
    ? `Period: ${filters.start} to ${filters.end}` 
    : 'All-Time Record'

  // ─── Sheet 1: Summary ────────────────────────────────────────────────────────
  
  const summarySheet = workbook.addWorksheet('Summary')
  summarySheet.columns = [
    { header: '', key: 'category', width: 35 },
    { header: '', key: 'amount', width: 25 },
  ]

  // Branding Headers
  summarySheet.mergeCells('A1:B1')
  const titleCell = summarySheet.getCell('A1')
  titleCell.value = 'Evershaheen Academy — Expense Summary'
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } } // Teal 600
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  summarySheet.getRow(1).height = 30

  summarySheet.mergeCells('A2:B2')
  const subtitleCell = summarySheet.getCell('A2')
  subtitleCell.value = periodLabel
  subtitleCell.font = { italic: true, color: { argb: 'FF475569' } }
  subtitleCell.alignment = { horizontal: 'center' }

  // Header Row
  summarySheet.addRow({ category: 'Category', amount: 'Total Amount (PKR)' })
  const headerRow = summarySheet.getRow(4)
  headerRow.font = { bold: true }
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    cell.border = { bottom: { style: 'thin' } }
  })

  // Data
  const categoryTotals: Record<string, number> = {}
  let grandTotal = 0

  for (const exp of expenses) {
    const amt = Number(exp.amount)
    categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + amt
    grandTotal += amt
  }

  let currentRow = 5
  for (const [cat, total] of Object.entries(categoryTotals)) {
    const row = summarySheet.addRow({ category: cat, amount: total })
    row.getCell('amount').numFmt = '"PKR "#,##0.00'
    row.eachCell(cell => { cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } } })
    currentRow++
  }

  // Grand Total
  summarySheet.addRow({})
  const totalRow = summarySheet.addRow({ category: 'GRAND TOTAL', amount: grandTotal })
  totalRow.font = { bold: true, size: 12 }
  totalRow.getCell('amount').numFmt = '"PKR "#,##0.00'
  totalRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
  })

  // ─── Sheet 2: Detail ─────────────────────────────────────────────────────────

  const detailSheet = workbook.addWorksheet('Details')
  detailSheet.columns = [
    { key: 'date', width: 15 },
    { key: 'title', width: 35 },
    { key: 'category', width: 20 },
    { key: 'campus', width: 25 },
    { key: 'amount', width: 15 },
    { key: 'paymentMethod', width: 18 },
    { key: 'paymentReference', width: 22 },
    { key: 'recordedBy', width: 25 },
    { key: 'status', width: 15 },
    { key: 'notes', width: 40 },
  ]

  // Branding Headers
  detailSheet.mergeCells('A1:G1')
  const detailTitle = detailSheet.getCell('A1')
  detailTitle.value = 'Evershaheen Academy — Expense Ledger'
  detailTitle.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  detailTitle.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }
  detailTitle.alignment = { vertical: 'middle', horizontal: 'center' }
  detailSheet.getRow(1).height = 30

  detailSheet.mergeCells('A2:G2')
  const detailSubtitle = detailSheet.getCell('A2')
  detailSubtitle.value = periodLabel
  detailSubtitle.font = { italic: true, color: { argb: 'FF475569' } }
  detailSubtitle.alignment = { horizontal: 'center' }

  // Header Row
  detailSheet.addRow({
    date: 'Date', title: 'Title', category: 'Category', campus: 'Campus', amount: 'Amount',
    paymentMethod: 'Payment Method', paymentReference: 'Payment Reference',
    recordedBy: 'Recorded By', status: 'Status', notes: 'Notes'
  })
  const dHeaderRow = detailSheet.getRow(4)
  dHeaderRow.font = { bold: true }
  dHeaderRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    cell.border = { bottom: { style: 'thin' } }
  })

  // Data
  for (const exp of expenses) {
    const row = detailSheet.addRow({
      date: exp.date.toISOString().split('T')[0],
      title: exp.title,
      category: exp.category,
      campus: exp.campus?.name || exp.campusId,
      amount: Number(exp.amount),
      paymentMethod: exp.paymentSource || '',
      paymentReference: exp.paymentReference || '',
      recordedBy: `${exp.accountant.firstName} ${exp.accountant.lastName}`,
      status: exp.isApproved ? 'Approved' : 'Pending',
      notes: exp.notes || '',
    })
    row.getCell('amount').numFmt = '"PKR "#,##0.00'
    row.eachCell(cell => { cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } } })
  }

  return workbook
}
