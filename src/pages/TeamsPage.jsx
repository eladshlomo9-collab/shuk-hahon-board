import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { GROUP_COLORS } from '../lib/constants'
import { pluralize } from '../lib/pluralize'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import ConfirmDialog from '../components/ui/ConfirmDialog'
import LoadingSpinner from '../components/ui/LoadingSpinner'

export default function TeamsPage() {
  const { currentOrg, currentOrgId, members, bump } = useApp()
  const { toast } = useToast()
  const isAdmin = currentOrg?.role === 'admin'

  const [teams, setTeams] = useState([])
  const [teamMembersByTeam, setTeamMembersByTeam] = useState({})
  const [loading, setLoading] = useState(true)

  const [createModal, setCreateModal] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [saving, setSaving] = useState(false)

  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [confirmDel, setConfirmDel] = useState(null)

  const [manageTeam, setManageTeam] = useState(null) // team object
  const [addUserId, setAddUserId] = useState('')

  const [shareTarget, setShareTarget] = useState(null) // team object
  const [shareValue, setShareValue] = useState('')

  async function load() {
    if (!currentOrgId) {
      setTeams([])
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: tms } = await supabase
      .from('teams')
      .select('*')
      .eq('org_id', currentOrgId)
      .order('created_at')
    const list = tms || []
    setTeams(list)

    const teamIds = list.map((t) => t.id)
    if (teamIds.length) {
      const { data: tmems } = await supabase
        .from('team_members')
        .select('id, team_id, user_id, role')
        .in('team_id', teamIds)
      const grouped = {}
      for (const tm of tmems || []) {
        ;(grouped[tm.team_id] = grouped[tm.team_id] || []).push(tm)
      }
      setTeamMembersByTeam(grouped)
    } else {
      setTeamMembersByTeam({})
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId])

  async function createTeam() {
    if (!teamName.trim()) return
    setSaving(true)
    try {
      const color = GROUP_COLORS[teams.length % GROUP_COLORS.length]
      await supabase.from('teams').insert({ org_id: currentOrgId, name: teamName.trim(), color })
      setTeamName('')
      setCreateModal(false)
      toast('הצוות נוצר')
      load()
      bump()
    } finally {
      setSaving(false)
    }
  }

  async function saveRename() {
    if (!renameTarget || !renameValue.trim()) return
    await supabase.from('teams').update({ name: renameValue.trim() }).eq('id', renameTarget.id)
    setRenameTarget(null)
    toast('השם עודכן')
    load()
    bump()
  }

  async function deleteTeam(t) {
    await supabase.from('teams').delete().eq('id', t.id)
    toast({ message: 'הצוות נמחק', type: 'info' })
    load()
    bump()
  }

  async function addMember() {
    if (!manageTeam || !addUserId) return
    await supabase.from('team_members').insert({ team_id: manageTeam.id, user_id: addUserId, role: 'member' })
    setAddUserId('')
    load()
  }

  async function removeMember(tm) {
    await supabase.from('team_members').delete().eq('id', tm.id)
    load()
  }

  async function toggleLead(tm) {
    await supabase.from('team_members').update({ role: tm.role === 'lead' ? 'member' : 'lead' }).eq('id', tm.id)
    load()
  }

  function openShare(t) {
    setShareTarget(t)
    setShareValue(t.ai_work_share == null ? '' : String(t.ai_work_share))
  }

  async function saveShare() {
    if (!shareTarget) return
    const raw = shareValue.trim()
    let v = null
    if (raw !== '') {
      const n = Number(raw)
      if (Number.isNaN(n) || n < 0 || n > 100) {
        toast({ message: 'הזן אחוז בין 0 ל-100', type: 'error' })
        return
      }
      v = Math.round(n)
    }
    // .select() מחזיר את השורות שעודכנו בפועל — כך נזהה גם כישלון שקט של RLS
    // (0 שורות ללא error), ולא נראה "הצלחה" מזויפת.
    const { data, error } = await supabase
      .from('teams')
      .update({ ai_work_share: v })
      .eq('id', shareTarget.id)
      .select('id, ai_work_share')
    if (error) {
      toast({ message: 'לא הצלחנו לשמור. ודא שהרצת את מיגרציית db/add-ai-work-share.sql.', type: 'error' })
      return
    }
    if (!data || data.length === 0) {
      toast({ message: 'השמירה לא בוצעה — ייתכן שאין לך הרשאת אדמין לצוות הזה.', type: 'error' })
      return
    }
    setShareTarget(null)
    toast(`נתח ה-AI עודכן ל-${data[0].ai_work_share == null ? '—' : data[0].ai_work_share + '%'}`)
    load()
    bump()
  }

  const nameOf = (uid) => {
    const m = members.find((mm) => mm.user_id === uid)
    return m?.full_name || m?.email || uid
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl px-8 py-9">
        <p className="text-[15px] text-ink-muted">עמוד זה זמין רק לאדמין הארגון.</p>
      </div>
    )
  }

  const manageTeamMembers = manageTeam ? teamMembersByTeam[manageTeam.id] || [] : []
  const availableMembers = manageTeam
    ? members.filter((m) => !m.is_virtual && !manageTeamMembers.some((tm) => tm.user_id === m.user_id))
    : []

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <header className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[27px] font-extrabold tracking-tight text-ink">צוותים</h1>
          <p className="mt-1 text-[14px] text-ink-muted">{currentOrg?.name} · {teams.length} {pluralize(teams.length, 'צוות', 'צוותים')}</p>
        </div>
        <Button onClick={() => setCreateModal(true)}>+ צוות חדש</Button>
      </header>

      {loading ? (
        <LoadingSpinner />
      ) : teams.length === 0 ? (
        <div className="rounded-2xl bg-surface px-6 py-14 text-center ring-1 ring-line">
          <p className="text-[15px] text-ink-muted">אין עדיין צוותים. צור את הראשון כדי לשייך אליו וורקספייסים וחברים.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {teams.map((t) => {
            const tmems = teamMembersByTeam[t.id] || []
            return (
              <div key={t.id} className="rounded-2xl bg-surface p-5 ring-1 ring-line">
                <div className="mb-3 flex items-center gap-2.5">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: t.color }} />
                  <span className="flex-1 truncate text-[15.5px] font-semibold text-ink">{t.name}</span>
                </div>
                <p className="mb-1 text-[13px] text-ink-muted">{tmems.length} {pluralize(tmems.length, 'חבר', 'חברים')}</p>
                <p className="mb-4 text-[13px] text-ink-muted">
                  נתח AI מכלל העבודה:{' '}
                  {t.ai_work_share == null ? (
                    <span className="text-ink-muted">לא הוגדר</span>
                  ) : (
                    <span className="num font-semibold text-brand-600">{t.ai_work_share}%</span>
                  )}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setManageTeam(t)}>ניהול חברים</Button>
                  <Button size="sm" variant="secondary" onClick={() => openShare(t)}>נתח AI</Button>
                  <Button size="sm" variant="secondary" onClick={() => { setRenameTarget(t); setRenameValue(t.name) }}>שינוי שם</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmDel({ message: `למחוק את הצוות "${t.name}"? וורקספייסים המשויכים אליו יישארו ללא שיוך.`, onConfirm: () => deleteTeam(t) })}
                  >
                    מחיקה
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={createModal} onClose={() => setCreateModal(false)} title="צוות חדש">
        <div className="space-y-4">
          <Input
            label="שם הצוות"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="לדוגמה: שיווק, מכירות, תמיכה"
            onKeyDown={(e) => e.key === 'Enter' && createTeam()}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setCreateModal(false)}>ביטול</Button>
            <Button onClick={createTeam} disabled={saving}>יצירה</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!renameTarget} onClose={() => setRenameTarget(null)} title="שינוי שם צוות">
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

      <Modal open={!!manageTeam} onClose={() => setManageTeam(null)} title={`ניהול חברי ${manageTeam?.name || ''}`} width="max-w-lg">
        <div className="space-y-4">
          {manageTeamMembers.length === 0 ? (
            <p className="text-[13px] text-ink-muted">אין עדיין חברים בצוות זה.</p>
          ) : (
            <div className="space-y-1.5">
              {manageTeamMembers.map((tm) => (
                <div key={tm.id} className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-2 text-[13px] ring-1 ring-line">
                  <span className="text-ink">{nameOf(tm.user_id)}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => toggleLead(tm)} className="font-medium text-brand-600 transition-colors hover:underline cursor-pointer">
                      {tm.role === 'lead' ? 'ראש צוות ✓' : 'מנה לראש צוות'}
                    </button>
                    <button onClick={() => removeMember(tm)} className="text-ink-muted transition-colors hover:text-danger cursor-pointer" title="הסרה">✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {availableMembers.length > 0 && (
            <div className="flex items-end gap-2 border-t border-line pt-4">
              <div className="flex-1">
                <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">הוספת חבר לצוות</span>
                <select
                  value={addUserId}
                  onChange={(e) => setAddUserId(e.target.value)}
                  className="h-10 w-full rounded-md bg-surface px-3 text-sm text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">בחר חבר...</option>
                  {availableMembers.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.full_name || m.email}</option>
                  ))}
                </select>
              </div>
              <Button onClick={addMember} disabled={!addUserId}>הוספה</Button>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setManageTeam(null)}>סגירה</Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!shareTarget} onClose={() => setShareTarget(null)} title={`נתח AI — ${shareTarget?.name || ''}`}>
        <div className="space-y-4">
          <p className="text-[13px] leading-relaxed text-ink-muted">
            איזה אחוז מכלל העבודה של הצוות מתבצע בעזרת כלי AI? הערך משמש כדי לחשב
            "התייעלות אפקטיבית מכלל העבודה" בדשבורדים — ולא רק בתוך המשימות שנמדדו.
            אפשר להשאיר ריק אם עדיין לא ידוע.
          </p>
          <Input
            label="אחוז מהעבודה שמתבצע עם AI (%)"
            type="number"
            min="0"
            max="100"
            value={shareValue}
            onChange={(e) => setShareValue(e.target.value)}
            placeholder="לדוגמה: 30"
            onKeyDown={(e) => e.key === 'Enter' && saveShare()}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShareTarget(null)}>ביטול</Button>
            <Button onClick={saveShare}>שמירה</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => confirmDel?.onConfirm()}
        message={confirmDel?.message}
      />
    </div>
  )
}
