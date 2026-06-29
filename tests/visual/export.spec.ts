import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

test('preview exports a non-empty PDF (smoke)', async ({ page }) => {
  await page.goto('/document-export-smoke')

  const preview = page.locator('[data-document-page]')
  await expect(preview).toBeVisible({ timeout: 30000 })

  const previewPath = path.join(process.cwd(), 'test-artifacts', `preview-${Date.now()}.png`)
  await preview.screenshot({ path: previewPath })

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.click('text=Download Document PDF'),
  ])

  const downloadPath = path.join(process.cwd(), 'test-artifacts', await download.suggestedFilename())
  await download.saveAs(downloadPath)

  expect(fs.existsSync(previewPath)).toBe(true)
  expect(fs.statSync(previewPath).size).toBeGreaterThan(0)
  expect(fs.existsSync(downloadPath)).toBe(true)
  expect(fs.statSync(downloadPath).size).toBeGreaterThan(0)
})
