import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockAuth,
  mockGetCloudinaryRuntimeDiagnostics,
  mockRunCloudinaryDiagnosticUpload,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetCloudinaryRuntimeDiagnostics: vi.fn(),
  mockRunCloudinaryDiagnosticUpload: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({ auth: mockAuth }))
vi.mock('@/lib/cloudinary', () => ({
  getCloudinaryRuntimeDiagnostics: mockGetCloudinaryRuntimeDiagnostics,
  runCloudinaryDiagnosticUpload: mockRunCloudinaryDiagnosticUpload,
}))

import { GET } from '../app/api/admin/cloudinary-diagnostics/route'

describe('GET /api/admin/cloudinary-diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCloudinaryRuntimeDiagnostics.mockReturnValue({
      configured: true,
      cloudName: 'defkwzmlu',
      uploadFolder: 'evershaheen',
      requiredVariables: {
        CLOUDINARY_CLOUD_NAME: { present: true, length: 8 },
        CLOUDINARY_API_KEY: { present: true, length: 15 },
        CLOUDINARY_API_SECRET: { present: true, length: 27 },
        CLOUDINARY_UPLOAD_FOLDER: { present: true, length: 11 },
      },
    })
    mockRunCloudinaryDiagnosticUpload.mockResolvedValue({
      ok: false,
      folder: 'evershaheen/diagnostics',
      publicId: 'diagnostic-1',
      error: { message: 'Server returned unexpected status code - 403', http_code: 403, name: 'UnexpectedResponse' },
    })
  })

  it('requires SuperAdmin access', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', role: 'ADMIN' } })

    const response = await GET(new NextRequest('http://localhost/api/admin/cloudinary-diagnostics'))

    expect(response.status).toBe(403)
    expect(mockGetCloudinaryRuntimeDiagnostics).not.toHaveBeenCalled()
  })

  it('returns safe env presence diagnostics without secrets', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'super-1', role: 'SUPER_ADMIN' } })

    const response = await GET(new NextRequest('http://localhost/api/admin/cloudinary-diagnostics'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.data).toMatchObject({
      configured: true,
      cloudName: 'defkwzmlu',
      uploadFolder: 'evershaheen',
      uploadTest: { skipped: true },
    })
    expect(JSON.stringify(json)).not.toContain('api-secret')
    expect(mockRunCloudinaryDiagnosticUpload).not.toHaveBeenCalled()
  })

  it('runs a tiny upload test only when requested', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'super-1', role: 'SUPER_ADMIN' } })

    const response = await GET(new NextRequest('http://localhost/api/admin/cloudinary-diagnostics?upload=1'))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(mockRunCloudinaryDiagnosticUpload).toHaveBeenCalledTimes(1)
    expect(json.data.uploadTest).toMatchObject({
      ok: false,
      folder: 'evershaheen/diagnostics',
      error: { http_code: 403 },
    })
  })
})
