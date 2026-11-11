import { NextRequest } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import type { ChatMessage } from '@/lib/llm'

/**
 * Built-in demo LLM endpoint.
 * Emulates a small OpenAI-compatible /v1/chat/completions server so the app can be
 * tried end-to-end without any external API. Point your settings' Base URL at
 * `http://127.0.0.1:3000/api/demo-llm` and pick any model name (e.g. "demo").
 * The outline and the first lesson are realistic; additional lessons repeat with
 * the lesson title woven in so every lesson still gets a working quiz.
 */

/**
 * Builds a topic-aware fallback outline. Framework-style module/lesson titles
 * are derived from the user's topic so a course about "Kubernetes" and one
 * about "Photography" get visibly different structures (not canned content).
 */
function buildOutline(topic: string, moduleCount: number, lessonsPerModule: number) {
  const t = topic.replace(/[.?!]+$/, '').trim() || 'Your Topic'
  const frameworks = [
    {
      title: (t: string) => `${t} Fundamentals`,
      summary: (t: string) => `Core concepts, terminology and the mental model you need before going deeper into ${t}.`,
      lessons: (t: string) => [
        { title: `What Is ${t}?`, summary: `A plain-language definition of ${t}, the problems it solves and where it is used in the real world.` },
        { title: `Core Concepts of ${t}`, summary: `The key building blocks and vocabulary that every later lesson in ${t} relies on.` },
        { title: `Setting Up to Practice ${t}`, summary: `The tools and environment you need, plus a first small hands-on exercise.` },
      ],
    },
    {
      title: (t: string) => `Working with ${t}`,
      summary: (t: string) => `Hands-on application of ${t}: everyday patterns, worked examples and common pitfalls.`,
      lessons: (t: string) => [
        { title: `Everyday Patterns in ${t}`, summary: `The idioms and workflows practitioners reach for most often with ${t}.` },
        { title: `Common Pitfalls in ${t}`, summary: `Frequent beginner mistakes in ${t} and the habits that prevent them.` },
        { title: `Debugging and Troubleshooting ${t}`, summary: `A systematic approach to isolating and fixing problems when ${t} misbehaves.` },
      ],
    },
    {
      title: (t: string) => `Applied ${t}: a Real Project`,
      summary: (t: string) => `Putting ${t} together end-to-end in a small but realistic project.`,
      lessons: (t: string) => [
        { title: `Planning Your ${t} Project`, summary: `Choosing a scope, breaking the work down and defining what "done" means.` },
        { title: `Building the Core of Your ${t} Project`, summary: `Implementing the central piece step by step, testing as you go.` },
        { title: `Reviewing and Improving Your ${t} Work`, summary: `Evaluating the result against good practices and iterating on it.` },
      ],
    },
    {
      title: (t: string) => `Advanced ${t} in Practice`,
      summary: (t: string) => `Performance, scale and production concerns for serious work with ${t}.`,
      lessons: (t: string) => [
        { title: `Scaling and Optimizing ${t}`, summary: `Where the costs concentrate as usage grows and the levers that relieve them.` },
        { title: `${t} in Production`, summary: `Operating, monitoring and maintaining ${t} reliably over time.` },
        { title: `Where to Go Next with ${t}`, summary: `A map of the surrounding ecosystem and a self-directed path beyond this course.` },
      ],
    },
  ]

  const count = Math.min(Math.max(moduleCount, 1), frameworks.length)
  const modules = frameworks.slice(0, count).map((f) => ({
    title: f.title(t),
    summary: f.summary(t),
    lessons: f.lessons(t).slice(0, Math.max(lessonsPerModule, 1)),
  }))

  return {
    title: t,
    description: `[Demo mode] A practical course on "${t}": fundamentals first, then hands-on work, then advanced practice. This demo generator produces a generic curriculum so you can explore the app — connect your own OpenAI-compatible API in Settings to generate richer, real courses on any topic.`,
    modules,
  }
}

function lessonBody(topic: string, lessonTitle: string): string {
  const t = topic.replace(/[.?!]+$/, '').trim() || 'the topic'
  return `## ${lessonTitle}

Every field has a moment where the theory clicks because you see it applied. In this lesson we connect **${lessonTitle}** to the wider world of ${t}: what problem it addresses, what it looks like in practice, and how you would recognize good work when you see it.

Imagine you are handed a small but real task involving ${t}. The workflow below is the one most practitioners follow, regardless of the specific tooling:


1. **Clarify the goal.** Write down, in one sentence, what a successful outcome looks like.
2. **Start small.** Build the smallest version of the task that can actually run — a skeleton, not the final product.
3. **Verify early.** Check the skeleton against the goal before adding anything else.
4. **Iterate in layers.** Add one capability at a time, re-verifying after each addition.
5. **Review honestly.** Compare the finished work against the goal and note what you would change.

### Why this workflow matters for ${t}

Skipping steps feels faster but is not: errors found early in ${t} are almost always cheaper to fix than the same errors found later. The table contrasts the two approaches:

| Approach | Time to first result | Cost of late mistakes | Learning value |
| --- | --- | --- | --- |
| Small steps, verify often | Slightly slower | Low | High — feedback every step |
| Big build, test at the end | Looks faster | High | Low — one giant debugging session |

> Note: when something breaks, reduce the problem until it stops breaking — the last thing you removed is usually the culprit.

The habit that separates fast learners in ${t} from slow ones is not talent; it is shortening the loop between *doing* and *checking*. Set up your practice environment so that checking takes seconds, not minutes, and progress compounds quickly.

## Remember

- ${lessonTitle} fits into ${t} as one step of a repeatable workflow, not an isolated trick.
- Start with the smallest runnable version, verify it, then grow it in layers.
- Shorten the feedback loop: the faster you can check your work, the faster you learn.`
}

const QUIZ = (topic: string, lessonTitle: string) => [
  {
    question: `According to the lesson, what is the recommended first step when starting a task involving ${topic}?`,
    options: [
      'Build the complete final product in one pass',
      'Write down in one sentence what a successful outcome looks like',
      'Wait for someone else to define the goal',
      'Skip planning and start debugging random parts',
    ],
    correctIndex: 1,
    explanation: 'The lesson\'s workflow step 1 is to clarify the goal in a single written sentence before building anything.',
  },
  {
    question: 'Why does the lesson recommend starting with the smallest runnable version?',
    options: [
      'Because small projects need no testing',
      'Because errors found early are cheaper to fix than errors found late',
      'Because it avoids having to clarify the goal',
      'Because it removes the need for iteration',
    ],
    correctIndex: 1,
    explanation: 'The lesson\'s table shows that verifying early keeps the cost of mistakes low and the learning value high.',
  },
  {
    question: `What habit does the lesson say most separates fast learners of ${topic} from slow ones?`,
    options: [
      'Natural talent',
      'Memorizing documentation',
      'Shortening the loop between doing and checking',
      'Working without any feedback',
    ],
    correctIndex: 2,
    explanation: 'The lesson states that a short feedback loop — checking your work in seconds, not minutes — is what makes progress compound.',
  },
  {
    question: `Something breaks while you practice ${lessonTitle}. What does the lesson advise?`,
    options: [
      'Reduce the problem until it stops breaking; the last removed piece is usually the culprit',
      'Delete everything and start from zero',
      'Assume the tools are broken and give up',
      'Add more features to hide the problem',
    ],
    correctIndex: 0,
    explanation: 'The lesson\'s note: reduce the problem until it stops breaking — the last thing you removed is usually the culprit.',
  },
]

function pickReply(body: { messages?: { role: string; content: string }[] }): string {
  const messages = body?.messages ?? []
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? ''

  if (lastUser.includes('Design a complete course curriculum')) {
    const topicMatch = lastUser.match(/Topic:\s*(.+)$/m)
    const topic = topicMatch ? topicMatch[1].trim().slice(0, 120) : 'Your Topic'
    const moduleCount = Number(lastUser.match(/Number of modules: exactly (\d+)/)?.[1] ?? 3)
    const lessonsPerModule = Number(lastUser.match(/Lessons per module: exactly (\d+)/)?.[1] ?? 3)
    return JSON.stringify(buildOutline(topic, moduleCount, lessonsPerModule))
  }
  const topicMatch = lastUser.match(/^Course: (.+?) —/m)
  const titleMatch = lastUser.match(/Lesson: (.+?) —/)
  const topic = topicMatch ? topicMatch[1].trim().slice(0, 120) : 'the topic'
  const lessonTitle = titleMatch ? titleMatch[1] : 'This Lesson'
  if (lastUser.includes('Write one complete lesson')) {
    return `${lessonBody(topic, lessonTitle)}\n\n<QUIZ>\n${JSON.stringify(QUIZ(topic, lessonTitle), null, 2)}\n</QUIZ>`
  }
  // tutor chat: the last message is a learner's question about a lesson
  if (!lastUser.includes('Design a complete course curriculum')) {
    const lessonMatch = messages.find((m) => /reading the lesson "/.test(m.content))?.content.match(
      /reading the lesson "(.+?)"/
    )
    const lessonName = lessonMatch ? lessonMatch[1] : 'this lesson'
    return `Good question about **${lessonName}** — and thanks for asking.

You asked: _"${lastUser.slice(0, 200)}"_

This reply comes from the **demo model**, so it cannot give you a real answer about the specifics. In demo mode the chat pipeline itself works end to end: your question is stored with this lesson, the tutor streams its answer here, and the whole conversation stays attached to this lesson so you can come back to it later.

To get real answers:
1. Open **API Settings** and enter your OmniRoute (or any OpenAI-compatible) base URL, API key and model.
2. Come back to this lesson and ask again — the tutor will read the lesson content and answer with real detail.

A tip that works for any topic: try asking follow-ups like *"can you give me a concrete example?"* or *"how does this connect to the previous lesson?"* — the tutor keeps the full conversation context.`
  }
  return 'OK'
}

/**
 * Tries the built-in Z.ai SDK so demo mode generates REAL, topic-aware content.
 * Returns null when the SDK is unavailable (e.g. self-hosted without credentials),
 * in which case the canned sample course is used as fallback.
 */
async function sdkComplete(messages: ChatMessage[]): Promise<string | null> {
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: messages.map((m) => ({
        role: m.role === 'system' ? ('assistant' as const) : m.role,
        content: m.content,
      })),
      thinking: { type: 'disabled' as const },
    })
    const content = completion.choices[0]?.message?.content
    return typeof content === 'string' && content.trim().length > 0 ? content : null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const reply = (await sdkComplete(body?.messages ?? [])) ?? pickReply(body)

  if (!body?.stream) {
    return Response.json({
      id: 'demo-1',
      choices: [
        { index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' },
      ],
    })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const chunks = reply.match(/[\s\S]{1,80}/g) ?? []
      for (const c of chunks) {
        const evt = { choices: [{ delta: { content: c } }] }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`))
        await new Promise((r) => setTimeout(r, 10))
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'))
      controller.close()
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
    },
  })
}
