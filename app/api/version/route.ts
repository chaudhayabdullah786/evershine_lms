import { readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'

/**
 * GET /api/version
 *
 * Returns the deployed build identity so you can verify a Hostinger deployment
 * from a browser tab or curl without SSH access.
 *
 * WHY this exists: After merging and deploying, visit /api/version to confirm
 * the buildId changed. If it matches the pre-deploy value, the build did not run.
 *
 * SECURITY: Returns no secrets, credentials, database URLs, or internal paths.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type BuildMetadata = {
  buildId: string
  revision: string | null
  builtAt: string
}

async function readBuildMetadata(): Promise<BuildMetadata | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'public', 'build-info.json'), 'utf8')
    const parsed = JSON.parse(raw) as Partial<BuildMetadata>
    if (typeof parsed.buildId !== 'string' || typeof parsed.builtAt !== 'string') return null
    return {
      buildId: parsed.buildId,
      revision: typeof parsed.revision === 'string' ? parsed.revision : null,
      builtAt: parsed.builtAt,
    }
  } catch {
    return null
  }
}

export async function GET() {
  let buildId: string | null = null
  const metadata = await readBuildMetadata()

  try {
    buildId = (
      await readFile(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8')
    ).trim()
  } catch {
    // .next/BUILD_ID is absent when running in a non-built environment (e.g. CI
    // smoke tests against the source). Return null — not an error.
    buildId = null
  }

  return NextResponse.json(
    {
      buildId: metadata?.buildId ?? buildId,
      revision: metadata?.revision ?? null,
      deployedAt: metadata?.builtAt ?? null,
      observedAt: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV ?? 'unknown',
    },
    {
      headers: {
        // Never cache — this must always return the live value.
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    }
  )
}
