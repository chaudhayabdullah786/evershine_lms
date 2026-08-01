import { prisma } from '../lib/prisma'

async function main() {
  console.log('--- DIAGNOSING TEACHER TASKS ISSUE ---')
  
  // Find teachers
  const teachers = await prisma.teacher.findMany({
    select: { id: true, userId: true, user: { select: { name: true, role: true } } }
  })
  console.log('Teachers found:', JSON.stringify(teachers, null, 2))

  // Find class sections
  const sections = await prisma.classSection.findMany({
    include: {
      campus: true,
      batch: true,
      shift: true,
    }
  })
  console.log('Class Sections found:', JSON.stringify(sections.map(s => ({
    id: s.id,
    className: s.className,
    sectionName: s.sectionName,
    grade: s.grade,
    campus: s.campus?.name,
    batch: s.batch?.name,
    shift: s.shift?.code ?? s.shift?.name
  })), null, 2))

  // Find legacy Classes
  const legacyClasses = await prisma.class.findMany({
    include: {
      campus: true,
      batch: true,
    }
  })
  console.log('Legacy Classes found:', JSON.stringify(legacyClasses.map(c => ({
    id: c.id,
    name: c.name,
    grade: c.grade,
    section: c.section,
    campus: c.campus?.name,
    batch: c.batch?.name,
    shift: c.shift,
    isActive: c.isActive,
  })), null, 2))
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
