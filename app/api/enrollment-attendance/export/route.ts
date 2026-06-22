import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import { requireSession, requirePermission } from '@/lib/academic/api-helpers'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { getTeacherByUserId, teacherCanAccessClassSection } from '@/lib/academic/teacher-scope'
import type { Role } from '@prisma/client'
import ExcelJS from 'exceljs'

/** Export attendance as Excel file */
export async function POST(request: NextRequest) {
  const { session, error } = await requireSession()
  if (error || !session) return error!
  const denied = requirePermission(session.user.role as Role, 'attendance', 'read')
  if (denied) return denied

  try {
    const body = await request.json()
    const { classSectionId, startDate, endDate, batchId, shiftId, houseId } = body

    if (!classSectionId || !startDate || !endDate) {
      return errors.validation({
        errors: [{ path: ['body'], message: 'classSectionId, startDate, and endDate are required' }],
      } as never)
    }

    const activeYear = await getActiveAcademicYear()
    if (!activeYear) return errors.notFound('No active academic year')

    if (session.user.role === 'TEACHER') {
      const teacher = await getTeacherByUserId(session.user.id)
      if (!teacher) return errors.forbidden()
      const allowed = await teacherCanAccessClassSection(teacher.id, classSectionId, activeYear.id)
      if (!allowed) return errors.forbidden('You are not assigned to this section')
    }

    const classSection = await prisma.classSection.findUnique({
      where: { id: classSectionId },
      include: {
        batch: true,
        shift: true,
        campus: true,
      },
    })

    if (!classSection) return errors.notFound('Class section not found')

    // Build where clause with optional filters
    const whereFilters: any = {
      academicYearId: activeYear.id,
      classSectionId,
      status: 'ACTIVE',
    }

    if (batchId) whereFilters.classSection = { batch: { id: batchId } }
    if (shiftId) whereFilters.classSection = { ...whereFilters.classSection, shift: { id: shiftId } }
    if (houseId) whereFilters.student = { house: { id: houseId } }

    const enrollments = await prisma.studentEnrollment.findMany({
      where: whereFilters,
      include: {
        student: {
          select: {
            firstName: true,
            lastName: true,
            house: { select: { name: true, color: true } },
          },
        },
        attendanceRecords: {
          where: {
            attendanceDate: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
          select: {
            attendanceDate: true,
            status: true,
          },
          orderBy: { attendanceDate: 'asc' },
        },
      },
      orderBy: { rollNumber: 'asc' },
    })

    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet('Attendance Overview')

    const start = new Date(startDate)
    const end = new Date(endDate)
    start.setHours(0, 0, 0, 0)
    end.setHours(23, 59, 59, 999)

    const dates = Array.from(
      new Set(enrollments.flatMap((enrollment) => enrollment.attendanceRecords.map((record) => record.attendanceDate.toISOString().slice(0, 10))))
    ).sort()

    const statusShortMap: Record<string, string> = {
      PRESENT: 'P',
      ABSENT: 'A',
      LATE: 'L',
      EXCUSED: 'E',
    }

    worksheet.addRow([])
    const titleCell = worksheet.getCell('A1')
    titleCell.value = `${classSection.campus.name} • ${classSection.batch.name}`
    titleCell.font = { bold: true, size: 14 }
    titleCell.alignment = { horizontal: 'center' }

    worksheet.columns = [
      { header: 'Roll #', key: 'rollNumber', width: 8 },
      { header: 'Student Name', key: 'studentName', width: 24 },
      { header: 'House', key: 'house', width: 12 },
      ...dates.map((date) => ({ header: date, key: date, width: 10 })),
      { header: 'Present', key: 'present', width: 9 },
      { header: 'Absent', key: 'absent', width: 9 },
      { header: 'Late', key: 'late', width: 9 },
      { header: 'Excused', key: 'excused', width: 10 },
      { header: 'Attendance %', key: 'attendancePercentage', width: 13 },
    ]

    const lastColumn = String.fromCharCode(64 + worksheet.columns.length)
    worksheet.mergeCells(`A1:${lastColumn}1`)

    worksheet.addRow([`Class: ${classSection.className}-${classSection.sectionName}`])
    worksheet.mergeCells(`A2:${lastColumn}2`)
    worksheet.getCell('A2').font = { bold: true }
    worksheet.getCell('A2').alignment = { horizontal: 'center' }

    worksheet.addRow([`Attendance Period: ${start.toLocaleDateString('en-GB')} to ${end.toLocaleDateString('en-GB')}`])
    worksheet.mergeCells(`A3:${lastColumn}3`)
    worksheet.getCell('A3').alignment = { horizontal: 'center' }
    worksheet.addRow([])

    const headerRow = worksheet.getRow(5)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } }

    const recordsByStudent = new Map<string, Map<string, string>>()
    enrollments.forEach((enrollment) => {
      const map = new Map<string, string>()
      enrollment.attendanceRecords.forEach((record) => {
        map.set(record.attendanceDate.toISOString().slice(0, 10), record.status)
      })
      recordsByStudent.set(enrollment.studentId, map)
    })

    enrollments.forEach((enrollment, index) => {
      const statusMap = recordsByStudent.get(enrollment.studentId) ?? new Map<string, string>()
      const present = Array.from(statusMap.values()).filter((value) => value === 'PRESENT').length
      const absent = Array.from(statusMap.values()).filter((value) => value === 'ABSENT').length
      const late = Array.from(statusMap.values()).filter((value) => value === 'LATE').length
      const excused = Array.from(statusMap.values()).filter((value) => value === 'EXCUSED').length
      const totalDays = present + absent + late + excused
      const attendancePercentage = totalDays > 0 ? Math.round(((present + late) / totalDays) * 100) : 0

      const rowValues: Record<string, unknown> = {
        rollNumber: enrollment.rollNumber,
        studentName: `${enrollment.student.firstName} ${enrollment.student.lastName}`,
        house: enrollment.student.house?.name || 'Unassigned',
        present,
        absent,
        late,
        excused,
        attendancePercentage: `${attendancePercentage}%`,
      }

      dates.forEach((date) => {
        const status = statusMap.get(date)
        rowValues[date] = status ? statusShortMap[status] : '—'
      })

      const row = worksheet.addRow(rowValues)
      if ((index + 1) % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F9FC' } }
      }

      if (attendancePercentage >= 85) {
        row.getCell('attendancePercentage').font = { color: { argb: 'FF1F9D62' }, bold: true }
      } else if (attendancePercentage >= 75) {
        row.getCell('attendancePercentage').font = { color: { argb: 'FFE0A800' }, bold: true }
      } else {
        row.getCell('attendancePercentage').font = { color: { argb: 'FFCC0000' }, bold: true }
      }
    })

    const summaryStart = enrollments.length + 7
    const allRecords = enrollments.flatMap((enrollment) => enrollment.attendanceRecords)
    const totalPresent = allRecords.filter((record) => record.status === 'PRESENT').length
    const totalAbsent = allRecords.filter((record) => record.status === 'ABSENT').length
    const totalLate = allRecords.filter((record) => record.status === 'LATE').length
    const totalExcused = allRecords.filter((record) => record.status === 'EXCUSED').length
    const totalAttendanceDays = totalPresent + totalAbsent + totalLate + totalExcused

    worksheet.mergeCells(`A${summaryStart}:B${summaryStart}`)
    const summaryTitle = worksheet.getCell(`A${summaryStart}`)
    summaryTitle.value = 'FINAL SUMMARY STATISTICS'
    summaryTitle.font = { bold: true, size: 12, color: { argb: 'FF1F4E78' } }

    const summaryItems = [
      ['Total Students', enrollments.length],
      ['Attendance Records', totalAttendanceDays],
      ['Present', totalPresent],
      ['Absent', totalAbsent],
      ['Late', totalLate],
      ['Excused', totalExcused],
    ]

    summaryItems.forEach((item, offset) => {
      worksheet.getCell(`A${summaryStart + 1 + offset}`).value = item[0]
      worksheet.getCell(`A${summaryStart + 1 + offset}`).font = { bold: true }
      worksheet.getCell(`B${summaryStart + 1 + offset}`).value = item[1]
    })

    worksheet.getCell(`A${summaryStart + 7}`).value = 'Overall Attendance Rate'
    worksheet.getCell(`A${summaryStart + 7}`).font = { bold: true }
    worksheet.getCell(`B${summaryStart + 7}`).value =
      totalAttendanceDays > 0
        ? `${Math.round((((totalPresent + totalLate) / totalAttendanceDays) * 100) || 0)}%`
        : '0%'

    worksheet.getCell(`A${summaryStart + 8}`).value = 'Generated On'
    worksheet.getCell(`A${summaryStart + 8}`).font = { bold: true }
    worksheet.getCell(`B${summaryStart + 8}`).value = new Date().toLocaleString('en-GB')

    worksheet.getRow(summaryStart + 8).font = { italic: true }
    worksheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 5 }]

    const buffer = await workbook.xlsx.writeBuffer()

    // Return file
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="attendance_${classSection.className}_${classSection.sectionName}_${startDate}_${endDate}.xlsx"`,
      },
    })
  } catch (err) {
    console.error('Attendance export error:', err)
    return errors.internal('Failed to generate export')
  }
}
