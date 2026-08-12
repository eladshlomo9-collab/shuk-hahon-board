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
  await supabase.auth.signInWithPassword({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD })
  step('התחברות', true)
  const { data: org } = await supabase.rpc('create_organization', { p_name: 'בדיקת monday ' + Date.now() })
  const { data: ws } = await supabase.from('workspaces').insert({ org_id: org.id, name: 'ws' }).select().single()
  const { data: board } = await supabase.from('boards').insert({ workspace_id: ws.id, name: 'בורד' }).select().single()
  const { data: group } = await supabase.from('groups').insert({ board_id: board.id, name: 'ק' }).select().single()
  const { data: parent } = await supabase.from('items').insert({ group_id: group.id, board_id: board.id, name: 'משימת אב' }).select().single()
  step('יצירת פריט אב', !!parent?.id)

  // תת-משימה
  const { data: sub, error: se } = await supabase
    .from('items').insert({ group_id: group.id, board_id: board.id, name: 'תת-משימה', parent_item_id: parent.id }).select().single()
  step('יצירת תת-משימה', !se && sub?.parent_item_id === parent.id, se?.message)
  const { data: subs } = await supabase.from('items').select('id').eq('parent_item_id', parent.id)
  step('שליפת תת-משימות לפי אב', subs?.length === 1)

  // אוטומציה
  const { error: ae } = await supabase.from('automations').insert({
    board_id: board.id, name: 'בדיקה',
    trigger: { type: 'status_is', column_id: 'x', label_id: 'done' },
    action: { type: 'notify_assignee' },
  })
  step('יצירת אוטומציה', !ae, ae?.message)
  const { data: autos } = await supabase.from('automations').select('*').eq('board_id', board.id)
  step('שליפת אוטומציות (RLS)', autos?.length === 1 && autos[0].enabled === true)

  console.log(`\nכל ${ok} הבדיקות עברו!`)
  await supabase.from('organizations').delete().eq('id', org.id)
}
run().catch((e) => { console.error('\nנכשל:', e.message); process.exit(1) })
