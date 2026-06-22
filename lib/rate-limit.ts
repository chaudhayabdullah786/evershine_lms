/**
 * Upstash Redis Rate Limiter
 *
 * WHY sliding window (not fixed window): Fixed window allows a burst of 2x
 * the limit at window boundaries. Sliding window prevents this by tracking
 * requests across a rolling time period.
 *
 * TRADEOFF: Sliding window requires two Redis round-trips vs one for fixed
 * window. At 500-700 users this is acceptable; revisit if latency spikes.
 */

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

// WHY lazy singleton: Redis client is not created until first request.
// This prevents cold-start failures if Redis env vars are missing in dev.
let redis: Redis | null = null
let loginLimiter: Ratelimit | null = null
let writeLimiter: Ratelimit | null = null

function getRedis(): Redis {
  if (!redis) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      throw new Error('[RateLimit] Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN')
    }
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  }
  return redis
}

/**
 * Login rate limiter: 10 attempts per 60 seconds per IP.
 * WHY strict limit on login: Prevents brute-force credential attacks.
 */
export function getLoginLimiter(): Ratelimit {
  if (!loginLimiter) {
    loginLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(10, '60 s'),
      prefix: 'rl:login',
      analytics: false,
    })
  }
  return loginLimiter
}

/**
 * Write endpoint rate limiter: 60 mutations per 60 seconds per user.
 * WHY per-user (not per-IP): Shared IPs (campus Wi-Fi) would otherwise
 * block legitimate users when one user hits the limit.
 */
export function getWriteLimiter(): Ratelimit {
  if (!writeLimiter) {
    writeLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(60, '60 s'),
      prefix: 'rl:write',
      analytics: false,
    })
  }
  return writeLimiter
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number // Unix timestamp
}

/**
 * Apply login rate limiting by IP address.
 * @param ip - Client IP (from x-forwarded-for or request.ip)
 */
export async function checkLoginRateLimit(ip: string): Promise<RateLimitResult> {
  const result = await getLoginLimiter().limit(ip)
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  }
}

/**
 * Apply write rate limiting by authenticated user ID.
 * @param userId - Authenticated user's ID (from session)
 */
export async function checkWriteRateLimit(userId: string): Promise<RateLimitResult> {
  const result = await getWriteLimiter().limit(userId)
  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  }
}
