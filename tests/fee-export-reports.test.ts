import { describe, expect, it } from 'vitest'
import { buildDefaulterListReport, buildPaidListReport } from '@/lib/excel/fee-lists'
import { academicMonthLabel, effectivePaidAmount, outstandingInvoiceAmount } from '@/lib/fees/reporting'

function studentContext() {
  return {
    registrationNumber: 'ESA/25/0001',
    firstName: 'Ayesha',
    lastName: 'Khan',
    fatherName: 'Imran Khan',
    emergencyContact: '0300-0000000',
    phoneNumber: '0301-0000000',
    section: 'A',
    class: { name: 'Class 10' },
    campus: { name: 'Main Campus' },
  }
}

describe('fee export reports', () => {
  it('uses completed payments and preserves the complete paid-sheet layout', async () => {
    const workbook = await buildPaidListReport([
      {
        id: 'invoice-1',
        month: 'August 2025',
        challanNumber: 'CHL-1',
        paidAmount: 900,
        student: studentContext(),
        payments: [
          { amount: 500, status: 'COMPLETED', paymentDate: new Date('2025-08-03'), paymentMethod: 'Cash' },
          { amount: 400, status: 'FAILED', paymentDate: new Date('2025-08-02'), paymentMethod: 'Online' },
        ],
      } as never,
    ], 'August 2025')

    const sheet = workbook.getWorksheet('Paid Fees')!
    const buffer = await workbook.xlsx.writeBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
    expect(sheet.columns).toHaveLength(11)
    expect(sheet.getRow(4).values).toEqual([undefined,
      'Reg No', 'Student Name', 'Father Name', 'Campus', 'Class', 'Section', 'Month',
      'Amount Paid (PKR)', 'Payment Date', 'Method', 'Challan No',
    ])
    expect(sheet.getRow(5).getCell('amountPaid').value).toBe(500)
    expect(sheet.getRow(5).getCell('method').value).toBe('Cash')
  })

  it('writes outstanding defaulters into the full-width sheet', async () => {
    const workbook = await buildDefaulterListReport([
      {
        ...studentContext(),
        dueAmount: 1250,
        invoices: [{ challanNumber: 'CHL-2' } as never],
      } as never,
    ])

    const sheet = workbook.getWorksheet('Defaulters')!
    const buffer = await workbook.xlsx.writeBuffer()
    expect(buffer.byteLength).toBeGreaterThan(0)
    expect(sheet.columns).toHaveLength(9)
    expect(sheet.getRow(4).getCell(8).value).toBe('Due Amount (PKR)')
    expect(sheet.getRow(5).getCell('dueAmount').value).toBe(1250)
    expect(sheet.getRow(5).getCell('challan').value).toBe('CHL-2')
  })

  it('calculates report balances from completed payments with safe legacy fallback', () => {
    expect(effectivePaidAmount(900, [
      { amount: 500, status: 'COMPLETED' },
      { amount: 400, status: 'FAILED' },
    ])).toBe(500)
    expect(effectivePaidAmount(900, [{ amount: 900, status: 'FAILED' }])).toBe(0)
    expect(effectivePaidAmount(900, [])).toBe(900)
    expect(outstandingInvoiceAmount(1500, 900, [{ amount: 500, status: 'COMPLETED' }])).toBe(1000)
    expect(academicMonthLabel('August', '2025-2026')).toBe('August 2025')
  })
})
