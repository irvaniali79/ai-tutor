# syntax=docker/dockerfile:1

# CourseForge — self-hosted AI course generator (Next.js standalone + SQLite)
#
# The SQLite database lives on a volume mounted at /data (env DATABASE_URL
# defaults to file:/data/custom.db), so courses survive container restarts
# and rebuilds. The Prisma schema is applied on every startup (`prisma db
# push` is idempotent), so a fresh volume is provisioned automatically.

########## deps: install JS dependencies with bun (bun.lock) ##########
FROM node:22-bookworm-slim AS deps
COPY --from=oven/bun:1 /bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile

########## prod-deps: production-only node_modules for the runner ##########
FROM node:22-bookworm-slim AS prod-deps
COPY --from=oven/bun:1 /bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
COPY prisma ./prisma
RUN bun install --frozen-lockfile --production

########## build: prisma client + Next.js standalone bundle ##########
FROM node:22-bookworm-slim AS build
COPY --from=oven/bun:1 /bin/bun /usr/local/bin/bun
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# DATABASE_URL must be defined for prisma/next build-time validation;
# nothing connects to it during the build.
ENV DATABASE_URL=file:/data/custom.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# runs: prisma generate && next build && node scripts/copy-standalone.mjs
RUN bun run build

########## runner: minimal production image ##########
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DATABASE_URL=file:/data/custom.db

# standalone server (server.js + traced node_modules + static/ + public/)
COPY --from=build /app/.next/standalone ./
# schema for the startup `prisma db push`
COPY --from=build /app/prisma/schema.prisma ./prisma/schema.prisma
# production node_modules: runtime deps + the prisma CLI used by the entrypoint
COPY --from=prod-deps /app/node_modules ./node_modules
# the generated prisma client (query engine included) from the build stage
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

VOLUME /data
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
