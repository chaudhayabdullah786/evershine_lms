import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { buildStudentMonitoringReport, type MonitoringReportKind } from '@/lib/academic/monitoring-report-service'

function parseType(value: string | null): MonitoringReportKind {
  return value === 'yearly' || value === 'monthly' || value === 'daily' ? value : 'daily'
}

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'STUDENT') return errors.forbidden()

  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!student) return errors.notFound('Student')

  const { searchParams } = new URL(request.url)
  const type = parseType(searchParams.get('type'))
  const month = Number(searchParams.get('month')) || null
  const year = Number(searchParams.get('year')) || null

  const report = await buildStudentMonitoringReport(student.id, {
    type,
    date: searchParams.get('date'),
    month,
    year,
  })

  return successResponse(report)
}
