'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { CheckCircle2, XCircle, RotateCcw, ListChecks } from 'lucide-react'
import type { QuizItem } from '@/lib/types'
import { cn } from '@/lib/utils'

export function QuizPanel({
  quiz,
  savedScore,
  savedTotal,
  completed,
  onSubmit,
  submitting,
}: {
  quiz: QuizItem[]
  savedScore: number | null
  savedTotal: number | null
  completed: boolean
  onSubmit: (score: number, total: number) => void
  submitting: boolean
}) {
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)

  const score = useMemo(
    () =>
      quiz.reduce((acc, q, i) => acc + (answers[i] === q.correctIndex ? 1 : 0), 0),
    [answers, quiz]
  )

  const answeredAll = Object.keys(answers).length === quiz.length

  if (quiz.length === 0) return null

  const alreadyTaken = completed && savedScore !== null && savedTotal !== null && !submitted

  return (
    <section className="mt-10" aria-label="Lesson quiz">
      <div className="flex items-center gap-2 mb-4">
        <ListChecks className="h-5 w-5 text-emerald-400" />
        <h2 className="text-xl font-semibold text-zinc-50">Check your understanding</h2>
        {alreadyTaken && (
          <Badge variant="outline" className="ml-2 border-emerald-700 text-emerald-400">
            previous attempt: {savedScore}/{savedTotal}
          </Badge>
        )}
      </div>

      <div className="space-y-6">
        {quiz.map((q, qi) => {
          const options = [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean)
          const selected = answers[qi]
          return (
            <div key={q.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 sm:p-5">
              <p className="mb-3 font-medium text-zinc-100">
                <span className="text-emerald-400 mr-2">{qi + 1}.</span>
                {q.question}
              </p>
              <RadioGroup
                value={selected !== undefined ? String(selected) : ''}
                onValueChange={(v) => {
                  if (submitted) return
                  setAnswers((prev) => ({ ...prev, [qi]: Number(v) }))
                }}
                className="gap-2.5"
              >
                {options.map((opt, oi) => {
                  const isCorrect = oi === q.correctIndex
                  const isSelected = selected === oi
                  return (
                    <div
                      key={oi}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                        !submitted && 'hover:border-emerald-600/50 cursor-pointer',
                        submitted && isCorrect && 'border-emerald-500 bg-emerald-500/10',
                        submitted && isSelected && !isCorrect && 'border-red-500 bg-red-500/10',
                        !submitted && isSelected && 'border-emerald-600 bg-emerald-600/10',
                        !isSelected && !submitted && 'border-zinc-800'
                      )}
                    >
                      <RadioGroupItem value={String(oi)} id={`q${qi}-o${oi}`} className="text-emerald-500" />
                      <Label
                        htmlFor={`q${qi}-o${oi}`}
                        className={cn(
                          'flex-1 cursor-pointer font-normal text-sm text-zinc-200',
                          submitted && isCorrect && 'text-emerald-300 font-medium'
                        )}
                      >
                        {opt}
                      </Label>
                      {submitted && isCorrect && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      )}
                      {submitted && isSelected && !isCorrect && (
                        <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                      )}
                    </div>
                  )
                })}
              </RadioGroup>
              {submitted && q.explanation && (
                <p className="mt-3 text-sm leading-6 text-zinc-400 border-l-2 border-zinc-700 pl-3">
                  {q.explanation}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {!submitted ? (
          <Button
            onClick={() => {
              setSubmitted(true)
              onSubmit(score, quiz.length)
            }}
            disabled={!answeredAll || submitting}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            Submit answers
          </Button>
        ) : (
          <>
            <div className="flex items-center gap-3 flex-1 min-w-[200px]">
              <Progress value={(score / quiz.length) * 100} className="h-2 bg-zinc-800" />
              <span
                className={cn(
                  'text-sm font-semibold whitespace-nowrap',
                  score / quiz.length >= 0.75 ? 'text-emerald-400' : 'text-amber-400'
                )}
              >
                {score}/{quiz.length} correct
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSubmitted(false)
                setAnswers({})
              }}
              className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            >
              <RotateCcw className="h-4 w-4 mr-1.5" /> Retry quiz
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
