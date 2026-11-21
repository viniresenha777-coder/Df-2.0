// Só o código empacotado e embaralhado é entregue; os arquivos-fonte de js/ respondem "não encontrado".
const PUBLICOS = new Set(["/js/jogo.min.js", "/js/conta.min.js", "/js/recuperar.min.js"]);
export async function onRequest(ctx) {
  const caminho = new URL(ctx.request.url).pathname;
  if (PUBLICOS.has(caminho)) return ctx.next();
  return new Response("Not found", { status: 404 });
}
