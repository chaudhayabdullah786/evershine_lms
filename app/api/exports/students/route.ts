/**
 * GET /api/exports/students
 * Returns ALL active students (no pagination) for Excel export.
 * Includes full profile, placement, fee summary, and contact data.
 *
 * RBAC: SUPER_ADMIN, ADMIN only.
 * WHY unbounded: Export routes intentionally bypass pagination.
 *   They are admin-only, called synchronously, and results are
 *   streamed to the client as a file — not rendered in the UI.
 *   Max expected rows: ~2000 students per campus, well within
 *   Neon's response window with a single optimized query.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { checkPermission } from '@/lib/rbac'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import { getActiveAcademicYear } from '@/lib/academic/engine'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!checkPermission(role, 'students', 'read')) return errors.forbidden()

  // Campus scoping: non-super-admins only see their campus
  const campusId =
    role === 'SUPER_ADMIN'
      ? (new URL(request.url).searchParams.get('campusId') ?? undefined)
      : (session.user.campusId ?? undefined)

  const activeYear = await getActiveAcademicYear()
  const students = await prisma.student.findMany({
    where: {
      ...(campusId && { campusId }),
    },
    orderBy: [
      { campus: { name: 'asc' } },
      { batch: { name: 'asc' } },
      { class: { grade: 'asc' } },
      { section: 'asc' },
      { rollNumber: 'asc' },
    ],
    select: {
      registrationNumber: true,
      rollNumber: true,
      firstName: true,
      lastName: true,
      fatherName: true,
      gender: true,
      dateOfBirth: true,
      cnicBForm: true,
      bloodGroup: true,
      religion: true,
      nationality: true,
      address: true,
      city: true,
      province: true,
      phoneNumber: true,
      emergencyContact: true,
      email: true,
      section: true,
      academicYear: true,
      admissionDate: true,
      enrollmentStatus: true,
      feeStatus: true,
      totalFeeAmount: true,
      paidAmount: true,
      dueAmount: true,
      isActive: true,
      campus: { select: { name: true, code: true } },
      batch: { select: { name: true, code: true } },
      class: { select: { name: true, grade: true } },
      house: { select: { name: true } },
      enrollments: {
        where: {
          status: 'ACTIVE',
          ...(activeYear ? { academicYearId: activeYear.id } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: {
          rollNumber: true,
          classSection: {
            select: {
              className: true,
              sectionName: true,
              shift: { select: { name: true, code: true } },
            },
          },
        },
      },
    },
  })

  return successResponse(students.map(({ enrollments, ...student }) => ({
    ...student,
    activeEnrollments: enrollments,
  })))
}
