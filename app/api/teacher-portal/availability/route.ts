import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { z } from 'zod'

const schema = z.object({
  availabilities: z.array(z.object({
    dayOfWeek: z.coerce.number().min(0).max(6),
    arrivalTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Invalid time format (HH:MM)'),
    departureTime: z.string().regex(/^([01]\d|2[0-3]):?([0-5]\d)$/, 'Invalid time format (HH:MM)'),
  }))
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

  const availabilities = await prisma.teacherAvailability.findMany({
    where: { teacherId: teacher.id },
    orderBy: { dayOfWeek: 'asc' }
  })

  return successResponse(availabilities)
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can access this')

  let body: unknown
  try { body = await request.json() } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true }
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const { availabilities } = parsed.data

  await prisma.$transaction([
    prisma.teacherAvailability.deleteMany({ where: { teacherId: teacher.id } }),
    prisma.teacherAvailability.createMany({
      data: availabilities.map(a => ({
        teacherId: teacher.id,
        dayOfWeek: a.dayOfWeek,
        arrivalTime: a.arrivalTime,
        departureTime: a.departureTime,
      }))
    })
  ])

  return successResponse(null, 'Availability schedule updated successfully')
}
