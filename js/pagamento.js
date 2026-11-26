"use strict";
// Compre Créditos: créditos com dinheiro real (Pix ou cartão) pelo Mercado Pago (Checkout Pro).
// O jogo só pede o link de pagamento (função fm-pagamento-criar). Quem libera os créditos é o servidor:
// o webhook do Mercado Pago marca o pedido em fm_compras como "pago" e o jogo resgata uma única vez
// com fm_compra_resgatar (o antitrapaça aceita esses créditos porque vêm de fm_compras).
const fmPagamento = (() => {
  const db = () => fmCloud.socialClient();
  const uid = () => fmCloud.userId();
  const PACOTES = [
    { id: "p200", cr: 200, valor: 9.9, bonus: "" },
    { id: "p550", cr: 550, valor: 24.9, bonus: "+10% de bônus" },
    { id: "p1200", cr: 1200, valor: 49.9, bonus: "+20% de bônus", tag: "MAIS VENDIDO" },
    { id: "p2600", cr: 2600, valor: 99.9, bonus: "+30% de bônus", tag: "MELHOR VALOR" },
  ];
  const KEY = "fm-compras-abertas";
  let box = null, busy = false, timer = null, lastVerif = 0;
  const brl = (v) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const abertas = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]").filter((c) => Date.now() - c.t < 48 * 3600e3); } catch (e) { return []; } };
  const guardar = (l) => { try { localStorage.setItem(KEY, JSON.stringify(l.slice(-10))); } catch (e) {} };

  const css = `
  #fmPayBox{position:fixed;inset:0;z-index:45;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.6)}
  #fmPayBox .p{width:min(760px,94vw);background:linear-gradient(#1d2019,#141611);border:1px solid #8a7130;border-radius:12px;padding:20px 22px;
    color:#e5e0c8;font:14px system-ui,sans-serif;box-shadow:0 12px 50px rgba(0,0,0,.7)}
  #fmPayBox h3{margin:0;font-size:22px;color:#ffd96a;display:flex;align-items:center;gap:10px}
  #fmPayBox h3 b{display:inline-flex;width:34px;height:34px;border-radius:50%;align-items:center;justify-content:center;
    background:radial-gradient(#f3d77a,#a8832a);color:#2a2008;font-size:22px}
  #fmPayBox .sub{margin:6px 0 14px;color:#b9b49c;font-size:13px}
  #fmPayBox .g{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
  #fmPayBox .c{position:relative;background:#11130f;border:1px solid #4a4638;border-radius:10px;padding:16px 10px 12px;text-align:center;cursor:pointer;transition:.15s}
  #fmPayBox .c:hover{border-color:#ffd96a;transform:translateY(-2px);box-shadow:0 6px 18px rgba(212,175,55,.25)}
  #fmPayBox .c .t{position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#c8483a;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:9px;white-space:nowrap}
  #fmPayBox .c .n{font-size:26px;font-weight:800;color:#ffd96a}
  #fmPayBox .c .u{font-size:12px;color:#a9a58f;margin-bottom:6px}
  #fmPayBox .c .b{font-size:12px;color:#7fd06a;min-height:16px}
  #fmPayBox .c .v{margin-top:10px;background:linear-gradient(#6e5a26,#463a19);border:1px solid #d4af37;border-radius:7px;padding:7px 0;font-weight:700;color:#f3ead0}
  #fmPayBox .st{margin-top:14px;min-height:20px;font-size:13px;color:#ffd96a}
  #fmPayBox .ft{margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:11px;color:#8a8672}
  #fmPayBox button.x{background:#2a2c26;color:#e5e0c8;border:1px solid #5a5648;border-radius:6px;padding:7px 14px;cursor:pointer;font:600 13px system-ui}
  @media (max-width:640px){#fmPayBox .g{grid-template-columns:repeat(2,1fr)}}`;

  function build() {
    if (box) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    box = document.createElement("div"); box.id = "fmPayBox";
    box.innerHTML = `<div class="p">
      <h3><b>$</b>Compre Créditos</h3>
      <div class="sub">Pague com <b>Pix</b> ou <b>cartão de crédito</b> pelo Mercado Pago. Os créditos entram na sua conta sozinhos assim que o pagamento for aprovado (Pix: na hora).</div>
      <div class="g"></div>
      <div class="st"></div>
      <div class="ft"><span>Pagamento processado pelo Mercado Pago · o jogo não vê os dados do seu cartão. 1 crédito = $500 no jogo.</span><button class="x">Fechar</button></div>
    </div>`;
    document.body.appendChild(box);
    const g = box.querySelector(".g");
    for (const p of PACOTES) {
      const c = document.createElement("div"); c.className = "c";
      c.innerHTML = `${p.tag ? `<div class="t">${p.tag}</div>` : ""}<div class="n">${p.cr.toLocaleString("pt-BR")}</div><div class="u">créditos</div>
        <div class="b">${p.bonus}</div><div class="v">${brl(p.valor)}</div>`;
      c.onclick = () => comprar(p);
      g.appendChild(c);
    }
    box.querySelector("button.x").onclick = close;
    box.addEventListener("click", (e) => { if (e.target === box) close(); });
    box.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); });
  }
  const status = (t) => { if (box) box.querySelector(".st").textContent = t || ""; };
  function open() {
    if (!fmCloud.isActive() || !uid()) { toast("Entre na sua conta para comprar créditos."); return; }
    build(); box.style.display = "flex";
    status(abertas().length ? "Você tem um pagamento em andamento: os créditos entram assim que ele for aprovado." : "");
  }
  function close() { if (box) box.style.display = "none"; }
  const isOpen = () => !!box && box.style.display === "flex";

  async function comprar(p) {
    if (busy) return;
    // abre a aba já no clique (o navegador bloqueia janelas abertas depois de uma espera)
    const aba = window.open("", "_blank");
    if (aba) aba.document.write("<p style='font:16px system-ui;padding:30px'>Abrindo o pagamento seguro do Mercado Pago…</p>");
    busy = true; status("Gerando o pagamento…");
    try {
      const { data, error } = await db().functions.invoke("fm-pagamento-criar", { body: { pacote: p.id } });
      let erro = data && data.erro;
      if (error) { try { erro = (await error.context.json()).erro; } catch (e) { erro = erro || "falha"; } }
      if (erro || !data || !data.url) {
        if (aba) aba.close();
        status(erro === "nao_configurado" ? "A compra de créditos ainda não está disponível. Volte em breve!"
          : erro === "muitos_pedidos" ? "Você abriu muitos pagamentos seguidos. Termine um deles ou espere um pouco."
          : erro === "login" ? "Sua sessão expirou: entre de novo na conta." : "Não foi possível gerar o pagamento agora. Tente de novo.");
        return;
      }
      guardar([...abertas(), { id: data.compra, t: Date.now() }]);
      if (aba) aba.location.href = data.url; else window.location.href = data.url;
      status(`Pagamento de ${brl(p.valor)} aberto em outra aba${data.teste ? " (MODO DE TESTE)" : ""}. Os ${p.cr.toLocaleString("pt-BR")} créditos entram aqui sozinhos quando for aprovado.`);
      start(4000);
    } catch (e) {
      if (aba) aba.close();
      status("Não foi possível gerar o pagamento agora. Tente de novo.");
    } finally { busy = false; }
  }

  // resgata pedidos pagos; de tempos em tempos também pede ao servidor para conferir no Mercado Pago
  async function poll() {
    if (!fmCloud.isActive() || !uid() || !save.name || typeof world === "undefined" || !world || game.over || game.savingExit || game.quitting) return;
    const lista = abertas();
    try {
      if (lista.length && Date.now() - lastVerif > 30000) {
        lastVerif = Date.now();
        for (const c of lista) await db().functions.invoke("fm-pagamento-criar", { body: { verificar: c.id } }).catch(() => {});
      }
      const { data, error } = await db().from("fm_compras").select("id,creditos").eq("jogador", uid()).eq("status", "pago").limit(10);
      if (error) throw error;
      for (const r of data || []) {
        const { data: n, error: e2 } = await db().rpc("fm_compra_resgatar", { compra: r.id });
        if (e2) throw e2;
        guardar(abertas().filter((c) => c.id !== r.id));
        if (!(n > 0)) continue;
        save.credits = (save.credits || 0) + n;
        if (!Array.isArray(save.inbox)) save.inbox = [];
        save.inbox.push({ id: "compra-" + r.id, text: `Compra aprovada: +${n.toLocaleString("pt-BR")} créditos. Obrigado por apoiar o jogo!`, createdAt: Date.now(), read: false });
        save.inbox = save.inbox.slice(-100);
        try { save.run = runSnapshot(); await storeWrite(JSON.stringify(save)); } catch (e) { persist(); }
        game.banner = { text: `+${n.toLocaleString("pt-BR")} CRÉDITOS`, sub: "Compra aprovada. Obrigado por apoiar o jogo!", t: 5200, gold: true };
        if (typeof sfx !== "undefined" && sfx.buy) sfx.buy();
        status(`Pagamento aprovado: +${n.toLocaleString("pt-BR")} créditos!`);
      }
      // pedidos que não estão mais pendentes (cancelados/estornados) saem da lista local
      if (lista.length) {
        const { data: st } = await db().from("fm_compras").select("id,status").in("id", lista.map((c) => c.id));
        const fim = new Set((st || []).filter((x) => x.status !== "pendente" && x.status !== "pago").map((x) => x.id));
        if (fim.size) guardar(abertas().filter((c) => !fim.has(c.id)));
      }
    } catch (e) { console.warn("Compra de créditos:", e); }
  }
  function start(ms) {
    clearInterval(timer);
    timer = setInterval(poll, ms || (abertas().length ? 8000 : 60000));
    setTimeout(poll, 1500);
  }
  // voltando do Mercado Pago (?compra=ok): confere logo e limpa o endereço
  try {
    const q = new URLSearchParams(location.search).get("compra");
    if (q) { history.replaceState(null, "", location.pathname); lastVerif = 0; }
  } catch (e) {}
  return { open, close, isOpen, start, poll };
})();
