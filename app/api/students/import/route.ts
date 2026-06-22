import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import { studentBulkImportSchema } from '@/lib/validation/student'
import { importStudentsBulk } from '@/lib/students/bulk-import'
import type { Role } from '@prisma/client'

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'create')) return errors.forbidden()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = studentBulkImportSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const outcome = await importStudentsBulk(parsed.data.rows, session.user.id)

  const { prisma } = await import('@/lib/prisma')
  await prisma.auditLog.create({
    data: {
      userId: session.user.id,
      action: 'CREATE',
      entityType: 'StudentBulkImport',
      entityId: session.user.id,
      changes: {
        total: parsed.data.rows.length,
        created: outcome.created,
        failed: outcome.failed,
      },
    },
  })

  return successResponse(outcome, {
    message: `Import complete: ${outcome.created} created, ${outcome.failed} failed`,
  })
}
