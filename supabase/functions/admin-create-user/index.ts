// ============================================================
//  Edge Function : admin-create-user
//
//  Crée un compte utilisateur SANS envoi d'email de confirmation
//  (email_confirm: true). Réservé aux owner / admin du projet.
//
//  Auth : nécessite un JWT d'utilisateur authentifié dont le rôle
//  (dans public.profiles) est 'owner' ou 'admin'.
// ============================================================
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'npm:@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Payload {
  email: string
  password: string
  full_name?: string
  role?: 'owner' | 'admin' | 'manager' | 'user'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'missing authorization header' }, 401)
    }

    // Identifie l'appelant via l'anon client (vérifie le JWT)
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    })
    const { data: userData, error: userErr } = await userClient.auth.getUser()
    if (userErr || !userData.user) {
      return json({ error: 'invalid token' }, 401)
    }

    // Vérifie le rôle de l'appelant via service_role (bypass RLS)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })
    const { data: caller } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .single()
    if (!caller || !['owner', 'admin'].includes(caller.role)) {
      return json({ error: 'forbidden' }, 403)
    }

    const body = (await req.json()) as Payload
    if (!body.email || !body.password) {
      return json({ error: 'email and password required' }, 400)
    }

    // Seul le owner peut créer un autre admin / owner
    let targetRole = body.role || 'user'
    if (caller.role === 'admin' && (targetRole === 'admin' || targetRole === 'owner')) {
      targetRole = 'manager'
    }

    // Crée le compte avec email DÉJÀ confirmé (pas d'email envoyé)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.full_name || '' },
    })
    if (createErr) {
      return json({ error: createErr.message }, 400)
    }

    // Le trigger handle_new_user créera le profil avec role par défaut = 'user'
    // (sauf si c'est le tout premier compte → owner).
    // On force le rôle souhaité ici.
    if (targetRole !== 'user') {
      await admin
        .from('profiles')
        .update({ role: targetRole, full_name: body.full_name || '' })
        .eq('id', created.user.id)
    } else if (body.full_name) {
      await admin
        .from('profiles')
        .update({ full_name: body.full_name })
        .eq('id', created.user.id)
    }

    return json({ ok: true, user: { id: created.user.id, email: created.user.email, role: targetRole } })
  } catch (err) {
    console.error('[admin-create-user] FATAL', err)
    return json({ error: err instanceof Error ? err.message : String(err) }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
