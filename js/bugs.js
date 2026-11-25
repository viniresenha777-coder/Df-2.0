"use strict";
// Reportar bug: botão na tela do jogo (tecla F8). O relatório vai para a tabela fm_bugs no Supabase,
// com informações automáticas (área, arma, versão, navegador e os últimos erros do jogo).
// O administrador avalia no painel F2 (aba "Bugs"); se aceitar, o jogador recebe créditos
// automaticamente (resgate único no servidor: fm_bug_resgatar).
const fmBugs = (() => {
  const db = () => fmCloud.socialClient();
  const uid = () => fmCloud.userId();
  const errs = [];
  let timer = null, busy = false, box = null, btn = null;

  // guarda os últimos erros do jogo para anexar ao relatório
  const remember = (m) => { errs.push(String(m).slice(0, 300)); if (errs.length > 8) errs.shift(); };
  window.addEventListener("error", (e) => remember((e.message || "erro") + " @" + (e.filename || "").split("/").pop() + ":" + (e.lineno || 0)));
  window.addEventListener("unhandledrejection", (e) => remember("promessa: " + (e.reason && e.reason.message || e.reason)));

  function contexto() {
    let w = null; try { w = curW().id; } catch (e) {}
    const ver = (document.querySelector('script[src*="jogo.min.js"]') || {}).src || "";
    return {
      versao: (ver.split("v=")[1] || "dev").slice(0, 20),
      area: game ? game.area : null, setor: typeof world !== "undefined" && world && world.name ? String(world.name).slice(0, 60) : null,
      dentro: !!(game && game.inside), x: player ? Math.round(player.x) : null, y: player ? Math.round(player.y) : null,
      arma: w, nivel: player ? player.level : null, grafico: typeof save !== "undefined" ? save.gfx : null,
      tela: innerWidth + "x" + innerHeight, navegador: navigator.userAgent.slice(0, 180), erros: errs.slice()
    };
  }

  const css = `
  #fmBugBtn{position:fixed;right:10px;bottom:10px;z-index:30;font:600 12px system-ui,sans-serif;color:#e5e0c8;
    background:rgba(20,22,18,.78);border:1px solid #6a6450;border-radius:6px;padding:6px 10px;cursor:pointer;display:none}
  #fmBugBtn:hover{background:rgba(60,52,30,.92);border-color:#d9a52b;color:#ffd96a}
  #fmBugBox{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.55)}
  #fmBugBox .p{width:min(560px,92vw);background:#1b1d18;border:1px solid #6a6450;border-radius:10px;padding:18px 20px;color:#e5e0c8;
    font:14px system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  #fmBugBox h3{margin:0 0 6px;font-size:18px;color:#ffd96a}
  #fmBugBox p{margin:0 0 10px;color:#b9b49c;font-size:13px;line-height:1.4}
  #fmBugBox textarea{width:100%;box-sizing:border-box;height:140px;resize:vertical;background:#11120f;color:#e5e0c8;border:1px solid #4a4638;
    border-radius:6px;padding:8px;font:14px system-ui,sans-serif}
  #fmBugBox .r{display:flex;gap:8px;justify-content:flex-end;margin-top:10px;align-items:center}
  #fmBugBox .r span{flex:1;font-size:12px;color:#a9a58f}
  #fmBugBox button{font:600 13px system-ui,sans-serif;border-radius:6px;padding:7px 14px;cursor:pointer;border:1px solid #6a6450;background:#2a2c25;color:#e5e0c8}
  #fmBugBox button.ok{background:#8a6a1f;border-color:#d9a52b;color:#fff}
  #fmBugBox button:disabled{opacity:.5;cursor:default}
  #fmBugBox .lista{margin-top:12px;max-height:150px;overflow:auto;font-size:12px;color:#b9b49c;border-top:1px solid #33352c;padding-top:8px}
  #fmBugBox .lista div{padding:3px 0}`;

  function build() {
    if (btn) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    btn = document.createElement("button"); btn.id = "fmBugBtn"; btn.textContent = "🐞 Reportar bug (F8)";
    btn.addEventListener("click", (e) => { e.preventDefault(); open(); btn.blur(); });
    document.body.appendChild(btn);
    box = document.createElement("div"); box.id = "fmBugBox";
    box.innerHTML = `<div class="p"><h3>Reportar bug</h3>
      <p>Conte o que aconteceu, onde você estava e o que fez antes. Relatórios confirmados pela equipe
      rendem <b>créditos</b> (de 50 a 500, conforme a gravidade), entregues automaticamente no jogo.</p>
      <textarea maxlength="2000" placeholder="Ex.: Ao entrar na casa do setor G11 com a AK-47, o personagem atravessou a parede da cozinha..."></textarea>
      <div class="r"><span class="st">Área, arma, versão e erros do jogo são anexados sozinhos.</span>
      <button class="x">Fechar</button><button class="ok">Enviar</button></div>
      <div class="lista"></div></div>`;
    document.body.appendChild(box);
    box.querySelector(".x").addEventListener("click", close);
    box.querySelector(".ok").addEventListener("click", send);
    box.addEventListener("mousedown", (e) => { if (e.target === box) close(); });
    box.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape") close(); });
    box.addEventListener("keyup", (e) => e.stopPropagation());
  }
  const isOpen = () => !!box && box.style.display === "flex";
  function open() {
    if (!fmCloud.isActive() || !uid()) { toast("Entre na sua conta para reportar bugs."); return; }
    build(); box.style.display = "flex";
    const ta = box.querySelector("textarea"); ta.focus();
    for (const k in keys) keys[k] = false;                       // solta as teclas presas do jogo
    listMine();
  }
  function close() { if (box) box.style.display = "none"; }
  const status = (t) => { box.querySelector(".st").textContent = t; };

  async function send() {
    const ta = box.querySelector("textarea"), b = box.querySelector(".ok"), texto = ta.value.trim();
    if (texto.length < 15) { status("Descreva com pelo menos 15 caracteres."); return; }
    b.disabled = true; status("Enviando...");
    try {
      const { error } = await db().from("fm_bugs").insert({ jogador: uid(), texto, contexto: contexto() });
      if (error) throw error;
      ta.value = ""; status("Enviado! Obrigado. Se for confirmado, os créditos chegam sozinhos.");
      toast("Bug reportado. Obrigado!");
      listMine();
    } catch (e) { status("Não foi possível enviar: " + (e.message || e)); }
    finally { b.disabled = false; }
  }
  async function listMine() {
    const el = box && box.querySelector(".lista"); if (!el) return;
    try {
      const { data, error } = await db().from("fm_bugs").select("texto,status,recompensa,resposta,criado_em")
        .eq("jogador", uid()).order("criado_em", { ascending: false }).limit(10);
      if (error) throw error;
      const nome = { aberto: "em análise", aceito: "ACEITO", recusado: "não confirmado", duplicado: "já reportado" };
      el.innerHTML = (data || []).length ? "<b>Seus relatórios:</b>" : "";
      for (const r of data || []) {
        const d = document.createElement("div");
        d.textContent = `${new Date(r.criado_em).toLocaleDateString("pt-BR")} · ${nome[r.status] || r.status}` +
          (r.status === "aceito" ? ` · +${r.recompensa} créditos` : "") + (r.resposta ? ` · "${r.resposta}"` : "") +
          ` — ${r.texto.slice(0, 70)}${r.texto.length > 70 ? "…" : ""}`;
        el.appendChild(d);
      }
    } catch (e) { el.textContent = ""; }
  }

  // entrega das recompensas: o servidor só devolve os créditos uma vez por relatório
  async function poll() {
    if (busy || !fmCloud.isActive() || !uid() || !save.name || !save.prof || !world || game.over || game.savingExit || game.quitting) return;
    busy = true;
    try {
      const { data, error } = await db().from("fm_bugs").select("id,recompensa,texto")
        .eq("jogador", uid()).eq("status", "aceito").is("resgatado_em", null).gt("recompensa", 0).limit(10);
      if (error) throw error;
      for (const r of data || []) {
        const { data: n, error: e2 } = await db().rpc("fm_bug_resgatar", { bug: r.id });
        if (e2) throw e2;
        if (!(n > 0)) continue;
        save.credits = (save.credits || 0) + n;
        if (!Array.isArray(save.inbox)) save.inbox = [];
        save.inbox.push({ id: "bug-" + r.id, text: `Seu relatório de bug foi confirmado! +${n} créditos. Obrigado!`, createdAt: Date.now(), read: false });
        save.inbox = save.inbox.slice(-100);
        try { save.run = runSnapshot(); await storeWrite(JSON.stringify(save)); } catch (e) { persist(); }
        game.banner = { text: `+${n} CRÉDITOS`, sub: "Seu relatório de bug foi confirmado. Obrigado!", t: 4800, gold: true };
        toast(`Bug confirmado: +${n} créditos!`);
      }
    } catch (e) { console.warn("Recompensas de bug:", e); }
    finally { busy = false; }
  }

  // botão só aparece dentro do jogo (logado e com o mundo carregado)
  function tick() {
    const show = fmCloud.isActive() && !!uid() && typeof world !== "undefined" && !!world && game && !game.over;
    if (show) build();
    if (btn) btn.style.display = show && !isOpen() ? "block" : "none";
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => { tick(); }, 1000);
    setInterval(poll, 30000); setTimeout(poll, 5000);
    window.addEventListener("keydown", (e) => { if (e.key === "F8") { e.preventDefault(); isOpen() ? close() : open(); } });
  }

  // ----- administrador: lista e avaliação (painel F2, aba "Bugs") -----
  async function adminList() {
    const { data, error } = await db().from("fm_bugs").select("id,nome,texto,contexto,criado_em,status")
      .eq("status", "aberto").order("criado_em", { ascending: true }).limit(40);
    if (error) throw error;
    return data || [];
  }
  async function adminRate(id, creditos, resposta) {
    const st = creditos > 0 ? "aceito" : creditos === 0 ? "recusado" : "duplicado";
    const { error } = await db().rpc("fm_bug_avaliar", { bug: id, novo_status: st, creditos: Math.max(0, creditos), resposta_txt: resposta || "" });
    if (error) throw error;
    return st;
  }
  return { start, open, close, isOpen, poll, adminList, adminRate };
})();
