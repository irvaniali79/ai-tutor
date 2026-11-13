import mammoth from 'mammoth'

// pdf-parse v2 exposes a PDFParse class (pdfjs-dist based); load lazily so
// the heavy pdfjs dependency is only fetched when a PDF is actually imported.
async function pdfToText(buffer: Buffer): Promise<{ text: string }> {
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  try {
    const result = await parser.getText()
    return { text: result.text }
  } finally {
    await parser.destroy().catch(() => {})
  }
}

/**
 * Extracts plain text from an uploaded source file so the LLM can build a
 * course grounded in the document's content.
 *
 * Supported: PDF (.pdf), Word (.docx), plain text (.txt, .md, .csv, .json)
 * and most source-code files (read as UTF-8). Anything else is rejected
 * instead of being fed to the model as binary garbage.
 */

// ~100k chars ≈ 25k tokens: large enough for a whole book chapter, small
// enough to leave room for the outline JSON in a typical context window.
export const MAX_SOURCE_CHARS = 100_000
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024 // 20 MB

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'markdown', 'mdown', 'csv', 'json', 'rst', 'log',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'sql', 'yaml', 'yml',
  'toml', 'ini', 'html', 'css', 'scss', 'vue', 'svelte', 'r', 'm', 'pl',
])

export class FileTextError extends Error {}

export interface ExtractedSource {
  filename: string
  kind: string // pdf | docx | text
  text: string // truncated to MAX_SOURCE_CHARS
  truncated: boolean
}

export async function extractSourceText(file: File): Promise<ExtractedSource> {
  if (file.size > MAX_SOURCE_BYTES) {
    throw new FileTextError(
      `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is 20 MB.`
    )
  }
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const buffer = Buffer.from(await file.arrayBuffer())

  let kind: string
  let text: string

  if (ext === 'pdf') {
    kind = 'pdf'
    try {
      const pdf = await pdfToText(buffer)
      text = pdf.text
    } catch (err) {
      throw new FileTextError(
        `Could not read "${file.name}" as PDF (${err instanceof Error ? err.message.slice(0, 120) : 'unknown error'}). Is it a text-based PDF? Scanned documents without a text layer are not supported.`
      )
    }
  } else if (ext === 'docx') {
    kind = 'docx'
    try {
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } catch (err) {
      throw new FileTextError(
        `Could not read "${file.name}" as DOCX (${err instanceof Error ? err.message.slice(0, 120) : 'unknown error'}). Note: legacy .doc files are not supported — save as .docx or .txt.`
      )
    }
  } else if (ext === 'doc') {
    throw new FileTextError(
      'Legacy .doc files are not supported. Please save the document as .docx, .txt or .md.'
    )
  } else if (TEXT_EXTENSIONS.has(ext) || !ext) {
    kind = 'text'
    text = buffer.toString('utf-8')
    // a file that is mostly NUL bytes is binary, not text
    const nulRatio = text.length ? (text.match(/\u0000/g)?.length ?? 0) / text.length : 0
    if (nulRatio > 0.1) {
      throw new FileTextError(`"${file.name}" looks like a binary file — unsupported.`)
    }
  } else {
    throw new FileTextError(
      `Unsupported file type ".${ext}". Supported: .pdf, .docx, .txt, .md, .csv, .json and source-code files.`
    )
  }

  const cleaned = text.replace(/\r\n/g, '\n').replace(/\n{4,}/g, '\n\n\n').trim()
  if (cleaned.length < 40) {
    throw new FileTextError(
      `"${file.name}" contains almost no extractable text (${cleaned.length} characters). A text-based document is required.`
    )
  }
  const truncated = cleaned.length > MAX_SOURCE_CHARS
  return {
    filename: file.name.slice(0, 200),
    kind,
    text: truncated ? cleaned.slice(0, MAX_SOURCE_CHARS) : cleaned,
    truncated,
  }
}
