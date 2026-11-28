import { maintenanceAccess, maintenanceEnabled } from '../maintenance.mjs';

// Só o código empacotado e embaralhado é entregue; os arquivos-fonte de js/ respondem "não encontrado".
const PUBLICOS = new Set(["/js/jogo.min.js", "/js/conta.min.js", "/js/recuperar.min.js"]);
export async function onRequest(ctx) {
  const caminho = new URL(ctx.request.url).pathname;
  if (caminho === '/js/jogo.min.js' && maintenanceEnabled(ctx.env)) {
    const status = await maintenanceAccess(ctx.request, ctx.env);
    if (status !== 200) return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
    const asset = await ctx.next();
    const response = new Response(asset.body, asset);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  if (PUBLICOS.has(caminho)) return ctx.next();
  return new Response("Not found", { status: 404 });
}
