/**
 * Fee Lists Excel Builders (Paid & Defaulters)
 */

import ExcelJS from 'exceljs'
import type { Class, FeeInvoice, FeePayment, Student } from '@prisma/client'
import { effectivePaidAmount } from '@/lib/fees/reporting'

// ─── Shared Styling Helper ───────────────────────────────────────────────────

function applyBranding(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  columnsCount: number,
  headerRowIndex: number
) {
  const lastColLetter = sheet.getColumn(columnsCount).letter

  // Title
  sheet.mergeCells(`A1:${lastColLetter}1`)
  const titleCell = sheet.getCell('A1')
  titleCell.value = title
  titleCell.font = { size: 16, bold: true, color: { argb: 'FFFFFFFF' } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } } // Teal 600
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' }
  sheet.getRow(1).height = 30

  // Subtitle
  sheet.mergeCells(`A2:${lastColLetter}2`)
  const subtitleCell = sheet.getCell('A2')
  subtitleCell.value = subtitle
  subtitleCell.font = { italic: true, color: { argb: 'FF475569' } }
  subtitleCell.alignment = { horizontal: 'center' }

  // Header Row
  const headerRow = sheet.getRow(headerRowIndex)
  headerRow.font = { bold: true }
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }
    cell.border = { bottom: { style: 'thin' } }
  })
}

// ─── Paid List ────────────────────────────────────────────────────────────────

type CampusSummary = { name: string }

type InvoiceWithPayments = FeeInvoice & {
  student: Student & { class: Class | null; campus: CampusSummary | null }
  payments: FeePayment[]
}

export async function buildPaidListReport(
  invoices: InvoiceWithPayments[],
  month?: string
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'EverShine Academy'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Paid Fees')

  sheet.columns = [
    { key: 'regNo', width: 18 },
    { key: 'name', width: 28 },
    { key: 'father', width: 24 },
    { key: 'campus', width: 24 },
    { key: 'className', width: 18 },
    { key: 'section', width: 16 },
    { key: 'month', width: 15 },
    { key: 'amountPaid', width: 20 },
    { key: 'paymentDate', width: 16 },
    { key: 'method', width: 15 },
    { key: 'challan', width: 20 },
  ]

  applyBranding(
    sheet,
    'EverShine Academy — Paid Fees Report',
    month ? `Month: ${month}` : 'All-Time Paid Invoices',
    sheet.columns.length,
    4
  )

  sheet.getRow(4).values = [
    'Reg No', 'Student Name', 'Father Name', 'Campus', 'Class', 'Section', 'Month',
    'Amount Paid (PKR)', 'Payment Date', 'Method', 'Challan No'
  ]

  for (const inv of invoices) {
    const completedPayments = inv.payments.filter((payment) => payment.status === 'COMPLETED')
    const lastPayment = completedPayments[0] // Ordered by payment date desc by the route

    const row = sheet.addRow({
      regNo: inv.student.registrationNumber,
      name: `${inv.student.firstName} ${inv.student.lastName}`,
      father: inv.student.fatherName,
      campus: inv.student.campus?.name || 'N/A',
      className: inv.student.class?.name || 'N/A',
      section: inv.student.section || 'N/A',
      month: inv.month,
      amountPaid: effectivePaidAmount(inv.paidAmount, inv.payments),
      paymentDate: lastPayment ? lastPayment.paymentDate.toISOString().split('T')[0] : 'N/A',
      method: lastPayment ? lastPayment.paymentMethod : 'N/A',
      challan: inv.challanNumber,
    })

    row.getCell('amountPaid').numFmt = '"PKR "#,##0.00'
    row.eachCell((cell) => { cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } } })
  }

  return workbook
}

// ─── Defaulter List ───────────────────────────────────────────────────────────

type DefaulterStudent = Omit<Student, 'dueAmount'> & {
  campus: CampusSummary | null
  class: Class | null
  dueAmount: number | Student['dueAmount']
  invoices: FeeInvoice[]
}

export async function buildDefaulterListReport(
  students: DefaulterStudent[]
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'EverShine Academy'
  workbook.created = new Date()

  const sheet = workbook.addWorksheet('Defaulters')

  sheet.columns = [
    { key: 'regNo', width: 18 },
    { key: 'name', width: 28 },
    { key: 'father', width: 24 },
    { key: 'campus', width: 24 },
    { key: 'className', width: 18 },
    { key: 'section', width: 16 },
    { key: 'contact', width: 16 },
    { key: 'dueAmount', width: 20 },
    { key: 'challan', width: 20 },
  ]

  applyBranding(
    sheet,
    'EverShine Academy — Fee Defaulters',
    'Students with outstanding dues',
    sheet.columns.length,
    4
  )

  sheet.getRow(4).values = [
    'Reg No', 'Student Name', 'Father Name', 'Campus', 'Class', 'Section', 'Contact',
    'Due Amount (PKR)', 'Last Challan'
  ]

  for (const student of students) {
    const lastInvoice = student.invoices[0] // Assuming ordered by createdAt desc

    const row = sheet.addRow({
      regNo: student.registrationNumber,
      name: `${student.firstName} ${student.lastName}`,
      father: student.fatherName,
      campus: student.campus?.name || 'N/A',
      className: student.class?.name || 'N/A',
      section: student.section || 'N/A',
      contact: student.emergencyContact || student.phoneNumber || 'N/A',
      dueAmount: Number(student.dueAmount),
      challan: lastInvoice ? lastInvoice.challanNumber : 'N/A',
    })

    row.getCell('dueAmount').numFmt = '"PKR "#,##0.00'
    row.eachCell((cell) => { cell.border = { bottom: { style: 'hair', color: { argb: 'FFE2E8F0' } } } })
  }

  return workbook
}
