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
  const { data, error } = await supabase.rpc('debug_boards_policies')
  if (error) { console.log('ERR:', error.message); return }
  console.log('מספר חוקים על boards:', data.length)
  for (const p of data) {
    console.log(`- ${p.policyname} | cmd=${p.cmd} | permissive=${p.permissive}`)
    console.log(`    USING: ${p.qual}`)
    console.log(`    CHECK: ${p.with_check}`)
  }
}
run().catch((e) => console.error(e.message))
