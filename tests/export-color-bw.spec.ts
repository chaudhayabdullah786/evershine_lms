import { test, expect } from '@playwright/test'

// These tests expect the dev server to be running at http://localhost:5000
// They set the `document_color_mode` localStorage key before the app loads
// and trigger the Download Document PDF button, asserting a successful download
// and absence of console errors.

const APP_URL = process.env.APP_URL ?? 'http://localhost:5000'

for (const mode of ['color', 'bw'] as const) {
  test.describe(`Export pipeline - ${mode}`, () => {
    test(`generates a ${mode} PDF without console errors`, async ({ page, context }) => {
      // Inject localStorage before the page loads
      await context.addInitScript((m: string) => {
        try { localStorage.setItem('document_color_mode', m) } catch (e) {}
      }, mode)

      const consoleErrors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await page.goto(`${APP_URL}/dashboard/documents`)

      // Wait for the document preview to render (data-document-page)
      await page.waitForSelector('[data-document-page]', { timeout: 10000 })

      // Optionally search+select a student if input exists; try to click the download button
      // Click the Download Document PDF button
      const downloadPromise = page.waitForEvent('download', { timeout: 20000 })
      await page.click('button:has-text("Download Document PDF")')

      const download = await downloadPromise
      const path = await download.path()
      // path may be null in some environments; assert download created
      expect(download).toBeTruthy()
      if (path) {
        // ensure file exists and is non-empty
        const fs = require('fs')
        const stat = fs.statSync(path)
        expect(stat.size).toBeGreaterThan(0)
      }

      // No unexpected console errors
      expect(consoleErrors).toEqual([])

      // Also expect a success toast to appear
      await expect(page.locator('text=Document Generated Successfully')).toBeVisible({ timeout: 5000 })
    })
  })
}
