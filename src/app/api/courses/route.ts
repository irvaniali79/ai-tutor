import { NextRequest, NextResponse } from 'next/server'
import { getLlmConfig, chatComplete, extractJson, LlmError } from '@/lib/llm'
import { outlineMessages, type CourseOutline } from '@/lib/prompts'
import { db } from '@/lib/db'

export async function GET() {
  const courses = await db.course.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      topic: true,
      difficulty: true,
      language: true,
      description: true,
      model: true,
      createdAt: true,
    },
  })
  const result = await Promise.all(
    courses.map(async (c) => {
      const [readyLessons, totalLessons, completedLessons] = await Promise.all([
        db.lesson.count({ where: { courseId: c.id, status: 'ready' } }),
        db.lesson.count({ where: { courseId: c.id } }),
        db.lessonProgress.count({ where: { lesson: { courseId: c.id }, completed: true } }),
      ])
      return { ...c, readyLessons, totalLessons, completedLessons }
    })
  )
  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const topic = body?.topic?.trim()
  if (!topic) {
    return NextResponse.json({ error: 'Topic is required.' }, { status: 400 })
  }
  const moduleCount = clampInt(body?.moduleCount, 1, 8, 4)
  const lessonsPerModule = clampInt(body?.lessonsPerModule, 1, 10, 4)
  const audience = typeof body?.audience === 'string' ? body.audience.trim().slice(0, 300) : ''
  const difficulty = ['beginner', 'intermediate', 'advanced'].includes(body?.difficulty)
    ? body.difficulty
    : 'intermediate'

  try {
    const cfg = await getLlmConfig()
    const raw = await chatComplete(
      cfg,
      outlineMessages({
        topic: topic.slice(0, 500),
        audience,
        difficulty,
        moduleCount,
        lessonsPerModule,
        language: cfg.language,
      }),
      { temperature: 0.5 }
    )

    const outline = normalizeOutline(extractJson<CourseOutline>(raw), moduleCount, lessonsPerModule)

    const course = await db.course.create({
      data: {
        title: outline.title || topic,
        topic: topic.slice(0, 500),
        audience,
        difficulty,
        language: cfg.language,
        description: outline.description || '',
        model: cfg.model,
      },
    })

    for (let mi = 0; mi < outline.modules.length; mi++) {
      const m = outline.modules[mi]
      const moduleRow = await db.module.create({
        data: { courseId: course.id, order: mi, title: m.title, summary: m.summary },
      })
      await db.lesson.createMany({
        data: m.lessons.map((l, li) => ({
          courseId: course.id,
          moduleId: moduleRow.id,
          order: mi * lessonsPerModule + li,
          title: l.title,
          summary: l.summary,
        })),
      })
    }

    const full = await db.course.findUnique({
      where: { id: course.id },
      include: {
        modules: { orderBy: { order: 'asc' }, include: { lessons: { orderBy: { order: 'asc' } } } },
      },
    })
    return NextResponse.json(full, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate the course outline.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.round(v) : NaN
  if (Number.isNaN(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function normalizeOutline(
  raw: CourseOutline,
  moduleCount: number,
  lessonsPerModule: number
): CourseOutline {
  const modules = Array.isArray(raw.modules) ? raw.modules : []
  const clean = modules
    .filter((m) => m && typeof m.title === 'string' && Array.isArray(m.lessons))
    .slice(0, moduleCount)
    .map((m) => ({
      title: String(m.title).slice(0, 200),
      summary: String(m.summary ?? '').slice(0, 500),
      lessons: m.lessons
        .filter((l) => l && typeof l.title === 'string')
        .slice(0, lessonsPerModule)
        .map((l) => ({
          title: String(l.title).slice(0, 200),
          summary: String(l.summary ?? '').slice(0, 500),
        })),
    }))
  if (clean.length === 0) {
    throw new LlmError('Model returned an empty course outline. Try again or use a stronger model.')
  }
  return {
    title: String(raw.title ?? '').slice(0, 200),
    description: String(raw.description ?? '').slice(0, 2000),
    modules: clean,
  }
}
