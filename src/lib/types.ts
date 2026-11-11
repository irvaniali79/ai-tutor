// Shared client types

export interface Settings {
  apiBaseUrl: string
  apiKey: string
  model: string
  temperature: number
  language: string
}

export interface CourseSummary {
  id: string
  title: string
  topic: string
  difficulty: string
  language: string
  description: string
  model: string
  createdAt: string
  readyLessons: number
  totalLessons: number
  completedLessons: number
}

export interface LessonProgressInfo {
  completed: boolean
  quizScore: number
  quizTotal: number
}

export interface LessonNavItem {
  id: string
  title: string
  summary: string
  order: number
  status: 'pending' | 'generating' | 'ready' | 'error'
  moduleId: string
  progress: LessonProgressInfo | null
  _count: { quiz: number }
}

export interface ModuleNavItem {
  id: string
  order: number
  title: string
  summary: string
  lessons: LessonNavItem[]
}

export interface CourseDetail {
  id: string
  title: string
  topic: string
  difficulty: string
  language: string
  description: string
  model: string
  modules: ModuleNavItem[]
}

export interface QuizItem {
  id: string
  question: string
  optionA: string
  optionB: string
  optionC: string
  optionD: string
  correctIndex: number
  explanation: string
}

export interface LessonFull {
  id: string
  title: string
  summary: string
  content: string
  status: 'pending' | 'generating' | 'ready' | 'error'
  error: string
  suggestions: string // JSON-encoded array of question strings ("" = not generated yet)
  module: { title: string }
  course: { id: string; title: string }
  quiz: QuizItem[]
  progress: (LessonProgressInfo & { id: string; lessonId: string }) | null
}

export interface ChatMessageItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}

export interface LessonChatItem {
  id: string
  lessonId: string
  title: string
  createdAt: string
  messages: ChatMessageItem[]
}
