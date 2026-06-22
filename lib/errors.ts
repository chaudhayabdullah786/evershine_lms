export class ForbiddenError extends Error {
  public readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.code = code
    this.name = 'ForbiddenError'
  }
}
