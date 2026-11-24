"use strict";
// =====================================================================
//  Biblioteca de armas (tecla L): catálogo só para ver, sem vender.
//  Grade de categorias com a foto de uma arma de cada tipo; ao abrir uma
//  categoria, a lista das armas dela e os detalhes da escolhida.
// =====================================================================

const LIB_CATS = [
  { name: "Pistolas",              rep: "deagle",  has: (d) => d.cat === "pistols" },
  { name: "Submetralhadoras",      rep: "vector",  has: (d) => d.cat === "machinegun" && d.look === "smg" },
  { name: "Fuzis de assalto",      rep: "ak47",    has: (d) => d.cat === "machinegun" && d.look === "ar" },
  { name: "Metralhadoras pesadas", rep: "minigun", has: (d) => d.cat === "machinegun" && ["lmg", "minigun", "flamer"].includes(d.look) },
  { name: "Escopetas",             rep: "spas",    has: (d) => d.cat === "shotguns" },
  { name: "Rifles",                rep: "barrett", has: (d) => d.cat === "rifles" },
  { name: "Corpo a corpo",         rep: "katana",  has: (d) => d.cat === "melee" },
  { name: "Lendárias",             rep: "espadafogo", has: (d) => d.rar >= 4 }
];
const LIB = { cat: -1, sel: 0, tile: 0, scroll: 0 };
// armas de uma categoria (sem os punhos), das mais fracas para as mais raras
function libWeapons(i) {
  return WLIST.filter((d) => !d.fists && LIB_CATS[i].has(d)).sort((a, b) => a.rar - b.rar || a.req[1] - b.req[1] || a.dmg - b.dmg);
}
function openLibrary() { game.menu = "library"; LIB.cat = -1; LIB.sel = 0; LIB.scroll = 0; }
// onde se consegue a arma
function libSource(d) {
  if (RECIPES.some((r) => r.id === d.id)) return "Criada na oficina";
  if (d.credits) return `Loja de Créditos · ${d.credits.toLocaleString("pt-BR")} créditos (evento de Natal)`;
  if (d.eventOnly) return "Caixas de Natal (1%) · evento de Natal";
  if (d.legendary) return "Saques de VIP (lendária)";
  if (d.minLevel) return `Saques raros · a partir do nível ${d.minLevel}`;
  return d.price ? `Saques no mapa · vende por até $${Math.round(d.price * 0.3).toLocaleString("pt-BR")}` : "Saques raros no mapa";
}
// efeitos especiais escritos por extenso
function libEffects(d) {
  const e = [];
  if (d.pierce) e.push("atravessa zumbis");
  if (d.cryo) e.push(`❄ Cryo: deixa o zumbi ${Math.round(d.cryo * 100)}% mais lento por ${(d.cryoMs || 1000) / 1000}s`);
  if (d.noCrit) e.push("nunca dá crítico");
  if (d.noTrade) e.push("intransferível");
  if (d.explode) e.push(`explode (raio ${d.explode})`);
  if (d.burn) e.push(`fogo ${d.burn}/s`);
  if (d.fire) e.push("lança fogo");
  if (d.bleed) e.push(`${Math.round(d.bleed * 100)}% de sangramento`);
  if (d.stun) e.push(`${Math.round(d.stun * 100)}% de atordoar`);
  if (d.crit) e.push(`+${d.crit}% de crítico`);
  if (d.lifesteal) e.push(`rouba ${Math.round(d.lifesteal * 100)}% de vida`);
  if (d.knock) e.push("empurra");
  if (d.infinite) e.push("munição infinita (superaquece)");
  if (d.slow) e.push(`-${d.slow}% de velocidade`);
  if (d.sound && d.sound[0] <= 0.1) e.push("silenciosa");
  return e;
}
function libraryKey(k) {
  if (k === "l" || (k === "escape" && LIB.cat < 0)) { game.menu = null; return; }
  if (LIB.cat < 0) {
    if (k === "a" || k === "arrowleft") LIB.tile = (LIB.tile + LIB_CATS.length - 1) % LIB_CATS.length;
    else if (k === "d" || k === "arrowright") LIB.tile = (LIB.tile + 1) % LIB_CATS.length;
    else if (k === "w" || k === "arrowup" || k === "s" || k === "arrowdown") LIB.tile = (LIB.tile + 4) % LIB_CATS.length;
    else if (k === "enter") { LIB.cat = LIB.tile; LIB.sel = 0; LIB.scroll = 0; }
    return;
  }
  const n = libWeapons(LIB.cat).length;
  if (k === "escape" || k === "backspace" || k === "a" || k === "arrowleft") LIB.cat = -1;
  else if (k === "w" || k === "arrowup") LIB.sel = Math.max(0, LIB.sel - 1);
  else if (k === "s" || k === "arrowdown") LIB.sel = Math.min(n - 1, LIB.sel + 1);
}
function drawLibrary() {
  if (LIB.cat < 0) { drawLibraryGrid(); return; }
  drawLibraryList();
}
function drawLibraryGrid() {
  menuFrame("Biblioteca de armas", `${WLIST.filter((d) => !d.fists).length} armas · escolha uma categoria`);
  const TW = 206, TH = 196, GX = 16, GY = 16, x0 = (W - (4 * TW + 3 * GX)) / 2, y0 = 96;
  LIB_CATS.forEach((c, i) => {
    const x = x0 + (i % 4) * (TW + GX), y = y0 + Math.floor(i / 4) * (TH + GY);
    const hov = mouse.x >= x && mouse.x <= x + TW && mouse.y >= y && mouse.y <= y + TH, sel = LIB.tile === i;
    const g = ctx.createLinearGradient(x, y, x, y + TH);
    g.addColorStop(0, hov || sel ? "#2a1a16" : "#1a1412"); g.addColorStop(1, "#0d0b0a");
    ctx.fillStyle = g; rr(x, y, TW, TH, 8); ctx.fill();
    ctx.strokeStyle = sel ? "#ffd96a" : hov ? "#e05a4a" : "rgba(192,57,43,0.45)"; ctx.lineWidth = sel ? 2 : 1.5; ctx.stroke();
    const rep = WDEF[c.rep] || libWeapons(i)[0];
    ctx.save(); ctx.translate(x + TW / 2, y + 82); ctx.rotate(-0.12);
    if (rep) drawWeaponSide(rep, 0, 0, 1.25);
    ctx.restore();
    txt(c.name, x + TW / 2, y + TH - 34, 17, hov || sel ? "#ff7a5c" : "#e05a4a", "center", true, TW - 16);
    txt(`${libWeapons(i).length} armas`, x + TW / 2, y + TH - 14, 12, "#a9a58f", "center");
    regClick(x, y, TW, TH, () => { LIB.tile = i; LIB.cat = i; LIB.sel = 0; LIB.scroll = 0; });
  });
  hint("Clique numa categoria · A/D e W/S escolhem · Enter abre · L ou Esc fecha");
}
function drawLibraryList() {
  const c = LIB_CATS[LIB.cat], list = libWeapons(LIB.cat);
  LIB.sel = Math.max(0, Math.min(list.length - 1, LIB.sel));
  menuFrame(c.name, `Biblioteca de armas · ${list.length} armas`);
  btn(40, 32, 130, 28, "◀ Categorias", () => { LIB.cat = -1; }, false);
  // lista à esquerda (rola junto com a escolha)
  const N = 10, RH = 44, top = 92;
  if (LIB.sel < LIB.scroll) LIB.scroll = LIB.sel;
  if (LIB.sel >= LIB.scroll + N) LIB.scroll = LIB.sel - N + 1;
  for (let r = 0; r < N && LIB.scroll + r < list.length; r++) {
    const i = LIB.scroll + r, d = list[i], y = top + r * RH, sel = LIB.sel === i;
    rowBox(40, y, 300, RH - 4, sel, sel ? null : "rgba(192,57,43,0.35)");
    ctx.save(); ctx.beginPath(); ctx.rect(44, y + 2, 92, RH - 8); ctx.clip();
    drawWeaponSide(d, 90, y + (RH - 4) / 2, 0.55);
    ctx.restore();
    txt(d.short || d.name, 144, y + 18, 14, rarColor(d), "left", true, 190);
    txt(RARITY[d.rar].name + (WEAPON_3D[d.id] ? " · 3D" : ""), 144, y + 33, 11, "#a9a58f");
    regClick(40, y, 300, RH - 4, () => { LIB.sel = i; });
  }
  if (LIB.scroll > 0) txt("▲", 190, top - 4, 12, "#ffd96a", "center");
  if (LIB.scroll + N < list.length) txt("▼", 190, top + N * RH + 8, 12, "#ffd96a", "center");
  // detalhes à direita
  const d = list[LIB.sel];
  if (!d) return;
  const px = 360, pw = 560;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(px, 92, pw, 432, 8); ctx.fill();
  ctx.strokeStyle = "rgba(192,57,43,0.45)"; ctx.lineWidth = 1.5; ctx.stroke();
  drawWeaponSide(d, px + pw / 2, 176, 2.3);
  txt(d.name, px + 20, 278, 22, rarColor(d), "left", true, pw - 40);
  txt(`${RARITY[d.rar].name} · ${CAT_LABEL[d.cat]}${WEAPON_3D[d.id] ? " · modelo 3D" : ""}`, px + 20, 300, 13, "#ffd96a");
  // tabela de atributos em duas colunas
  const rows = d.melee || d.cat === "melee"
    ? [["Dano", `${d.dmg}`], ["Golpes por segundo", (1000 / d.delay).toFixed(1)], ["Alcance", `${d.range}`], ["Abertura do golpe", `${Math.round((d.arc || 0) * 57)}°`]]
    : [["Dano", `${d.dmg}${d.pellets ? ` x${d.pellets}` : ""}`], ["Tiros por segundo", (1000 / d.delay).toFixed(1)], ["Pente", `${d.mag}`],
       ["Recarga", `${(d.reload / 1000).toFixed(1)} s`], ["Munição", d.ammo || "infinita"]];
  rows.forEach(([k, v], j) => {
    const x = px + 20 + (j % 2) * 270, y = 330 + Math.floor(j / 2) * 24;
    txt(k, x, y, 13, "#a9a58f");
    txt(v, x + 240, y, 14, "#e05a4a", "right", true);
  });
  const ry = 330 + Math.ceil(rows.length / 2) * 24 + 10;
  txt(`Exige: ${reqText(d)}`, px + 20, ry, 13, canUse(d) ? "#6fae4f" : "#e05a4a", "left", true, pw - 40);
  const fx = libEffects(d);
  if (fx.length) txtWrap("Efeitos: " + fx.join(" · "), px + 20, ry + 22, 13, "#d8d2ba", pw - 40, 16, 2);
  txt(libSource(d), px + 20, 508, 13, "#a9a58f", "left", false, pw - 40);
  hint("W/S escolhe a arma · A, Backspace ou Esc volta às categorias · L fecha · só para ver: as armas vêm de saques e da oficina");
}
