import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Initializing Prisma Client...')
  try {
    const count = await prisma.user.count()
    console.log('Query successful! User count:', count)
  } catch (error) {
    console.error('Query failed with error:', error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
