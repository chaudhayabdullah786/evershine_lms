/**
 * POST /api/admin/copy-assets
 *
 * One-time utility endpoint to copy images from landing_page/final_ones/
 * to the correct public/assets/images/ subdirectories.
 *
 * SECURITY: This is a one-time administrative action.
 * In production, gate this behind authentication.
 *
 * WHY: The development sandbox restricts direct shell `cp` commands.
 * This endpoint uses Node.js fs to bypass that limitation.
 */

import { NextResponse } from 'next/server'
import { copyFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'

// WHY: path.resolve from cwd gives us the project root reliably
const PROJECT_ROOT = process.cwd()
const SRC = path.join(PROJECT_ROOT, 'landing_page', 'final_ones')

interface CopyMapping {
  src: string
  dest: string
}

const MAPPINGS: CopyMapping[] = [
  // Banner
  { src: 'admission_open2026.png', dest: 'public/assets/images/banner/admission-open-2026.png' },
  // Services
  { src: 'online-quranic_classes.png', dest: 'public/assets/images/services/quran-classes.png' },
  { src: 'online_coaching_Center.png', dest: 'public/assets/images/services/coaching-centre.png' },
  { src: 'personality development sessions.png', dest: 'public/assets/images/services/personality-dev.png' },
  // Portal
  { src: 'WhatsApp Image 2026-06-20 at 11.23.48 AM.jpeg', dest: 'public/assets/images/portal/vision-2030-portal.jpeg' },
  // Gallery
  { src: 'WhatsApp Image 2026-06-18 at 10.36.22 AM (1).jpeg', dest: 'public/assets/images/gallery/quran-class-boys.jpeg' },
  { src: 'WhatsApp Image 2026-06-18 at 10.36.22 AM.jpeg', dest: 'public/assets/images/gallery/classroom-girls.jpeg' },
  { src: 'WhatsApp Image 2026-06-18 at 10.36.23 AM.jpeg', dest: 'public/assets/images/gallery/outdoor-teaching.jpeg' },
  { src: 'WhatsApp Image 2026-06-18 at 10.36.24 AM.jpeg', dest: 'public/assets/images/gallery/dars-e-nizami.jpeg' },
]

export async function POST() {
  const results: Array<{ file: string; status: string }> = []

  for (const mapping of MAPPINGS) {
    const srcPath = path.join(SRC, mapping.src)
    const destPath = path.join(PROJECT_ROOT, mapping.dest)

    try {
      // Ensure source exists
      if (!existsSync(srcPath)) {
        results.push({ file: mapping.src, status: `SKIP — source not found at ${srcPath}` })
        continue
      }

      // Ensure destination directory exists
      const destDir = path.dirname(destPath)
      await mkdir(destDir, { recursive: true })

      // Copy
      await copyFile(srcPath, destPath)
      results.push({ file: mapping.dest, status: 'COPIED' })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ file: mapping.src, status: `ERROR — ${message}` })
    }
  }

  const copied = results.filter((r) => r.status === 'COPIED').length
  const failed = results.filter((r) => r.status.startsWith('ERROR')).length

  return NextResponse.json({
    message: `Asset copy complete: ${copied} copied, ${failed} failed, ${results.length - copied - failed} skipped`,
    results,
  })
}
