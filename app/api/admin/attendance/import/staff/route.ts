import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors, successResponse } from '@/lib/api-response'
import type { Role, SessionShift } from '@prisma/client'
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

// Helper to parse check-in/out time strings (HH:MM:SS) into Date objects
function parseTime(dateStr: string, timeStr: string | null | undefined): Date | null {
  if (!timeStr) return null
  const cleanTime = String(timeStr).trim()
  const match = cleanTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (!match) return null

  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const seconds = match[3] ? parseInt(match[3], 10) : 0

  const d = new Date(dateStr)
  d.setHours(hours, minutes, seconds, 0)
  return d
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    const role = session.user.role as Role
    if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
      return errors.forbidden('Only admins can import attendance')
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
    const requiredHeaders = ['employee id', 'date (yyyy-mm-dd)', 'shift (morning/evening)', 'check-in time (hh:mm:ss)']
    const missing = requiredHeaders.filter(h => !headersRow.includes(h))
    if (missing.length > 0) {
      return errors.badRequest(`Invalid schema format. Missing columns: ${missing.join(', ')}`)
    }

    const colIndex = {
      employeeId: headersRow.indexOf('employee id'),
      date: headersRow.indexOf('date (yyyy-mm-dd)'),
      shift: headersRow.indexOf('shift (morning/evening)'),
      checkIn: headersRow.indexOf('check-in time (hh:mm:ss)'),
      checkOut: headersRow.indexOf('check-out time (hh:mm:ss)'),
      remarks: headersRow.indexOf('remarks'),
    }

    const rows = jsonData.slice(1) // Skip headers row
    const rowErrors: { row: number; errors: string[] }[] = []
    const parsedRecords: any[] = []

    // Cache shifts and teachers for fast memory lookups
    const [dbShifts, dbTeachers] = await Promise.all([
      prisma.shift.findMany(),
      prisma.teacher.findMany({ select: { id: true, employeeId: true } })
    ])

    const shiftMap = new Map(dbShifts.map(s => [s.code, s]))
    const teacherMap = new Map(dbTeachers.map(t => [t.employeeId.toUpperCase(), t.id]))

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.length === 0 || row.every((c: any) => c === null || c === undefined || c === '')) {
        continue // Skip empty rows
      }

      const rowIndex = i + 2
      const errorsList: string[] = []

      const rawEmployeeId = row[colIndex.employeeId]
      const rawDate = row[colIndex.date]
      const rawShift = row[colIndex.shift]
      const rawCheckIn = row[colIndex.checkIn]
      const rawCheckOut = row[colIndex.checkOut]
      const rawRemarks = row[colIndex.remarks]

      if (!rawEmployeeId) errorsList.push('Employee ID is required')
      if (!rawDate) errorsList.push('Date is required')
      if (!rawShift) errorsList.push('Shift is required')

      const parsedDate = parseExcelDate(rawDate)
      if (rawDate && !parsedDate) {
        errorsList.push(`Invalid Date format: "${rawDate}". Use YYYY-MM-DD.`)
      }

      const normalizedShift = String(rawShift).toUpperCase().trim() as SessionShift
      if (rawShift && normalizedShift !== 'MORNING' && normalizedShift !== 'EVENING') {
        errorsList.push(`Invalid Shift value: "${rawShift}". Must be MORNING or EVENING.`)
      }

      const teacherId = rawEmployeeId ? teacherMap.get(String(rawEmployeeId).toUpperCase().trim()) : null
      if (rawEmployeeId && !teacherId) {
        errorsList.push(`Employee ID "${rawEmployeeId}" does not exist in the system.`)
      }

      const checkInDateObj = parsedDate && rawCheckIn ? parseTime(parsedDate.toISOString().slice(0, 10), String(rawCheckIn)) : null
      if (rawCheckIn && !checkInDateObj) {
        errorsList.push(`Invalid Check-In Time format: "${rawCheckIn}". Use HH:MM:SS.`)
      }

      const checkOutDateObj = parsedDate && rawCheckOut ? parseTime(parsedDate.toISOString().slice(0, 10), String(rawCheckOut)) : null
      if (rawCheckOut && !checkOutDateObj) {
        errorsList.push(`Invalid Check-Out Time format: "${rawCheckOut}". Use HH:MM:SS.`)
      }

      if (errorsList.length > 0) {
        rowErrors.push({ row: rowIndex, errors: errorsList })
        continue
      }

      // Automatically calculate attendance status and lateness parameters
      let status = 'PRESENT'
      let lateMinutes = 0
      const shiftConfig = shiftMap.get(normalizedShift)

      if (checkInDateObj && shiftConfig) {
        const [shiftH, shiftM] = shiftConfig.startTime.split(':').map(Number)
        const shiftStart = new Date(checkInDateObj)
        shiftStart.setHours(shiftH, shiftM, 0, 0)

        const diffMs = checkInDateObj.getTime() - shiftStart.getTime()
        const diffMins = Math.floor(diffMs / 60000)

        if (diffMins > shiftConfig.lateGraceMinutes) {
          status = 'LATE'
          lateMinutes = diffMins
        }
      } else if (!rawCheckIn) {
        status = 'ABSENT'
      }

      parsedRecords.push({
        teacherId,
        date: parsedDate,
        shift: normalizedShift,
        status,
        checkInTime: checkInDateObj,
        checkOutTime: checkOutDateObj,
        lateMinutes,
        remarks: rawRemarks ? String(rawRemarks).trim() : null,
      })
    }

    if (rowErrors.length > 0) {
      // Log the validation failure to help audit trail logs
      await prisma.attendanceImportLog.create({
        data: {
          fileName: file.name,
          importType: 'STAFF',
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

    // ACID transaction: All update or none.
    await prisma.$transaction(async (tx) => {
      for (const rec of parsedRecords) {
        await tx.teacherAttendance.upsert({
          where: {
            teacherId_date_shift: {
              teacherId: rec.teacherId,
              date: rec.date,
              shift: rec.shift,
            }
          },
          update: {
            status: rec.status,
            checkInTime: rec.checkInTime,
            checkOutTime: rec.checkOutTime,
            lateMinutes: rec.lateMinutes,
            remarks: rec.remarks,
          },
          create: {
            teacherId: rec.teacherId,
            date: rec.date,
            shift: rec.shift,
            status: rec.status,
            checkInTime: rec.checkInTime,
            checkOutTime: rec.checkOutTime,
            lateMinutes: rec.lateMinutes,
            remarks: rec.remarks,
          }
        })
      }

      await tx.attendanceImportLog.create({
        data: {
          fileName: file.name,
          importType: 'STAFF',
          totalRows: rows.length,
          successRows: parsedRecords.length,
          failedRows: 0,
          importedById: session.user.id,
        }
      })
    })

    return successResponse(
      { count: parsedRecords.length },
      `Staff attendance successfully imported for ${parsedRecords.length} records.`
    )
  } catch (err: any) {
    console.error('[STAFF_ATTENDANCE_IMPORT]', err)
    return errors.internal(err.message || 'Internal Server Error')
  }
}
