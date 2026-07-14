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

async function generateSocialShareImage() {
  try {
    const sharp = require('sharp')
    const logoPath = path.join(PUBLIC_SRC, 'brand', 'logo-crest.png')
    const socialShareDir = path.join(PUBLIC_SRC, 'assets', 'images')
    const socialSharePath = path.join(socialShareDir, 'evershine-social-share.jpg')

    if (!fs.existsSync(logoPath)) {
      console.warn(`[postbuild] WARNING: Logo not found at ${logoPath}. Skipping social-share image generation.`)
      return
    }

    if (!fs.existsSync(socialShareDir)) {
      fs.mkdirSync(socialShareDir, { recursive: true })
    }

    const backgroundSvg = `
    <svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <rect width="1200" height="630" fill="#0F4C81" />
      <defs>
        <radialGradient id="grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#1e3a5f" stop-opacity="0.6" />
          <stop offset="100%" stop-color="#0F4C81" stop-opacity="1" />
        </radialGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#grad)" />
    </svg>
    `

    console.log('[postbuild] Generating evershine-social-share.jpg (1200x630)...')
    const logoBuffer = await sharp(logoPath)
      .resize({ width: 400 })
      .toBuffer()

    await sharp(Buffer.from(backgroundSvg))
      .composite([{ input: logoBuffer, gravity: 'center' }])
      .jpeg({ quality: 90 })
      .toFile(socialSharePath)

    console.log(`[postbuild] OK  evershine-social-share.jpg created → public/assets/images/evershine-social-share.jpg`)
  } catch (err) {
    console.error('[postbuild] ERROR generating social-share image:', err)
  }
}

async function run() {
  if (!fs.existsSync(STANDALONE)) {
    console.error('[postbuild] ERROR: .next/standalone not found.')
    console.error('[postbuild] Ensure next.config.ts has output: "standalone"')
    process.exit(1)
  }

  // Generate the social share image first so it gets copied automatically to standalone
  await generateSocialShareImage()

  console.log('[postbuild] Syncing assets into standalone output...')
  syncDir(STATIC_SRC, STATIC_DST, '.next/static → standalone/.next/static')
  syncDir(PUBLIC_SRC, PUBLIC_DST, 'public/     → standalone/public/')

  // ── Inject BUILD_ID into sw.js ───────────────────────────────────────────────
  const BUILD_ID_PATH = path.join(ROOT, '.next', 'BUILD_ID')
  if (!fs.existsSync(BUILD_ID_PATH)) {
    console.error('[postbuild] ERROR: .next/BUILD_ID not found. Cannot inject cache version into sw.js.')
    process.exit(1)
  }
  const buildId = fs.readFileSync(BUILD_ID_PATH, 'utf8').trim()
  console.log(`[postbuild] Injecting BUILD_ID into sw.js: ${buildId}`)

  const SW_PLACEHOLDER = '__BUILD_ID__'
  const SW_VERSION_DECLARATION = `const BUILD_FALLBACK = '${SW_PLACEHOLDER}';`
  const injectedVersionDeclaration = `const BUILD_FALLBACK = '${buildId}';`
  const swTargets = [
    path.join(PUBLIC_DST, 'sw.js'),
  ]
  for (const swPath of swTargets) {
    if (!fs.existsSync(swPath)) {
      console.warn(`[postbuild] SKIP sw.js injection: not found at ${swPath}`)
      continue
    }
    const content = fs.readFileSync(swPath, 'utf8')
    if (!content.includes(SW_VERSION_DECLARATION)) {
      console.error(`[postbuild] ERROR: service-worker BUILD_ID declaration not found in ${swPath}`)
      console.error('[postbuild] This usually means public/sw.js was previously mutated by a build.')
      console.error(`[postbuild] Restore: ${SW_VERSION_DECLARATION}`)
      process.exit(1)
    }
    fs.writeFileSync(swPath, content.replace(SW_VERSION_DECLARATION, injectedVersionDeclaration), 'utf8')
    console.log(`[postbuild] OK  sw.js cache version set → ${path.relative(ROOT, swPath)}`)
  }

  const srcSwPath = path.join(PUBLIC_SRC, 'sw.js')
  if (fs.existsSync(srcSwPath)) {
    const srcContent = fs.readFileSync(srcSwPath, 'utf8')
    if (!srcContent.includes(SW_VERSION_DECLARATION)) {
      console.error('[postbuild] CRITICAL: public/sw.js source file has lost its __BUILD_ID__ placeholder!')
      console.error('[postbuild] Future builds will produce a service worker stuck on the same old cache.')
      console.error(`[postbuild] Restore: ${SW_VERSION_DECLARATION}`)
      process.exit(1)
    }
    console.log('[postbuild] OK  public/sw.js source placeholder intact.')
  }

  const { verifyDeploymentArtifact } = require('./verify-deployment-artifact')
  verifyDeploymentArtifact(ROOT)

  console.log('[postbuild] Done. Standalone build is deployment-ready.')
}

run().catch(err => {
  console.error('[postbuild] Unexpected build error:', err)
  process.exit(1)
})

