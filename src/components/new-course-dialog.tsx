'use client'

import { useRef, useState } from 'react'
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
import { FileText, Loader2, Paperclip, Sparkles, X } from 'lucide-react'
import type { CourseDetail } from '@/lib/types'
import { cn } from '@/lib/utils'

const DIFFICULTIES = [
  { value: 'beginner', label: 'Beginner', hint: 'No prior knowledge assumed' },
  { value: 'intermediate', label: 'Intermediate', hint: 'Basics are known' },
  { value: 'advanced', label: 'Advanced', hint: 'Deep, practical material' },
]

// mirrors the supported types in src/lib/file-text.ts
const FILE_INPUT_ACCEPT =
  '.pdf,.docx,.txt,.md,.markdown,.csv,.json,.rst,.log,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.hpp,.cs,.php,.sh,.sql,.yaml,.yml,.toml,.html,.css'

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
  // 'auto' = the model decides module/lesson counts; 'custom' = fixed numbers
  const [structure, setStructure] = useState<'auto' | 'custom'>('auto')
  const [moduleCount, setModuleCount] = useState(4)
  const [lessonsPerModule, setLessonsPerModule] = useState(4)
  const [file, setFile] = useState<File | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const canCreate = creating ? false : file ? true : Boolean(topic.trim())

  const create = async () => {
    setCreating(true)
    setError('')
    try {
      let res: Response
      if (file) {
        const form = new FormData()
        form.set('topic', topic)
        form.set('audience', audience)
        form.set('difficulty', difficulty)
        form.set('structure', structure)
        form.set('moduleCount', String(moduleCount))
        form.set('lessonsPerModule', String(lessonsPerModule))
        form.set('file', file)
        res = await fetch('/api/courses', { method: 'POST', body: form })
      } else {
        res = await fetch('/api/courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            audience,
            difficulty,
            structure,
            moduleCount,
            lessonsPerModule,
          }),
        })
      }
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'Failed to create the course.')
        return
      }
      onCreated(body)
      onOpenChange(false)
      setTopic('')
      setAudience('')
      setFile(null)
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
            Describe what you want to learn — or attach a document and the AI builds the course from
            it. Lessons are generated afterwards, one by one or all at once.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="source-file">Source file (optional)</Label>
            {file ? (
              <div className="flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-950/20 px-3 py-2.5">
                <FileText className="h-4 w-4 shrink-0 text-emerald-400" />
                <span className="text-sm text-zinc-200 truncate flex-1" title={file.name}>
                  {file.name}
                </span>
                <span className="text-xs text-zinc-500 shrink-0">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => {
                    setFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="text-zinc-500 hover:text-red-400"
                  aria-label="Remove file"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-lg border border-dashed border-zinc-700 px-3 py-4 text-sm text-zinc-500 hover:border-emerald-600/60 hover:text-zinc-300 transition-colors"
              >
                <Paperclip className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                Attach a PDF, Word, text or code file — the course will be based on it
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_INPUT_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setFile(f)
                if (f) setError('')
              }}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="topic">{file ? 'Topic (optional — derived from the file)' : 'Topic *'}</Label>
            <Textarea
              id="topic"
              placeholder={
                file
                  ? 'e.g. focus only on chapters 2-4, or leave empty to let the AI decide…'
                  : 'e.g. gRPC & Protocol Buffers, Organic chemistry basics, Spanish for travelers…'
              }
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="bg-zinc-950 border-zinc-700 min-h-[70px]"
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

          <div className="space-y-1.5">
            <Label>Course structure</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setStructure('auto')}
                className={cn(
                  'rounded-lg border px-2 py-2.5 text-sm transition-colors',
                  structure === 'auto'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                )}
              >
                <Sparkles className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                AI decides
              </button>
              <button
                onClick={() => setStructure('custom')}
                className={cn(
                  'rounded-lg border px-2 py-2.5 text-sm transition-colors',
                  structure === 'custom'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                )}
              >
                Fixed numbers
              </button>
            </div>
            {structure === 'custom' && (
              <div className="grid grid-cols-2 gap-4 pt-1">
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
            )}
          </div>

          <p className="text-xs text-zinc-500">
            {structure === 'auto'
              ? 'The model sizes the course to the topic: it picks the number of modules and lessons per module.'
              : `Total: ${moduleCount * lessonsPerModule} lessons. `}
            Outline generation is quick; lessons are generated on demand and each takes roughly 1–3
            minutes depending on your model.
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
            disabled={!canCreate}
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
