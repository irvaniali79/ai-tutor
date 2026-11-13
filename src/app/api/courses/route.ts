import { NextRequest, NextResponse } from 'next/server'
import { getLlmConfig, chatComplete, extractJson, LlmError } from '@/lib/llm'
import { outlineMessages, type CourseOutline } from '@/lib/prompts'
import { extractSourceText, FileTextError } from '@/lib/file-text'
import { db } from '@/lib/db'

// Safety caps for model-decided structures (guards against runaway outlines)
const MAX_AUTO_MODULES = 12
const MAX_AUTO_LESSONS_PER_MODULE = 12

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
  const contentType = req.headers.get('content-type') ?? ''

  // ---- read the request: JSON (topic only) or multipart (topic + optional file)
  let topic = ''
  let audience = ''
  let difficulty = 'intermediate'
  let structure = 'fixed'
  let moduleCount = 4
  let lessonsPerModule = 4
  let sourceFile: File | null = null
  let pastedText = ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
    topic = String(form.get('topic') ?? '').trim()
    audience = String(form.get('audience') ?? '').trim().slice(0, 300)
    difficulty = String(form.get('difficulty') ?? 'intermediate')
    structure = String(form.get('structure') ?? 'fixed')
    moduleCount = Number(form.get('moduleCount') ?? 4)
    lessonsPerModule = Number(form.get('lessonsPerModule') ?? 4)
    const file = form.get('file')
    if (file && file instanceof File && file.size > 0) sourceFile = file
  } else {
    const body = await req.json().catch(() => null)
    topic = body?.topic?.trim() ?? ''
    audience = typeof body?.audience === 'string' ? body.audience.trim().slice(0, 300) : ''
    difficulty = body?.difficulty ?? 'intermediate'
    structure = body?.structure === 'auto' ? 'auto' : 'fixed'
    moduleCount = body?.moduleCount ?? 4
    lessonsPerModule = body?.lessonsPerModule ?? 4
    if (typeof body?.sourceText === 'string') {
      // JSON path can carry pre-extracted text directly (API callers / tests)
      pastedText = body.sourceText
    }
  }

  if (!topic && !sourceFile && !pastedText) {
    return NextResponse.json(
      { error: 'Topic is required (or attach a source file to base the course on).' },
      { status: 400 }
    )
  }
  if (!['beginner', 'intermediate', 'advanced'].includes(difficulty)) {
    difficulty = 'intermediate'
  }

  const autoStructure = structure === 'auto'
  const fixedModuleCount = clampInt(autoStructure ? NaN : moduleCount, 1, 8, 4)
  const fixedLessonsPerModule = clampInt(autoStructure ? NaN : lessonsPerModule, 1, 10, 4)

  // ---- extract text from the uploaded file, if any
  let sourceContent = ''
  let sourceName = ''
  try {
    if (pastedText) {
      sourceContent = pastedText.slice(0, 100_000)
      sourceName = 'pasted text'
    } else if (sourceFile) {
      const extracted = await extractSourceText(sourceFile)
      sourceContent = extracted.text
      sourceName = extracted.filename
    }
  } catch (err) {
    if (err instanceof FileTextError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[courses] file extraction failed:', err)
    return NextResponse.json(
      { error: 'Could not read the attached file. Supported: .pdf, .docx, .txt, .md, .csv.' },
      { status: 400 }
    )
  }

  try {
    const cfg = await getLlmConfig()
    const raw = await chatComplete(
      cfg,
      outlineMessages({
        topic: topic.slice(0, 500),
        audience: audience.slice(0, 300),
        difficulty,
        // 'auto' → null: the model decides module / lesson counts itself
        moduleCount: autoStructure ? null : fixedModuleCount,
        lessonsPerModule: autoStructure ? null : fixedLessonsPerModule,
        language: cfg.language,
        sourceContent,
      }),
      { temperature: 0.5 }
    )

    const outline = normalizeOutline(
      extractJson<CourseOutline>(raw),
      autoStructure ? MAX_AUTO_MODULES : fixedModuleCount,
      autoStructure ? MAX_AUTO_LESSONS_PER_MODULE : fixedLessonsPerModule
    )

    const course = await db.course.create({
      data: {
        title: outline.title || topic || sourceName,
        topic: (topic || sourceName || outline.title || 'course').slice(0, 500),
        audience: audience.slice(0, 300),
        difficulty,
        language: cfg.language,
        description: outline.description || '',
        model: cfg.model,
        sourceContent,
      },
    })

    // global lesson order per module: mi * 100 keeps room for per-module lessons
    for (let mi = 0; mi < outline.modules.length; mi++) {
      const m = outline.modules[mi]
      const moduleRow = await db.module.create({
        data: { courseId: course.id, order: mi, title: m.title, summary: m.summary },
      })
      await db.lesson.createMany({
        data: m.lessons.map((l, li) => ({
          courseId: course.id,
          moduleId: moduleRow.id,
          order: mi * 100 + li,
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

function normalizeOutline(raw: CourseOutline, moduleCount: number, lessonsPerModule: number): CourseOutline {
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
    .filter((m) => m.lessons.length > 0) // never create an empty module
  if (clean.length === 0) {
    throw new LlmError('Model returned an empty course outline. Try again or use a stronger model.')
  }
  return {
    title: String(raw.title ?? '').slice(0, 200),
    description: String(raw.description ?? '').slice(0, 2000),
    modules: clean,
  }
}
