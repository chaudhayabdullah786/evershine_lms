#!/usr/bin/env node
/**
 * server.js — Hostinger-Native Production Entry Point
 * =====================================================
 *
 * WHY this file exists at the project root:
 *   Hostinger's Node.js Web App has a "Startup file" field in hPanel.
 *   If set to "server.js" (the Hostinger default) or "app.js", Hostinger runs
 *   the script directly — skipping `npm start` entirely.
 *   That means scripts/prod-start.sh never runs, static assets are
 *   never synced into .next/standalone, and every JS chunk request
 *   returns 404 → "Failed to load chunk" ChunkLoadError in the browser.
 *
 * What this file does:
 *   1. Validates DATABASE_URL, NEXTAUTH_SECRET, NEXTAUTH_URL are set
 *   2. Copies .next/static → .next/standalone/.next/static  (chunk fix)
 *   3. Copies public/     → .next/standalone/public/         (assets fix)
 *   4. Copies .next/static → public/_next/static             (Nginx direct serve fix)
 *   5. Hands off to the real Next.js standalone server
 *
 * Works regardless of whether Hostinger uses:
 *   - "Startup file: server.js" (direct node invocation)
 *   - "Startup file: app.js" (proxies to server.js)
 *   - "npm start" → node server.js (consistent either way)
 *
 * Required Hostinger hPanel environment variables:
 *   DATABASE_URL     = mysql://user:password@host:3306/dbname
 *   NEXTAUTH_SECRET  = <openssl rand -hex 32>
 *   NEXTAUTH_URL     = https://evershineacadmey.com
 *   NODE_ENV         = production
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const ROOT           = __dirname
const STANDALONE     = path.join(ROOT, '.next', 'standalone')
const STATIC_SRC     = path.join(ROOT, '.next', 'static')
const STATIC_DST     = path.join(STANDALONE, '.next', 'static')
const PUBLIC_SRC     = path.join(ROOT, 'public')
const PUBLIC_DST     = path.join(STANDALONE, 'public')
const PUBLIC_STATIC  = path.join(PUBLIC_SRC, '_next', 'static')

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

// ── 3. Sync static assets into standalone and public serving ────────────────
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

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
  cleanDir(dst)
  fs.mkdirSync(dst, { recursive: true })
  copyRecursive(src, dst)
  console.log(`[SERVER] OK  ${label} synced`)
}

console.log('[SERVER] Syncing static assets...')
// Copy to standalone directory for Next.js Node server fallback
syncDir(STATIC_SRC, STATIC_DST, '.next/static → standalone/.next/static')
syncDir(PUBLIC_SRC, PUBLIC_DST, 'public/ → standalone/public/')

// Copy to public directory for Hostinger Nginx direct serving
syncDir(STATIC_SRC, PUBLIC_STATIC, '.next/static → public/_next/static')

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
