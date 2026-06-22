/**
 * Profit & Loss Excel Builder
 */

import ExcelJS from 'exceljs'
import { ProfitLossStatement } from '@prisma/client'

type ProfitLossStatementWithReserve = ProfitLossStatement & {
  reserveEntry?: { cumulativeTotal: number | string | bigint | { toNumber(): number } } | null
  campus?: { name: string } | null
}

export async function buildProfitLossReport(
  statements: ProfitLossStatementWithReserve[],
  filters: { campusLabel?: string; year?: number }
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Evershaheen Academy'
  workbook.lastModifiedBy = 'Account Manager'
  workbook.created = new Date()

  const filterLabel = [
    filters.campusLabel ? `Campus: ${filters.campusLabel}` : 'Campus: All',
    filters.year ? `Year: ${filters.year}` : 'Year: All',
  ].join(' | ')

  const summarySheet = workbook.addWorksheet('P&L Summary')
  summarySheet.columns = [
    { header: '', key: 'label', width: 35 },
    { header: '', key: 'value', width: 30 },
  ]

  summarySheet.mergeCells('A1:B1')
  const titleCell = summarySheet.getCell('A1')
  titleCell.value = 'Evershaheen Academy — Profit & Loss Analysis'
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  summarySheet.getRow(1).height = 30

  summarySheet.mergeCells('A2:B2')
  const subtitleCell = summarySheet.getCell('A2')
  subtitleCell.value = filterLabel
  subtitleCell.font = { italic: true, color: { argb: 'FF475569' } }
  subtitleCell.alignment = { horizontal: 'center' }

  summarySheet.addRow({ label: 'Total statements included', value: statements.length })
  summarySheet.addRow({ label: 'Total income across statements', value: statements.reduce((sum, stmt) => sum + Number(stmt.totalIncome), 0) })
  summarySheet.addRow({ label: 'Total expenses across statements', value: statements.reduce((sum, stmt) => sum + Number(stmt.totalExpenses), 0) })
  summarySheet.addRow({ label: 'Total gross margin', value: statements.reduce((sum, stmt) => sum + Number(stmt.grossMargin), 0) })
  summarySheet.addRow({ label: 'Total reserve contributions', value: statements.reduce((sum, stmt) => sum + Number(stmt.reserveContribution), 0) })
  summarySheet.addRow({ label: 'Current accounting date', value: new Date().toISOString().split('T')[0] })

  summarySheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    row.eachCell((cell, colNumber) => {
      cell.alignment = { vertical: 'middle', horizontal: colNumber === 1 ? 'left' : 'right' }
      if (rowNumber > 2) {
        if (colNumber === 2 && typeof cell.value === 'number') {
          cell.numFmt = '"PKR "#,##0.00'
        }
      }
    })
  })

  const detailSheet = workbook.addWorksheet('P&L Details')
  detailSheet.columns = [
    { header: 'Period', key: 'period', width: 25 },
    { header: 'Campus', key: 'campus', width: 20 },
    { header: 'Income', key: 'totalIncome', width: 18 },
    { header: 'Expenses', key: 'totalExpenses', width: 18 },
    { header: 'Gross Margin', key: 'grossMargin', width: 18 },
    { header: 'Profit %', key: 'profitPercentage', width: 14 },
    { header: 'SuperAdmin Allocation', key: 'superAdminAllocation', width: 22 },
    { header: 'Monthly Draw', key: 'superAdminMonthlyDraw', width: 20 },
    { header: 'Reserve Contribution', key: 'reserveContribution', width: 22 },
    { header: 'Remaining Amount', key: 'remainingAmount', width: 20 },
    { header: 'Reserve Fund Total', key: 'reserveTotal', width: 22 },
    { header: 'Generated At', key: 'createdAt', width: 20 },
    { header: 'Notes', key: 'notes', width: 35 },
  ]

  const headerRow = detailSheet.addRow({
    period: 'Period',
    campus: 'Campus',
    totalIncome: 'Income',
    totalExpenses: 'Expenses',
    grossMargin: 'Gross Margin',
    profitPercentage: 'Profit %',
    superAdminAllocation: 'SuperAdmin Allocation',
    superAdminMonthlyDraw: 'Monthly Draw',
    reserveContribution: 'Reserve Contribution',
    remainingAmount: 'Remaining Amount',
    reserveTotal: 'Reserve Fund Total',
    createdAt: 'Generated At',
    notes: 'Notes',
  })
  headerRow.font = { bold: true }
  headerRow.height = 22

  for (const statement of statements) {
    const reserveTotal = Number(statement.reserveEntry?.cumulativeTotal ?? 0)
    const snapshotNotes =
      typeof statement.snapshotData === 'object' && statement.snapshotData !== null && 'notes' in statement.snapshotData
        ? String((statement.snapshotData as Record<string, unknown>).notes ?? '')
        : ''

    detailSheet.addRow({
      period: statement.periodLabel,
      campus: statement.campus?.name ?? statement.campusId ?? 'All',
      totalIncome: Number(statement.totalIncome),
      totalExpenses: Number(statement.totalExpenses),
      grossMargin: Number(statement.grossMargin),
      profitPercentage: Number(statement.profitPercentage),
      superAdminAllocation: Number(statement.superAdminAllocation),
      superAdminMonthlyDraw: Number(statement.superAdminMonthlyDraw),
      reserveContribution: Number(statement.reserveContribution),
      remainingAmount: Number(statement.remainingAmount),
      reserveTotal,
      createdAt: statement.createdAt.toISOString().split('T')[0],
      notes: snapshotNotes,
    })
  }

  for (let i = 1; i <= detailSheet.rowCount; i++) {
    const row = detailSheet.getRow(i)
    row.eachCell((cell, colNumber) => {
      if (i === 1) {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
      }
      if ([3, 4, 5, 7, 8, 9, 10, 11].includes(colNumber) && i > 1) {
        cell.numFmt = '"PKR "#,##0.00'
        cell.alignment = { horizontal: 'right' }
      }
      if ([6].includes(colNumber) && i > 1) {
        cell.alignment = { horizontal: 'right' }
      }
    })
  }

  return workbook
}
