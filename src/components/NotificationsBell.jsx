import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { DEFAULT_STATUS_LABELS } from '../lib/constants'

const isDoneLabel = (l) => l && (l.id === 'done' || (l.color || '').toLowerCase() === '#0e9e7c')

export default function NotificationsBell() {
  const { user, currentOrgId } = useApp()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState([]) // נשמרות ב-DB
  const [due, setDue] = useState([]) // התראות תאריך-יעד (מחושבות חי)
  const ref = useRef(null)

  // התראות שנשמרו (שיוך משימה וכו')
  const loadNotifs = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30)
    if (!error) setNotifs(data || [])
  }, [user])

  // התראות תאריך-יעד: על סמך המשימות המשויכות לי
  const loadDue = useCallback(async () => {
    if (!user) return
    try {
      const { data: items } = await supabase.rpc('my_assigned_items')
      const list = items || []
      if (!list.length) return setDue([])
      const boardIds = [...new Set(list.map((i) => i.board_id))]
      const itemIds = list.map((i) => i.id)
      const { data: cols } = await supabase.from('columns').select('id, type, settings').in('board_id', boardIds).in('type', ['date', 'status'])
      const dateColIds = cols.filter((c) => c.type === 'date').map((c) => c.id)
      const statusCols = cols.filter((c) => c.type === 'status')
      const statusColIds = statusCols.map((c) => c.id)
      const statusColById = Object.fromEntries(statusCols.map((c) => [c.id, c]))
      if (!dateColIds.length) return setDue([])
      const { data: cv } = await supabase.from('cell_values').select('item_id, column_id, value').in('item_id', itemIds).in('column_id', [...dateColIds, ...statusColIds])
      const dateByItem = {}
      const doneByItem = {}
      for (const c of cv || []) {
        if (c.value?.date && !dateByItem[c.item_id]) dateByItem[c.item_id] = c.value.date
        if (c.value?.id && statusColById[c.column_id]) {
          const labels = statusColById[c.column_id].settings?.labels || DEFAULT_STATUS_LABELS
          if (isDoneLabel(labels.find((l) => l.id === c.value.id))) doneByItem[c.item_id] = true
        }
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const alerts = []
      for (const it of list) {
        if (doneByItem[it.id]) continue
        const d = dateByItem[it.id]
        if (!d) continue
        const dt = new Date(d)
        const days = Math.round((dt - today) / 86400000)
        const fmt = dt.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
        if (days < 0) alerts.push({ id: 'due-' + it.id, board_id: it.board_id, severity: 'overdue', sort: days, message: `⏰ "${it.name || 'משימה'}" באיחור (${fmt})` })
        else if (days === 0) alerts.push({ id: 'due-' + it.id, board_id: it.board_id, severity: 'today', sort: 0, message: `📅 "${it.name || 'משימה'}" מסתיימת היום` })
        else if (days <= 3) alerts.push({ id: 'due-' + it.id, board_id: it.board_id, severity: 'soon', sort: days, message: `🕒 "${it.name || 'משימה'}" עד ${fmt}` })
      }
      alerts.sort((a, b) => a.sort - b.sort)
      setDue(alerts)
    } catch {
      setDue([])
    }
  }, [user])

  useEffect(() => {
    loadNotifs()
    loadDue()
    const t = setInterval(() => {
      loadNotifs()
      loadDue()
    }, 60000)
    return () => clearInterval(t)
  }, [loadNotifs, loadDue, currentOrgId])

  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const dueUrgent = due.filter((d) => d.severity !== 'soon').length
  const unread = notifs.filter((n) => !n.read).length + dueUrgent
  const merged = [...due, ...notifs]

  async function openPanel() {
    setOpen((v) => !v)
    if (!open) {
      const ids = notifs.filter((n) => !n.read).map((n) => n.id)
      if (ids.length) {
        setNotifs((list) => list.map((n) => ({ ...n, read: true })))
        await supabase.from('notifications').update({ read: true }).in('id', ids)
      }
    }
  }

  function go(n) {
    setOpen(false)
    if (n.board_id) navigate(`/board/${n.board_id}`)
  }

  const dot = (n) =>
    n.severity === 'overdue'
      ? 'var(--color-danger)'
      : n.severity === 'today'
        ? 'var(--color-warning)'
        : n.severity === 'soon'
          ? 'var(--color-ink-muted)'
          : n.read
            ? 'transparent'
            : 'var(--color-brand-500)'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={openPanel}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-sidebar-muted transition-colors hover:bg-sidebar-2 hover:text-sidebar-ink cursor-pointer"
        title="התראות"
      >
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
          <path d="M10 3a4.5 4.5 0 00-4.5 4.5c0 3-1.2 4.2-1.7 4.7-.2.2-.05.55.23.55h11.94c.28 0 .43-.35.23-.55-.5-.5-1.7-1.7-1.7-4.7A4.5 4.5 0 0010 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M8.5 15.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[20] mt-1 w-72 overflow-hidden rounded-lg bg-surface shadow-lg ring-1 ring-line">
          <div className="border-b border-line px-3 py-2 text-[13px] font-semibold text-ink">התראות</div>
          <div className="max-h-80 overflow-y-auto">
            {merged.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-ink-muted">אין התראות.</p>
            ) : (
              merged.map((n) => (
                <button
                  key={n.id}
                  onClick={() => go(n)}
                  className="flex w-full items-start gap-2.5 border-b border-line px-3 py-2.5 text-right transition-colors last:border-0 hover:bg-surface-2"
                >
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: dot(n) }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-snug text-ink">{n.message}</span>
                    {n.created_at && <span className="block text-[11px] text-ink-muted">{timeAgo(n.created_at)}</span>}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function timeAgo(ts) {
  const d = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'הרגע'
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })
}
