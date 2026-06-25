import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL
  if (!url || !url.startsWith('mysql://')) {
    console.error(
      '[prisma] DATABASE_URL is missing or invalid. ' +
      'Expected a mysql:// connection string. ' +
      'Set the DATABASE_URL environment variable in your hosting panel.'
    )
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const prisma =
  globalForPrisma.prisma ??
  createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
