/**
 * POST /api/staff-applications/apply — Submit a staff application (public, unauthenticated)
 *
 * Security:
 * - Rate-limited via IP (existing edge middleware)
 * - CNIC deduplication: checks against existing Teacher records AND active applications
 * - 90-day cooldown enforced after declined applications
 * - CV PDF validation: magic-bytes check + 5 MB size limit
 * - File saved to public/uploads/staff-cv/ with CNIC-based filename
 */

import { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { errors, createdResponse } from '@/lib/api-response'
import { staffApplicationSchema } from '@/lib/validation/staff-application'
import { sendStaffPendingNotification, sendAdminStaffAlert } from '@/lib/notifications'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { ZodError } from 'zod'

// WHY: 90 days = the minimum cooldown before re-application after decline.
// Prevents spam re-submissions while giving rejected applicants a fair window.
const REAPPLY_COOLDOWN_DAYS = 90

/** Validates base64-encoded PDF by checking magic bytes (%PDF = hex 25504446) */
async function savePdfDocument(
  base64Data: string,
  cnic: string
): Promise<string> {
  const cleaned = base64Data.replace(/^data:application\/pdf;base64,/, '')
  const buffer = Buffer.from(cleaned, 'base64')

  // Magic-byte validation: PDF starts with %PDF (hex 25504446)
  const magic = buffer.slice(0, 4).toString('hex').toUpperCase()
  if (!magic.startsWith('25504446')) {
    throw new Error('Invalid file format. Only PDF documents are accepted.')
  }

  // 5 MB limit
  if (buffer.length > 5 * 1024 * 1024) {
    throw new Error('CV file too large. Maximum allowed size is 5 MB.')
  }

  const uploadDir = path.join(process.cwd(), 'public/uploads/staff-cv')
  await mkdir(uploadDir, { recursive: true })

  const slug = cnic.replace(/-/g, '')
  const fileName = `cv-${slug}-${Date.now()}.pdf`
  const filePath = path.join(uploadDir, fileName)
  await writeFile(filePath, buffer)

  return `/uploads/staff-cv/${fileName}`
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validated = staffApplicationSchema.parse(body)

    // ── CNIC deduplication: already employed? ─────────────────────────────
    const existingTeacher = await prisma.teacher.findUnique({
      where: { cnic: validated.cnic },
    })
    if (existingTeacher) {
      return errors.badRequest(
        'A staff member with this CNIC is already registered at Evershaheen Academy.'
      )
    }

    // ── CNIC deduplication: active or recently declined application? ──────
    const existingApplication = await prisma.staffApplicationRequest.findFirst({
      where: { cnic: validated.cnic },
      orderBy: { createdAt: 'desc' },
    })

    if (existingApplication) {
      // Active (non-terminal) application exists
      if (['PENDING', 'UNDER_REVIEW', 'INTERVIEW_SCHEDULED', 'ON_HOLD'].includes(existingApplication.status)) {
        return errors.badRequest(
          'You already have an active application under review. Please wait for a response before re-applying.'
        )
      }

      // Already approved
      if (existingApplication.status === 'APPROVED') {
        return errors.badRequest(
          'Your application has already been approved. Please check your email for login credentials.'
        )
      }

      // Declined — enforce 90-day cooldown
      if (existingApplication.status === 'DECLINED' && existingApplication.declinedAt) {
        const cooldownEnd = new Date(existingApplication.declinedAt)
        cooldownEnd.setDate(cooldownEnd.getDate() + REAPPLY_COOLDOWN_DAYS)
        if (new Date() < cooldownEnd) {
          return errors.badRequest(
            `Your previous application was declined. You may re-apply after ${cooldownEnd.toLocaleDateString('en-PK', { day: '2-digit', month: 'long', year: 'numeric' })}.`
          )
        }
      }
    }

    // ── CV document upload (optional) ────────────────────────────────────
    let cvDocUrl: string | null = null
    if (validated.cvDocBase64) {
      try {
        cvDocUrl = await savePdfDocument(validated.cvDocBase64, validated.cnic)
      } catch (cvErr: unknown) {
        const message = cvErr instanceof Error ? cvErr.message : 'CV processing error.'
        return errors.badRequest(`CV Upload Error: ${message}`)
      }
    }

    // ── Create application record ────────────────────────────────────────
    const application = await prisma.staffApplicationRequest.create({
      data: {
        fullName: validated.fullName,
        cnic: validated.cnic,
        dateOfBirth: validated.dateOfBirth ? new Date(validated.dateOfBirth) : null,
        gender: validated.gender || null,
        address: validated.address || null,
        city: validated.city || null,
        phone: validated.phone,
        email: validated.email,
        applicantType: validated.applicantType as 'TEACHER' | 'ACCOUNTANT' | 'ADMIN_STAFF',
        qualification: validated.qualification,
        specialization: validated.specialization,
        experienceYears: validated.experienceYears,
        preferredShift: validated.preferredShift as 'MORNING' | 'EVENING' | 'NIGHT' | undefined || null,
        preferredCampusId: validated.preferredCampusId || null,
        cvDocUrl,
        cvLink: validated.cvLink || null,
        status: 'PENDING',
      },
    })

    // ── Notifications (non-fatal) ────────────────────────────────────────
    try {
      await sendStaffPendingNotification(validated.email, validated.fullName, validated.applicantType)
      await sendAdminStaffAlert(validated.fullName, validated.applicantType, application.id)
    } catch (_notifErr) {
      console.warn('[STAFF_APPLY] notification send failed', _notifErr)
    }

    return createdResponse(
      { id: application.id, createdAt: application.createdAt },
      'Your application has been submitted successfully. You will receive a confirmation email shortly.'
    )
  } catch (error) {
    if (error instanceof ZodError) {
      return errors.validation(error)
    }
    console.error('[STAFF_APPLY_POST]', error)
    return errors.internal()
  }
}
