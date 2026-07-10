import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'
import { dispatchBulkNotification, getStudentUserIdsForSection } from '@/lib/notifications/dispatch'
import { type MonthlyMonitoringRepository } from '@/lib/academic/monitoring-report'

export const dynamic = 'force-dynamic'

const monitoringModel = prisma.monthlyMonitoringReport as unknown as MonthlyMonitoringRepository

export async function POST(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (!['TEACHER', 'ADMIN', 'SUPER_ADMIN'].includes(session.user.role)) return errors.forbidden()
    const body = await request.json()
    const classSectionId = String(body.classSectionId ?? '')
    const month = Number(body.month)
    const year = Number(body.year)
    const academicYearId = String(body.academicYearId ?? '')
    if (!classSectionId || !academicYearId || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year)) return errors.badRequest('classSectionId, academicYearId, month, and year are required.')
    const report = await monitoringModel.findUnique({ where: { classSectionId_month_year_academicYearId: { classSectionId, month, year, academicYearId } } })
    if (!report) return errors.notFound('Monthly monitoring report')
    if (report.declarationStatus === 'DECLARED') return errors.badRequest('Monthly monitoring report is already declared.')
    if (session.user.role === 'TEACHER') {
      const teacher = await prisma.teacher.findUnique({ where: { userId: session.user.id }, select: { id: true } })
      const assigned = teacher && await prisma.subjectOffering.findFirst({ where: { classSectionId, teacherId: teacher.id }, select: { id: true } })
      if (!assigned) return errors.forbidden('You are not assigned to this class section.')
    }
    const declaredAt = new Date()
    const updateResult = await monitoringModel.updateMany({
      where: { id: report.id, declarationStatus: 'DRAFT' },
      data: { declarationStatus: 'DECLARED', declaredAt, declaredById: session.user.id },
    })
    if (updateResult.count !== 1) {
      return errors.badRequest('Monthly monitoring report is already declared.')
    }
    const declared = { ...report, declarationStatus: 'DECLARED' as const, declaredAt, declaredById: session.user.id }
    // Publication must not roll back if notification delivery is unavailable.
    try {
      const userIds = await getStudentUserIdsForSection(classSectionId)
      if (userIds.length) await dispatchBulkNotification({ userIds, title: 'Monthly monitoring report published', message: 'Your monthly monitoring report is now available in the portal.', type: 'RESULT_PUBLISHED', relatedId: report.id })
    } catch (notificationError) {
      console.error('[MONTHLY_MONITORING_NOTIFY]', notificationError)
    }
    return successResponse(declared, 'Monthly monitoring report declared successfully')
  } catch (error) {
    console.error('[MONTHLY_MONITORING_DECLARE]', error)
    return errors.internal()
  }
}
