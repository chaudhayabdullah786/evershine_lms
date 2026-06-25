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

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  })

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
