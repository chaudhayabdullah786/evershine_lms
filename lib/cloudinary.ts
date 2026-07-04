/**
 * Cloudinary Integration
 *
 * WHY direct upload from client: Server-side file parsing consumes high memory
 * and Vercel serverless functions have a 4.5MB payload limit. Instead, the server
 * generates a signed token, and the client uploads directly to Cloudinary.
 */

import { v2 as cloudinary } from 'cloudinary'

const DEFAULT_UPLOAD_FOLDER = 'evershine-academy'

const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim()
const apiKey = process.env.CLOUDINARY_API_KEY?.trim()
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim()

if (!cloudName || !apiKey || !apiSecret) {
  console.warn('Cloudinary environment variables missing or malformed. Image uploads will fail.')
}

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
})

export default cloudinary

function normalizeFolderPath(folder: string) {
  return folder.replace(/^\/+|\/+$/g, '').trim()
}

function getRequiredCloudinaryConfig() {
  const missing = [
    !cloudName && 'CLOUDINARY_CLOUD_NAME',
    !apiKey && 'CLOUDINARY_API_KEY',
    !apiSecret && 'CLOUDINARY_API_SECRET',
  ].filter(Boolean)

  if (missing.length > 0) {
    throw new Error(`Cloudinary is not configured. Missing: ${missing.join(', ')}.`)
  }

  return {
    cloudName: cloudName!,
    apiKey: apiKey!,
    apiSecret: apiSecret!,
  }
}

export function isProfileImageDataUrl(value: string | null | undefined): value is string {
  return typeof value === 'string' && /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value)
}

export function getBaseUploadFolder() {
  const folder = normalizeFolderPath(process.env.CLOUDINARY_UPLOAD_FOLDER || DEFAULT_UPLOAD_FOLDER)
  if (!folder) {
    throw new Error('Cloudinary upload folder is not configured. Set CLOUDINARY_UPLOAD_FOLDER.')
  }
  return folder
}

function getImageMagic(buffer: Buffer) {
  return buffer.subarray(0, 4).toString('hex').toUpperCase()
}

function assertAllowedImage(buffer: Buffer) {
  const magic = getImageMagic(buffer)
  const isValidImage =
    magic.startsWith('FFD8')     || // JPEG
    magic.startsWith('89504E47') || // PNG
    magic.startsWith('47494638')    // GIF
  if (!isValidImage) {
    throw new Error('Invalid image format. Only JPEG, PNG, and GIF are accepted.')
  }
}

export function isAllowedPaymentProof(buffer: Buffer) {
  if (buffer.length < 4) return false
  const magic = getImageMagic(buffer)
  return (
    magic.startsWith('FFD8') ||
    magic.startsWith('89504E47') ||
    magic.startsWith('25504446')
  )
}

export function sanitizeCloudinaryError(error: unknown) {
  const err = error as { message?: unknown; http_code?: unknown; name?: unknown; code?: unknown }
  return {
    message: typeof err?.message === 'string' ? err.message : 'Cloudinary request failed',
    http_code: typeof err?.http_code === 'number' ? err.http_code : undefined,
    name: typeof err?.name === 'string' ? err.name : undefined,
    code: typeof err?.code === 'string' || typeof err?.code === 'number' ? String(err.code) : undefined,
  }
}

export function getCloudinaryRuntimeDiagnostics() {
  const baseFolder = getBaseUploadFolder()
  return {
    configured: Boolean(cloudName && apiKey && apiSecret),
    cloudName: cloudName || null,
    uploadFolder: baseFolder,
    requiredVariables: {
      CLOUDINARY_CLOUD_NAME: { present: Boolean(cloudName), length: cloudName?.length ?? 0 },
      CLOUDINARY_API_KEY: { present: Boolean(apiKey), length: apiKey?.length ?? 0 },
      CLOUDINARY_API_SECRET: { present: Boolean(apiSecret), length: apiSecret?.length ?? 0 },
      CLOUDINARY_UPLOAD_FOLDER: { present: Boolean(process.env.CLOUDINARY_UPLOAD_FOLDER?.trim()), length: process.env.CLOUDINARY_UPLOAD_FOLDER?.trim().length ?? 0 },
    },
  }
}

async function uploadBufferToCloudinary(params: {
  buffer: Buffer
  subfolder: 'students' | 'teachers' | 'fee-proofs' | 'diagnostics'
  publicId: string
  resourceType: 'image' | 'auto'
  overwrite?: boolean
}) {
  getRequiredCloudinaryConfig()

  const fullFolder = `${getBaseUploadFolder()}/${params.subfolder}`
  const safePublicId = params.publicId.replace(/[^a-zA-Z0-9_\-]/g, '-')

  return new Promise<string>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: fullFolder,
        public_id: safePublicId,
        resource_type: params.resourceType,
        quality: params.resourceType === 'image' ? 'auto' : undefined,
        fetch_format: params.resourceType === 'image' ? 'auto' : undefined,
        overwrite: params.overwrite ?? true,
        type: 'upload',
        access_mode: 'public',
      },
      (error, result) => {
        if (error || !result?.secure_url) {
          reject(error ?? new Error('Cloudinary upload returned no secure_url'))
        } else {
          resolve(result.secure_url)
        }
      }
    )
    stream.end(params.buffer)
  })
}

/**
 * Generates a signed payload for client-side direct upload.
 * Valid for 1 hour.
 */
export function generateUploadSignature(folder = `${getBaseUploadFolder()}/misc`) {
  const config = getRequiredCloudinaryConfig()
  const normalizedFolder = normalizeFolderPath(folder)
  const timestamp = Math.round(Date.now() / 1000)
  const signature = cloudinary.utils.api_sign_request({ folder: normalizedFolder, timestamp }, config.apiSecret)

  return {
    timestamp,
    signature,
    cloudName: config.cloudName,
    apiKey: config.apiKey,
    folder: normalizedFolder,
  }
}

/**
 * Uploads a base64 image data-URL to Cloudinary server-side and returns the
 * secure CDN URL.
 *
 * Scope: Profile photos for students and staff members. Payment proof
 * screenshots/receipts use uploadPaymentProofToCloudinary below. Other
 * documents, generated PDFs, exports, and CVs remain on local disk.
 *
 * WHY server-side upload here instead of signed client-side token:
 * Profile images arrive as base64 data-URLs embedded in JSON POST bodies
 * from the admin forms. Re-routing those through a separate signed-upload
 * flow would require significant frontend refactoring. Server-side streaming
 * is the correct fix with the smallest change surface.
 *
 * TRADEOFF: ~300–800ms added latency on create/edit. Acceptable for low-
 * frequency admin operations vs. the alternative of storing raw base64
 * strings in the database (which causes severe DB bloat and column size
 * violations at scale).
 *
 * @param base64DataUrl - data:image/jpeg;base64,... or data:image/png;base64,...
 * @param subfolder     - e.g. 'students' or 'teachers'
 * @param publicId      - Unique identifier (e.g. registration number or employee ID)
 * @returns             - Cloudinary secure_url (HTTPS CDN link)
 */
export async function uploadProfileImageToCloudinary(
  base64DataUrl: string,
  subfolder: 'students' | 'teachers',
  publicId: string
): Promise<string> {
  getRequiredCloudinaryConfig()

  // Strip data-URL prefix and decode to raw bytes
  const base64Data = base64DataUrl.replace(/^data:image\/\w+;base64,/, '')
  const buffer = Buffer.from(base64Data, 'base64')

  assertAllowedImage(buffer)

  // 5 MB limit on decoded bytes
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('Image too large. Maximum allowed size is 5 MB.')
  }

  return uploadBufferToCloudinary({
    buffer,
    subfolder,
    publicId,
    resourceType: 'image',
    overwrite: true,
  })
}

export async function uploadPaymentProofToCloudinary(buffer: Buffer, publicId: string): Promise<string> {
  if (!isAllowedPaymentProof(buffer)) {
    throw new Error('Invalid payment proof format. Only JPG, PNG, and PDF are accepted.')
  }

  if (buffer.length > 4 * 1024 * 1024) {
    throw new Error('Payment proof too large. Maximum allowed size is 4 MB.')
  }

  return uploadBufferToCloudinary({
    buffer,
    subfolder: 'fee-proofs',
    publicId,
    resourceType: 'auto',
    overwrite: true,
  })
}


export async function runCloudinaryDiagnosticUpload() {
  getRequiredCloudinaryConfig()

  const png1x1 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64'
  )
  const publicId = `diagnostic-${Date.now()}`
  const folder = `${getBaseUploadFolder()}/diagnostics`

  try {
    const secureUrl = await uploadBufferToCloudinary({
      buffer: png1x1,
      subfolder: 'diagnostics',
      publicId,
      resourceType: 'image',
      overwrite: true,
    })

    return {
      ok: true as const,
      folder,
      publicId,
      secureUrl,
    }
  } catch (error) {
    return {
      ok: false as const,
      folder,
      publicId,
      error: sanitizeCloudinaryError(error),
    }
  }
}
