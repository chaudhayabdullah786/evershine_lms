import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  console.log('Fetching all ClassSections...')
  const sections = await prisma.classSection.findMany({
    include: {
      campus: true,
      batch: true,
      shift: true,
    }
  })
  
  if (sections.length === 0) {
    console.log('NO CLASS SECTIONS FOUND IN DATABASE!')
  } else {
    console.log(`Found ${sections.length} ClassSections.`)
    for (const sec of sections) {
      console.log(`- ID: ${sec.id} | Name: ${sec.name} | Campus: ${sec.campus?.name} (${sec.campusId}) | Batch: ${sec.batch?.name} (${sec.batchId}) | Shift: ${sec.shift?.name} (${sec.shiftId})`)
    }
  }

  const campuses = await prisma.campus.findMany()
  console.log('\nCampuses:', campuses.map(c => ({id: c.id, name: c.name})))

  const batches = await prisma.batch.findMany()
  console.log('\nBatches:', batches.map(b => ({id: b.id, name: b.name})))

  const shifts = await prisma.shift.findMany()
  console.log('\nShifts:', shifts.map(s => ({id: s.id, name: s.name})))
}

main().catch(console.error).finally(() => prisma.$disconnect())
