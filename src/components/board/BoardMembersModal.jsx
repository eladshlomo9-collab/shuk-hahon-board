import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { BOARD_ROLES } from '../../lib/constants'
import Modal from '../ui/Modal'
import Button from '../ui/Button'

// ניהול ההרשאות של בורד מסוים (מי רואה / עורך). זמין לבעלים בלבד.
export default function BoardMembersModal({ open, onClose, boardId }) {
  const { members: orgMembers, user } = useApp()
  const [boardMembers, setBoardMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [publicToken, setPublicToken] = useState(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('board_members')
      .select('id, user_id, role')
      .eq('board_id', boardId)
    setBoardMembers(data || [])
    const { data: b } = await supabase.from('boards').select('public_token').eq('id', boardId).single()
    setPublicToken(b?.public_token || null)
    setLoading(false)
  }

  const publicUrl = publicToken ? `${window.location.origin}/public/${publicToken}` : ''

  async function togglePublic() {
    const next = publicToken ? null : (crypto.randomUUID ? crypto.randomUUID() : 't' + Date.now())
    await supabase.from('boards').update({ public_token: next }).eq('id', boardId)
    setPublicToken(next)
  }

  function copyLink() {
    if (!publicUrl) return
    navigator.clipboard?.writeText(publicUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  useEffect(() => {
    if (open) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, boardId])

  const roleOf = (userId) => boardMembers.find((bm) => bm.user_id === userId)?.role || null

  async function setRole(userId, role) {
    if (role === 'none') {
      await supabase.from('board_members').delete().eq('board_id', boardId).eq('user_id', userId)
    } else {
      await supabase
        .from('board_members')
        .upsert({ board_id: boardId, user_id: userId, role }, { onConflict: 'board_id,user_id' })
    }
    load()
  }

  const nameOf = (m) => m.full_name || m.email || '?'

  return (
    <Modal open={open} onClose={onClose} title="שיתוף והרשאות לבורד" width="max-w-lg">
      {/* קישור ציבורי לצפייה (אורחים) */}
      <div className="mb-4 rounded-lg bg-surface-2 p-3 ring-1 ring-line">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">קישור ציבורי לצפייה</div>
            <div className="text-[12px] text-ink-muted">כל מי שיש לו את הקישור יוכל לצפות בבורד (לקריאה בלבד, ללא התחברות).</div>
          </div>
          <button
            onClick={togglePublic}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${publicToken ? 'bg-brand-500' : 'bg-line-strong'}`}
            title={publicToken ? 'כבה שיתוף' : 'הפעל שיתוף'}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${publicToken ? 'right-0.5' : 'right-[22px]'}`} />
          </button>
        </div>
        {publicToken && (
          <div className="mt-2.5 flex items-center gap-2">
            <input
              readOnly
              value={publicUrl}
              dir="ltr"
              onFocus={(e) => e.target.select()}
              className="h-9 flex-1 rounded-md bg-surface px-2.5 text-[12px] text-ink-soft ring-1 ring-line outline-none"
            />
            <Button size="sm" variant="secondary" onClick={copyLink}>
              {copied ? 'הועתק ✓' : 'העתק'}
            </Button>
          </div>
        )}
      </div>

      <p className="mb-4 text-sm leading-relaxed text-ink-muted">
        בחר מי מחברי הארגון יכול לגשת לבורד הזה ובאיזו רמה. מנהלי הארגון רואים את כל הבורדים
        אוטומטית.
      </p>
      {loading ? (
        <p className="py-6 text-center text-sm text-ink-muted">טוען...</p>
      ) : (
        <div className="max-h-80 space-y-1.5 overflow-y-auto pl-1">
          {orgMembers.filter((m) => !m.is_virtual).map((m) => {
            const current = roleOf(m.user_id)
            const isSelf = m.user_id === user?.id
            return (
              <div
                key={m.user_id}
                className="flex items-center gap-3 rounded-lg px-3 py-2 ring-1 ring-line"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-bold text-white">
                  {nameOf(m).slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">
                    {nameOf(m)} {isSelf && <span className="text-xs font-normal text-ink-muted">(אתה)</span>}
                  </div>
                  <div className="truncate text-xs text-ink-muted">{m.email}</div>
                </div>
                {m.role === 'admin' ? (
                  <span className="shrink-0 text-xs text-ink-muted">מנהל ארגון</span>
                ) : (
                  <select
                    value={current || 'none'}
                    onChange={(e) => setRole(m.user_id, e.target.value)}
                    className="h-9 shrink-0 rounded-md bg-surface px-2 text-[13px] text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
                  >
                    <option value="none">אין גישה</option>
                    {BOARD_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
          {orgMembers.length === 0 && (
            <p className="py-6 text-center text-sm text-ink-muted">
              אין חברים בארגון. הזמן משתמשים בעמוד "חברי הארגון".
            </p>
          )}
        </div>
      )}
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>סיום</Button>
      </div>
    </Modal>
  )
}
