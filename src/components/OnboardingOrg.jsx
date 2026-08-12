import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useApp } from '../context/AppContext'
import Input from './ui/Input'
import Button from './ui/Button'

export default function OnboardingOrg() {
  const { reloadOrgs } = useApp()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function create() {
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const { error } = await supabase.rpc('create_organization', { p_name: name.trim() })
      if (error) throw error
      await reloadOrgs()
    } catch (e) {
      setError('לא הצלחנו ליצור את הארגון. נסה שוב.')
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl bg-surface p-9 shadow-md ring-1 ring-line">
        <div
          className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-md"
          style={{ background: 'linear-gradient(140deg, var(--color-brand-500), var(--color-accent-purple))' }}
        >
          ש
        </div>
        <h1 className="font-display text-2xl text-ink">ברוך הבא 👋</h1>
        <p className="mt-2 mb-7 text-sm leading-relaxed text-ink-muted">
          בוא ניצור את הארגון שלך — המקום שבו ינוהלו כל הוורקספייסים, הבורדים והמשתמשים.
        </p>
        <div className="space-y-4">
          <Input
            label="שם הארגון / העסק"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: שוק ההון בע״מ"
            onKeyDown={(e) => e.key === 'Enter' && create()}
            autoFocus
          />
          {error && <p className="text-sm text-danger">{error}</p>}
          <Button onClick={create} disabled={saving} className="w-full">
            {saving ? 'יוצר...' : 'יצירת ארגון'}
          </Button>
        </div>
      </div>
    </div>
  )
}
