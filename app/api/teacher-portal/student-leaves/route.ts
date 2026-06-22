import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, paginatedResponse, successResponse } from '@/lib/api-response'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  classId: z.string().optional()
})

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const { searchParams } = new URL(request.url)
  const parsed = querySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)
  const { page, limit, status, classId } = parsed.data

  const where = {
    teacherId: teacher.id,
    ...(status && { status }),
    ...(classId && { classId }),
  }

  const [total, leaves] = await prisma.$transaction([
    prisma.studentLeaveRequest.count({ where }),
    prisma.studentLeaveRequest.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, rollNumber: true } },
        class: { select: { id: true, name: true, section: true } }
      }
    }),
  ])

  return paginatedResponse(leaves, { page, limit, total })
}
