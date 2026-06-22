/**
 * POST   /api/teacher-portal/results/[id]/custom-fields  — Add field
 * PATCH  /api/teacher-portal/results/[id]/custom-fields  — Edit field by index
 * DELETE /api/teacher-portal/results/[id]/custom-fields  — Remove field by index
 *
 * Custom fields are stored as Json array on TermResult:
 *   [{ label: string, value: string }]
 */

import { NextRequest } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { errors, successResponse } from '@/lib/api-response'

interface CustomField {
  label: string
  value: string
}

const fieldSchema = z.object({
  label: z.string().min(1, 'Field label required').max(100),
  value: z.string().max(500),
})

const patchSchema = z.object({
  index: z.number().int().min(0),
  label: z.string().min(1).max(100),
  value: z.string().max(500),
})

const deleteSchema = z.object({
  index: z.number().int().min(0),
})

async function getResult(id: string) {
  return prisma.termResult.findUnique({ where: { id } })
}

function parseFields(raw: unknown): CustomField[] {
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (f): f is CustomField =>
      typeof f === 'object' && f !== null && typeof f.label === 'string' && typeof f.value === 'string'
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params
    const body = await req.json()
    const parsed = fieldSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const result = await getResult(id)
    if (!result) return errors.notFound('Result')

    const teachingSection = await prisma.subjectOffering.findFirst({
      where: { classSectionId: result.classSectionId, teacherId: teacher.id },
    })
    if (!teachingSection) return errors.forbidden()

    const fields = parseFields(result.customFields)
    fields.push({ label: parsed.data.label, value: parsed.data.value })

    const updated = await prisma.termResult.update({
      where: { id },
      data: { customFields: fields },
    })

    return successResponse({ customFields: updated.customFields }, 'Custom field added successfully')
  } catch (err) {
    console.error('[CUSTOM_FIELDS_POST]', err)
    return errors.internal()
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params
    const body = await req.json()
    const parsed = patchSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const result = await getResult(id)
    if (!result) return errors.notFound('Result')

    const teachingSection = await prisma.subjectOffering.findFirst({
      where: { classSectionId: result.classSectionId, teacherId: teacher.id },
    })
    if (!teachingSection) return errors.forbidden()

    const fields = parseFields(result.customFields)
    if (parsed.data.index >= fields.length) {
      return errors.badRequest('Field index out of range')
    }

    fields[parsed.data.index] = { label: parsed.data.label, value: parsed.data.value }

    const updated = await prisma.termResult.update({
      where: { id },
      data: { customFields: fields },
    })

    return successResponse({ customFields: updated.customFields }, 'Custom field updated successfully')
  } catch (err) {
    console.error('[CUSTOM_FIELDS_PATCH]', err)
    return errors.internal()
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth()
    if (!session?.user) return errors.unauthorized()
    if (session.user.role !== 'TEACHER') return errors.forbidden()

    const teacher = await prisma.teacher.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    })
    if (!teacher) return errors.notFound('Teacher profile not found')

    const { id } = await params
    const body = await req.json()
    const parsed = deleteSchema.safeParse(body)
    if (!parsed.success) return errors.validation(parsed.error)

    const result = await getResult(id)
    if (!result) return errors.notFound('Result')

    const teachingSection = await prisma.subjectOffering.findFirst({
      where: { classSectionId: result.classSectionId, teacherId: teacher.id },
    })
    if (!teachingSection) return errors.forbidden()

    const fields = parseFields(result.customFields)
    if (parsed.data.index >= fields.length) {
      return errors.badRequest('Field index out of range')
    }

    fields.splice(parsed.data.index, 1)

    const updated = await prisma.termResult.update({
      where: { id },
      data: { customFields: fields },
    })

    return successResponse({ customFields: updated.customFields }, 'Custom field deleted successfully')
  } catch (err) {
    console.error('[CUSTOM_FIELDS_DELETE]', err)
    return errors.internal()
  }
}
