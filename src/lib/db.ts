import { PrismaClient } from '@prisma/client'
import path from 'node:path'
import fs from 'node:fs'

/**
 * Resolve the SQLite database location robustly and cross-platform:
 * - `DATABASE_URL` from the environment / .env when it is set. Relative
 *   `file:` paths are resolved against the working directory (project root
 *   in dev, `.next/standalone` in production) — NOT against the prisma
 *   folder, which is the classic cause of "Error code 14: Unable to open
 *   the database file". Missing parent folders are created automatically.
 * - otherwise default to <cwd>/db/custom.db (created on demand).
 * The resolved location is printed once at startup so it is always visible
 * where the data lives.
 */
function defaultDbUrl(): string {
  const dbDir = path.join(process.cwd(), 'db')
  fs.mkdirSync(dbDir, { recursive: true })
  return `file:${path.join(dbDir, 'custom.db').replace(/\\/g, '/')}`
}

function resolveDatasourceUrl(): string {
  const fromEnv = process.env.DATABASE_URL?.trim()
  if (!fromEnv) return defaultDbUrl()

  if (fromEnv.startsWith('file:')) {
    const raw = fromEnv.slice('file:'.length)
    const isAbsolute = path.isAbsolute(raw) || /^[a-zA-Z]:[\\/]/.test(raw)
    const filePath = isAbsolute ? raw : path.join(process.cwd(), raw)
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
    } catch {
      // requested location cannot be created (permissions?) — use the default
      console.warn(`[db] Cannot create directory for DATABASE_URL "${fromEnv}", using default location.`)
      return defaultDbUrl()
    }
    return `file:${filePath.replace(/\\/g, '/')}`
  }

  return fromEnv
}

const resolvedUrl = resolveDatasourceUrl()
console.log(`[db] SQLite database: ${resolvedUrl}`)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasourceUrl: resolvedUrl,
    log: ['query'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
