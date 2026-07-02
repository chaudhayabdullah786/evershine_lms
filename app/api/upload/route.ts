/**
 * GET /api/upload
 * Returns a signed token allowing the frontend to upload a file directly
 * to Cloudinary. Bypasses the Vercel 4.5MB payload limit.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { generateUploadSignature, getBaseUploadFolder } from '@/lib/cloudinary'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const { searchParams } = new URL(request.url)
  const rawFolderParam = searchParams.get('folder') ?? ''
  const folderParam = rawFolderParam.replace(/^\/+|\/+$/g, '').trim()

  // Enforce safe folder structure and normalize slashes
  const baseFolder = getBaseUploadFolder()
  const allowedFolders = ['students', 'teachers', 'fee-proofs', 'documents', 'challans', 'results']

  const folder = allowedFolders.includes(folderParam)
    ? `${baseFolder}/${folderParam}`
    : `${baseFolder}/misc`

  try {
    const sig = generateUploadSignature(folder)
    return successResponse(sig)
  } catch (error) {
    console.error('Cloudinary Signature Error:', error)
    return errors.internal()
  }
}
