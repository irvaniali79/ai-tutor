'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, PlugZap, CheckCircle2, CircleAlert } from 'lucide-react'
import type { Settings } from '@/lib/types'

const LANGUAGES = ['English', 'Chinese', 'Spanish', 'French', 'German', 'Portuguese', 'Arabic', 'Japanese']

export function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  settings: Settings | null
  onSaved: (s: Settings) => void
}) {
  const [form, setForm] = useState<Settings>({
    apiBaseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.7,
    language: 'English',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    if (open && settings) {
      setForm(settings)
      setTestResult(null)
      setSaveError(null)
    }
  }, [open, settings])

  const save = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        onSaved(await res.json())
        onOpenChange(false)
        return
      }
      const body = await res.json().catch(() => null)
      setSaveError(
        (body && body.error) ||
          `Saving failed (HTTP ${res.status}). Is the server running with a valid database?`
      )
    } catch (err) {
      setSaveError((err as Error).message || 'Could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  const test = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiBaseUrl: form.apiBaseUrl, apiKey: form.apiKey, model: form.model }),
      })
      const body = await res.json()
      setTestResult(
        body.ok
          ? { ok: true, message: `Connected! Model replied: "${body.reply}"` }
          : { ok: false, message: body.error || 'Connection failed.' }
      )
    } catch {
      setTestResult({ ok: false, message: 'Could not reach the test endpoint.' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>LLM API Settings</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Connect any OpenAI-compatible endpoint — OmniRoute, OpenRouter, Ollama, LM Studio, vLLM,
            Groq and more.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="baseUrl">API base URL</Label>
            <Input
              id="baseUrl"
              placeholder="https://openrouter.ai/api/v1"
              value={form.apiBaseUrl}
              onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })}
              className="bg-zinc-950 border-zinc-700 font-mono text-sm"
            />
            <p className="text-xs text-zinc-500">
              /v1/chat/completions is appended automatically if missing.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="apiKey">API key</Label>
            <Input
              id="apiKey"
              type="password"
              placeholder="sk-… (leave empty for local servers)"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              className="bg-zinc-950 border-zinc-700 font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model">Model</Label>
            <Input
              id="model"
              placeholder="e.g. openai/gpt-4o-mini, llama3.1:8b, claude-3.5-sonnet"
              value={form.model}
              onChange={(e) => setForm({ ...form, model: e.target.value })}
              className="bg-zinc-950 border-zinc-700 font-mono text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="temp">Temperature: {form.temperature.toFixed(1)}</Label>
              <input
                id="temp"
                type="range"
                min={0}
                max={1.5}
                step={0.1}
                value={form.temperature}
                onChange={(e) => setForm({ ...form, temperature: Number(e.target.value) })}
                className="w-full accent-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Course language</Label>
              <Select
                value={form.language}
                onValueChange={(v) => setForm({ ...form, language: v })}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">
              <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
              <span className="leading-6 break-words">{saveError}</span>
            </div>
          )}

          {testResult && (
            <div
              className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
                testResult.ok
                  ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                  : 'border-red-900 bg-red-950/40 text-red-300'
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              ) : (
                <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              <span className="leading-6 break-words">{testResult.message}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={test}
            disabled={testing || !form.apiBaseUrl || !form.model}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {testing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlugZap className="h-4 w-4 mr-1.5" />}
            Test connection
          </Button>
          <Button
            onClick={save}
            disabled={saving || !form.apiBaseUrl || !form.model}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
