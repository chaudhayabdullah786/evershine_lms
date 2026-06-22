import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'

interface RouteParams {
  params: Promise<{ id: string }>
}

const updateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  content: z.string().min(5).optional(),
  expiresAt: z.string().nullable().optional(),
})

// ── GET single announcement ──────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const { id } = await params

  const announcement = await prisma.announcement.findUnique({
    where: { id },
    include: {
      class: { select: { name: true, section: true } },
    },
  })

  if (!announcement) return errors.notFound('Announcement')
  if (announcement.createdBy !== session.user.id) {
    return errors.forbidden('You can only view your own announcements')
  }

  return successResponse(announcement)
}

// ── PUT (update) ─────────────────────────────────────────────────────────────
// WHY teachers can edit: Allows fixing typos, updating content, or extending
// expiration dates. Class targeting is immutable after creation.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, createdBy: true },
  })
  if (!existing) return errors.notFound('Announcement')
  if (existing.createdBy !== session.user.id) {
    return errors.forbidden('You can only edit your own announcements')
  }

  const { title, content, expiresAt } = parsed.data

  const updated = await prisma.announcement.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(content !== undefined && { content }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
    },
    include: {
      class: { select: { name: true, section: true } },
    },
  })

  return successResponse(updated, 'Announcement updated successfully')
}

// ── DELETE ────────────────────────────────────────────────────────────────────
// WHY soft delete via isActive: Announcements are referenced by notifications
// already delivered to students. Hard-deleting would leave orphaned relatedId
// references. Setting isActive=false hides the announcement from all views.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const { id } = await params

  const existing = await prisma.announcement.findUnique({
    where: { id },
    select: { id: true, createdBy: true, title: true },
  })
  if (!existing) return errors.notFound('Announcement')
  if (existing.createdBy !== session.user.id) {
    return errors.forbidden('You can only delete your own announcements')
  }

  // Soft delete — preserves audit trail and notification references
  await prisma.announcement.update({
    where: { id },
    data: { isActive: false },
  })

  return successResponse(
    { deleted: true, id },
    `Announcement "${existing.title}" deleted successfully`
  )
}
