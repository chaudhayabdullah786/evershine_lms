import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { getCloudinaryRuntimeDiagnostics, runCloudinaryDiagnosticUpload } from '@/lib/cloudinary'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/cloudinary-diagnostics?upload=1
 *
 * SuperAdmin-only diagnostic. Returns env presence and an optional tiny upload
 * test without exposing API keys or API secrets.
 */
export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'SUPER_ADMIN') return errors.forbidden()

  const diagnostics = getCloudinaryRuntimeDiagnostics()
  const shouldUpload = request.nextUrl.searchParams.get('upload') === '1'

  if (!shouldUpload) {
    return successResponse({
      ...diagnostics,
      uploadTest: { skipped: true, hint: 'Add ?upload=1 to run a tiny Cloudinary upload test.' },
    })
  }

  const uploadTest = await runCloudinaryDiagnosticUpload()
  if (!uploadTest.ok) {
    console.error('[CLOUDINARY_DIAGNOSTIC_UPLOAD]', uploadTest.error)
  }

  return successResponse({
    ...diagnostics,
    uploadTest,
  })
}
