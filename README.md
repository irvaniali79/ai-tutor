# CourseForge — Self-hosted AI Course Generator

Turn any topic into a complete course with **your own LLM API**. CourseForge is a
self-hosted web app that generates structured curricula — modules, lessons with code
examples, and quizzes — streamed live into a course reader, all stored locally in SQLite.

Works with **any OpenAI-compatible endpoint**: OmniRoute, OpenRouter, Ollama, LM Studio,
vLLM, Groq, OpenAI, and more.

## Features

- **Course outline generation** — topic → modules → lessons, with audience, difficulty,
  module/lesson count controls and output language selection.
- **Build a course from a file** — attach a PDF, Word (.docx), markdown/text, CSV or
  source-code file and the AI designs the course around that document; the extracted
  text is stored with the course and every lesson is grounded in the material
  (terminology, facts and examples come from your file, not the model's imagination).
  Legacy .doc and scanned/image-only PDFs are not supported.
- **Model-decided structure** — pick "AI decides" and the model sizes the course itself:
  it chooses how many modules are needed and how many lessons each one gets (capped at
  12 modules × 12 lessons as a safety net), or switch to "Fixed numbers" for the
  classic module/lesson sliders.
- **Expand / edit a course with AI** — the wand button in the course sidebar opens an
  update dialog: "Expand" only appends new modules and lessons (a prompt, a reference
  file, or both); "Edit structure" lets the model rename, reorder, add or remove
  modules/lessons. Lessons the model keeps retain their generated content, quiz results
  and progress — only omitted ones are deleted. Reference-file text is stored with the
  course so future lessons stay grounded in it.
- **Live streaming lesson generation** — each lesson (~800–1400 words of markdown with
  code blocks, tables and a summary) streams token-by-token into the reader.
- **Per-lesson quiz** — 4 AI-generated multiple-choice questions with scoring,
  explanations and retry.
- **Progress tracking** — mark lessons complete, per-course progress bars.
- **Editable structure** — rename courses, modules and lessons (title/summary/description)
  from the library cards and the course sidebar; generated content is never touched.
- **AI tutor chat per lesson** — a right-side chat panel where the tutor (which has read
  the lesson) answers your questions with streamed replies. Each lesson keeps its own
  chat threads: start a new chat any time, switch or delete threads; everything is
  stored in SQLite and survives reloads.
- **Generate queue** — "Generate N remaining" produces all pending lessons one by one;
  stop anytime.
- **Demo mode** — a built-in demo endpoint lets you try the whole flow with zero
  configuration.
- **Local-first** — everything (courses, lessons, quizzes, progress, settings) lives in
  a single SQLite file.

## Getting started

```bash
# 1. Install dependencies
bun install        # or: npm install

# 2. Create the database
bun run db:push    # creates db/custom.db from prisma/schema.prisma

# 3. Run the app
bun run dev        # http://localhost:3000
```

> **No `.env` needed.** The SQLite location defaults to `<project>/db/custom.db`
> and is created automatically. `db:push` / `db:migrate` / `db:reset` run through
> `scripts/with-db-url.js`, which computes the same absolute location for the
> Prisma CLI (and uses the Prisma version pinned in `package.json`, not a global
> install). To use a custom location, set an **absolute** `DATABASE_URL` — copy
> `.env.example` to `.env` for a template. Relative paths are intentionally not
> supported: the Prisma CLI resolves them against `prisma/` while the app
> resolves them against the project root, which would push to the wrong file.

Then:

1. Click **API Settings** (top right) and fill in:
   - **API base URL** — e.g. `http://localhost:11434` (Ollama),
     `https://openrouter.ai/api/v1` (OpenRouter), or your OmniRoute endpoint.
     `/v1/chat/completions` is appended automatically if missing.
   - **API key** — leave empty for local servers that don't need one.
   - **Model** — any chat model your endpoint serves (e.g. `llama3.1:8b`,
     `openai/gpt-4o-mini`, `anthropic/claude-3.5-sonnet`).
   - **Temperature** and **course language**.
   - Hit **Test connection** to verify.
2. Click **Create your first course**, describe the topic, pick difficulty and size.
3. Open lessons and either generate them individually or use
   **Generate N remaining**.

## Demo mode

Until you configure your own endpoint, the app ships pointed at a built-in demo
endpoint (`/api/demo-llm`) that behaves like a real OpenAI-compatible server: inside
the Z.ai sandbox it calls the bundled AI SDK, so demo courses are **real, topic-aware
content for any topic you type**. When self-hosted without SDK credentials it falls
back to a canned sample gRPC & Protocol Buffers course. Replace it with your real API
in **API Settings** any time — nothing else changes. A yellow banner in the library
reminds you whenever demo mode is active.

## Self-hosting notes

- **Database**: single file at `db/custom.db`. Back it up or copy it to move your
  library. Recreate the schema anytime with `bun run db:push`.
- **API key storage**: stored in the local SQLite settings table — the key never
  leaves your machine except to call your chosen LLM endpoint.
- **Production**: `bun run build && bun run start` (Next.js standalone server).
- **Requirements**: Node.js 18+ or Bun 1.x. No external services needed.

## Troubleshooting

- **`error: Environment variable not found: DATABASE_URL` (P1012) when running
  `bun run db:push`** — you are on an older copy of the repo whose `db:push`
  script called `prisma` directly. Pull the latest version: `db:push`,
  `db:migrate` and `db:reset` now run through `scripts/with-db-url.js`, which
  supplies an absolute `DATABASE_URL` itself. Alternatively set `DATABASE_URL`
  to an absolute `file:` path in a `.env` file (see `.env.example`).
- **`[CLI.UNKNOWN_COMMAND] No command registered for 'push'`** — `bunx prisma`
  downloaded a newer global Prisma major instead of the pinned one. The bundled
  `scripts/with-db-url.js` avoids this by always invoking the project's own
  `node_modules/prisma`; run `bun install` first so it exists.

## Run with Docker

The image builds the Next.js standalone bundle and runs the production server;
the SQLite database lives on a named volume mounted at `/data`, so courses
survive restarts and rebuilds. The Prisma schema is applied automatically on
every startup (`prisma db push` is idempotent), so a fresh volume provisions
itself — nothing else to configure.

```bash
# with docker compose (recommended)
docker compose up -d --build
# then open http://localhost:3000

# or plain docker
docker build -t courseforge:latest .
docker run -d --name courseforge -p 3000:3000 \
  -v courseforge-data:/data courseforge:latest
```

To use a different host port, change the left side of `-p 3000:3000`. To point
the app at a custom database location, override `DATABASE_URL` (must be a
`file:` URL, e.g. `file:/data/my-courses.db`). Back up the volume (or copy
`/data/custom.db` out of the container) to move your library.

## Project structure

```
prisma/schema.prisma          # Course / Module / Lesson / Quiz / Progress / Settings
src/lib/llm.ts                # OpenAI-compatible client (streaming + JSON helpers)
src/lib/prompts.ts            # Curriculum, lesson and quiz prompts + parsers
src/lib/file-text.ts          # Source-file text extraction (PDF / DOCX / text)
src/app/api/settings/         # GET/PUT settings, POST test connection
src/app/api/courses/          # List / create (outline, file upload) / detail / delete
                              #   / export / import / [id]/ai-update (expand & restructure with AI)
src/app/api/lessons/[id]/generate   # SSE streaming lesson generation
src/app/api/lessons/[id]/progress   # Completion + quiz score
src/app/api/demo-llm/         # Built-in demo endpoint (OpenAI-compatible mock)
src/components/               # Library, course view, lesson reader, quiz, dialogs
```
