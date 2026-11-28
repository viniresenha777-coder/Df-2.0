"use strict";
// =====================================================================
//  Ferro Velho (na base): vende qualquer item e desmonta armas em
//  peças de arma e sucata. Itens raros pedem confirmação antes.
//  Valores da economia oficial (renda de referência: ~$15.000/h na região azul).
// =====================================================================
const JUNK_RAR = [1000, 3000, 8000, 20000, 50000];  // piso de venda por raridade da arma
const RESET_STATS_PRICE = MATS.reset_stats.price;
const JUNK_CONS = { comum: 100, fresca: 200, podre: 20, water: 80, med: 400, anti: 600 };
let junkCodeInput = null;

function showJunkCodeInput(pending, x, y, w, h) {
  if (!junkCodeInput) {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = "off";
    input.placeholder = "—";
    input.setAttribute("aria-label", "Código de confirmação da venda");
    input.style.cssText = "position:fixed;z-index:100;box-sizing:border-box;margin:0;padding:0;text-align:center;border:1px solid #ac8b57;border-radius:5px;background:#14110d;color:#f2eedc;font:bold 16px sans-serif";
    input.addEventListener("input", () => {
      if (game.jconfirm?.entry) game.jconfirm.code = input.value = input.value.replace(/[^0-9]/g, "").slice(0, 3);
    });
    input.addEventListener("keydown", event => {
      event.stopPropagation();
      if (event.key === "Enter") { event.preventDefault(); confirmJunkAction(); }
      if (event.key === "Escape") { event.preventDefault(); game.jconfirm = null; }
    });
    input.hidden = true;
    document.body.appendChild(input);
    junkCodeInput = input;
  }
  const input = junkCodeInput;
  const rect = canvas.getBoundingClientRect();
  input.style.left = `${rect.left + x * rect.width / W}px`;
  input.style.top = `${rect.top + y * rect.height / H}px`;
  input.style.width = `${w * rect.width / W}px`;
  input.style.height = `${h * rect.height / H}px`;
  if (input.value !== pending.code) input.value = pending.code;
  if (input.hidden) { input.hidden = false; input.focus({ preventScroll: true }); }
}

// Regra geral do Ferro Velho: devolve 30% do que o item custa na loja (pagou $50 → recebe $15).
// Assim comprar e revender sempre dá prejuízo e 70% do dinheiro sai da economia.
const SCRAP_RATE = 0.3;
function weaponSellPrice(inst) {
  const d = WDEF[inst.id];
  if (d.scrap) return inst.gc ? d.scrapMC || d.scrap : d.scrap;   // valor fixo de sucata (MC = craft perfeito)
  if (d.shop) return Math.round(d.shop * SCRAP_RATE * (1 + upSum(inst) * 0.12));   // armas da Loja: 30% do preço
  return Math.round(Math.max(JUNK_RAR[d.rar] || 1000, (d.price || 0) * 3) * (1 + upSum(inst) * 0.12));
}
function weaponParts(inst) {
  const d = WDEF[inst.id], r = d.rar, up = upSum(inst);
  const out = { sucata: 1 + r + (d.cat === "machinegun" || d.cat === "shotguns" ? 1 : 0), pecas: 1 + r * 2 + Math.floor(up / 2) };
  if (r >= 3) out.eletronicos = r - 2;
  if (r >= 4 || d.legendary) out.nucleo = 1;
  if (d.melee) { out.pecas = Math.max(1, out.pecas - 1); }
  return out;
}
function partsText(p) { return Object.keys(p).map((k) => `${p[k]}x ${MATS[k].name}`).join(" + "); }
// implante vendido: scrap do implante = 30% do valor dele (créditos × $CREDIT_PRICE); Mimic (scrap 0) não vende
function implantSellPrice(im) { return IMP[im.id].scrap || 0; }
function matSellPrice(id) { return { sucata: 300, pecas: 700, eletronicos: 1100, nucleo: 8000, placa: 6000,
  placa_circuito: 20000, interface_implante: 20000, bateria_implante: 20000, sucata_rara: 12000, coracao_demonio: 60000 }[id] || Math.round(((MATS[id] && MATS[id].price) || 0) * SCRAP_RATE) || 100; }
// colete: 30% do preço (créditos contam a $CREDIT_PRICE cada), proporcional à durabilidade;
// coletes com valor fixo (Natalino) pagam o valor cheio; MC = melhorias de Armadura e Velocidade no máximo
function vestSellPrice(i, dur, upgrades) {
  const v = VESTS[i];
  if (v.scrap) { const u = upgrades ?? vestUpgrade(i); return u.armor >= VEST_UP_MAX && u.speed >= VEST_UP_MAX ? v.scrapMC || v.scrap : v.scrap; }
  const base = v.price || (v.credits || 0) * 500;   // valor de referência: $500 por crédito
  return Math.round(base * SCRAP_RATE * ((dur ?? vestDur(i)) / 100)) || 20;
}
function ammoSellPrice(t) { return Math.max(0.5, ammoPackPrice(t) / AMMO_PACK_SIZE * SCRAP_RATE); }

function junkEquipmentAvailable(e) {
  if (e.kind === "weapon") return player.pack.includes(e.it) && !fmStashItemEquipped({ type: "weapon", item: e.it });
  if (e.kind === "implant") return player.bag.includes(e.im) && !fmStashItemEquipped({ type: "implant", item: e.im });
  if (e.kind === "vest") return !!save.vestsOwned[e.idx] && !fmStashItemEquipped({ type: "vest", item: { i: e.idx } });
  return true;
}
function junkEntryAvailable(e) {
  if (!e || e.it?.validadeDias || e.im?.validadeDias || e.it?.tokenBound || e.im?.tokenBound) return false;
  return junkEquipmentAvailable(e) && (e.kind !== "mat" || player.pack.includes(e.it));
}
function junkLegendary(e) {
  const definition = e.kind === "weapon" ? WDEF[e.it.id] : e.kind === "vest" ? VESTS[e.idx] :
    e.kind === "mat" ? MATS[e.it.id] : e.kind === "implant" ? IMP[e.im.id] : null;
  return definition?.rar === 4 || definition?.legendary === true;
}
// tudo o que você pode vender, numa lista só
function junkItems() {
  const L = [];
  player.pack.forEach((it) => {
    if (it.kind === "mat" && it.id === "reset_stats") return; // cartão consumível não é revendido
    if (it.kind === "weapon") L.push({ kind: "weapon", it, where: "pack", name: instName(it), unit: weaponSellPrice(it), qty: 1, rare: WDEF[it.id].rar >= 2, sub: "mochila" });
    else if (it.kind === "mat") L.push({ kind: "mat", it, name: MATS[it.id].name, unit: matSellPrice(it.id), qty: it.qty, rare: it.id === "nucleo" || it.id === "placa", sub: "material" });
  });
  for (const t of Object.keys(AMMO)) if (sellableAmmo(t) > 0) L.push({ kind: "ammo", t, name: `Munição ${t}`, unit: ammoSellPrice(t), qty: sellableAmmo(t), rare: false, sub: "balas" });
  for (const q of ["fresca", "comum", "podre"]) if (player.foodQ[q] > 0) L.push({ kind: "food", q, name: FOOD_Q[q].name[0].toUpperCase() + FOOD_Q[q].name.slice(1), unit: JUNK_CONS[q], qty: player.foodQ[q], sub: "comida" });
  if (player.water > 0) L.push({ kind: "water", name: "Garrafa de água", unit: JUNK_CONS.water, qty: player.water, sub: "água" });
  if (player.med > 0) L.push({ kind: "med", name: "Kit médico", unit: JUNK_CONS.med, qty: player.med, sub: "remédio" });
  if (player.anti > 0) L.push({ kind: "anti", name: "Antibiótico", unit: JUNK_CONS.anti, qty: player.anti, sub: "remédio" });
  player.bag.forEach((im) => {
    if (im.tokenBound) return; // itens do Token Mestre não são revendáveis
    L.push({ kind: "implant", im, name: implantName(im), unit: implantSellPrice(im), qty: 1, rare: true, sub: "implante (não instalado)" });
  });
  const vestScrap = vestSellPrice;
  VESTS.forEach((v, i) => { if (save.vestsOwned[i] && i !== save.vest) L.push({ kind: "vest", idx: i, name: v.name, unit: vestScrap(i), qty: 1, rare: v.rar >= 2, sub: `colete guardado · ${Math.round(vestDur(i))}%` }); });
  return L.filter(junkEntryAvailable);
}
function sellableAmmo(t) { return Math.max(0, player.reserve[t] - (player.tokenAmmo[t] || 0)); }
function sellEntry(e, n, confirmation) {
  if (!atBase() || !junkEntryAvailable(e)) {
    toast("Item indisponível para venda. Desequipe-o se estiver em uso.");
    return;
  }
  if (junkLegendary(e) && (!confirmation || confirmation !== game.jconfirm ||
      confirmation.entry !== e || confirmation.quantity !== n || confirmation.code !== "132")) return;
  if (e.kind === "ammo") {
    n = Math.min(n, sellableAmmo(e.t));
    if (n <= 0) return;
  }
  n = Math.max(1, Math.min(n, e.qty));
  if (e.kind === "mat" && e.it.qty < n) { toast("A quantidade mudou. Confira o item e tente novamente."); return; }
  if (confirmation) game.jconfirm = null;
  const total = Math.max(1, Math.round(e.unit * n));
  switch (e.kind) {
    case "weapon": player.pack.splice(player.pack.indexOf(e.it), 1); break;
    case "mat": e.it.qty -= n; if (e.it.qty <= 0) player.pack.splice(player.pack.indexOf(e.it), 1); break;
    case "ammo": player.reserve[e.t] -= n; break;
    case "food": player.foodQ[e.q] -= n; player.food -= n; break;
    case "water": player.water -= n; break;
    case "med": player.med -= n; break;
    case "anti": player.anti -= n; break;
    case "implant": player.bag.splice(player.bag.indexOf(e.im), 1); break;
    case "vest": save.vestsOwned[e.idx] = false; if (save.vestDur) delete save.vestDur[e.idx];
      if (Array.isArray(save.vestSemTroca) && save.vestSemTroca.includes(e.idx)) save.vestSemTroca.splice(save.vestSemTroca.indexOf(e.idx), 1); break;
  }
  game.money += total; logMoney("Ferro Velho", (n > 1 ? n + "x " : "") + e.name, total); sfx.buy(); checkpoint("venda no Ferro Velho");
  toast(`Vendeu ${n > 1 ? `${n}x ` : ""}${e.name} por $${total}`);
  game.jcur = Math.max(0, Math.min(game.jcur, junkItems().length - 1));
}
function dismantle(e) {
  if (!atBase() || e?.kind !== "weapon" || !junkEntryAvailable(e)) return;
  const p = weaponParts(e.it);
  player.pack.splice(player.pack.indexOf(e.it), 1);
  let toVault = false;
  for (const k in p) if (!addMat(k, p[k])) { addMat(k, p[k], save.vault, VAULT_MAX); toVault = true; }
  sfx.reload(); checkpoint("desmontagem no Ferro Velho");
  toast(`Desmontou ${e.name}: ${partsText(p)}${toVault ? " (parte foi para o baú)" : ""}`);
  game.jcur = Math.max(0, Math.min(game.jcur, junkItems().length - 1));
}
// itens raros pedem confirmação
function askSell(e, n) {
  if (!e || !junkEntryAvailable(e)) return;
  if (junkLegendary(e)) game.jconfirm = { entry: e, quantity: Math.max(1, Math.min(n, e.qty)), code: "" };
  else if (e.rare) game.jconfirm = { text: `Vender ${e.name}${n > 1 ? ` (${n}x)` : ""} por $${Math.round(e.unit * Math.min(n, e.qty))}?`, sub: "Item raro: depois de vendido não volta.", fn: () => sellEntry(e, n) };
  else sellEntry(e, n);
}

function confirmJunkAction() {
  const pending = game.jconfirm;
  if (!pending) return;
  if (pending.entry) {
    if (pending.code === "132") sellEntry(pending.entry, pending.quantity, pending);
    return;
  }
  game.jconfirm = null;
  pending.fn();
}
function askDismantle(e) {
  if (!e || e.kind !== "weapon" || !junkEntryAvailable(e)) return;
  const fn = () => dismantle(e);
  if (e.rare) game.jconfirm = { text: `Desmontar ${e.name}?`, sub: `Você recebe ${partsText(weaponParts(e.it))}. A arma some.`, fn };
  else fn();
}

function buyResetStatsCard() {
  if (!inSafe()) { toast("Compre o cartão no Ferro Velho da base."); return; }
  if (game.money < RESET_STATS_PRICE) { toast("Dinheiro insuficiente para o cartão."); return; }
  if (!addMat("reset_stats", 1)) { toast("Mochila cheia."); return; }
  game.money -= RESET_STATS_PRICE; logMoney("Compra", "cartão reset", -RESET_STATS_PRICE);
  sfx.buy();
  checkpoint("compra de cartão de reset");
  toast("Cartão Reset de Stats comprado! Abra a mochila (B) e arraste-o até o personagem.");
}
// o cartão não é mais vendido por dinheiro: o Ferro Velho faz o reset direto (grátis 1x por mês, senão 100 créditos)
function confirmBuyResetStats() {
  game.jconfirm = {
    text: resetIsFree() ? "Usar o reset grátis do mês?" : `Resetar atributos por ${RESET_STATS_CREDITS} créditos?`,
    sub: "Todos os pontos de atributo e proficiência voltam para você distribuir de novo.",
    fn: () => { game.jconfirm = null; resetStatsWithCredits(); }
  };
}

function junkKey(k) {
  const items = junkItems(), e = items[game.jcur | 0];
  if (game.jconfirm) {
    const pending = game.jconfirm;
    if (pending.entry) {
      if (/^[0-9]$/.test(k) && pending.code.length < 3) pending.code += k;
      else if (k === "backspace") pending.code = pending.code.slice(0, -1);
      else if (k === "enter") confirmJunkAction();
      else if (k === "escape") game.jconfirm = null;
      return;
    }
    if (k === "enter" || k === "y" || k === "s") confirmJunkAction();
    else if (k === "n" || k === "escape") game.jconfirm = null;
    return;
  }
  if (k === "escape" || k === "e") { game.menu = null; return; }
  if (k === "c") { confirmBuyResetStats(); return; }
  if (k === "w" || k === "arrowup") game.jcur = Math.max(0, (game.jcur | 0) - 1);
  else if (k === "s" || k === "arrowdown") game.jcur = Math.min(items.length - 1, (game.jcur | 0) + 1);
  else if (k === "enter" || k === "v") askSell(e, 1);
  else if (k === "t") askSell(e, e ? e.qty : 1);
  else if (k === "d") askDismantle(e);
}
function drawJunkItemIcon(e, x, y, scale) {
  if (e.kind === "weapon") drawWeaponSide(WDEF[e.it.id], x, y, scale);
  else if (e.kind === "mat") drawMatIcon(e.it.id, x, y, scale);
  else if (e.kind === "vest") drawVestIcon(e.idx, x, y, scale);
  else if (e.kind === "implant") drawEntryIcon({ type: "implant", im: e.im }, x, y, scale);
  else if (e.kind === "ammo") drawEntryIcon({ type: "ammo", ammo: e.t }, x, y, scale);
  else drawEntryIcon({ type: e.kind, spr: e.kind === "food" ? "beans" : e.kind === "water" ? "soda" : e.kind === "anti" ? "pills" : "medkit" }, x, y, scale);
}
function drawLegendarySale(pending) {
  const e = pending.entry;
  const cx = W / 2, top = H / 2 - 156;
  const total = Math.max(1, Math.round(e.unit * pending.quantity));
  ctx.fillStyle = "#281e10"; rr(cx - 235, top, 470, 312, 10); ctx.fill();
  ctx.strokeStyle = "#ffd96a"; ctx.lineWidth = 2; ctx.stroke();
  txt("Venda de item lendário", cx, top + 34, 20, "#ffd96a", "center", true);
  drawJunkItemIcon(e, cx, top + 77, 1.25);
  txt(`${e.name}${pending.quantity > 1 ? ` ×${pending.quantity}` : ""}`, cx, top + 121, 17, "#f2eedc", "center", true, 420);
  txt(`Valor da venda: $${total.toLocaleString("pt-BR")}`, cx, top + 147, 15, "#8fd08a", "center", true);
  txt("A venda é irreversível.", cx, top + 174, 13, "#f2b185", "center");
  txt("Digite o código 132 para confirmar", cx, top + 202, 13, "#f2eedc", "center");
  showJunkCodeInput(pending, cx - 68, top + 213, 136, 32);
  btn(cx - 169, top + 261, 154, 35, "Confirmar", confirmJunkAction, true, pending.code !== "132");
  btn(cx + 15, top + 261, 154, 35, "Cancelar", () => { game.jconfirm = null; });
}
function drawJunk() {
  game.jcur = game.jcur | 0;
  menuFrame("Ferro Velho", `Dinheiro: $${game.money}  ·  Desequipe os itens antes de vender ou desmontar.`);
  const items = junkItems();
  if (game.jcur >= items.length) game.jcur = Math.max(0, items.length - 1);
  // lista (com rolagem)
  const lx = 40, ly = 96, lw = 470, rh = 34, vis = 13;
  const top = Math.max(0, Math.min(game.jcur - 6, items.length - vis));
  if (!items.length) txt("Você não tem nada para vender.", lx + lw / 2, 260, 14, "#6d6a58", "center", true);
  items.slice(top, top + vis).forEach((e, k) => {
    const i = top + k, y = ly + k * rh, sel = i === game.jcur;
    rowBox(lx, y, lw, rh - 4, sel, e.rare ? "#7a5a2a" : null);
    const col = e.kind === "weapon" ? rarColor(WDEF[e.it.id]) : e.kind === "vest" ? RARITY[VESTS[e.idx].rar].color : e.rare ? "#ffd96a" : "#e5e0c8";
    txt(`${e.qty > 1 ? `${e.qty}x ` : ""}${e.name}`, lx + 10, y + 19, 13, col, "left", true, 260);
    txt(e.sub, lx + 280, y + 19, 10, "#a9a58f", "left", false, 100);
    txt(`$${e.qty > 1 ? `${Math.round(e.unit * 100) / 100} un.` : Math.round(e.unit)}`, lx + lw - 10, y + 19, 12, "#8fd08a", "right", true);
    rowClick(lx, y, lw, rh - 4, sel, () => { game.jcur = i; }, () => askSell(e, 1));
  });
  if (items.length > vis) txt(`${game.jcur + 1}/${items.length}`, lx + lw, ly - 6, 10, "#a9a58f", "right");
  // detalhe do item escolhido
  const e = items[game.jcur], px = 540, pw = 380;
  ctx.fillStyle = "rgba(0,0,0,0.3)"; rr(px - 10, 92, pw + 20, 458, 8); ctx.fill();
  if (e) {
    drawJunkItemIcon(e, px + pw / 2, 160, 1.5);
    txt(e.name, px, 240, 18, "#f2eedc", "left", true, pw);
    txt(e.qty > 1 ? `Você tem ${e.qty} · $${Math.round(e.unit * 100) / 100} cada · tudo por $${Math.round(e.unit * e.qty)}` : `Vende por $${Math.round(e.unit)}`, px, 262, 13, "#8fd08a", "left", true, pw);
    if (junkLegendary(e)) txt("★ Item lendário: venda protegida por código", px, 282, 12, "#ffd96a", "left", true);
    else if (e.rare) txt("★ Item raro: pede confirmação antes de vender", px, 282, 12, "#ffd96a", "left", true);
    let by = 300;
    btn(px, by, 180, 36, e.qty > 1 ? "Vender 1 (Enter)" : "Vender (Enter)", () => askSell(e, 1), true);
    if (e.qty > 1) btn(px + 196, by, 180, 36, `Vender tudo (T)`, () => askSell(e, e.qty));
    if (e.kind === "weapon") {
      by += 50;
      btn(px, by, 376, 36, "Desmontar (D)", () => askDismantle(e));
      txt(`Rende: ${partsText(weaponParts(e.it))}`, px, by + 56, 12, "#c9c4ad", "left", false, pw);
      txt("As peças vão para a mochila (ou para o baú, se não couber).", px, by + 74, 11, "#a9a58f", "left", false, pw);
    }
  } else txt("Nada selecionado", px + pw / 2, 280, 14, "#6d6a58", "center");

  // Cartão de reset no espaço inferior do Ferro Velho, abaixo dos comandos
  // de vender/desmontar, sem cobrir detalhes de armas ou outros itens.
  ctx.fillStyle = "rgba(45,35,15,0.96)"; rr(532, 444, 394, 101, 7); ctx.fill();
  ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 1.5; ctx.stroke();
  txt("★ RESET DE ATRIBUTOS", 547, 468, 16, "#ffdf70", "left", true);
  txt(resetIsFree() ? "Reset grátis disponível (1 por mês, não acumula)" : `Próximo grátis ${resetFreeIn()} · agora ${RESET_STATS_CREDITS} créditos`, 547, 488, 11, "#d8d2ba");
  // Miniatura original no canto superior direito do cartão, como solicitado.
  if (RESET_CARD_ART.complete && RESET_CARD_ART.naturalWidth) {
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(RESET_CARD_ART, 815, 446, 100, 47);
  }
  btn(547, 496, 362, 39, "RESETAR · " + resetStatsLabel().toUpperCase() + " (C)", confirmBuyResetStats, true);

  hint("C reseta atributos · W/S escolhe · Enter vende · T vende tudo · D desmonta · Esc fecha");
  // confirmação para itens raros
  if (game.jconfirm) {
    const c = game.jconfirm;
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
    regClick(0, 0, W, H, () => {}); // bloqueia cliques atrás da confirmação
    if (c.entry) { drawLegendarySale(c); return; }
    ctx.fillStyle = "rgba(40,30,16,0.97)"; rr(W / 2 - 230, 200, 460, 190, 10); ctx.fill();
    ctx.strokeStyle = "#ffd96a"; ctx.lineWidth = 2; ctx.stroke();
    txt("CONFIRMAR", W / 2, 232, 13, "#ffd96a", "center", true);
    txt(c.text, W / 2, 268, 17, "#f2eedc", "center", true, 430);
    txt(c.sub, W / 2, 292, 12, "#c9c4ad", "center", false, 430);
    btn(W / 2 - 170, 320, 150, 42, "SIM (Enter)", confirmJunkAction, true);
    btn(W / 2 + 20, 320, 150, 42, "NÃO (Esc)", () => { game.jconfirm = null; });
  }
}
