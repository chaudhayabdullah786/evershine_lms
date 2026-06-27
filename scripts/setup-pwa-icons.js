#!/usr/bin/env node
/**
 * scripts/setup-pwa-icons.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time setup script to resize evershinelogo.png into the correct PWA icon
 * sizes and copy them into public/brand/ for manifest.json consumption.
 *
 * SOURCE  : evershinelogo.png  (repo root, 1784×1784 px)
 * OUTPUTS :
 *   public/brand/pwa-icon-128.png   — 128×128  (general manifest icon)
 *   public/brand/pwa-icon-192.png   — 192×192  (maskable, Android home screen)
 *   public/brand/pwa-icon-512.png   — 512×512  (maskable, splash screen)
 *   public/brand/pwa-icon-180.png   — 180×180  (Apple Touch Icon)
 *
 * STRATEGY:
 *   Uses `sharp` if installed (best quality, recommended).
 *   Falls back to simple file copy (full-res) so manifest still works —
 *   browsers accept oversized icons and scale them down.
 *
 * USAGE:
 *   node scripts/setup-pwa-icons.js
 *
 * Run once before `npm run build` when deploying with the new logo.
 * Safe to run multiple times (idempotent — overwrites existing files).
 */

'use strict'

const path = require('path')
const fs   = require('fs')

const ROOT   = path.resolve(__dirname, '..')
const SRC    = path.join(ROOT, 'evershinelogo.png')
const BRAND  = path.join(ROOT, 'public', 'brand')

// Ensure source file exists
if (!fs.existsSync(SRC)) {
  console.error('[setup-pwa-icons] ERROR: evershinelogo.png not found at repo root.')
  console.error('[setup-pwa-icons] Expected path:', SRC)
  process.exit(1)
}

// Ensure destination directory exists
fs.mkdirSync(BRAND, { recursive: true })
console.log('[setup-pwa-icons] Source:', SRC)
console.log('[setup-pwa-icons] Output dir:', BRAND)

const SIZES = [
  { name: 'pwa-icon-128.png', size: 128 },
  { name: 'pwa-icon-192.png', size: 192 },
  { name: 'pwa-icon-512.png', size: 512 },
  { name: 'pwa-icon-180.png', size: 180 },
]

// ── Attempt sharp-based resize (high quality) ─────────────────────────────────
let sharp
try {
  sharp = require('sharp')
  console.log('[setup-pwa-icons] Using sharp for high-quality PNG resize.')
} catch (_) {
  sharp = null
  console.warn('[setup-pwa-icons] sharp not found — falling back to file copy.')
  console.warn('[setup-pwa-icons] To install: npm install --save-dev sharp')
  console.warn('[setup-pwa-icons] Fallback: full-res logo copied (browsers will scale).')
}

async function run() {
  for (const { name, size } of SIZES) {
    const dest = path.join(BRAND, name)
    if (sharp) {
      await sharp(SRC)
        .resize(size, size, {
          fit: 'cover',          // fills the square — consistent with maskable icon spec
          position: 'center',
          background: { r: 15, g: 23, b: 42, alpha: 1 } // #0f172a — matches manifest bg
        })
        .png({ quality: 95, compressionLevel: 9 })
        .toFile(dest)
      console.log(`[setup-pwa-icons] ✓  ${name}  (${size}×${size} px via sharp)`)
    } else {
      // Fallback: copy full-res source. Browsers will scale. Not ideal but functional.
      fs.copyFileSync(SRC, dest)
      console.log(`[setup-pwa-icons] ✓  ${name}  (full-res copy — install sharp for proper resize)`)
    }
  }

  console.log('')
  console.log('[setup-pwa-icons] ✅ All PWA icons written to public/brand/')
  console.log('[setup-pwa-icons] manifest.json is already configured to use these paths.')
  console.log('[setup-pwa-icons] Next step: npm run build && node server.js')
}

run().catch((err) => {
  console.error('[setup-pwa-icons] FAILED:', err.message)
  process.exit(1)
})
