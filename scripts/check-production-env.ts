type EnvCheck = {
  name: string
  required: boolean
  description: string
}

const checks: EnvCheck[] = [
  { name: 'DATABASE_URL', required: true, description: 'MySQL connection string' },
  { name: 'NEXTAUTH_SECRET', required: true, description: 'Auth.js signing secret' },
  { name: 'NEXTAUTH_URL', required: true, description: 'Canonical production URL' },
  { name: 'NEXT_PUBLIC_APP_URL', required: true, description: 'Public application URL' },
  { name: 'CRON_SECRET', required: true, description: 'Bearer secret for scheduled jobs' },
  { name: 'CLOUDINARY_CLOUD_NAME', required: process.env.REQUIRE_CLOUDINARY === 'true', description: 'Cloudinary upload cloud name' },
  { name: 'CLOUDINARY_API_KEY', required: process.env.REQUIRE_CLOUDINARY === 'true', description: 'Cloudinary upload API key' },
  { name: 'CLOUDINARY_API_SECRET', required: process.env.REQUIRE_CLOUDINARY === 'true', description: 'Cloudinary upload API secret' },
]

function hasValue(name: string) {
  const value = process.env[name]
  return typeof value === 'string' && value.trim().length > 0
}

const missing = checks.filter((check) => check.required && !hasValue(check.name))
const optionalMissing = checks.filter((check) => !check.required && !hasValue(check.name))

if (missing.length > 0) {
  console.error('Production environment check failed. Missing required variables:')
  for (const check of missing) {
    console.error(`- ${check.name}: ${check.description}`)
  }
  process.exit(1)
}

if (optionalMissing.length > 0) {
  console.warn('Optional production variables not set:')
  for (const check of optionalMissing) {
    console.warn(`- ${check.name}: ${check.description}`)
  }
  console.warn('Set REQUIRE_CLOUDINARY=true when Cloudinary-backed uploads must be enabled for this deployment.')
}

console.log('Production environment check passed.')
