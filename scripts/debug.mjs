import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8')
    .split('\n').filter((l) => l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] })
)
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const email = `dbg.${Date.now()}@gmail.com`

const run = async () => {
  let { data: su, error: sue } = await supabase.auth.signUp({ email, password: 'Test123456', options: { data: { full_name: 'דיבאג' } } })
  console.log('signUp err:', sue?.message || 'none', 'session:', !!su?.session)
  if (!su?.session) { const { data, error } = await supabase.auth.signInWithPassword({ email, password: 'Test123456' }); su = data; console.log('signIn err:', error?.message || 'none') }
  if (!su?.user) { console.log('NO USER — aborting'); return }
  const uid = su.user.id
  console.log('uid:', uid)

  const { data: org, error: oe } = await supabase.rpc('create_organization', { p_name: 'דיבאג ארגון' })
  console.log('org:', org?.id, 'err:', oe?.message || 'none')
  if (!org) return

  const { data: mem } = await supabase.from('members').select('*')
  console.log('members (client view):', JSON.stringify(mem))

  const { data: ws, error: wse } = await supabase.from('workspaces').insert({ org_id: org.id, name: 'ws' }).select().single()
  console.log('workspace:', ws?.id, 'org_id:', ws?.org_id, 'err:', wse?.message)

  // נסה לקרוא לפונקציות העזר ישירות (אם חשופות כ-RPC)
  for (const [fn, arg] of [
    ['auth_is_org_member', { p_org: org.id }],
    ['auth_is_org_admin', { p_org: org.id }],
    ['auth_is_workspace_member', { p_workspace: ws.id }],
  ]) {
    const { data, error } = await supabase.rpc(fn, arg)
    console.log(`${fn} =>`, data, error ? '(err: ' + error.message + ')' : '')
  }

  const { data: board, error: be } = await supabase.from('boards').insert({ workspace_id: ws.id, name: 'b' }).select().single()
  console.log('board insert:', board?.id || 'FAILED', be?.message || '')

  await supabase.from('organizations').delete().eq('id', org.id)
}
run().catch((e) => { console.error('ERR', e.message) })
