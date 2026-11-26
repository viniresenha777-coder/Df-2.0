// Fronteira Morta — compra de créditos com dinheiro real (Mercado Pago Checkout Pro: Pix e cartão).
// Chamada pelo jogo com o token do jogador. Cria o pedido em fm_compras e a preferência no Mercado Pago;
// os créditos só são liberados pelo webhook (fm-pagamento-webhook) quando o pagamento é aprovado.
// Segredo necessário (Edge Functions > Secrets): MP_ACCESS_TOKEN (TEST-... em teste, APP_USR-... em produção).
import { createClient } from "npm:@supabase/supabase-js@2";

const PACOTES: Record<string, { creditos: number; valor: number; nome: string }> = {
  p200: { creditos: 200, valor: 0.01, nome: "200 créditos" },   // TESTE: voltar para 9.9
  p550: { creditos: 550, valor: 24.9, nome: "550 créditos (+10%)" },
  p1200: { creditos: 1200, valor: 49.9, nome: "1.200 créditos (+20%)" },
  p2600: { creditos: 2600, valor: 99.9, nome: "2.600 créditos (+30%)" },
};
const SITE = "https://fronteiramorta.pages.dev/";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function adminKey() {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try { return JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default; } catch { return ""; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ erro: "metodo" }, 405);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, adminKey(), { auth: { persistSession: false } });

  // jogador logado (token da sessão do Supabase Auth)
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await admin.auth.getUser(jwt);
  if (ue || !u?.user) return json({ erro: "login" }, 401);
  const jogador = u.user.id;

  let body: { pacote?: string; verificar?: string } = {};
  try { body = await req.json(); } catch { /* vazio */ }
  const token = Deno.env.get("MP_ACCESS_TOKEN") || "";
  if (!token) return json({ erro: "nao_configurado" }, 503);

  // conferir na hora um pedido do próprio jogador (caso o webhook demore)
  if (body.verificar) {
    const { data: c } = await admin.from("fm_compras").select("id,status,valor").eq("id", body.verificar).eq("jogador", jogador).maybeSingle();
    if (!c) return json({ erro: "pedido" }, 404);
    if (c.status !== "pendente") return json({ status: c.status });
    const r = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${c.id}&sort=date_created&criteria=desc`, { headers: { Authorization: `Bearer ${token}` } });
    const lista = r.ok ? (await r.json()).results || [] : [];
    const ok = lista.find((p: any) => p.status === "approved" && p.currency_id === "BRL" && Math.abs(Number(p.transaction_amount) - Number(c.valor)) < 0.01);
    if (ok) {
      await admin.from("fm_compras").update({ status: "pago", pago_em: new Date().toISOString(), mp_pagamento: String(ok.id) }).eq("id", c.id).eq("status", "pendente");
      return json({ status: "pago" });
    }
    return json({ status: "pendente" });
  }

  const p = PACOTES[body.pacote || ""];
  if (!p) return json({ erro: "pacote" }, 400);

  // limite contra spam: no máximo 6 pedidos abertos por hora
  const desde = new Date(Date.now() - 3600e3).toISOString();
  const { count } = await admin.from("fm_compras").select("id", { count: "exact", head: true }).eq("jogador", jogador).eq("status", "pendente").gte("criado_em", desde);
  if ((count || 0) >= 6) return json({ erro: "muitos_pedidos" }, 429);

  const { data: compra, error: ce } = await admin.from("fm_compras")
    .insert({ jogador, pacote: body.pacote, creditos: p.creditos, valor: p.valor, status: "pendente" }).select("id").single();
  if (ce || !compra) return json({ erro: "pedido" }, 500);

  const pref = {
    items: [{ id: body.pacote, title: `Fronteira Morta · ${p.nome}`, description: "Créditos do jogo Fronteira Morta", category_id: "virtual_goods", quantity: 1, currency_id: "BRL", unit_price: p.valor }],
    external_reference: compra.id,
    metadata: { compra: compra.id, jogador },
    notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/fm-pagamento-webhook`,
    back_urls: { success: SITE + "?compra=ok", pending: SITE + "?compra=pendente", failure: SITE + "?compra=erro" },
    auto_return: "approved",
    statement_descriptor: "FRONTEIRAMORTA",
    payment_methods: { excluded_payment_types: [{ id: "ticket" }, { id: "atm" }], installments: 1 },
    expires: true,
    expiration_date_to: new Date(Date.now() + 24 * 3600e3).toISOString(),
  };
  const r = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Idempotency-Key": compra.id },
    body: JSON.stringify(pref),
  });
  if (!r.ok) {
    await admin.from("fm_compras").update({ status: "cancelado" }).eq("id", compra.id);
    return json({ erro: "mercadopago", detalhe: (await r.text()).slice(0, 300) }, 502);
  }
  const d = await r.json();
  await admin.from("fm_compras").update({ mp_preferencia: d.id }).eq("id", compra.id);
  const teste = token.startsWith("TEST-");
  return json({ compra: compra.id, url: teste ? d.sandbox_init_point || d.init_point : d.init_point, teste });
});
