import { useState, useEffect, useCallback, useRef } from 'react'
import Cell from './Cell'
import Button from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { logActivity } from '../../lib/activity'

// מגירה נשלפת המציגה את כל פרטי הפריט: שם, תאים, תיאור ודיון.
export default function ItemPanel({
  item,
  columns,
  cells,
  members,
  editable,
  subitems = [],
  boardItems = [],
  onAddSubitem,
  onDeleteSubitem,
  onClose,
  onSaveCell,
  onUpdateName,
  onUpdateDesc,
}) {
  const statusCol = columns.find((c) => c.type === 'status')
  const personCol = columns.find((c) => c.type === 'person')
  const { user } = useApp()
  const [name, setName] = useState(item.name || '')
  const [desc, setDesc] = useState(item.description || '')

  // סנכרון מצב מקומי כשמתחלפים פריטים
  useEffect(() => setName(item.name || ''), [item.id, item.name])
  useEffect(() => setDesc(item.description || ''), [item.id, item.description])

  // Esc לסגירה
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function commitName() {
    const next = name.trim()
    if (next && next !== item.name) onUpdateName(item.id, next)
  }

  function commitDesc() {
    if (desc !== (item.description || '')) onUpdateDesc(item.id, desc)
  }

  return (
    <div
      className="fixed inset-0 z-[50] flex justify-start bg-black/50 motion-safe:animate-[panelFade_.15s_ease-out]"
      onClick={onClose}
    >
      <aside
        className="flex h-full w-full max-w-[480px] flex-col overflow-hidden rounded-l-xl bg-surface shadow-lg ring-1 ring-line motion-safe:animate-[panelIn_.22s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* כותרת */}
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <input
            value={name}
            disabled={!editable}
            onChange={(e) => setName(e.target.value)}
            onFocus={(e) => e.target.select()}
            onBlur={commitName}
            placeholder="שם הפריט"
            className="min-w-0 flex-1 bg-transparent text-lg font-semibold text-ink outline-none placeholder:text-ink-muted focus:outline-none disabled:cursor-default"
          />
          <button
            onClick={onClose}
            className="-m-1 shrink-0 rounded-md p-1.5 text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink cursor-pointer"
            aria-label="סגור"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* גוף נגלל */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* פרטים */}
          <Section title="פרטים">
            <div className="space-y-2.5">
              {columns.map((col) => (
                <div key={col.id} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-[13px] text-ink-soft">{col.name}</span>
                  <div className="min-w-0 flex-1 overflow-hidden rounded-md bg-surface-2 ring-1 ring-line">
                    <Cell
                      column={col}
                      value={cells[`${item.id}:${col.id}`]}
                      members={members}
                      editable={editable}
                      onChange={(v) => onSaveCell(item.id, col.id, v)}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* תיאור */}
          <Section title="תיאור">
            <textarea
              value={desc}
              disabled={!editable}
              onChange={(e) => setDesc(e.target.value)}
              onBlur={commitDesc}
              placeholder="הוסף תיאור..."
              rows={4}
              className="w-full resize-y rounded-md bg-surface-2 px-3 py-2.5 text-sm text-ink ring-1 ring-line outline-none transition-[box-shadow] duration-150 placeholder:text-ink-muted hover:ring-line-strong focus:ring-2 focus:ring-brand-500 disabled:cursor-default disabled:opacity-70"
            />
          </Section>

          {/* תת-משימות */}
          <Section title={`תת-משימות${subitems.length ? ` (${subitems.length})` : ''}`}>
            <div className="space-y-1.5">
              {subitems.map((sub) => (
                <div key={sub.id} className="flex items-center gap-2 rounded-md bg-surface-2 px-2 py-1.5 ring-1 ring-line">
                  <SubName sub={sub} editable={editable} onSave={(n) => onUpdateName(sub.id, n)} />
                  {statusCol && (
                    <div className="w-24 shrink-0 overflow-hidden rounded">
                      <Cell column={statusCol} value={cells[`${sub.id}:${statusCol.id}`]} members={members} editable={editable} onChange={(v) => onSaveCell(sub.id, statusCol.id, v)} />
                    </div>
                  )}
                  {personCol && (
                    <div className="shrink-0">
                      <Cell column={personCol} value={cells[`${sub.id}:${personCol.id}`]} members={members} editable={editable} onChange={(v) => onSaveCell(sub.id, personCol.id, v)} />
                    </div>
                  )}
                  {editable && (
                    <button
                      onClick={() => onDeleteSubitem(sub)}
                      className="shrink-0 rounded p-1 text-ink-muted transition-colors hover:text-danger cursor-pointer"
                      aria-label="מחק תת-משימה"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
              {subitems.length === 0 && <p className="text-[13px] text-ink-muted">אין עדיין תת-משימות.</p>}
              {editable && (
                <button
                  onClick={onAddSubitem}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-brand-600 cursor-pointer"
                >
                  <span className="text-base leading-none">+</span> הוספת תת-משימה
                </button>
              )}
            </div>
          </Section>

          {/* קבצים */}
          <Section title="קבצים">
            <Files item={item} user={user} editable={editable} />
          </Section>

          {/* תלויות */}
          <Section title="תלויות">
            <Dependencies item={item} boardItems={boardItems} editable={editable} />
          </Section>

          {/* מעקב זמן */}
          <Section title="מעקב זמן">
            <TimeTracking item={item} user={user} editable={editable} />
          </Section>

          {/* דיון */}
          <Section title="דיון">
            <Discussion item={item} user={user} editable={editable} />
          </Section>
        </div>
      </aside>

      <style>{`
        @keyframes panelFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes panelIn { from { transform: translateX(-24px); opacity: 0 } to { transform: none; opacity: 1 } }
      `}</style>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="mb-6 last:mb-0">
      <h3 className="mb-2.5 text-[13px] font-semibold text-ink-soft">{title}</h3>
      {children}
    </section>
  )
}

function Discussion({ item, user, editable }) {
  const [comments, setComments] = useState([])
  const [unavailable, setUnavailable] = useState(false)
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const inputRef = useRef(null)

  const fetchComments = useCallback(async () => {
    const { data, error } = await supabase
      .from('item_updates')
      .select('*')
      .eq('item_id', item.id)
      .order('created_at', { ascending: true })
    if (error) {
      setUnavailable(true)
      return
    }
    setUnavailable(false)
    setComments(data || [])
  }, [item.id])

  useEffect(() => {
    fetchComments()
  }, [fetchComments])

  async function send() {
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'משתמש'
    const { error } = await supabase.from('item_updates').insert({
      item_id: item.id,
      board_id: item.board_id,
      user_id: user?.id || null,
      user_name: userName,
      body: text,
    })
    setSending(false)
    if (error) {
      setUnavailable(true)
      return
    }
    setBody('')
    fetchComments()
    // יומן פעילות — שגר ושכח
    logActivity(item.board_id, 'comment', `הגיב/ה על "${item.name}"`, user)
  }

  async function remove(id) {
    const { error } = await supabase.from('item_updates').delete().eq('id', id)
    if (!error) fetchComments()
  }

  if (unavailable) {
    return (
      <p className="rounded-md bg-surface-2 px-3 py-2.5 text-[13px] text-ink-muted ring-1 ring-line">
        הדיון יופעל אחרי הרצת db/pro-upgrade.sql
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="text-[13px] text-ink-muted">עדיין אין תגובות. פתח/י את הדיון.</p>
      ) : (
        <ul className="space-y-3.5">
          {comments.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-bold text-white">
                {initials(c.user_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{c.user_name || 'משתמש'}</span>
                  <span className="shrink-0 text-[11px] text-ink-muted">{timeAgo(c.created_at)}</span>
                  {c.user_id && user?.id === c.user_id && (
                    <button
                      onClick={() => remove(c.id)}
                      className="ml-auto shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:text-danger cursor-pointer"
                      aria-label="מחק תגובה"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">{c.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="space-y-2">
          <textarea
            ref={inputRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="כתוב/י תגובה..."
            rows={2}
            className="w-full resize-y rounded-md bg-surface-2 px-3 py-2.5 text-sm text-ink ring-1 ring-line outline-none transition-[box-shadow] duration-150 placeholder:text-ink-muted hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex justify-start">
            <Button size="sm" onClick={send} disabled={!body.trim() || sending}>
              {sending ? 'שולח…' : 'שלח'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function SubName({ sub, editable, onSave }) {
  const [n, setN] = useState(sub.name || '')
  useEffect(() => setN(sub.name || ''), [sub.id, sub.name])
  return (
    <input
      value={n}
      disabled={!editable}
      onChange={(e) => setN(e.target.value)}
      onBlur={() => n.trim() && n !== sub.name && onSave(n.trim())}
      className="min-w-0 flex-1 bg-transparent px-1 text-[13px] text-ink outline-none disabled:cursor-default"
    />
  )
}

// הודעת רמז כשטבלה/באקט חסרים
function ProHint() {
  return (
    <p className="rounded-md bg-surface-2 px-3 py-2.5 text-[13px] text-ink-muted ring-1 ring-line">
      יופעל אחרי הרצת db/monday-pro.sql
    </p>
  )
}

// ---- קבצים ----
function Files({ item, user, editable }) {
  const [files, setFiles] = useState([])
  const [unavailable, setUnavailable] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('item_files')
        .select('*')
        .eq('item_id', item.id)
        .order('created_at', { ascending: true })
      if (error) {
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      setFiles(data || [])
    } catch {
      setUnavailable(true)
    }
  }, [item.id])

  useEffect(() => {
    load()
  }, [load])

  async function onPick(e) {
    const picked = Array.from(e.target.files || [])
    if (!picked.length) return
    setUploading(true)
    const userName = user?.user_metadata?.full_name || user?.email || 'משתמש'
    try {
      for (const file of picked) {
        const path = `${item.board_id}/${item.id}/${Date.now()}-${file.name}`
        const { error: upErr } = await supabase.storage.from('attachments').upload(path, file)
        if (upErr) {
          setUnavailable(true)
          continue
        }
        const { error: insErr } = await supabase.from('item_files').insert({
          item_id: item.id,
          board_id: item.board_id,
          name: file.name,
          path,
          size: file.size,
          mime: file.type,
          user_id: user?.id || null,
          user_name: userName,
        })
        if (insErr) setUnavailable(true)
      }
    } catch {
      setUnavailable(true)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
    load()
  }

  function publicUrl(path) {
    try {
      return supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
    } catch {
      return '#'
    }
  }

  async function remove(f) {
    try {
      await supabase.storage.from('attachments').remove([f.path])
      await supabase.from('item_files').delete().eq('id', f.id)
    } catch {
      /* ignore */
    }
    load()
  }

  if (unavailable) return <ProHint />

  return (
    <div className="space-y-2">
      {files.length === 0 ? (
        <p className="text-[13px] text-ink-muted">אין עדיין קבצים.</p>
      ) : (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 ring-1 ring-line">
              <a
                href={publicUrl(f.path)}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-[13px] font-medium text-brand-600 hover:underline"
              >
                {f.name}
              </a>
              <span className="shrink-0 text-[11px] text-ink-muted">{humanSize(f.size)}</span>
              {(editable || (f.user_id && user?.id === f.user_id)) && (
                <button
                  onClick={() => remove(f)}
                  className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:text-danger cursor-pointer"
                  aria-label="מחק קובץ"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div>
          <input ref={fileRef} type="file" multiple onChange={onPick} className="hidden" />
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'מעלה…' : 'העלאת קובץ'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ---- תלויות ----
function Dependencies({ item, boardItems, editable }) {
  const [deps, setDeps] = useState([])
  const [unavailable, setUnavailable] = useState(false)
  const [selected, setSelected] = useState('')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('item_dependencies')
        .select('*')
        .eq('item_id', item.id)
        .order('created_at', { ascending: true })
      if (error) {
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      setDeps(data || [])
    } catch {
      setUnavailable(true)
    }
  }, [item.id])

  useEffect(() => {
    load()
  }, [load])

  function nameOf(id) {
    const found = boardItems.find((b) => String(b.id) === String(id))
    return found?.name || 'פריט'
  }

  const takenIds = new Set(deps.map((d) => String(d.depends_on_id)))
  const options = boardItems.filter((b) => String(b.id) !== String(item.id) && !takenIds.has(String(b.id)))

  async function add() {
    if (!selected || adding) return
    setAdding(true)
    try {
      const { error } = await supabase.from('item_dependencies').insert({
        item_id: item.id,
        depends_on_id: selected,
        board_id: item.board_id,
      })
      if (error) setUnavailable(true)
    } catch {
      setUnavailable(true)
    }
    setAdding(false)
    setSelected('')
    load()
  }

  async function remove(id) {
    try {
      await supabase.from('item_dependencies').delete().eq('id', id)
    } catch {
      /* ignore */
    }
    load()
  }

  if (unavailable) return <ProHint />

  return (
    <div className="space-y-2">
      {deps.length === 0 ? (
        <p className="text-[13px] text-ink-muted">אין תלויות.</p>
      ) : (
        <ul className="space-y-1.5">
          {deps.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 ring-1 ring-line">
              <span className="min-w-0 flex-1 truncate text-[13px] text-ink-soft">
                תלוי ב: <span className="font-medium text-ink">{nameOf(d.depends_on_id)}</span>
              </span>
              {editable && (
                <button
                  onClick={() => remove(d.id)}
                  className="shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:text-danger cursor-pointer"
                  aria-label="הסר תלות"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {editable && options.length > 0 && (
        <div className="flex items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="min-w-0 flex-1 rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink ring-1 ring-line outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">בחר/י פריט…</option>
            {options.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="secondary" onClick={add} disabled={!selected || adding}>
            הוסף
          </Button>
        </div>
      )}
    </div>
  )
}

// ---- מעקב זמן ----
function TimeTracking({ item, user, editable }) {
  const [entries, setEntries] = useState([])
  const [unavailable, setUnavailable] = useState(false)
  const [note, setNote] = useState('')
  const [minutes, setMinutes] = useState('')
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('time_entries')
        .select('*')
        .eq('item_id', item.id)
        .order('created_at', { ascending: true })
      if (error) {
        setUnavailable(true)
        return
      }
      setUnavailable(false)
      setEntries(data || [])
    } catch {
      setUnavailable(true)
    }
  }, [item.id])

  useEffect(() => {
    load()
  }, [load])

  // טיימר חי
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [running])

  const total = entries.reduce((sum, e) => sum + (e.seconds || 0), 0)

  async function insertEntry(seconds, noteText) {
    if (!seconds || seconds <= 0) return
    const userName = user?.user_metadata?.full_name || user?.email || 'משתמש'
    try {
      const { error } = await supabase.from('time_entries').insert({
        item_id: item.id,
        board_id: item.board_id,
        user_id: user?.id || null,
        user_name: userName,
        seconds,
        note: noteText || null,
      })
      if (error) setUnavailable(true)
    } catch {
      setUnavailable(true)
    }
    load()
  }

  function startTimer() {
    startRef.current = Date.now()
    setElapsed(0)
    setRunning(true)
  }

  async function stopTimer() {
    const secs = Math.floor((Date.now() - startRef.current) / 1000)
    setRunning(false)
    setElapsed(0)
    await insertEntry(secs, note.trim())
    setNote('')
  }

  async function addManual() {
    const m = parseFloat(minutes)
    if (!m || m <= 0) return
    await insertEntry(Math.round(m * 60), note.trim())
    setMinutes('')
    setNote('')
  }

  async function remove(id) {
    try {
      await supabase.from('time_entries').delete().eq('id', id)
    } catch {
      /* ignore */
    }
    load()
  }

  if (unavailable) return <ProHint />

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] font-semibold text-ink">סה״כ: {formatDuration(total)}</span>
        {running && <span className="font-mono text-[13px] tabular-nums text-brand-600">{mmss(elapsed)}</span>}
      </div>

      {entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 ring-1 ring-line">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[10px] font-bold text-white">
                {initials(e.user_name)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[13px] font-medium text-ink">{e.user_name || 'משתמש'}</span>
                  <span className="shrink-0 text-[12px] text-ink-soft">{formatDuration(e.seconds)}</span>
                  <span className="shrink-0 text-[11px] text-ink-muted">{timeAgo(e.created_at)}</span>
                  {e.user_id && user?.id === e.user_id && (
                    <button
                      onClick={() => remove(e.id)}
                      className="ml-auto shrink-0 rounded p-0.5 text-ink-muted transition-colors hover:text-danger cursor-pointer"
                      aria-label="מחק רשומת זמן"
                    >
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </button>
                  )}
                </div>
                {e.note && <p className="mt-0.5 truncate text-[12px] text-ink-soft">{e.note}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      {editable && (
        <div className="space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="הערה (לא חובה)…"
            className="w-full rounded-md bg-surface-2 px-3 py-2 text-[13px] text-ink ring-1 ring-line outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-brand-500"
          />
          <div className="flex flex-wrap items-center gap-2">
            {!running ? (
              <Button size="sm" onClick={startTimer}>
                התחל
              </Button>
            ) : (
              <Button size="sm" variant="danger" onClick={stopTimer}>
                עצור
              </Button>
            )}
            <input
              type="number"
              min="0"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="דק׳"
              className="w-20 rounded-md bg-surface-2 px-2.5 py-1.5 text-[13px] text-ink ring-1 ring-line outline-none placeholder:text-ink-muted focus:ring-2 focus:ring-brand-500"
            />
            <Button size="sm" variant="secondary" onClick={addManual} disabled={!minutes}>
              הוסף
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function humanSize(bytes) {
  const b = Number(bytes) || 0
  if (b < 1024) return `${b} ב׳`
  const kb = b / 1024
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`
  return `${(kb / 1024).toFixed(1)} MB`
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${s}s`
}

function mmss(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

function initials(name) {
  return (name || '?').trim().slice(0, 2).toUpperCase()
}

// זמן יחסי בעברית
function timeAgo(ts) {
  if (!ts) return ''
  const then = new Date(ts).getTime()
  const diff = Date.now() - then
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'הרגע'
  if (min < 60) return `לפני ${min} דק׳`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `לפני ${hr} שע׳`
  return new Date(ts).toLocaleDateString('he-IL')
}
