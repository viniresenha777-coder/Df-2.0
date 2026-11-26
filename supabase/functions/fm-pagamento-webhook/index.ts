// Fronteira Morta — aviso do Mercado Pago (webhook). Nunca confia no conteúdo do aviso:
// consulta o pagamento na API do Mercado Pago e só marca o pedido como "pago" se estiver aprovado,
// em reais e com o valor exato do pacote. O jogo resgata os créditos com fm_compra_resgatar.
// Segredos: MP_ACCESS_TOKEN e (recomendado) MP_WEBHOOK_SECRET — a "assinatura secreta" dos webhooks no painel do Mercado Pago.
import { createClient } from "npm:@supabase/supabase-js@2";

function adminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { return ""; }
}
async function hmacHex(secret: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const ok = () => new Response("ok", { status: 200 });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let body: any = {};
  try { body = await req.json(); } catch { /* aviso sem corpo */ }
  const tipo = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  const id = String(body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id") || "");
  if (tipo !== "payment" || !/^\d+$/.test(id)) return ok();

  // assinatura do Mercado Pago (x-signature: ts=...,v1=...)
  const segredo = Deno.env.get("MP_WEBHOOK_SECRET");
  if (segredo) {
    const sig = req.headers.get("x-signature") || "", rid = req.headers.get("x-request-id") || "";
    const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=")));
    const manifest = `id:${id};request-id:${rid};ts:${parts.ts};`;
    if (!parts.v1 || (await hmacHex(segredo, manifest)) !== parts.v1) return new Response("assinatura", { status: 401 });
  }

  const token = Deno.env.get("MP_ACCESS_TOKEN") || "";
  if (!token) return ok();
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return new Response("consulta", { status: 502 });   // Mercado Pago tenta de novo depois
  const pg = await r.json();
  const ref = String(pg.external_reference || "");
  if (!/^[0-9a-f-]{36}$/.test(ref)) return ok();

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), { auth: { persistSession: false } });
  const { data: c } = await admin.from("fm_compras").select("id,status,valor").eq("id", ref).maybeSingle();
  if (!c) return ok();

  if (pg.status === "approved" && pg.currency_id === "BRL" && Math.abs(Number(pg.transaction_amount) - Number(c.valor)) < 0.01) {
    await admin.from("fm_compras").update({ status: "pago", pago_em: new Date().toISOString(), mp_pagamento: id })
      .eq("id", ref).eq("status", "pendente");
  } else if (["refunded", "charged_back"].includes(pg.status)) {
    // estorno/cancelamento: o pedido vira "estornado" (se já tinha sido resgatado, resgatado_em fica preenchido
    // e o administrador vê no painel que os créditos já tinham sido entregues)
    if (c.status !== "estornado") await admin.from("fm_compras").update({ status: "estornado", mp_pagamento: id }).eq("id", ref);
  }
  return ok();
});
