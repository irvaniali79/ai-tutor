import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const lesson = await db.lesson.findUnique({ where: { id } })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })

  const data = {
    completed: Boolean(body?.completed),
    quizScore: Number.isInteger(body?.quizScore) ? Math.max(0, body.quizScore) : undefined,
    quizTotal: Number.isInteger(body?.quizTotal) ? Math.max(0, body.quizTotal) : undefined,
  }

  const progress = await db.lessonProgress.upsert({
    where: { lessonId: id },
    update: {
      completed: data.completed,
      ...(data.quizScore !== undefined ? { quizScore: data.quizScore } : {}),
      ...(data.quizTotal !== undefined ? { quizTotal: data.quizTotal } : {}),
    },
    create: {
      lessonId: id,
      completed: data.completed,
      quizScore: data.quizScore ?? 0,
      quizTotal: data.quizTotal ?? 0,
    },
  })
  return NextResponse.json(progress)
}
