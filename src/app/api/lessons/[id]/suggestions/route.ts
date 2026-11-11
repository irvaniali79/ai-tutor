import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getLlmConfig, chatComplete, extractJson, LlmError } from '@/lib/llm'
import { suggestionsMessages } from '@/lib/prompts'

type Params = { params: Promise<{ id: string }> }

const FALLBACK_QUESTIONS = [
  'Can you explain the main idea more simply?',
  'How do I apply this in a real project?',
  'What are common mistakes with this?',
  'Can you show a concrete example?',
  'What should I learn next after this?',
]

/** Generates (and caches) 5 suggested questions for this lesson. */
export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const lesson = await db.lesson.findUnique({
    where: { id },
    include: { course: { select: { title: true } } },
  })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  if (lesson.status !== 'ready' || !lesson.content) {
    return NextResponse.json({ error: 'Generate the lesson first' }, { status: 400 })
  }

  // return the cached suggestions if we already have them
  if (lesson.suggestions) {
    try {
      const cached = JSON.parse(lesson.suggestions)
      if (Array.isArray(cached) && cached.length > 0) {
        return NextResponse.json({ suggestions: cached })
      }
    } catch {
      // fall through and regenerate
    }
  }

  let suggestions: string[] = FALLBACK_QUESTIONS
  try {
    const cfg = await getLlmConfig()
    const raw = await chatComplete(
      { ...cfg, temperature: 0.8 },
      suggestionsMessages({
        courseTitle: lesson.course.title,
        lessonTitle: lesson.title,
        lessonSummary: lesson.summary,
        lessonContent: lesson.content,
        language: cfg.language,
      }),
      { temperature: 0.8 }
    )
    const parsed = extractJson<string[]>(raw)
    const cleaned = (Array.isArray(parsed) ? parsed : [])
      .filter((q) => typeof q === 'string' && q.trim().length > 3)
      .map((q) => q.trim().slice(0, 160))
      .slice(0, 5)
    if (cleaned.length >= 3) suggestions = cleaned
  } catch {
    // keep fallback questions — the feature must work even when the API is flaky
  }

  await db.lesson
    .update({ where: { id }, data: { suggestions: JSON.stringify(suggestions) } })
    .catch(() => null)
  return NextResponse.json({ suggestions })
}

/** Clears cached suggestions so they get regenerated next time. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  await db.lesson.update({ where: { id }, data: { suggestions: '' } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
