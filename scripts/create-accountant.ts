import { PrismaClient, Role } from '@prisma/client'
import { hash } from '@node-rs/argon2'

const prisma = new PrismaClient()

const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
}

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {}

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (!token.startsWith('--')) continue
    const [key, rawValue] = token.split('=')
    const value = rawValue ?? argv[i + 1] ?? ''
    if (!rawValue && value.startsWith('--')) {
      args[key.slice(2)] = 'true'
      continue
    }
    args[key.slice(2)] = value
    if (!rawValue) i++
  }

  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  const email = args.email || 'accountmanager@evershineacademy.edu.pk'
  const password = args.password || 'AccountManager@2026!'
  const firstName = args.firstName || 'Bilal'
  const lastName = args.lastName || 'Hassan'
  const employeeId = args.employeeId || 'ESA-ACC-001'
  const phoneNumber = args.phoneNumber || '+92-300-5550001'
  const campusCode = args.campusCode || 'BC'

  if (args.help || args.h) {
    console.log('Usage: npx ts-node --compiler-options "{\\"module\\":\\"CommonJS\\"}" scripts/create-accountant.ts --email=accountmanager@evershineacademy.edu.pk --password=AccountManager@2026! --firstName=Bilal --lastName=Hassan --employeeId=ESA-ACC-001 --phoneNumber=+92-300-5550001 --campusCode=BC')
    return
  }

  const campus = await prisma.campus.findUnique({ where: { code: campusCode.toUpperCase() } })
  if (!campus) {
    throw new Error(`Campus with code '${campusCode}' not found. Available codes: BC, GC.`)
  }

  const passwordHash = await hash(password, ARGON2_OPTIONS)

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: Role.ACCOUNTANT, isActive: true, emailVerified: true },
    create: {
      email,
      passwordHash,
      role: Role.ACCOUNTANT,
      isActive: true,
      emailVerified: true,
    },
  })

  const accountant = await prisma.accountant.upsert({
    where: { userId: user.id },
    update: {
      firstName,
      lastName,
      employeeId,
      phoneNumber,
      campusId: campus.id,
      isActive: true,
    },
    create: {
      userId: user.id,
      firstName,
      lastName,
      employeeId,
      phoneNumber,
      campusId: campus.id,
      isActive: true,
    },
  })

  console.log('✅ Account Manager created successfully.')
  console.log({
    userId: user.id,
    email: user.email,
    password,
    role: user.role,
    accountantId: accountant.id,
    campus: campus.name,
    campusCode: campus.code,
  })
}

main()
  .catch((error) => {
    console.error('[CREATE_ACCOUNTANT_ERROR]', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
