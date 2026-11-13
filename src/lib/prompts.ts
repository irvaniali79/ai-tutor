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

/** Shape of the current course structure sent to the model for updates. */
export interface OutlineModuleForUpdate {
  id: string
  title: string
  summary: string
  lessons: { id: string; title: string; summary: string }[]
}

/**
 * Builds the message array for AI-driven course expansion / restructuring.
 *
 * Two modes:
 *  - "expand": the model returns ONLY additions — new modules appended after
 *    the existing ones plus new lessons for specific existing modules.
 *  - "edit": the model returns the COMPLETE updated structure; existing
 *    lessons/modules keep their `id` so generated content and progress
 *    survive the restructure.
 */
export function updateOutlineMessages(opts: {
  mode: 'expand' | 'edit'
  courseTitle: string
  courseDescription: string
  modules: OutlineModuleForUpdate[]
  instruction: string
  language: string
  /** extracted text of an uploaded reference file */
  sourceContent?: string
}): ChatMessage[] {
  const structureJson = JSON.stringify(
    {
      modules: opts.modules.map((m) => ({
        id: m.id,
        title: m.title,
        summary: m.summary,
        lessons: m.lessons.map((l) => ({ id: l.id, title: l.title, summary: l.summary })),
      })),
    },
    null,
    1
  )

  const source = opts.sourceContent
    ? `Reference material (use THIS content — follow its terminology, facts and structure; do not contradict it):

<SOURCE>
${opts.sourceContent}
</SOURCE>`
    : ''

  if (opts.mode === 'expand') {
    return [
      {
        role: 'system',
        content:
          'You are an expert curriculum designer extending an existing course. You respond with valid JSON only — no prose, no markdown fences.',
      },
      {
        role: 'user',
        content: `Extend the course below. Keep everything that exists; ADD what is missing.

Course: ${opts.courseTitle} — ${opts.courseDescription}
Current structure (module/lesson ids are for reference only — NEVER reuse them in your reply):
${structureJson}

User request: ${opts.instruction || 'Extend the course with the material that is missing.'}
Output language: ${opts.language}
${source ? `\n${source}\n` : ''}
Rules:
- New modules must fit seamlessly after the existing ones (logical learning progression).
- Do NOT repeat or rephrase existing modules/lessons — only additions.
${opts.sourceContent ? '- Cover the important parts of the reference material that the current course does not yet teach.\n' : ''}- Lesson titles are short and concrete (max 8 words); summaries are one sentence.

Respond with JSON in exactly this shape:
{
  "newModules": [
    {
      "title": "New module title",
      "summary": "One sentence",
      "lessons": [ { "title": "Lesson title", "summary": "One sentence" } ]
    }
  ],
  "newLessonsByModule": [
    { "moduleId": "EXISTING module id", "lessons": [ { "title": "Lesson title", "summary": "One sentence" } ] }
  ]
}
Both fields are required — use an empty array [] if nothing of that kind is needed.`,
      },
    ]
  }

  return [
    {
      role: 'system',
      content:
        'You are an expert curriculum designer restructuring an existing course. You respond with valid JSON only — no prose, no markdown fences.',
    },
    {
      role: 'user',
      content: `Restructure the course below according to the user's request.

Course: ${opts.courseTitle} — ${opts.courseDescription}
Current structure (KEEP the "id" of every module/lesson you keep — content and progress are attached to these ids):
${structureJson}

User request: ${opts.instruction || 'Improve the course structure.'}
Output language: ${opts.language}
${source ? `\n${source}\n` : ''}
Rules:
- Preserve the id of every module and lesson you keep (renaming titles/summaries is fine).
- Omit the "id" (or use null) only for NEW modules/lessons.
- Modules or lessons you leave out of your reply will be DELETED together with their generated content — only omit them when the user clearly wants them gone or replaced.
- Modules must build on each other in a logical learning progression.
- Lesson titles are short and concrete (max 8 words); summaries are one sentence.

Respond with JSON in exactly this shape (the COMPLETE course after your changes):
{
  "title": "Course title",
  "description": "Course description",
  "modules": [
    {
      "id": "existing module id or null for new",
      "title": "Module title",
      "summary": "One sentence",
      "lessons": [
        { "id": "existing lesson id or null for new", "title": "Lesson title", "summary": "One sentence" }
      ]
    }
  ]
}`,
    },
  ]
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
  /** null = the model decides the structure based on the topic/material */
  moduleCount: number | null
  lessonsPerModule: number | null
  language: string
  /** extracted text of an uploaded file, when the course is built from a document */
  sourceContent?: string
}): ChatMessage[] {
  const structure =
    opts.moduleCount && opts.lessonsPerModule
      ? `Number of modules: exactly ${opts.moduleCount}
Lessons per module: exactly ${opts.lessonsPerModule}`
      : `Structure: YOU decide. Choose how many modules the course needs (as many as the topic or material genuinely requires — deeper topics deserve more; do not pad) and how many lessons each module needs (enough to cover it properly, as many or as few as appropriate).`

  const source = opts.sourceContent
    ? `Source material (build the course on THIS content — derive the title and topic from it, follow its terminology, structure and order where sensible; do not contradict it):

<SOURCE>
${opts.sourceContent}
</SOURCE>`
    : ''

  const topicLine = opts.sourceContent
    ? `Topic: ${opts.topic || '(decide from the source material)'}`
    : `Topic: ${opts.topic}`

  return [
    {
      role: 'system',
      content:
        'You are an expert curriculum designer. You respond with valid JSON only — no prose, no markdown fences.',
    },
    {
      role: 'user',
      content: `Design a complete course curriculum.

${topicLine}
Target audience: ${opts.audience || 'motivated self-learners'}
Difficulty: ${opts.difficulty}
${structure}
Output language: ${opts.language}
${source ? `\n${source}\n` : ''}
Rules:
- Modules must build on each other in a logical learning progression.
- Lesson titles are short and concrete (max 8 words). Lesson summaries are one sentence describing what the learner will understand.
- The course must start from fundamentals and end with advanced, practical material.
${opts.sourceContent ? '- The lessons must cover the important parts of the source material; a learner who completes the course should have absorbed the document.\n' : ''}- Write ALL content in ${opts.language}.

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
  /** source material this course was built from, when uploaded as a file */
  sourceContent?: string
}): ChatMessage[] {
  const prev = opts.previousLessonTitles.length
    ? `Lessons already covered before this one (do not repeat them, may briefly reference them):\n${opts.previousLessonTitles
        .map((t) => `- ${t}`)
        .join('\n')}`
    : 'This is the first lesson of the course.'

  const source = opts.sourceContent
    ? `Source material excerpt (this course is built from this document — ground the lesson in it: use its terminology, facts, examples and structure; where the material gives specifics, teach exactly those):

<SOURCE>
${opts.sourceContent}
</SOURCE>`
    : ''

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
${source}

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
