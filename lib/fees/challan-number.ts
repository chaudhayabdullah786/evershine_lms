import { prisma } from '@/lib/prisma'

/**
 * Generates a sequential challan number for a given academic year.
 * Pattern: ESA/YY-YY/NNNNN
 * Example: ESA/25-26/00001
 */
export async function generateChallanNumber(academicYear: string): Promise<string> {
  // Extract YY-YY from YYYY-YYYY (e.g., 2025-2026 -> 25-26)
  const parts = academicYear.split('-')
  let shortYear = '00-00'
  if (parts.length === 2) {
    shortYear = `${parts[0].slice(-2)}-${parts[1].slice(-2)}`
  }

  // Find the highest sequence number for this academic year
  const prefix = `ESA/${shortYear}/`
  
  const lastInvoice = await prisma.feeInvoice.findFirst({
    where: { challanNumber: { startsWith: prefix } },
    orderBy: { challanNumber: 'desc' },
    select: { challanNumber: true },
  })

  let nextSeq = 1
  if (lastInvoice) {
    const lastSeqStr = lastInvoice.challanNumber.replace(prefix, '')
    const lastSeq = parseInt(lastSeqStr, 10)
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1
    }
  }

  return `${prefix}${String(nextSeq).padStart(5, '0')}`
}
