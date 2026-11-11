import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params
  const course = await db.course.findUnique({
    where: { id },
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
  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  return NextResponse.json(course)
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: { title?: string; description?: string; topic?: string } = {}
  if (typeof body.title === 'string' && body.title.trim()) data.title = body.title.trim()
  if (typeof body.description === 'string') data.description = body.description
  if (typeof body.topic === 'string' && body.topic.trim()) data.topic = body.topic.trim()
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }
  try {
    const course = await db.course.update({ where: { id }, data })
    return NextResponse.json({ ok: true, course })
  } catch {
    return NextResponse.json({ error: 'Course not found' }, { status: 404 })
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params
  try {
    await db.course.delete({ where: { id } })
  } catch {
    // do not swallow failures: the client must be able to tell the user the
    // course could not be removed instead of assuming it worked
    return NextResponse.json(
      { error: 'Course not found or could not be deleted.' },
      { status: 404 }
    )
  }
  return NextResponse.json({ ok: true })
}
