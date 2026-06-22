/**
 * GET /api/exports/fees
 * Returns ALL fee invoices (no pagination) for Excel export.
 * Includes student registration details, class, section, campus, month/academic year, dues, discount, subtotal, late fee, total amount, paid amount, status, bank info, and proof status.
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
  if (!checkPermission(role, 'fees', 'read')) return errors.forbidden()

  // Campus scoping: non-super-admins only see their campus
  const campusId =
    role === 'SUPER_ADMIN'
      ? (new URL(request.url).searchParams.get('campusId') ?? undefined)
      : (session.user.campusId ?? undefined)

  const invoices = await prisma.feeInvoice.findMany({
    where: {
      student: {
        ...(campusId && { campusId }),
      },
    },
    orderBy: { createdAt: 'desc' },
    select: {
      challanNumber: true,
      month: true,
      academicYear: true,
      dueDate: true,
      subtotal: true,
      discount: true,
      lateFee: true,
      totalAmount: true,
      paidAmount: true,
      status: true,
      proofStatus: true,
      bankAccounts: true,
      createdAt: true,
      student: {
        select: {
          registrationNumber: true,
          firstName: true,
          lastName: true,
          campus: { select: { name: true } },
          class: { select: { name: true } },
          section: true,
        },
      },
    },
  })

  // Format into a flat list for tabular export
  const formattedInvoices = invoices.map(inv => {
    const total = Number(inv.totalAmount)
    const paid = Number(inv.paidAmount)
    const due = Math.max(0, total - paid)
    
    // Status normalization
    let calculatedStatus = inv.status.toString()
    if (inv.status === 'PAID') {
      calculatedStatus = 'PAID'
    } else if (inv.status === 'PARTIALLY_PAID') {
      calculatedStatus = 'PARTIAL'
    } else if (due > 0 && new Date(inv.dueDate) < new Date()) {
      calculatedStatus = 'DEFAULTER (OVERDUE)'
    } else {
      calculatedStatus = 'UNPAID'
    }

    return {
      challanNumber: inv.challanNumber,
      studentName: `${inv.student.firstName} ${inv.student.lastName}`,
      registrationNumber: inv.student.registrationNumber,
      classSection: `${inv.student.class?.name || 'Scholar'} - ${inv.student.section || 'General'}`,
      campus: inv.student.campus?.name || 'N/A',
      billingMonth: inv.month,
      academicYear: inv.academicYear,
      dueDate: inv.dueDate,
      subtotal: Number(inv.subtotal),
      discount: Number(inv.discount),
      lateFee: Number(inv.lateFee),
      totalAmount: total,
      paidAmount: paid,
      remainingDues: due,
      status: calculatedStatus,
      proofStatus: inv.proofStatus || 'No Proof Uploaded',
      bankAccounts: inv.bankAccounts || 'Default Bank',
      issuedDate: inv.createdAt,
    }
  })

  return successResponse(formattedInvoices)
}
