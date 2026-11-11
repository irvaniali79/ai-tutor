import { NextRequest, NextResponse } from 'next/server'
import { testConnection, LlmError } from '@/lib/llm'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  // allow testing either the saved settings or values currently typed in the dialog
  let cfg
  if (body?.apiBaseUrl && body?.model) {
    cfg = {
      apiBaseUrl: String(body.apiBaseUrl),
      apiKey: String(body.apiKey ?? ''),
      model: String(body.model),
      temperature: 0,
    }
  } else {
    const setting = await db.setting.findUnique({ where: { id: 'singleton' } })
    if (!setting?.apiBaseUrl || !setting?.model) {
      return NextResponse.json({ ok: false, error: 'No endpoint configured.' }, { status: 400 })
    }
    cfg = {
      apiBaseUrl: setting.apiBaseUrl,
      apiKey: setting.apiKey,
      model: setting.model,
      temperature: 0,
    }
  }
  try {
    const result = await testConnection(cfg)
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof LlmError ? err.message : 'Connection failed.' },
      { status: 502 }
    )
  }
}
