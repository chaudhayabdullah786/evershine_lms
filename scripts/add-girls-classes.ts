import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Adding Girls Campus classes...')
  
  const girlsCampus = await prisma.campus.findUnique({ where: { code: 'GC' } })
  if (!girlsCampus) throw new Error('Girls Campus not found')
  
  // Get Girls MAT batch
  const girlsMatBatch = await prisma.batch.findUnique({
    where: { name_campusId: { name: 'Matriculation', campusId: girlsCampus.id } }
  })
  
  // We should also create KC, JR, INT for girls campus just in case.
  const batchData = [
    { name: 'Kids Campus', code: 'KC', academicLevel: 'Elementary', description: 'Class 1 to Class 5' },
    { name: 'Junior', code: 'JR', academicLevel: 'Middle', description: 'Class 6 to Class 8' },
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
  
  // Now we need to get all these batches
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
        grade_section_campusId_academicYear: {
          grade: cd.grade,
          section: 'A',
          campusId: girlsCampus.id,
          academicYear: '2024-2025',
        },
      },
      update: {},
      create: {
        name: cd.name,
        grade: cd.grade,
        section: 'A',
        campusId: girlsCampus.id,
        batchId: batchMap[cd.batchCode],
        academicYear: '2024-2025',
        capacity: 40,
        roomNumber: `R-${cd.grade}02`,
      },
    })
  }

  console.log('Successfully added girls classes.')
}

main().catch(console.error).finally(() => prisma.$disconnect())
