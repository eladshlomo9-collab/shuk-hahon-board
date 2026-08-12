// בדיקת קצה-לקצה מול Supabase. משתמש בחשבון בדיקה קבוע כדי לא ליצור משתמשים חדשים כל פעם.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const email = env.TEST_EMAIL
const password = env.TEST_PASSWORD
let ok = 0
const step = (name, cond, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`)
  if (cond) ok++; else throw new Error('FAILED: ' + name)
}

const run = async () => {
  // התחברות (או הרשמה אם לא קיים)
  let { data: si, error: sie } = await supabase.auth.signInWithPassword({ email, password })
  if (sie) {
    const { data: su, error: sue } = await supabase.auth.signUp({
      email, password, options: { data: { full_name: 'בודק קבוע' } },
    })
    if (sue) throw new Error('אימות מושבת ב-Supabase? ' + sue.message)
    if (!su.session) {
      const r = await supabase.auth.signInWithPassword({ email, password })
      if (r.error) throw new Error('Confirm email עדיין דלוק: ' + r.error.message)
      si = r.data
    } else si = su
  }
  step('התחברות', !!si.session, email)
  const uid = si.user.id

  const { data: org, error: oe } = await supabase.rpc('create_organization', { p_name: 'ארגון בדיקה ' + Date.now() })
  if (oe) throw oe
  step('יצירת ארגון (RPC)', !!org?.id)

  const { data: ws, error: we } = await supabase.from('workspaces').insert({ org_id: org.id, name: 'מחלקת בדיקה' }).select().single()
  if (we) throw we
  step('יצירת וורקספייס', !!ws?.id)

  // אבחון: בדיקת פונקציות העזר
  const diag = {}
  for (const [fn, arg] of [['auth_is_org_member', { p_org: org.id }], ['auth_is_workspace_member', { p_workspace: ws.id }]]) {
    const { data, error } = await supabase.rpc(fn, arg)
    diag[fn] = error ? 'ERR:' + error.message : data
  }
  console.log('   אבחון הרשאות:', JSON.stringify(diag))

  const { data: board, error: be } = await supabase.from('boards').insert({ workspace_id: ws.id, name: 'בורד בדיקה' }).select().single()
  if (be) throw be
  step('יצירת בורד', !!board?.id)

  const { data: bc } = await supabase.from('boards').select('id').eq('id', board.id)
  step('הבורד נראה (RLS)', bc?.length === 1)

  const { data: group, error: ge } = await supabase.from('groups').insert({ board_id: board.id, name: 'קבוצה א' }).select().single()
  if (ge) throw ge
  step('יצירת קבוצה', !!group?.id)

  const { data: cols, error: ce } = await supabase.from('columns').insert([
    { board_id: board.id, name: 'אחראי', type: 'person', position: 0 },
  ]).select()
  if (ce) throw ce
  step('יצירת עמודה', cols?.length === 1)

  const { data: item, error: ie } = await supabase.from('items').insert({ group_id: group.id, board_id: board.id, name: 'משימת בדיקה' }).select().single()
  if (ie) throw ie
  step('יצירת פריט', !!item?.id)

  const { error: cve } = await supabase.from('cell_values').upsert(
    { item_id: item.id, column_id: cols[0].id, value: { user_id: uid } }, { onConflict: 'item_id,column_id' })
  if (cve) throw cve
  step('שמירת ערך תא (שיוך אחראי)', true)

  const { data: mine, error: me } = await supabase.rpc('my_assigned_items')
  if (me) throw me
  step('"המשימות שלי" מחזיר את הפריט', mine?.some((i) => i.id === item.id))

  console.log(`\nכל ${ok} הבדיקות עברו בהצלחה!`)
  await supabase.from('organizations').delete().eq('id', org.id)
}
run().catch((err) => { console.error('\nנכשל:', err.message || err); process.exit(1) })
