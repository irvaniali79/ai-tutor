'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { LessonReader } from '@/components/lesson-reader'
import { LessonChat } from '@/components/lesson-chat'
import { EditEntityDialog } from '@/components/edit-dialog'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Circle,
  CircleAlert,
  ListPlus,
  Loader2,
  Menu,
  MessageSquare,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react'
import type { CourseDetail, LessonNavItem } from '@/lib/types'
import { cn } from '@/lib/utils'

export function CourseView({ courseId, onBack }: { courseId: string; onBack: () => void }) {
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [queue, setQueue] = useState<string[]>([])
  const [queueRunning, setQueueRunning] = useState(false)
  const [signal, setSignal] = useState<{ lessonId: string; ts: number } | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [chatOpen, setChatOpen] = useState(true)
  const [pendingQuestion, setPendingQuestion] = useState<{ question: string; ts: number } | null>(
    null
  )
  const [courseEditOpen, setCourseEditOpen] = useState(false)
  const [moduleEdit, setModuleEdit] = useState<{ id: string; title: string; summary: string } | null>(
    null
  )
  const [lessonEdit, setLessonEdit] = useState<{ id: string; title: string; summary: string } | null>(
    null
  )
  const queueRef = useRef<string[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/courses/${courseId}`).then(async (res) => {
      if (res.ok && !cancelled) setCourse(await res.json())
    })
    return () => {
      cancelled = true
    }
  }, [courseId, refreshKey])

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  const allLessons = course?.modules.flatMap((m) => m.lessons) ?? []
  const effectiveSelectedId = selectedLessonId ?? allLessons[0]?.id ?? null
  const selectedLesson = allLessons.find((l) => l.id === effectiveSelectedId) ?? null
  const completedCount = allLessons.filter((l) => l.progress?.completed).length
  const readyCount = allLessons.filter((l) => l.status === 'ready').length
  const pendingIds = allLessons
    .filter((l) => l.status === 'pending' || l.status === 'error')
    .map((l) => l.id)

  const handleGenerationFinished = useCallback(() => {
    refresh()
    if (!queueRunning) return
    const rest = queueRef.current.slice(1)
    queueRef.current = rest
    setQueue(rest)
    if (rest.length > 0) {
      const next = rest[0]
      setSelectedLessonId(next)
      setSignal({ lessonId: next, ts: Date.now() })
    } else {
      setQueueRunning(false)
    }
  }, [queueRunning, refresh])

  const startQueue = () => {
    if (pendingIds.length === 0) return
    queueRef.current = pendingIds
    setQueue(pendingIds)
    setQueueRunning(true)
    setSelectedLessonId(pendingIds[0])
    setSignal({ lessonId: pendingIds[0], ts: Date.now() })
  }

  const stopQueue = () => {
    queueRef.current = []
    setQueue([])
    setQueueRunning(false)
  }

  const saveCourseEdit = async (values: Record<string, string>) => {
    const res = await fetch(`/api/courses/${courseId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: values.title, description: values.description }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Save failed.')
    }
    refresh()
  }

  const saveModuleEdit = async (values: Record<string, string>) => {
    if (!moduleEdit) return
    const res = await fetch(`/api/modules/${moduleEdit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: values.title, summary: values.summary }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Save failed.')
    }
    refresh()
  }

  const saveSidebarLessonEdit = async (values: Record<string, string>) => {
    if (!lessonEdit) return
    const res = await fetch(`/api/lessons/${lessonEdit.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: values.title, summary: values.summary }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || 'Save failed.')
    }
    refresh()
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-32 text-zinc-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">Loading course…</p>
      </div>
    )
  }

  const sidebar = (
    <nav className="flex h-full flex-col" aria-label="Course navigation">
      <div className="p-4 border-b border-zinc-800">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-3 -ml-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Library
        </Button>
        <div className="flex items-start gap-1.5">
          <h2 className="font-semibold text-zinc-100 leading-snug flex-1">{course.title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCourseEditOpen(true)}
            aria-label="Edit course title and description"
            title="Edit course"
            className="h-7 w-7 shrink-0 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-zinc-500">
          <span>
            {completedCount}/{allLessons.length} completed
          </span>
          <span>{Math.round((completedCount / Math.max(1, allLessons.length)) * 100)}%</span>
        </div>
        <Progress
          value={(completedCount / Math.max(1, allLessons.length)) * 100}
          className="mt-2 h-1.5 bg-zinc-800"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {readyCount < allLessons.length && !queueRunning && (
            <Button
              size="sm"
              onClick={startQueue}
              disabled={pendingIds.length === 0}
              className="h-8 bg-emerald-600 hover:bg-emerald-500 text-white text-xs"
            >
              <ListPlus className="h-3.5 w-3.5 mr-1" />
              Generate {pendingIds.length} remaining
            </Button>
          )}
          {queueRunning && (
            <Button
              size="sm"
              onClick={stopQueue}
              variant="outline"
              className="h-8 border-amber-700 text-amber-400 hover:bg-amber-950 text-xs"
            >
              <X className="h-3.5 w-3.5 mr-1" /> Stop queue ({queue.length} left)
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-2 course-nav-scroll">
        {course.modules.map((mod, mi) => (
          <div key={mod.id} className="mb-2">
            <div className="px-4 py-2 flex items-baseline gap-2 group/mod">
              <span className="text-xs font-semibold text-emerald-500/90 uppercase tracking-wider">
                Module {mi + 1}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setModuleEdit({ id: mod.id, title: mod.title, summary: mod.summary })}
                aria-label={`Edit module ${mod.title}`}
                title="Edit module"
                className="ml-auto h-6 w-6 opacity-0 group-hover/mod:opacity-100 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            </div>
            <p className="px-4 pb-1 text-sm font-medium text-zinc-200 leading-snug">{mod.title}</p>
            <ul className="mt-1">
              {mod.lessons.map((lesson) => {
                const active = effectiveSelectedId === lesson.id
                return (
                  <li
                    key={lesson.id}
                    className={cn(
                      'group/lesson flex items-stretch border-l-2 transition-colors',
                      active
                        ? 'border-emerald-500 bg-emerald-500/10'
                        : 'border-transparent hover:bg-zinc-800/60'
                    )}
                  >
                    <button
                      onClick={() => {
                        setSelectedLessonId(lesson.id)
                        setSidebarOpen(false)
                      }}
                      className={cn(
                        'flex-1 min-w-0 text-left px-4 py-2.5 flex items-start gap-2.5 text-sm',
                        active
                          ? 'text-emerald-300'
                          : 'text-zinc-400 hover:text-zinc-200'
                      )}
                    >
                      <LessonStatusIcon lesson={lesson} />
                      <span className="flex-1 leading-5">{lesson.title}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setLessonEdit({ id: lesson.id, title: lesson.title, summary: lesson.summary })
                      }
                      aria-label={`Edit lesson ${lesson.title}`}
                      title="Edit lesson"
                      className="h-8 w-8 my-auto mr-1 shrink-0 opacity-0 group-hover/lesson:opacity-100 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )

  return (
    // locked to the viewport: the document itself never scrolls; each column
    // (nav, lesson, chat) owns its own scrollbar instead
    <div className="flex h-dvh overflow-hidden">
      {/* desktop sidebar */}
      <aside className="hidden md:block w-80 shrink-0 border-r border-zinc-800 bg-zinc-950/60 h-full">
        {sidebar}
      </aside>

      {/* mobile sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setSidebarOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85%] bg-zinc-950 border-r border-zinc-800">
            {sidebar}
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 flex h-full min-h-0 overflow-hidden">
        {/* lesson column — scrolls independently of the chat panel */}
        <div className="flex-1 min-w-0 h-full overflow-y-auto">
          <div className="md:hidden sticky top-0 z-40 flex items-center gap-2 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur px-3 py-2.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="text-zinc-300 hover:bg-zinc-800"
              aria-label="Open course navigation"
            >
              <Menu className="h-5 w-5" />
            </Button>
            <span className="text-sm font-medium text-zinc-200 truncate flex-1">{course.title}</span>
            {effectiveSelectedId && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(true)}
                className="text-zinc-300 hover:bg-zinc-800"
                aria-label="Open AI chat for this lesson"
              >
                <MessageSquare className="h-5 w-5" />
              </Button>
            )}
          </div>

          <div className="px-4 sm:px-8 py-6 sm:py-10">
            {effectiveSelectedId ? (
              <LessonReader
                key={effectiveSelectedId}
                lessonId={effectiveSelectedId}
                onLessonGenerated={refresh}
                onGenerationFinished={handleGenerationFinished}
                onStartSignal={signal}
                onAskSuggestion={(question) => {
                  setPendingQuestion({ question, ts: Date.now() })
                  setChatOpen(true)
                }}
              />
            ) : (
              <div className="py-24 text-center text-zinc-500">
                <BookOpen className="h-10 w-10 mx-auto mb-4 opacity-50" />
                <p>Select a lesson to start learning.</p>
              </div>
            )}
          </div>
        </div>

        {effectiveSelectedId && (
          <LessonChat
            lessonId={effectiveSelectedId}
            lessonTitle={selectedLesson?.title ?? 'this lesson'}
            open={chatOpen}
            onOpenChange={setChatOpen}
            pendingQuestion={pendingQuestion}
            onPendingQuestionConsumed={() => setPendingQuestion(null)}
          />
        )}
      </main>

      {/* reopen chat button (hidden while the panel is open) */}
      {!chatOpen && effectiveSelectedId && (
        <Button
          onClick={() => setChatOpen(true)}
          aria-label="Open AI chat for this lesson"
          className="fixed bottom-5 right-5 z-30 h-12 rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-500 text-white px-4"
        >
          <MessageSquare className="h-4 w-4 mr-2" /> Ask the AI tutor
        </Button>
      )}

      <EditEntityDialog
        open={courseEditOpen}
        onOpenChange={setCourseEditOpen}
        title="Edit course"
        description="Rename the course or rewrite its description."
        fields={[
          { key: 'title', label: 'Course title', required: true },
          { key: 'description', label: 'Description', multiline: true },
        ]}
        initial={{ title: course.title, description: course.description }}
        onSave={saveCourseEdit}
      />
      <EditEntityDialog
        open={Boolean(moduleEdit)}
        onOpenChange={(open) => !open && setModuleEdit(null)}
        title="Edit module"
        description="Rename this module or rewrite its summary."
        fields={[
          { key: 'title', label: 'Module title', required: true },
          { key: 'summary', label: 'Summary', multiline: true },
        ]}
        initial={{ title: moduleEdit?.title ?? '', summary: moduleEdit?.summary ?? '' }}
        onSave={saveModuleEdit}
      />
      <EditEntityDialog
        open={Boolean(lessonEdit)}
        onOpenChange={(open) => !open && setLessonEdit(null)}
        title="Edit lesson"
        description="Rename this lesson or rewrite its summary. Generated content is not changed."
        fields={[
          { key: 'title', label: 'Lesson title', required: true },
          { key: 'summary', label: 'Summary', multiline: true },
        ]}
        initial={{ title: lessonEdit?.title ?? '', summary: lessonEdit?.summary ?? '' }}
        onSave={saveSidebarLessonEdit}
      />
    </div>
  )
}

function LessonStatusIcon({ lesson }: { lesson: LessonNavItem }) {
  if (lesson.progress?.completed)
    return <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
  if (lesson.status === 'generating')
    return <Loader2 className="h-4 w-4 shrink-0 mt-0.5 text-amber-400 animate-spin" />
  if (lesson.status === 'error')
    return <CircleAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
  if (lesson.status === 'ready')
    return <Circle className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500/40 fill-emerald-500/20" />
  return <Circle className="h-4 w-4 shrink-0 mt-0.5 text-zinc-600" />
}
