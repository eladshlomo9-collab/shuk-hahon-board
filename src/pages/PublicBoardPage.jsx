import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  DEFAULT_STATUS_LABELS,
  DEFAULT_TAG_LABELS,
  DEFAULT_DROPDOWN_LABELS,
} from '../lib/constants'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { getPersonIds } from '../lib/personIds'

// עמוד בורד ציבורי לצפייה בלבד — ללא התחברות. נטען דרך RPC public_board לפי טוקן.
export default function PublicBoardPage() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      const { data: res, error } = await supabase.rpc('public_board', { p_token: token })
      if (!active) return
      setData(error ? null : res)
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <LoadingSpinner label="טוען בורד..." />
      </div>
    )
  }

  if (!data || !data.board) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 text-xl font-bold text-white shadow-md">
            ש
          </span>
          <p className="text-base font-medium text-ink">הקישור אינו תקף או שהשיתוף בוטל.</p>
        </div>
      </div>
    )
  }

  const { board, groups = [], columns = [], items = [], cells = [], members = [] } = data

  // מפת תאים לפי item_id:column_id
  const cellMap = {}
  for (const c of cells) cellMap[`${c.item_id}:${c.column_id}`] = c.value

  const sortedGroups = [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const sortedColumns = [...columns].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const itemsByGroup = {}
  for (const it of items) {
    ;(itemsByGroup[it.group_id] ||= []).push(it)
  }
  for (const gid in itemsByGroup) {
    itemsByGroup[gid].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }

  return (
    <div className="min-h-screen bg-canvas" dir="rtl">
      {/* סרגל עליון */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-base font-bold text-white shadow-sm">
            ש
          </span>
          <h1 className="font-display truncate text-lg font-bold text-ink">{board.name}</h1>
          <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium text-ink-soft">
            תצוגה לצפייה בלבד
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {sortedGroups.length === 0 ? (
          <p className="py-12 text-center text-sm text-ink-muted">אין תוכן להצגה.</p>
        ) : (
          sortedGroups.map((group) => (
            <GroupTable
              key={group.id}
              group={group}
              columns={sortedColumns}
              items={itemsByGroup[group.id] || []}
              cellMap={cellMap}
              members={members}
            />
          ))
        )}

        <footer className="mt-10 pb-6 text-center text-xs text-ink-muted">
          נוצר עם בורד פעילות AI
        </footer>
      </main>
    </div>
  )
}

function GroupTable({ group, columns, items, cellMap, members }) {
  const color = group.color || '#0E9E7C'
  return (
    <section className="mb-8">
      {/* פס קבוצה צבעוני */}
      <div className="mb-2 flex items-center gap-2">
        <span className="h-5 w-1.5 rounded-full" style={{ background: color }} />
        <h2 className="text-sm font-bold" style={{ color }}>
          {group.name}
        </h2>
        <span className="text-xs text-ink-muted">{items.length}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line bg-surface shadow-xs">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-surface-2/60">
              <th className="sticky right-0 z-10 min-w-[200px] bg-surface-2/60 px-3 py-2.5 text-right text-[13px] font-semibold text-ink-soft">
                פריט
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="min-w-[120px] border-r border-line px-3 py-2.5 text-center text-[13px] font-semibold text-ink-soft"
                >
                  {col.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-6 text-center text-sm text-ink-muted"
                >
                  אין פריטים בקבוצה זו
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-line last:border-b-0 hover:bg-canvas/60">
                  <td className="sticky right-0 z-10 min-w-[200px] border-l-2 bg-surface px-3 py-0 text-right" style={{ borderRightColor: color, borderRightWidth: 3 }}>
                    <span className="block truncate py-2.5 text-[13px] font-medium text-ink" title={item.name}>
                      {item.name}
                    </span>
                  </td>
                  {columns.map((col) => (
                    <td key={col.id} className="border-r border-line p-0 align-middle">
                      <ReadOnlyCell
                        column={col}
                        value={cellMap[`${item.id}:${col.id}`]}
                        members={members}
                      />
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ReadOnlyCell({ column, value, members }) {
  switch (column.type) {
    case 'status':
      return <StatusView column={column} value={value} />
    case 'dropdown':
      return <ChipsView labels={column.settings?.labels || DEFAULT_DROPDOWN_LABELS} value={value} />
    case 'tags':
      return <ChipsView labels={column.settings?.labels || DEFAULT_TAG_LABELS} value={value} />
    case 'person':
      return <PersonView value={value} members={members} />
    case 'date':
      return <DateView value={value} />
    case 'timeline':
      return <TimelineView value={value} />
    case 'number':
      return <NumberView value={value} />
    case 'checkbox':
      return <CheckboxView value={value} />
    case 'phone':
      return <LinkView value={value} scheme="tel:" />
    case 'email':
      return <LinkView value={value} scheme="mailto:" />
    case 'link':
      return <LinkView value={value} scheme="" />
    case 'formula':
      return <Empty />
    default:
      return <TextView value={value} />
  }
}

function Empty() {
  return <div className="flex h-11 items-center justify-center text-ink-muted/40">—</div>
}

function StatusView({ column, value }) {
  const labels = column.settings?.labels || DEFAULT_STATUS_LABELS
  const current = labels.find((l) => l.id === value?.id)
  if (!current) {
    return (
      <div className="flex h-11 items-center justify-center text-[13px] text-ink-muted/50">—</div>
    )
  }
  return (
    <div
      className="flex h-11 items-center justify-center px-2 text-center text-[13px] font-medium text-white"
      style={{ background: current.color }}
    >
      {current.label}
    </div>
  )
}

function ChipsView({ labels, value }) {
  const ids = value?.ids || []
  const selected = labels.filter((l) => ids.includes(l.id))
  if (selected.length === 0) {
    return <div className="flex h-11 items-center justify-center text-ink-muted/40">—</div>
  }
  return (
    <div className="flex h-11 flex-wrap items-center justify-center gap-1 px-2 py-1.5">
      {selected.map((l) => (
        <span
          key={l.id}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
          style={{ background: l.color }}
        >
          {l.label}
        </span>
      ))}
    </div>
  )
}

function PersonView({ value, members }) {
  const current = getPersonIds(value).map((uid) => members.find((m) => m.user_id === uid)).filter(Boolean)
  if (!current.length) {
    return <div className="flex h-11 items-center justify-center text-ink-muted/40">—</div>
  }
  const nameOf = (m) => m.full_name || m.email || '?'
  return (
    <div className="flex h-11 items-center justify-center">
      <span className="flex items-center">
        {current.slice(0, 3).map((m, i) => (
          <span
            key={m.user_id}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-bold text-white ring-2 ring-surface"
            style={{ marginInlineStart: i === 0 ? 0 : -8 }}
            title={nameOf(m)}
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
    </div>
  )
}

function DateView({ value }) {
  if (!value?.date) {
    return <div className="flex h-11 items-center justify-center text-ink-muted/40">—</div>
  }
  return (
    <div className="flex h-11 items-center justify-center text-[13px] text-ink-soft">
      {new Date(value.date).toLocaleDateString('he-IL')}
    </div>
  )
}

function TimelineView({ value }) {
  const start = value?.start
  const end = value?.end
  if (!start && !end) {
    return <div className="flex h-11 items-center justify-center text-ink-muted/40">—</div>
  }
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('he-IL') : '')
  return (
    <div className="flex h-11 items-center justify-center px-2 text-[12px] text-ink-soft" dir="ltr">
      {fmt(start)} – {fmt(end)}
    </div>
  )
}

function NumberView({ value }) {
  const n = value?.number
  if (n === undefined || n === null || n === '') {
    return <div className="flex h-11 items-center justify-center text-ink-muted/40">—</div>
  }
  return (
    <div className="flex h-11 items-center justify-center text-[13px] tabular-nums text-ink">{n}</div>
  )
}

function CheckboxView({ value }) {
  const checked = !!value?.checked
  return (
    <div className="flex h-11 items-center justify-center">
      {checked ? (
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-brand-500 text-white">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
            <path
              d="M3.5 8.5l3 3 6-6.5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <span className="h-5 w-5 rounded-md border border-line-strong bg-surface" />
      )}
    </div>
  )
}

function TextView({ value }) {
  const text = value?.text
  if (!text) {
    return <div className="flex h-11 items-center justify-center text-ink-muted/40">—</div>
  }
  return (
    <div className="flex h-11 items-center justify-center px-3 text-center text-[13px] text-ink">
      <span className="truncate" title={text}>
        {text}
      </span>
    </div>
  )
}

function LinkView({ value, scheme }) {
  const text = value?.text
  if (!text) {
    return <div className="flex h-11 items-center justify-center text-ink-muted/40">—</div>
  }
  const href = scheme ? scheme + text : /^https?:\/\//i.test(text) ? text : 'https://' + text
  return (
    <div className="flex h-11 items-center justify-center px-3">
      <a
        href={href}
        target={scheme ? undefined : '_blank'}
        rel="noreferrer"
        dir="ltr"
        className="truncate text-[13px] text-brand-600 underline-offset-2 hover:underline"
        title={text}
      >
        {text}
      </a>
    </div>
  )
}
