import { access, readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type Check = {
  ok: boolean
  detail?: string
}

async function readBuildId(): Promise<Check & { buildId?: string }> {
  try {
    const buildId = (await readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8')).trim()
    return { ok: Boolean(buildId), buildId: buildId || undefined }
  } catch {
    return { ok: false, detail: '.next/BUILD_ID is missing' }
  }
}

async function checkStaticAssets(): Promise<Check> {
  try {
    await access(path.join(process.cwd(), '.next', 'static'))
    return { ok: true }
  } catch {
    return { ok: false, detail: '.next/static is missing' }
  }
}

async function checkDatabase(): Promise<Check> {
  try {
    await prisma.$queryRaw`SELECT 1`
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : 'Database check failed',
    }
  }
}

export async function GET() {
  const [build, staticAssets, database] = await Promise.all([
    readBuildId(),
    checkStaticAssets(),
    checkDatabase(),
  ])

  const checks = { build, staticAssets, database }
  const ok = Object.values(checks).every((check) => check.ok)

  return NextResponse.json(
    {
      success: ok,
      data: {
        status: ok ? 'ok' : 'degraded',
        app: 'evershine-lms',
        runtime: 'nodejs',
        nodeEnv: process.env.NODE_ENV ?? 'unknown',
        checks,
      },
      meta: { timestamp: new Date().toISOString() },
    },
    {
      status: ok ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      },
    }
  )
}
