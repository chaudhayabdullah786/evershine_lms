import { PrismaClient } from '@prisma/client'

// WHY singleton: Next.js hot reload creates new module instances on each change.
// Without this, development exhausts the Neon free-tier connection pool (max 20).
//
// NOTE: Do not run `prisma generate` at runtime inside `lib/prisma.ts`.
// Runtime generation can cause the client to be regenerated while active
// connections are open, resulting in intermittent "server has closed the
// connection" errors during development.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function getPrisma(): PrismaClient {
  const url = process.env.DATABASE_URL

  if (!url) {
    console.error(
      '[PRISMA] DATABASE_URL is not set.\n' +
      '  If running locally: copy .env.example to .env and fill in your credentials.\n' +
      '  If running on Hostinger: set DATABASE_URL in hPanel → Node.js → Environment Variables.\n' +
      '  Expected format: mysql://user:password@host:3306/database'
    )
    throw new Error('DATABASE_URL is not set. Cannot initialize Prisma.')
  }

  if (!url.startsWith('mysql://')) {
    console.error(
      `[PRISMA] DATABASE_URL must start with mysql:// — got: ${url.substring(0, 30)}...\n` +
      '  Fix the URL in your .env file or in hPanel environment variables.'
    )
    throw new Error('DATABASE_URL must start with mysql://')
  }

  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

export const prisma =
  globalForPrisma.prisma ?? getPrisma()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
