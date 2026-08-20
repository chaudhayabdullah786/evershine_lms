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
 *
 * WHY 3-frame + 400ms post-gate settle: React batches state updates, meaning
 * data-export-ready="true" lands in the DOM during a commit, but the browser
 * paint (rasterisation) can lag behind by one or more frames. The explicit
 * post-gate settle guarantees the full subject table is painted before
 * html2canvas begins capture.
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
      // Post-gate settle: wait 3 animation frames + 400ms so the browser has
      // fully painted all dynamically-rendered rows (e.g. subject marks table)
      // before html2canvas initiates capture.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => setTimeout(resolve, 400))
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error('Document preview is still loading. Please wait for the result data and try again.')
}

/**
 * Resolve the inner page element that should be the capture target.
 *
 * WHY: documentCaptureRef is attached to an outer scroll/flex wrapper. Passing
 * that wrapper to html2canvas causes getBoundingClientRect to return the
 * clipped viewport height rather than the full A4 page height (842px). By
 * finding the inner [data-document-page] or [data-pdf-page] element — which
 * carries explicit data-pdf-width/data-pdf-height attributes — the capture
 * engine reads the correct physical canvas dimensions.
 */
function resolvePageElement(element: HTMLElement): HTMLElement {
  const inner = element.querySelector('[data-document-page], [data-pdf-page]') as HTMLElement | null
  return inner ?? element
}

export async function exportPreviewDocument(
  element: HTMLElement,
  fileName: string,
  colorMode: 'color' | 'bw' = 'color'
) {
  // Resolve the inner page element — not the outer scroll wrapper.
  const captureTarget = resolvePageElement(element)

  await waitForDocumentPreviewReady(captureTarget)

  // Preview pages commonly size themselves through Tailwind classes instead of
  // inline styles. Resolve the rendered dimensions so the export uses the same
  // canvas the user sees, even when the preview is inside a scroll container.
  const computed = window.getComputedStyle(captureTarget)
  const rendered = captureTarget.getBoundingClientRect()

  // Prefer explicit data-pdf-* attributes (set by the document template) over
  // computed dimensions — these are the authoritative physical page dimensions.
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
  const savedOverflow = captureTarget.style.overflow
  const savedPosition = captureTarget.style.position

  // Unclip the canvas so html2canvas captures the full page, not just the
  // portion visible inside a scroll container.
  captureTarget.style.width = targetWidth
  captureTarget.style.minWidth = targetWidth
  captureTarget.style.maxWidth = targetWidth
  captureTarget.style.height = targetHeight
  captureTarget.style.minHeight = targetHeight
  captureTarget.style.maxHeight = targetHeight
  captureTarget.style.overflow = 'visible'

  // Final settle after dimension mutation so the browser reflows before capture.
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
    captureTarget.style.overflow = savedOverflow
    captureTarget.style.position = savedPosition
  }
}
