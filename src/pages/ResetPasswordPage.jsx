import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'
import LoadingSpinner from '../components/ui/LoadingSpinner'

// עמוד שנפתח מהקישור שנשלח באימייל לאיפוס סיסמה.
// Supabase מזהה את הטוקן ב-URL ומקים סשן זמני (recovery) לפני שהעמוד נטען.
export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [validLink, setValidLink] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) {
        setValidLink(true)
        setChecking(false)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setValidLink(true)
      setChecking(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('הסיסמה חייבת להכיל לפחות 6 תווים.')
      return
    }
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות.')
      return
    }
    setSaving(true)
    try {
      const { error: err } = await supabase.auth.updateUser({ password })
      if (err) throw err
      setDone(true)
      setTimeout(() => navigate('/'), 1800)
    } catch (err) {
      setError('לא הצלחנו לעדכן את הסיסמה. נסה לבקש קישור חדש.')
    } finally {
      setSaving(false)
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-[400px] rounded-2xl bg-surface p-8 ring-1 ring-line">
        <div className="mb-6 flex items-center gap-2.5">
          <div
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-md"
            style={{ background: 'linear-gradient(140deg, var(--color-brand-500), var(--color-accent-purple))' }}
          >
            ש
          </div>
          <span className="text-xl font-bold text-ink">בורד פעילות AI</span>
        </div>

        {!validLink ? (
          <>
            <h2 className="text-[22px] font-bold text-ink">הקישור לא תקין</h2>
            <p className="mt-2 text-[14px] text-ink-muted">
              הקישור לאיפוס סיסמה פג תוקף או שכבר נעשה בו שימוש. חזור למסך ההתחברות ובקש קישור חדש.
            </p>
            <Button className="mt-5 w-full" onClick={() => navigate('/login')}>
              חזרה להתחברות
            </Button>
          </>
        ) : done ? (
          <>
            <h2 className="text-[22px] font-bold text-ink">הסיסמה עודכנה 🎉</h2>
            <p className="mt-2 text-[14px] text-ink-muted">מעביר אותך לאפליקציה...</p>
          </>
        ) : (
          <>
            <h2 className="text-[22px] font-bold text-ink">בחר סיסמה חדשה</h2>
            <p className="mt-1.5 mb-6 text-[14px] text-ink-muted">הסיסמה החדשה תחליף את הישנה מיד.</p>
            <form onSubmit={submit} className="space-y-4">
              <Input
                label="סיסמה חדשה"
                type="password"
                name="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                minLength={6}
                autoFocus
                required
              />
              <Input
                label="אימות סיסמה"
                type="password"
                name="confirm-password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="הקלד שוב"
                minLength={6}
                required
              />
              {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
              <Button type="submit" disabled={saving} className="h-11 w-full text-[15px]">
                {saving ? 'שומר...' : 'עדכון סיסמה'}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
