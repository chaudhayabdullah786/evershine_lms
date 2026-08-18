/**
 * Canonical payment instructions used by every fee challan and export.
 *
 * Keeping this mapping in one place prevents a client from submitting stale or
 * fabricated bank instructions and keeps older invoices readable through the
 * backwards-compatible parser below.
 */

export interface PaymentDetails {
  accountTitle: string
  easypaisa: { accountNumber: string }
  meezanBank: { accountNumber: string; iban: string; branch: string }
  note: string
}

export interface PaymentDetailRow {
  label: string
  value: string
}

export const DEFAULT_PAYMENT_DETAILS: PaymentDetails = {
  accountTitle: 'Ali Aslam',
  easypaisa: { accountNumber: '0309-1830726' },
  meezanBank: {
    accountNumber: '0030-0112755565',
    iban: 'PK39MEZN00003011275565',
    branch: 'Meezan Digital Centre',
  },
  note: 'It is mandatory to share the E-Receipt after completing your transaction.',
}

/** Stable text snapshot stored on each invoice for audit/history. */
export function serializePaymentDetails(details: PaymentDetails = DEFAULT_PAYMENT_DETAILS): string {
  return [
    `Account Title: ${details.accountTitle}`,
    `Easypaisa Account Number: ${details.easypaisa.accountNumber}`,
    `Meezan Bank Account Number: ${details.meezanBank.accountNumber}`,
    `Meezan Bank IBAN: ${details.meezanBank.iban}`,
    `Meezan Bank Branch: ${details.meezanBank.branch}`,
    `Note: ${details.note}`,
  ].join('\n')
}

/**
 * Reads both the canonical snapshot and legacy `Bank: number` strings already
 * present in production invoices.
 */
export function parsePaymentDetails(value?: string | null): PaymentDetailRow[] {
  if (!value?.trim()) return []

  return value
    .split(/\r?\n|;/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = line.indexOf(':')
      if (separator < 0) return { label: 'Payment instruction', value: line }
      return {
        label: line.slice(0, separator).trim(),
        value: line.slice(separator + 1).trim(),
      }
    })
}

export function paymentDetailsRows(details: PaymentDetails = DEFAULT_PAYMENT_DETAILS): PaymentDetailRow[] {
  return parsePaymentDetails(serializePaymentDetails(details))
}

/** Always render canonical instructions when an older invoice has no snapshot. */
export function paymentDetailsRowsFromSnapshot(snapshot?: string | null): PaymentDetailRow[] {
  const rows = parsePaymentDetails(snapshot)
  return rows.length > 0 ? rows : paymentDetailsRows()
}
