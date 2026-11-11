import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  const setting = await db.setting.findUnique({ where: { id: 'singleton' } })
  if (!setting) {
    const created = await db.setting.create({ data: { id: 'singleton' } })
    return NextResponse.json({ ...created, apiKey: '' })
  }
  return NextResponse.json(setting)
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  const data = {
    apiBaseUrl: typeof body.apiBaseUrl === 'string' ? body.apiBaseUrl.trim() : '',
    apiKey: typeof body.apiKey === 'string' ? body.apiKey : '',
    model: typeof body.model === 'string' ? body.model.trim() : '',
    temperature:
      typeof body.temperature === 'number' && body.temperature >= 0 && body.temperature <= 2
        ? body.temperature
        : 0.7,
    language: typeof body.language === 'string' && body.language.trim() ? body.language.trim() : 'English',
  }
  const saved = await db.setting.upsert({
    where: { id: 'singleton' },
    update: data,
    create: { id: 'singleton', ...data },
  })
  return NextResponse.json(saved)
}
