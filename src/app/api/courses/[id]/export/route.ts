import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string }> }

// GET /api/courses/:id/export
//
// Streams the full course as a self-contained JSON file: metadata, modules,
// lessons (including generated content and suggestions), quiz questions,
// per-lesson progress and all chat threads. The file can be re-imported on
// any CourseForge instance via POST /api/courses/import.
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
            include: {
              quiz: { orderBy: { order: 'asc' } },
              progress: {
                select: { completed: true, quizScore: true, quizTotal: true },
              },
              chats: {
                orderBy: { createdAt: 'asc' },
                include: { messages: { orderBy: { createdAt: 'asc' } } },
              },
            },
          },
        },
      },
    },
  })

  if (!course) return NextResponse.json({ error: 'Course not found' }, { status: 404 })

  const payload = {
    format: 'courseforge-course',
    version: 1,
    exportedAt: new Date().toISOString(),
    course: {
      title: course.title,
      topic: course.topic,
      audience: course.audience,
      difficulty: course.difficulty,
      language: course.language,
      description: course.description,
      model: course.model,
      sourceContent: course.sourceContent,
      modules: course.modules.map((m) => ({
        order: m.order,
        title: m.title,
        summary: m.summary,
        lessons: m.lessons.map((l) => ({
          order: l.order,
          title: l.title,
          summary: l.summary,
          content: l.content,
          status: l.status,
          error: l.error,
          suggestions: l.suggestions,
          quiz: l.quiz.map((q) => ({
            order: q.order,
            question: q.question,
            optionA: q.optionA,
            optionB: q.optionB,
            optionC: q.optionC,
            optionD: q.optionD,
            correctIndex: q.correctIndex,
            explanation: q.explanation,
          })),
          progress: l.progress
            ? {
                completed: l.progress.completed,
                quizScore: l.progress.quizScore,
                quizTotal: l.progress.quizTotal,
              }
            : null,
          chats: l.chats.map((c) => ({
            title: c.title,
            createdAt: c.createdAt.toISOString(),
            messages: c.messages.map((msg) => ({
              role: msg.role,
              content: msg.content,
              createdAt: msg.createdAt.toISOString(),
            })),
          })),
        })),
      })),
    },
  }

  const filename =
    course.title
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'course'

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}.courseforge.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
