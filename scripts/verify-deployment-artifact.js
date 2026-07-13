#!/usr/bin/env node
'use strict'

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

function collectFiles(root, current = root, files = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) collectFiles(root, absolutePath, files)
    else files.push(path.relative(root, absolutePath))
  }
  return files.sort()
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')
}

function requirePath(target, label) {
  if (!fs.existsSync(target)) {
    throw new Error(`${label} is missing: ${target}`)
  }
}

function verifyDeploymentArtifact(root = path.resolve(__dirname, '..')) {
  const buildIdPath = path.join(root, '.next', 'BUILD_ID')
  const sourceStatic = path.join(root, '.next', 'static')
  const standaloneRoot = path.join(root, '.next', 'standalone')
  const standaloneStatic = path.join(standaloneRoot, '.next', 'static')
  const sourceWorker = path.join(root, 'public', 'sw.js')
  const standaloneWorker = path.join(standaloneRoot, 'public', 'sw.js')

  requirePath(buildIdPath, 'Next.js BUILD_ID')
  requirePath(sourceStatic, 'Next.js static directory')
  requirePath(path.join(standaloneRoot, 'server.js'), 'Standalone server')
  requirePath(standaloneStatic, 'Standalone static directory')
  requirePath(sourceWorker, 'Source service worker')
  requirePath(standaloneWorker, 'Standalone service worker')

  const buildId = fs.readFileSync(buildIdPath, 'utf8').trim()
  if (!buildId) throw new Error('Next.js BUILD_ID is empty')

  const sourceFiles = collectFiles(sourceStatic)
  if (sourceFiles.length === 0) throw new Error('Next.js static directory is empty')

  for (const relativePath of sourceFiles) {
    const sourcePath = path.join(sourceStatic, relativePath)
    const deployedPath = path.join(standaloneStatic, relativePath)
    requirePath(deployedPath, `Standalone asset ${relativePath}`)
    if (sha256(sourcePath) !== sha256(deployedPath)) {
      throw new Error(`Standalone asset differs from current build: ${relativePath}`)
    }
  }

  const placeholderDeclaration = "const BUILD_FALLBACK = '__BUILD_ID__';"
  const injectedDeclaration = `const BUILD_FALLBACK = '${buildId}';`
  const sourceWorkerBody = fs.readFileSync(sourceWorker, 'utf8')
  const standaloneWorkerBody = fs.readFileSync(standaloneWorker, 'utf8')

  if (!sourceWorkerBody.includes(placeholderDeclaration)) {
    throw new Error('Source service worker BUILD_ID placeholder declaration is missing')
  }
  if (!standaloneWorkerBody.includes(injectedDeclaration)) {
    throw new Error('Standalone service worker does not contain the current BUILD_ID')
  }
  if (!standaloneWorkerBody.includes("searchParams.get('v')")) {
    throw new Error('Standalone service worker does not support runtime build versioning')
  }

  console.log(
    `[verify-deployment] OK build=${buildId} staticFiles=${sourceFiles.length} standalone assets match`,
  )
}

if (require.main === module) {
  try {
    verifyDeploymentArtifact()
  } catch (error) {
    console.error(`[verify-deployment] ERROR: ${error.message}`)
    process.exit(1)
  }
}

module.exports = { verifyDeploymentArtifact }
