import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherByUserId, teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import type { Role } from '@prisma/client'
import ExcelJS from 'exceljs'

/**
 * Export teacher's daily attendance as Excel
 * Shows attendance for a specific date and class section
 */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'attendance', 'read')
  if (denied) return denied

  try {
    const body = await request.json()
    const { classSectionId, date } = body

    if (!classSectionId || !date) {
      return errors.validation({
        errors: [{ path: ['body'], message: 'classSectionId and date are required' }],
      } as never)
    }

    const activeYear = await getActiveAcademicYear()
    if (!activeYear) return errors.notFound('No active academic year')

    if (session.user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(session.user.id)
      if (!teacher) return errors.forbidden()
      const allowed = await teacherCanAccessClassSection(teacher.id, classSectionId, activeYear.id)
      if (!allowed) return errors.forbidden('Not assigned to this class')
    }

    const classSection = await prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: { batch: true, shift: true, campus: true },
    })

    if (!classSection) return errors.notFound('Class section not found')

    const attendanceDate = new Date(date)
    attendanceDate.setHours(0, 0, 0, 0)

    const enrollments = await prisma.studentEnrollment.findMany({
      where: {
        academicYearId: activeYear.id,
        classSectionId,
        status: 'ACTIVE',
      },
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            house: { select: { name: true } },
          },
        },
        attendanceRecords: {
          where: { attendanceDate },
          take: 1,
        },
      },
      orderBy: { rollNumber: 'asc' },
    })

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Daily Attendance')

    // Add title section
    worksheet.merge('A1:E1')
    const titleCell = worksheet.getCell('A1')
    titleCell.value = `${classSection.campus.name} - ${classSection.batch.name}`
    titleCell.font = { bold: true, size: 14 }
    titleCell.alignment = { horizontal: 'center' }

    worksheet.merge('A2:E2')
    const classCell = worksheet.getCell('A2')
    classCell.value = `Class: ${classSection.className}-${classSection.sectionName} | ${classSection.shift.name}`
    classCell.font = { bold: true }
    classCell.alignment = { horizontal: 'center' }

    worksheet.merge('A3:E3')
    const dateCell = worksheet.getCell('A3')
    dateCell.value = `Date: ${new Date(attendanceDate).toLocaleDateString('en-GB', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`
    dateCell.font = { size: 11 }
    dateCell.alignment = { horizontal: 'center' }

    worksheet.addRow([])

    // Set column widths
    worksheet.columns = [
      { header: 'Roll #', key: 'rollNumber', width: 8 },
      { header: 'Student Name', key: 'name', width: 25 },
      { header: 'House', key: 'house', width: 12 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Remarks', key: 'remarks', width: 20 },
    ]

    // Style header
    const headerRow = worksheet.getRow(5)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }

    // Add attendance data
    const statusMap: Record<string, string> = {
      PRESENT: '✓ Present',
      ABSENT: '✗ Absent',
      LATE: '⚠ Late',
      EXCUSED: '~ Excused',
    }

    enrollments.forEach((enrollment, idx) => {
      const record = enrollment.attendanceRecords[0]
      const status = record?.status ?? 'ABSENT'
      const row = worksheet.addRow({
        rollNumber: enrollment.rollNumber,
        name: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        house: enrollment.student.house?.name || 'Unassigned',
        status: statusMap[status],
        remarks: record?.remarks || '',
      })

      // Alternate row colors
      if ((idx + 1) % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } }
      }

      // Color code status
      const statusCell = row.getCell('status')
      if (status === 'PRESENT') {
        statusCell.font = { color: { argb: 'FF00B050' }, bold: true }
      } else if (status === 'ABSENT') {
        statusCell.font = { color: { argb: 'FFFF0000' }, bold: true }
      } else if (status === 'LATE') {
        statusCell.font = { color: { argb: 'FFFFC000' }, bold: true }
      }
    })

    // Add summary at bottom
    const summaryRow = enrollments.length + 7
    const totalPresent = enrollments.filter(
      (e) => e.attendanceRecords[0]?.status === 'PRESENT'
    ).length
    const totalAbsent = enrollments.filter(
      (e) => e.attendanceRecords[0]?.status === 'ABSENT'
    ).length
    const totalLate = enrollments.filter(
      (e) => e.attendanceRecords[0]?.status === 'LATE'
    ).length
    const totalExcused = enrollments.filter(
      (e) => e.attendanceRecords[0]?.status === 'EXCUSED'
    ).length

    worksheet.merge(`A${summaryRow}:B${summaryRow}`)
    const summaryTitle = worksheet.getCell(`A${summaryRow}`)
    summaryTitle.value = 'SUMMARY'
    summaryTitle.font = { bold: true, size: 11 }

    const metrics = [
      { label: 'Total Students:', value: enrollments.length },
      { label: 'Present:', value: totalPresent },
      { label: 'Absent:', value: totalAbsent },
      { label: 'Late:', value: totalLate },
      { label: 'Excused:', value: totalExcused },
    ]

    metrics.forEach((metric, idx) => {
      worksheet.getCell(`A${summaryRow + idx + 1}`).value = metric.label
      worksheet.getCell(`A${summaryRow + idx + 1}`).font = { bold: true }
      worksheet.getCell(`B${summaryRow + idx + 1}`).value = metric.value
    })

    const buffer = await workbook.xlsx.writeBuffer()

    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="attendance_${classSection.className}_${classSection.sectionName}_${date}.xlsx"`,
      },
    })
  } catch (err) {
    console.error('Teacher export error:', err)
    return errors.internal('Failed to generate export')
  }
}
