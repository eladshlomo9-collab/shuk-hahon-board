import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { DEFAULT_STATUS_LABELS, DEFAULT_TAG_LABELS, DEFAULT_DROPDOWN_LABELS } from '../../lib/constants'
import { getPersonIds } from '../../lib/personIds'

// תפריט תא — נפתח דרך portal עם מיקום fixed כדי שלא ייחתך ע"י overflow של הטבלה.
function CellMenu({ open, onClose, anchorRef, width = 208, children }) {
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)

  useLayoutEffect(() => {
    if (!open) return
    const el = anchorRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      let left = r.right - width
      if (left < 8) left = 8
      if (left + width > window.innerWidth - 8) left = window.innerWidth - 8 - width
      let top = r.bottom + 4
      const estH = 300
      if (top + estH > window.innerHeight - 8 && r.top > window.innerHeight - r.bottom) {
        top = Math.max(8, r.top - 4 - estH)
      }
      setPos({ top, left })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef, width])

  useEffect(() => {
    if (!open) return
    function onDown(e) {
      if (menuRef.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return
      onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose, anchorRef])

  if (!open || !pos) return null
  return createPortal(
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: pos.top, left: pos.left, width, maxHeight: 'min(320px, 70vh)' }}
      className="z-[60] overflow-y-auto rounded-lg bg-surface p-1.5 shadow-lg ring-1 ring-line"
    >
      {children}
    </div>,
    document.body
  )
}

// תא בודד בטבלה. מקבל value (jsonb) ושומר דרך onChange(newValue).
export default function Cell({ column, value, members, editable, onChange }) {
  switch (column.type) {
    case 'status':
      return <StatusCell column={column} value={value} editable={editable} onChange={onChange} />
    case 'person':
      return <PersonCell value={value} members={members} editable={editable} onChange={onChange} />
    case 'date':
      return <DateCell column={column} value={value} editable={editable} onChange={onChange} />
    case 'number':
      return <NumberCell column={column} value={value} editable={editable} onChange={onChange} />
    case 'checkbox':
      return <CheckboxCell value={value} editable={editable} onChange={onChange} />
    case 'tags':
      return <TagsCell column={column} value={value} editable={editable} onChange={onChange} />
    case 'phone':
      return <LinkLikeCell value={value} editable={editable} onChange={onChange} scheme="tel:" type="tel" />
    case 'email':
      return <LinkLikeCell value={value} editable={editable} onChange={onChange} scheme="mailto:" type="email" />
    case 'link':
      return <LinkLikeCell value={value} editable={editable} onChange={onChange} scheme="" type="url" />
    case 'dropdown':
      return <DropdownCell column={column} value={value} editable={editable} onChange={onChange} />
    case 'timeline':
      return <TimelineCell value={value} editable={editable} onChange={onChange} />
    default:
      return <TextCell value={value} editable={editable} onChange={onChange} />
  }
}

const cellInput =
  'h-11 w-full bg-transparent px-3 text-sm text-ink outline-none transition-colors focus:bg-brand-50 disabled:cursor-default'

function TextCell({ value, editable, onChange }) {
  const [text, setText] = useState(value?.text || '')
  useEffect(() => setText(value?.text || ''), [value])
  return (
    <input
      disabled={!editable}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text !== (value?.text || '') && onChange({ text })}
      className={cellInput}
    />
  )
}

// עמודת זמן-בדקות: מקבל "90" (דקות) או "18ש" / "1.5 שעות" / "18h" (שעות, מומר לדקות). מחזיר דקות, NaN אם לא תקין.
function parseMinutesInput(text) {
  const t = String(text).trim().replace(',', '.')
  if (t === '') return null
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(ש(?:עות|עה)?|h)?['׳"]?$/i)
  if (!m) return NaN
  const n = Number(m[1])
  return m[2] ? Math.round(n * 60) : n
}

function NumberCell({ column, value, editable, onChange }) {
  // עמודת זמן-בדקות (לפי settings.unit או שם עמודה שמכיל "בדקות") — מציגה תג יחידה + המרה לשעות,
  // ומאפשרת הזנה ישירה בשעות עם הסיומת ש (למשל "18ש" נשמר כ-1080 דקות)
  const isMinutes = column?.settings?.unit === 'minutes' || (column?.name || '').includes('בדקות')
  const [num, setNum] = useState(value?.number ?? '')
  useEffect(() => setNum(value?.number ?? ''), [value])

  if (!isMinutes) {
    return (
      <input
        type="number"
        disabled={!editable}
        value={num}
        onChange={(e) => setNum(e.target.value)}
        onBlur={() => {
          const v = num === '' ? null : Number(num)
          if (v !== (value?.number ?? null)) onChange(v === null ? {} : { number: v })
        }}
        className={`${cellInput} text-center tabular-nums`}
      />
    )
  }

  const parsed = parseMinutesInput(num)
  const n = typeof parsed === 'number' && !Number.isNaN(parsed) ? parsed : null
  const hoursHint = n !== null && n >= 60 ? `${Math.round((n / 60) * 10) / 10} ש׳` : null
  return (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        disabled={!editable}
        value={num}
        placeholder="90 או 18ש"
        onChange={(e) => setNum(e.target.value)}
        onBlur={() => {
          const v = parseMinutesInput(num)
          if (Number.isNaN(v)) {
            setNum(value?.number ?? '')
            return
          }
          if (v !== (value?.number ?? null)) onChange(v === null ? {} : { number: v })
          else setNum(value?.number ?? '')
        }}
        className={`${cellInput} pe-14 text-center tabular-nums placeholder:text-[11px]`}
      />
      <span
        className="pointer-events-none absolute inset-y-0 left-2 flex items-center gap-1 text-[11px] text-ink-muted"
        title={hoursHint ? `${n} דקות = ${hoursHint.replace('ש׳', 'שעות')}` : 'הזנה בדקות, או שעות עם ש בסוף (למשל 18ש)'}
      >
        {hoursHint && <span className="rounded bg-brand-50 px-1.5 py-0.5 font-semibold text-brand-600">{hoursHint}</span>}
        <span className="rounded bg-surface-2 px-1.5 py-0.5 ring-1 ring-line">דק׳</span>
      </span>
    </div>
  )
}

function DateCell({ column, value, editable, onChange }) {
  const inputRef = useRef(null)
  const d = value?.date || ''
  const label = d
    ? new Date(d + 'T00:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''
  const fieldName = column?.name || 'תאריך'

  function openPicker() {
    if (!editable) return
    const el = inputRef.current
    if (!el) return
    if (el.showPicker) {
      try {
        el.showPicker()
        return
      } catch {
        /* fall through */
      }
    }
    el.focus()
  }

  return (
    <div className="relative h-11">
      <button
        type="button"
        disabled={!editable}
        onClick={openPicker}
        title={fieldName}
        aria-label={label ? `${fieldName}: ${label}` : `${fieldName}: לא נקבע`}
        className="flex h-full w-full items-center justify-center px-3 text-sm outline-none transition-colors hover:bg-surface-2/60 disabled:cursor-default"
      >
        {label ? (
          <span className="tabular-nums text-ink-soft">{label}</span>
        ) : (
          <span className="text-ink-muted/40">—</span>
        )}
      </button>
      <input
        ref={inputRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        disabled={!editable}
        value={d}
        onChange={(e) => onChange(e.target.value ? { date: e.target.value } : {})}
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0 w-full opacity-0"
      />
    </div>
  )
}

function CheckboxCell({ value, editable, onChange }) {
  const checked = !!value?.checked
  return (
    <div className="flex h-11 items-center justify-center">
      <button
        disabled={!editable}
        onClick={() => editable && onChange(checked ? {} : { checked: true })}
        className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors disabled:cursor-default ${
          checked ? 'border-brand-500 bg-brand-500 text-white' : 'border-line-strong bg-surface hover:border-brand-400'
        }`}
        aria-pressed={checked}
        title={checked ? 'מסומן' : 'לא מסומן'}
      >
        {checked && (
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  )
}

function LinkLikeCell({ value, editable, onChange, scheme, type }) {
  const [text, setText] = useState(value?.text || '')
  useEffect(() => setText(value?.text || ''), [value])
  const href = value?.text ? (scheme ? scheme + value.text : ensureHttp(value.text)) : null
  return (
    <div className="flex h-11 items-center">
      <input
        type={type}
        disabled={!editable}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => text !== (value?.text || '') && onChange(text ? { text } : {})}
        className={`${cellInput} text-center`}
        dir="ltr"
      />
      {href && (
        <a
          href={href}
          target={scheme ? undefined : '_blank'}
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-1.5 shrink-0 text-ink-muted transition-colors hover:text-brand-600"
          title="פתח"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M6 3h7v7M13 3L6.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M11 9.5V12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1h2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      )}
    </div>
  )
}

function ensureHttp(s) {
  return /^https?:\/\//i.test(s) ? s : 'https://' + s
}

function StatusCell({ column, value, editable, onChange }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const labels = column.settings?.labels || DEFAULT_STATUS_LABELS
  const current = labels.find((l) => l.id === value?.id)

  return (
    <div className="h-11">
      <button
        ref={triggerRef}
        disabled={!editable}
        onClick={() => editable && setOpen((v) => !v)}
        className="flex h-full w-full items-center justify-center px-2 text-[13px] font-medium text-white transition-[filter] hover:brightness-[1.04] disabled:cursor-default"
        style={{ background: current?.color || 'var(--color-surface-2)', color: current ? 'white' : 'var(--color-ink-muted)' }}
      >
        {current?.label || '—'}
      </button>
      <CellMenu open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={184}>
        {labels.map((l) => (
          <button
            key={l.id}
            onClick={() => {
              onChange({ id: l.id })
              setOpen(false)
            }}
            className="mb-1 flex w-full items-center justify-center rounded-md px-2 py-2 text-[13px] font-medium text-white transition-[filter] last:mb-0 hover:brightness-[1.05]"
            style={{ background: l.color, color: l.label ? 'white' : 'var(--color-ink)' }}
          >
            {l.label || 'ריק'}
          </button>
        ))}
      </CellMenu>
    </div>
  )
}

function TagsCell({ column, value, editable, onChange }) {
  return <MultiSelectCell defaultLabels={DEFAULT_TAG_LABELS} column={column} value={value} editable={editable} onChange={onChange} />
}

// תא רב-בחירה משותף (תגיות / dropdown) עם תפריט portal.
function MultiSelectCell({ defaultLabels, column, value, editable, onChange }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const labels = column.settings?.labels || defaultLabels
  const ids = value?.ids || []
  const selected = labels.filter((l) => ids.includes(l.id))

  function toggle(id) {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
    onChange(next.length ? { ids: next } : {})
  }

  return (
    <div className="h-11">
      <button
        ref={triggerRef}
        disabled={!editable}
        onClick={() => editable && setOpen((v) => !v)}
        className="flex h-full w-full flex-wrap items-center justify-center gap-1 px-2 disabled:cursor-default"
      >
        {selected.length === 0 ? (
          <span className="text-ink-muted/50">—</span>
        ) : (
          selected.map((l) => (
            <span
              key={l.id}
              className="rounded-md px-2.5 py-0.5 text-[12px] font-semibold"
              style={{ background: `${l.color}1E`, color: l.color }}
            >
              {l.label}
            </span>
          ))
        )}
      </button>
      <CellMenu open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={184}>
        {labels.map((l) => {
          const on = ids.includes(l.id)
          return (
            <button
              key={l.id}
              onClick={() => toggle(l.id)}
              className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] transition-colors last:mb-0 hover:bg-surface-2 ${on ? 'font-medium text-ink' : 'text-ink-soft'}`}
            >
              <span className="h-3 w-3 rounded-full" style={{ background: l.color }} />
              <span className="flex-1 text-right">{l.label}</span>
              {on && (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="text-brand-600">
                  <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )
        })}
      </CellMenu>
    </div>
  )
}

const nameOf = (m) => m.full_name || m.email || '?'

function PersonCell({ value, members, editable, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const triggerRef = useRef(null)
  const ids = getPersonIds(value)
  const current = ids.map((id) => members.find((m) => m.user_id === id)).filter(Boolean)
  const filtered = q.trim()
    ? members.filter((m) => nameOf(m).toLowerCase().includes(q.trim().toLowerCase()))
    : members

  function toggle(userId) {
    const next = ids.includes(userId) ? ids.filter((id) => id !== userId) : [...ids, userId]
    onChange(next.length ? { user_ids: next } : {})
  }

  return (
    <div className="flex h-11 items-center justify-center">
      <button
        ref={triggerRef}
        disabled={!editable}
        onClick={() => {
          if (editable) {
            setQ('')
            setOpen((v) => !v)
          }
        }}
        className="flex h-full w-full items-center justify-center gap-0.5 disabled:cursor-default"
        title={current.length ? current.map(nameOf).join(', ') : 'ללא אחראי'}
      >
        {current.length ? (
          <span className="flex items-center">
            {current.slice(0, 3).map((m, i) => (
              <span
                key={m.user_id}
                className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-bold text-white ring-2 ring-surface"
                style={{ marginInlineStart: i === 0 ? 0 : -8 }}
              >
                {nameOf(m).slice(0, 2).toUpperCase()}
              </span>
            ))}
            {current.length > 3 && (
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-2 text-[10px] font-bold text-ink-soft ring-2 ring-surface"
                style={{ marginInlineStart: -8 }}
              >
                +{current.length - 3}
              </span>
            )}
          </span>
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-line-strong text-ink-muted/50 transition-colors hover:border-brand-400 hover:text-brand-400">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </button>
      <CellMenu open={open} onClose={() => setOpen(false)} anchorRef={triggerRef} width={224}>
        {members.length > 6 && (
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש אחראי..."
            className="mb-1 w-full rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink ring-1 ring-line outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-brand-500"
          />
        )}
        {ids.length > 0 && (
          <button
            onClick={() => {
              onChange({})
              setOpen(false)
            }}
            className="mb-0.5 block w-full rounded-md px-2.5 py-2 text-right text-[13px] text-ink-muted transition-colors hover:bg-surface-2"
          >
            נקה הכל
          </button>
        )}
        {filtered.map((m) => {
          const on = ids.includes(m.user_id)
          return (
            <button
              key={m.user_id}
              onClick={() => toggle(m.user_id)}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-right text-[13px] transition-colors hover:bg-surface-2 ${on ? 'font-medium text-ink' : 'text-ink-soft'}`}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[10px] font-bold text-white">
                {nameOf(m).slice(0, 2).toUpperCase()}
              </span>
              <span className="flex-1 truncate">{nameOf(m)}</span>
              {on && (
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="shrink-0 text-brand-600">
                  <path d="M3.5 8.5l3 3 6-6.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )
        })}
        {filtered.length === 0 && <p className="px-2.5 py-2 text-[13px] text-ink-muted">לא נמצאו אנשים</p>}
      </CellMenu>
    </div>
  )
}

function DropdownCell({ column, value, editable, onChange }) {
  return <MultiSelectCell defaultLabels={DEFAULT_DROPDOWN_LABELS} column={column} value={value} editable={editable} onChange={onChange} />
}

function TimelineCell({ value, editable, onChange }) {
  const start = value?.start || ''
  const end = value?.end || ''

  function update(next) {
    const merged = { ...(value || {}), ...next }
    const clean = {}
    if (merged.start) clean.start = merged.start
    if (merged.end) clean.end = merged.end
    onChange(clean.start || clean.end ? clean : {})
  }

  const fmt = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '')
  const label = start || end ? `${fmt(start)} – ${fmt(end)}` : ''

  return (
    <div className="flex h-11 flex-col items-stretch justify-center gap-0.5 px-2 py-1">
      <div className="flex items-center gap-1">
        <input
          type="date"
          disabled={!editable}
          value={start}
          onChange={(e) => update({ start: e.target.value })}
          className="h-5 w-full min-w-0 bg-transparent text-center text-[11px] text-ink outline-none disabled:cursor-default"
        />
        <input
          type="date"
          disabled={!editable}
          value={end}
          onChange={(e) => update({ end: e.target.value })}
          className="h-5 w-full min-w-0 bg-transparent text-center text-[11px] text-ink outline-none disabled:cursor-default"
        />
      </div>
      {(start || end) && (
        <div className="flex flex-col items-stretch gap-0.5">
          <div className="h-1.5 rounded-full bg-brand-400" />
          <span className="text-center text-[10px] text-ink-soft" dir="ltr">{label}</span>
        </div>
      )}
    </div>
  )
}
