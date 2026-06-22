/**
 * GET  /api/teachers  — paginated staff list
 * POST /api/teachers  — create staff member (Admin/Super Admin only)
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, createdResponse, paginatedResponse } from '@/lib/api-response'
import { createTeacherSchema, teacherQuerySchema } from '@/lib/validation/teacher'
import { hash } from '@node-rs/argon2'
import type { Role } from '@prisma/client'
import { sendTeacherWelcomeEmail } from '@/lib/email'
import { getEmployeeIdPrefix, isTeachingDesignation } from '@/lib/constants/staff-designations'

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'teachers', 'read')) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const parsed = teacherQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { page, limit, search, campusId, batchId, isActive } = parsed.data

  const scopedCampusId =
    session.user.role !== 'SUPER_ADMIN' ? (session.user.campusId ?? undefined) : campusId

  const where = {
    ...(scopedCampusId && { campusId: scopedCampusId }),
    ...(batchId && { batchId }),
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { firstName: { contains: search, mode: 'insensitive' as const } },
        { lastName: { contains: search, mode: 'insensitive' as const } },
        { employeeId: { contains: search, mode: 'insensitive' as const } },
        { specialization: { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [total, teachers] = await prisma.$transaction([
    prisma.teacher.count({ where }),
    prisma.teacher.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        lastName: true,
        designation: true,
        specialization: true,
        qualification: true,
        experienceYears: true,
        phoneNumber: true,
        email: true,
        profilePicture: true,
        isActive: true,
        joiningDate: true,
        campus: { select: { id: true, name: true, code: true } },
        batch: { select: { id: true, name: true } },
        house: { select: { id: true, name: true } },
      },
    }),
  ])

  return paginatedResponse(teachers, { page, limit, total })
}

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (!checkPermission(session.user.role as Role, 'teachers', 'create')) return errors.forbidden()

  let body: unknown
  try { body = await request.json() } catch { return errors.validation({ errors: [{ path: [], message: 'Invalid JSON' }] } as never) }

  const parsed = createTeacherSchema.safeParse(body)
  if (!parsed.success) return errors.validation(parsed.error)

  const data = parsed.data

  // Check duplicates before starting the transaction.
  // WHY: the auth `users.email` column has a unique constraint, so a duplicate
  // email must fail fast with a 409 instead of bubbling up as a raw Prisma error.
  const [existingCnic, existingTeacherEmail, existingUserEmail] = await Promise.all([
    prisma.teacher.findUnique({ where: { cnic: data.cnic }, select: { id: true } }),
    prisma.teacher.findUnique({ where: { email: data.email }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }),
  ])

  if (existingCnic) return errors.conflict('A teacher with this CNIC already exists')
  if (existingTeacherEmail || existingUserEmail) {
    return errors.conflict('A teacher with this email already exists')
  }

  // Resolve the final designation: if 'Other' was selected, use the custom text
  const resolvedDesignation = data.designation === 'Other' && data.customDesignation
    ? data.customDesignation
    : data.designation

  // Auto-generate employee ID with designation-aware prefix
  const prefix = getEmployeeIdPrefix(resolvedDesignation)
  const teacherCount = await prisma.teacher.count()
  const employeeId = `${prefix}-${String(teacherCount + 1).padStart(3, '0')}`

  // Hash the password outside the transaction to avoid long-running CPU work
  // inside Prisma's transaction timeout window.
  const passwordHash = await hash(data.password, ARGON2_OPTIONS)

  let teacher: Awaited<ReturnType<typeof prisma.teacher.create>>

  try {
    teacher = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash,
          role: 'TEACHER',
          isActive: true,
        },
      })

      const newTeacher = await tx.teacher.create({
        data: {
          userId: user.id,
          employeeId,
          firstName: data.firstName,
          lastName: data.lastName,
          cnic: data.cnic,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender,
          qualification: data.qualification,
          specialization: data.specialization,
          experienceYears: data.experienceYears,
          joiningDate: new Date(data.joiningDate),
          phoneNumber: data.phoneNumber,
          email: data.email,
          address: data.address,
          city: data.city,
          emergencyContact: data.emergencyContact,
          campusId: data.campusId,
          batchId: data.batchId || null,
          houseId: data.houseId || null,
          designation: resolvedDesignation,
          monthlySalary: data.monthlySalary,
          profilePicture: data.profilePicture || null,
        },
      })

      // Process class assignments only for teaching designations
      if (isTeachingDesignation(resolvedDesignation) && data.classAssignments && data.classAssignments.length > 0) {
        const classesData = await tx.class.findMany({
          where: { id: { in: data.classAssignments.map((c) => c.classId) } },
          select: { id: true, academicYear: true },
        })

        const classYearMap = new Map(classesData.map((c) => [c.id, c.academicYear]))

        const classTeacherData = data.classAssignments.map((assign) => ({
          classId: assign.classId,
          teacherId: newTeacher.id,
          isClassTeacher: assign.isClassTeacher,
          academicYear: classYearMap.get(assign.classId) || '2026-2027',
        }))

        await tx.classTeacher.createMany({
          data: classTeacherData,
        })
      }

      await tx.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'CREATE',
          entityType: 'Teacher',
          entityId: newTeacher.id,
          changes: { employeeId, campusId: data.campusId, houseId: data.houseId || null },
        },
      })

      return newTeacher
    })
  } catch (txErr: any) {
    if (txErr?.code === 'P2002') {
      const target = txErr?.meta?.target?.join(', ') ?? 'field'
      return errors.conflict(`Duplicate value for ${target}. Please check the email or CNIC.`)
    }

    console.error('[TEACHERS_POST] transaction error', txErr)
    return errors.internal()
  }

  // Send credentials welcome email asynchronously
  try {
    await sendTeacherWelcomeEmail(data.email, data.password, `${data.firstName} ${data.lastName}`)
  } catch (emailErr) {
    console.error('Failed to send teacher welcome email:', emailErr)
  }

  return createdResponse(
    { id: teacher.id, employeeId: teacher.employeeId },
    `Staff member ${data.firstName} ${data.lastName} (${resolvedDesignation}) created successfully`
  )
}
