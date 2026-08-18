import { describe, expect, it } from 'vitest'
import { documentUsesAttendanceQr, DOCUMENT_PALETTE } from '@/lib/pdf/document-design'
import { ADMINISTRATION_DOC_REGISTRY } from '@/lib/pdf/document-registry'

describe('document template policy', () => {
  it('limits generated document QR codes to student ID cards', () => {
    expect(documentUsesAttendanceQr('id_card')).toBe(true)
    expect(documentUsesAttendanceQr('birthday')).toBe(false)
    expect(documentUsesAttendanceQr('result_card')).toBe(false)
    expect(documentUsesAttendanceQr('teacher_id_card')).toBe(false)
    expect(documentUsesAttendanceQr('super_admin_card')).toBe(false)
  })

  it('keeps student and staff palettes distinct and registers administration cards', () => {
    expect(DOCUMENT_PALETTE.student.primary).toBe('#1e3a8a')
    expect(DOCUMENT_PALETTE.staff.primary).toBe('#047857')
    expect(DOCUMENT_PALETTE.administration.primary).toBe('#b91c1c')
    expect(ADMINISTRATION_DOC_REGISTRY.map((entry) => entry.pageKey)).toEqual([
      'super_admin_card',
      'account_manager_card',
    ])
  })
})
