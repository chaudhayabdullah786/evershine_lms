import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      accountant: {
        select: {
          firstName: true,
          lastName: true,
          employeeId: true,
        }
      },
      teacher: {
        select: {
          firstName: true,
          lastName: true,
          employeeId: true,
        }
      }
    },
    take: 50,
  })

  console.log("=== USER ACCOUNTS AVAILABLE FOR TESTING ===")
  for (const user of users) {
    const fullName = (user.accountant ? `${user.accountant.firstName} ${user.accountant.lastName}` : '') || (user.teacher ? `${user.teacher.firstName} ${user.teacher.lastName}` : '') || 'N/A'
    const empId = user.accountant?.employeeId || user.teacher?.employeeId || 'N/A'
    console.log(`- Email: ${user.email} | Role: ${user.role} | Name: ${fullName} | EmployeeID: ${empId}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
