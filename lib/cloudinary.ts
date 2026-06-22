/**
 * Cloudinary Integration
 *
 * WHY direct upload from client: Server-side file parsing consumes high memory
 * and Vercel serverless functions have a 4.5MB payload limit. Instead, the server
 * generates a signed token, and the client uploads directly to Cloudinary.
 */

import { createHmac } from 'crypto'
import { v2 as cloudinary } from 'cloudinary'

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

function signCloudinaryPayload(payload: Record<string, string | number>) {
  const sortedKeys = Object.keys(payload).sort()
  const query = sortedKeys
    .map((key) => `${key}=${payload[key]}`)
    .join('&')

  return createHmac('sha256', apiSecret!).update(query).digest('hex')
}

/**
 * Generates a signed payload for client-side direct upload.
 * Valid for 1 hour.
 */
export function generateUploadSignature(folder = process.env.CLOUDINARY_UPLOAD_FOLDER || 'evershaheen/misc') {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Missing Cloudinary configuration for signature generation')
  }

  const normalizedFolder = normalizeFolderPath(folder)
  const timestamp = Math.round(Date.now() / 1000)
  const signature = signCloudinaryPayload({ folder: normalizedFolder, timestamp })

  return {
    timestamp,
    signature,
    cloudName,
    apiKey,
    folder: normalizedFolder,
  }
}
