'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { MarkdownView } from '@/components/markdown-view'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ChevronDown,
  MessageSquarePlus,
  PanelRightClose,
  SendHorizontal,
  Trash2,
  Loader2,
  CircleAlert,
} from 'lucide-react'
import type { ChatMessageItem, LessonChatItem } from '@/lib/types'
import { cn } from '@/lib/utils'

/**
 * Right-side AI tutor chat for a single lesson.
 * - Each lesson owns its chat threads; threads are stored server-side.
 * - A suggestion click arrives via `pendingQuestion` and opens a NEW thread
 *   dedicated to that question; follow-ups stay in the same thread.
 * - The "New chat" button starts a fresh empty thread.
 */
export function LessonChat({
  lessonId,
  lessonTitle,
  open,
  onOpenChange,
  pendingQuestion,
  onPendingQuestionConsumed,
}: {
  lessonId: string
  lessonTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
  pendingQuestion: { question: string; ts: number } | null
  onPendingQuestionConsumed: () => void
}) {
  const [chats, setChats] = useState<LessonChatItem[]>([])
  const [activeChatId, setActiveChatId] = useState<string | null>(null)
  const [pendingUser, setPendingUser] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [error, setError] = useState('')
  const [loadingChats, setLoadingChats] = useState(false)
  // resizable panel: null means "use the default width"; persisted per browser
  const [chatWidth, setChatWidth] = useState<number | null>(null)
  const [resizing, setResizing] = useState(false)
  const resizeStartRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const handleRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const CHAT_MIN_W = 300
  const CHAT_MAX_W = 760
  const CHAT_DEFAULT_W = 380
  const CHAT_W_KEY = 'courseforge.chatWidth'

  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(CHAT_W_KEY))
      if (Number.isFinite(saved) && saved >= CHAT_MIN_W && saved <= CHAT_MAX_W) {
        setChatWidth(saved)
      }
    } catch {
      /* private mode etc. — default width is fine */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null
  // the transcript is DERIVED from the loaded chat plus optimistic overlays,
  // so it can never drift out of sync with the server
  const baseMessages: ChatMessageItem[] = activeChat?.messages ?? []
  const messages: ChatMessageItem[] = pendingUser
    ? [
        ...baseMessages,
        { id: 'temp-user', role: 'user', content: pendingUser, createdAt: new Date().toISOString() },
      ]
    : baseMessages

  const loadChats = useCallback(async () => {
    setLoadingChats(true)
    try {
      const res = await fetch(`/api/lessons/${lessonId}/chats`)
      if (!res.ok) return
      const data = await res.json()
      const list: LessonChatItem[] = data.chats ?? []
      setChats(list)
      setActiveChatId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev
        return list.length > 0 ? list[list.length - 1].id : null
      })
    } finally {
      setLoadingChats(false)
    }
  }, [lessonId])

  useEffect(() => {
    setChats([])
    setActiveChatId(null)
    setError('')
    if (open) loadChats()
  }, [lessonId, open, loadChats])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, streamText, streaming])

  const createChat = useCallback(
    async (title?: string): Promise<LessonChatItem | null> => {
      const res = await fetch(`/api/lessons/${lessonId}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      })
      if (!res.ok) return null
      const { chat } = await res.json()
      setChats((prev) => [...prev, chat])
      setActiveChatId(chat.id)
      return chat
    },
    [lessonId]
  )

  const deleteChat = async (chatId: string) => {
    await fetch(`/api/lessons/${lessonId}/chats/${chatId}`, { method: 'DELETE' })
    const rest = chats.filter((c) => c.id !== chatId)
    setChats(rest)
    if (activeChatId === chatId) {
      setActiveChatId(rest.length > 0 ? rest[rest.length - 1].id : null)
    }
  }

  const sendToChat = useCallback(
    async (chatId: string, question: string) => {
      setStreaming(true)
      setStreamText('')
      setError('')
      setPendingUser(question)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const res = await fetch(`/api/lessons/${lessonId}/chats/${chatId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: question }),
          signal: controller.signal,
        })
        if (!res.ok || !res.body) {
          const errBody = await res.json().catch(() => ({}))
          throw new Error(errBody.error || `Request failed (${res.status})`)
        }
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let reply = ''
        let finished = false
        while (!finished) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const parts = buffer.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const part of parts) {
            const line = part.trim()
            if (!line.startsWith('data:')) continue
            const evt = JSON.parse(line.slice(5).trim())
            if (evt.type === 'delta') {
              reply += evt.text
              setStreamText(reply)
            } else if (evt.type === 'done') {
              finished = true
            } else if (evt.type === 'error') {
              throw new Error(evt.message)
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError((err as Error).message || 'Chat failed.')
        }
      } finally {
        abortRef.current = null
        // reload the stored conversation so the transcript reflects the server
        await loadChats().catch(() => null)
        setPendingUser(null)
        setStreaming(false)
        setStreamText('')
      }
    },
    [lessonId, loadChats]
  )

  const send = async () => {
    const question = input.trim()
    if (!question || streaming) return
    setInput('')
    let chatId = activeChatId
    if (!chatId || !chats.some((c) => c.id === chatId)) {
      const chat = await createChat(question.slice(0, 80))
      if (!chat) {
        setError('Could not create a chat thread.')
        return
      }
      chatId = chat.id
    }
    await sendToChat(chatId, question)
  }

  // a clicked suggestion arrives here -> dedicated new chat for that question
  useEffect(() => {
    if (!pendingQuestion || !open) return
    const q = pendingQuestion.question
    onPendingQuestionConsumed()
    if (streaming) return
    ;(async () => {
      const chat = await createChat(q.slice(0, 80))
      if (chat) await sendToChat(chat.id, q)
    })()
  }, [pendingQuestion])

  // ---- panel resizing (desktop only) -------------------------------
  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    resizeStartRef.current = {
      startX: e.clientX,
      startWidth: chatWidth ?? CHAT_DEFAULT_W,
    }
    handleRef.current?.setPointerCapture(e.pointerId)
    setResizing(true)
  }
  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = resizeStartRef.current
    if (!start) return
    const max = Math.min(CHAT_MAX_W, Math.max(CHAT_MIN_W, window.innerWidth - 420))
    const w = Math.min(max, Math.max(CHAT_MIN_W, start.startWidth + (start.startX - e.clientX)))
    setChatWidth(w)
  }
  const onHandlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!resizeStartRef.current) return
    resizeStartRef.current = null
    handleRef.current?.releasePointerCapture(e.pointerId)
    setResizing(false)
    try {
      if (chatWidth != null) localStorage.setItem(CHAT_W_KEY, String(chatWidth))
    } catch {
      /* ignore */
    }
  }
  const onHandleDoubleClick = () => {
    setChatWidth(null)
    try {
      localStorage.removeItem(CHAT_W_KEY)
    } catch {
      /* ignore */
    }
  }

  if (!open) return null

  return (
    <aside
      style={{
        // the variable only takes effect on lg+ (see the class below), so the
        // mobile overlay drawer keeps its own 90%-width sizing
        '--chat-w': `${chatWidth ?? CHAT_DEFAULT_W}px`,
      } as React.CSSProperties}
      className={cn(
        'flex flex-col bg-zinc-950/80 border-zinc-800',
        // docked column on large screens (resizable via --chat-w), overlay
        // drawer on smaller ones; h-full keeps the composer pinned to the
        // bottom of the viewport. NB: lg:relative (not lg:static) — the panel
        // must be the containing block for the resize handle, and tailwind-merge
        // would otherwise strip a plain `relative` in favour of `fixed`
        'fixed inset-y-0 right-0 z-40 w-[90%] max-w-md border-l lg:relative lg:z-auto lg:max-w-none lg:w-[var(--chat-w)] lg:shrink-0 lg:h-full',
        resizing && 'select-none'
      )}
    >
      {/* drag handle to resize the panel (desktop only, double-click resets) */}
      <div
        ref={handleRef}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize chat panel"
        title="Drag to resize · double-click to reset"
        onPointerDown={onHandlePointerDown}
        onPointerMove={onHandlePointerMove}
        onPointerUp={onHandlePointerUp}
        onPointerCancel={onHandlePointerUp}
        onDoubleClick={onHandleDoubleClick}
        className="hidden lg:block absolute inset-y-0 -left-1.5 z-50 w-3 cursor-col-resize touch-none group/resize"
      >
        <div
          className={cn(
            'absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5 rounded-full transition-colors duration-150',
            resizing
              ? 'bg-emerald-500 h-full'
              : 'bg-transparent group-hover/resize:bg-emerald-500/50'
          )}
        />
      </div>
      {/* header */}
      <div className="border-b border-zinc-800 px-3 py-2.5 flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-between text-zinc-300 hover:bg-zinc-800 font-normal min-w-0"
            >
              <span className="truncate text-sm">
                {loadingChats
                  ? 'Loading chats…'
                  : activeChat
                    ? activeChat.title || 'New chat'
                    : 'New conversation'}
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="bg-zinc-900 border-zinc-800 max-h-72 overflow-y-auto">
            {chats.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500">No conversations yet</div>
            )}
            {chats.map((c) => (
              <DropdownMenuItem
                key={c.id}
                onClick={() => setActiveChatId(c.id)}
                className={cn(
                  'text-zinc-300 gap-2 max-w-[320px]',
                  c.id === activeChatId && 'bg-emerald-500/10 text-emerald-300'
                )}
              >
                <span className="truncate flex-1">{c.title || 'New chat'}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Delete chat ${c.title}`}
                  className="p-1 rounded hover:bg-red-950/60 hover:text-red-400 text-zinc-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteChat(c.id)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && deleteChat(c.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => createChat()}
          disabled={streaming}
          aria-label="Start a new chat"
          title="New chat"
          className="h-8 w-8 shrink-0 text-zinc-400 hover:text-emerald-400 hover:bg-zinc-800"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onOpenChange(false)}
          aria-label="Close chat panel"
          title="Close chat"
          className="h-8 w-8 shrink-0 text-zinc-400 hover:bg-zinc-800"
        >
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto px-3 py-4 space-y-4 chat-scroll">
        {messages.length === 0 && !streaming && (
          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <div className="h-10 w-10 rounded-full bg-emerald-600/15 flex items-center justify-center mb-3">
              <SendHorizontal className="h-4 w-4 text-emerald-400" />
            </div>
            <p className="text-sm font-medium text-zinc-300">Ask about this lesson</p>
            <p className="mt-1 text-xs text-zinc-500 leading-5 max-w-[240px]">
              The AI tutor has read “{lessonTitle}” and answers questions about it. Each lesson
              keeps its own conversations.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            {m.role === 'user' ? (
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-emerald-600 px-3.5 py-2 text-sm text-white whitespace-pre-wrap break-words">
                {m.content}
              </div>
            ) : (
              <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 [&_.prose-course]:text-sm [&_.prose-course_p]:my-2">
                <MarkdownView content={m.content} />
              </div>
            )}
          </div>
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-zinc-900 border border-zinc-800 px-3 py-2 text-sm text-zinc-200 [&_.prose-course]:text-sm [&_.prose-course_p]:my-2">
              {streamText ? (
                <MarkdownView content={streamText} />
              ) : (
                <div className="flex items-center gap-2 text-zinc-400 py-1">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                </div>
              )}
            </div>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/40 p-3 text-sm text-red-300">
            <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}
      </div>

      {/* composer */}
      <div className="border-t border-zinc-800 p-3">
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask a question about this lesson…"
            rows={2}
            disabled={streaming}
            className="flex-1 bg-zinc-900 border-zinc-700 text-zinc-100 resize-none text-sm min-h-[44px] max-h-40"
          />
          <Button
            onClick={send}
            disabled={streaming || !input.trim()}
            size="icon"
            aria-label="Send message"
            className="h-10 w-10 shrink-0 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {streaming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-zinc-600">Enter to send · Shift+Enter for a new line</p>
      </div>
    </aside>
  )
}
