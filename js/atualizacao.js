"use strict";
// O jogador escolhe quando atualizar. A navegação só acontece após a confirmação do save.
const fmAtualizacao = (() => {
  const tag = document.querySelector('script[src*="jogo.min.js"]');
  const minha = tag && (tag.getAttribute("src").match(/[?&]v=([\w-]+)/) || [])[1];
  let botao = null;
  function avisar(texto) {
    if (typeof fmChat !== "undefined" && fmChat.alert) fmChat.alert(texto);
    game.banner = { text: texto, sub: "", t: 6500, gold: true };
  }
  async function salvarEAtualizar() {
    if (game.updateSaving) return;
    if (game.trans || game.marketBusy || game.savingExit || game.over || game.quitting) {
      avisar(game.over ? "Volte à base antes de atualizar." : "Aguarde a operação terminar e tente novamente.");
      return;
    }
    game.updateSaving = true;
    mouse.down = false;
    if (botao) botao.disabled = true;
    let confirmado = false;
    try {
      confirmado = await checkpoint("atualização");
      if (confirmado) window.location.reload();
    } catch (erro) {
      confirmado = false;
      console.error("Falha ao salvar antes de atualizar:", erro);
    } finally {
      if (!confirmado) {
        game.updateSaving = false;
        if (botao) botao.disabled = false;
        avisar("O salvamento não foi confirmado. Tente atualizar novamente.");
      }
    }
  }
  async function conferir() {
    if (botao || !minha || document.hidden) return;
    try {
      const r = await fetch(location.pathname + "?versao=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const v = ((await r.text()).match(/jogo\.min\.js\?v=([\w-]+)/) || [])[1];
      if (!v || v === minha || botao) return;
      botao = document.createElement("button");
      botao.type = "button";
      botao.textContent = "Salvar e atualizar";
      botao.style.cssText = "position:fixed;bottom:12px;right:12px;z-index:99;padding:10px 16px;background:#262820;color:#ffe0a3;border:1px solid #a99356;cursor:pointer";
      botao.onclick = salvarEAtualizar;
      document.body.appendChild(botao);
      avisar("Nova versão disponível. Use Salvar e atualizar quando quiser.");
    } catch (_) { /* Sem rede: verificar novamente depois. */ }
  }
  window.addEventListener("keydown", e => {
    if (!(e.key === "F5" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r"))) return;
    if (typeof game === "undefined" || !game || !save.name || !save.prof) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!e.repeat) salvarEAtualizar();
  }, true);
  if (minha) {
    setInterval(conferir, 180000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) conferir(); });
  }
  return { conferir };
})();
