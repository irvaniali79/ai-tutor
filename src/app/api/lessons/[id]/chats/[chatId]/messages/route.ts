import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { getLlmConfig, streamChat, LlmError } from '@/lib/llm'
import { chatMessages } from '@/lib/prompts'

type Params = { params: Promise<{ id: string; chatId: string }> }

/**
 * Posts a user message to a lesson chat and streams the tutor's reply.
 * SSE events: {type:'delta',text} ... {type:'done'} | {type:'error',message}
 * Both the user message and the full assistant reply are persisted, so the
 * conversation survives reloads.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id, chatId } = await params
  const body = await req.json().catch(() => ({}))
  const question = typeof body.content === 'string' ? body.content.trim() : ''
  if (!question) {
    return new Response(JSON.stringify({ error: 'Message is empty' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const chat = await db.lessonChat.findUnique({
    where: { id: chatId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!chat || chat.lessonId !== id) {
    return new Response(JSON.stringify({ error: 'Chat not found' }), {
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

  const lesson = await db.lesson.findUnique({
    where: { id },
    include: { module: { select: { title: true } }, course: { select: { title: true } } },
  })
  if (!lesson) {
    return new Response(JSON.stringify({ error: 'Lesson not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // persist the user message first so it is never lost
  const userMessage = await db.lessonChatMessage.create({
    data: { chatId, role: 'user', content: question.slice(0, 4000) },
  })
  // a chat's title follows its first question
  if (chat.messages.length === 0 && (chat.title === 'New chat' || !chat.title)) {
    await db.lessonChat.update({
      where: { id: chatId },
      data: { title: question.slice(0, 80) },
    })
  }

  const history = chat.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const messages = chatMessages({
    courseTitle: lesson.course.title,
    moduleTitle: lesson.module.title,
    lessonTitle: lesson.title,
    lessonContent:
      lesson.content || '(This lesson has not been generated yet — answer from general knowledge.)',
    language: cfg.language,
    history,
    question: question.slice(0, 4000),
  })

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        } catch {
          // client disconnected — keep going so the reply still gets saved
        }
      }
      send({ type: 'start', userMessageId: userMessage.id })
      let full = ''
      try {
        for await (const delta of streamChat(cfg, messages)) {
          full += delta
          send({ type: 'delta', text: delta })
        }
        const content = full.trim()
        if (!content) throw new LlmError('The model returned an empty answer.')
        const saved = await db.lessonChatMessage.create({
          data: { chatId, role: 'assistant', content },
        })
        send({ type: 'done', messageId: saved.id })
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Chat failed.'
        send({ type: 'error', message })
      } finally {
        try {
          controller.close()
        } catch {
          // already closed
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
