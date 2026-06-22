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
  description: z.string().nullable().optional(),
  type: z.enum(['ASSIGNMENT', 'QUIZ', 'CP', 'MID_TERM', 'FINAL_TERM', 'OTHER']).optional(),
  dueDate: z.string().nullable().optional(),
  maxMarks: z.coerce.number().min(1).optional(),
})

// ── GET single task ──────────────────────────────────────────────────────────
export async function GET(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const task = await prisma.classTask.findUnique({
    where: { id },
    include: {
      class: { select: { name: true, section: true } },
      subject: { select: { name: true, code: true } },
    },
  })

  if (!task) return errors.notFound('Task')
  if (task.teacherId !== teacher.id) return errors.forbidden('You can only view your own tasks')

  return successResponse(task)
}

// ── PUT (update) ─────────────────────────────────────────────────────────────
// WHY teachers can edit: Allow fixing typos, extending due dates, or adjusting
// max marks before marks are entered. Only task metadata is editable — the
// class/subject/teacher assignment is immutable after creation.
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

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const existing = await prisma.classTask.findUnique({
    where: { id },
    select: { id: true, teacherId: true },
  })
  if (!existing) return errors.notFound('Task')
  if (existing.teacherId !== teacher.id) {
    return errors.forbidden('You can only edit your own tasks')
  }

  const { title, description, type, dueDate, maxMarks } = parsed.data

  const updated = await prisma.classTask.update({
    where: { id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(type !== undefined && { type }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(maxMarks !== undefined && { maxMarks }),
    },
    include: {
      class: { select: { name: true, section: true } },
      subject: { select: { name: true, code: true } },
    },
  })

  return successResponse(updated, 'Task updated successfully')
}

// ── DELETE ────────────────────────────────────────────────────────────────────
// WHY hard delete: ClassTask + TaskResult use cascade delete. Once a teacher
// deletes a task, all associated student marks are also removed. This is
// acceptable because teachers are the sole owners of their task data.
export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const { id } = await params

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const existing = await prisma.classTask.findUnique({
    where: { id },
    select: { id: true, teacherId: true, title: true },
  })
  if (!existing) return errors.notFound('Task')
  if (existing.teacherId !== teacher.id) {
    return errors.forbidden('You can only delete your own tasks')
  }

  await prisma.classTask.delete({ where: { id } })

  return successResponse({ deleted: true, id }, `Task "${existing.title}" deleted successfully`)
}
