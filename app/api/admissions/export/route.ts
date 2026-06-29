/**
 * GET /api/admissions/export — Export admission requests as branded .xlsx
 *
 * RBAC: SUPER_ADMIN | ADMIN only.
 * Query: status, campusId, batchId
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors } from '@/lib/api-response'
import { createBrandedWorkbook, workbookToBuffer, generateExcelFilename } from '@/lib/excel/report-generator'
import type { ColumnDef } from '@/lib/excel/report-generator'
import type { Role } from '@prisma/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()

  const role = session.user.role as Role
  if (!['SUPER_ADMIN', 'ADMIN'].includes(role)) return errors.forbidden()

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') || undefined

  const where: Record<string, unknown> = {}
  if (status && status !== 'ALL') where.status = status

  const admissions = await prisma.admissionRequest.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  })

  // Resolve campus names from preferredCampusId
  const campusIds = [...new Set(admissions.map(a => a.preferredCampusId).filter(Boolean) as string[])]
  const campuses = campusIds.length > 0
    ? await prisma.campus.findMany({ where: { id: { in: campusIds } }, select: { id: true, name: true } })
    : []
  const campusMap = new Map(campuses.map(c => [c.id, c.name]))

  const columns: ColumnDef[] = [
    { header: 'S.No', key: 'sno', width: 6 },
    { header: 'First Name', key: 'firstName', width: 16 },
    { header: 'Last Name', key: 'lastName', width: 16 },
    { header: 'Father Name', key: 'fatherName', width: 20 },
    { header: 'CNIC / B-Form', key: 'cnicBForm', width: 18, forceText: true },
    { header: 'Date of Birth', key: 'dateOfBirth', width: 14 },
    { header: 'Gender', key: 'gender', width: 10 },
    { header: 'Phone', key: 'phone', width: 16, forceText: true },
    { header: 'Emergency Contact', key: 'emergencyContact', width: 18, forceText: true },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'City', key: 'city', width: 14 },
    { header: 'Province', key: 'province', width: 14 },
    { header: 'Guardian Name', key: 'guardianName', width: 20 },
    { header: 'Guardian CNIC', key: 'guardianCnic', width: 18, forceText: true },
    { header: 'Guardian Phone', key: 'guardianPhone', width: 16, forceText: true },
    { header: 'Requested Level', key: 'requestedLevel', width: 14 },
    { header: 'Requested Class', key: 'requestedClass', width: 14 },
    { header: 'Previous School', key: 'previousSchool', width: 22 },
    { header: 'Last Percentage', key: 'lastPercentage', width: 14 },
    { header: 'Campus', key: 'campus', width: 16 },
    { header: 'Preferred Shift', key: 'preferredShift', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Applied On', key: 'createdAt', width: 22 },
    { header: 'Admin Comments', key: 'adminComments', width: 28 },
  ]

  const rows = admissions.map((adm, idx) => ({
    sno: idx + 1,
    firstName: adm.firstName,
    lastName: adm.lastName,
    fatherName: adm.fatherName || '—',
    cnicBForm: adm.cnicBForm || '—',
    dateOfBirth: adm.dateOfBirth || '—',
    gender: adm.gender || '—',
    phone: adm.phoneNumber || '—',
    emergencyContact: adm.emergencyContact || '—',
    email: adm.email || '—',
    address: adm.address || '—',
    city: adm.city || '—',
    province: adm.province || '—',
    guardianName: `${adm.guardianFirstName || ''} ${adm.guardianLastName || ''}`.trim() || '—',
    guardianCnic: adm.guardianCnic || '—',
    guardianPhone: adm.guardianPhoneNumber || '—',
    requestedLevel: adm.requestedLevel || '—',
    requestedClass: adm.requestedClass || '—',
    previousSchool: adm.previousSchool || '—',
    lastPercentage: adm.lastPercentage != null ? `${adm.lastPercentage}%` : '—',
    campus: (adm.preferredCampusId && campusMap.get(adm.preferredCampusId)) || '—',
    preferredShift: adm.preferredShift || '—',
    status: adm.status,
    createdAt: adm.createdAt,
    adminComments: adm.adminComments || '—',
  }))

  // Summary
  const statusCounts = admissions.reduce((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const summaryRow: Record<string, string | number> = {
    sno: '',
    firstName: `Total: ${admissions.length}`,
    lastName: '',
    fatherName: '',
    cnicBForm: '',
    dateOfBirth: '',
    gender: '',
    phone: '',
    emergencyContact: '',
    email: '',
    address: '',
    city: '',
    province: '',
    guardianName: '',
    guardianCnic: '',
    guardianPhone: '',
    requestedLevel: '',
    requestedClass: '',
    previousSchool: '',
    lastPercentage: '',
    campus: '',
    preferredShift: '',
    status: Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(' | '),
    createdAt: '',
    adminComments: '',
  }

  const filterDesc = status && status !== 'ALL' ? `Status: ${status}` : 'All Records'

  const workbook = await createBrandedWorkbook({
    title: 'Student Admission Applications Report',
    subtitle: filterDesc,
    sheetName: 'Admissions',
    columns,
    rows,
    statusColumn: 'status',
    summaryRow,
  })

  const buffer = await workbookToBuffer(workbook)
  const bytes = Buffer.from(buffer)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const filename = generateExcelFilename('admissions')

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
