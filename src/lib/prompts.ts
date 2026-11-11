import type { ChatMessage } from '@/lib/llm'

export interface OutlineLesson {
  title: string
  summary: string
}
export interface OutlineModule {
  title: string
  summary: string
  lessons: OutlineLesson[]
}
export interface CourseOutline {
  title: string
  description: string
  modules: OutlineModule[]
}

export interface GeneratedQuizItem {
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export function outlineMessages(opts: {
  topic: string
  audience: string
  difficulty: string
  moduleCount: number
  lessonsPerModule: number
  language: string
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are an expert curriculum designer. You respond with valid JSON only — no prose, no markdown fences.',
    },
    {
      role: 'user',
      content: `Design a complete course curriculum.

Topic: ${opts.topic}
Target audience: ${opts.audience || 'motivated self-learners'}
Difficulty: ${opts.difficulty}
Number of modules: exactly ${opts.moduleCount}
Lessons per module: exactly ${opts.lessonsPerModule}
Output language: ${opts.language}

Rules:
- Modules must build on each other in a logical learning progression.
- Lesson titles are short and concrete (max 8 words). Lesson summaries are one sentence describing what the learner will understand.
- The course must start from fundamentals and end with advanced, practical material.
- Write ALL content in ${opts.language}.

Respond with JSON in exactly this shape:
{
  "title": "Course title",
  "description": "2-3 sentence course description",
  "modules": [
    {
      "title": "Module title",
      "summary": "One sentence on what this module covers",
      "lessons": [
        { "title": "Lesson title", "summary": "One sentence" }
      ]
    }
  ]
}`,
    },
  ]
}

export function lessonMessages(opts: {
  courseTitle: string
  courseDescription: string
  moduleTitle: string
  moduleSummary: string
  lessonTitle: string
  lessonSummary: string
  previousLessonTitles: string[]
  difficulty: string
  language: string
}): ChatMessage[] {
  const prev = opts.previousLessonTitles.length
    ? `Lessons already covered before this one (do not repeat them, may briefly reference them):\n${opts.previousLessonTitles
        .map((t) => `- ${t}`)
        .join('\n')}`
    : 'This is the first lesson of the course.'

  return [
    {
      role: 'system',
      content: `You are a senior engineer and outstanding technical educator writing a single self-contained lesson. You write in clear, direct prose. You never pad text with filler. Output language: ${opts.language}.`,
    },
    {
      role: 'user',
      content: `Write one complete lesson.

Course: ${opts.courseTitle} — ${opts.courseDescription}
Module: ${opts.moduleTitle} — ${opts.moduleSummary}
Lesson: ${opts.lessonTitle} — ${opts.lessonSummary}
Difficulty: ${opts.difficulty}
${prev}

Requirements for the lesson body (markdown):
- 800 to 1400 words. Use headings (##, ###), short paragraphs, and concrete examples.
- Include at least one realistic code example or worked example in a fenced code block where relevant to the topic. If the topic is not technical, use a concrete worked example instead.
- Where useful, use a markdown table to compare or summarize.
- Include exactly one "## Remember" section at the end with 2-4 bullet points summarizing the key takeaways.
- Do NOT include a course title heading (#). Start with a short intro paragraph, then use ## sections.
- All content in ${opts.language}.

After the lesson body, output the quiz exactly in this format (nothing before or after the tags inside the quiz block):

<QUIZ>
[
  {
    "question": "Question text",
    "options": ["A", "B", "C", "D"],
    "correctIndex": 0,
    "explanation": "Why this answer is correct"
  }
]
</QUIZ>

The quiz must have exactly 4 questions that check understanding of THIS lesson, mixing recall and application. Correct answers must be verifiable from the lesson text. Vary the correctIndex across questions.`,
    },
  ]
}

/** Splits raw streamed lesson output into markdown body + quiz JSON. */
export function splitLessonOutput(raw: string): {
  content: string
  quiz: GeneratedQuizItem[]
} {
  const marker = /<QUIZ>([\s\S]*?)(?:<\/QUIZ>|$)/i
  const match = raw.match(marker)
  let quiz: GeneratedQuizItem[] = []
  let content = raw
  if (match) {
    content = raw.slice(0, match.index).trim()
    try {
      const parsed = JSON.parse(match[1].trim()) as GeneratedQuizItem[]
      if (Array.isArray(parsed)) {
        quiz = parsed
          .filter(
            (q) =>
              q &&
              typeof q.question === 'string' &&
              Array.isArray(q.options) &&
              q.options.length >= 2
          )
          .map((q) => ({
            question: String(q.question),
            options: q.options.map(String),
            correctIndex: Number.isInteger(q.correctIndex) ? q.correctIndex : 0,
            explanation: typeof q.explanation === 'string' ? q.explanation : '',
          }))
      }
    } catch {
      quiz = []
    }
  }
  return { content: content.trim(), quiz }
}

/** Builds the message array for the per-lesson AI chat. */
export function chatMessages(opts: {
  courseTitle: string
  moduleTitle: string
  lessonTitle: string
  lessonContent: string
  language: string
  history: { role: 'user' | 'assistant'; content: string }[]
  question: string
}): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  return [
    {
      role: 'system',
      content: `You are a patient, knowledgeable tutor. The learner is reading the lesson "${opts.lessonTitle}" from the course "${opts.courseTitle}" (module: ${opts.moduleTitle}). Answer their questions about this lesson and its topic. Stay on topic, be concrete, and keep answers focused (usually under 300 words unless a deeper explanation is clearly needed). Use markdown for structure and code blocks when relevant. Output language: ${opts.language}. If the question goes beyond the lesson, answer helpfully from your own knowledge.`,
    },
    {
      role: 'user',
      content: `Here is the full lesson content I am reading, for your reference:\n\n---\n\n${opts.lessonContent}\n\n---\n\nAcknowledge with "OK" only.`,
    },
    { role: 'assistant', content: 'OK' },
    ...opts.history.slice(-20),
    { role: 'user', content: opts.question },
  ]
}

/** Builds the message array that generates suggested learner questions for a lesson. */
export function suggestionsMessages(opts: {
  courseTitle: string
  lessonTitle: string
  lessonSummary: string
  lessonContent: string
  language: string
}): { role: 'system' | 'user'; content: string }[] {
  return [
    {
      role: 'system',
      content:
        'You generate great follow-up questions that a learner might ask after reading a lesson. Output only JSON.',
    },
    {
      role: 'user',
      content: `Lesson: "${opts.lessonTitle}" (from the course "${opts.courseTitle}")
Lesson summary: ${opts.lessonSummary}

Lesson content (truncated):
${opts.lessonContent.slice(0, 6000)}

Generate 5 short questions that this lesson's reader would most probably want to ask next — questions that dig into details, practical application, common confusion points, or natural next steps. Each question must be self-contained, max 14 words, in ${opts.language}.

Respond with a JSON array of strings only, e.g. ["Question 1?", "Question 2?", ...]`,
    },
  ]
}
