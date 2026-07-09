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

import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import type { Prisma, Role } from '@prisma/client'

export async function GET() {
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

  // Scope to campus for non-super-admins.
  const campusFilter: Prisma.StudentWhereInput = role !== 'SUPER_ADMIN' && campusId ? { campusId } : {}
  const teacherCampusFilter: Prisma.TeacherWhereInput = role !== 'SUPER_ADMIN' && campusId ? { campusId } : {}
  const invoiceCampusFilter: Prisma.FeeInvoiceWhereInput = Object.keys(campusFilter).length
    ? { student: campusFilter }
    : {}
  const paymentCampusFilter: Prisma.FeePaymentWhereInput = Object.keys(campusFilter).length
    ? { student: campusFilter }
    : {}
  const legacyAttendanceCampusFilter: Prisma.AttendanceWhereInput = Object.keys(campusFilter).length
    ? { class: { campusId } }
    : {}
  const modernAttendanceCampusFilter: Prisma.EnrollmentAttendanceRecordWhereInput = Object.keys(campusFilter).length
    ? { studentEnrollment: { student: campusFilter } }
    : {}
  
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
    totalFeeCollected,
    outstandingInvoices,
    legacyPresentRows,
    modernPresentRows,
    upcomingExams,
    recentAdmissions,
  ] = await prisma.$transaction([
    prisma.student.count({ where: { ...campusFilter, isActive: true } }),
    prisma.student.count({ where: { ...campusFilter, isActive: true, enrollmentStatus: 'ACTIVE' } }),
    prisma.teacher.count({ where: { ...teacherCampusFilter, isActive: true } }),
    prisma.feePayment.aggregate({
      where: {
        status: 'COMPLETED',
        ...paymentCampusFilter,
      },
      _sum: { amount: true },
    }),
    prisma.feeInvoice.findMany({
      where: {
        ...invoiceCampusFilter,
        status: { notIn: ['PAID', 'CANCELLED'] },
      },
      select: {
        studentId: true,
        status: true,
        dueDate: true,
        totalAmount: true,
        paidAmount: true,
      },
    }),
    prisma.attendance.findMany({
      where: {
        date: today,
        status: { in: ['PRESENT', 'LATE'] },
        ...legacyAttendanceCampusFilter,
      },
      select: { studentId: true },
    }),
    prisma.enrollmentAttendanceRecord.findMany({
      where: {
        attendanceDate: today,
        status: { in: ['PRESENT', 'LATE'] },
        ...modernAttendanceCampusFilter,
      },
      select: { studentEnrollment: { select: { studentId: true } } },
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

  const invoiceBalances = outstandingInvoices.map((invoice) => ({
    studentId: invoice.studentId,
    status: invoice.status,
    dueDate: invoice.dueDate,
    balance: Math.max(0, Number(invoice.totalAmount) - Number(invoice.paidAmount)),
  }))
  const pendingInvoiceBalances = invoiceBalances.filter((invoice) => invoice.balance > 0)
  const totalFeePending = pendingInvoiceBalances.reduce((sum, invoice) => sum + invoice.balance, 0)
  const feePendingCount = new Set(pendingInvoiceBalances.map((invoice) => invoice.studentId)).size
  const feeOverdueCount = new Set(
    pendingInvoiceBalances
      .filter((invoice) => invoice.status === 'OVERDUE' || invoice.dueDate < today)
      .map((invoice) => invoice.studentId)
  ).size

  const presentStudentIds = new Set<string>()
  for (const row of legacyPresentRows) presentStudentIds.add(row.studentId)
  for (const row of modernPresentRows) presentStudentIds.add(row.studentEnrollment.studentId)
  const todayAttendanceCount = presentStudentIds.size
  const totalStudentsForRate = activeStudents
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
      totalPending: totalFeePending,
      reserveFundBalance: Number(latestReserveFund?.cumulativeTotal ?? 0),
      latestReserveContribution: latestReserveFund
        ? {
            amount: Number(latestReserveFund.contributionAmount ?? 0),
            periodLabel: latestReserveFund.periodLabel,
            transactionDate: latestReserveFund.transactionDate,
          }
        : null,
      metricSource: 'fee_invoices_and_payments',
    },
    attendance: {
      todayPresent: todayAttendanceCount,
      todayTotal: totalStudentsForRate,
      attendanceRate,
      metricSource: 'student_attendance_records',
    },
    upcomingExams,
    recentAdmissions,
  })
}
