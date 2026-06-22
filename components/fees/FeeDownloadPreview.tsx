'use client'

import { formatCurrency, formatDate } from '@/lib/utils'
import { AcademyLogo } from '@/components/AcademyLogo'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface FeeItem {
  id: string
  description: string
  amount: string | number
}

interface StudentDetails {
  firstName: string
  lastName: string
  registrationNumber: string
  rollNumber?: string
  campus: { name: string }
  class?: { name: string }
}

export interface FeeInvoicePreview {
  challanNumber: string
  month: string
  academicYear: string
  dueDate: string
  createdAt: string
  subtotal: string | number
  discount: string | number
  lateFee: string | number
  totalAmount: string | number
  paidAmount: string | number
  status: string
  notes?: string
  bankAccounts?: string
  proofStatus?: string
  issuedBy: string
  items: FeeItem[]
  student: StudentDetails
}

interface FeeDownloadPreviewProps {
  invoice: FeeInvoicePreview
  variant: 'student' | 'teacher'
  elementId: string
}

function parseBankAccounts(bankAccounts: string | undefined) {
  if (!bankAccounts) return []
  return bankAccounts
    .split(/\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [bank, number] = line.split(':').map((part) => part.trim())
      return { bank: bank || 'Bank', number: number || line }
    })
}

export function FeeDownloadPreview({ invoice, variant, elementId }: FeeDownloadPreviewProps) {
  const studentName = `${invoice.student.firstName} ${invoice.student.lastName}`
  const total = Number(invoice.totalAmount)
  const paid = Number(invoice.paidAmount)
  const balance = total - paid
  const discount = Number(invoice.discount)
  const lateFee = Number(invoice.lateFee)
  const subtotal = Number(invoice.subtotal)
  const paymentRows = invoice.items.map((item) => ({
    description: item.description,
    amount: Number(item.amount),
  }))
  const bankRows = parseBankAccounts(invoice.bankAccounts)
  const labels = {
    student: {
      heading: 'Student Download Receipt',
      subheading: 'A clean, student-ready fee download with payment instructions and summary totals.',
      badge: 'Student Copy',
      instructions: [
        'Present this receipt at the bank or campus cashier.',
        'Keep a digital copy for your records.',
        'Upload payment proof within 24 hours after payment.',
      ],
    },
    teacher: {
      heading: 'Teacher / Office Download',
      subheading: 'Professional finance copy with audit notes for teacher and office review.',
      badge: 'Teacher Copy',
      instructions: [
        'Verify the fee details against student records.',
        'Confirm payment receipt and upload proof.',
        'Retain this copy for finance audit and reconciliation.',
      ],
    },
  }[variant]

  return (
    <div id={elementId} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl">
      <div className="px-6 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <AcademyLogo className="w-16 h-16" />
            <div>
              <p className="text-xs uppercase tracking-[0.32em] text-slate-500">EverShine Academy</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{labels.heading}</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{labels.subheading}</p>
            </div>
          </div>
          <div className="rounded-full border border-slate-300 bg-slate-100 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-700 shadow-sm">
            {labels.badge}
          </div>
        </div>
        <div className="mt-6 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600 sm:grid-cols-[1fr_auto] sm:items-center">
          <div>
            <p className="font-semibold text-slate-900">Official Fee Receipt</p>
            <p className="mt-1 text-sm text-slate-600">This document is generated for fee submission and record keeping. Keep one copy for the student and one for the accounts office.</p>
          </div>
          <div className="text-right text-xs uppercase tracking-[0.32em] text-slate-500">
            A4 document • Portrait
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-6">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            <Card className="border-slate-200/80 bg-slate-50">
              <CardHeader className="px-4 py-4">
                <CardTitle className="text-sm uppercase tracking-[0.3em] text-slate-500">Invoice Snapshot</CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Challan</p>
                    <p className="font-semibold text-slate-900">{invoice.challanNumber}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Period</p>
                    <p className="font-semibold text-slate-900">{invoice.month} {invoice.academicYear}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Issue Date</p>
                    <p className="font-semibold text-slate-900">{formatDate(invoice.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Due Date</p>
                    <p className="font-semibold text-red-600">{formatDate(invoice.dueDate)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80">
              <CardHeader className="px-4 py-4">
                <CardTitle className="text-sm uppercase tracking-[0.3em] text-slate-500">Student Details</CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-4 grid gap-2 text-sm text-slate-700">
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-slate-500">Name</span>
                  <span className="font-semibold text-slate-900">{studentName}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-slate-500">Registration No.</span>
                  <span className="font-semibold text-slate-900">{invoice.student.registrationNumber}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-slate-500">Class / Section</span>
                  <span className="font-semibold text-slate-900">{invoice.student.class?.name || 'N/A'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-slate-500">Campus</span>
                  <span className="font-semibold text-slate-900">{invoice.student.campus.name}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <span className="text-slate-500">Authorized By</span>
                  <span className="font-semibold text-slate-900">{invoice.issuedBy}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200/80 bg-slate-50">
              <CardHeader className="px-4 py-4">
                <CardTitle className="text-sm uppercase tracking-[0.3em] text-slate-500">Summary</CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-4 space-y-3">
                <div className="rounded-3xl bg-white p-4 shadow-sm">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Grand Total</div>
                  <div className="mt-2 text-3xl font-black text-slate-900">{formatCurrency(total)}</div>
                  <div className="mt-3 text-sm text-slate-500">Balance due: {formatCurrency(balance)}</div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 text-sm text-slate-700">
                  <div className="rounded-2xl bg-slate-100 p-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Paid</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatCurrency(paid)}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-3">
                    <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Outstanding</p>
                    <p className="mt-1 font-semibold text-slate-900">{formatCurrency(balance)}</p>
                  </div>
                </div>
                <div className="grid gap-2 text-sm text-slate-700">
                  <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div className="flex items-center justify-between text-emerald-700">
                      <span>Discount</span>
                      <span>-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  {lateFee > 0 && (
                    <div className="flex items-center justify-between text-rose-700">
                      <span>Late Fee</span>
                      <span>{formatCurrency(lateFee)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200/80">
              <CardHeader className="px-4 py-4">
                <CardTitle className="text-sm uppercase tracking-[0.3em] text-slate-500">Payment Instructions</CardTitle>
              </CardHeader>
              <CardContent className="px-4 py-4 space-y-3 text-sm text-slate-700">
                <ul className="space-y-2 list-disc pl-5">
                  {labels.instructions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-600">
                  {bankRows.length > 0 ? (
                    <div className="space-y-2">
                      <div className="font-semibold text-slate-900">Bank details</div>
                      <div className="space-y-1">
                        {bankRows.slice(0, 2).map((account, index) => (
                          <div key={index} className="grid grid-cols-[1fr_1fr] gap-3 text-[12px]">
                            <span className="font-semibold text-slate-800">{account.bank}</span>
                            <span className="font-mono text-slate-900">{account.number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-slate-500">No bank account details provided. Please contact the finance office.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <section className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 ring-1 ring-slate-100">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Fee details</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">Line items included in this receipt</p>
              </div>
              <Badge variant={variant === 'student' ? 'secondary' : 'outline'} className="uppercase tracking-[0.2em] text-[10px] font-semibold">
                {variant === 'student' ? 'Student view' : 'Office view'}
              </Badge>
            </div>

            <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <div className="grid grid-cols-[2fr_1fr] gap-2 bg-slate-100 px-4 py-3 text-[10px] uppercase tracking-[0.24em] text-slate-500">
                <span>Description</span>
                <span className="text-right">Amount</span>
              </div>
              <div className="divide-y divide-slate-200">
                {paymentRows.map((row, index) => (
                  <div key={`${row.description}-${index}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-700">
                    <span>{row.description}</span>
                    <span className="font-semibold text-slate-900">{formatCurrency(row.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {variant === 'teacher' && (
            <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Teacher / Office Notes</p>
              <ul className="mt-3 space-y-2 list-disc pl-5">
                <li>Confirm fee schedule with the student’s class teacher before collection.</li>
                <li>Update proof status once payment voucher is verified.</li>
                <li>Use this copy for campus finance reconciliation and audit control.</li>
              </ul>
            </div>
          )}
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl bg-slate-100 p-4 text-sm text-slate-700">
            <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Document footer</p>
            <p className="mt-3 leading-relaxed">
              {variant === 'student'
                ? 'This document is generated electronically and is valid for fee submission and record keeping. Keep a copy for future reference.'
                : 'This teacher copy includes finance review guidance and should be retained by the accounts office for verification.'}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p className="text-[10px] uppercase tracking-[0.32em] text-slate-500">Authorization</p>
            <div className="mt-4 grid gap-4">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Prepared by</p>
                <p className="mt-2 font-semibold text-slate-900">{invoice.issuedBy}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Signature</p>
                <div className="mt-3 h-9 rounded-2xl border border-slate-200 bg-white"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
