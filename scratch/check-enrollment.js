import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const student = await prisma.student.findFirst({
    where: {
      firstName: 'Rizwan',
      lastName: 'Ali',
    },
    include: {
      enrollments: {
        include: {
          classSection: true,
          subjectEnrollments: {
            include: {
              subjectOffering: {
                include: { subject: true }
              }
            }
          }
        }
      }
    }
  })

  console.log('STUDENT:', JSON.stringify(student, null, 2))

  if (student && student.enrollments.length > 0) {
    const classSectionId = student.enrollments[0].classSectionId
    const academicYearId = student.enrollments[0].academicYearId
    
    console.log('CLASS SECTION ID:', classSectionId)
    console.log('ACADEMIC YEAR ID:', academicYearId)

    const offerings = await prisma.subjectOffering.findMany({
      where: { classSectionId, academicYearId },
      include: { subject: true }
    })
    console.log('SUBJECT OFFERINGS FOR SECTION:', JSON.stringify(offerings, null, 2))
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
