"use strict";
// Aviso de atualização: a cada 3 minutos o jogo confere a versão publicada no site (o ?v= do jogo.min.js
// no index.html). Se mudou, avisa no chat (e repete a cada 2 minutos) até o jogador recarregar a página.
const fmAtualizacao = (() => {
  const TEXTO = "ATUALIZA\u00c7\u00c3O DISPON\u00cdVEL! POR GENTILEZA, FA\u00c7A O RELOAD DA P\u00c1GINA (F5). OBRIGADO!";
  const tag = document.querySelector('script[src*="jogo.min.js"]');
  const minha = tag && (tag.getAttribute("src").match(/[?&]v=([\w-]+)/) || [])[1];
  let nova = false;
  function avisar() {
    if (typeof fmChat !== "undefined" && fmChat.alert) fmChat.alert(TEXTO);
    if (typeof game !== "undefined") game.banner = { text: "ATUALIZA\u00c7\u00c3O DISPON\u00cdVEL", sub: "Por gentileza, fa\u00e7a o reload da p\u00e1gina (F5). Obrigado!", t: 8000, gold: true };
  }
  async function conferir() {
    if (nova || !minha || document.hidden) return;
    try {
      const r = await fetch("/?versao=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return;
      const v = ((await r.text()).match(/jogo\.min\.js\?v=([\w-]+)/) || [])[1];
      if (v && v !== minha) { nova = true; avisar(); setInterval(avisar, 120000); }
    } catch (e) { /* sem rede: tenta de novo depois */ }
  }
  if (minha) { setInterval(conferir, 180000); document.addEventListener("visibilitychange", () => { if (!document.hidden) conferir(); }); }
  return { conferir };
})();
