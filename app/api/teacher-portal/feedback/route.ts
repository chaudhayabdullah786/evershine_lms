import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden()

  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  const feedback = await prisma.teacherFeedback.findMany({
    where: { teacherId: teacher.id },
    include: {
      class: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Calculate average rating
  const total = feedback.length
  const avgRating = total > 0
    ? feedback.reduce((sum, item) => sum + item.rating, 0) / total
    : 0

  return successResponse({
    avgRating: Number(avgRating.toFixed(1)),
    totalFeedbacks: total,
    feedbacks: feedback.map(f => ({
      id: f.id,
      month: f.month,
      rating: f.rating,
      comments: f.comments,
      className: f.class.name,
      createdAt: f.createdAt,
    })),
  })
}
