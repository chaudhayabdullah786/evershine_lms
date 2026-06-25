#!/usr/bin/env node
/**
 * scripts/postbuild-sync.js — Post-build Static Asset Sync
 * =========================================================
 *
 * Runs automatically via npm's "postbuild" hook after every `npm run build`.
 *
 * WHY this is necessary:
 *   1. `next build` with output:"standalone" creates .next/standalone/server.js
 *      but intentionally does NOT copy .next/static/ or public/ into it.
 *      Without copying to .next/standalone, Node.js standalone server fails to find them.
 *   2. Hostinger/cPanel reverse proxy (Nginx/Passenger) often bypasses Node.js
 *      entirely for static URLs (like /_next/static/*) and attempts to serve them
 *      directly from the `public/` directory. If they don't exist in `public/_next/static`,
 *      Nginx returns 404, causing ChunkLoadErrors in the browser.
 *
 * This script solves both:
 *   - Syncs .next/static → .next/standalone/.next/static (for Next.js Node server fallback)
 *   - Syncs public/ → .next/standalone/public/ (for Next.js Node server public assets)
 *   - Syncs .next/static → public/_next/static (for Hostinger Nginx direct static serving)
 *
 * Usage: Runs automatically via "postbuild" in package.json
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const ROOT           = path.resolve(__dirname, '..')
const STANDALONE     = path.join(ROOT, '.next', 'standalone')
const STATIC_SRC     = path.join(ROOT, '.next', 'static')
const STATIC_DST     = path.join(STANDALONE, '.next', 'static')
const PUBLIC_SRC     = path.join(ROOT, 'public')
const PUBLIC_DST     = path.join(STANDALONE, 'public')
const PUBLIC_STATIC  = path.join(PUBLIC_SRC, '_next', 'static')

function copyRecursive(src, dst) {
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      fs.mkdirSync(dstPath, { recursive: true })
      copyRecursive(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}

function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function syncDir(src, dst, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[postbuild] SKIP: ${label} — source not found`)
    return
  }
  // Clean target directory first to avoid mixing stale chunk files
  cleanDir(dst)
  fs.mkdirSync(dst, { recursive: true })
  copyRecursive(src, dst)

  // Count files for confirmation
  let count = 0
  const count_r = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) count_r(path.join(d, e.name))
      else count++
    }
  }
  count_r(dst)
  console.log(`[postbuild] OK  ${label} — ${count} files`)
}

if (!fs.existsSync(STANDALONE)) {
  console.error('[postbuild] ERROR: .next/standalone not found.')
  console.error('[postbuild] Ensure next.config.ts has output: "standalone"')
  process.exit(1)
}

console.log('[postbuild] Syncing assets for Hostinger standalone and public serving...')
// 1. Sync for standalone Node.js server
syncDir(STATIC_SRC, STATIC_DST, '.next/static → standalone/.next/static')
syncDir(PUBLIC_SRC, PUBLIC_DST, 'public/     → standalone/public/')

// 2. Sync for Nginx direct serving of static chunks
syncDir(STATIC_SRC, PUBLIC_STATIC, '.next/static → public/_next/static')

console.log('[postbuild] Done. Standalone build and public static directories are deployment-ready.')
