import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getLlmConfig, streamChat, LlmError } from '@/lib/llm'
import { lessonMessages, splitLessonOutput } from '@/lib/prompts'

type Params = { params: Promise<{ id: string }> }

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const lesson = await db.lesson.findUnique({
    where: { id },
    include: {
      module: true,
      course: { select: { id: true, title: true, description: true, difficulty: true } },
    },
  })
  if (!lesson) {
    return new Response(JSON.stringify({ error: 'Lesson not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let cfg
  try {
    cfg = await getLlmConfig()
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Titles of lessons that come before this one, for continuity
  const previousLessons = await db.lesson.findMany({
    where: { courseId: lesson.courseId, order: { lt: lesson.order } },
    orderBy: { order: 'asc' },
    select: { title: true },
  })

  await db.lesson.update({ where: { id }, data: { status: 'generating', error: '' } })

  const encoder = new TextEncoder()
  const messages = lessonMessages({
    courseTitle: lesson.course.title,
    courseDescription: lesson.course.description,
    moduleTitle: lesson.module.title,
    moduleSummary: lesson.module.summary,
    lessonTitle: lesson.title,
    lessonSummary: lesson.summary,
    previousLessonTitles: previousLessons.map((l) => l.title),
    difficulty: lesson.course.difficulty,
    language: cfg.language,
  })

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        } catch {
          // client disconnected — keep generating so the result still gets saved
        }
      }
      let full = ''
      try {
        for await (const delta of streamChat(cfg, messages)) {
          full += delta
          send({ type: 'delta', text: delta })
        }
        const { content, quiz } = splitLessonOutput(full)
        if (!content || content.length < 200) {
          throw new LlmError(
            'The model returned a suspiciously short lesson. Try a stronger model or regenerate.'
          )
        }
        // replace quiz + save content atomically
        await db.$transaction([
          db.quizQuestion.deleteMany({ where: { lessonId: id } }),
          db.quizQuestion.createMany({
            data: quiz.map((q, i) => ({
              lessonId: id,
              order: i,
              question: q.question.slice(0, 1000),
              optionA: (q.options[0] ?? '').slice(0, 500),
              optionB: (q.options[1] ?? '').slice(0, 500),
              optionC: (q.options[2] ?? '').slice(0, 500),
              optionD: (q.options[3] ?? '').slice(0, 500),
              correctIndex: Math.min(3, Math.max(0, q.correctIndex)),
              explanation: q.explanation.slice(0, 2000),
            })),
          }),
          db.lesson.update({
            where: { id },
            data: { content, status: 'ready', error: '' },
          }),
        ])
        send({ type: 'done', quizCount: quiz.length, contentLength: content.length })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed.'
        await db.lesson
          .update({ where: { id }, data: { status: 'error', error: message } })
          .catch(() => null)
        send({ type: 'error', message })
      } finally {
        try {
          controller.close()
        } catch {
          // already closed by client disconnect
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
