import { test, expect } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'

/**
 * Browser/PDF regression for the real Documents Center result-card flow.
 *
 * The test is opt-in because production authentication is intentionally never
 * committed to the repository. Provide a URL with an authenticated browser
 * session (or configure storageState in a local Playwright setup) to run it:
 *
 *   PW_RESULT_CARD_URL='http://localhost:5000/dashboard/documents?studentId=...&doc=result_card' \
 *     npx playwright test tests/visual/result-card-export.spec.ts
 */
const resultCardUrl = process.env.PW_RESULT_CARD_URL

test.describe('Documents Center result-card export', () => {
  test.skip(!resultCardUrl, 'Set PW_RESULT_CARD_URL to run the authenticated result-card regression.')

  test('downloads a populated PDF matching the ready preview', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await page.goto(resultCardUrl!, { waitUntil: 'networkidle' })
    const preview = page.locator('[data-document-kind="result-card"]')
    await expect(preview).toHaveAttribute('data-export-ready', 'true', { timeout: 30_000 })

    const subjectCount = Number(await preview.getAttribute('data-result-subject-count'))
    expect(subjectCount).toBeGreaterThan(0)
    await expect(preview.locator('table tbody tr')).toHaveCount(subjectCount + 1)

    const visiblePreviewText = await preview.innerText()
    expect(visiblePreviewText).toMatch(/Obtained Marks|Total Marks/)
    expect(visiblePreviewText).not.toMatch(/\bcm[a-z0-9]{20,}\b/i)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download Document PDF/i }).click()
    const download = await downloadPromise
    const filePath = await download.path()
    expect(filePath).toBeTruthy()

    const stat = fs.statSync(filePath!)
    expect(stat.size).toBeGreaterThan(10_000)
    const info = execFileSync('pdfinfo', [filePath!], { encoding: 'utf8' })
    expect(info).toMatch(/Pages:\s+1/)
    expect(info).toMatch(/Page size:\s+595\.28 x 841\.89 pts/)
    expect(consoleErrors).toEqual([])
  })
})
