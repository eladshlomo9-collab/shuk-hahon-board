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

  const { data: org } = await supabase.rpc('create_organization', { p_name: 'בדיקת תגובות ' + Date.now() })
  const { data: ws } = await supabase.from('workspaces').insert({ org_id: org.id, name: 'ws' }).select().single()
  const { data: board } = await supabase.from('boards').insert({ workspace_id: ws.id, name: 'בורד' }).select().single()
  const { data: group } = await supabase.from('groups').insert({ board_id: board.id, name: 'ק' }).select().single()
  const { data: item } = await supabase.from('items').insert({ group_id: group.id, board_id: board.id, name: 'פריט' }).select().single()
  step('יצירת פריט', !!item?.id)

  // תיאור פריט (עמודת description החדשה)
  const { error: de } = await supabase.from('items').update({ description: 'תיאור לבדיקה' }).eq('id', item.id)
  step('עדכון תיאור פריט', !de, de?.message)
  const { data: it2 } = await supabase.from('items').select('description').eq('id', item.id).single()
  step('קריאת תיאור', it2?.description === 'תיאור לבדיקה')

  // תגובה (item_updates)
  const { error: ce } = await supabase.from('item_updates').insert({ item_id: item.id, board_id: board.id, user_id: uid, user_name: 'בודק', body: 'תגובה ראשונה' })
  step('הוספת תגובה', !ce, ce?.message)
  const { data: comments } = await supabase.from('item_updates').select('*').eq('item_id', item.id)
  step('קריאת תגובות (RLS)', comments?.length === 1 && comments[0].body === 'תגובה ראשונה')

  // מחיקת תגובה (רק של עצמי)
  const { error: dele } = await supabase.from('item_updates').delete().eq('id', comments[0].id)
  step('מחיקת תגובה', !dele)

  console.log(`\nכל ${ok} הבדיקות עברו!`)
  await supabase.from('organizations').delete().eq('id', org.id)
}
run().catch((e) => { console.error('\nנכשל:', e.message); process.exit(1) })
