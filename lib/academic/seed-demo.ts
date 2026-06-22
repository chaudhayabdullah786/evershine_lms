import { prisma } from '@/lib/prisma'
import { bootstrapAcademicFoundation } from '@/lib/academic/bootstrap'
import { getActiveAcademicYear } from '@/lib/academic/engine'

export type AcademicDemoSeedResult = {
  bootstrap: Awaited<ReturnType<typeof bootstrapAcademicFoundation>>
  classSectionId: string | null
  enrollmentsCreated: number
  subjectOfferingId: string | null
}

/**
 * Idempotent demo data for smoke tests: one section + enrollments + sample offering.
 * Requires at least one campus, batch, shift, and active student in DB.
 */
export async function seedAcademicDemoData(): Promise<AcademicDemoSeedResult> {
  const bootstrap = await bootstrapAcademicFoundation()
  const activeYear = await getActiveAcademicYear()
  if (!activeYear) {
    return { bootstrap, classSectionId: null, enrollmentsCreated: 0, subjectOfferingId: null }
  }

  const campus = await prisma.campus.findFirst({ orderBy: { code: 'asc' } })
  if (!campus) {
    return { bootstrap, classSectionId: null, enrollmentsCreated: 0, subjectOfferingId: null }
  }

  const batch =
    (await prisma.batch.findFirst({
      where: { campusId: campus.id, code: 'MAT' },
    })) ??
    (await prisma.batch.findFirst({ where: { campusId: campus.id } }))
  const shift =
    (await prisma.shift.findFirst({ where: { code: 'MORNING' } })) ??
    (await prisma.shift.findFirst())

  if (!batch || !shift) {
    return { bootstrap, classSectionId: null, enrollmentsCreated: 0, subjectOfferingId: null }
  }

  const section = await prisma.classSection.upsert({
    where: {
      campusId_batchId_shiftId_className_sectionName: {
        campusId: campus.id,
        batchId: batch.id,
        shiftId: shift.id,
        className: 'Class 10',
        sectionName: 'A',
      },
    },
    update: {},
    create: {
      campusId: campus.id,
      batchId: batch.id,
      shiftId: shift.id,
      className: 'Class 10',
      sectionName: 'A',
      grade: 10,
      deliveryMode: 'PHYSICAL',
      curriculumMode: 'FIXED',
      capacity: 40,
    },
  })

  const students = await prisma.student.findMany({
    where: { campusId: campus.id, enrollmentStatus: 'ACTIVE' },
    take: 5,
    orderBy: { rollNumber: 'asc' },
  })

  let enrollmentsCreated = 0
  let roll = 1
  for (const student of students) {
    const rollNumber = `${section.className.replace(/\s/g, '')}-${section.sectionName}-${String(roll).padStart(3, '0')}`
    await prisma.studentEnrollment.upsert({
      where: {
        studentId_academicYearId_classSectionId: {
          studentId: student.id,
          academicYearId: activeYear.id,
          classSectionId: section.id,
        },
      },
      update: {},
      create: {
        studentId: student.id,
        academicYearId: activeYear.id,
        classSectionId: section.id,
        rollNumber,
        deliveryMode: student.deliveryMode,
        status: 'ACTIVE',
      },
    })
    enrollmentsCreated++
    roll++
  }

  let subject = await prisma.academicSubject.findFirst({
    where: { code: 'MATH-ENG' },
  })
  if (!subject) {
    subject = await prisma.academicSubject.create({
      data: { name: 'Mathematics', code: 'MATH-ENG', description: 'Demo subject' },
    })
  }

  const teacher = await prisma.teacher.findFirst({
    where: { campusId: campus.id, isActive: true },
  })

  const offering = await prisma.subjectOffering.upsert({
    where: {
      academicYearId_classSectionId_subjectId: {
        academicYearId: activeYear.id,
        classSectionId: section.id,
        subjectId: subject.id,
      },
    },
    update: { teacherId: teacher?.id ?? undefined },
    create: {
      academicYearId: activeYear.id,
      classSectionId: section.id,
      subjectId: subject.id,
      teacherId: teacher?.id,
      isMandatory: true,
    },
  })

  return {
    bootstrap,
    classSectionId: section.id,
    enrollmentsCreated,
    subjectOfferingId: offering.id,
  }
}
