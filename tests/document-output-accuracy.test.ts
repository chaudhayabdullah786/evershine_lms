import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PAYMENT_DETAILS,
  parsePaymentDetails,
  serializePaymentDetails,
} from '@/lib/fees/payment-details'
import {
  getCanonicalStudentClassSection,
  getCanonicalStudentRollNumber,
} from '@/lib/academic/record-formatters'
import { generateAdministrationDirectoryCardDirect } from '@/lib/pdf/direct-generators'

describe('canonical document record mapping', () => {
  it('uses active enrollment values before legacy placement fields', () => {
    const student = {
      class: { name: 'Legacy Class' },
      section: 'Z',
      rollNumber: 'legacy-roll',
      activeEnrollments: [{
        status: 'ACTIVE',
        rollNumber: 'A-12',
        classSection: {
          className: 'Class 11',
          sectionName: 'A',
          shift: { name: 'Morning Shift', code: 'MORNING' },
        },
      }],
    }

    expect(getCanonicalStudentClassSection(student)).toBe('Class 11 - A (Morning Shift)')
    expect(getCanonicalStudentRollNumber(student)).toBe('A-12')
  })

  it('serializes and parses the complete canonical payment snapshot', () => {
    const snapshot = serializePaymentDetails(DEFAULT_PAYMENT_DETAILS)
    const rows = parsePaymentDetails(snapshot)
    expect(rows).toEqual(expect.arrayContaining([
      { label: 'Account Title', value: 'Ali Aslam' },
      { label: 'Easypaisa Account Number', value: '0309-1830726' },
      { label: 'Meezan Bank IBAN', value: 'PK39MEZN00003011275565' },
      { label: 'Meezan Bank Branch', value: 'Meezan Digital Centre' },
    ]))
  })

  it('creates a two-page administration directory card', async () => {
    const pdf = await generateAdministrationDirectoryCardDirect({
      name: 'Ali Aslam',
      roleLabel: 'SUPER ADMINISTRATOR',
      email: 'admin@example.com',
      campus: 'Madina Town Campus',
      colorMode: 'bw',
    })
    expect(pdf.getNumberOfPages()).toBe(2)
  })
})
