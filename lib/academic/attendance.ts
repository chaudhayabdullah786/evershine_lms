import { prisma } from '@/lib/prisma'

/** Resolve TeacherAttendance.markedByTeacherId — field is required but has no FK. */
export async function resolveMarkedByTeacherId(userId: string): Promise<string> {
  const teacher = await prisma.teacher.findUnique({
    where: { userId },
    select: { id: true },
  })
  if (teacher) return teacher.id

  const fallback = await prisma.teacher.findFirst({
    where: { isActive: true },
    select: { id: true },
  })
  if (fallback) return fallback.id

  return userId
}
