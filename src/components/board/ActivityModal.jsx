import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Modal from '../ui/Modal'

export default function ActivityModal({ open, onClose, boardId }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!open) return
    let active = true
    ;(async () => {
      setLoading(true)
      setMissing(false)
      const { data, error } = await supabase
        .from('activity')
        .select('*')
        .eq('board_id', boardId)
        .order('created_at', { ascending: false })
        .limit(60)
      if (!active) return
      if (error) setMissing(true)
      else setRows(data || [])
      setLoading(false)
    })()
    return () => {
      active = false
    }
  }, [open, boardId])

  return (
    <Modal open={open} onClose={onClose} title="יומן פעילות" width="max-w-lg">
      {loading ? (
        <p className="py-6 text-center text-sm text-ink-muted">טוען...</p>
      ) : missing ? (
        <p className="rounded-md bg-warning/10 px-3 py-3 text-sm text-ink-soft">
          יומן הפעילות עדיין לא הופעל. הרץ את קובץ ה-SQL <code>db/activity-notifications.sql</code> ב-Supabase.
        </p>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">אין עדיין פעילות בבורד הזה.</p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[10px] font-bold text-white">
                {(r.user_name || '?').slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink">
                  <span className="font-medium">{r.user_name || 'משתמש'}</span> {r.detail}
                </div>
                <div className="text-[11.5px] text-ink-muted">{timeAgo(r.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function timeAgo(ts) {
  const d = new Date(ts)
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'הרגע'
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`
  if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שע׳`
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
