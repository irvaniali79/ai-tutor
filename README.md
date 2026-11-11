# CourseForge — Self-hosted AI Course Generator

Turn any topic into a complete course with **your own LLM API**. CourseForge is a
self-hosted web app that generates structured curricula — modules, lessons with code
examples, and quizzes — streamed live into a course reader, all stored locally in SQLite.

Works with **any OpenAI-compatible endpoint**: OmniRoute, OpenRouter, Ollama, LM Studio,
vLLM, Groq, OpenAI, and more.

## Features

- **Course outline generation** — topic → modules → lessons, with audience, difficulty,
  module/lesson count controls and output language selection.
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
> and is created automatically. To use a custom location, set `DATABASE_URL`
> (e.g. `DATABASE_URL=file:C:/data/courseforge.db`) in a `.env` file or your shell.

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

## Project structure

```
prisma/schema.prisma          # Course / Module / Lesson / Quiz / Progress / Settings
src/lib/llm.ts                # OpenAI-compatible client (streaming + JSON helpers)
src/lib/prompts.ts            # Curriculum, lesson and quiz prompts + parsers
src/app/api/settings/         # GET/PUT settings, POST test connection
src/app/api/courses/          # List / create (outline) / detail / delete
src/app/api/lessons/[id]/generate   # SSE streaming lesson generation
src/app/api/lessons/[id]/progress   # Completion + quiz score
src/app/api/demo-llm/         # Built-in demo endpoint (OpenAI-compatible mock)
src/components/               # Library, course view, lesson reader, quiz, dialogs
```
