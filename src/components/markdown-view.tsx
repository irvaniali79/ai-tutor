'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { cn } from '@/lib/utils'

export function MarkdownView({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn('prose-course', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children }) => (
            <h2 className="mt-8 mb-3 text-xl font-semibold text-zinc-50 border-b border-zinc-800 pb-2">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-6 mb-2 text-lg font-semibold text-zinc-100">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mt-4 mb-2 font-semibold text-zinc-200">{children}</h4>
          ),
          p: ({ children }) => (
            <p className="mb-4 leading-7 text-zinc-300">{children}</p>
          ),
          ul: ({ children }) => (
            <ul className="mb-4 space-y-1.5 list-disc pl-6 text-zinc-300">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-4 space-y-1.5 list-decimal pl-6 text-zinc-300">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-zinc-50">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-zinc-200">{children}</em>,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 underline underline-offset-2 hover:text-emerald-300"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-4 border-l-4 border-emerald-500/60 bg-emerald-500/5 pl-4 pr-3 py-2 rounded-r-md text-zinc-300 italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-4 overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-sm border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-zinc-800/70">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-zinc-100 border-b border-zinc-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-zinc-300 border-b border-zinc-800 align-top">
              {children}
            </td>
          ),
          hr: () => <hr className="my-6 border-zinc-800" />,
          code: (props) => {
            const { className, children } = props as {
              className?: string
              children?: React.ReactNode
            }
            const match = /language-(\w+)/.exec(className || '')
            const text = String(children ?? '').replace(/\n$/, '')
            const isBlock = match || text.includes('\n')
            if (!isBlock) {
              return (
                <code className="rounded bg-zinc-800 px-1.5 py-0.5 text-[0.85em] font-mono text-emerald-300">
                  {text}
                </code>
              )
            }
            return (
              <div className="mb-4 overflow-hidden rounded-lg border border-zinc-800">
                <SyntaxHighlighter
                  style={oneDark}
                  language={match?.[1] || 'text'}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    background: '#0d1117',
                    fontSize: '0.85rem',
                    padding: '1rem',
                  }}
                  wrapLongLines={false}
                >
                  {text}
                </SyntaxHighlighter>
              </div>
            )
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
