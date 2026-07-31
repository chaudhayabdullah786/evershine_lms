import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import type { Role, AttendanceStatus } from '@prisma/client'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { resolveMarkedByTeacherId } from '@/lib/academic/attendance'
import * as XLSX from 'xlsx'

// Helper to convert excel serial date or string date into JS Date
function parseExcelDate(val: any): Date | null {
  if (!val) return null
  if (val instanceof Date) return val
  if (typeof val === 'number') {
    // Excel base date is 1899-12-30
    return new Date(Math.round((val - 25569) * 86400 * 1000))
  }
  const dateStr = String(val).trim()
  const d = new Date(dateStr)
  return isNaN(d.getTime()) ? null : d
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    const role = session.user.role as Role
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return errors.forbidden('Only admins can import student attendance')
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return errors.badRequest('No file uploaded')
    }

    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })

    const sheetName = workbook.SheetNames.find(name => name.toLowerCase() === 'template') || workbook.SheetNames[0]
    const worksheet = workbook.Sheets[sheetName]
    const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 })

    if (jsonData.length === 0) {
      return errors.badRequest('The uploaded file is empty')
    }

    const headersRow = jsonData[0].map((h: any) => String(h).trim().toLowerCase())
    
    // Validate schema headers (order-independent)
    const requiredHeaders = ['student id', 'class section id', 'date (yyyy-mm-dd)', 'status (present/absent/late/excused)']
    const missing = requiredHeaders.filter(h => !headersRow.includes(h))
    if (missing.length > 0) {
      return errors.badRequest(`Invalid schema format. Missing columns: ${missing.join(', ')}`)
    }

    const colIndex = {
      studentId: headersRow.indexOf('student id'),
      classSectionId: headersRow.indexOf('class section id'),
      date: headersRow.indexOf('date (yyyy-mm-dd)'),
      status: headersRow.indexOf('status (present/absent/late/excused)'),
      remarks: headersRow.indexOf('remarks'),
    }

    const activeYear = await getActiveAcademicYear()
    if (!activeYear) {
      return errors.badRequest('No active academic year is currently set')
    }

    const rows = jsonData.slice(1) // Skip headers row
    const rowErrors: { row: number; errors: string[] }[] = []
    const parsedRecords: any[] = []

    // Fetch all student enrollments for the active academic year to match quickly in memory
    const enrollments = await prisma.studentEnrollment.findMany({
      where: { academicYearId: activeYear.id },
      include: {
        student: {
          select: { id: true, rollNumber: true, registrationNumber: true }
        }
      }
    })

    // Map by student roll number + class section and registration number + class section
    const enrollmentMap = new Map<string, string>() // key: student_identifier|class_section_id -> enrollment_id
    
    enrollments.forEach((enr) => {
      const classSecId = enr.classSectionId.toLowerCase()
      if (enr.student.rollNumber) {
        enrollmentMap.set(`${enr.student.rollNumber.toUpperCase()}|${classSecId}`, enr.id)
      }
      if (enr.student.registrationNumber) {
        enrollmentMap.set(`${enr.student.registrationNumber.toUpperCase()}|${classSecId}`, enr.id)
      }
      // Also match by enrollment rollNumber directly
      if (enr.rollNumber) {
        enrollmentMap.set(`${enr.rollNumber.toUpperCase()}|${classSecId}`, enr.id)
      }
    })

    const markedBy = await resolveMarkedByTeacherId(session.user.id)

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.length === 0 || row.every((c: any) => c === null || c === undefined || c === '')) {
        continue // Skip empty rows
      }

      const rowIndex = i + 2
      const errorsList: string[] = []

      const rawStudentId = row[colIndex.studentId]
      const rawClassSecId = row[colIndex.classSectionId]
      const rawDate = row[colIndex.date]
      const rawStatus = row[colIndex.status]
      const rawRemarks = row[colIndex.remarks]

      if (!rawStudentId) errorsList.push('Student ID is required')
      if (!rawClassSecId) errorsList.push('Class Section ID is required')
      if (!rawDate) errorsList.push('Date is required')
      if (!rawStatus) errorsList.push('Status is required')

      const parsedDate = parseExcelDate(rawDate)
      if (rawDate && !parsedDate) {
        errorsList.push(`Invalid Date format: "${rawDate}". Use YYYY-MM-DD.`)
      }

      const normalizedStatus = String(rawStatus).toUpperCase().trim() as AttendanceStatus
      const validStatuses = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']
      if (rawStatus && !validStatuses.includes(normalizedStatus)) {
        errorsList.push(`Invalid Status: "${rawStatus}". Must be PRESENT, ABSENT, LATE, or EXCUSED.`)
      }

      const studentIdKey = String(rawStudentId).toUpperCase().trim()
      const classSecIdKey = String(rawClassSecId).toLowerCase().trim()
      const enrollmentId = enrollmentMap.get(`${studentIdKey}|${classSecIdKey}`)

      if (rawStudentId && rawClassSecId && !enrollmentId) {
        errorsList.push(`Student "${rawStudentId}" is not enrolled in Class Section "${rawClassSecId}" for the active year.`)
      }

      if (errorsList.length > 0) {
        rowErrors.push({ row: rowIndex, errors: errorsList })
        continue
      }

      parsedRecords.push({
        studentEnrollmentId: enrollmentId!,
        attendanceDate: parsedDate,
        status: normalizedStatus,
        remarks: rawRemarks ? String(rawRemarks).trim() : null,
      })
    }

    if (rowErrors.length > 0) {
      // Log the validation failure to audit log
      await prisma.attendanceImportLog.create({
        data: {
          fileName: file.name,
          importType: 'STUDENT',
          totalRows: rows.length,
          successRows: 0,
          failedRows: rows.length,
          errorLog: rowErrors as any,
          importedById: session.user.id,
        }
      })

      return errors.badRequest({
        message: 'Validation failed for some rows. No records were imported.',
        rowErrors,
      } as any)
    }

    // ACID transaction for student attendance upserts
    await prisma.$transaction(async (tx) => {
      for (const rec of parsedRecords) {
        await tx.enrollmentAttendanceRecord.upsert({
          where: {
            studentEnrollmentId_attendanceDate: {
              studentEnrollmentId: rec.studentEnrollmentId,
              attendanceDate: rec.attendanceDate,
            }
          },
          update: {
            status: rec.status,
            remarks: rec.remarks,
            markedByTeacherId: markedBy,
          },
          create: {
            studentEnrollmentId: rec.studentEnrollmentId,
            attendanceDate: rec.attendanceDate,
            status: rec.status,
            remarks: rec.remarks,
            markedByTeacherId: markedBy,
          }
        })
      }

      await tx.attendanceImportLog.create({
        data: {
          fileName: file.name,
          importType: 'STUDENT',
          totalRows: rows.length,
          successRows: parsedRecords.length,
          failedRows: 0,
          importedById: session.user.id,
        }
      })
    })

    return successResponse(
      { count: parsedRecords.length },
      `Student attendance successfully imported for ${parsedRecords.length} records.`
    )
  } catch (err: any) {
    console.error('[STUDENT_ATTENDANCE_IMPORT]', err)
    return errors.internal(err.message || 'Internal Server Error')
  }
}
