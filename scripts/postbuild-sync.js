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
const childProcess = require('child_process')

const ROOT       = path.resolve(__dirname, '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')
const STATIC_SRC = path.join(ROOT, '.next', 'static')
const STATIC_DST = path.join(STANDALONE, '.next', 'static')
const PUBLIC_SRC = path.join(ROOT, 'public')
const PUBLIC_DST = path.join(STANDALONE, 'public')

function resolveBuildRevision() {
  const configuredRevision = [
    process.env.APP_GIT_SHA,
    process.env.GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
  ].find((value) => typeof value === 'string' && /^[0-9a-f]{7,64}$/i.test(value.trim()))

  if (configuredRevision) return configuredRevision.trim()

  try {
    return childProcess.execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).toString().trim()
  } catch {
    // ZIP deployments may not contain .git. Build identity remains available
    // through BUILD_ID, and operators can optionally provide APP_GIT_SHA.
    return null
  }
}

function writeBuildMetadata(buildId) {
  const metadata = {
    buildId,
    revision: resolveBuildRevision(),
    builtAt: new Date().toISOString(),
  }
  const metadataPath = path.join(PUBLIC_SRC, 'build-info.json')
  fs.writeFileSync(metadataPath, `${JSON.stringify(metadata)}\n`, 'utf8')
  console.log(
    `[postbuild] Build metadata written revision=${metadata.revision ?? 'unavailable'} build=${buildId}`,
  )
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

  const BUILD_ID_PATH = path.join(ROOT, '.next', 'BUILD_ID')
  if (!fs.existsSync(BUILD_ID_PATH)) {
    console.error('[postbuild] ERROR: .next/BUILD_ID not found. Cannot create deployment metadata.')
    process.exit(1)
  }
  const buildId = fs.readFileSync(BUILD_ID_PATH, 'utf8').trim()
  writeBuildMetadata(buildId)

  // Generate the social share image first so it gets copied automatically to standalone
  await generateSocialShareImage()

  console.log('[postbuild] Syncing assets into standalone output...')
  syncDir(STATIC_SRC, STATIC_DST, '.next/static → standalone/.next/static')
  syncDir(PUBLIC_SRC, PUBLIC_DST, 'public/     → standalone/public/')

  // ── Inject BUILD_ID into sw.js ───────────────────────────────────────────────
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

  // ── Sync Hostinger-Native Prisma Engine ─────────────────────────────────────
  syncPrismaEngine()

  // ── Patch Standalone Server for UNIX Sockets ──────────────────────────────
  patchStandaloneServer()

  const { verifyDeploymentArtifact } = require('./verify-deployment-artifact')
  verifyDeploymentArtifact(ROOT)

  console.log('[postbuild] Done. Standalone build is deployment-ready.')
}

function patchStandaloneServer() {
  const standaloneServerPath = path.join(STANDALONE, 'server.js')
  if (!fs.existsSync(standaloneServerPath)) {
    console.warn('[postbuild] SKIP: standalone server.js not found for patching')
    return
  }

  let content = fs.readFileSync(standaloneServerPath, 'utf8')
  
  const targetPort = "const currentPort = parseInt(process.env.PORT, 10) || 3000"
  const replacementPort = "const isUnixSocket = process.env.PORT && isNaN(parseInt(process.env.PORT, 10));\nconst currentPort = isUnixSocket ? process.env.PORT : (parseInt(process.env.PORT, 10) || 3000);"
  
  const targetHost = "const hostname = process.env.HOSTNAME || '0.0.0.0'"
  const replacementHost = "const hostname = isUnixSocket ? undefined : (process.env.HOSTNAME || '0.0.0.0')"

  if (content.includes(targetPort) && content.includes(targetHost)) {
    content = content.replace(targetPort, replacementPort).replace(targetHost, replacementHost)
    fs.writeFileSync(standaloneServerPath, content, 'utf8')
    console.log('[postbuild] OK  standalone server.js patched for UNIX socket compatibility')
  } else {
    console.warn('[postbuild] WARNING: Could not find target port/host declarations in standalone server.js')
  }
}

function syncPrismaEngine() {
  // The build may run from the checked-out source directory while the running
  // Hostinger app lives under /nodejs. Resolve both locations instead of
  // assuming a single absolute node_modules path.
  const nodeModulesRoots = [
    path.join(ROOT, 'node_modules'),
    path.join(ROOT, '..', 'node_modules'),
    '/home/u668799501/domains/evershineacadmey.com/nodejs/node_modules',
    '/home/u668799501/domains/evershineacadmey.com/node_modules',
  ]
  const PATHS = nodeModulesRoots.flatMap((nodeModulesRoot) => [
    path.join(nodeModulesRoot, '.prisma/client/libquery_engine-debian-openssl-1.1.x.so.node'),
    path.join(nodeModulesRoot, '@prisma/engines/libquery_engine-debian-openssl-1.1.x.so.node'),
  ])
  const sourcePath = PATHS.find(p => fs.existsSync(p))
  
  if (!sourcePath) {
    console.log('[postbuild] Prisma native engine sync skipped (not on Hostinger production or engine missing).')
    return
  }

  const targetDir = path.join(STANDALONE, 'node_modules', '.prisma', 'client')
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  // 1. Delete wrong engine binaries in standalone to prevent resolution collision
  try {
    const files = fs.readdirSync(targetDir)
    for (const file of files) {
      if (
        file.startsWith('libquery_engine-debian-openssl-3.0.x') ||
        file.startsWith('libquery_engine-rhel') ||
        file.startsWith('libquery_engine-darwin') ||
        file.startsWith('libquery_engine-windows')
      ) {
        fs.unlinkSync(path.join(targetDir, file))
        console.log(`[postbuild] OK  Removed mismatched engine from standalone: ${file}`)
      }
    }
  } catch (err) {
    console.warn('[postbuild] Warning cleaning up standalone engines:', err)
  }

  // 2. Copy correct native engine to standalone client
  const targetPath = path.join(targetDir, 'libquery_engine-debian-openssl-1.1.x.so.node')
  fs.copyFileSync(sourcePath, targetPath)
  console.log(`[postbuild] OK  Hostinger-native Prisma engine synced successfully from ${sourcePath} into standalone.`)
}

run().catch(err => {
  console.error('[postbuild] Unexpected build error:', err)
  process.exit(1)
})
