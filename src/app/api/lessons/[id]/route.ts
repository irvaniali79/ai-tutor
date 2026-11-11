import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const lesson = await db.lesson.findUnique({
    where: { id },
    include: {
      module: { select: { title: true } },
      course: { select: { id: true, title: true } },
      quiz: { orderBy: { order: 'asc' } },
      progress: true,
    },
  })
  if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  return NextResponse.json(lesson)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: { title?: string; summary?: string } = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (typeof body.summary === 'string') data.summary = body.summary
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }
  try {
    const lesson = await db.lesson.update({ where: { id }, data })
    return NextResponse.json({ ok: true, lesson })
  } catch {
    return NextResponse.json({ error: 'Lesson not found' }, { status: 404 })
  }
}
