import { db } from '@/lib/db'

export interface LlmConfig {
  apiBaseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export async function getLlmConfig(): Promise<LlmConfig & { language: string }> {
  const setting = await db.setting.findUnique({ where: { id: 'singleton' } })
  if (!setting || !setting.apiBaseUrl || !setting.model) {
    throw new LlmError(
      'No LLM endpoint configured. Open Settings and set your API base URL, API key and model.'
    )
  }
  return {
    apiBaseUrl: setting.apiBaseUrl,
    apiKey: setting.apiKey,
    model: setting.model,
    temperature: setting.temperature,
    language: setting.language || 'English',
  }
}

export class LlmError extends Error {}

/**
 * Normalizes a user-supplied base URL into an absolute chat-completions endpoint.
 * Accepts:
 *   https://openrouter.ai/api/v1
 *   https://openrouter.ai/api
 *   http://localhost:11434            (Ollama)
 *   https://host/v1/chat/completions  (full endpoint)
 */
export function resolveEndpoint(apiBaseUrl: string): string {
  let base = apiBaseUrl.trim().replace(/\/+$/, '')
  if (base.endsWith('/chat/completions')) return base
  // strip a trailing /chat/completions fragment variants are unlikely; add /v1 when missing
  if (!/\/v\d+(beta)?$/.test(base)) {
    base = `${base}/v1`
  }
  return `${base}/chat/completions`
}

export function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
  return headers
}

/**
 * Streams a chat completion, yielding text deltas.
 * Compatible with any OpenAI-style /chat/completions SSE endpoint.
 */
export async function* streamChat(
  cfg: LlmConfig,
  messages: ChatMessage[],
  overrides?: { temperature?: number }
): AsyncGenerator<string> {
  const endpoint = resolveEndpoint(cfg.apiBaseUrl)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(cfg.apiKey),
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: overrides?.temperature ?? cfg.temperature,
        stream: true,
      }),
    })
  } catch (err) {
    throw new LlmError(
      `Could not reach the LLM endpoint (${endpoint}). Check your base URL and network.`
    )
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new LlmError(`LLM API error ${res.status}: ${text.slice(0, 500)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trim()
      if (!line.startsWith('data:')) continue
      const payload = line.slice(5).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta: string | undefined = json.choices?.[0]?.delta?.content
        if (delta) yield delta
      } catch {
        // ignore malformed keep-alive lines
      }
    }
  }
}

/** Non-streaming chat completion returning the full text. */
export async function chatComplete(
  cfg: LlmConfig,
  messages: ChatMessage[],
  overrides?: { temperature?: number }
): Promise<string> {
  const endpoint = resolveEndpoint(cfg.apiBaseUrl)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: buildHeaders(cfg.apiKey),
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: overrides?.temperature ?? cfg.temperature,
      }),
    })
  } catch {
    throw new LlmError(
      `Could not reach the LLM endpoint (${endpoint}). Check your base URL and network.`
    )
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new LlmError(`LLM API error ${res.status}: ${text.slice(0, 500)}`)
  }
  const json = await res.json()
  const content = json.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new LlmError('LLM returned an unexpected response shape.')
  }
  return content
}

/** Extracts the first JSON object/array from an LLM reply, tolerating markdown fences. */
export function extractJson<T>(text: string): T {
  let cleaned = text.trim()
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) cleaned = fence[1].trim()
  const start = cleaned.search(/[[{]/)
  if (start === -1) throw new LlmError('Model reply did not contain JSON.')
  // find matching closing bracket
  const openChar = cleaned[start]
  const closeChar = openChar === '[' ? ']' : '}'
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, i + 1)) as T
      }
    }
  }
  throw new LlmError('Model reply contained truncated JSON.')
}

/** Quick connectivity test against the configured endpoint. */
export async function testConnection(cfg: LlmConfig): Promise<{ ok: boolean; reply: string }> {
  const reply = await chatComplete(
    { ...cfg, temperature: 0 },
    [
      { role: 'system', content: 'Reply with exactly: OK' },
      { role: 'user', content: 'ping' },
    ],
    { temperature: 0 }
  )
  return { ok: true, reply: reply.trim().slice(0, 100) }
}
