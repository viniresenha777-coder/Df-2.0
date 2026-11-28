const SUPABASE_URL = 'https://udoxuzyvyuxrqektdrxf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8serkqz1z5k9fZLnDxMNlQ_hv_PF88z';
const ADMIN_ID_SHA256 = '7bdfcb33861b484cb3c6e8341dd1bb8645f08ffc9ea0fb1ce9106bd838505921';

export function maintenanceEnabled(env) {
  return env.FM_MAINTENANCE !== 'off';
}

export async function maintenanceAccess(request, env) {
  if (!maintenanceEnabled(env)) return 200;
  const authorization = request.headers.get('Authorization');
  if (!authorization || !/^Bearer [^\s]+$/.test(authorization)) return 403;
  try {
    const response = await fetch(new URL('/auth/v1/user', env.FM_SUPABASE_URL || SUPABASE_URL), {
      headers: { authorization, apikey: env.FM_SUPABASE_KEY || SUPABASE_KEY },
      signal: AbortSignal.timeout(8000),
    });
    if (response.status === 401 || response.status === 403) return 403;
    if (!response.ok) return 503;
    const user = await response.json();
    if (typeof user.id !== 'string') return 403;
    const idHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.id));
    const fingerprint = Array.from(new Uint8Array(idHash), byte => byte.toString(16).padStart(2, '0')).join('');
    return fingerprint === (env.FM_MAINTENANCE_ADMIN_SHA256 || ADMIN_ID_SHA256) ? 200 : 403;
  } catch {
    return 503;
  }
}
