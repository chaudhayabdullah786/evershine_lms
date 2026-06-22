import { prisma } from '@/lib/prisma'

/** Students linked to a parent or guardian user account. */
export async function getChildrenForGuardianUser(userId: string) {
  return prisma.student.findMany({
    where: {
      OR: [
        { parents: { some: { userId } } },
        { guardians: { some: { userId } } },
      ],
      isActive: true,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      registrationNumber: true,
      rollNumber: true,
      campus: { select: { name: true } },
      batch: { select: { name: true } },
      class: { select: { name: true, shift: true } },
      deliveryMode: true,
    },
    orderBy: { firstName: 'asc' },
  })
}

export async function assertGuardianAccessToStudent(
  userId: string,
  studentId: string
): Promise<boolean> {
  const child = await prisma.student.findFirst({
    where: {
      id: studentId,
      OR: [
        { parents: { some: { userId } } },
        { guardians: { some: { userId } } },
      ],
    },
    select: { id: true },
  })
  return !!child
}
