# Hostinger Admin Account Bootstrap

This runbook creates emergency `SUPER_ADMIN` and `ADMIN` accounts for the
Evershine LMS production database on Hostinger.

Use it only when no administrator can access the dashboard. Prefer the
application's admin user-management UI after the first administrator is able to
log in.

## What The App Expects

The LMS is a Next.js application using Prisma, MySQL, NextAuth, and Argon2id
password hashes.

Admin login requires both records:

- `User`: stores `email`, `passwordHash`, `role`, and active status.
- `Admin`: stores the administrator profile and required `campusId`.

The supported admin roles are:

- `SUPER_ADMIN`: system-wide administration.
- `ADMIN`: campus-scoped administration.

Do not insert plain-text passwords into the database.

## Recommended Method: Hostinger SSH

1. Open hPanel and confirm SSH access is enabled for the hosting account.
2. SSH into the server.
3. Go to the deployed Node.js app directory where `package.json` and
   `prisma/schema.prisma` exist.

```bash
cd /home/YOUR_HOSTINGER_USER/domains/YOUR_DOMAIN/public_html
ls package.json prisma/schema.prisma
```

If Hostinger created a separate Node.js application directory, use that path
instead.

4. Run the bootstrap command.

```bash
node - <<'NODE'
const { PrismaClient, Role } = require('@prisma/client')
const { hash } = require('@node-rs/argon2')
const crypto = require('crypto')

const prisma = new PrismaClient()
const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 }

function password(label) {
  return `ESA-${label}-2026-${crypto.randomBytes(4).toString('hex')}!`
}

const accounts = [
  {
    email: 'superadmin.access@evershineacademy.edu.pk',
    password: password('Super'),
    role: Role.SUPER_ADMIN,
    firstName: 'Super',
    lastName: 'Admin',
    department: 'System Administration',
  },
  {
    email: 'campus.admin@evershineacademy.edu.pk',
    password: password('Admin'),
    role: Role.ADMIN,
    firstName: 'Campus',
    lastName: 'Admin',
    department: 'Administration',
  },
]

async function main() {
  const campus = await prisma.campus.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  })

  if (!campus) {
    throw new Error('No active campus found. Seed or create a Campus record first.')
  }

  await prisma.$transaction(async (tx) => {
    for (const account of accounts) {
      const passwordHash = await hash(account.password, ARGON2_OPTIONS)

      const user = await tx.user.upsert({
        where: { email: account.email },
        update: {
          passwordHash,
          role: account.role,
          isActive: true,
          emailVerified: true,
          emailVerifiedAt: new Date(),
          resetToken: null,
          resetTokenExpiry: null,
        },
        create: {
          email: account.email,
          passwordHash,
          role: account.role,
          isActive: true,
          emailVerified: true,
          emailVerifiedAt: new Date(),
        },
      })

      await tx.admin.upsert({
        where: { userId: user.id },
        update: {
          firstName: account.firstName,
          lastName: account.lastName,
          campusId: campus.id,
          department: account.department,
          isActive: true,
        },
        create: {
          userId: user.id,
          firstName: account.firstName,
          lastName: account.lastName,
          campusId: campus.id,
          department: account.department,
          isActive: true,
        },
      })
    }
  })

  console.log('\nTemporary credentials created. Store these securely and rotate after login.\n')
  for (const account of accounts) {
    console.log(`${account.role}: ${account.email} / ${account.password}`)
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
NODE
```

5. Store the printed credentials securely.
6. Log in at `/login`.
7. Immediately rotate the generated passwords from the dashboard.

## phpMyAdmin Verification

Use hPanel's database tools if SSH is unavailable.

First confirm there is at least one active campus:

```sql
SELECT id, name, code, isActive
FROM `Campus`
WHERE isActive = 1
LIMIT 5;
```

Then verify the accounts after bootstrapping:

```sql
SELECT
  u.id,
  u.email,
  u.role,
  u.isActive,
  u.emailVerified,
  a.firstName,
  a.lastName,
  a.isActive AS adminProfileActive,
  c.name AS campusName
FROM `User` u
LEFT JOIN `Admin` a ON a.userId = u.id
LEFT JOIN `Campus` c ON c.id = a.campusId
WHERE u.email IN (
  'superadmin.access@evershineacademy.edu.pk',
  'campus.admin@evershineacademy.edu.pk'
);
```

Expected result:

- Two rows are returned.
- `role` is `SUPER_ADMIN` or `ADMIN`.
- `isActive` is `1`.
- `emailVerified` is `1`.
- `adminProfileActive` is `1`.
- `campusName` is not `NULL`.

## Raw SQL Fallback

Avoid raw SQL unless SSH and Prisma are unavailable. Prisma generates `cuid()`
IDs in application code, so raw SQL must provide explicit IDs. Raw SQL also
requires precomputed Argon2id hashes from a trusted environment using the same
`@node-rs/argon2` settings as the app.

Do not commit generated passwords or hashes to Git.
