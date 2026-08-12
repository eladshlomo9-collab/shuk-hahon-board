import { useEffect, useState, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { GROUP_COLORS, BOARD_TEMPLATES, DEFAULT_STATUS_LABELS, DEFAULT_TAG_LABELS } from '../lib/constants'
import Modal from './ui/Modal'
import Input from './ui/Input'
import Button from './ui/Button'
import ConfirmDialog from './ui/ConfirmDialog'
import NotificationsBell from './NotificationsBell'

export default function Sidebar({ onMobileClose }) {
  const { currentOrgId, refreshKey, bump, orgs, currentOrg, setCurrentOrgId, user, isTeamLead, leadTeamIds, isAiOverseer } = useApp()
  const { toast } = useToast()
  const navigate = useNavigate()
  const isAdmin = currentOrg?.role === 'admin'
  const [workspaces, setWorkspaces] = useState([])
  const [boardsByWs, setBoardsByWs] = useState({})
  const [teams, setTeams] = useState([])
  const [expanded, setExpanded] = useState({})
  const [wsModal, setWsModal] = useState(false)
  const [wsName, setWsName] = useState('')
  const [wsTeamId, setWsTeamId] = useState('')
  const [boardModal, setBoardModal] = useState(null)
  const [boardName, setBoardName] = useState('')
  const [boardTemplate, setBoardTemplate] = useState('tasks')
  const [saving, setSaving] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null) // { type:'workspace'|'board', id, name }
  const [renameValue, setRenameValue] = useState('')
  const [confirmDel, setConfirmDel] = useState(null) // { message, onConfirm }
  const [teamAssignTarget, setTeamAssignTarget] = useState(null) // workspace object
  const [teamAssignValue, setTeamAssignValue] = useState('')
  const [dragBoard, setDragBoard] = useState(null) // { id, fromWs }
  const [dragOverWs, setDragOverWs] = useState(null)

  async function load() {
    if (!currentOrgId) {
      setWorkspaces([])
      setBoardsByWs({})
      return
    }
    const { data: ws } = await supabase
      .from('workspaces')
      .select('*')
      .eq('org_id', currentOrgId)
      .order('position')
      .order('created_at')
    setWorkspaces(ws || [])

    const wsIds = (ws || []).map((w) => w.id)
    if (wsIds.length) {
      const { data: boards } = await supabase
        .from('boards')
        .select('*')
        .in('workspace_id', wsIds)
        .order('position')
        .order('created_at')
      const grouped = {}
      for (const b of boards || []) {
        ;(grouped[b.workspace_id] = grouped[b.workspace_id] || []).push(b)
      }
      setBoardsByWs(grouped)
      setExpanded((prev) => {
        const next = { ...prev }
        for (const id of wsIds) if (next[id] === undefined) next[id] = true
        return next
      })
    } else {
      setBoardsByWs({})
    }

    const { data: tms } = await supabase.from('teams').select('id, name, color').eq('org_id', currentOrgId).order('name')
    setTeams(tms || [])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, refreshKey])

  function openWsModal() {
    setWsTeamId(!isAdmin && leadTeamIds[0] ? leadTeamIds[0] : '')
    setWsModal(true)
  }

  // מאפשר לעמודים אחרים (כמו הדשבורד הריק) לפתוח את מודל יצירת הוורקספייס
  // בלי לשכפל את הסטייט שלו — במקום זה, מאזינים לאירוע גלובלי קליל.
  useEffect(() => {
    function handler() {
      openWsModal()
    }
    window.addEventListener('open-create-workspace', handler)
    return () => window.removeEventListener('open-create-workspace', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, leadTeamIds])

  async function createWorkspace() {
    if (!wsName.trim()) return
    setSaving(true)
    try {
      const color = GROUP_COLORS[workspaces.length % GROUP_COLORS.length]
      await supabase
        .from('workspaces')
        .insert({ org_id: currentOrgId, name: wsName.trim(), color, position: workspaces.length, team_id: wsTeamId || null })
      setWsName('')
      setWsTeamId('')
      setWsModal(false)
      bump()
      toast('הוורקספייס נוצר')
    } finally {
      setSaving(false)
    }
  }

  async function createBoard() {
    if (!boardName.trim() || !boardModal) return
    setSaving(true)
    try {
      const count = (boardsByWs[boardModal] || []).length
      const { data, error } = await supabase
        .from('boards')
        .insert({ workspace_id: boardModal, name: boardName.trim(), position: count })
        .select()
        .single()
      if (!error && data) {
        const tpl = BOARD_TEMPLATES.find((t) => t.id === boardTemplate) || BOARD_TEMPLATES[0]
        const groupNames = tpl.groups.length ? tpl.groups : ['קבוצה ראשונה']
        const { data: createdGroups } = await supabase
          .from('groups')
          .insert(
            groupNames.map((name, i) => ({
              board_id: data.id,
              name,
              color: GROUP_COLORS[i % GROUP_COLORS.length],
              position: i,
            }))
          )
          .select()
        let createdCols = []
        if (tpl.columns.length) {
          const { data: cols } = await supabase
            .from('columns')
            .insert(
              tpl.columns.map((c, i) => ({
                board_id: data.id,
                name: c.name,
                type: c.type,
                position: i,
                settings: {
                  ...(c.labels
                    ? { labels: c.labels }
                    : c.type === 'status'
                    ? { labels: DEFAULT_STATUS_LABELS }
                    : c.type === 'tags'
                    ? { labels: DEFAULT_TAG_LABELS }
                    : {}),
                  ...(c.unit ? { unit: c.unit } : {}),
                },
              }))
            )
            .select()
          createdCols = cols || []
        }
        // אוטומציות מובנות מהתבנית — ממירים שמות עמודה/קבוצה ל-id של השורות שנוצרו
        if (tpl.automations?.length) {
          const rows = tpl.automations
            .map((a) => {
              const col = createdCols.find((c) => c.name === a.trigger.column)
              const grp = (createdGroups || []).find((g) => g.name === a.action.group)
              if (!col || (a.action.type === 'move_group' && !grp)) return null
              return {
                board_id: data.id,
                name: a.name,
                trigger: { type: a.trigger.type, column_id: col.id, label_id: a.trigger.label_id },
                action: a.action.type === 'move_group' ? { type: 'move_group', group_id: grp.id } : a.action,
                enabled: true,
              }
            })
            .filter(Boolean)
          if (rows.length) await supabase.from('automations').insert(rows)
        }
        setBoardName('')
        setBoardTemplate('tasks')
        setBoardModal(null)
        bump()
        toast('הבורד נוצר')
        navigate(`/board/${data.id}`)
      }
    } finally {
      setSaving(false)
    }
  }

  function openRename(type, id, name) {
    setRenameTarget({ type, id, name })
    setRenameValue(name)
  }

  async function saveRename() {
    if (!renameTarget || !renameValue.trim()) return
    const { type, id } = renameTarget
    const table = type === 'workspace' ? 'workspaces' : 'boards'
    await supabase.from(table).update({ name: renameValue.trim() }).eq('id', id)
    setRenameTarget(null)
    bump()
    toast('השם עודכן')
  }

  function openTeamAssign(ws) {
    setTeamAssignTarget(ws)
    setTeamAssignValue(ws.team_id || '')
  }

  async function saveTeamAssign() {
    if (!teamAssignTarget) return
    await supabase.from('workspaces').update({ team_id: teamAssignValue || null }).eq('id', teamAssignTarget.id)
    setTeamAssignTarget(null)
    bump()
    toast('שיוך הצוות עודכן')
  }

  async function deleteWorkspace(ws) {
    await supabase.from('workspaces').delete().eq('id', ws.id)
    bump()
    toast({ message: 'הוורקספייס נמחק', type: 'info' })
  }

  // גרירת בורד מוורקספייס לוורקספייס — מוסיף בסוף רשימת היעד
  async function moveBoardToWorkspace(boardId, fromWs, toWs) {
    if (!boardId || fromWs === toWs) return
    const board = (boardsByWs[fromWs] || []).find((b) => b.id === boardId)
    if (!board) return
    const position = (boardsByWs[toWs] || []).length
    setBoardsByWs((prev) => ({
      ...prev,
      [fromWs]: (prev[fromWs] || []).filter((b) => b.id !== boardId),
      [toWs]: [...(prev[toWs] || []), { ...board, workspace_id: toWs, position }],
    }))
    setExpanded((p) => ({ ...p, [toWs]: true }))
    const { error } = await supabase.from('boards').update({ workspace_id: toWs, position }).eq('id', boardId)
    if (error) {
      bump() // נכשל בשרת — טוענים מחדש כדי לבטל את השינוי האופטימי
      toast({ message: 'העברת הבורד נכשלה', type: 'error' })
      return
    }
    toast('הבורד הועבר')
  }

  async function deleteBoard(b) {
    await supabase.from('boards').delete().eq('id', b.id)
    bump()
    toast({ message: 'הבורד נמחק', type: 'info' })
    if (window.location.pathname === `/board/${b.id}`) navigate('/')
  }

  const linkBase =
    'group flex items-center gap-3 rounded-md px-3.5 py-3 text-[15px] transition-colors duration-150'
  const linkActive = 'bg-brand-500/15 text-white font-medium shadow-[inset_3px_0_0_var(--color-brand-400)]'
  const linkIdle = 'text-sidebar-idle hover:bg-white/5 hover:text-sidebar-ink'

  return (
    <aside className="flex h-full w-[292px] shrink-0 flex-col bg-sidebar px-4 py-5">
      {/* מותג */}
      <div className="mb-4 flex items-center gap-3 px-1 pb-1">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold leading-none text-white">
          ש
        </div>
        <div className="flex-1 truncate font-display text-[17px] font-bold tracking-tight text-white">בורד פעילות AI</div>
        <NotificationsBell />
        {onMobileClose && (
          <button
            onClick={onMobileClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sidebar-idle transition-colors hover:bg-white/10 hover:text-sidebar-ink lg:hidden cursor-pointer"
            aria-label="סגירת תפריט"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* בורר ארגון */}
      {orgs.length > 0 && (
        <div className="mb-2.5">
          <OrgSwitcher orgs={orgs} currentOrg={currentOrg} onSelect={setCurrentOrgId} />
        </div>
      )}

      {/* ניווט */}
      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        <NavLink to="/" end className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
          {({ isActive }) => (
            <>
              <IconTasks active={isActive} /> המשימות שלי
            </>
          )}
        </NavLink>
        <NavLink to="/dashboard" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
          {({ isActive }) => (
            <>
              <IconDashboard active={isActive} /> דשבורד
            </>
          )}
        </NavLink>
        <NavLink to="/members" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
          {({ isActive }) => (
            <>
              <IconPeople active={isActive} /> חברי הארגון
            </>
          )}
        </NavLink>
        {isAdmin && (
          <NavLink to="/teams" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
            {({ isActive }) => (
              <>
                <IconTeams active={isActive} /> צוותים
              </>
            )}
          </NavLink>
        )}
        {(isAdmin || isAiOverseer) && (
          <NavLink to="/ai-overview" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
            {({ isActive }) => (
              <>
                <IconOverview active={isActive} /> סקירת AI
              </>
            )}
          </NavLink>
        )}
        <NavLink to="/settings" className={({ isActive }) => `${linkBase} ${isActive ? linkActive : linkIdle}`}>
          {({ isActive }) => (
            <>
              <IconSettings active={isActive} /> הגדרות
            </>
          )}
        </NavLink>

        <div className="!mt-6 mb-1.5 flex items-center justify-between px-3">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-sidebar-muted">
            וורקספייסים
          </span>
          <button
            onClick={openWsModal}
            className="flex h-6 w-6 items-center justify-center rounded text-[17px] leading-none text-sidebar-muted transition-colors hover:bg-white/5 hover:text-brand-bright cursor-pointer"
            title="וורקספייס חדש"
            aria-label="יצירת וורקספייס חדש"
          >
            +
          </button>
        </div>

        {workspaces.length === 0 && (
          <p className="px-3 py-2 text-[13px] leading-relaxed text-sidebar-muted">
            אין עדיין וורקספייסים.
            <br />
            לחץ על + כדי ליצור את הראשון.
          </p>
        )}

        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className={`mb-1 rounded-md transition-colors ${dragOverWs === ws.id ? 'bg-brand-500/10 ring-1 ring-brand-400/40' : ''}`}
            onDragOver={(e) => {
              if (!dragBoard) return
              e.preventDefault()
              setDragOverWs(ws.id)
            }}
            onDragLeave={(e) => {
              if (e.currentTarget.contains(e.relatedTarget)) return
              setDragOverWs((p) => (p === ws.id ? null : p))
            }}
            onDrop={(e) => {
              e.preventDefault()
              setDragOverWs(null)
              if (dragBoard) moveBoardToWorkspace(dragBoard.id, dragBoard.fromWs, ws.id)
              setDragBoard(null)
            }}
          >
            <div className="group flex items-center gap-2 rounded-md px-2.5 py-2 hover:bg-white/5">
              <button
                onClick={() => setExpanded((p) => ({ ...p, [ws.id]: !p[ws.id] }))}
                className="flex h-4 w-4 items-center justify-center text-[11px] text-sidebar-muted transition-transform cursor-pointer"
                style={{ transform: expanded[ws.id] ? 'none' : 'rotate(90deg)' }}
              >
                ▾
              </button>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ws.color }} />
              <span className="flex-1 truncate text-[14.5px] font-semibold text-sidebar-ink" title={ws.name}>{ws.name}</span>
              <button
                onClick={() => setBoardModal(ws.id)}
                className="flex h-6 w-6 items-center justify-center rounded text-base text-sidebar-muted opacity-0 transition-all hover:bg-white/10 hover:text-brand-bright group-hover:opacity-100 cursor-pointer"
                title="בורד חדש"
                aria-label={`יצירת בורד חדש ב-${ws.name}`}
              >
                +
              </button>
              <RowMenu
                onRename={() => openRename('workspace', ws.id, ws.name)}
                onChangeTeam={isAdmin ? () => openTeamAssign(ws) : undefined}
                onDelete={() =>
                  setConfirmDel({
                    message: `למחוק את הוורקספייס "${ws.name}" וכל הבורדים שבו?`,
                    onConfirm: () => deleteWorkspace(ws),
                  })
                }
              />
            </div>
            {expanded[ws.id] && (
              <div className="mr-3">
                {(boardsByWs[ws.id] || []).map((b) => (
                  <div
                    key={b.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      setDragBoard({ id: b.id, fromWs: ws.id })
                    }}
                    onDragEnd={() => {
                      setDragBoard(null)
                      setDragOverWs(null)
                    }}
                    className={`group/board relative flex items-center rounded-md transition-opacity ${
                      dragBoard?.id === b.id ? 'opacity-40' : ''
                    }`}
                    title="ניתן לגרור לוורקספייס אחר"
                  >
                    <NavLink
                      to={`/board/${b.id}`}
                      className={({ isActive }) =>
                        `flex flex-1 items-center gap-2.5 rounded-md px-3 py-2 text-[14px] transition-colors duration-150 cursor-grab active:cursor-grabbing ${
                          isActive
                            ? 'bg-white/[0.06] text-sidebar-ink font-semibold'
                            : 'text-sidebar-ink font-medium hover:bg-white/5'
                        }`
                      }
                    >
                      <IconBoard />
                      <span className="truncate" title={b.name}>{b.name}</span>
                    </NavLink>
                    <span className="absolute left-1 opacity-0 transition-opacity group-hover/board:opacity-100">
                      <RowMenu
                        onRename={() => openRename('board', b.id, b.name)}
                        onDelete={() =>
                          setConfirmDel({
                            message: `למחוק את הבורד "${b.name}"?`,
                            onConfirm: () => deleteBoard(b),
                          })
                        }
                      />
                    </span>
                  </div>
                ))}
                {(boardsByWs[ws.id] || []).length === 0 && (
                  <p className={`px-3 py-2 text-[13px] ${dragOverWs === ws.id ? 'text-brand-bright' : 'text-sidebar-muted'}`}>
                    {dragOverWs === ws.id ? 'שחרר כאן כדי להעביר' : 'אין בורדים'}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* משתמש */}
      <UserChip user={user} />

      <Modal open={wsModal} onClose={() => setWsModal(false)} title="וורקספייס חדש">
        <div className="space-y-4">
          <Input
            label="שם הוורקספייס"
            value={wsName}
            onChange={(e) => setWsName(e.target.value)}
            placeholder="לדוגמה: מכירות, פיתוח, לקוחות"
            onKeyDown={(e) => e.key === 'Enter' && createWorkspace()}
            autoFocus
          />
          {isAdmin ? (
            <div>
              <span id="ws-team-label" className="mb-1.5 block text-[13px] font-medium text-ink-soft">צוות (אופציונלי)</span>
              <select
                value={wsTeamId}
                onChange={(e) => setWsTeamId(e.target.value)}
                aria-labelledby="ws-team-label"
                className="w-full rounded-lg bg-surface px-3 py-2.5 text-[14px] text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400"
              >
                <option value="">ללא שיוך</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          ) : (
            isTeamLead && (
              <p className="text-[13px] text-ink-muted">
                הוורקספייס ישויך לצוות: {teams.find((t) => t.id === leadTeamIds[0])?.name || ''}
              </p>
            )
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setWsModal(false)}>ביטול</Button>
            <Button onClick={createWorkspace} disabled={saving}>יצירה</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!boardModal} onClose={() => setBoardModal(null)} title="בורד חדש">
        <div className="space-y-4">
          <Input
            label="שם הבורד"
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
            placeholder="לדוגמה: משימות שבועיות, לקוחות פעילים"
            onKeyDown={(e) => e.key === 'Enter' && createBoard()}
            autoFocus
          />
          <div>
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">בחר תבנית</span>
            <div className="grid gap-2">
              {BOARD_TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    setBoardTemplate(t.id)
                    // שתילת שם התבנית כשם הבורד — רק אם המשתמש לא הקליד שם משלו
                    if (!boardName.trim() || BOARD_TEMPLATES.some((x) => x.name === boardName)) {
                      setBoardName(t.name)
                    }
                  }}
                  className={`rounded-lg px-3 py-2.5 text-right transition-colors ${
                    boardTemplate === t.id ? 'bg-brand-50 ring-1 ring-brand-300' : 'ring-1 ring-line hover:bg-surface-2'
                  }`}
                >
                  <div className={`text-[13.5px] font-medium ${boardTemplate === t.id ? 'text-brand-700' : 'text-ink'}`}>
                    {t.name}
                  </div>
                  <div className="text-[12px] text-ink-muted">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setBoardModal(null)}>ביטול</Button>
            <Button onClick={createBoard} disabled={saving}>יצירה</Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        title={renameTarget?.type === 'workspace' ? 'שינוי שם וורקספייס' : 'שינוי שם בורד'}
      >
        <div className="space-y-4">
          <Input
            label="שם חדש"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveRename()}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRenameTarget(null)}>ביטול</Button>
            <Button onClick={saveRename}>שמירה</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel?.onConfirm()}
        message={confirmDel?.message}
      />

      <Modal open={!!teamAssignTarget} onClose={() => setTeamAssignTarget(null)} title={`שיוך צוות ל"${teamAssignTarget?.name || ''}"`}>
        <div className="space-y-4">
          <div>
            <span id="ws-reassign-team-label" className="mb-1.5 block text-[13px] font-medium text-ink-soft">צוות</span>
            <select
              value={teamAssignValue}
              onChange={(e) => setTeamAssignValue(e.target.value)}
              aria-labelledby="ws-reassign-team-label"
              className="w-full rounded-lg bg-surface px-3 py-2.5 text-[14px] text-ink ring-1 ring-line focus:outline-none focus:ring-2 focus:ring-brand-400"
              autoFocus
            >
              <option value="">ללא שיוך</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTeamAssignTarget(null)}>ביטול</Button>
            <Button onClick={saveTeamAssign}>שמירה</Button>
          </div>
        </div>
      </Modal>
    </aside>
  )
}

function OrgSwitcher({ orgs, currentOrg, onSelect }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg bg-sidebar-2 px-3 py-2.5 text-right transition-colors hover:bg-white/[0.06] cursor-pointer"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] bg-brand-500 text-[12px] font-bold text-white">
          {(currentOrg?.name || '?').slice(0, 1)}
        </span>
        <span className="flex-1 truncate text-[14px] font-semibold text-sidebar-ink">{currentOrg?.name}</span>
        <span className="text-[11px] text-sidebar-muted">▾</span>
      </button>
      {open && orgs.length > 0 && (
        <div className="absolute inset-x-0 top-full z-[20] mt-1 overflow-hidden rounded-lg bg-sidebar-2 py-1 shadow-lg ring-1 ring-sidebar-line">
          {orgs.map((o) => (
            <button
              key={o.id}
              onClick={() => {
                onSelect(o.id)
                setOpen(false)
              }}
              className={`flex w-full items-center gap-2 px-3 py-2.5 text-right text-[14px] transition-colors hover:bg-white/5 cursor-pointer ${
                o.id === currentOrg?.id ? 'font-medium text-sidebar-ink' : 'text-sidebar-idle'
              }`}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ background: o.id === currentOrg?.id ? 'var(--color-brand-500)' : 'transparent' }}
              />
              <span className="truncate">{o.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function UserChip({ user }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const name = user?.user_metadata?.full_name || user?.email || ''
  const initials = (name || '?').slice(0, 2).toUpperCase()
  return (
    <div className="relative mt-2" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 rounded-lg bg-sidebar-2 px-3 py-3 text-right transition-colors hover:bg-white/[0.06] cursor-pointer"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-[13px] font-bold text-white">
          {initials}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold text-white">{name}</span>
          <span className="block truncate text-[12px] text-sidebar-muted">{user?.email}</span>
        </span>
        <span className="text-[11px] text-sidebar-muted">▾</span>
      </button>
      {open && (
        <div className="absolute inset-x-0 bottom-full mb-1 overflow-hidden rounded-lg bg-sidebar-2 py-1 shadow-lg ring-1 ring-sidebar-line">
          <button
            onClick={() => supabase.auth.signOut()}
            className="flex w-full items-center gap-2 px-3 py-2.5 text-right text-[14px] text-sidebar-idle transition-colors hover:bg-white/5 hover:text-sidebar-ink cursor-pointer"
          >
            <IconLogout /> התנתקות
          </button>
        </div>
      )}
    </div>
  )
}

function RowMenu({ onRename, onDelete, onChangeTeam }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function h(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        className="flex h-5 w-5 items-center justify-center rounded text-sidebar-muted transition-colors hover:bg-white/10 hover:text-sidebar-ink cursor-pointer"
        title="אפשרויות"
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="3" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="13" cy="8" r="1.3" />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-[20] mt-1 w-36 overflow-hidden rounded-lg bg-sidebar-2 py-1 shadow-lg ring-1 ring-sidebar-line">
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              onRename()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-right text-[13px] text-sidebar-idle transition-colors hover:bg-white/5 hover:text-sidebar-ink cursor-pointer"
          >
            ✎ שינוי שם
          </button>
          {onChangeTeam && (
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
                onChangeTeam()
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-right text-[13px] text-sidebar-idle transition-colors hover:bg-white/5 hover:text-sidebar-ink cursor-pointer"
            >
              👥 שיוך לצוות
            </button>
          )}
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen(false)
              onDelete()
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-right text-[13px] text-danger transition-colors hover:bg-danger/10 cursor-pointer"
          >
            🗑 מחיקה
          </button>
        </div>
      )}
    </div>
  )
}

/* אייקונים — קו עקבי */
function IconDashboard({ active }) {
  return (
    <svg className="shrink-0" width="18.5" height="18.5" viewBox="0 0 20 20" fill="none" style={{ color: active ? 'var(--color-brand-bright)' : 'currentColor' }}>
      <rect x="3" y="3" width="6" height="8" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="3" y="13" width="6" height="4" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="3" width="6" height="4" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11" y="9" width="6" height="8" rx="1.3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
function IconSettings({ active }) {
  return (
    <svg className="shrink-0" width="18.5" height="18.5" viewBox="0 0 20 20" fill="none" style={{ color: active ? 'var(--color-brand-bright)' : 'currentColor' }}>
      <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function IconTasks({ active }) {
  return (
    <svg className="shrink-0" width="18.5" height="18.5" viewBox="0 0 20 20" fill="none" style={{ color: active ? 'var(--color-brand-bright)' : 'currentColor' }}>
      <path d="M7 4h9M7 10h9M7 16h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 4l1 1 1.5-2M3 10l1 1 1.5-2M3 16l1 1 1.5-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function IconPeople({ active }) {
  return (
    <svg className="shrink-0" width="18.5" height="18.5" viewBox="0 0 20 20" fill="none" style={{ color: active ? 'var(--color-brand-bright)' : 'currentColor' }}>
      <circle cx="7.5" cy="7" r="2.6" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 16c0-2.5 2-4 4.5-4S12 13.5 12 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13.5 6.2a2.4 2.4 0 010 4.4M14.5 16c0-2-1-3.3-2.5-3.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function IconTeams({ active }) {
  return (
    <svg className="shrink-0" width="18.5" height="18.5" viewBox="0 0 20 20" fill="none" style={{ color: active ? 'var(--color-brand-bright)' : 'currentColor' }}>
      <circle cx="6.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="13.5" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.8 15.5c0-2.2 1.7-3.6 3.7-3.6s3.7 1.4 3.7 3.6M9.8 15.5c0-2.2 1.7-3.6 3.7-3.6s3.7 1.4 3.7 3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}
function IconOverview({ active }) {
  return (
    <svg className="shrink-0" width="18.5" height="18.5" viewBox="0 0 20 20" fill="none" style={{ color: active ? 'var(--color-brand-bright)' : 'currentColor' }}>
      <path d="M2.5 16V8M7.5 16V4M12.5 16v-6M17.5 16V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
function IconBoard() {
  return (
    <svg className="shrink-0" width="16.5" height="16.5" viewBox="0 0 20 20" fill="none">
      <rect x="3" y="3.5" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 8h14M8.5 8v8.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
function IconLogout() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M12 6V4.5A1.5 1.5 0 0010.5 3h-5A1.5 1.5 0 004 4.5v11A1.5 1.5 0 005.5 17h5a1.5 1.5 0 001.5-1.5V14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 10h8m0 0l-2.5-2.5M17 10l-2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
