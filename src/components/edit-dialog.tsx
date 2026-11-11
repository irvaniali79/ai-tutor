'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2 } from 'lucide-react'

export interface EditFieldSpec {
  key: string
  label: string
  multiline?: boolean
  required?: boolean
  placeholder?: string
}

/**
 * A reusable "edit entity" dialog: renders the given fields pre-filled from
 * `initial` and calls onSave with the edited values.
 */
export function EditEntityDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  onSave,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  fields: EditFieldSpec[]
  initial: Record<string, string>
  onSave: (values: Record<string, string>) => Promise<void>
}) {
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) {
      setValues(initial)
      setError('')
    }
     
  }, [open])

  const submit = async () => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(`${f.label} is required.`)
        return
      }
    }
    setSaving(true)
    setError('')
    try {
      await onSave(values)
      onOpenChange(false)
    } catch (err) {
      setError((err as Error).message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-zinc-900 border-zinc-800 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-zinc-100">{title}</DialogTitle>
          {description && <DialogDescription className="text-zinc-400">{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-4 py-1">
          {fields.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-300">{f.label}</label>
              {f.multiline ? (
                <Textarea
                  value={values[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  rows={3}
                  className="bg-zinc-950 border-zinc-700 text-zinc-100 resize-none"
                />
              ) : (
                <Input
                  value={values[f.key] ?? ''}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="bg-zinc-950 border-zinc-700 text-zinc-100"
                />
              )}
            </div>
          ))}
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={saving}
            className="bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
