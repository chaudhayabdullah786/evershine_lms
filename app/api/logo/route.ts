import { readFile } from 'fs/promises'
import { join } from 'path'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * PUBLIC logo endpoint — serves designs/bglogo.png.
 *
 * IMPORTANT: This route intentionally has NO authentication guard.
 * The logo must be accessible on unauthenticated pages (login, forgot-password).
 * Any global API middleware that adds auth checks must whitelist /api/logo.
 *
 * Cache strategy: immutable — the source asset does not change at runtime.
 * If you need to update the logo, replace designs/bglogo.png and redeploy.
 */

// Module-level cache — avoids re-reading from disk on each request
let cachedBuffer: Buffer | null = null

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_req: NextRequest) {
  try {
    if (!cachedBuffer) {
      const filePath = join(process.cwd(), 'designs', 'bglogo.png')
      cachedBuffer = await readFile(filePath)
    }

    return new NextResponse(new Uint8Array(cachedBuffer), {
      status: 200,
      headers: {
        'Content-Type':  'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
        // Explicit CORS header so the logo can be embedded from any subdomain
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (err) {
    console.error('[/api/logo] Failed to serve logo:', err)
    return new NextResponse('Logo unavailable', { status: 500 })
  }
}
