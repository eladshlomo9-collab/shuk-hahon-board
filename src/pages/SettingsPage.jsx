import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import { useToast } from '../context/ToastContext'
import { ORG_ROLES, roleLabel } from '../lib/constants'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const TABS = [
  { id: 'org', label: 'ארגון' },
  { id: 'profile', label: 'פרופיל' },
  { id: 'members', label: 'חברים' },
]

const AVATAR_COLORS = [
  '#3E7BD6', '#0E9E7C', '#E0A63C', '#DA4A54', '#7A5AF0',
  '#E0568F', '#8B5CF6', '#12A37F', '#0A6650', '#579BFC',
]

export default function SettingsPage() {
  const { currentOrg, currentOrgId } = useApp()
  const [tab, setTab] = useState('org')

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <header className="mb-7">
        <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight text-ink">
          הגדרות
        </h1>
        <p className="mt-1.5 text-sm text-ink-muted">
          ניהול הארגון, הפרופיל האישי והחברים שלך
        </p>
      </header>

      <div className="mb-8 inline-flex rounded-lg bg-surface-2 p-0.5 ring-1 ring-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-[7px] px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${
              tab === t.id
                ? 'bg-surface text-ink shadow-xs'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'org' && (
        <OrgTab currentOrg={currentOrg} currentOrgId={currentOrgId} />
      )}
      {tab === 'profile' && <ProfileTab />}
      {tab === 'members' && (
        <MembersTab currentOrg={currentOrg} currentOrgId={currentOrgId} />
      )}
    </div>
  )
}

/* ============================================================
   טאב ארגון
   ============================================================ */
function OrgTab({ currentOrg, currentOrgId }) {
  const { reloadOrgs } = useApp()
  const { toast } = useToast()
  const isAdmin = currentOrg?.role === 'admin'

  const [name, setName] = useState(currentOrg?.name || '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(currentOrg?.name || '')
  }, [currentOrg?.name])

  async function save(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('organizations')
        .update({ name: name.trim() })
        .eq('id', currentOrgId)
      if (error) throw error
      await reloadOrgs()
      toast('שם הארגון עודכן')
    } catch (err) {
      console.error(err)
      toast({ type: 'error', message: 'לא הצלחנו לעדכן את שם הארגון' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-xl bg-surface p-6 ring-1 ring-line shadow-xs">
      <h2 className="mb-1 text-[15px] font-semibold text-ink">פרטי הארגון</h2>
      <p className="mb-5 text-sm text-ink-muted">
        השם שמופיע למשתמשים בארגון.
      </p>

      {isAdmin ? (
        <form onSubmit={save} className="max-w-md space-y-4">
          <Input
            label="שם הארגון"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="שם הארגון"
            required
          />
          <Button type="submit" disabled={saving}>
            {saving ? 'שומר...' : 'שמירה'}
          </Button>
        </form>
      ) : (
        <div className="max-w-md">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
            שם הארגון
          </span>
          <div className="flex h-10 items-center rounded-md bg-surface-2 px-3 text-sm text-ink ring-1 ring-line">
            {currentOrg?.name || '—'}
          </div>
          <p className="mt-2 text-xs text-ink-muted">
            רק מנהלי הארגון יכולים לערוך פרטים אלו.
          </p>
        </div>
      )}
    </div>
  )
}

/* ============================================================
   טאב פרופיל
   ============================================================ */
function ProfileTab() {
  const { user, reloadMembers } = useApp()
  const { toast } = useToast()

  const [fullName, setFullName] = useState(user?.user_metadata?.full_name || '')
  const [avatarColor, setAvatarColor] = useState(
    user?.user_metadata?.avatar_color || ''
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setFullName(user?.user_metadata?.full_name || '')
    setAvatarColor(user?.user_metadata?.avatar_color || '')
  }, [user])

  async function save(e) {
    e.preventDefault()
    if (!fullName.trim()) return
    setSaving(true)
    try {
      const { error: authErr } = await supabase.auth.updateUser({
        data: { full_name: fullName.trim() },
      })
      if (authErr) throw authErr
      const { error: memErr } = await supabase
        .from('members')
        .update({ full_name: fullName.trim() })
        .eq('user_id', user.id)
      if (memErr) throw memErr
      await reloadMembers()
      toast('הפרופיל עודכן')
    } catch (err) {
      console.error(err)
      toast({ type: 'error', message: 'לא הצלחנו לעדכן את הפרופיל' })
    } finally {
      setSaving(false)
    }
  }

  async function pickColor(color) {
    const prev = avatarColor
    setAvatarColor(color)
    const { error } = await supabase.auth.updateUser({
      data: { avatar_color: color },
    })
    if (error) {
      console.error(error)
      setAvatarColor(prev)
      toast({ type: 'error', message: 'לא הצלחנו לשמור את הצבע' })
      return
    }
    toast('צבע האווטאר עודכן')
  }

  const initials = (fullName || user?.email || '?').slice(0, 2).toUpperCase()

  return (
    <div className="rounded-xl bg-surface p-6 ring-1 ring-line shadow-xs">
      <h2 className="mb-5 text-[15px] font-semibold text-ink">הפרופיל שלי</h2>

      <div className="mb-6 flex items-center gap-3.5">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-sm font-bold text-white"
          style={avatarColor ? { background: avatarColor } : undefined}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{fullName || 'ללא שם'}</p>
          <p className="truncate text-sm text-ink-muted">{user?.email}</p>
        </div>
      </div>

      <form onSubmit={save} className="max-w-md space-y-4">
        <Input
          label="שם מלא"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="השם שלך"
          required
        />

        <div>
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
            אימייל
          </span>
          <div className="flex h-10 items-center rounded-md bg-surface-2 px-3 text-sm text-ink-soft ring-1 ring-line">
            {user?.email || '—'}
          </div>
        </div>

        <div>
          <span className="mb-2 block text-[13px] font-medium text-ink-soft">
            צבע אווטאר
          </span>
          <div className="flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => pickColor(c)}
                aria-label={`בחר צבע ${c}`}
                className={`h-7 w-7 rounded-full transition-transform hover:scale-110 cursor-pointer ${
                  avatarColor === c
                    ? 'ring-2 ring-white ring-offset-2 ring-offset-surface'
                    : 'ring-1 ring-line'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        <Button type="submit" disabled={saving}>
          {saving ? 'שומר...' : 'שמירה'}
        </Button>
      </form>
    </div>
  )
}

/* ============================================================
   טאב חברים
   ============================================================ */
function MembersTab({ currentOrg, currentOrgId }) {
  const { members, reloadMembers, user } = useApp()
  const { toast } = useToast()
  const isAdmin = currentOrg?.role === 'admin'

  const [invites, setInvites] = useState([])
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('member')
  const [sending, setSending] = useState(false)
  const [msg, setMsg] = useState('')
  const [savingRole, setSavingRole] = useState(null)

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
    } else {
      setInvites([])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadInvites()
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
      })
      if (error) throw error
      setEmail('')
      setRole('member')
      setMsg('ההזמנה נשמרה! כשהאדם ייכנס עם האימייל הזה הוא יצטרף לארגון אוטומטית.')
      loadInvites()
    } catch (err) {
      console.error(err)
      setMsg('לא הצלחנו לשמור את ההזמנה. בדוק שכתובת האימייל תקינה.')
    } finally {
      setSending(false)
    }
  }

  async function cancelInvite(id) {
    await supabase.from('invitations').delete().eq('id', id)
    loadInvites()
  }

  async function changeRole(uid, newRole) {
    setSavingRole(uid)
    try {
      const { error } = await supabase
        .from('members')
        .update({ role: newRole })
        .eq('org_id', currentOrgId)
        .eq('user_id', uid)
      if (error) throw error
      await reloadMembers()
      toast('התפקיד עודכן')
    } catch (err) {
      console.error(err)
      toast({ type: 'error', message: 'לא הצלחנו לעדכן את התפקיד' })
    } finally {
      setSavingRole(null)
    }
  }

  const nameOf = (m) => m.full_name || m.email || '?'

  return (
    <div>
      {isAdmin && (
        <div className="mb-8 rounded-xl bg-surface p-6 ring-1 ring-line shadow-xs">
          <h2 className="mb-4 text-[15px] font-semibold text-ink">הזמנת משתמש חדש</h2>
          <form onSubmit={invite} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <Input
                label="אימייל"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@example.com"
                required
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">תפקיד</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-10 rounded-md bg-surface px-3 text-sm text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500"
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
          {msg && <p className="mt-3 text-sm text-brand-600">{msg}</p>}
          <p className="mt-2 text-xs text-ink-muted">
            המשתמש צריך להירשם לאפליקציה עם אותה כתובת אימייל כדי להצטרף.
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
                      {m.is_virtual ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] text-ink-muted ring-1 ring-line">
                          חבר וירטואלי (לשיוך בלבד)
                        </span>
                      ) : isAdmin ? (
                        <select
                          value={m.role}
                          disabled={savingRole === m.user_id}
                          onChange={(e) => changeRole(m.user_id, e.target.value)}
                          className="h-8 rounded-md bg-surface-2 px-2.5 text-[13px] text-ink ring-1 ring-line outline-none transition-shadow hover:ring-line-strong focus:ring-2 focus:ring-brand-500 disabled:opacity-50 cursor-pointer"
                        >
                          {ORG_ROLES.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <RoleBadge role={m.role} />
                      )}
                    </td>
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
    </div>
  )
}

function RoleBadge({ role }) {
  const admin = role === 'admin'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium ${
        admin ? 'bg-brand-500/15 text-brand-200 ring-1 ring-brand-500/35' : 'bg-surface-2 text-ink-soft ring-1 ring-line'
      }`}
    >
      {roleLabel(ORG_ROLES, role)}
    </span>
  )
}
