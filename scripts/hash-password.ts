#!/usr/bin/env npx tsx
/**
 * Argon2id Password Hash Generator
 *
 * Generates a valid Argon2id hash for a given plaintext password.
 * Use the output to set the `passwordHash` column in phpMyAdmin
 * for any user who cannot log in.
 *
 * Usage:
 *   npx tsx scripts/hash-password.ts "MyPlaintextPassword"
 *
 * Output:
 *   $argon2id$v=19$m=65536,t=3,p=4$...+hash
 */
import { hash } from '@node-rs/argon2'

const ARGON2_OPTIONS = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
}

async function main() {
  const password = process.argv[2]
  if (!password) {
    console.error('Usage: npx tsx scripts/hash-password.ts "<password>"')
    process.exit(1)
  }
  if (password.length < 6) {
    console.error('Password must be at least 6 characters.')
    process.exit(1)
  }

  const passwordHash = await hash(password, ARGON2_OPTIONS)
  console.log('\n--- Argon2id Hash ---')
  console.log(passwordHash)
  console.log('\nCopy the line above and paste it into the `passwordHash` column in phpMyAdmin for the target user.')
}

main().catch((err) => {
  console.error('Failed to generate hash:', err)
  process.exit(1)
})
