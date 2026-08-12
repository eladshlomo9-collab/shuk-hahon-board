import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const run = async () => {
  await supabase.auth.signInWithPassword({ email: env.TEST_EMAIL, password: env.TEST_PASSWORD })
  const { data: org } = await supabase.rpc('create_organization', { p_name: 'בורד טסט ' + Date.now() })
  const { data: ws } = await supabase.from('workspaces').insert({ org_id: org.id, name: 'ws' }).select().single()
  console.log('ws.id =', ws.id)

  // טסט 1: הכנסה בלי select (בלי RETURNING)
  const t1 = await supabase.from('boards').insert({ workspace_id: ws.id, name: 'b-no-return' })
  console.log('הכנסה בלי RETURNING:', t1.error ? 'נכשל: ' + t1.error.message : 'הצליח!')

  // טסט 2: הכנסה עם select
  const t2 = await supabase.from('boards').insert({ workspace_id: ws.id, name: 'b-with-return' }).select().single()
  console.log('הכנסה עם RETURNING:', t2.error ? 'נכשל: ' + t2.error.message : 'הצליח! id=' + t2.data.id)

  // טסט 3: כמה בורדים נראים עכשיו?
  const { data: boards } = await supabase.from('boards').select('id,name').eq('workspace_id', ws.id)
  console.log('בורדים נראים (RLS select):', boards?.length, JSON.stringify(boards))

  await supabase.from('organizations').delete().eq('id', org.id)
}
run().catch((e) => console.error('ERR', e.message))
