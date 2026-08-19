import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDocumentFileName, exportPreviewDocument } from '@/lib/documents/export-preview'

const { downloadPdfMock } = vi.hoisted(() => ({
  downloadPdfMock: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/pdf', () => ({
  downloadPdf: downloadPdfMock,
}))

describe('document export regression', () => {
  beforeEach(() => {
    downloadPdfMock.mockClear()
  })

  it('builds a stable filename for a live preview document export', () => {
    const fileName = buildDocumentFileName('birthday', 'attendance', 'STU-1234')
    expect(fileName).toBe('STU-1234-birthday')
  })

  it('calls downloadPdf with the rendered preview container', async () => {
    const fakeElement = document.createElement('div')
    await exportPreviewDocument(fakeElement, 'STU-1234-birthday')

    expect(downloadPdfMock).toHaveBeenCalledTimes(1)
    expect(downloadPdfMock).toHaveBeenCalledWith({
      element: fakeElement,
      filename: 'STU-1234-birthday',
      orientation: 'portrait',
      scale: 3,
      format: 'a4',
      colorMode: 'color',
    })
  })

  it('uses the fixed rendered page size instead of a scroll-container height', async () => {
    const wrapper = document.createElement('div')
    const page = document.createElement('div')
    page.setAttribute('data-document-page', '')
    page.style.width = '595px'
    page.style.height = '842px'
    page.style.overflow = 'hidden'
    wrapper.appendChild(page)

    await exportPreviewDocument(wrapper, 'STU-1234-result-card')

    expect(downloadPdfMock).toHaveBeenCalledWith(expect.objectContaining({
      element: page,
      format: 'a4',
    }))
    // The helper restores the preview after export; a failed export must not
    // leave the live canvas locked to export dimensions.
    expect(page.style.height).toBe('842px')
    expect(page.style.overflow).toBe('hidden')
  })

  it('captures shared academic PDF pages as the export target', async () => {
    const wrapper = document.createElement('div')
    const page = document.createElement('div')
    page.setAttribute('data-pdf-page', '')
    page.style.width = '595px'
    page.style.height = '842px'
    wrapper.appendChild(page)

    await exportPreviewDocument(wrapper, 'STU-1234-roll-slip')

    expect(downloadPdfMock).toHaveBeenCalledWith(expect.objectContaining({ element: page }))
  })
})
