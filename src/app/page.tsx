'use client'

import { useCallback, useEffect, useState } from 'react'
import { CourseLibrary } from '@/components/course-library'
import { CourseView } from '@/components/course-view'
import { SettingsDialog } from '@/components/settings-dialog'
import { NewCourseDialog } from '@/components/new-course-dialog'
import type { CourseDetail, CourseSummary, Settings } from '@/lib/types'

export default function Home() {
  const [view, setView] = useState<'library' | 'course'>('library')
  const [courseId, setCourseId] = useState<string | null>(null)
  const [courses, setCourses] = useState<CourseSummary[]>([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newCourseOpen, setNewCourseOpen] = useState(false)

  const configured = Boolean(settings?.apiBaseUrl && settings?.model)
  const demoMode = Boolean(
    settings?.model === 'demo' || settings?.apiBaseUrl.includes('/demo-llm')
  )

  const loadSettings = useCallback(async () => {
    const res = await fetch('/api/settings')
    if (res.ok) {
      const s = await res.json()
      setSettings({
        apiBaseUrl: s.apiBaseUrl ?? '',
        apiKey: s.apiKey ?? '',
        model: s.model ?? '',
        temperature: s.temperature ?? 0.7,
        language: s.language ?? 'English',
      })
      return s
    }
    return null
  }, [])

  const loadCourses = useCallback(async () => {
    setLoadingCourses(true)
    try {
      const res = await fetch('/api/courses')
      if (res.ok) setCourses(await res.json())
    } finally {
      setLoadingCourses(false)
    }
  }, [])

  useEffect(() => {
    loadSettings().then((s) => {
      // guide first-time users straight to settings
      if (s && !s.apiBaseUrl) setSettingsOpen(true)
    })
    loadCourses()
  }, [loadSettings, loadCourses])

  const deleteCourse = async (id: string) => {
    const res = await fetch(`/api/courses/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.error || `Delete failed (HTTP ${res.status})`)
    }
    setCourses((prev) => prev.filter((c) => c.id !== id))
  }

  const editCourse = async (
    id: string,
    values: { title: string; description: string }
  ) => {
    const res = await fetch(`/api/courses/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (res.ok) {
      setCourses((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: values.title, description: values.description } : c))
      )
    }
  }

  const openCourse = (id: string) => {
    setCourseId(id)
    setView('course')
  }

  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-100">
      {view === 'library' ? (
        <CourseLibrary
          courses={courses}
          loading={loadingCourses}
          configured={configured}
          demoMode={demoMode}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewCourse={() => setNewCourseOpen(true)}
          onOpenCourse={openCourse}
          onDeleteCourse={deleteCourse}
          onEditCourse={editCourse}
        />
      ) : courseId ? (
        <CourseView
          courseId={courseId}
          onBack={() => {
            setView('library')
            setCourseId(null)
            loadCourses()
          }}
        />
      ) : null}

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={settings}
        onSaved={(s) => {
          setSettings(s)
          loadCourses()
        }}
      />
      <NewCourseDialog
        open={newCourseOpen}
        onOpenChange={setNewCourseOpen}
        demoMode={demoMode}
        onCreated={(course: CourseDetail) => {
          setCourseId(course.id)
          setView('course')
        }}
      />
    </div>
  )
}
