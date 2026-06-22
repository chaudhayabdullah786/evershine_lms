/**
 * lib/excel/brand-logo.ts
 *
 * Centralised academy logo utility for all Excel exports.
 *
 * WHY centralised: Multiple Excel export modules (monitoring-report,
 * report-generator, fee-lists, etc.) all need the same logo embedding
 * logic. Duplicating fetch + base64 conversion in each file is a
 * maintenance hazard. This module provides a single source of truth
 * for the logo path and a cached fetch mechanism.
 *
 * LOGO SOURCE: /brand/bglogo.png — the official academy crest.
 * Place the logo file at public/brand/bglogo.png to make it servable
 * by Next.js static file serving.
 */

import ExcelJS from 'exceljs'

// WHY this specific path: The official academy logo (crest with shield,
// laurels, "Recognize Yourself" motto) lives at designs/bglogo.png in
// the repo and must be copied to public/brand/bglogo.png for browser fetch.
const LOGO_PATH = '/brand/bglogo.png'

// WHY fallback: If bglogo.png is missing, try the previous primary logo
const LOGO_FALLBACK_PATH = '/brand/logo-primary-web.png'

/**
 * Fetches the academy logo and adds it to an ExcelJS workbook.
 *
 * @returns The image ID for use with worksheet.addImage(), or null
 *          if the logo could not be loaded (graceful degradation).
 */
export async function addBrandLogo(workbook: ExcelJS.Workbook): Promise<number | null> {
  // Try primary logo first, then fallback
  for (const path of [LOGO_PATH, LOGO_FALLBACK_PATH]) {
    try {
      const response = await fetch(path)
      if (!response.ok) continue

      const buffer = await response.arrayBuffer()
      const bytes = new Uint8Array(buffer)

      // WHY manual base64: ExcelJS accepts base64 strings for images.
      // Buffer.from().toString('base64') is not available in browser
      // environments without a polyfill. This approach works universally.
      let binary = ''
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i])
      }
      const base64 = btoa(binary)

      const imageId = workbook.addImage({
        base64,
        extension: 'png',
      })

      return imageId
    } catch {
      // Continue to fallback path
      continue
    }
  }

  console.warn('[BRAND_LOGO] Logo fetch failed for all paths — proceeding without logo')
  return null
}

/**
 * Standard logo placement dimensions for Excel report headers.
 *
 * WHY these dimensions: The bglogo.png is a square crest (shield + laurels).
 * 75×75 pixels at column 0 provides a clean header without overlapping
 * the title text that starts at column 2-3.
 */
export const LOGO_PLACEMENT = {
  /** Default square placement for crest-style logos */
  crest: { width: 75, height: 75 },
  /** Wider placement for horizontal/letterhead-style logos */
  letterhead: { width: 180, height: 60 },
} as const
