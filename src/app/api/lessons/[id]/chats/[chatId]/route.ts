import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

type Params = { params: Promise<{ id: string; chatId: string }> }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { chatId } = await params
  await db.lessonChat.delete({ where: { id: chatId } }).catch(() => null)
  return NextResponse.json({ ok: true })
}
