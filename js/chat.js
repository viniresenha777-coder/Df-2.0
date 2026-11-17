"use strict";
// =====================================================================
//  Chat global: Enter abre, digita, Enter envia, Esc fecha.
//  As mensagens ficam no Supabase (tabela fm_chat, supabase/configurar-chat.sql), que confere
//  quem envia, o nome, o tamanho, o limite de velocidade e o banimento. Chegam na hora pelo Realtime.
//  O texto é mostrado sempre como texto puro (nunca como HTML).
// =====================================================================
const fmChat = (() => {
  const MAX_LINES = 60, SHOW_MS = 12000, FADE_MS = 2000;
  let box = null, log = null, input = null, open = false, started = false, channel = null;
  const lines = [];
  const db = () => fmCloud.socialClient();

  function build() {
    if (box) return;
    const stage = document.querySelector(".stage");
    if (!stage) return;
    box = document.createElement("div");
    box.id = "fm-chat";
    log = document.createElement("div");
    log.className = "fm-chat-log";
    input = document.createElement("input");
    input.className = "fm-chat-input";
    input.maxLength = 200;
    input.placeholder = "Mensagem para todos · Enter envia · Esc fecha";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); send(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    input.addEventListener("blur", () => { if (open) setTimeout(() => { if (open && document.activeElement !== input) close(); }, 0); });
    box.append(log, input);
    stage.appendChild(box);
    setInterval(render, 500);          // apaga as mensagens velhas quando o chat está fechado
  }

  function add(m, mine) {
    if (!m || typeof m.texto !== "string") return;
    if (m.id != null && lines.some((l) => l.id === m.id)) return;
    lines.push({ id: m.id, name: String(m.nome || ""), text: m.texto, at: performance.now(), mine: !!mine, sys: !!m.sys });
    while (lines.length > MAX_LINES) lines.shift();
    render(true);
  }
  function system(text) { add({ texto: text, sys: true }); }

  function render(force) {
    if (!log) return;
    const now = performance.now();
    const show = open ? lines.slice(-14) : lines.filter((l) => now - l.at < SHOW_MS + FADE_MS).slice(-6);
    if (!force && !open && !show.length && !log.childElementCount) return;
    log.replaceChildren(...show.map((l) => {
      const p = document.createElement("div");
      p.className = "fm-chat-line" + (l.sys ? " sys" : "");
      if (!l.sys) {
        const n = document.createElement("b");
        n.textContent = l.name + ": ";
        if (l.mine) n.className = "me";
        p.appendChild(n);
      }
      p.appendChild(document.createTextNode(l.text));
      if (!open) p.style.opacity = String(Math.max(0, Math.min(1, (SHOW_MS + FADE_MS - (now - l.at)) / FADE_MS)));
      return p;
    }));
    box.classList.toggle("open", open);
  }

  async function start() {
    if (started || !fmCloud.isActive() || !db()) return;
    started = true;
    build();
    try {
      const { data, error } = await db().from("fm_chat").select("id,nome,texto,criado_em,jogador")
        .order("criado_em", { ascending: false }).limit(30);
      if (error) throw error;
      const me = fmCloud.userId();
      (data || []).reverse().forEach((m) => { add(m, m.jogador === me); });
      lines.forEach((l) => { l.at = -1e9; });     // histórico só aparece com o chat aberto
      channel = db().channel("fm-chat-global")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "fm_chat" },
          (ev) => add(ev.new, ev.new && ev.new.jogador === fmCloud.userId()))
        .subscribe();
    } catch (err) {
      console.warn("Chat indisponível:", err);
      started = false;
    }
  }

  function openChat() {
    if (!box) build();
    if (!box) return;
    if (!started) start();
    open = true;
    for (const k in keys) keys[k] = false;      // o personagem para de andar enquanto digita
    mouse.down = false;
    box.classList.add("open");
    input.value = "";
    input.focus();
    render(true);
  }
  function close() {
    open = false;
    if (input) input.blur();
    render(true);
  }
  async function send() {
    const text = input.value.trim();
    if (!text) { close(); return; }
    if (!started) { system("O chat ainda está conectando. Tente de novo em instantes."); return; }
    input.value = "";
    try {
      const { data, error } = await db().from("fm_chat").insert({ texto: text }).select("id,nome,texto,jogador").single();
      if (error) throw error;
      add(data, true);
      close();                                     // enviou: volta para o jogo
    } catch (err) {
      const msg = err && err.message || "";
      system(/relation .*fm_chat|does not exist|schema cache/i.test(msg)
        ? "O chat ainda não foi ativado no servidor (supabase/configurar-chat.sql)."
        : /row-level security/i.test(msg) ? "Você não pode enviar mensagens agora." : msg || "Mensagem não enviada.");
    }
  }
  return { start, open: openChat, close, typing: () => open };
})();
