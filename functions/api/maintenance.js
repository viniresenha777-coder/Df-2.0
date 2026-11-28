import { maintenanceAccess, maintenanceEnabled } from '../maintenance.mjs';

export async function onRequestGet({ request, env }) {
  const status = await maintenanceAccess(request, env);
  return new Response(null, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-FM-Maintenance': maintenanceEnabled(env) ? 'on' : 'off' },
  });
}
