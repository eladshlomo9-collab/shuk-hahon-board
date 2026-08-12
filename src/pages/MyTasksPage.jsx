import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { DEFAULT_STATUS_LABELS } from '../lib/constants'

export default function MyTasksPage() {
  const { user, currentOrgId } = useApp()
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      try {
        const { data: items, error: e1 } = await supabase.rpc('my_assigned_items')
        if (e1) throw e1
        const list = items || []
        if (list.length === 0) {
          if (active) setRows([])
          return
        }
        const boardIds = [...new Set(list.map((i) => i.board_id))]
        const itemIds = list.map((i) => i.id)

        const [{ data: boards }, { data: cols }, { data: cells }] = await Promise.all([
          supabase.from('boards').select('id, name').in('id', boardIds),
          supabase
            .from('columns')
            .select('id, board_id, type, settings')
            .in('board_id', boardIds)
            .in('type', ['status', 'date']),
          supabase.from('cell_values').select('item_id, column_id, value').in('item_id', itemIds),
        ])

        const boardName = Object.fromEntries((boards || []).map((b) => [b.id, b.name]))
        const colById = Object.fromEntries((cols || []).map((c) => [c.id, c]))
        const cellsByItem = {}
        for (const c of cells || []) {
          ;(cellsByItem[c.item_id] = cellsByItem[c.item_id] || []).push(c)
        }

        const enriched = list.map((it) => {
          let status = null
          let due = null
          for (const cell of cellsByItem[it.id] || []) {
            const col = colById[cell.column_id]
            if (!col) continue
            if (col.type === 'status' && cell.value?.id) {
              const labels = col.settings?.labels || DEFAULT_STATUS_LABELS
              status = labels.find((l) => l.id === cell.value.id) || null
            }
            if (col.type === 'date' && cell.value?.date) due = cell.value.date
          }
          return { ...it, boardName: boardName[it.board_id] || 'בורד', status, due }
        })

        enriched.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))
        if (active) setRows(enriched)
      } catch (err) {
        console.error(err)
        if (active) setError('לא הצלחנו לטעון את המשימות.')
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [user, currentOrgId])

  const firstName = (user?.user_metadata?.full_name || user?.email || '').split(' ')[0]

  return (
    <div className="mx-auto max-w-5xl px-8 py-9">
      <header className="mb-7">
        <h1 className="font-display text-[30px] leading-tight text-ink">
          המשימות שלי{firstName ? <span className="text-ink-soft">, {firstName}</span> : ''}
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          כל המשימות שמשויכות אליך, מכל הבורדים, מסודרות לפי תאריך יעד.
        </p>
      </header>

      {loading ? (
        <SkeletonTable />
      ) : error ? (
        <p className="rounded-lg bg-danger/8 px-4 py-3 text-sm text-danger">{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line shadow-xs">
          <table className="w-full text-right text-sm">
            <thead>
              <tr className="border-b border-line text-[12px] font-medium text-ink-muted">
                <th className="px-5 py-3 font-medium">משימה</th>
                <th className="px-5 py-3 font-medium">בורד</th>
                <th className="px-5 py-3 font-medium">סטטוס</th>
                <th className="px-5 py-3 font-medium">תאריך יעד</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  className={`group transition-colors hover:bg-surface-2 ${
                    i !== rows.length - 1 ? 'border-b border-line' : ''
                  }`}
                >
                  <td className="px-5 py-3.5 font-medium text-ink">{r.name || 'ללא שם'}</td>
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/board/${r.board_id}`}
                      className="inline-flex items-center gap-1.5 text-ink-soft transition-colors hover:text-brand-600"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
                      {r.boardName}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    {r.status?.label ? (
                      <StatusPill color={r.status.color} label={r.status.label} />
                    ) : (
                      <span className="text-ink-muted/50">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <DueDate value={r.due} isDone={isDoneLabel(r.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function StatusPill({ color, label }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium"
      style={{ background: `color-mix(in oklab, ${color} 16%, white)`, color: `color-mix(in oklab, ${color} 75%, black)` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
}

const isDoneLabel = (l) => l && (l.id === 'done' || (l.color || '').toLowerCase() === '#0e9e7c')

function DueDate({ value, isDone }) {
  if (!value) return <span className="text-ink-muted/50">—</span>
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(value)
  const overdue = d < today && !isDone
  const formatted = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <span className={overdue ? 'font-medium text-danger' : 'text-ink-soft'}>
      {formatted}
      {overdue && <span className="mr-1.5 text-[11px]">· באיחור</span>}
    </span>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl bg-surface px-8 py-16 text-center shadow-sm ring-1 ring-line">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
          <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h3 className="font-display text-xl text-ink">הכול נקי כרגע</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        אין משימות שמשויכות אליך. כשמישהו ישייך אליך משימה (עמודת "אנשים" בבורד) — היא תופיע כאן
        אוטומטית.
      </p>
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line">
      <div className="border-b border-line px-5 py-3">
        <div className="h-3 w-24 rounded bg-surface-2" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
          <div className="h-3.5 flex-1 rounded bg-surface-2 motion-safe:animate-pulse" />
          <div className="h-3.5 w-28 rounded bg-surface-2 motion-safe:animate-pulse" />
          <div className="h-6 w-20 rounded-full bg-surface-2 motion-safe:animate-pulse" />
          <div className="h-3.5 w-24 rounded bg-surface-2 motion-safe:animate-pulse" />
        </div>
      ))}
    </div>
  )
}
