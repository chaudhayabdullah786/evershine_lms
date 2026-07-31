import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { errors } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role as Role
  // WHY: Teachers also need to download the student template to fill
  // it with biometric data before using the teacher import endpoint.
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN' && role !== 'TEACHER') {
    return errors.forbidden('Only Teachers and Admins can access attendance templates')
  }

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new()
  
  // Instructions sheet
  const instructionRows = [
    ['EVERSHINE ACADEMY - STUDENT ATTENDANCE IMPORT GUIDE'],
    [''],
    ['1. Do not modify or delete the header columns in the "Template" sheet.'],
    ['2. "Student ID" refers to the Roll Number or Student ID registered in the LMS.'],
    ['3. "Class Section ID" is the unique section ID (e.g. class_sec_123) where the student is enrolled.'],
    ['4. Date must be in YYYY-MM-DD format (e.g., 2026-07-13).'],
    ['5. Status must be exactly "PRESENT", "ABSENT", "LATE", or "EXCUSED".'],
    ['6. Shift must be exactly "MORNING" or "EVENING".'],
    [''],
    ['Example Row:'],
    ['Student ID', 'Name', 'Class Section ID', 'Date', 'Shift', 'Status', 'Remarks'],
    ['S-10025', 'Muhammad Ali', 'class-sec-cuid-abc', '2026-07-13', 'MORNING', 'PRESENT', 'Biometric sync']
  ]
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionRows)
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

  // Template sheet
  const templateHeaders = [
    ['Student ID', 'Name', 'Class Section ID', 'Date (YYYY-MM-DD)', 'Shift (MORNING/EVENING)', 'Status (PRESENT/ABSENT/LATE/EXCUSED)', 'Remarks'],
    ['S-10025', 'Muhammad Ali', 'class-sec-cuid-abc', '2026-07-13', 'MORNING', 'PRESENT', 'Example Row']
  ]
  const wsTemplate = XLSX.utils.aoa_to_sheet(templateHeaders)
  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template')

  // Write workbook to buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="student_attendance_template.xlsx"'
    }
  })
}
