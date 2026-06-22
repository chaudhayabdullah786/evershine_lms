/**
 * GET /api/exports/teachers
 * Returns ALL teachers (no pagination) for Excel export.
 * Includes credentials/user status, employee code, designation, qualification, salary details, and class assignments.
 *
 * RBAC: SUPER_ADMIN, ADMIN only.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'teachers', 'read')) return errors.forbidden()

  // Campus scoping: non-super-admins only see their campus
  const campusId =
    role === 'SUPER_ADMIN'
      ? (new URL(request.url).searchParams.get('campusId') ?? undefined)
      : (session.user.campusId ?? undefined)

  const teachers = await prisma.teacher.findMany({
    where: {
      ...(campusId && { campusId }),
    },
    orderBy: [
      { campus: { name: 'asc' } },
      { employeeId: 'asc' },
    ],
    select: {
      employeeId: true,
      firstName: true,
      lastName: true,
      designation: true,
      specialization: true,
      qualification: true,
      experienceYears: true,
      joiningDate: true,
      monthlySalary: true,
      isActive: true,
      campus: { select: { name: true, code: true } },
      classes: {
        select: {
          class: { select: { name: true } },
        },
      },
      subjects: {
        select: {
          subject: { select: { name: true } },
        },
      },
    },
  })

  // Format response for the Excel builder
  const formattedTeachers = teachers.map(t => ({
    employeeId: t.employeeId,
    firstName: t.firstName,
    lastName: t.lastName,
    designation: t.designation,
    specialization: t.specialization || 'N/A',
    qualification: t.qualification,
    experience: `${t.experienceYears} Years`,
    joiningDate: t.joiningDate,
    salary: t.monthlySalary ? Number(t.monthlySalary) : 0,
    isActive: t.isActive,
    campus: t.campus,
    classTeachers: t.classes,
    subjectTeachers: t.subjects,
  }))

  return successResponse(formattedTeachers)
}
