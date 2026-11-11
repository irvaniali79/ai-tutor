import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

/** Lists every chat thread of a lesson, oldest first, with all messages. */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const chats = await db.lessonChat.findMany({
    where: { lessonId: id },
    orderBy: { createdAt: 'asc' },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  })
  return NextResponse.json({ chats })
}

/** Creates a new empty chat thread for this lesson. */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 120) : 'New chat'
  const lesson = await db.lesson.findUnique({ where: { id }, select: { id: true } })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  const chat = await db.lessonChat.create({
    data: { lessonId: id, title },
    include: { messages: true },
  })
  return NextResponse.json({ chat })
}
