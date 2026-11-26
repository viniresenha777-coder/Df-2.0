"use strict";
// Dinheiro retido: quando um ganho passa do limite por hora ($2.000.000), o servidor não apaga o excesso:
// guarda em fm_dinheiro_retido como "Bloqueado" (em análise), junto com o registro de onde veio o dinheiro
// (save.dinLog). O ADM analisa no painel (F2 → Dinheiro retido) e libera (vai para o banco) ou nega.
const fmRetido = (() => {
  const db = () => fmCloud.socialClient();
  let total = 0, carregadoEm = 0, buscando = false, box = null, atual = null;
  const money = (v) => "$" + Math.round(Number(v) || 0).toLocaleString("pt-BR");

  // o save foi aceito com menos dinheiro do que o jogo mandou: tira localmente o que ficou retido
  window.addEventListener("fm-dinheiro-retido", ({ detail }) => {
    const m = Math.max(0, Number(detail.mochila) || 0), b = Math.max(0, Number(detail.banco) || 0);
    game.money = Math.max(0, game.money - m);
    save.bank = Math.max(0, save.bank - b);
    if (save.run && save.run.g) save.run.g.money = game.money;
    game.banner = { text: "DINHEIRO EM ANÁLISE", sub: money(m + b) + " passou do limite por hora e ficou Bloqueado no Banco até a análise.", t: 6000 };
    toast(money(m + b) + " ficou Bloqueado no Banco (em análise).");
    carregadoEm = 0; atualizar();
  });

  async function atualizar() {
    if (buscando || typeof fmCloud === "undefined" || !fmCloud.isActive()) return;
    buscando = true;
    try {
      const { data, error } = await db().rpc("fm_dinheiro_bloqueado");
      if (!error) total = Number(data) || 0;
    } catch (e) { /* tenta de novo depois */ }
    finally { buscando = false; carregadoEm = Date.now(); }
  }
  function bloqueado() {
    if (Date.now() - carregadoEm > 60000) atualizar();
    return total;
  }

  // ---------- ADM ----------
  async function adminList() {
    const { data, error } = await db().rpc("fm_dinheiro_retido_lista");
    if (error) throw error;
    return data || [];
  }
  async function revisar(id, liberar, nota) {
    const { data, error } = await db().rpc("fm_dinheiro_revisar", { retido: id, liberar, nota: nota || "" });
    if (error) throw error;
    return data;
  }

  const css = `
  #fmRetBox{position:fixed;inset:0;z-index:46;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.65)}
  #fmRetBox .p{width:min(900px,96vw);max-height:92vh;display:flex;flex-direction:column;background:linear-gradient(#1d2019,#141611);border:1px solid #8a7130;
    border-radius:12px;padding:18px 20px;color:#e5e0c8;font:13px system-ui,sans-serif;box-shadow:0 12px 50px rgba(0,0,0,.7)}
  #fmRetBox h3{margin:0 0 8px;font-size:20px;color:#ffd96a}
  #fmRetBox .info{display:grid;grid-template-columns:repeat(3,1fr);gap:6px 14px;margin-bottom:10px}
  #fmRetBox .info div span{display:block;color:#8a8672;font-size:11px}
  #fmRetBox .info div b{font-size:14px;word-break:break-all}
  #fmRetBox .res{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0 10px}
  #fmRetBox .res span{background:#11130f;border:1px solid #4a4638;border-radius:6px;padding:4px 8px}
  #fmRetBox .aviso{color:#e0a090;margin:4px 0 8px}
  #fmRetBox .tb{overflow:auto;flex:1;border:1px solid #3a382f;border-radius:8px}
  #fmRetBox table{width:100%;border-collapse:collapse}
  #fmRetBox th,#fmRetBox td{padding:4px 8px;border-bottom:1px solid #2a2922;text-align:left;white-space:nowrap}
  #fmRetBox th{position:sticky;top:0;background:#1b1c17;color:#b9b49c}
  #fmRetBox td.v{text-align:right;font-variant-numeric:tabular-nums}
  #fmRetBox td.pos{color:#7fd06a} #fmRetBox td.neg{color:#d08070}
  #fmRetBox .ft{display:flex;gap:8px;align-items:center;margin-top:12px}
  #fmRetBox input{flex:1;background:#11130f;color:#e5e0c8;border:1px solid #5a5648;border-radius:6px;padding:7px 9px;font:13px system-ui}
  #fmRetBox button{border-radius:6px;padding:8px 14px;cursor:pointer;font:600 13px system-ui;border:1px solid #5a5648;background:#2a2c26;color:#e5e0c8}
  #fmRetBox button.ok{background:#2d5a24;border-color:#7fd06a} #fmRetBox button.no{background:#5a2420;border-color:#d08070}
  #fmRetBox .st{margin-top:8px;min-height:18px;color:#ffd96a}`;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function build() {
    if (box) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    box = el("div"); box.id = "fmRetBox";
    box.innerHTML = `<div class="p"><h3>Dinheiro retido · análise</h3><div class="info"></div><div class="aviso"></div><div class="res"></div>
      <div class="tb"><table><thead><tr><th>Quando</th><th>Origem</th><th>Detalhe</th><th>Zona</th><th style="text-align:right">Valor</th></tr></thead><tbody></tbody></table></div>
      <div class="ft"><input placeholder="Nota (opcional, ex.: motivo da decisão)" maxlength="200"><button class="ok">Liberar para o banco</button><button class="no">Negar</button><button class="x">Fechar</button></div>
      <div class="st"></div></div>`;
    document.body.appendChild(box);
    box.querySelector("button.x").onclick = fechar;
    box.querySelector("button.ok").onclick = () => decidir(true);
    box.querySelector("button.no").onclick = () => decidir(false);
    box.addEventListener("click", (e) => { if (e.target === box) fechar(); });
    box.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") fechar(); });
  }
  function fechar() { if (box) box.style.display = "none"; atual = null; }
  const aberto = () => !!box && box.style.display === "flex";

  function abrir(r) {
    if (!fmCloud.isAdmin()) return;
    build(); atual = r;
    const quando = new Date(r.quando);
    const info = box.querySelector(".info"); info.textContent = "";
    [["Login", r.login || "?"], ["Personagem", r.nome || "?"], ["Quando", quando.toLocaleString("pt-BR")],
     ["Retido (Bloqueado)", money(r.valor)], ["Ganho nesse salvamento", money(r.ganho)], ["Ainda cabia no limite", money(r.permitido)],
     ["Banco · mochila depois", money(r.banco) + " · " + money(r.mochila)], ["Nível", String(r.nivel ?? "?")], ["Situação", r.status]]
      .forEach(([k, v]) => { const d = el("div"); d.appendChild(el("span", null, k)); d.appendChild(el("b", null, v)); info.appendChild(d); });
    const log = (Array.isArray(r.origem) ? r.origem : []).filter((e) => e && Number.isFinite(Number(e.t)));
    const hora = quando.getTime() - 3600e3;
    const naHora = log.filter((e) => Number(e.t) >= hora && Number(e.v) > 0);
    const explicado = naHora.reduce((a, e) => a + Number(e.v), 0);
    const ganhoHora = Number(r.ganho_hora) || Number(r.ganho) || 0;
    box.querySelector(".aviso").textContent = log.length
      ? `O registro do jogo mostra ${money(explicado)} ganhos na última hora, para ${money(ganhoHora)} que chegaram ao servidor nessa hora.` +
        (explicado < ganhoHora * 0.9 ? " O registro NÃO explica o valor: suspeito." : " O registro explica o valor.") +
        " (O registro vem do navegador do jogador e pode ter sido adulterado.)"
      : "Sem registro de origem: jogo desatualizado ou adulterado. Trate como suspeito.";
    const res = box.querySelector(".res"); res.textContent = "";
    const soma = {};
    naHora.forEach((e) => { soma[e.o] = (soma[e.o] || 0) + Number(e.v); });
    Object.entries(soma).sort((a, b) => b[1] - a[1]).forEach(([o, v]) => res.appendChild(el("span", null, `${o}: ${money(v)}`)));
    const tb = box.querySelector("tbody"); tb.textContent = "";
    log.slice().reverse().forEach((e) => {
      const tr = el("tr"), v = Number(e.v) || 0;
      tr.appendChild(el("td", null, new Date(Number(e.t)).toLocaleTimeString("pt-BR")));
      tr.appendChild(el("td", null, String(e.o || "")));
      tr.appendChild(el("td", null, String(e.d || "")));
      tr.appendChild(el("td", null, String(e.z ?? "")));
      tr.appendChild(el("td", "v " + (v >= 0 ? "pos" : "neg"), (v >= 0 ? "+" : "−") + money(Math.abs(v))));
      tb.appendChild(tr);
    });
    const pend = r.status === "retido";
    box.querySelector("button.ok").style.display = pend ? "" : "none";
    box.querySelector("button.no").style.display = pend ? "" : "none";
    box.querySelector("input").style.display = pend ? "" : "none";
    box.querySelector(".st").textContent = pend ? "" : `Já analisado: ${r.status}${r.nota ? " · " + r.nota : ""}`;
    box.style.display = "flex";
  }
  async function decidir(liberar) {
    if (!atual) return;
    const st = box.querySelector(".st");
    st.textContent = liberar ? "Liberando..." : "Negando...";
    try {
      await revisar(atual.id, liberar, box.querySelector("input").value);
      toast(liberar ? `Liberado: ${money(atual.valor)} vai para o banco de ${atual.nome}.` : "Dinheiro negado.");
      box.querySelector("input").value = "";
      fechar(); game.admRetido = null;
    } catch (e) { st.textContent = "Erro: " + (e.message || e); }
  }
  return { bloqueado, atualizar, adminList, abrir, aberto, fechar };
})();
