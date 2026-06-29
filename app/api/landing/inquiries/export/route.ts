/**
 * GET /api/landing/inquiries/export — Export inquiries as branded .xlsx
 *
 * RBAC: SUPER_ADMIN | ADMIN only.
 * Query params: status, from (ISO), to (ISO)
 *
 * WHY server-side Excel: Pakistani admin staff expect styled Excel reports,
 * not raw CSV. The branded workbook engine produces a print-ready .xlsx file.
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
  const from = searchParams.get('from') || undefined
  const to = searchParams.get('to') || undefined

  // Build filter
  const where: Record<string, unknown> = {}
  if (status && status !== 'ALL') where.status = status
  if (from || to) {
    where.createdAt = {
      ...(from ? { gte: new Date(from) } : {}),
      ...(to ? { lte: new Date(to) } : {}),
    }
  }

  const inquiries = await prisma.landingInquiry.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      name: true,
      phone: true,
      email: true,
      message: true,
      source: true,
      status: true,
      adminReply: true,
      createdAt: true,
      repliedAt: true,
    },
  })

  // Build column definitions
  const columns: ColumnDef[] = [
    { header: 'S.No', key: 'sno', width: 6 },
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Phone', key: 'phone', width: 16, forceText: true },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Message', key: 'message', width: 45 },
    { header: 'Source', key: 'source', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Admin Reply', key: 'adminReply', width: 35 },
    { header: 'Submitted At', key: 'createdAt', width: 22 },
    { header: 'Replied At', key: 'repliedAt', width: 22 },
  ]

  // Transform data rows
  const rows = inquiries.map((inq, idx) => ({
    sno: idx + 1,
    name: inq.name,
    phone: inq.phone,
    email: inq.email || '—',
    message: inq.message.length > 200 ? inq.message.slice(0, 200) + '…' : inq.message,
    source: inq.source,
    status: inq.status,
    adminReply: inq.adminReply || '—',
    createdAt: inq.createdAt,
    repliedAt: inq.repliedAt || '—',
  }))

  // Summary row
  const statusCounts = inquiries.reduce((acc, inq) => {
    acc[inq.status] = (acc[inq.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const summaryRow: Record<string, string | number> = {
    sno: '',
    name: `Total: ${inquiries.length}`,
    phone: '',
    email: '',
    message: '',
    source: '',
    status: Object.entries(statusCounts).map(([k, v]) => `${k}: ${v}`).join(' | '),
    adminReply: '',
    createdAt: '',
    repliedAt: '',
  }

  const filterDesc = [
    status && status !== 'ALL' ? `Status: ${status}` : null,
    from ? `From: ${from}` : null,
    to ? `To: ${to}` : null,
  ].filter(Boolean).join(' | ') || 'All Records'

  const workbook = await createBrandedWorkbook({
    title: 'Visitor Inquiries Report',
    subtitle: filterDesc,
    sheetName: 'Inquiries',
    columns,
    rows,
    statusColumn: 'status',
    summaryRow,
  })

  const buffer = await workbookToBuffer(workbook)
  const bytes = Buffer.from(buffer)
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  const filename = generateExcelFilename('inquiries')

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
