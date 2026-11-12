#!/bin/sh
# Container entrypoint:
#  1. make sure the directory backing the SQLite file exists (volume mount)
#  2. apply the Prisma schema — idempotent, provisions a fresh volume and
#     no-ops (or applies new tables after an upgrade) on existing data
#  3. hand off to the Next.js standalone server
set -e

DB_FILE="${DATABASE_URL#file:}"
mkdir -p "$(dirname "$DB_FILE")"

echo "[entrypoint] Applying Prisma schema to ${DB_FILE} ..."
node node_modules/prisma/build/index.js db push --skip-generate

echo "[entrypoint] Starting CourseForge on port ${PORT:-3000} ..."
exec node server.js
