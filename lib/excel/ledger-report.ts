/**
 * Unified Chronological Ledger Excel Builder
 */

import ExcelJS from 'exceljs'

export interface LedgerEntry {
  date: Date
  id: string
  type: string       // "OPERATIONAL_EXPENSE" | "SALARY"
  category: string   // e.g. "UTILITIES", "SALARY"
  payee: string      // Payee name / employee name
  method: string     // Cash, Bank Transfer, etc.
  reference: string  // transaction ID, account number, cheque number
  amount: number     // PKR amount
}

export async function buildLedgerReport(
  entries: LedgerEntry[],
  filters: { start?: string; end?: string; category?: string; paymentSource?: string }
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Evershaheen Academy'
  workbook.lastModifiedBy = 'Account Manager'
  workbook.created = new Date()

  const periodLabel = filters.start && filters.end 
    ? `Period: ${filters.start} to ${filters.end}` 
    : 'All-Time Unified Record'

  const sheet = workbook.addWorksheet('Unified Ledger')
  sheet.columns = [
    { key: 'date', width: 15 },
    { key: 'id', width: 25 },
    { key: 'type', width: 20 },
    { key: 'category', width: 18 },
    { key: 'payee', width: 35 },
    { key: 'method', width: 18 },
    { key: 'reference', width: 25 },
    { key: 'amount', width: 18 },
  ]

  // Branding Headers
  sheet.mergeCells('A1:H1')
  const titleCell = sheet.getCell('A1')
  titleCell.value = 'Evershaheen Academy — Unified Ledger of Expenses'
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } } // Slate 900
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getRow(1).height = 35

  sheet.mergeCells('A2:H2')
  const subtitleCell = sheet.getCell('A2')
  subtitleCell.value = `${periodLabel} ${filters.paymentSource ? `| Source: ${filters.paymentSource}` : ''}`
  subtitleCell.font = { italic: true, color: { argb: 'FF475569' } }
  subtitleCell.alignment = { horizontal: 'center' }

  // Header Row
  sheet.addRow({
    date: 'Date',
    id: 'Transaction ID',
    type: 'Entry Type',
    category: 'Category',
    payee: 'Payee / Recipient',
    method: 'Payment Method',
    reference: 'Reference',
    amount: 'Amount',
  })
  const headerRow = sheet.getRow(4)
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } } // Slate 700
    cell.border = { bottom: { style: 'thin' } }
    cell.alignment = { vertical: 'middle' }
  })
  sheet.getRow(4).height = 25

  let grandTotal = 0

  // Data
  for (const entry of entries) {
    const amountNum = Number(entry.amount)
    grandTotal += amountNum

    const row = sheet.addRow({
      date: entry.date.toISOString().split('T')[0],
      id: entry.id,
      type: entry.type === 'SALARY' ? 'Salary Slip' : 'Operational Expense',
      category: entry.category,
      payee: entry.payee,
      method: entry.method,
      reference: entry.reference || '-',
      amount: amountNum,
    })

    row.getCell('amount').numFmt = '"PKR "#,##0.00'
    row.eachCell(cell => {
      cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } }
    })
  }

  // Grand Total
  sheet.addRow({})
  const totalRow = sheet.addRow({
    payee: 'GRAND TOTAL',
    amount: grandTotal,
  })
  totalRow.font = { bold: true, size: 12 }
  totalRow.getCell('amount').numFmt = '"PKR "#,##0.00'
  totalRow.eachCell(cell => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } }
  })
  sheet.getRow(sheet.rowCount).height = 25

  return workbook
}
