#!/usr/bin/env node
/**
 * scripts/postbuild-sync.js — Post-build Static Asset Sync
 * =========================================================
 *
 * Runs automatically via npm's "postbuild" hook after every `npm run build`.
 *
 * WHY this is necessary:
 *   `next build` with output:"standalone" creates .next/standalone/server.js
 *   but intentionally does NOT copy .next/static/ or public/ into it
 *   (see Next.js docs: "You need to copy these yourself").
 *
 *   Without this copy:
 *   - Every /_next/static/chunks/*.js request returns 404
 *   - The browser throws ChunkLoadError on every page load
 *   - The app/error.tsx boundary fires showing "Something went wrong"
 *
 * This script solves it at BUILD TIME so the deployment artifact is already
 * complete — no startup script required. Combined with server.js (which also
 * syncs at startup), chunks will never be missing regardless of deploy method.
 *
 * Usage: Runs automatically via "postbuild" in package.json
 *   npm run build  →  next build  →  postbuild-sync.js
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const ROOT       = path.resolve(__dirname, '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')
const STATIC_SRC = path.join(ROOT, '.next', 'static')
const STATIC_DST = path.join(STANDALONE, '.next', 'static')
const PUBLIC_SRC = path.join(ROOT, 'public')
const PUBLIC_DST = path.join(STANDALONE, 'public')

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

function syncDir(src, dst, label) {
  if (!fs.existsSync(src)) {
    console.warn(`[postbuild] SKIP: ${label} — source not found`)
    return
  }
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

console.log('[postbuild] Syncing assets into standalone output...')
syncDir(STATIC_SRC, STATIC_DST, '.next/static → standalone/.next/static')
syncDir(PUBLIC_SRC, PUBLIC_DST, 'public/     → standalone/public/')
console.log('[postbuild] Done. Standalone build is deployment-ready.')
