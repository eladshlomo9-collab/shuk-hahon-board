// Supabase Edge Function: reset-user-password
// איפוס סיסמה לחבר צוות קיים ע"י אדמין-ארגון, בלי תלות במייל/SMTP.
// פריסה:  supabase functions deploy reset-user-password
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

    const { user_id, org_id, password } = await req.json()
    if (!user_id || !org_id || !password) return json({ error: 'missing fields' }, 400)
    if (String(password).length < 6) return json({ error: 'password too short' }, 400)

    // לוודא שהמבקש הוא אדמין של הארגון
    const { data: callerMem } = await admin
      .from('members')
      .select('role')
      .eq('org_id', org_id)
      .eq('user_id', caller.id)
      .maybeSingle()
    if (!callerMem || callerMem.role !== 'admin') return json({ error: 'forbidden' }, 403)

    // לוודא שהיעד הוא חבר של אותו ארגון (לא ניתן לאפס סיסמה למשתמש מארגון אחר)
    const { data: targetMem } = await admin
      .from('members')
      .select('user_id')
      .eq('org_id', org_id)
      .eq('user_id', user_id)
      .maybeSingle()
    if (!targetMem) return json({ error: 'user not in this organization' }, 403)

    const { error: ue } = await admin.auth.admin.updateUserById(user_id, { password })
    if (ue) return json({ error: ue.message }, 400)

    return json({ ok: true })
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
