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

type PreviewReadyOptions = {
  timeoutMs?: number
}

/**
 * Wait until a preview has finished its data and asset work before capturing.
 *
 * Document previews are rendered while their API queries and remote images are
 * still settling. Capturing that intermediate DOM produces a valid-looking PDF
 * with a header but no marks/photo. Pages that need a data gate set
 * `data-export-ready="true"`; other document types still receive the asset and
 * layout checks below for backwards compatibility.
 */
export async function waitForDocumentPreviewReady(
  element: HTMLElement,
  { timeoutMs = 15_000 }: PreviewReadyOptions = {},
) {
  const page = element.matches('[data-document-page], [data-pdf-page]')
    ? element
    : element.querySelector('[data-document-page], [data-pdf-page]') as HTMLElement | null
  const target = page ?? element
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    const readyState = target.getAttribute('data-export-ready')
    const images = Array.from(target.querySelectorAll('img')) as HTMLImageElement[]
    // `complete` also covers a failed optional image; the PDF layer will keep
    // its fallback/placeholder rather than blocking every document forever on
    // a third-party asset that cannot be fetched.
    const assetsReady = images.every((image) => image.complete)
    const rect = target.getBoundingClientRect()
    // jsdom and hidden test containers report zero bounds. Only data-gated
    // production pages require a measurable layout before capture.
    const layoutReady = !target.hasAttribute('data-export-ready') || (rect.width > 0 && rect.height > 0)

    if (readyState !== 'false' && assetsReady && layoutReady) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('Document preview is still loading. Please wait for the result data and try again.')
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

  await waitForDocumentPreviewReady(captureTarget)

  // Preview pages commonly size themselves through Tailwind classes instead of
  // inline styles. Resolve the rendered dimensions so the export uses the same
  // canvas the user sees, even when the preview is inside a scroll container.
  const computed = window.getComputedStyle(captureTarget)
  const rendered = captureTarget.getBoundingClientRect()
  const targetWidth = captureTarget.getAttribute('data-pdf-width')
    ? `${captureTarget.getAttribute('data-pdf-width')}px`
    : captureTarget.style.width || (rendered.width ? `${Math.round(rendered.width)}px` : computed.width || '595px')
  const targetHeight = captureTarget.getAttribute('data-pdf-height')
    ? `${captureTarget.getAttribute('data-pdf-height')}px`
    : captureTarget.style.height || (rendered.height ? `${Math.round(rendered.height)}px` : computed.height || '842px')

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
