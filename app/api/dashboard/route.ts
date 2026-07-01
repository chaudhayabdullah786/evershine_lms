/**
 * GET /api/dashboard — aggregated stats for the dashboard.
 * Returns different data depending on the user's role.
 *
 * WHY $transaction for all counts: Ensures all stats are from the same
 * DB snapshot. Without a transaction, concurrent writes between queries
 * could produce inconsistent totals.
 *
 * TRADEOFF: This query is read-heavy. If p95 latency degrades, consider
 * caching the result in Upstash Redis with a 5-minute TTL.
 */

import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import type { Role } from '@prisma/client'

export async function GET(_request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  // Verify that the user account is actually still active in the database.
  // This prevents suspended users from continuing to use the dashboard via unexpired JWTs.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isActive: true }
  })
  if (!user || !user.isActive) {
    return errors.unauthorized()
  }

  const role = session.user.role as Role
  const campusId = session.user.campusId ?? undefined

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Scope to campus for non-super-admins
  const campusFilter = role !== 'SUPER_ADMIN' && campusId ? { campusId } : {}
  
  let studentClassId: string | undefined
  if (role === 'STUDENT') {
    const student = await prisma.student.findUnique({
      where: { userId: session.user.id },
      select: { classId: true }
    })
    if (student?.classId) {
      studentClassId = student.classId
    }
  }

  const [
    totalStudents,
    activeStudents,
    totalTeachers,
    feePendingCount,
    feeOverdueCount,
    totalFeeCollected,
    totalFeePending,
    todayAttendanceCount,
    totalStudentsForRate,
    upcomingExams,
    recentAdmissions,
  ] = await prisma.$transaction([
    prisma.student.count({ where: { ...campusFilter, isActive: true } }),
    prisma.student.count({ where: { ...campusFilter, isActive: true, enrollmentStatus: 'ACTIVE' } }),
    prisma.teacher.count({ where: { ...campusFilter, isActive: true } }),
    prisma.student.count({ where: { ...campusFilter, isActive: true, feeStatus: 'PENDING' } }),
    prisma.student.count({ where: { ...campusFilter, isActive: true, feeStatus: 'OVERDUE' } }),
    prisma.feePayment.aggregate({
      where: {
        status: 'COMPLETED',
        ...(campusId ? { student: { campusId } } : {}),
      },
      _sum: { amount: true },
    }),
    prisma.student.aggregate({
      where: { ...campusFilter, isActive: true },
      _sum: { dueAmount: true },
    }),
    prisma.attendance.count({
      where: {
        date: today,
        status: 'PRESENT',
        ...(campusId ? { class: { campusId } } : {}),
      },
    }),
    prisma.attendance.count({
      where: {
        date: today,
        ...(campusId ? { class: { campusId } } : {}),
      },
    }),
    prisma.exam.findMany({
      where: {
        startDate: { gte: today },
        isActive: true,
        ...(role === 'STUDENT' 
          ? (studentClassId ? { classId: studentClassId } : { id: 'no-match' }) 
          : (campusId ? { class: { campusId } } : {})),
      },
      orderBy: { startDate: 'asc' },
      take: 5,
      select: { id: true, name: true, startDate: true, endDate: true, class: { select: { name: true } } },
    }),
    prisma.student.findMany({
      where: { ...campusFilter, isActive: true },
      orderBy: { admissionDate: 'desc' },
      take: 5,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        registrationNumber: true,
        admissionDate: true,
        campus: { select: { name: true } },
        batch: { select: { name: true } },
      },
    }),
  ])

  const attendanceRate =
    totalStudentsForRate > 0
      ? Math.round((todayAttendanceCount / totalStudentsForRate) * 100)
      : 0

  const latestReserveFund = role === 'SUPER_ADMIN'
    ? await prisma.reserveFundLedger.findFirst({
        orderBy: { transactionDate: 'desc' },
        select: {
          cumulativeTotal: true,
          contributionAmount: true,
          periodLabel: true,
          transactionDate: true,
        },
      })
    : null

  return successResponse({
    students: {
      total: totalStudents,
      active: activeStudents,
      feePending: feePendingCount,
      feeOverdue: feeOverdueCount,
    },
    teachers: { total: totalTeachers },
    finance: {
      totalCollected: Number(totalFeeCollected._sum.amount ?? 0),
      totalPending: Number(totalFeePending._sum.dueAmount ?? 0),
      reserveFundBalance: Number(latestReserveFund?.cumulativeTotal ?? 0),
      latestReserveContribution: latestReserveFund
        ? {
            amount: Number(latestReserveFund.contributionAmount ?? 0),
            periodLabel: latestReserveFund.periodLabel,
            transactionDate: latestReserveFund.transactionDate,
          }
        : null,
    },
    attendance: {
      todayPresent: todayAttendanceCount,
      todayTotal: totalStudentsForRate,
      attendanceRate,
    },
    upcomingExams,
    recentAdmissions,
  })
}
