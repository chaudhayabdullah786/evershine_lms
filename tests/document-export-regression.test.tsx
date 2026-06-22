import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDocumentFileName, exportPreviewDocument } from '@/app/dashboard/documents/page'

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
      colorMode: 'color',
    })
  })
})
