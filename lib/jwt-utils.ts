/**
 * Lightweight JWT-like token utilities using Node.js crypto
 * Used for QR code tokens and attendance scanning
 * Production systems should use 'jsonwebtoken' package instead
 */

import { createHmac, randomBytes } from 'crypto'

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret-key-change-in-production'

interface TokenPayload {
  [key: string]: any
  iat?: number
  exp?: number
}

/**
 * Create a signed token similar to JWT
 * Format: payload.signature (base64 encoded)
 */
export function createToken(payload: TokenPayload, expiresInSeconds: number = 3600): string {
  const now = Math.floor(Date.now() / 1000)
  const token = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  }

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64')
  const body = Buffer.from(JSON.stringify(token)).toString('base64')

  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')

  return `${header}.${body}.${signature}`
}

/**
 * Verify and decode a signed token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const [header, body, signature] = token.split('.')
    if (!header || !body || !signature) return null

    // Verify signature
    const expectedSignature = createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')

    if (signature !== expectedSignature) return null

    // Decode and check expiration
    const payload = JSON.parse(Buffer.from(body, 'base64').toString())

    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null // Token expired
    }

    return payload
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

/**
 * Decode token without verification (unsafe - for debugging only)
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    const [, body] = token.split('.')
    if (!body) return null
    return JSON.parse(Buffer.from(body, 'base64').toString())
  } catch (error) {
    return null
  }
}
