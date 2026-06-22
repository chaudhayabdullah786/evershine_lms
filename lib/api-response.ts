/**
 * Typed API response helpers.
 *
 * WHY centralized helpers: Enforces a consistent response envelope across
 * all 20+ route handlers. A drift in format breaks the testing frontend
 * and any future mobile client that parses these responses.
 */

import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

// ─── Response Types ──────────────────────────────────────────────────────────

export type ApiSuccess<T> = {
  success: true
  data: T
  message?: string
  meta: {
    timestamp: string
    requestId?: string
  }
}

export type ApiError = {
  success: false
  error: {
    code: string
    message: string
    details?: Record<string, string>[]
  }
  meta: {
    timestamp: string
    requestId?: string
  }
}

export type PaginatedSuccess<T> = ApiSuccess<T[]> & {
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timestamp(): string {
  return new Date().toISOString()
}

/**
 * Standard success response — 200 by default.
 */
export function successResponse<T>(
  data: T,
  options?: { message?: string; status?: number } | string
): NextResponse<ApiSuccess<T>> {
  const opts = typeof options === 'string' ? { message: options } : options
  return NextResponse.json(
    {
      success: true,
      data,
      message: opts?.message,
      meta: { timestamp: timestamp() },
    },
    { status: opts?.status ?? 200 }
  )
}

/**
 * Created response — 201.
 */
export function createdResponse<T>(data: T, message?: string): NextResponse<ApiSuccess<T>> {
  return successResponse(data, { message, status: 201 })
}

/**
 * Paginated list response — 200.
 */
export function paginatedResponse<T>(
  data: T[],
  pagination: { page: number; limit: number; total: number }
): NextResponse<PaginatedSuccess<T>> {
  return NextResponse.json({
    success: true,
    data,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
    meta: { timestamp: timestamp() },
  })
}

/**
 * Generic error response.
 * WHY not exposing stack traces: Internal error details must never reach
 * external callers. Log internally with full context, return safe message.
 */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  details?: Record<string, string>[]
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, details },
      meta: { timestamp: timestamp() },
    },
    { status }
  )
}

export const errors = {
  badRequest: (message: string) =>
    errorResponse('BAD_REQUEST', message, 400),

  unauthorized: (message?: string) =>
    errorResponse('UNAUTHORIZED', message ?? 'Authentication required', 401),

  forbidden: (message?: string) =>
    errorResponse('FORBIDDEN', message ?? 'You do not have permission to perform this action', 403),

  notFound: (entity = 'Resource') =>
    errorResponse('NOT_FOUND', `${entity} not found`, 404),

  conflict: (message = 'Resource already exists') =>
    errorResponse('CONFLICT', message, 409),

  rateLimited: (reset: number) =>
    errorResponse('RATE_LIMITED', 'Too many requests. Please try again later.', 429, [
      { retryAfter: new Date(reset).toISOString() },
    ]),

  internal: () =>
    errorResponse('INTERNAL_ERROR', 'An unexpected error occurred. Please try again.', 500),

  /**
   * Converts a Zod validation error into a structured 400 response.
   * WHY: Zod errors include field-level detail that clients need to display
   * inline validation messages.
   */
  validation: (error: ZodError) => {
    const details = error.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }))
    return errorResponse('VALIDATION_ERROR', 'Validation failed', 400, details)
  },

  legacyDeprecated: (message: string, migrateTo?: string) =>
    errorResponse(
      'LEGACY_DEPRECATED',
      migrateTo ? `${message} ${migrateTo}` : message,
      410
    ),
}
