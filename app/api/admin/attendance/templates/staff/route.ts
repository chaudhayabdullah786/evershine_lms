import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { errors } from '@/lib/api-response'
import type { Role } from '@prisma/client'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return errors.unauthorized()
  const role = session.user.role as Role
  if (role !== 'SUPER_ADMIN' && role !== 'ADMIN') {
    return errors.forbidden('Only admins can access attendance templates')
  }

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new()
  
  // Instructions sheet
  const instructionRows = [
    ['EVERSHINE ACADEMY - STAFF ATTENDANCE IMPORT GUIDE'],
    [''],
    ['1. Do not modify or delete the header columns in the "Template" sheet.'],
    ['2. The "Employee ID" must match the Teacher Code / User ID registered in the LMS.'],
    ['3. Date must be in YYYY-MM-DD format (e.g., 2026-07-13).'],
    ['4. Shift must be exactly "MORNING" or "EVENING".'],
    ['5. Check-In and Check-Out times must be in HH:MM:SS format (e.g., 08:30:00).'],
    ['6. Status is automatically determined based on shift times but can be specified in remarks.'],
    [''],
    ['Example Row:'],
    ['Employee ID', 'Name', 'Date', 'Shift', 'Check-In Time', 'Check-Out Time', 'Remarks'],
    ['T-1001', 'Moaaz Hafeez', '2026-07-13', 'MORNING', '08:15:00', '16:00:00', 'Biometric sync']
  ]
  const wsInstructions = XLSX.utils.aoa_to_sheet(instructionRows)
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions')

  // Template sheet
  const templateHeaders = [
    ['Employee ID', 'Name', 'Date (YYYY-MM-DD)', 'Shift (MORNING/EVENING)', 'Check-In Time (HH:MM:SS)', 'Check-Out Time (HH:MM:SS)', 'Remarks'],
    ['T-1001', 'Moaaz Hafeez', '2026-07-13', 'MORNING', '08:15:00', '16:00:00', 'Example Row']
  ]
  const wsTemplate = XLSX.utils.aoa_to_sheet(templateHeaders)
  XLSX.utils.book_append_sheet(wb, wsTemplate, 'Template')

  // Write workbook to buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="staff_attendance_template.xlsx"'
    }
  })
}
