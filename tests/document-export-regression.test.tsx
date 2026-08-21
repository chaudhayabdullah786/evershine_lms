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
    page.style.width = '794px'
    page.style.height = '1123px'
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

  it('waits for a data-gated result card before capturing', async () => {
    const wrapper = document.createElement('div')
    const page = document.createElement('div')
    page.setAttribute('data-document-page', '')
    page.setAttribute('data-export-ready', 'false')
    page.style.width = '794px'
    page.style.height = '1123px'
    page.getBoundingClientRect = () => ({ width: 595, height: 842 } as DOMRect)
    wrapper.appendChild(page)

    const timer = setTimeout(() => page.setAttribute('data-export-ready', 'true'), 10)
    await exportPreviewDocument(wrapper, 'STU-1234-result-card')
    clearTimeout(timer)

    expect(downloadPdfMock).toHaveBeenCalledWith(expect.objectContaining({
      element: page,
      filename: 'STU-1234-result-card',
    }))
  })

  it('honors explicit PDF dimensions on a result-card page', async () => {
    const wrapper = document.createElement('div')
    const page = document.createElement('div')
    page.setAttribute('data-document-page', '')
    page.setAttribute('data-pdf-width', '595')
    page.setAttribute('data-pdf-height', '842')
    page.style.width = '420px'
    page.style.height = '600px'
    wrapper.appendChild(page)

    await exportPreviewDocument(wrapper, 'STU-1234-result-card')

    expect(downloadPdfMock).toHaveBeenCalledWith(expect.objectContaining({ element: page }))
  })

  it('captures shared academic PDF pages as the export target', async () => {
    const wrapper = document.createElement('div')
    const page = document.createElement('div')
    page.setAttribute('data-pdf-page', '')
    page.style.width = '794px'
    page.style.height = '1123px'
    wrapper.appendChild(page)

    await exportPreviewDocument(wrapper, 'STU-1234-roll-slip')

    expect(downloadPdfMock).toHaveBeenCalledWith(expect.objectContaining({ element: page }))
  })
})
