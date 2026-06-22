import { describe, expect, it } from 'vitest'
import { hash } from '@node-rs/argon2'
import { verifyPasswordHash } from '../lib/password-utils'

describe('verifyPasswordHash', () => {
  it('accepts argon2 hashes from the current Prisma auth flow', async () => {
    const argon2Hash = await hash('password', { memoryCost: 65536, timeCost: 3, parallelism: 4, outputLen: 32 })

    await expect(verifyPasswordHash(argon2Hash, 'password')).resolves.toBe(true)
  })

  it('accepts legacy bcrypt hashes from older Neon seed data', async () => {
    const bcryptHash = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

    await expect(verifyPasswordHash(bcryptHash, 'password')).resolves.toBe(true)
  })
})
