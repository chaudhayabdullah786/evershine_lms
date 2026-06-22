import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'read')) return errors.forbidden()

  const { id } = await params
  const student = await prisma.student.findUnique({
    where: { id },
    select: { id: true },
  })
  if (!student) return errors.notFound('Student')

  const enrollmentIds = (
    await prisma.studentEnrollment.findMany({
      where: { studentId: id },
      select: { id: true },
    })
  ).map((e) => e.id)

  const [studentLogs, enrollmentLogs] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entityType: 'Student', entityId: id },
      orderBy: { timestamp: 'desc' },
      take: 40,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        changes: true,
        timestamp: true,
        user: { select: { email: true, role: true } },
      },
    }),
    enrollmentIds.length
      ? prisma.auditLog.findMany({
          where: { entityType: 'StudentEnrollment', entityId: { in: enrollmentIds } },
          orderBy: { timestamp: 'desc' },
          take: 20,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            changes: true,
            timestamp: true,
            user: { select: { email: true, role: true } },
          },
        })
      : Promise.resolve([]),
  ])

  const merged = [...studentLogs, ...enrollmentLogs]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, 50)

  return successResponse(merged)
}
