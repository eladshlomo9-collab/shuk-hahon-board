import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY) // לבדיקת גישה ציבורית
let ok = 0
const step = (n, c, x) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? ' — ' + x : ''}`); if (c) ok++; else throw new Error('FAILED: ' + n) }

const run = async () => {
  const { data: si } = await supabase.auth.signInWithPassword({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD })
  const uid = si.user.id
  step('התחברות', !!si.session)
  const { data: org } = await supabase.rpc('create_organization', { p_name: 'בדיקת pro ' + Date.now() })
  const { data: ws } = await supabase.from('workspaces').insert({ org_id: org.id, name: 'ws' }).select().single()
  const { data: board } = await supabase.from('boards').insert({ workspace_id: ws.id, name: 'בורד' }).select().single()
  const { data: group } = await supabase.from('groups').insert({ board_id: board.id, name: 'ק' }).select().single()
  const { data: a } = await supabase.from('items').insert({ group_id: group.id, board_id: board.id, name: 'משימה א' }).select().single()
  const { data: b } = await supabase.from('items').insert({ group_id: group.id, board_id: board.id, name: 'משימה ב' }).select().single()

  // חברים וירטואליים
  const { error: vme } = await supabase.from('virtual_members').insert({ org_id: org.id, full_name: 'קבלן חיצוני' })
  step('חבר וירטואלי', !vme, vme?.message)

  // תלויות
  const { error: de } = await supabase.from('item_dependencies').insert({ item_id: b.id, depends_on_id: a.id, board_id: board.id })
  step('תלות בין משימות', !de, de?.message)

  // מעקב זמן
  const { error: te } = await supabase.from('time_entries').insert({ item_id: a.id, board_id: board.id, user_id: uid, user_name: 'בודק', seconds: 1800 })
  step('מעקב זמן', !te, te?.message)

  // קבצים (רשומת מטא בלבד)
  const { error: fe } = await supabase.from('item_files').insert({ item_id: a.id, board_id: board.id, name: 'file.pdf', path: `${board.id}/${a.id}/x.pdf`, size: 1234, user_id: uid })
  step('רשומת קובץ', !fe, fe?.message)

  // קישור ציבורי
  const token = crypto.randomUUID()
  await supabase.from('boards').update({ public_token: token }).eq('id', board.id)
  const { data: pub, error: pe } = await anon.rpc('public_board', { p_token: token })
  step('RPC ציבורי מחזיר בורד (ללא התחברות)', !pe && pub?.board?.id === board.id, pe?.message)
  step('הבורד הציבורי כולל פריטים', Array.isArray(pub?.items) && pub.items.length === 2)

  console.log(`\nכל ${ok} הבדיקות עברו!`)
  await supabase.from('organizations').delete().eq('id', org.id)
}
run().catch((e) => { console.error('\nנכשל:', e.message); process.exit(1) })
