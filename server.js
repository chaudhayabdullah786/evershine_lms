#!/usr/bin/env node
/**
 * server.js — Hostinger-Native Production Entry Point
 * =====================================================
 *
 * WHY this file exists at the project root:
 *   Hostinger's Node.js Web App has a "Startup file" field in hPanel.
 *   If set to "server.js" (the Hostinger default), Hostinger runs
 *   `node server.js` directly — skipping `npm start` entirely.
 *   That means scripts/prod-start.sh never runs, static assets are
 *   never synced into .next/standalone, and every JS chunk request
 *   returns 404 → "Failed to load chunk" ChunkLoadError in the browser.
 *
 * What this file does:
 *   1. Validates DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL are set
 *   2. Copies .next/static → .next/standalone/.next/static  (chunk fix)
 *   3. Copies public/     → .next/standalone/public/         (assets fix)
 *   4. Hands off to the real Next.js standalone server
 *
 * Works regardless of whether Hostinger uses:
 *   - "Startup file: server.js" (direct node invocation)
 *   - "npm start" → node server.js (consistent either way)
 *
 * Required Hostinger hPanel environment variables:
 *   DATABASE_URL     = mysql://user:password@host:3306/dbname
 *   NEXTAUTH_SECRET  = <openssl rand -hex 32>
 *   NEXTAUTH_URL     = https://evershineacademy.com
 *   NODE_ENV         = production
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const ROOT        = __dirname
const STANDALONE  = path.join(ROOT, '.next', 'standalone')
const STATIC_SRC  = path.join(ROOT, '.next', 'static')
const STATIC_DST  = path.join(STANDALONE, '.next', 'static')
const PUBLIC_SRC  = path.join(ROOT, 'public')
const PUBLIC_DST  = path.join(STANDALONE, 'public')

// ── 1. Env var validation ────────────────────────────────────────────────────
const REQUIRED = ['DATABASE_URL', 'NEXTAUTH_SECRET', 'NEXTAUTH_URL']
let missing = false
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`[SERVER] MISSING env var: ${key}`)
    console.error(`[SERVER] Set it in Hostinger hPanel → Node.js Web App → Environment Variables`)
    missing = true
  } else {
    console.log(`[SERVER] OK  ${key}`)
  }
}
if (missing) {
  console.error('[SERVER] Aborting: required environment variables are not set.')
  process.exit(1)
}

if (!process.env.DATABASE_URL.startsWith('mysql://')) {
  console.error('[SERVER] ERROR: DATABASE_URL must start with mysql://')
  console.error('[SERVER] Current prefix:', process.env.DATABASE_URL.substring(0, 30))
  process.exit(1)
}

// ── 2. Validate build output ─────────────────────────────────────────────────
const BUILD_ID = path.join(ROOT, '.next', 'BUILD_ID')
if (!fs.existsSync(BUILD_ID)) {
  console.error('[SERVER] ERROR: .next/BUILD_ID missing. Run npm run build first.')
  process.exit(1)
}
console.log('[SERVER] Build ID:', fs.readFileSync(BUILD_ID, 'utf8').trim())

if (!fs.existsSync(STANDALONE)) {
  console.error('[SERVER] ERROR: .next/standalone missing.')
  console.error('[SERVER] Ensure next.config.ts has output: "standalone"')
  process.exit(1)
}

// ── 3. Sync static assets into standalone (THE CRITICAL FIX) ────────────────
// WHY: `next build` with output:"standalone" creates .next/standalone/server.js
// but does NOT copy .next/static into it. The standalone server serves static
// files from .next/standalone/.next/static — if that dir is absent, every
// /_next/static/* request returns 404, causing ChunkLoadError in the browser.
//
// WHY unconditional (not if !exists): On Hostinger redeployments the old
// standalone dir persists. Stale chunk hashes remain while new ones are
// missing. Always copying ensures the static tree matches the current build.

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
    console.warn(`[SERVER] SKIP ${label}: source not found at ${src}`)
    return
  }
  fs.mkdirSync(dst, { recursive: true })
  copyRecursive(src, dst)
  console.log(`[SERVER] OK  ${label} synced`)
}

console.log('[SERVER] Syncing static assets into standalone...')
syncDir(STATIC_SRC, STATIC_DST, '.next/static → standalone/.next/static')
syncDir(PUBLIC_SRC, PUBLIC_DST, 'public/     → standalone/public/')

// ── Re-inject BUILD_ID into standalone sw.js ─────────────────────────────────
// WHY: syncDir above copied public/sw.js (which retains the __BUILD_ID__
// placeholder) into standalone/public/sw.js, overwriting the build-time
// injected version. We must re-inject the live BUILD_ID here so that
// the service worker served in production always uses the correct cache
// version for this specific build — not a generic placeholder string.
const buildId = fs.readFileSync(BUILD_ID, 'utf8').trim()
const SW_PLACEHOLDER = '__BUILD_ID__'
const standaloneSW = path.join(PUBLIC_DST, 'sw.js')
if (fs.existsSync(standaloneSW)) {
  const swContent = fs.readFileSync(standaloneSW, 'utf8')
  if (swContent.includes(SW_PLACEHOLDER)) {
    fs.writeFileSync(standaloneSW, swContent.replace(SW_PLACEHOLDER, buildId), 'utf8')
    console.log(`[SERVER] OK  sw.js cache version injected: ${buildId}`)
  } else {
    // Already injected (e.g. postbuild-sync already ran and we're doing a hot restart).
    console.log('[SERVER] OK  sw.js cache version already injected.')
  }
} else {
  console.warn('[SERVER] WARN: standalone/public/sw.js not found — PWA cache busting unavailable.')
}

// ── 4. Start Next.js standalone server ──────────────────────────────────────
const serverPath = path.join(STANDALONE, 'server.js')
if (!fs.existsSync(serverPath)) {
  console.error('[SERVER] ERROR: .next/standalone/server.js not found.')
  console.error('[SERVER] Rebuild with: npm run build')
  process.exit(1)
}

const PORT = process.env.PORT || 3000
process.env.PORT = String(PORT)

console.log(`[SERVER] Starting Next.js on port ${PORT}...`)
require(serverPath)
