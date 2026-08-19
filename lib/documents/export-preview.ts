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
  | 'super_admin_card'
  | 'account_manager_card'

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
  // Support both the Documents centre marker and the shared academic
  // ResultReportCard/roll-slip marker used by other portals.
  const pageEl = element.querySelector('[data-document-page], [data-pdf-page]') as HTMLElement | null
  const captureTarget = pageEl ?? element

  // Preview pages commonly size themselves through Tailwind classes instead of
  // inline styles. Resolve the rendered dimensions so the export uses the same
  // canvas the user sees, even when the preview is inside a scroll container.
  const computed = window.getComputedStyle(captureTarget)
  const rendered = captureTarget.getBoundingClientRect()
  const targetWidth = captureTarget.style.width || (rendered.width ? `${Math.round(rendered.width)}px` : computed.width || '595px')
  const targetHeight = captureTarget.style.height || (rendered.height ? `${Math.round(rendered.height)}px` : computed.height || '842px')

  const widthNum = parseInt(targetWidth, 10) || 595
  const heightNum = parseInt(targetHeight, 10) || 842
  const orientation = widthNum > heightNum ? 'landscape' : 'portrait'

  const savedWidth = captureTarget.style.width
  const savedMinWidth = captureTarget.style.minWidth
  const savedMaxWidth = captureTarget.style.maxWidth
  const savedHeight = captureTarget.style.height
  const savedMinHeight = captureTarget.style.minHeight
  const savedMaxHeight = captureTarget.style.maxHeight
  const savedPosition = captureTarget.style.position
  captureTarget.style.width = targetWidth
  captureTarget.style.minWidth = targetWidth
  captureTarget.style.maxWidth = targetWidth
  captureTarget.style.height = targetHeight
  captureTarget.style.minHeight = targetHeight
  captureTarget.style.maxHeight = targetHeight

  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => setTimeout(resolve, 80))

  try {
    await downloadPdf({
      element: captureTarget,
      filename: fileName,
      orientation,
      scale: 3,
      // All non-card document pages are designed on an A4 canvas. Card faces
      // carry their own CR80 physical dimensions and override this in the
      // shared renderer.
      format: 'a4',
      colorMode,
    })
  } finally {
    captureTarget.style.width = savedWidth
    captureTarget.style.minWidth = savedMinWidth
    captureTarget.style.maxWidth = savedMaxWidth
    captureTarget.style.height = savedHeight
    captureTarget.style.minHeight = savedMinHeight
    captureTarget.style.maxHeight = savedMaxHeight
    captureTarget.style.position = savedPosition
  }
}
