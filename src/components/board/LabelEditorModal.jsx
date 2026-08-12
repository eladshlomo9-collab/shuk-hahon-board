import { useEffect, useState } from 'react'
import { GROUP_COLORS } from '../../lib/constants'
import { DEFAULT_STATUS_LABELS, DEFAULT_TAG_LABELS, DEFAULT_DROPDOWN_LABELS } from '../../lib/constants'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

const PALETTE = [...GROUP_COLORS, '#7e3af2', '#c4c4c4', '#1f1f1f', '#16a34a']

function newId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'l' + Date.now() + Math.random().toString(36).slice(2, 6)
}

// עריכת תוויות לעמודת סטטוס/תגיות: הוספה, שינוי שם, צבע ומחיקה.
export default function LabelEditorModal({ open, column, onClose, onSave }) {
  const [labels, setLabels] = useState([])
  const [openColor, setOpenColor] = useState(null)

  useEffect(() => {
    if (open && column) {
      const def =
        column.type === 'tags' ? DEFAULT_TAG_LABELS : column.type === 'dropdown' ? DEFAULT_DROPDOWN_LABELS : DEFAULT_STATUS_LABELS
      setLabels((column.settings?.labels || def).map((l) => ({ ...l })))
    }
  }, [open, column])

  if (!column) return null

  function update(i, patch) {
    setLabels((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }
  function remove(i) {
    setLabels((ls) => ls.filter((_, idx) => idx !== i))
  }
  function add() {
    setLabels((ls) => [...ls, { id: newId(), label: 'תווית חדשה', color: PALETTE[ls.length % PALETTE.length] }])
  }

  return (
    <Modal open={open} onClose={onClose} title={`עריכת תוויות — ${column.name}`} width="max-w-md">
      <p className="mb-4 text-sm text-ink-muted">
        ערוך את התוויות, הצבעים, הוסף או מחק. השינויים יחולו על כל הפריטים בעמודה.
      </p>
      <div className="max-h-80 space-y-2 overflow-y-auto pl-1">
        {labels.map((l, i) => (
          <div key={l.id} className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setOpenColor(openColor === i ? null : i)}
                className="h-8 w-8 shrink-0 rounded-md ring-1 ring-line"
                style={{ background: l.color }}
                title="בחר צבע"
              />
              {openColor === i && (
                <div className="absolute right-0 z-[20] mt-1 grid w-44 grid-cols-7 gap-1 rounded-lg bg-surface p-2 shadow-lg ring-1 ring-line">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        update(i, { color: c })
                        setOpenColor(null)
                      }}
                      className="h-5 w-5 rounded-full ring-1 ring-line"
                      style={{ background: c }}
                    />
                  ))}
                </div>
              )}
            </div>
            <input
              value={l.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="h-9 flex-1 rounded-md bg-surface px-2.5 text-sm text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand-500"
            />
            <button
              onClick={() => remove(i)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-danger/10 hover:text-danger cursor-pointer"
              title="מחק תווית"
            >
              <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={add}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-line-strong py-2 text-[13px] text-ink-soft transition-colors hover:border-brand-400 hover:text-brand-600 cursor-pointer"
      >
        <span className="text-base leading-none">+</span> הוספת תווית
      </button>

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>ביטול</Button>
        <Button
          onClick={() => onSave({ ...(column.settings || {}), labels: labels.filter((l) => l.label.trim() || true) })}
        >
          שמירה
        </Button>
      </div>
    </Modal>
  )
}
