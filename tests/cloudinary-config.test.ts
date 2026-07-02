import { describe, expect, it, vi } from 'vitest'

describe('Cloudinary configuration', () => {
  it('uses the configured upload folder and Cloudinary SDK signing', async () => {
    vi.resetModules()
    vi.setSystemTime(new Date('2026-07-03T00:00:00.000Z'))
    process.env.CLOUDINARY_CLOUD_NAME = 'academy-cloud'
    process.env.CLOUDINARY_API_KEY = 'api-key'
    process.env.CLOUDINARY_API_SECRET = 'api-secret'
    process.env.CLOUDINARY_UPLOAD_FOLDER = '/evershine-academy-live/'

    const { generateUploadSignature, getBaseUploadFolder } = await import('../lib/cloudinary')

    expect(getBaseUploadFolder()).toBe('evershine-academy-live')
    const signature = generateUploadSignature()
    expect(signature).toMatchObject({
      cloudName: 'academy-cloud',
      apiKey: 'api-key',
      folder: 'evershine-academy-live/misc',
      timestamp: 1783036800,
    })
    expect(signature.signature).toMatch(/^[a-f0-9]{40}$/)
  })
})
