/**
 * TEMPORARY UTILITY ROUTE — DELETE AFTER USE
 * GET /api/admin/copy-gallery
 *
 * Copies 12 new high-resolution gallery images from
 * landing_page/new_landing_changes/ → public/assets/images/gallery/
 *
 * This is a one-shot migration helper. After images are confirmed
 * in /public, delete this file from the codebase.
 */

import { copyFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'

// Mapping: source UUID filename → destination semantic name
const IMAGE_MAP: Array<[string, string]> = [
  ['02964938-d3d9-4de8-81a0-e6ebc61baea8.png', 'gallery-6.png'],
  ['168febeb-8b7b-4ef0-8f72-83ca10ad786a.png', 'gallery-7.png'],
  ['317aa60d-031b-4437-9072-d0d89a4a1c79.png', 'gallery-8.png'],
  ['359fbcad-60ed-4821-9d3e-8b86f09bcb6a.png', 'gallery-9.png'],
  ['4902dd80-9060-4737-a06a-d7b90279a52a.png', 'gallery-10.png'],
  ['4bb90c19-6c7a-4cd1-ad78-334373a86ec1.png', 'gallery-11.png'],
  ['56454046-63b5-49db-b743-6d51d9f12957.png', 'gallery-12.png'],
  ['78498d54-3cce-4090-bfc0-8164a45fe267.png', 'gallery-13.png'],
  ['7c9930dd-6bd0-4139-9d63-b8a376beb91a.png', 'gallery-14.png'],
  ['ada6df69-952b-400b-9976-d8c9a5d8e4b7.png', 'gallery-15.png'],
  ['d6476edf-416d-45a2-bb75-e425b0dc90a1.png', 'gallery-16.png'],
  ['e11f5d07-20d6-4b44-a3b8-0b94fac8a19b.png', 'gallery-17.png'],
]

const ROOT = process.cwd()
const SOURCE_DIR = path.join(ROOT, 'landing_page', 'new_landing_changes')
const TARGET_DIR = path.join(ROOT, 'public', 'assets', 'images', 'gallery')

export async function GET() {
  const results: Array<{ dest: string; status: 'ok' | 'error'; message?: string }> = []

  for (const [src, dest] of IMAGE_MAP) {
    const from = path.join(SOURCE_DIR, src)
    const to = path.join(TARGET_DIR, dest)
    try {
      await copyFile(from, to)
      results.push({ dest, status: 'ok' })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      results.push({ dest, status: 'error', message })
    }
  }

  const success = results.filter((r) => r.status === 'ok').length
  const failed = results.filter((r) => r.status === 'error').length

  return NextResponse.json({
    summary: { total: IMAGE_MAP.length, success, failed },
    results,
  })
}
