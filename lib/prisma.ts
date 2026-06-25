import { PrismaClient } from '@prisma/client'

// WHY singleton: Next.js hot reload creates new module instances on each change.
// Without this, development exhausts the MySQL connection pool.
//
// WHY lazy Proxy: `next build` imports every server module to collect page/route
// metadata. Throwing at module-load time (when DATABASE_URL is absent in the CI
// build environment) kills the build before a single page is rendered.
// The Proxy defers PrismaClient construction — and therefore DATABASE_URL
// validation — until the first actual DB call at *runtime*, not build time.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createPrismaClient(): PrismaClient {
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

// WHY Proxy: Allows this module to be safely imported at build time without
// a live DATABASE_URL. The real PrismaClient is only instantiated on the first
// property access (i.e. the first actual database call at runtime).
function makeLazyPrisma(): PrismaClient {
  let client: PrismaClient | null = null

  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      if (!client) {
        client = globalForPrisma.prisma ?? createPrismaClient()
        if (process.env.NODE_ENV !== 'production') {
          globalForPrisma.prisma = client
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const value = (client as any)[prop]
      return typeof value === 'function' ? value.bind(client) : value
    },
  })
}

export const prisma: PrismaClient =
  globalForPrisma.prisma ?? makeLazyPrisma()
