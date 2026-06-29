/**
 * GET /api/staff-applications/export — Export staff applications as branded .xlsx
 *
 * RBAC: SUPER_ADMIN only.
 * Query: status, type (applicant type)
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors } from '@/lib/api-response'
import { createBrandedWorkbook, workbookToBuffer, generateExcelFilename } from '@/lib/excel/report-generator'
import type { ColumnDef } from '@/lib/excel/report-generator'
import type { Role, Prisma } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (role !== 'SUPER_ADMIN') return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || undefined
  const type = searchParams.get('type') || undefined

  const where: Prisma.StaffApplicationRequestWhereInput = {}
  if (status && status !== 'ALL') where.status = status as Prisma.EnumStaffApplicationStatusFilter
  if (type && type !== 'ALL') where.applicantType = type as Prisma.EnumStaffApplicantTypeFilter

  const applications = await prisma.staffApplicationRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  const columns: ColumnDef[] = [
    { header: 'S.No', key: 'sno', width: 6 },
    { header: 'Full Name', key: 'fullName', width: 22 },
    { header: 'CNIC', key: 'cnic', width: 18, forceText: true },
    { header: 'Applicant Type', key: 'applicantType', width: 16 },
    { header: 'Qualification', key: 'qualification', width: 14 },
    { header: 'Specialization', key: 'specialization', width: 20 },
    { header: 'Experience (Yrs)', key: 'experienceYears', width: 14 },
    { header: 'Phone', key: 'phone', width: 16, forceText: true },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Preferred Shift', key: 'preferredShift', width: 14 },
    { header: 'CV Link', key: 'cvLink', width: 30 },
    { header: 'Status', key: 'status', width: 18 },
    { header: 'Interview Date', key: 'interviewDate', width: 20 },
    { header: 'Admin Notes', key: 'adminNotes', width: 30 },
    { header: 'Employee ID', key: 'employeeId', width: 16 },
    { header: 'Applied On', key: 'createdAt', width: 22 },
  ]

  const rows = applications.map((app, idx) => ({
    sno: idx + 1,
    fullName: app.fullName,
    cnic: app.cnic,
    applicantType: app.applicantType,
    qualification: app.qualification,
    specialization: app.specialization,
    experienceYears: app.experienceYears,
    phone: app.phone,
    email: app.email,
    preferredShift: app.preferredShift || '—',
    cvLink: app.cvDocUrl || app.cvLink || '—',
    status: app.status,
    interviewDate: app.interviewDate || '—',
    adminNotes: app.adminNotes || '—',
    employeeId: app.provisionedUserId ? 'Provisioned' : '—',
    createdAt: app.createdAt,
  }))

  // Summary counts
  const typeCounts = applications.reduce((acc, a) => {
    acc[a.applicantType] = (acc[a.applicantType] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const statusCounts = applications.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const summaryRow: Record<string, string | number> = {
    sno: '',
    fullName: `Total: ${applications.length}`,
    cnic: '',
    applicantType: Object.entries(typeCounts).map(([k, v]) => `${k}: ${v}`).join(' | '),
    qualification: '',
    specialization: '',
    experienceYears: '',
    phone: '',
    email: '',
    preferredShift: '',
    cvLink: '',
    status: Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(' | '),
    interviewDate: '',
    adminNotes: '',
    employeeId: '',
    createdAt: '',
  }

  const filterDesc = [
    status && status !== 'ALL' ? `Status: ${status}` : null,
    type && type !== 'ALL' ? `Type: ${type}` : null,
  ].filter(Boolean).join(' | ') || 'All Records'

  const workbook = await createBrandedWorkbook({
    title: 'Staff Applications Report',
    subtitle: filterDesc,
    sheetName: 'Staff Applications',
    columns,
    rows,
    statusColumn: 'status',
    summaryRow,
  })

  const buffer = await workbookToBuffer(workbook)
  const bytes = Buffer.from(buffer)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const filename = generateExcelFilename('staff_applications')

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
