/**
 * API Client utilities
 *
 * WHY two helpers:
 * - fetchApi: for single-resource endpoints. Unwraps { success, data } → T
 * - fetchPaginatedApi: for list endpoints. Returns { data: T[], pagination } intact.
 *   The backend paginatedResponse returns { success, data: T[], pagination, meta }.
 *   Pages must receive BOTH data and pagination to render page controls.
 *
 * WHY ApiValidationError class:
 * - Server returns { error: { code, message, details: [{field, message}] } } on 400.
 * - A flat Error string discards field names, preventing react-hook-form `setError` mapping.
 * - ApiValidationError preserves the details array so callers can show inline field errors.
 */

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedResult<T> {
  data: T[]
  pagination: Pagination
}

export interface ApiFieldError {
  field: string
  message: string
}

/**
 * Thrown by fetchApi / fetchPaginatedApi when the server returns a non-2xx response.
 * `fieldErrors` is populated for 400 VALIDATION_ERROR responses, allowing callers
 * to map errors back to individual form fields via react-hook-form's setError.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fieldErrors: ApiFieldError[]

  constructor(message: string, status: number, code: string, fieldErrors: ApiFieldError[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }

  /** Returns true when the server returned field-level validation errors. */
  get hasFieldErrors(): boolean {
    return this.fieldErrors.length > 0
  }
}

const LEGACY_CLIENT_HEADER = 'X-Legacy-Academic-Client'

function withLegacyClientHeader(options?: RequestInit): RequestInit {
  return {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      [LEGACY_CLIENT_HEADER]: '1',
      ...options?.headers,
    },
  }
}

async function baseRequest(endpoint: string, options?: RequestInit): Promise<any> {
  const headers = {
    ...options?.headers,
  } as Record<string, string>

  if (!(options?.body instanceof FormData)) {
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json'
  } else {
    delete headers['Content-Type']
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  })

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`
    let code = 'UNKNOWN_ERROR'
    let fieldErrors: ApiFieldError[] = []

    try {
      const errorData = await response.json()
      errorMessage = errorData.error?.message || errorData.message || errorMessage
      code = errorData.error?.code || code

      // Preserve field-level details from Zod validation errors
      if (
        Array.isArray(errorData.error?.details) &&
        errorData.error.details.length > 0
      ) {
        fieldErrors = errorData.error.details
          .filter((d: any) => d.field !== undefined)
          .map((d: any) => ({ field: String(d.field || ''), message: String(d.message || '') }))

        // Append a human-readable summary only when there are no named fields
        if (fieldErrors.length === 0) {
          const summary = errorData.error.details.map((d: any) => d.message).join('; ')
          if (summary) errorMessage += `: ${summary}`
        }
      }
    } catch {
      // Non-JSON error body — keep the default message
    }

    throw new ApiError(errorMessage, response.status, code, fieldErrors)
  }

  return response.json()
}

/**
 * Fetch a single resource or perform a mutation.
 * Unwraps the { success: true, data: T } envelope and returns T directly.
 */
export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const json = await baseRequest(endpoint, options)
  return json.data as T
}

/**
 * Fetch a paginated list resource.
 * Returns { data: T[], pagination } so the calling page can render page controls.
 * Uses the shape: { success, data: T[], pagination: { page, limit, total, totalPages }, meta }
 */
export async function fetchPaginatedApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<PaginatedResult<T>> {
  const json = await baseRequest(endpoint, options)
  return {
    data: (json.data ?? []) as T[],
    pagination: json.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 1 },
  }
}

/** Legacy class-based attendance/timetable — sends header so mutations stay allowed when needed. */
export async function fetchLegacyApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const json = await baseRequest(endpoint, withLegacyClientHeader(options))
  return json.data as T
}

export async function fetchPaginatedLegacyApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<PaginatedResult<T>> {
  const json = await baseRequest(endpoint, withLegacyClientHeader(options))
  return {
    data: (json.data ?? []) as T[],
    pagination: json.pagination ?? { page: 1, limit: 50, total: 0, totalPages: 1 },
  }
}

