import { test, expect } from '@playwright/test'

const baseURL = process.env.PW_BASE_URL || 'http://localhost:5000'

test.describe('Academic API smoke (unauthenticated)', () => {
  test('bootstrap requires auth', async ({ request }) => {
    const res = await request.post(`${baseURL}/api/academic/bootstrap`, { data: {} })
    expect(res.status()).toBe(401)
  })

  test('shifts requires auth', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/shifts`)
    expect(res.status()).toBe(401)
  })

  test('login page is reachable', async ({ request }) => {
    const res = await request.get(`${baseURL}/login`)
    expect(res.status()).toBeLessThan(500)
  })

  test('cron fee-penalties rejects missing secret', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/cron/fee-penalties`)
    expect(res.status()).toBe(401)
  })

  test('cron teacher-attendance rejects missing secret', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/cron/teacher-attendance`)
    expect(res.status()).toBe(401)
  })

  test('academic-years requires auth', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/academic-years`)
    expect(res.status()).toBe(401)
  })

  test('class-sections requires auth', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/class-sections`)
    expect(res.status()).toBe(401)
  })

  test('enrollment-attendance roster requires auth', async ({ request }) => {
    const res = await request.get(
      `${baseURL}/api/enrollment-attendance/roster?classSectionId=test&date=2026-05-24`
    )
    expect(res.status()).toBe(401)
  })

  test('report-cards requires auth', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/report-cards`)
    expect(res.status()).toBe(401)
  })

  test('academic migrate status requires auth', async ({ request }) => {
    const res = await request.get(`${baseURL}/api/academic/migrate`)
    expect(res.status()).toBe(401)
  })
})

// Authenticated smoke: use browser login + storageState when PW_ADMIN_EMAIL is configured.
// Legacy /api/auth/login returns 404; use NextAuth sign-in flow in CI separately if needed.
