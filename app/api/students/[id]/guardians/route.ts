import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse, createdResponse } from '@/lib/api-response'
import { linkGuardianSchema } from '@/lib/validation/student'
import { linkGuardianToStudent } from '@/lib/students/guardian-link'
import type { Role } from '@prisma/client'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'read')) return errors.forbidden()

  const { id } = await params
  const guardians = await prisma.guardian.findMany({
    where: { students: { some: { id } } },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cnic: true,
      phoneNumber: true,
      email: true,
      relationship: true,
    },
  })

  return successResponse(guardians)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'students', 'update')) return errors.forbidden()

  const { id: studentId } = await params
  const student = await prisma.student.findUnique({ where: { id: studentId }, select: { id: true } })
  if (!student) return errors.notFound('Student')

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never)
  }

  const parsed = linkGuardianSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const cnic = parsed.data.cnic.replace(/\D/g, '')

  const alreadyLinked = await prisma.student.findFirst({
    where: {
      id: studentId,
      guardians: { some: { cnic } },
    },
    select: { id: true },
  })
  if (alreadyLinked) return errors.conflict('This guardian is already linked to the student')

  const guardianId = await prisma.$transaction(async (tx) => {
    const gid = await linkGuardianToStudent(tx, studentId, {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      cnic,
      phoneNumber: parsed.data.phoneNumber,
      email: parsed.data.email || undefined,
      relationship: parsed.data.relationship,
    })

    await tx.auditLog.create({
      data: {
        userId: session.user.id,
        action: 'UPDATE',
        entityType: 'Student',
        entityId: studentId,
        changes: { guardianLinked: cnic },
      },
    })

    return gid
  })

  const guardian = await prisma.guardian.findUnique({
    where: { id: guardianId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      cnic: true,
      phoneNumber: true,
      email: true,
      relationship: true,
    },
  })

  return createdResponse(guardian, 'Guardian linked successfully')
}
