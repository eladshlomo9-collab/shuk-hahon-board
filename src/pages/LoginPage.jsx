import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import Input from '../components/ui/Input'
import Button from '../components/ui/Button'

export default function LoginPage() {
  const { session } = useApp()
  const [mode, setMode] = useState('login')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function submit(e) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) throw error
        setInfo('נרשמת בהצלחה! אם נדרש אימות אימייל — בדוק את תיבת הדואר.')
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        if (error) throw error
        setInfo('אם קיים חשבון עם האימייל הזה, נשלח אליו קישור לאיפוס סיסמה. בדוק את תיבת הדואר.')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      }
    } catch (err) {
      setError(translateError(err.message))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* פאנל מותג צבעוני */}
      <div
        className="relative hidden w-[46%] flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ background: 'linear-gradient(140deg, var(--color-brand-600) 0%, var(--color-brand-500) 42%, var(--color-accent-purple) 100%)' }}
      >
        {/* כתמי צבע מרחפים */}
        <Blob className="-right-16 -top-10 h-72 w-72" color="var(--color-accent-teal)" opacity={0.35} />
        <Blob className="-left-10 top-1/3 h-56 w-56" color="var(--color-accent-pink)" opacity={0.3} />
        <Blob className="bottom-0 right-1/3 h-64 w-64" color="var(--color-accent-orange)" opacity={0.28} />

        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/95 text-xl font-extrabold text-brand-600 shadow-lg">
            ש
          </div>
          <span className="text-[22px] font-bold tracking-tight">בורד פעילות AI</span>
        </div>

        <div className="relative">
          <h1 className="text-[40px] font-extrabold leading-[1.12] tracking-tight" style={{ textWrap: 'balance' }}>
            כל העבודה של העסק שלך,
            <br />
            במקום אחד צבעוני.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/85">
            משימות, לקוחות וצוות — בורדים, קבוצות והרשאות, בדיוק כמו שהעסק שלך עובד.
          </p>
          <ul className="mt-8 space-y-3.5">
            <Feature chip="rgba(255,255,255,0.95)" tint="var(--color-brand-600)" text="בורדים בתצוגת טבלה, קנבן ולוח שנה">
              <path d="M4 5.5h12M4 10h12M4 14.5h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </Feature>
            <Feature chip="var(--color-accent-green)" tint="white" text="שיתוף פעולה והרשאות לכל חברי הצוות">
              <circle cx="7.5" cy="7" r="2.4" stroke="currentColor" strokeWidth="1.7" />
              <path d="M3 15c0-2.4 2-3.8 4.5-3.8S12 12.6 12 15M13.5 6.4a2.3 2.3 0 010 4.2M15 15c0-1.9-1-3.1-2.4-3.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </Feature>
            <Feature chip="var(--color-accent-orange)" tint="white" text="סטטוסים צבעוניים, חיפוש, סינון והתראות">
              <path d="M10 3.5a4 4 0 00-4 4c0 2.7-1 3.7-1.5 4.2-.2.2 0 .5.3.5h10.4c.3 0 .5-.3.3-.5-.5-.5-1.5-1.5-1.5-4.2a4 4 0 00-4-4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M8.5 15.5a1.5 1.5 0 003 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </Feature>
          </ul>
        </div>

        <div className="relative text-[13px] text-white/70">מותאם אישית לעסק שלך · עברית מלאה</div>
      </div>

      {/* טופס */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          {/* מותג למובייל */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div
              className="flex h-11 w-11 items-center justify-center rounded-2xl text-lg font-extrabold text-white shadow-md"
              style={{ background: 'linear-gradient(140deg, var(--color-brand-500), var(--color-accent-purple))' }}
            >
              ש
            </div>
            <span className="text-xl font-bold text-ink">בורד פעילות AI</span>
          </div>

          <h2 className="text-[28px] font-bold tracking-tight text-ink">
            {mode === 'login' ? 'ברוך שובך 👋' : mode === 'signup' ? 'בוא נתחיל 🚀' : 'איפוס סיסמה'}
          </h2>
          <p className="mt-1.5 mb-7 text-[15px] text-ink-muted">
            {mode === 'login'
              ? 'התחבר כדי להמשיך לעבוד'
              : mode === 'signup'
              ? 'יצירת חשבון לוקחת פחות מדקה'
              : 'הזן את האימייל שלך ונשלח לך קישור לאיפוס'}
          </p>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <Input label="שם מלא" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="ישראל ישראלי" required />
            )}
            <Input
              label="אימייל"
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
            {mode !== 'forgot' && (
              <Input
                label="סיסמה"
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="לפחות 6 תווים"
                minLength={6}
                required
                endAdornment={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'הסתרת סיסמה' : 'הצגת סיסמה'}
                    aria-pressed={showPassword}
                    className="flex h-7 w-7 items-center justify-center rounded text-ink-muted transition-colors hover:text-ink cursor-pointer"
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                        <path d="M3 3l14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        <path d="M9.5 5.1c.16-.01.33-.01.5-.01 4.5 0 7.5 5 7.5 5s-1 1.5-2.5 2.9M6.6 6.6C4.4 8 3 10 3 10s3 5 7 5c1 0 1.9-.2 2.7-.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8.2 11.8a2 2 0 002.8 2.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                        <path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                        <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
                      </svg>
                    )}
                  </button>
                }
              />
            )}
            {mode === 'login' && (
              <button
                type="button"
                onClick={() => {
                  setMode('forgot')
                  setError('')
                  setInfo('')
                }}
                className="block text-sm font-medium text-brand-600 transition-colors hover:text-brand-700 cursor-pointer"
              >
                שכחת סיסמה?
              </button>
            )}
            {error && <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
            {info && <p role="status" aria-live="polite" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">{info}</p>}
            <Button type="submit" disabled={loading} className="h-11 w-full text-[15px]">
              {loading ? 'רגע...' : mode === 'login' ? 'התחברות' : mode === 'signup' ? 'יצירת חשבון' : 'שליחת קישור לאיפוס'}
            </Button>
          </form>

          <p className="mt-7 text-center text-sm text-ink-muted">
            {mode === 'forgot' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('login')
                  setError('')
                  setInfo('')
                }}
                className="font-semibold text-brand-600 transition-colors hover:text-brand-700 cursor-pointer"
              >
                חזרה להתחברות
              </button>
            ) : (
              <>
                {mode === 'login' ? 'אין לך חשבון עדיין?' : 'כבר יש לך חשבון?'}{' '}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'login' ? 'signup' : 'login')
                    setError('')
                    setInfo('')
                  }}
                  className="font-semibold text-brand-600 transition-colors hover:text-brand-700 cursor-pointer"
                >
                  {mode === 'login' ? 'להרשמה' : 'להתחברות'}
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

function Feature({ chip, tint, text, children }) {
  return (
    <li className="flex items-center gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: chip, color: tint }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          {children}
        </svg>
      </span>
      <span className="text-[14.5px] text-white/95">{text}</span>
    </li>
  )
}

function Blob({ className, color, opacity }) {
  return (
    <div
      className={`pointer-events-none absolute rounded-full blur-3xl ${className}`}
      style={{ background: color, opacity }}
      aria-hidden
    />
  )
}

function translateError(msg) {
  if (!msg) return 'משהו השתבש. נסה שוב.'
  if (msg.includes('Invalid login')) return 'אימייל או סיסמה שגויים.'
  if (msg.includes('already registered')) return 'האימייל הזה כבר רשום. נסה להתחבר.'
  if (msg.includes('at least 6')) return 'הסיסמה חייבת להכיל לפחות 6 תווים.'
  if (msg.toLowerCase().includes('email')) return 'בעיה באימייל. בדוק את הכתובת.'
  return 'שגיאה: ' + msg
}
