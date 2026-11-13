import { NextRequest, NextResponse } from 'next/server'
import { getLlmConfig, chatComplete, extractJson, LlmError } from '@/lib/llm'
import { updateOutlineMessages, type OutlineModuleForUpdate } from '@/lib/prompts'
import { extractSourceText, FileTextError } from '@/lib/file-text'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// safety caps for model-returned structures
const MAX_NEW_MODULES = 12
const MAX_NEW_LESSONS_PER_MODULE = 12

interface ExpandReply {
  newModules?: unknown
  newLessonsByModule?: unknown
}
interface EditReply {
  title?: unknown
  description?: unknown
  modules?: unknown
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: courseId } = await params
  const contentType = req.headers.get('content-type') ?? ''

  // ---- read the request: JSON or multipart (with a reference file)
  let mode: 'expand' | 'edit' = 'expand'
  let instruction = ''
  let sourceFile: File | null = null
  let pastedText = ''

  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
    mode = String(form.get('mode') ?? 'expand') === 'edit' ? 'edit' : 'expand'
    instruction = String(form.get('instruction') ?? '').trim()
    const file = form.get('file')
    if (file && file instanceof File && file.size > 0) sourceFile = file
    if (typeof form.get('sourceText') === 'string') pastedText = String(form.get('sourceText'))
  } else {
    const body = await req.json().catch(() => null)
    mode = body?.mode === 'edit' ? 'edit' : 'expand'
    instruction = typeof body?.instruction === 'string' ? body.instruction.trim().slice(0, 4000) : ''
    if (typeof body?.sourceText === 'string') pastedText = body.sourceText
  }

  if (!instruction.trim() && !sourceFile && !pastedText) {
    return NextResponse.json(
      { error: 'Describe what to change or attach a reference file.' },
      { status: 400 }
    )
  }

  const course = await db.course.findUnique({
    where: { id: courseId },
    include: {
      modules: {
        orderBy: { order: 'asc' },
        include: { lessons: { orderBy: { order: 'asc' }, select: { id: true, title: true, summary: true } } },
      },
    },
  })
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  if (course.modules.length === 0) {
    return NextResponse.json({ error: 'This course has no modules to update.' }, { status: 400 })
  }

  // ---- extract reference text, if any (also stored so future lessons stay grounded)
  let referenceText = ''
  let referenceName = ''
  try {
    if (pastedText) {
      referenceText = pastedText.slice(0, 100_000)
      referenceName = 'pasted text'
    } else if (sourceFile) {
      const extracted = await extractSourceText(sourceFile)
      referenceText = extracted.text
      referenceName = extracted.filename
    }
  } catch (err) {
    if (err instanceof FileTextError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[ai-update] file extraction failed:', err)
    return NextResponse.json(
      { error: 'Could not read the attached file. Supported: .pdf, .docx, .txt, .md, .csv.' },
      { status: 400 }
    )
  }

  const currentModules: OutlineModuleForUpdate[] = course.modules.map((m) => ({
    id: m.id,
    title: m.title,
    summary: m.summary,
    lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, summary: l.summary })),
  }))

  let cfg
  try {
    cfg = await getLlmConfig()
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 })
  }

  let raw: string
  try {
    raw = await chatComplete(
      cfg,
      updateOutlineMessages({
        mode,
        courseTitle: course.title,
        courseDescription: course.description,
        modules: currentModules,
        instruction: instruction.slice(0, 4000) || referenceName,
        language: cfg.language,
        sourceContent: referenceText || undefined,
      }),
      { temperature: 0.4 }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The update request failed.'
    return NextResponse.json({ error: message }, { status: 502 })
  }

  try {
    const updated = await applyUpdate(course.id, mode, raw, currentModules.length)
    // merge the reference material into the course source (kept for grounding)
    if (referenceText) {
      const merged =
        `${course.sourceContent ? course.sourceContent + '\n\n---\n\n' : ''}` +
        `# Reference: ${referenceName}\n\n${referenceText}`
      await db.course.update({
        where: { id: course.id },
        data: { sourceContent: merged.slice(0, 400_000) },
      })
    }
    const full = await db.course.findUnique({
      where: { id: course.id },
      include: {
        modules: {
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                summary: true,
                order: true,
                status: true,
                moduleId: true,
                progress: { select: { completed: true, quizScore: true, quizTotal: true } },
                _count: { select: { quiz: true } },
              },
            },
          },
        },
      },
    })
    return NextResponse.json({ ok: true, course: full })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not apply the model\'s update.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

function cleanLessons(v: unknown, cap: number): { title: string; summary: string; id: string | null }[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((l) => l && typeof l === 'object' && typeof (l as { title?: unknown }).title === 'string')
    .slice(0, cap)
    .map((l) => {
      const o = l as { id?: unknown; title?: unknown; summary?: unknown }
      return {
        title: cleanText(o.title, 200),
        summary: cleanText(o.summary, 500),
        id: typeof o.id === 'string' && o.id ? o.id : null,
      }
    })
    .filter((l) => l.title.length > 0)
}

/** Applies the model's reply inside one transaction. Never throws for shape issues it can sanitize. */
async function applyUpdate(
  courseId: string,
  mode: 'expand' | 'edit',
  raw: string,
  existingModuleCount: number
) {
  if (mode === 'expand') {
    const reply = extractJson<ExpandReply>(raw)
    const newModules = Array.isArray(reply.newModules) ? reply.newModules : []
    const newLessonsByModule = Array.isArray(reply.newLessonsByModule)
      ? reply.newLessonsByModule
      : []

    // validate module ids referenced by newLessonsByModule against the DB
    const existingModules = await db.module.findMany({
      where: { courseId },
      select: { id: true, order: true },
    })
    const moduleIds = new Set(existingModules.map((m) => m.id))
    const validModuleIds = existingModules.map((m) => m.id)

    const plansNewModules = newModules
      .filter(
        (m) => m && typeof m === 'object' && typeof (m as { title?: unknown }).title === 'string'
      )
      .slice(0, MAX_NEW_MODULES)
      .map((m) => {
        const o = m as { title?: unknown; summary?: unknown; lessons?: unknown }
        return {
          title: cleanText(o.title, 200),
          summary: cleanText(o.summary, 500),
          lessons: cleanLessons(o.lessons, MAX_NEW_LESSONS_PER_MODULE),
        }
      })
      .filter((m) => m.lessons.length > 0)

    const plansExistingLessons = newLessonsByModule
      .filter((e) => e && typeof e === 'object' && moduleIds.has((e as { moduleId?: unknown }).moduleId as string))
      .slice(0, validModuleIds.length)
      .map((e) => {
        const o = e as { moduleId?: unknown; lessons?: unknown }
        return {
          moduleId: String(o.moduleId),
          lessons: cleanLessons(o.lessons, MAX_NEW_LESSONS_PER_MODULE),
        }
      })
      .filter((e) => e.lessons.length > 0)

    if (plansNewModules.length === 0 && plansExistingLessons.length === 0) {
      throw new LlmError(
        'The model did not return anything to add. Try a more specific request or a stronger model.'
      )
    }

    // monotonically increasing global lesson order, independent of module slots
    const maxLessonOrder = await db.lesson.aggregate({
      where: { courseId },
      _max: { order: true },
    })
    let lessonOrder = (maxLessonOrder._max.order ?? 0) + 1
    const maxModuleOrder = await db.module.aggregate({
      where: { courseId },
      _max: { order: true },
    })
    let moduleOrder = (maxModuleOrder._max.order ?? -1) + 1

    await db.$transaction(async (tx) => {
      for (const m of plansNewModules) {
        const created = await tx.module.create({
          data: { courseId, order: moduleOrder++, title: m.title, summary: m.summary },
        })
        for (const l of m.lessons) {
          await tx.lesson.create({
            data: {
              courseId,
              moduleId: created.id,
              order: lessonOrder++,
              title: l.title,
              summary: l.summary,
            },
          })
        }
      }
      for (const e of plansExistingLessons) {
        for (const l of e.lessons) {
          await tx.lesson.create({
            data: {
              courseId,
              moduleId: e.moduleId,
              order: lessonOrder++,
              title: l.title,
              summary: l.summary,
            },
          })
        }
      }
    })
    return { addedModules: plansNewModules.length, addedLessons: plansExistingLessons.reduce((n, e) => n + e.lessons.length, 0) + plansNewModules.reduce((n, m) => n + m.lessons.length, 0), deletedLessons: 0 }
  }

  // ---- edit mode: full structure replace with id-preserving diff
  const reply = extractJson<EditReply>(raw)
  const returnedModules = Array.isArray(reply.modules) ? reply.modules : []
  const plans = returnedModules
    .filter((m) => m && typeof m === 'object' && typeof (m as { title?: unknown }).title === 'string')
    .slice(0, existingModuleCount + MAX_NEW_MODULES)
    .map((m) => {
      const o = m as { id?: unknown; title?: unknown; summary?: unknown; lessons?: unknown }
      return {
        id: typeof o.id === 'string' && o.id ? o.id : null,
        title: cleanText(o.title, 200),
        summary: cleanText(o.summary, 500),
        lessons: cleanLessons(o.lessons, MAX_NEW_LESSONS_PER_MODULE),
      }
    })
    .filter((m) => m.lessons.length > 0)

  if (plans.length === 0) {
    throw new LlmError('The model returned an empty structure. Nothing was changed.')
  }

  const result = await db.$transaction(async (tx) => {
    const existingModules = await tx.module.findMany({
      where: { courseId },
      select: { id: true },
    })
    const moduleIds = new Set(existingModules.map((m) => m.id))
    const existingLessons = await tx.lesson.findMany({
      where: { courseId },
      select: { id: true },
    })
    const lessonIds = new Set(existingLessons.map((l) => l.id))

    let moduleOrder = 0
    let lessonOrder = 0
    const keptModules = new Set<string>()
    const keptLessons = new Set<string>()

    for (const m of plans) {
      let moduleId: string
      if (m.id && moduleIds.has(m.id)) {
        moduleId = m.id
        await tx.module.update({
          where: { id: moduleId },
          data: { order: moduleOrder, title: m.title, summary: m.summary },
        })
        keptModules.add(moduleId)
      } else {
        const created = await tx.module.create({
          data: { courseId, order: moduleOrder, title: m.title, summary: m.summary },
        })
        moduleId = created.id
      }
      moduleOrder++

      for (const l of m.lessons) {
        if (l.id && lessonIds.has(l.id)) {
          // keep generated content + progress; update placement and metadata
          await tx.lesson.update({
            where: { id: l.id },
            data: { moduleId, order: lessonOrder, title: l.title, summary: l.summary },
          })
          keptLessons.add(l.id)
        } else {
          await tx.lesson.create({
            data: {
              courseId,
              moduleId,
              order: lessonOrder,
              title: l.title,
              summary: l.summary,
            },
          })
        }
        lessonOrder++
      }
    }

    // everything the model left out is removed (cascades to quiz/progress/chats)
    const removedLessons = existingLessons.filter((l) => !keptLessons.has(l.id)).map((l) => l.id)
    const removedModules = existingModules.filter((m) => !keptModules.has(m.id)).map((m) => m.id)
    if (removedLessons.length > 0) {
      await tx.lesson.deleteMany({ where: { id: { in: removedLessons } } })
    }
    if (removedModules.length > 0) {
      await tx.module.deleteMany({ where: { id: { in: removedModules } } })
    }

    // optional course metadata updates
    const newTitle = cleanText(reply.title, 200)
    const newDescription = cleanText(reply.description, 2000)
    if (newTitle || newDescription) {
      await tx.course.update({
        where: { id: courseId },
        data: {
          ...(newTitle ? { title: newTitle } : {}),
          ...(newDescription ? { description: newDescription } : {}),
        },
      })
    }

    return {
      keptLessons: keptLessons.size,
      newLessons: lessonOrder - keptLessons.size,
      removedLessons: removedLessons.length,
      removedModules: removedModules.length,
    }
  })
  return result
}
