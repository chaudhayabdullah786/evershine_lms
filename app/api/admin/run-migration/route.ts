/**
 * ONE-TIME ADMIN MIGRATION ENDPOINT
 *
 * WHY this exists: Hostinger shared hosting does not expose the Node.js
 * binary to SSH sessions — it is managed internally by LiteSpeed. This
 * endpoint allows running Prisma schema sync from within the running app.
 *
 * SECURITY: Protected by MIGRATION_SECRET env var. Delete or disable
 * this file immediately after use.
 *
 * Usage:
 *   GET /api/admin/run-migration?secret=YOUR_MIGRATION_SECRET
 */

import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'

const execAsync = promisify(exec)

// SECURITY: This endpoint is a no-op unless MIGRATION_SECRET is set
const MIGRATION_SECRET = process.env.MIGRATION_SECRET

export async function GET(req: NextRequest) {
  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (!MIGRATION_SECRET) {
    return NextResponse.json(
      { error: 'MIGRATION_SECRET env var is not set. Endpoint disabled.' },
      { status: 403 }
    )
  }

  const secret = req.nextUrl.searchParams.get('secret')
  if (!secret || secret !== MIGRATION_SECRET) {
    return NextResponse.json(
      { error: 'Unauthorized. Invalid or missing secret.' },
      { status: 401 }
    )
  }

  // ── Run prisma db push ──────────────────────────────────────────────────────
  try {
    const prismaBin = path.join(process.cwd(), 'node_modules', '.bin', 'prisma')
    const { stdout, stderr } = await execAsync(
      `${prismaBin} db push --skip-generate --accept-data-loss`,
      {
        cwd: process.cwd(),
        env: { ...process.env },
        timeout: 120_000, // 2-minute timeout for schema sync
      }
    )

    return NextResponse.json({
      success: true,
      message: 'Prisma db push completed successfully.',
      stdout: stdout.trim(),
      stderr: stderr.trim() || null,
    })
  } catch (err: unknown) {
    const error = err as { message?: string; stdout?: string; stderr?: string }
    return NextResponse.json(
      {
        success: false,
        error: error.message ?? 'Unknown error',
        stdout: error.stdout ?? null,
        stderr: error.stderr ?? null,
      },
      { status: 500 }
    )
  }
}
