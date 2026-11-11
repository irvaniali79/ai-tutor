'use client'

import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Sparkles } from 'lucide-react'
import type { CourseDetail } from '@/lib/types'
import { cn } from '@/lib/utils'

const DIFFICULTIES = [
  { value: 'beginner', label: 'Beginner', hint: 'No prior knowledge assumed' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Basics are known' },
  { value: 'advanced', label: 'Advanced', hint: 'Deep, practical material' },
]

export function NewCourseDialog({
  open,
  onOpenChange,
  onCreated,
  demoMode,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: (course: CourseDetail) => void
  demoMode?: boolean
}) {
  const [topic, setTopic] = useState('')
  const [audience, setAudience] = useState('')
  const [difficulty, setDifficulty] = useState('intermediate')
  const [moduleCount, setModuleCount] = useState(4)
  const [lessonsPerModule, setLessonsPerModule] = useState(4)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const create = async () => {
    setCreating(true)
    setError('')
    try {
      const res = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, audience, difficulty, moduleCount, lessonsPerModule }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Failed to create the course.')
        return
      }
      onCreated(body)
      onOpenChange(false)
      setTopic('')
      setAudience('')
    } catch {
      setError('Request failed. Is the app still running?')
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !creating && onOpenChange(v)}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400" /> New course
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Describe what you want to learn. The AI designs the full curriculum — you generate the
            lessons afterwards, one by one or all at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="topic">Topic *</Label>
            <Textarea
              id="topic"
              placeholder="e.g. gRPC & Protocol Buffers, Organic chemistry basics, Spanish for travelers…"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-zinc-950 border-zinc-700 min-h-[70px]"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audience">Target audience (optional)</Label>
            <Input
              id="audience"
              placeholder="e.g. backend engineers moving from REST"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="bg-zinc-950 border-zinc-700"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Difficulty</Label>
            <div className="grid grid-cols-3 gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setDifficulty(d.value)}
                  title={d.hint}
                  className={cn(
                    'rounded-lg border px-2 py-2.5 text-sm transition-colors',
                    difficulty === d.value
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  )}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Modules</Label>
              <Select
                value={String(moduleCount)}
                onValueChange={(v) => setModuleCount(Number(v))}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} modules
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Lessons per module</Label>
              <Select
                value={String(lessonsPerModule)}
                onValueChange={(v) => setLessonsPerModule(Number(v))}
              >
                <SelectTrigger className="bg-zinc-950 border-zinc-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-zinc-900 border-zinc-700">
                  {[2, 3, 4, 5, 6].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} lessons each
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <p className="text-xs text-zinc-500">
            Total: {moduleCount * lessonsPerModule} lessons. Outline generation is quick; lessons are
            generated on demand and each takes roughly 1–3 minutes depending on your model.
          </p>

          {demoMode && (
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs leading-5 text-amber-200/90">
              Demo mode is active — the built-in demo model will generate this course. For best
              quality, connect your own API in API Settings first.
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300 leading-6 break-words">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            onClick={create}
            disabled={creating || !topic.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {creating ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Designing curriculum…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-1.5" /> Generate outline
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
