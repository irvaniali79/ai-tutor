import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/courses/import
//
// Accepts a JSON file produced by GET /api/courses/:id/export and recreates
// the course with fresh database IDs. All ready lessons keep their generated
// content (no regeneration needed); lessons that were pending/generating in
// the source are imported as "pending". Progress and chat history are kept.

const MAX_IMPORT_BYTES = 50 * 1024 * 1024 // 50 MB safety net

export async function POST(req: NextRequest) {
  const contentType = req.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) {
    return NextResponse.json(
      { error: 'Expected a JSON file. Use a *.courseforge.json exported from CourseForge.' },
      { status: 415 }
    )
  }

  const raw = await req.text()
  if (raw.length > MAX_IMPORT_BYTES) {
    return NextResponse.json({ error: 'File is too large to import.' }, { status: 413 })
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'The file is not valid JSON.' }, { status: 400 })
  }

  // Accept both the wrapper format ({ format, version, course }) and a bare
  // course object, so hand-edited files still work.
  const wrapper = parsed as { format?: string; course?: unknown }
  const source =
    wrapper && typeof wrapper === 'object' && wrapper.course && typeof wrapper.course === 'object'
      ? wrapper.course
      : parsed
  if (
    wrapper &&
    typeof wrapper === 'object' &&
    typeof wrapper.format === 'string' &&
    wrapper.format !== 'courseforge-course'
  ) {
    return NextResponse.json(
      { error: `Unsupported file format "${wrapper.format}". Expected "courseforge-course".` },
      { status: 400 }
    )
  }

  const course = source as ImportCourse | null
  if (!course || typeof course !== 'object' || !isNonEmptyString(course.title)) {
    return NextResponse.json(
      { error: 'The file does not contain a course (missing "title").' },
      { status: 400 }
    )
  }
  if (course.modules !== undefined && !Array.isArray(course.modules)) {
    return NextResponse.json({ error: '"modules" must be a list.' }, { status: 400 })
  }

  const difficulty =
    typeof course.difficulty === 'string' &&
    ['beginner', 'intermediate', 'advanced'].includes(course.difficulty)
      ? course.difficulty
      : 'intermediate'

  try {
    // Built row by row inside an interactive transaction so a failure halfway
    // through does not leave a half-imported course in the library.
    const created = await db.$transaction(async (tx) => {
      const courseRow = await tx.course.create({
        data: {
          title: str(course.title, 200),
          topic: str(course.topic, 500) || str(course.title, 500),
          audience: str(course.audience, 300),
          difficulty,
          language: str(course.language, 50) || 'English',
          description: str(course.description, 2000),
          model: `${str(course.model, 200)} (imported)`.trim(),
        },
      })

      const modules = (Array.isArray(course.modules) ? course.modules : []).filter(isModuleLike)
      for (let mi = 0; mi < modules.length; mi++) {
        const m = modules[mi]
        const moduleRow = await tx.module.create({
          data: {
            courseId: courseRow.id,
            order: clampInt(m.order, 0, 100_000, mi),
            title: str(m.title, 200) || `Module ${mi + 1}`,
            summary: str(m.summary, 500),
          },
        })

        const lessons = (Array.isArray(m.lessons) ? m.lessons : []).filter(isLessonLike)
        for (let li = 0; li < lessons.length; li++) {
          const l = lessons[li]
          await tx.lesson.create({
            data: {
              courseId: courseRow.id,
              moduleId: moduleRow.id,
              order: clampInt(l.order, 0, 100_000, li),
              title: str(l.title, 200) || `Lesson ${li + 1}`,
              summary: str(l.summary, 500),
              content: str(l.content, 2_000_000),
              // lessons that already have generated content stay ready;
              // anything else goes back to pending (re-generation allowed)
              status: isNonEmptyString(l.content) ? 'ready' : 'pending',
              error: '',
              suggestions: str(l.suggestions, 100_000),
              quiz: {
                create: (Array.isArray(l.quiz) ? l.quiz : []).filter(isQuizLike).map((q, qi) => ({
                  order: qi,
                  question: str(q.question, 2000),
                  optionA: str(q.optionA, 1000),
                  optionB: str(q.optionB, 1000),
                  optionC: str(q.optionC, 1000),
                  optionD: str(q.optionD, 1000),
                  correctIndex: clampInt(q.correctIndex, 0, 3, 0),
                  explanation: str(q.explanation, 4000),
                })),
              },
              progress: l.progress
                ? {
                    create: {
                      completed: Boolean(l.progress?.completed),
                      quizScore: clampInt(l.progress?.quizScore, 0, 1000, 0),
                      quizTotal: clampInt(l.progress?.quizTotal, 0, 1000, 0),
                    },
                  }
                : undefined,
              chats: {
                create: (Array.isArray(l.chats) ? l.chats : []).filter(isChatLike).map((c) => ({
                  title: str(c.title, 200) || 'New chat',
                  createdAt: parseDate(c.createdAt),
                  messages: {
                    create: (Array.isArray(c.messages) ? c.messages : [])
                      .filter(isMessageLike)
                      .map((msg) => ({
                        role: msg.role === 'user' ? 'user' : 'assistant',
                        content: str(msg.content, 1_000_000),
                        createdAt: parseDate(msg.createdAt),
                      })),
                  },
                })),
              },
            },
          })
        }
      }
      return courseRow
    })

    const [moduleCount, lessonCount] = await Promise.all([
      db.module.count({ where: { courseId: created.id } }),
      db.lesson.count({ where: { courseId: created.id } }),
    ])

    return NextResponse.json(
      {
        ok: true,
        course: { id: created.id, title: created.title },
        counts: { modules: moduleCount, lessons: lessonCount },
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('[import] failed:', err)
    return NextResponse.json(
      { error: 'Import failed while writing to the database. Please try again.' },
      { status: 500 }
    )
  }
}

// ---- sanitizers ------------------------------------------------------------

type ImportCourse = {
  title?: unknown
  topic?: unknown
  audience?: unknown
  difficulty?: unknown
  language?: unknown
  description?: unknown
  model?: unknown
  modules?: unknown
}

type ImportModule = { order?: unknown; title?: unknown; summary?: unknown; lessons?: unknown }
type ImportLesson = {
  order?: unknown
  title?: unknown
  summary?: unknown
  content?: unknown
  suggestions?: unknown
  quiz?: unknown
  progress?: { completed?: unknown; quizScore?: unknown; quizTotal?: unknown } | null
  chats?: unknown
}
type ImportQuiz = {
  question?: unknown
  optionA?: unknown
  optionB?: unknown
  optionC?: unknown
  optionD?: unknown
  correctIndex?: unknown
  explanation?: unknown
}
type ImportChat = { title?: unknown; createdAt?: unknown; messages?: unknown }
type ImportMessage = { role?: unknown; content?: unknown; createdAt?: unknown }

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function parseDate(v: unknown): Date {
  const d = typeof v === 'string' ? new Date(v) : null
  return d && !Number.isNaN(d.getTime()) ? d : new Date()
}

function isModuleLike(v: unknown): v is ImportModule {
  return isRecord(v)
}

function isLessonLike(v: unknown): v is ImportLesson {
  return isRecord(v)
}

function isQuizLike(v: unknown): v is ImportQuiz {
  return isRecord(v)
}

function isChatLike(v: unknown): v is ImportChat {
  return isRecord(v)
}

function isMessageLike(v: unknown): v is ImportMessage {
  return isRecord(v) && isNonEmptyString(v.content)
}
