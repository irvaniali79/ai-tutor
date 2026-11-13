#!/usr/bin/env bun
/**
 * Wrapper for Prisma CLI commands that need DATABASE_URL (db push, migrate).
 *
 * Why this exists:
 *  - The repo ships no .env file, so `prisma db push` fails with
 *    "Environment variable not found: DATABASE_URL".
 *  - A relative path like `file:./db/custom.db` inside .env is resolved by
 *    the Prisma CLI against the *prisma/* folder, while the app resolves it
 *    against the project root — the CLI would push to the wrong file.
 *
 * This script computes an ABSOLUTE url for <project root>/db/custom.db
 * (creating the folder if needed) and runs `bunx prisma <args>` with it.
 * Works on Windows, macOS and Linux. The runtime (src/lib/db.ts) resolves
 * the same location from the project root, so CLI and app always agree.
 *
 * Usage: bun scripts/with-db-url.js <prisma args...>
 *   e.g. bun scripts/with-db-url.js db push --accept-data-loss
 */
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const projectRoot = path.resolve(__dirname, '..')
const dbDir = path.join(projectRoot, 'db')
try {
  fs.mkdirSync(dbDir, { recursive: true })
} catch (err) {
  console.error(`[db-url] Cannot create database folder "${dbDir}": ${err.message}`)
  process.exit(1)
}

const dbPath = path.join(dbDir, 'custom.db').replace(/\\/g, '/')
process.env.DATABASE_URL = `file:${dbPath}`

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: bun scripts/with-db-url.js <prisma args...>')
  process.exit(1)
}

// Prefer the project's own Prisma (pinned in package.json). `bunx prisma`
// silently downloads the latest global release when node_modules is missing,
// and newer Prisma majors renamed their CLI commands.
let command, prefix
try {
  const pkgJsonPath = require.resolve('prisma/package.json', { paths: [projectRoot] })
  const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))
  const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.prisma
  const binPath = path.join(path.dirname(pkgJsonPath), binRel)
  if (fs.existsSync(binPath)) {
    command = 'bun'
    prefix = [binPath]
  } else {
    command = 'bunx'
    prefix = ['prisma']
  }
} catch {
  command = 'bunx'
  prefix = ['prisma']
}

console.log(`[db-url] DATABASE_URL=${process.env.DATABASE_URL}`)
console.log(`[db-url] ${command} ${prefix.join(' ')} ${args.join(' ')}`)

const result = spawnSync(command, [...prefix, ...args], {
  stdio: 'inherit',
  env: process.env,
  cwd: projectRoot,
  shell: process.platform === 'win32', // needed so .cmd shims resolve on Windows
})

process.exit(result.status ?? 1)
