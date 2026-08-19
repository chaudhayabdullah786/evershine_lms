/**
 * Canonical fee-report calculations.
 *
 * FeeInvoice.paidAmount and Student.dueAmount are denormalized summaries. They
 * are useful for dashboards, but reports must prefer completed payment rows so
 * a failed/refunded payment can never be exported as collected revenue.
 */

type DecimalLike = number | string | { toString(): string }

type PaymentLike = {
  amount: DecimalLike
  status?: string | null
}

export function decimalToNumber(value: DecimalLike | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function effectivePaidAmount(
  invoicePaidAmount: DecimalLike | null | undefined,
  payments: PaymentLike[] | undefined
): number {
  const completedPayments = (payments ?? []).filter((payment) => payment.status === 'COMPLETED')

  // Older invoices may not have payment rows. Preserve their recorded paid
  // summary rather than dropping them from the report entirely. If payment
  // history exists but none completed, the collected amount is zero.
  if ((payments ?? []).length === 0) return Math.max(0, decimalToNumber(invoicePaidAmount))
  if (completedPayments.length === 0) return 0

  return completedPayments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0)
}

export function outstandingInvoiceAmount(
  totalAmount: DecimalLike | null | undefined,
  invoicePaidAmount: DecimalLike | null | undefined,
  payments?: PaymentLike[]
): number {
  return Math.max(
    0,
    decimalToNumber(totalAmount) - effectivePaidAmount(invoicePaidAmount, payments)
  )
}

export function academicMonthLabel(monthName: string, academicYear: string): string {
  const startYear = academicYear.match(/^(\d{4})-\d{4}$/)?.[1]
  return `${monthName} ${startYear ?? new Date().getFullYear()}`
}
