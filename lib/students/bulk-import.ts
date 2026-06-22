import { prisma } from '@/lib/prisma'
import { hash } from '@node-rs/argon2'
import { getActiveAcademicYear } from '@/lib/academic/engine'
import { createYearEnrollmentForStudent } from '@/lib/academic/enrollment'
import { linkGuardianToStudent } from '@/lib/students/guardian-link'
import type { studentImportRowSchema } from '@/lib/validation/student'
import type { z } from 'zod'
import type { SessionShift } from '@prisma/client'

type ImportRow = z.infer<typeof studentImportRowSchema>

const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

export interface ImportRowResult {
  row: number
  success: boolean
  registrationNumber?: string
  studentId?: string
  error?: string
}

async function resolveCampusId(code: string): Promise<string | null> {
  const campus = await prisma.campus.findFirst({
    where: { OR: [{ code: code.toUpperCase() }, { id: code }] },
    select: { id: true },
  })
  return campus?.id ?? null
}

async function resolveBatchId(campusId: string, code: string): Promise<string | null> {
  const batch = await prisma.batch.findFirst({
    where: {
      campusId,
      OR: [{ code: code.toUpperCase() }, { id: code }],
    },
    select: { id: true },
  })
  return batch?.id ?? null
}

async function resolveSectionId(
  campusId: string,
  batchId: string,
  className: string,
  sectionName: string,
  shiftCode: SessionShift
): Promise<string | null> {
  const shift = await prisma.shift.findUnique({ where: { code: shiftCode } })
  if (!shift) return null
  const section = await prisma.classSection.findFirst({
    where: {
      campusId,
      batchId,
      shiftId: shift.id,
      className,
      sectionName,
      isActive: true,
    },
    select: { id: true },
  })
  return section?.id ?? null
}

export async function importStudentsBulk(
  rows: ImportRow[],
  actorUserId: string
): Promise<{ results: ImportRowResult[]; created: number; failed: number }> {
  const results: ImportRowResult[] = []
  let created = 0
  let failed = 0
  const year = new Date().getFullYear()
  const activeYear = await getActiveAcademicYear()

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNum = i + 1

    try {
      const campusId = await resolveCampusId(row.campusCode)
      if (!campusId) {
        results.push({ row: rowNum, success: false, error: `Campus not found: ${row.campusCode}` })
        failed++
        continue
      }

      const batchId = await resolveBatchId(campusId, row.batchCode)
      if (!batchId) {
        results.push({ row: rowNum, success: false, error: `Batch not found: ${row.batchCode}` })
        failed++
        continue
      }

      const cnic = row.cnicBForm.replace(/\D/g, '')
      const dup = await prisma.student.findUnique({ where: { cnicBForm: cnic }, select: { id: true } })
      if (dup) {
        results.push({ row: rowNum, success: false, error: 'CNIC/B-Form already registered' })
        failed++
        continue
      }

      const count = await prisma.student.count({ where: { campusId } })
      const campus = await prisma.campus.findUnique({ where: { id: campusId }, select: { code: true } })
      const registrationNumber = `${campus?.code || 'ESA'}/${year}/${String(count + 1).padStart(3, '0')}`

      const shift = (row.shift ?? 'MORNING') as SessionShift
      let classSectionId: string | null = null
      if (row.className && row.sectionName) {
        classSectionId = await resolveSectionId(
          campusId,
          batchId,
          row.className,
          row.sectionName,
          shift
        )
        if (!classSectionId) {
          results.push({
            row: rowNum,
            success: false,
            error: `Class section not found: ${row.className}-${row.sectionName} (${shift})`,
          })
          failed++
          continue
        }
      }

      const student = await prisma.$transaction(async (tx) => {
        const passwordHash = await hash(cnic.slice(-4) || 'ESA1234', ARGON2_OPTIONS)
        const email =
          row.email?.trim() ||
          `${registrationNumber.replace(/\//g, '.').toLowerCase()}@students.evershaheen.edu.pk`

        const user = await tx.user.create({
          data: { email, passwordHash, role: 'STUDENT', isActive: true },
        })

        const newStudent = await tx.student.create({
          data: {
            userId: user.id,
            registrationNumber,
            firstName: row.firstName,
            lastName: row.lastName,
            fatherName: row.fatherName,
            cnicBForm: cnic,
            dateOfBirth: new Date(row.dateOfBirth),
            gender: row.gender,
            bloodGroup: row.bloodGroup,
            religion: row.religion,
            nationality: row.nationality ?? 'Pakistani',
            address: row.address,
            city: row.city,
            province: row.province,
            postalCode: row.postalCode,
            phoneNumber: row.phoneNumber,
            emergencyContact: row.emergencyContact,
            email: row.email || null,
            campusId,
            batchId,
            rollNumber: row.rollNumber,
            shift,
            deliveryMode: row.deliveryMode ?? 'PHYSICAL',
            academicYear: row.academicYear ?? `${year}-${year + 1}`,
            totalFeeAmount: row.totalFeeAmount ?? 0,
            dueAmount: row.totalFeeAmount ?? 0,
            idCardQRCode: `ESA-QR-${registrationNumber.replace(/\//g, '-')}`,
          },
        })

        if (row.guardianCnic && row.guardianFirstName) {
          await linkGuardianToStudent(tx, newStudent.id, {
            firstName: row.guardianFirstName,
            lastName: row.guardianLastName,
            cnic: row.guardianCnic.replace(/\D/g, ''),
            phoneNumber: row.guardianPhone ?? row.emergencyContact,
            email: row.guardianEmail,
            relationship: row.guardianRelationship,
          })
        }

        await tx.auditLog.create({
          data: {
            userId: actorUserId,
            action: 'CREATE',
            entityType: 'Student',
            entityId: newStudent.id,
            changes: { registrationNumber, source: 'bulk_import', row: rowNum },
          },
        })

        return newStudent
      })

      if (activeYear && classSectionId && row.rollNumber) {
        try {
          await createYearEnrollmentForStudent({
            studentId: student.id,
            academicYearId: activeYear.id,
            classSectionId,
            rollNumber: row.rollNumber,
            deliveryMode: row.deliveryMode ?? 'PHYSICAL',
          })
        } catch (enrErr) {
          console.error('[BULK_IMPORT] enrollment', enrErr)
        }
      }

      results.push({
        row: rowNum,
        success: true,
        registrationNumber: student.registrationNumber,
        studentId: student.id,
      })
      created++
    } catch (err) {
      results.push({
        row: rowNum,
        success: false,
        error: err instanceof Error ? err.message : 'Import failed',
      })
      failed++
    }
  }

  return { results, created, failed }
}
