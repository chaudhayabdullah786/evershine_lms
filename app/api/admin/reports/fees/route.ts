/**
 * GET /api/admin/reports/fees — outstanding ledger, total collected fee amounts, and overdue accounts.
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
  if (!checkPermission(role, 'documents', 'read')) return errors.forbidden()

  const campusId = session.user.campusId ?? undefined
  const campusFilter = role !== 'SUPER_ADMIN' && campusId ? { campusId } : {}

  const [totalCollected, students] = await Promise.all([
    // Total collected sum (payments completed)
    prisma.feePayment.aggregate({
      where: {
        status: 'COMPLETED',
        ...(campusId ? { student: { campusId } } : {}),
      },
      _sum: {
        amount: true,
      },
    }),
    // Fetch all active students with their current fee profiles
    prisma.student.findMany({
      where: {
        isActive: true,
        ...campusFilter,
      },
      orderBy: {
        dueAmount: 'desc',
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        rollNumber: true,
        registrationNumber: true,
        totalFeeAmount: true,
        paidAmount: true,
        dueAmount: true,
        feeStatus: true,
        class: { select: { name: true } },
        section: true,
        campus: { select: { name: true } },
      },
    }),
  ])

  const totalOutstanding = students.reduce((sum, s) => sum + Number(s.dueAmount), 0)
  const overdueCount = students.filter(s => Number(s.dueAmount) > 0).length

  const studentsList = students.map(student => ({
    name: `${student.firstName} ${student.lastName}`,
    classSection: `${student.class?.name || 'Scholar'} - ${student.section || 'General'}`,
    registrationNumber: student.registrationNumber,
    rollNumber: student.rollNumber || 'N/A',
    totalFee: Number(student.totalFeeAmount),
    paidFee: Number(student.paidAmount),
    dueFee: Number(student.dueAmount),
    status: student.feeStatus,
    campus: student.campus?.name || 'N/A',
  }))

  const overdueStudentsList = studentsList.filter(s => s.dueFee > 0)

  return successResponse({
    totalOutstanding,
    totalCollected: Number(totalCollected._sum.amount ?? 0),
    overdueStudentsCount: overdueCount,
    overdueStudentsList,
    studentsList,
  })
}
