'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownView } from '@/components/markdown-view'
import { QuizPanel } from '@/components/quiz-panel'
import { EditEntityDialog } from '@/components/edit-dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Square,
  MessageCircleQuestion,
  Pencil,
} from 'lucide-react'
import type { LessonFull } from '@/lib/types'
import { cn } from '@/lib/utils'

export function LessonReader({
  lessonId,
  onLessonGenerated,
  onGenerationFinished,
  onStartSignal,
  onAskSuggestion,
}: {
  lessonId: string
  onLessonGenerated: () => void
  onGenerationFinished?: () => void
  onStartSignal?: { lessonId: string; ts: number } | null
  onAskSuggestion?: (question: string) => void
}) {
  const [lesson, setLesson] = useState<LessonFull | null>(null)
  const [loading, setLoading] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')
  const [marking, setMarking] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [suggestBusy, setSuggestBusy] = useState(false)
  const suggestionsTriedRef = useRef<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)

  const loadLesson = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/lessons/${lessonId}`)
      if (res.ok) setLesson(await res.json())
    } finally {
      setLoading(false)
    }
  }, [lessonId])

  useEffect(() => {
    setLesson(null)
    setStreamText('')
    setGenError('')
    setGenerating(false)
    loadLesson()
  }, [loadLesson])

  useEffect(() => {
    if (onStartSignal && onStartSignal.lessonId === lessonId) {
      startGeneration()
    }
     
  }, [onStartSignal?.ts])

  const parsedSuggestions: string[] = (() => {
    try {
      const arr = lesson?.suggestions ? JSON.parse(lesson.suggestions) : []
      return Array.isArray(arr) ? arr.filter((q) => typeof q === 'string') : []
    } catch {
      return []
    }
  })()

  const ensureSuggestions = useCallback(
    async (force = false) => {
      if (!force) {
        // only auto-generate once per lesson load, and only when missing
        if (suggestionsTriedRef.current === lessonId) return
        suggestionsTriedRef.current = lessonId
        if (lesson?.suggestions) return
      }
      if (lesson?.status !== 'ready' || !lesson?.content) return
      setSuggestBusy(true)
      try {
        if (force) {
          await fetch(`/api/lessons/${lessonId}/suggestions`, { method: 'DELETE' })
        }
        await fetch(`/api/lessons/${lessonId}/suggestions`, { method: 'POST' })
        await loadLesson()
      } finally {
        setSuggestBusy(false)
      }
    },
    [lesson?.status, lesson?.content, lesson?.suggestions, lessonId, loadLesson]
  )

  // auto-generate suggested questions shortly after a lesson becomes readable
  useEffect(() => {
    if (lesson?.status === 'ready' && lesson?.content && !lesson?.suggestions) {
      const t = setTimeout(() => ensureSuggestions(), 600)
      return () => clearTimeout(t)
    }
  }, [lesson?.status, lesson?.content, lesson?.suggestions, ensureSuggestions])

  const saveLessonEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/lessons/${lessonId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: values.title, summary: values.summary }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Save failed.')
    }
    await loadLesson()
  }

  const startGeneration = useCallback(async () => {
    if (generating) return
    setGenerating(true)
    setStreamText('')
    setGenError('')
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const res = await fetch(`/api/lessons/${lessonId}/generate`, {
        method: 'POST',
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.error || `Request failed (${res.status})`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let done = false
      while (!done) {
        const { done: rd, value } = await reader.read()
        if (rd) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data:')) continue
          const evt = JSON.parse(line.slice(5).trim())
          if (evt.type === 'delta') {
            setStreamText((prev) => prev + evt.text)
          } else if (evt.type === 'done') {
            done = true
          } else if (evt.type === 'error') {
            setGenError(evt.message)
            done = true
          }
        }
      }
      await loadLesson()
      onLessonGenerated()
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setGenError((err as Error).message || 'Generation failed.')
        await loadLesson().catch(() => null)
      }
    } finally {
      onGenerationFinished?.()
      abortRef.current = null
      setGenerating(false)
    }
     
  }, [lessonId, generating, loadLesson, onLessonGenerated])

  const cancelGeneration = () => {
    abortRef.current?.abort()
    abortRef.current = null
    setGenerating(false)
  }

  const markComplete = async (completed: boolean) => {
    setMarking(true)
    try {
      await fetch(`/api/lessons/${lessonId}/progress`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed }),
      })
      await loadLesson()
      onLessonGenerated()
    } finally {
      setMarking(false)
    }
  }

  const submitQuiz = async (score: number, total: number) => {
    await fetch(`/api/lessons/${lessonId}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: true, quizScore: score, quizTotal: total }),
    })
    await loadLesson()
    onLessonGenerated()
  }

  if (loading && !lesson) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading lesson…</p>
      </div>
    )
  }
  if (!lesson) {
    return <div className="py-24 text-center text-zinc-500">Lesson not found.</div>
  }

  const isReady = lesson.status === 'ready' && lesson.content
  const isPending = lesson.status === 'pending'
  const isError = lesson.status === 'error'
  const displayContent = generating ? streamText : lesson.content

  return (
    <article className="max-w-3xl">
      <header className="mb-6">
        <p className="text-sm text-zinc-500 mb-1">{lesson.module.title}</p>
        <div className="flex items-start gap-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-50 flex-1">{lesson.title}</h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditOpen(true)}
            aria-label={`Edit lesson ${lesson.title}`}
            title="Edit lesson title & summary"
            className="h-8 w-8 shrink-0 mt-1 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
        {lesson.summary && <p className="mt-2 text-zinc-400 leading-6">{lesson.summary}</p>}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          {lesson.progress?.completed && (
            <Badge className="bg-emerald-600/15 text-emerald-400 border border-emerald-700/50 hover:bg-emerald-600/15">
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Completed
            </Badge>
          )}
          {lesson.status === 'generating' && (
            <Badge className="bg-amber-500/10 text-amber-400 border border-amber-700/50 hover:bg-amber-500/10">
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating…
            </Badge>
          )}
          {lesson.quiz.length > 0 && (
            <Badge variant="outline" className="border-zinc-700 text-zinc-400">
              {lesson.quiz.length} quiz questions
            </Badge>
          )}
        </div>
      </header>

      {isPending && !generating && (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/40 p-8 sm:p-10 text-center">
          <Sparkles className="h-8 w-8 mx-auto mb-4 text-emerald-400" />
          <h2 className="text-lg font-semibold text-zinc-100 mb-2">Lesson not generated yet</h2>
          <p className="text-sm text-zinc-400 mb-6 max-w-md mx-auto leading-6">
            The AI will write this lesson (~1000 words with examples) plus a 4-question quiz, streamed
            live into this view.
          </p>
          <Button
            onClick={startGeneration}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
            size="lg"
          >
            <Sparkles className="h-4 w-4 mr-2" /> Generate this lesson
          </Button>
        </div>
      )}

      {(generating || displayContent) && (
        <div className={cn(generating && '[&_.prose-course]:opacity-95')}>
          <MarkdownView content={displayContent || ''} />
          {generating && (
            <div className="flex items-center gap-2 text-sm text-emerald-400 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Writing lesson…</span>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelGeneration}
                className="ml-auto border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              >
                <Square className="h-3.5 w-3.5 mr-1.5" /> Stop
              </Button>
            </div>
          )}
        </div>
      )}

      {(genError || isError) && !generating && (
        <div className="mt-6 rounded-lg border border-red-900/60 bg-red-950/40 p-4 flex items-start gap-3">
          <CircleAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-300">Generation failed</p>
            <p className="text-sm text-red-400/80 mt-1 leading-6 break-words">
              {genError || lesson.error || 'An unknown error occurred.'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={startGeneration}
            className="border-red-800 text-red-300 hover:bg-red-950"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      )}

      {isReady && !generating && (
        <>
          {/* suggested questions — click one to ask the AI tutor in a new chat */}
          <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageCircleQuestion className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-zinc-200">Questions you might ask</h2>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Regenerate suggested questions"
                title="Regenerate suggestions"
                disabled={suggestBusy}
                onClick={() => ensureSuggestions(true)}
                className="ml-auto h-7 w-7 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800"
              >
                {suggestBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {suggestBusy && parsedSuggestions.length === 0 ? (
              <p className="text-sm text-zinc-500 flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking of good questions…
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {parsedSuggestions.map((q) => (
                  <button
                    key={q}
                    onClick={() => onAskSuggestion?.(q)}
                    className="text-left text-sm rounded-full border border-zinc-700 bg-zinc-900 px-3.5 py-1.5 text-zinc-300 hover:border-emerald-600/70 hover:text-emerald-300 hover:bg-emerald-950/30 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </section>

          <QuizPanel
            quiz={lesson.quiz}
            savedScore={lesson.progress?.quizScore ?? null}
            savedTotal={lesson.progress?.quizTotal ?? null}
            completed={Boolean(lesson.progress?.completed)}
            onSubmit={submitQuiz}
            submitting={marking}
          />

          <div className="mt-8 flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-sm text-zinc-400">
              {lesson.progress?.completed
                ? 'This lesson is marked as completed.'
                : 'Finished reading? Mark it as completed to track your progress.'}
            </p>
            {lesson.progress?.completed ? (
              <Button
                variant="outline"
                size="sm"
                disabled={marking}
                onClick={() => markComplete(false)}
                className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
              >
                Undo
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={marking}
                onClick={() => markComplete(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                <CheckCircle2 className="h-4 w-4 mr-1.5" /> Mark complete
              </Button>
            )}
          </div>

          <div className="mt-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setLesson({ ...lesson, content: '', status: 'pending' })
              }}
              className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate lesson
            </Button>
          </div>
        </>
      )}

      <div ref={bottomRef} />

      <EditEntityDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Edit lesson"
        description="Rename this lesson or rewrite its summary. The lesson content is not changed."
        fields={[
          { key: 'title', label: 'Lesson title', required: true },
          { key: 'summary', label: 'Summary', multiline: true },
        ]}
        initial={{ title: lesson.title, summary: lesson.summary }}
        onSave={saveLessonEdit}
      />
    </article>
  )
}
