import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
let ok = 0
const step = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); if (c) ok++; else throw new Error('FAILED: ' + n) }

const run = async () => {
  const { data: si } = await supabase.auth.signInWithPassword({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD })
  const uid = si.user.id
  step('התחברות', !!si.session)

  const { data: org } = await supabase.rpc('create_organization', { p_name: 'בדיקת פעילות ' + Date.now() })
  const { data: ws } = await supabase.from('workspaces').insert({ org_id: org.id, name: 'ws' }).select().single()
  const { data: board } = await supabase.from('boards').insert({ workspace_id: ws.id, name: 'בורד בדיקה' }).select().single()
  step('יצירת בורד', !!board?.id)

  // יומן פעילות
  const { error: ae } = await supabase.from('activity').insert({ board_id: board.id, user_id: uid, user_name: 'בודק', action: 'create_item', detail: 'הוסיף פריט' })
  step('כתיבת פעילות', !ae, ae?.message)
  const { data: acts } = await supabase.from('activity').select('*').eq('board_id', board.id)
  step('קריאת פעילות (RLS)', acts?.length === 1)

  // התראות
  const { error: ne } = await supabase.from('notifications').insert({ user_id: uid, org_id: org.id, board_id: board.id, type: 'assigned', message: 'שויכה אליך משימה' })
  step('יצירת התראה', !ne, ne?.message)
  const { data: notifs } = await supabase.from('notifications').select('*').eq('user_id', uid).eq('read', false)
  step('קריאת התראות', (notifs?.length || 0) >= 1)
  await supabase.from('notifications').update({ read: true }).eq('board_id', board.id)
  const { data: after } = await supabase.from('notifications').select('read').eq('board_id', board.id)
  step('סימון כנקרא', after?.every((n) => n.read))

  console.log(`\nכל ${ok} הבדיקות עברו!`)
  await supabase.from('organizations').delete().eq('id', org.id)
  await supabase.from('notifications').delete().eq('board_id', board.id)
}
run().catch((e) => { console.error('\nנכשל:', e.message); process.exit(1) })
