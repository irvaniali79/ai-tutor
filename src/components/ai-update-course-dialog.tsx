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
import { Textarea } from '@/components/ui/textarea'
import { FileText, Loader2, Paperclip, Wand2, X } from 'lucide-react'
import type { CourseDetail } from '@/lib/types'
import { cn } from '@/lib/utils'

// mirrors the supported types in src/lib/file-text.ts
const FILE_INPUT_ACCEPT =
  '.pdf,.docx,.txt,.md,.markdown,.csv,.json,.rst,.log,.js,.jsx,.ts,.tsx,.py,.rb,.go,.rs,.java,.kt,.swift,.c,.h,.cpp,.hpp,.cs,.php,.sh,.sql,.yaml,.yml,.toml,.html,.css'

const MODES = [
  {
    value: 'expand' as const,
    label: 'Expand',
    hint: 'Only adds new modules/lessons — nothing existing is changed or removed',
    placeholder:
      'e.g. "Add a module about monitoring and alerting" — or attach a file to base the new material on',
  },
  {
    value: 'edit' as const,
    label: 'Edit structure',
    hint: 'Can rename, reorder, add or REMOVE modules/lessons. Kept lessons lose nothing; removed lessons lose their generated content.',
    placeholder:
      'e.g. "Split module 1 into two modules and move the quiz-heavy lessons later" — or attach a corrected outline file',
  },
]

export function AiUpdateCourseDialog({
  open,
  onOpenChange,
  course,
  onUpdated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  course: CourseDetail
  onUpdated: (course: CourseDetail) => void
}) {
  const [mode, setMode] = useState<'expand' | 'edit'>('expand')
  const [instruction, setInstruction] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeMode = MODES.find((m) => m.value === mode)!

  const apply = async () => {
    setApplying(true)
    setError('')
    try {
      let res: Response
      if (file) {
        const form = new FormData()
        form.set('mode', mode)
        form.set('instruction', instruction)
        form.set('file', file)
        res = await fetch(`/api/courses/${course.id}/ai-update`, { method: 'POST', body: form })
      } else {
        res = await fetch(`/api/courses/${course.id}/ai-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode, instruction }),
        })
      }
      const body = await res.json()
      if (!res.ok) {
        setError(body.error || 'The update failed.')
        return
      }
      onUpdated(body.course)
      onOpenChange(false)
      setInstruction('')
      setFile(null)
    } catch {
      setError('Request failed. Is the app still running?')
    } finally {
      setApplying(false)
    }
  }

  const canApply = !applying && (Boolean(instruction.trim()) || Boolean(file))

  return (
    <Dialog open={open} onOpenChange={(v) => !applying && onOpenChange(v)}>
      <DialogContent className="bg-zinc-900 border-zinc-800 text-zinc-100 max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-emerald-400" /> Update course with AI
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            Extend or restructure “{course.title}” with a prompt, a reference file, or both.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">What should the AI do?</label>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMode(m.value)}
                  title={m.hint}
                  className={cn(
                    'rounded-lg border px-2 py-2.5 text-sm transition-colors',
                    mode === m.value
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                      : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-zinc-500 leading-5">{activeMode.hint}</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Instruction</label>
            <Textarea
              placeholder={activeMode.placeholder}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              className="bg-zinc-950 border-zinc-700 min-h-[80px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-300">Reference file (optional)</label>
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
                Attach a PDF, Word, text or code file to build on
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
            <p className="text-xs text-zinc-500 leading-5">
              File content is also stored with the course, so future generated lessons stay grounded
              in it.
            </p>
          </div>

          {mode === 'edit' && (
            <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-xs leading-5 text-amber-200/90">
              Edit mode lets the model restructure the course. Lessons it keeps keep their generated
              content, quiz results and progress; lessons it removes are deleted. Nothing is removed
              in Expand mode.
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
            onClick={apply}
            disabled={!canApply}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {applying ? (
              <>
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Updating curriculum…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4 mr-1.5" /> Apply update
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
