// Supabase Edge Function: create-user
// יצירת חשבון התחברות אמיתי למשתמש ע"י אדמין-ארגון, ללא רישום עצמי.
// פריסה:  supabase functions deploy create-user
// (SUPABASE_URL ו-SUPABASE_SERVICE_ROLE_KEY מוזרקים אוטומטית בפריסה.)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)

    // מי מבצע את הבקשה (לפי ה-JWT)
    const jwt = (req.headers.get('Authorization') || '').replace('Bearer ', '')
    const { data: { user: caller } } = await admin.auth.getUser(jwt)
    if (!caller) return json({ error: 'unauthorized' }, 401)

    const { email, password, full_name, org_id, team_id, team_role } = await req.json()
    if (!email || !password || !org_id) return json({ error: 'missing fields' }, 400)
    if (String(password).length < 6) return json({ error: 'password too short' }, 400)

    // לוודא שהמבקש הוא אדמין של הארגון
    const { data: mem } = await admin
      .from('members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', caller.id)
      .maybeSingle()
    if (!mem || mem.role !== 'admin') return json({ error: 'forbidden' }, 403)

    // יצירת המשתמש (מאומת אוטומטית) + הוספה כחבר ארגון
    const { data: created, error: ce } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
    })
    if (ce) return json({ error: ce.message }, 400)

    await admin.from('members').insert({
      org_id,
      user_id: created.user.id,
      email,
      full_name: full_name || email,
      role: 'member',
    })

    if (team_id) {
      await admin.from('team_members').insert({
        team_id,
        user_id: created.user.id,
        role: team_role || 'member',
      })
    }

    return json({ ok: true, user_id: created.user.id })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
