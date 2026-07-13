#!/usr/bin/env node
'use strict'

const baseUrlArg = process.argv.find((arg) => arg.startsWith('--base-url='))
const baseUrl = (baseUrlArg?.slice('--base-url='.length) || 'http://localhost:5000').replace(/\/$/, '')

async function fetchChecked(url, expectedType) {
  const response = await fetch(url, { cache: 'no-store', redirect: 'manual' })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)

  const contentType = response.headers.get('content-type') || ''
  if (expectedType && !contentType.toLowerCase().includes(expectedType)) {
    throw new Error(`${url} returned unexpected content-type ${contentType || '(missing)'}`)
  }

  const body = await response.text()
  if (!body.trim()) throw new Error(`${url} returned an empty response`)
  return { response, body }
}

async function main() {
  const probe = `${baseUrl}/login?deployment_asset_probe=${Date.now()}`
  const { response: loginResponse, body: html } = await fetchChecked(probe, 'text/html')
  const cacheControl = (loginResponse.headers.get('cache-control') || '').toLowerCase()
  if (!cacheControl.includes('no-store') || !cacheControl.includes('private')) {
    throw new Error(`Login HTML is cacheable across deployments: ${cacheControl || '(missing)'}`)
  }

  const assetMatches = html.matchAll(/\/_next\/static\/(?:css|chunks)\/[A-Za-z0-9._/-]+/g)
  const assetPaths = [...new Set(Array.from(assetMatches, (match) => match[0]))]
  const cssAssets = assetPaths.filter((asset) => asset.includes('/css/'))
  const scriptAssets = assetPaths.filter((asset) => asset.includes('/chunks/'))

  if (cssAssets.length === 0) throw new Error('Login HTML does not reference a CSS asset')
  if (scriptAssets.length === 0) throw new Error('Login HTML does not reference JavaScript chunks')

  for (const assetPath of assetPaths) {
    const expectedType = assetPath.includes('/css/') ? 'text/css' : 'javascript'
    await fetchChecked(`${baseUrl}${assetPath}`, expectedType)
  }

  const { body: versionBody } = await fetchChecked(`${baseUrl}/api/version`, 'application/json')
  const version = JSON.parse(versionBody)
  if (!version.buildId) throw new Error('/api/version did not return a buildId')

  const workerUrl = `${baseUrl}/sw.js?v=${encodeURIComponent(version.buildId)}`
  const { response: workerResponse, body: workerBody } = await fetchChecked(workerUrl, 'javascript')
  const workerCacheControl = (workerResponse.headers.get('cache-control') || '').toLowerCase()
  if (!workerCacheControl.includes('no-store')) {
    throw new Error(`Service worker response is cacheable: ${workerCacheControl || '(missing)'}`)
  }
  if (!workerBody.includes("searchParams.get('v')")) {
    throw new Error('Service worker does not derive its cache version from the registration URL')
  }

  console.log(
    `[verify-runtime] OK build=${version.buildId} css=${cssAssets.length} scripts=${scriptAssets.length}`,
  )
}

main().catch((error) => {
  console.error(`[verify-runtime] ERROR: ${error.message}`)
  process.exit(1)
})
