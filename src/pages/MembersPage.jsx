import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { ORG_ROLES, roleLabel } from '../lib/constants'
import { pluralize } from '../lib/pluralize'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const ADD_TABS = [
  { id: 'invite', label: 'הזמנה באימייל' },
  { id: 'virtual', label: 'חבר וירטואלי' },
  { id: 'direct', label: 'חשבון ישיר' },
]

export default function MembersPage() {
  const { currentOrg, currentOrgId, members, reloadMembers, user, isTeamLead, leadTeamIds } = useApp()
  const { toast } = useToast()
  const isAdmin = currentOrg?.role === 'admin'
  const [addTab, setAddTab] = useState('invite')

  const [invites, setInvites] = useState([])
  const [teams, setTeams] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [inviteTeamId, setInviteTeamId] = useState('')
  const [inviteTeamRole, setInviteTeamRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')

  // --- הזמנה מוגבלת של ראש-צוות (לא-אדמין) לצוות שלו בלבד ---
  const [leadEmail, setLeadEmail] = useState('')
  const [leadTeamRole, setLeadTeamRole] = useState('member')
  const [leadSending, setLeadSending] = useState(false)
  const [leadMsg, setLeadMsg] = useState('')

  async function loadTeams() {
    if (!currentOrgId) {
      setTeams([])
      return
    }
    const { data } = await supabase.from('teams').select('id, name').eq('org_id', currentOrgId).order('name')
    setTeams(data || [])
  }

  async function loadInvites() {
    setLoading(true)
    if (isAdmin) {
      const { data } = await supabase
        .from('invitations')
        .select('*')
        .eq('org_id', currentOrgId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
      setInvites(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadInvites()
    loadTeams()
    reloadMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId])

  async function invite(e) {
    e.preventDefault()
    if (!email.trim()) return
    setSending(true)
    setMsg('')
    try {
      const { error } = await supabase.from('invitations').insert({
        org_id: currentOrgId,
        email: email.trim().toLowerCase(),
        org_role: role,
        team_id: inviteTeamId || null,
        team_role: inviteTeamId ? inviteTeamRole : null,
      })
      if (error) throw error
      setEmail('')
      setRole('member')
      setInviteTeamId('')
      setInviteTeamRole('member')
      setMsg('ההזמנה נשמרה! כשהאדם ייכנס עם האימייל הזה הוא יצטרף לארגון אוטומטית.')
      loadInvites()
    } catch (err) {
      console.error(err)
      setMsg('לא הצלחנו לשמור את ההזמנה. בדוק שכתובת האימייל תקינה.')
    } finally {
      setSending(false)
    }
  }

  // ראש-צוות (לא-אדמין) מזמין חבר חדש לצוות שלו בלבד — תמיד כ-member ברמת הארגון
  async function leadInvite(e) {
    e.preventDefault()
    if (!leadEmail.trim() || !leadTeamIds[0]) return
    setLeadSending(true)
    setLeadMsg('')
    try {
      const { error } = await supabase.from('invitations').insert({
        org_id: currentOrgId,
        email: leadEmail.trim().toLowerCase(),
        org_role: 'member',
        team_id: leadTeamIds[0],
        team_role: leadTeamRole,
      })
      if (error) throw error
      setLeadEmail('')
      setLeadTeamRole('member')
      setLeadMsg('ההזמנה נשמרה! כשהאדם ייכנס עם האימייל הזה הוא יצטרף לצוות אוטומטית.')
    } catch (err) {
      console.error(err)
      setLeadMsg('לא הצלחנו לשמור את ההזמנה. בדוק שכתובת האימייל תקינה.')
    } finally {
      setLeadSending(false)
    }
  }

  async function cancelInvite(id) {
    await supabase.from('invitations').delete().eq('id', id)
    loadInvites()
  }

  // --- חבר וירטואלי (לשיוך בלבד) ---
  const [vmName, setVmName] = useState('')
  async function addVirtual(e) {
    e.preventDefault()
    if (!vmName.trim()) return
    const { error } = await supabase.from('virtual_members').insert({ org_id: currentOrgId, full_name: vmName.trim() })
    if (!error) {
      setVmName('')
      reloadMembers()
    }
  }
  async function deleteVirtual(id) {
    await supabase.from('virtual_members').delete().eq('id', id)
    reloadMembers()
  }

  // --- יצירת חשבון התחברות אמיתי (דרך Edge Function) ---
  const [ca, setCa] = useState({ email: '', password: '', name: '' })
  const [caMsg, setCaMsg] = useState('')
  const [creating, setCreating] = useState(false)
  async function createAccount(e) {
    e.preventDefault()
    if (!ca.email.trim() || ca.password.length < 6) {
      setCaMsg('יש להזין אימייל וסיסמה (לפחות 6 תווים).')
      return
    }
    setCreating(true)
    setCaMsg('')
    try {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: { email: ca.email.trim().toLowerCase(), password: ca.password, full_name: ca.name.trim(), org_id: currentOrgId },
      })
      if (error || data?.error) throw new Error(data?.error || error.message)
      setCa({ email: '', password: '', name: '' })
      setCaMsg('החשבון נוצר! המשתמש יכול להתחבר עם המייל והסיסמה.')
      reloadMembers()
    } catch (err) {
      setCaMsg('יצירת החשבון נכשלה. ודא שפרסת את ה-Edge Function (create-user). פרטים: ' + (err.message || ''))
    } finally {
      setCreating(false)
    }
  }

  // --- איפוס סיסמה לחבר קיים (דרך Edge Function, ע"י אדמין) ---
  const [resetTarget, setResetTarget] = useState(null) // member object
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const [resetError, setResetError] = useState('')
  const [resetSaving, setResetSaving] = useState(false)

  function openReset(m) {
    setResetTarget(m)
    setResetPassword('')
    setResetConfirm('')
    setResetError('')
  }

  async function submitReset(e) {
    e.preventDefault()
    setResetError('')
    if (resetPassword.length < 6) {
      setResetError('הסיסמה חייבת להכיל לפחות 6 תווים.')
      return
    }
    if (resetPassword !== resetConfirm) {
      setResetError('הסיסמאות אינן תואמות.')
      return
    }
    setResetSaving(true)
    try {
      const { data, error } = await supabase.functions.invoke('reset-user-password', {
        body: { user_id: resetTarget.user_id, org_id: currentOrgId, password: resetPassword },
      })
      if (error || data?.error) throw new Error(data?.error || error.message)
      toast(`הסיסמה של ${nameOf(resetTarget)} אופסה בהצלחה`)
      setResetTarget(null)
    } catch (err) {
      setResetError('איפוס הסיסמה נכשל. ודא שפרסת את ה-Edge Function (reset-user-password). פרטים: ' + (err.message || ''))
    } finally {
      setResetSaving(false)
    }
  }

  const nameOf = (m) => m.full_name || m.email || '?'

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <header className="mb-6">
        <h1 className="font-display text-[27px] font-extrabold tracking-tight text-ink">חברי הארגון</h1>
        <p className="mt-1 text-[14px] text-ink-muted">{currentOrg?.name} · {members.length} {pluralize(members.length, 'חבר', 'חברים')}</p>
      </header>

      {isAdmin && (
        <div className="mb-6 rounded-2xl bg-surface p-6 ring-1 ring-line">
          <div className="mb-5 inline-flex w-fit gap-1.5 rounded-xl bg-surface-2 p-1">
            {ADD_TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setAddTab(t.id)}
                className={`rounded-lg px-4 py-1.5 text-[13px] font-semibold transition-colors cursor-pointer ${
                  addTab === t.id ? 'bg-surface text-ink shadow-sm' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {addTab === 'invite' && (
            <div>
              <form onSubmit={invite} className="grid items-end gap-3 sm:grid-cols-[1fr_150px_130px]">
                <Input
                  label="אימייל"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="person@example.com"
                  required
                />
                <div>
                  <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">תפקיד</span>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-10 w-full rounded-md bg-surface px-3 text-sm text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
                  >
                    {ORG_ROLES.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button type="submit" disabled={sending}>
                  {sending ? 'שומר...' : 'שליחת הזמנה'}
                </Button>
              </form>
              {teams.length > 0 && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">צוות (אופציונלי)</span>
                    <select
                      value={inviteTeamId}
                      onChange={(e) => setInviteTeamId(e.target.value)}
                      className="h-10 w-full rounded-md bg-surface px-3 text-sm text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="">ללא שיוך</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  {inviteTeamId && (
                    <div>
                      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">תפקיד בצוות</span>
                      <select
                        value={inviteTeamRole}
                        onChange={(e) => setInviteTeamRole(e.target.value)}
                        className="h-10 w-full rounded-md bg-surface px-3 text-sm text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
                      >
                        <option value="member">חבר צוות</option>
                        <option value="lead">ראש צוות</option>
                      </select>
                    </div>
                  )}
                </div>
              )}
              {msg && <p role="status" aria-live="polite" className="mt-3 text-sm text-brand-600">{msg}</p>}
              <p className="mt-2 text-xs text-ink-muted">
                המשתמש צריך להירשם לאפליקציה עם אותה כתובת אימייל כדי להצטרף.
              </p>
            </div>
          )}

          {addTab === 'virtual' && (
            <div>
              <p className="mb-4 text-xs text-ink-muted">שם לשיוך משימות בלבד (לא מתחבר למערכת). שימושי לקבלנים/אנשי קשר.</p>
              <form onSubmit={addVirtual} className="flex items-end gap-2">
                <div className="flex-1">
                  <Input label="שם" value={vmName} onChange={(e) => setVmName(e.target.value)} placeholder="שם החבר" />
                </div>
                <Button type="submit">הוספה</Button>
              </form>
              {members.filter((m) => m.is_virtual).length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {members.filter((m) => m.is_virtual).map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between rounded-md bg-surface-2 px-3 py-1.5 text-[13px] ring-1 ring-line">
                      <span className="text-ink">{m.full_name}</span>
                      <button onClick={() => deleteVirtual(m.user_id)} className="text-ink-muted transition-colors hover:text-danger cursor-pointer" title="מחק">✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {addTab === 'direct' && (
            <div>
              <p className="mb-4 text-xs text-ink-muted">צור חשבון ישירות (ללא רישום עצמי). המשתמש יתחבר עם המייל והסיסמה.</p>
              <form onSubmit={createAccount} className="grid gap-3 sm:grid-cols-3 sm:items-end">
                <Input label="שם מלא" value={ca.name} onChange={(e) => setCa({ ...ca, name: e.target.value })} placeholder="ישראל ישראלי" />
                <Input label="אימייל" type="email" value={ca.email} onChange={(e) => setCa({ ...ca, email: e.target.value })} placeholder="person@example.com" required />
                <Input label="סיסמה" type="password" autoComplete="new-password" minLength={6} value={ca.password} onChange={(e) => setCa({ ...ca, password: e.target.value })} placeholder="לפחות 6 תווים" required />
                <Button type="submit" disabled={creating} className="sm:col-span-3">
                  {creating ? 'יוצר...' : 'יצירת חשבון'}
                </Button>
              </form>
              {caMsg && <p className="mt-3 text-xs text-ink-soft">{caMsg}</p>}
            </div>
          )}
        </div>
      )}

      {!isAdmin && isTeamLead && (
        <div className="mb-6 rounded-2xl bg-surface p-6 ring-1 ring-line">
          <h2 className="mb-4 text-[14.5px] font-semibold text-ink">הזמנת חבר לצוות שלך</h2>
          <form onSubmit={leadInvite} className="grid items-end gap-3 sm:grid-cols-[1fr_150px_130px]">
            <Input
              label="אימייל"
              type="email"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              placeholder="person@example.com"
              required
            />
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">תפקיד בצוות</span>
              <select
                value={leadTeamRole}
                onChange={(e) => setLeadTeamRole(e.target.value)}
                className="h-10 w-full rounded-md bg-surface px-3 text-sm text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
              >
                <option value="member">חבר צוות</option>
                <option value="lead">ראש צוות</option>
              </select>
            </div>
            <Button type="submit" disabled={leadSending}>
              {leadSending ? 'שומר...' : 'שליחת הזמנה'}
            </Button>
          </form>
          {leadMsg && <p className="mt-3 text-sm text-brand-600">{leadMsg}</p>}
          <p className="mt-2 text-xs text-ink-muted">
            המשתמש צריך להירשם לאפליקציה עם אותה כתובת אימייל כדי להצטרף — הוא יצורף אוטומטית לצוות שלך.
          </p>
        </div>
      )}

      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          <div className="mb-7 overflow-hidden rounded-xl bg-surface ring-1 ring-line shadow-xs">
            <table className="w-full text-right text-sm">
              <thead>
                <tr className="border-b border-line text-[12px] font-medium text-ink-muted">
                  <th className="px-5 py-3 font-medium">שם</th>
                  <th className="px-5 py-3 font-medium">אימייל</th>
                  <th className="px-5 py-3 font-medium">תפקיד</th>
                  {isAdmin && <th className="px-5 py-3 font-medium"></th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m, i) => (
                  <tr
                    key={m.user_id}
                    className={`transition-colors hover:bg-surface-2/50 ${
                      i !== members.length - 1 ? 'border-b border-line' : ''
                    }`}
                  >
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-[11px] font-bold text-white">
                          {nameOf(m).slice(0, 2).toUpperCase()}
                        </span>
                        <span className="font-medium text-ink">
                          {nameOf(m)}
                          {m.user_id === user?.id && (
                            <span className="mr-1.5 text-xs font-normal text-ink-muted">(אתה)</span>
                          )}
                        </span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-ink-soft">{m.email}</td>
                    <td className="px-5 py-3.5">
                      <RoleBadge role={m.role} />
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 text-left">
                        {!m.is_virtual && m.user_id !== user?.id && (
                          <button
                            onClick={() => openReset(m)}
                            className="text-[13px] font-medium text-ink-muted transition-colors hover:text-brand-600 cursor-pointer"
                          >
                            איפוס סיסמה
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isAdmin && invites.length > 0 && (
            <div>
              <h2 className="mb-2.5 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
                הזמנות ממתינות
              </h2>
              <div className="overflow-hidden rounded-xl bg-surface ring-1 ring-line shadow-xs">
                <table className="w-full text-right text-sm">
                  <tbody>
                    {invites.map((inv, i) => (
                      <tr key={inv.id} className={i !== invites.length - 1 ? 'border-b border-line' : ''}>
                        <td className="px-5 py-3.5 text-ink">{inv.email}</td>
                        <td className="px-5 py-3.5">
                          <RoleBadge role={inv.org_role} />
                        </td>
                        <td className="px-5 py-3.5 text-left">
                          <button
                            onClick={() => cancelInvite(inv.id)}
                            className="text-sm text-danger transition-colors hover:underline cursor-pointer"
                          >
                            ביטול
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={!!resetTarget} onClose={() => setResetTarget(null)} title={`איפוס סיסמה עבור ${resetTarget ? nameOf(resetTarget) : ''}`}>
        <form onSubmit={submitReset} className="space-y-4">
          <p className="text-xs text-ink-muted">
            הסיסמה החדשה תחליף מיד את הסיסמה הקודמת. שתף אותה עם {resetTarget ? nameOf(resetTarget) : 'המשתמש'} בערוץ מאובטח.
          </p>
          <Input
            label="סיסמה חדשה"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={resetPassword}
            onChange={(e) => setResetPassword(e.target.value)}
            placeholder="לפחות 6 תווים"
            autoFocus
            required
          />
          <Input
            label="אימות סיסמה"
            type="password"
            autoComplete="new-password"
            minLength={6}
            value={resetConfirm}
            onChange={(e) => setResetConfirm(e.target.value)}
            placeholder="הקלד שוב"
            required
          />
          {resetError && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{resetError}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setResetTarget(null)}>ביטול</Button>
            <Button type="submit" disabled={resetSaving}>{resetSaving ? 'שומר...' : 'איפוס סיסמה'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function RoleBadge({ role }) {
  const admin = role === 'admin'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${
        admin ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'bg-surface-2 text-ink-soft ring-1 ring-line'
      }`}
    >
      {roleLabel(ORG_ROLES, role)}
    </span>
  )
}
