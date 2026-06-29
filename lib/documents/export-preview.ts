import { downloadPdf } from '@/lib/pdf'

export type DocumentType =
  | 'id_card'
  | 'birthday'
  | 'bonafide'
  | 'result_card'
  | 'performance_card'
  | 'reports'
  | 'exports'
  | 'teacher_id_card'
  | 'teacher_experience'
  | 'student_profile'
  | 'teacher_profile'

export function buildDocumentFileName(
  docType: DocumentType,
  reportSubtype: 'fees' | 'attendance' | 'performance',
  safeStudentIdentifier: string
) {
  const filePrefix = docType === 'reports'
    ? `${reportSubtype}-report`
    : `${docType.replace(/_/g, '-')}`
  return `${safeStudentIdentifier}-${filePrefix}`
}

export async function exportPreviewDocument(
  element: HTMLElement,
  fileName: string,
  colorMode: 'color' | 'bw' = 'color'
) {
  const pageEl = element.querySelector('[data-document-page]') as HTMLElement | null
  const captureTarget = pageEl ?? element

  const targetWidth = captureTarget.style.width || '595px'
  const targetHeight = captureTarget.style.height || '842px'

  const widthNum = parseInt(targetWidth, 10) || 595
  const heightNum = parseInt(targetHeight, 10) || 842
  const orientation = widthNum > heightNum ? 'landscape' : 'portrait'

  const savedWidth = captureTarget.style.width
  const savedMinWidth = captureTarget.style.minWidth
  const savedMaxWidth = captureTarget.style.maxWidth
  const savedPosition = captureTarget.style.position
  captureTarget.style.width = targetWidth
  captureTarget.style.minWidth = targetWidth
  captureTarget.style.maxWidth = targetWidth

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => setTimeout(resolve, 80))

  try {
    await downloadPdf({
      element: captureTarget,
      filename: fileName,
      orientation,
      scale: 3,
      colorMode,
    })
  } finally {
    captureTarget.style.width = savedWidth
    captureTarget.style.minWidth = savedMinWidth
    captureTarget.style.maxWidth = savedMaxWidth
    captureTarget.style.position = savedPosition
  }
}
