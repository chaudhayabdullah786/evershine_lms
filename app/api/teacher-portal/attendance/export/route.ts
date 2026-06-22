import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { errors } from '@/lib/api-response'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import { sessionShiftSchema } from '@/lib/validation/shift'

const exportQuerySchema = z.object({
  classId: z.string().cuid('Invalid class ID'),
  shift: sessionShiftSchema.optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be in YYYY-MM-DD format').optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be in YYYY-MM-DD format').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be in YYYY-MM-DD format').optional(),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  if (session.user.role !== 'TEACHER') return errors.forbidden('Only teachers can export attendance')

  const { searchParams } = new URL(req.url)
  const parsed = exportQuerySchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) return errors.validation(parsed.error)

  const { classId, shift: shiftParam, date: dateStr, startDate, endDate } = parsed.data

  // Retrieve current teacher profile
  const teacher = await prisma.teacher.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  })
  if (!teacher) return errors.notFound('Teacher profile not found')

  // Verify class assignment
  const isClassTeacher = await prisma.classTeacher.findFirst({
    where: { teacherId: teacher.id, classId },
  })
  const isSubjectTeacher = await prisma.subjectTeacher.findFirst({
    where: { teacherId: teacher.id, subject: { classId } },
  })
  if (!isClassTeacher && !isSubjectTeacher) {
    return errors.forbidden('You are not assigned to this class')
  }

  // Fetch Class & Campus details
  const classDetails = await prisma.class.findUnique({
    where: { id: classId },
    include: {
      campus: { select: { name: true, code: true } },
    },
  })
  if (!classDetails) return errors.notFound('Class')

  const resolvedShift = shiftParam ?? classDetails.shift

  // Fetch Students (ACTIVE)
  const students = await prisma.student.findMany({
    where: { classId, isActive: true, enrollmentStatus: 'ACTIVE' },
    select: {
      id: true,
      rollNumber: true,
      firstName: true,
      lastName: true,
      registrationNumber: true,
      cnicBForm: true,
    },
    orderBy: { rollNumber: 'asc' },
  })

  const workbook = XLSX.utils.book_new()
  let filename = ''
  let buffer: any

  const isRangeExport = !!(startDate && endDate)

  if (isRangeExport) {
    const startObj = new Date(startDate!)
    const endObj = new Date(endDate!)
    startObj.setHours(0, 0, 0, 0)
    endObj.setHours(23, 59, 59, 999)

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        classId,
        shift: resolvedShift,
        date: { gte: startObj, lte: endObj },
      },
      select: {
        studentId: true,
        status: true,
        date: true,
      },
      orderBy: { date: 'asc' },
    })

    // Extract unique dates
    const dates = Array.from(
      new Set(attendanceRecords.map(r => r.date.toISOString().split('T')[0]))
    ).sort()

    // Nested map for fast lookup
    const recordsMap = new Map<string, Map<string, string>>()
    attendanceRecords.forEach(r => {
      const dateKey = r.date.toISOString().split('T')[0]
      if (!recordsMap.has(r.studentId)) {
        recordsMap.set(r.studentId, new Map())
      }
      recordsMap.get(r.studentId)!.set(dateKey, r.status)
    })

    const exportData = students.map((student, index) => {
      const studentMap = recordsMap.get(student.id)
      const row: any = {
        'S.No': index + 1,
        'Roll Number': student.rollNumber || 'N/A',
        'Student Name': `${student.firstName} ${student.lastName}`,
        'Registration No': student.registrationNumber,
      }

      let presents = 0
      let absents = 0
      let leaves = 0

      dates.forEach(d => {
        const status = studentMap?.get(d)
        let statusChar = '-'
        if (status === 'PRESENT') {
          statusChar = 'P'
          presents++
        } else if (status === 'ABSENT') {
          statusChar = 'A'
          absents++
        } else if (status === 'EXCUSED') {
          statusChar = 'L'
          leaves++
        } else if (status === 'LATE') {
          statusChar = 'T'
          presents++
        }
        row[d] = statusChar
      })

      const totalDays = presents + absents + leaves
      const rate = totalDays > 0 ? ((presents / totalDays) * 100).toFixed(1) + '%' : '100%'

      row['Presents'] = presents
      row['Absents'] = absents
      row['Leaves'] = leaves
      row['Attendance Rate'] = rate

      return row
    })

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Periodic Attendance')

    // Adjust column widths
    const baseCols = [
      { wch: 5 },  // S.No
      { wch: 12 }, // Roll Number
      { wch: 25 }, // Student Name
      { wch: 20 }, // Registration No
    ]
    const dateCols = dates.map(() => ({ wch: 10 }))
    const statCols = [
      { wch: 10 }, // Presents
      { wch: 10 }, // Absents
      { wch: 10 }, // Leaves
      { wch: 18 }, // Rate
    ]
    worksheet['!cols'] = [...baseCols, ...dateCols, ...statCols]

    buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    const cleanClassName = classDetails.name.replace(/[^a-zA-Z0-9]/g, '_')
    filename = `Attendance_Report_${cleanClassName}_${startDate}_to_${endDate}.xlsx`
  } else {
    // Single Day Export
    const dateObj = dateStr ? new Date(dateStr) : new Date()
    dateObj.setHours(0, 0, 0, 0)
    const formattedDate = dateObj.toISOString().split('T')[0]

    const attendanceRecords = await prisma.attendance.findMany({
      where: {
        classId,
        shift: resolvedShift,
        date: dateObj,
      },
      select: {
        studentId: true,
        status: true,
        remarks: true,
      },
    })

    const attendanceMap = new Map(attendanceRecords.map(r => [r.studentId, r]))

    const exportData = students.map((student, index) => {
      const record = attendanceMap.get(student.id)
      return {
        'S.No': index + 1,
        'Roll Number': student.rollNumber || 'N/A',
        'Student Name': `${student.firstName} ${student.lastName}`,
        'Registration No': student.registrationNumber,
        'CNIC / B-Form': student.cnicBForm,
        'Class / Section': classDetails.name,
        'Campus': classDetails.campus.name,
        'Date': formattedDate,
        'Status': record ? record.status : 'ABSENT',
        'Remarks': record?.remarks || '',
      }
    })

    const worksheet = XLSX.utils.json_to_sheet(exportData)
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Report')

    worksheet['!cols'] = [
      { wch: 5 },  // S.No
      { wch: 12 }, // Roll Number
      { wch: 25 }, // Student Name
      { wch: 20 }, // Registration No
      { wch: 18 }, // CNIC
      { wch: 15 }, // Class
      { wch: 15 }, // Campus
      { wch: 12 }, // Date
      { wch: 10 }, // Status
      { wch: 20 }, // Remarks
    ]

    buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
    const cleanClassName = classDetails.name.replace(/[^a-zA-Z0-9]/g, '_')
    filename = `Attendance_${cleanClassName}_${formattedDate}.xlsx`
  }

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
