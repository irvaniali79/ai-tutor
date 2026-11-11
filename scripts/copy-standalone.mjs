// Cross-platform replacement for `cp -r` in the build script.
// Copies static assets and public/ into the standalone output.
// Works on Windows, macOS and Linux with any package manager.
import { cpSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const standaloneDir = join(root, '.next', 'standalone')
const staticSrc = join(root, '.next', 'static')
const staticDest = join(standaloneDir, '.next', 'static')
const publicSrc = join(root, 'public')
const publicDest = join(standaloneDir, 'public')
const serverJs = join(standaloneDir, 'server.js')

if (!existsSync(staticSrc)) {
  console.error('copy-standalone: .next/static not found — did "next build" run?')
  process.exit(1)
}

if (!existsSync(serverJs)) {
  console.error(
    'copy-standalone: .next/standalone/server.js not found.\n' +
      'The "standalone" output was not generated. Make sure next.config.ts contains:\n' +
      "  const nextConfig: NextConfig = { output: 'standalone' };\n" +
      'then run "bun run build" again.'
  )
  process.exit(1)
}

cpSync(staticSrc, staticDest, { recursive: true })

if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true })
}

// carry the SQLite database (dev data) into the standalone output so the
// production server keeps the same courses — only on first run, never
// overwriting newer production data
const dbSrc = join(root, 'db')
const dbDest = join(standaloneDir, 'db')
if (existsSync(dbSrc) && !existsSync(dbDest)) {
  cpSync(dbSrc, dbDest, { recursive: true })
  console.log('copy-standalone: copied db/ into .next/standalone')
}

console.log('copy-standalone: copied static/ and public/ into .next/standalone')
