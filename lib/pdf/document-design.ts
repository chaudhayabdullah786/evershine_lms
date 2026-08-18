/**
 * Shared visual and policy tokens for every generated academy document.
 *
 * Keeping the palette and QR policy in one module prevents the DOM previews,
 * direct PDF generators, and export tests from drifting apart.
 */
export const DOCUMENT_PALETTE = {
  student: {
    primary: '#1e3a8a',
    dark: '#172554',
    accent: '#2563eb',
    soft: '#eff6ff',
    border: '#bfdbfe',
    text: '#0f172a',
  },
  staff: {
    primary: '#047857',
    dark: '#064e3b',
    accent: '#10b981',
    soft: '#ecfdf5',
    border: '#a7f3d0',
    text: '#0f172a',
  },
  administration: {
    primary: '#b91c1c',
    dark: '#7f1d1d',
    accent: '#ef4444',
    soft: '#fef2f2',
    border: '#fecaca',
    text: '#450a0a',
  },
} as const

export const ACADEMY_SLOGAN = 'We Make Your Children More Valuable'

/** QR codes are a student-card attendance credential only. */
export const ATTENDANCE_QR_DOCUMENT_TYPE = 'id_card' as const

export function documentUsesAttendanceQr(documentType: string) {
  return documentType === ATTENDANCE_QR_DOCUMENT_TYPE
}
