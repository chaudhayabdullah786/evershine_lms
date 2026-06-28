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

// ── Inject BUILD_ID into sw.js ───────────────────────────────────────────────
// WHY: public/sw.js ships with `const CACHE_VERSION = '__BUILD_ID__'` as a
// placeholder. If we deployed without replacing it, ALL deployments would share
// the same cache name and old caches would never be evicted.
//
// CRITICAL: We inject ONLY into the standalone OUTPUT copy of sw.js, never into
// the source-tracked public/sw.js. Mutating the source file consumes the
// placeholder — on the next build it is already gone, injection silently skips,
// and the SW is stuck on an old cache version. Users see stale UI after deploys.
//
// We read the real Next.js BUILD_ID (a content hash Next.js generates per build)
// and write it only into the standalone copy so the SW cache key is unique per
// deployment. The source file always retains the __BUILD_ID__ placeholder.
const BUILD_ID_PATH = path.join(ROOT, '.next', 'BUILD_ID')
if (!fs.existsSync(BUILD_ID_PATH)) {
  console.error('[postbuild] ERROR: .next/BUILD_ID not found. Cannot inject cache version into sw.js.')
  process.exit(1)
}
const buildId = fs.readFileSync(BUILD_ID_PATH, 'utf8').trim()
console.log(`[postbuild] Injecting BUILD_ID into sw.js: ${buildId}`)

const SW_PLACEHOLDER = '__BUILD_ID__'
// TRADEOFF: Only the standalone output copy is injected. public/sw.js retains
// the placeholder so future builds always have a clean starting point.
const swTargets = [
  path.join(PUBLIC_DST, 'sw.js'),  // standalone/public/sw.js (served in production)
  // NOT public/sw.js — mutating the source file destroys the placeholder for future builds.
]
for (const swPath of swTargets) {
  if (!fs.existsSync(swPath)) {
    console.warn(`[postbuild] SKIP sw.js injection: not found at ${swPath}`)
    continue
  }
  const content = fs.readFileSync(swPath, 'utf8')
  if (!content.includes(SW_PLACEHOLDER)) {
    console.error(`[postbuild] ERROR: __BUILD_ID__ placeholder NOT found in ${swPath}`)
    console.error('[postbuild] This usually means public/sw.js was previously mutated by a build.')
    console.error('[postbuild] Restore the placeholder: const CACHE_VERSION = \'__BUILD_ID__\';')
    process.exit(1)
  }
  fs.writeFileSync(swPath, content.replace(SW_PLACEHOLDER, buildId), 'utf8')
  console.log(`[postbuild] OK  sw.js cache version set → ${path.relative(ROOT, swPath)}`)
}

// Verify source sw.js still has the placeholder for future builds.
const srcSwPath = path.join(PUBLIC_SRC, 'sw.js')
if (fs.existsSync(srcSwPath)) {
  const srcContent = fs.readFileSync(srcSwPath, 'utf8')
  if (!srcContent.includes(SW_PLACEHOLDER)) {
    console.error('[postbuild] CRITICAL: public/sw.js source file has lost its __BUILD_ID__ placeholder!')
    console.error('[postbuild] Future builds will produce a service worker stuck on the same old cache.')
    console.error('[postbuild] Restore: const CACHE_VERSION = \'__BUILD_ID__\'; in public/sw.js')
    process.exit(1)
  }
  console.log('[postbuild] OK  public/sw.js source placeholder intact.')
}

console.log('[postbuild] Done. Standalone build is deployment-ready.')
