import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const girlsCampus = await prisma.campus.findUnique({ where: { code: 'GC' } })
    if (!girlsCampus) return NextResponse.json({ error: 'Girls Campus not found' }, { status: 404 })

    const batchData = [
      { name: 'Kids Campus', code: 'KC', academicLevel: 'Elementary', description: 'Class 1 to Class 5' },
      { name: 'Junior', code: 'JR', academicLevel: 'Middle', description: 'Class 6 to Class 8' },
      { name: 'Matriculation', code: 'MAT', academicLevel: 'Secondary', description: 'Class 9 to Class 10 (Girls)' },
      { name: 'Intermediate', code: 'INT', academicLevel: 'HigherSecondary', description: 'Class 11 to Class 12' },
    ]

    for (const b of batchData) {
      await prisma.batch.upsert({
        where: { name_campusId: { name: b.name, campusId: girlsCampus.id } },
        update: {},
        create: {
          name: b.name,
          code: b.code,
          campusId: girlsCampus.id,
          academicLevel: b.academicLevel as any,
          description: b.description,
        },
      })
    }

    const allBatches = await prisma.batch.findMany({ where: { campusId: girlsCampus.id } })
    const batchMap: Record<string, string> = {}
    for (const b of allBatches) {
      let code = ''
      if (b.name === 'Kids Campus') code = 'KC'
      else if (b.name === 'Junior') code = 'JR'
      else if (b.name === 'Matriculation') code = 'MAT'
      else if (b.name === 'Intermediate') code = 'INT'
      batchMap[code] = b.id
    }

    const classDefinitions = [
      // Kids (1-5)
      { name: 'Class 1-A', grade: 1, batchCode: 'KC' },
      { name: 'Class 2-A', grade: 2, batchCode: 'KC' },
      { name: 'Class 3-A', grade: 3, batchCode: 'KC' },
      { name: 'Class 4-A', grade: 4, batchCode: 'KC' },
      { name: 'Class 5-A', grade: 5, batchCode: 'KC' },
      // Junior (6-8)
      { name: 'Class 6-A', grade: 6, batchCode: 'JR' },
      { name: 'Class 7-A', grade: 7, batchCode: 'JR' },
      { name: 'Class 8-A', grade: 8, batchCode: 'JR' },
      // Matriculation (9-10)
      { name: 'Class 9-A', grade: 9, batchCode: 'MAT' },
      { name: 'Class 10-A', grade: 10, batchCode: 'MAT' },
      // Intermediate (11-12)
      { name: 'Class 11-A', grade: 11, batchCode: 'INT' },
      { name: 'Class 12-A', grade: 12, batchCode: 'INT' },
    ]

    for (const cd of classDefinitions) {
      if (!batchMap[cd.batchCode]) continue
      await prisma.class.upsert({
        where: {
          grade_section_campusId_academicYear_shift: {
            grade: cd.grade,
            section: 'A',
            campusId: girlsCampus.id,
            academicYear: '2024-2025',
            shift: 'MORNING',
          },
        },
        update: {},
        create: {
          name: cd.name,
          grade: cd.grade,
          section: 'A',
          shift: 'MORNING',
          campusId: girlsCampus.id,
          batchId: batchMap[cd.batchCode],
          academicYear: '2024-2025',
          capacity: 40,
          roomNumber: `R-${cd.grade}02`,
        },
      })
    }

    return NextResponse.json({ success: true, message: 'Girls campus classes created successfully' })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
