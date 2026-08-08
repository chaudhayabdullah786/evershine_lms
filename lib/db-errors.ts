/** Returns true for Prisma errors caused by a missing table or column. */
export function isSchemaOutOfDateError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const code = 'code' in error ? (error as { code?: unknown }).code : undefined
  return code === 'P2021' || code === 'P2022'
}
