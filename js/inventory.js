"use strict";
// =====================================================================
//  Inventário e telas de itens: item encontrado (aceitar ou não),
//  mochila (B) com 3 armas equipadas, baú da base, loja, oficina
//  (criar armas especiais e melhorar Precisão/Dano/Recarga até 8) e pausa.
// =====================================================================

// ---------- Cliques do mouse nas telas ----------
function regClick(x, y, w, h, fn) { game.clicks.push({ x, y, w, h, fn }); }
function handleClick(x, y) {
  for (let i = game.clicks.length - 1; i >= 0; i--) {
    const c = game.clicks[i];
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) { c.fn(); return true; }
  }
  return false;
}
function btn(x, y, w, h, label, fn, primary, disabled) {
  const hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  ctx.fillStyle = disabled ? "rgba(40,40,36,0.8)" : primary ? (hov ? "#5a4a2a" : "#463a20") : hov ? "#34322a" : "#24231d";
  rr(x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = disabled ? "#3d3b30" : primary ? "#d4af37" : "#6d6a58"; ctx.lineWidth = 1.5; ctx.stroke();
  txt(label, x + w / 2, y + h / 2 + 5, 15, disabled ? "#6d6a58" : "#f2eedc", "center", true);
  if (!disabled) regClick(x, y, w, h, fn);
}
// linha de lista: 1º clique seleciona, 2º clique executa
function rowClick(x, y, w, h, isSel, select, act) { regClick(x, y, w, h, () => { if (isSel) act(); else select(); }); }

function inSafe() { return !!(game.inside && game.inside.safe); }
// atributos só mudam (distribuir pontos e resetar) dentro da base
function atBase() { return !!game.hub || inSafe(); }

// ---------- Detalhes de uma arma (usado em várias telas) ----------
function weaponDetail(d, inst, x, y, w) {
  ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(x, y, w, 96, 8); ctx.fill();
  drawWeaponSide(d, x + w / 2, y + 48, Math.min(1.6, (w - 30) / 125));
  txt(inst ? instName(inst) : d.name, x, y + 122, 18, rarColor(d), "left", true, w);
  txt(`${RARITY[d.rar].name} · ${CAT_LABEL[d.cat]}${d.craftOnly ? " · feita na oficina" : ""}`, x, y + 141, 12, rarColor(d), "left", false, w);
  const st = wStat(inst || null), rows = [];
  if (!inst) { st.dmg = d.dmg; st.delay = d.delay; st.reload = (d.reload || 0) * (d.cat === "rifles" ? 1.15 : 1); st.range = d.range || 0; st.spread = d.spread || 0.03; }
  rows.push(["Dano", d.pellets ? `${Math.round(st.dmg)} x${d.pellets}` : `${Math.round(st.dmg)}`]);
  rows.push([d.melee ? "Golpes/s" : "Tiros/s", (1000 / st.delay).toFixed(1)]);
  if (d.melee) rows.push(["Alcance", `${Math.round(st.range)}`]);
  else if (d.infinite) { rows.push(["Munição", "infinita · pente de 600"]); rows.push(["Recarga", `${(st.reload / 1000).toFixed(2)} s`]); rows.push(["Crítico", "nunca"]); rows.push(["Precisão", `${Math.round(100 - st.spread * 250)}%`]); }
  else {
    rows.push(["Carregador", `${d.mag} · ${d.ammo}`]);
    rows.push(["Recarga", d.id === "caca"
      ? `${(st.reload / d.mag / 1000).toFixed(2)} s por munição`
      : `${(st.reload / 1000).toFixed(1)} s`]);
    rows.push(["Precisão", `${Math.round(100 - st.spread * 250)}%`]);
  }
  rows.push(["Ruído", d.sound === 0 ? "nenhum" : d.sound <= 0.1 ? "baixo" : d.sound < 1 ? "médio" : "alto"]);
  if (d.slow) rows.push(["Peso", `-${d.slow}% velocidade`]);
  if (d.lifesteal) rows.push(["Especial", `cura ${d.lifesteal * 100}% do dano`]);
  if (d.explode) rows.push(["Especial", d.grenade ? "granada explosiva" : "tiro explosivo"]);
  if (d.fire) rows.push(["Especial", "fogo atravessa zumbis"]);
  if (d.burn) rows.push(["Efeito", `queima (${d.burn} de dano/s)`]);
  if (d.bleed) rows.push(["Efeito", `${Math.round(d.bleed * 100)}% de sangramento`]);
  if (d.stun) rows.push(["Efeito", `${Math.round(d.stun * 100)}% de atordoar`]);
  if (d.crit) rows.push(["Efeito", `+${d.crit}% de crítico`]);
  if (d.knock) rows.push(["Efeito", "empurra os zumbis"]);
  const rh = rows.length > 9 ? 14 : 17;
  rows.forEach(([k, v], i) => { txt(k, x, y + 164 + i * rh, 12, "#a9a58f"); txt(v, x + w, y + 164 + i * rh, 12, k === "Efeito" || k === "Especial" ? "#ffb070" : "#e5e0c8", "right", true); });
  const ry = y + 168 + rows.length * rh;
  txt(`Exige: ${reqText(d)}`, x, ry, 12, canUse(d) ? "#6fae4f" : "#e05a4a", "left", true, w);
  if (inst) drawUpgradeValues(inst, x, ry + 14, w);
}
function drawUpgradeValues(inst, x, y, w) {
  UP_STATS.forEach((s, i) => txt(`${s.name} ${inst.up[s.id]}`, x, y + i * 20 + 11, 11, "#a9a58f", "left", false, w));
}

// =====================================================================
//  Item encontrado: aceitar ou não
// =====================================================================
function entryName(e) {
  switch (e.type) {
    case "cash": return `$${e.amt}`;
    case "food": return `${e.amt}x ${FOOD_Q[e.q || "comum"].name}`;
    case "anti": return `${e.amt} antibiótico${e.amt > 1 ? "s" : ""}`;
    case "water": return `${e.amt} garrafa${e.amt > 1 ? "s" : ""} de água`;
    case "med": return `${e.amt} kit${e.amt > 1 ? "s" : ""} médico${e.amt > 1 ? "s" : ""}`;
    case "ammo": return `${e.amt} balas ${e.ammo}`;
    case "weapon": return instName(e.inst);
    case "mat": return `${e.amt}x ${MATS[e.id].name}`;
    case "implant": return `implante ${implantName(e.im)}`;
    case "vest": return VESTS[e.idx].name;
    case "credit": return `${e.amt} crédito (sorte: 4 itens!)`;
  }
  return "?";
}
// coletes: guarda os que você tem e equipa o melhor automaticamente
function gainVest(idx, mcArmor = 0) {
  const had = save.vestsOwned[idx];
  if (!had) { save.vestUpgrades = save.vestUpgrades || {}; save.vestUpgrades[idx] = cleanVestUpgrade(null); }
  // Processador de Guerra: coletes Mastercraft encontrados já vêm com +6 de armadura.
  if (mcArmor > 0) {
    const up = save.vestUpgrades[idx] || cleanVestUpgrade(null);
    up.armor = Math.min(VEST_UP_MAX, (up.armor || 0) + mcArmor);
    save.vestUpgrades[idx] = up;
  }
  save.vestsOwned[idx] = true;
  if (save.vest < 0 || VESTS[idx].armor > VESTS[save.vest].armor) { save.vest = idx; recalcImplants(); toast(`${VESTS[idx].name} equipado`); }
  else toast(had ? `Você já tem ${VESTS[idx].name}` : `${VESTS[idx].name} guardado (troque na mochila com V)`);
  persist();
}
function cycleVest() {
  const owned = VESTS.map((v, i) => i).filter((i) => save.vestsOwned[i]);
  if (!owned.length) { toast("Você não tem coletes"); return; }
  const pos = owned.indexOf(save.vest);
  save.vest = pos < 0 ? owned[0] : pos + 1 < owned.length ? owned[pos + 1] : -1;
  recalcImplants(); persist();
  toast(save.vest >= 0 ? `Colete: ${VESTS[save.vest].name}` : "Sem colete");
}
function acceptFound() {
  const e = game.found[0];
  if (!e) return true;
  if (e.type === "cash") game.money += e.amt;
  else if (e.type === "food") addFood(e.q || "comum", e.amt);
  else if (e.type === "anti") player.anti += e.amt;
  else if (e.type === "water") player.water += e.amt;
  else if (e.type === "med") player.med += e.amt;
  else if (e.type === "ammo") {
    const got = addAmmo(e.ammo, e.amt);
    if (got < e.amt) { e.amt -= got; toast(got ? `Pegou ${got} balas · a mochila encheu (500 balas por espaço)` : "Mochila cheia: munição ocupa 1 espaço a cada 500 balas"); sfx.empty(); return false; }
  }
  else if (e.type === "weapon") {
    e.inst.loot = true;
    const r = addWeapon(e.inst);
    if (!r) { toast("Mochila cheia! Recuse o item ou abra espaço"); sfx.empty(); return false; }
    if (r === "slot" && !curInst()) player.cur = player.slots.indexOf(e.inst);
  } else if (e.type === "mat") {
    if (!addMat(e.id, e.amt, player.pack, PACK_MAX, true)) { toast("Mochila cheia! Recuse o item ou abra espaço"); sfx.empty(); return false; }
  } else if (e.type === "implant") {
    if (player.bag.length >= BAG_MAX) { toast("Mochila de implantes cheia"); sfx.empty(); return false; }
    player.bag.push(e.im);
  } else if (e.type === "vest") gainVest(e.idx, e.mcArmor || 0);
  else if (e.type === "credit") { save.credits += e.amt; persist(); sfx.level(); }
  sfx.pickup();
  stat("itemsTaken");
  if (e.type === "weapon") { registerWeapon(e.inst.id); if (WDEF[e.inst.id].rar >= 4) stat("legendaries"); }
  game.found.shift();
  if (!game.found.length) finishFound();
  return true;
}
// comida, água, kit e antibiótico podem ser usados na hora (gasta 1; o resto continua oferecido)
function canUseFound(e) { return !!e && (e.type === "food" || e.type === "water" || e.type === "med" || e.type === "anti"); }
function useFound() {
  const e = game.found && game.found[0];
  if (!canUseFound(e)) return;
  if (e.type === "food") {
    if (player.hunger >= 100) { toast("Sem fome"); return; }
    const q = e.q || "comum";
    player.hunger = Math.min(100, player.hunger + FOOD_Q[q].hunger);
    if (q === "fresca") { player.hp = Math.min(player.maxHp, player.hp + 5); toast("Comida fresca! (+5 de vida)"); }
    else if (q === "podre") { if (Math.random() < 0.5) { addInfection(null, 2.5); toast("Estava estragada... a infecção subiu"); } else toast("Comida estragada (sacia pouco)"); }
    else toast("Você comeu");
    stat("foodEaten");
  } else if (e.type === "water") {
    if (player.thirst >= 100) { toast("Sem sede"); return; }
    player.thirst = Math.min(100, player.thirst + 40); toast("Você bebeu"); stat("foodEaten");
  } else if (e.type === "med") {
    if (player.hp >= player.maxHp) { toast("Vida cheia"); return; }
    player.hp = Math.min(player.maxHp, player.hp + 40 * (1 + profVal("med"))); toast("Você usou o kit médico");
  } else {
    if (!player.infect) { toast("Você não está infectado"); return; }
    player.infect = Math.max(0, player.infect - 60); player.infWarned = false; toast(`Antibiótico · infecção ${Math.round(player.infect)}%`);
  }
  sfx.pickup(); stat("itemsTaken");
  e.amt--;
  if (e.amt <= 0) { game.found.shift(); if (!game.found.length) finishFound(); }
}
// Loot recusado permanece como o mesmo item no chão por 10 segundos reais.
const GROUND_LOOT_LIFETIME = 10000;
function removeGroundDrop(drop) {
  if (!game.groundDrops) return;
  const i = game.groundDrops.indexOf(drop);
  if (i >= 0) game.groundDrops.splice(i, 1);
}
function finishFound() {
  if (game.foundDrop) removeGroundDrop(game.foundDrop);
  game.found = null; game.foundDrop = null; game.foundSpot = null;
}
function groundDropsTick(now = performance.now()) {
  if (!game.groundDrops) return;
  game.groundDrops = game.groundDrops.filter(d => d.expiresAt > now);
  if (game.foundDrop && game.foundDrop.expiresAt <= now) {
    game.found = null; game.foundDrop = null; game.foundSpot = null;
    if (game.menu === "pack") game.menu = null;
    toast("O item deixado no chão desapareceu.");
  }
}
function drawGroundDrops() {
  if (!game.groundDrops) return;
  const now = performance.now();
  for (const d of game.groundDrops) {
    if (d.expiresAt <= now ||
      d.inside !== (game.inside || null) ||
      (!d.inside && (d.cx !== world.cell.cx || d.cy !== world.cell.cy)) ||
      !inView(d.x - 40, d.y - 40, 80, 80)) continue;
    ctx.save();
    ctx.fillStyle = "rgba(20,19,11,0.82)";
    ctx.shadowColor = "#ffd334"; ctx.shadowBlur = 16;
    circle(d.x, d.y, 22);
    ctx.shadowBlur = 0; ctx.lineWidth = 2; ctx.strokeStyle = "#ffd334";
    ctx.beginPath(); ctx.arc(d.x, d.y, 22, 0, Math.PI * 2); ctx.stroke();
    drawEntryIcon(d.entry, d.x, d.y - 4, 0.45);
    ctx.restore();
    hudT(Math.ceil((d.expiresAt - now) / 1000) + "s", d.x, d.y + 34, 12, "#ffe07e", "center", true);
  }
}
function declineFound() {
  if (!game.found || !game.found.length) return;
  const e = game.found.shift();
  // Se o jogador abriu o item recusado do chão, ele conserva o prazo original.
  if (!game.foundDrop) {
    const spot = game.foundSpot;
    const x = spot ? spot.x + spot.w / 2 : player.x;
    const y = spot ? spot.y + spot.h / 2 : player.y;
    if (!game.groundDrops) game.groundDrops = [];
    game.groundDrops.push({
      kind: "grounddrop", name: entryName(e), entry: e,
      x, y, w: 24, h: 24, inside: game.inside || null,
      cx: world.cell.cx, cy: world.cell.cy,
      expiresAt: performance.now() + GROUND_LOOT_LIFETIME
    });
    toast("Item recusado: 10 segundos para recolher no chão.");
  }
  if (!game.found.length) {
    game.found = null; game.foundDrop = null; game.foundSpot = null;
  }
}
function takeAllFound() { while (game.found && acceptFound()); }
function openPackFromFound() {
  if (!game.found) return;
  game.menu = "pack";
  mouse.down = false;
}
function foundKey(k) {
  if (k === "enter" || k === "e" || k === "y" || k === "s") acceptFound();
  else if (k === "c" && canUseFound(game.found[0])) useFound();
  else if (k === "n" || k === "escape" || k === "q") declineFound();
  else if (k === "t") takeAllFound();
  else if (k === "b" && game.found[0]) openPackFromFound();
}
// Painel de saque inspirado na interface marrom/desgastada; o mundo continua
// visível fora dele. A arte é gerada uma vez para não pesar no jogo.
// Janela totalmente transparente: desenha só a moldura, sem qualquer fundo.
let foundPanelSkin = null;
function drawFoundPanelSkin(x, y, w, h) {
  if (!foundPanelSkin || foundPanelSkin.width !== w || foundPanelSkin.height !== h) {
    const surface = document.createElement("canvas");
    surface.width = w; surface.height = h;
    const g = surface.getContext("2d");
    const border = () => {
      const r = 17;
      g.beginPath();
      g.moveTo(r, 2); g.lineTo(w - r, 2);
      g.quadraticCurveTo(w - 2, 2, w - 2, r);
      g.lineTo(w - 2, h - r);
      g.quadraticCurveTo(w - 2, h - 2, w - r, h - 2);
      g.lineTo(r, h - 2);
      g.quadraticCurveTo(2, h - 2, 2, h - r);
      g.lineTo(2, r); g.quadraticCurveTo(2, 2, r, 2);
      g.closePath();
    };
    // NÃO usar fill/gradient/overlay aqui: canvas começa com alpha=0.
    // O cenário deve aparecer 100% através de toda a área interna.
    g.save();
    border(); g.lineWidth = 4; g.strokeStyle = "#bd612d"; g.stroke();
    g.translate(3, 3);
    border(); g.lineWidth = 1.5; g.strokeStyle = "rgba(250,172,83,0.60)"; g.stroke();
    g.restore();
    // Separador discreto, sem faixa opaca atrás do título.
    g.beginPath(); g.moveTo(10, 36); g.lineTo(w - 10, 36);
    g.lineWidth = 1; g.strokeStyle = "rgba(210,110,52,0.8)"; g.stroke();
    foundPanelSkin = surface;
  }
  ctx.save();
  ctx.drawImage(foundPanelSkin, x, y);
  ctx.restore();
}
function foundText(text, x, y, size, color, maxWidth, align) {
  ctx.save();
  // Texto direto no canvas final, sem redução ou sombra borrada.
  ctx.font = "bold " + Math.round(size) + "px 'Arial Narrow', Arial, sans-serif";
  ctx.textAlign = align || "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 1;
  ctx.fillStyle = color || "#f1d9b6";
  ctx.fillText(text, Math.round(x), Math.round(y), maxWidth);
  ctx.restore();
}
function foundButton(x, y, w, h, label, action) {
  const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  ctx.save();
  ctx.shadowColor = "rgba(7,2,0,0.9)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 3;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, hover ? "#755038" : "#4b3326");
  g.addColorStop(1, hover ? "#51301b" : "#26180f");
  ctx.fillStyle = g; rr(x, y, w, h, 7); ctx.fill();
  ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  ctx.strokeStyle = hover ? "#f3c18a" : "#a27246"; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = "rgba(235,166,105,0.29)"; ctx.lineWidth = 1;
  rr(x + 3, y + 3, w - 6, h - 6, 5); ctx.stroke();
  ctx.restore();
  foundText(label, x + w / 2, y + h / 2 + 1, Math.min(22, Math.max(13, Math.round(h * 0.53))), "#f3ddc1", w - 10);
  regClick(x, y, w, h, action);
}
// Mochila vetorial baseada no ícone enviado: sem fundo branco e clicável.
function foundBackpack(x, y, size) {
  const hover = mouse.x >= x - 7 && mouse.x <= x + size + 7 &&
    mouse.y >= y - 7 && mouse.y <= y + size * 1.15 + 7;
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 72, size / 72);
  ctx.shadowColor = hover ? "#d77b36" : "rgba(0,0,0,0.8)";
  ctx.shadowBlur = hover ? 11 : 4; ctx.shadowOffsetY = 2;
  ctx.strokeStyle = hover ? "#ffdbad" : "#f2dbc2";
  ctx.fillStyle = "#100b08"; ctx.lineWidth = 3;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  // Alça
  ctx.beginPath(); ctx.arc(36, 16, 13, Math.PI, Math.PI * 2); ctx.stroke();
  // Bolsos laterais
  ctx.beginPath(); ctx.moveTo(12, 35); ctx.quadraticCurveTo(3, 37, 3, 47);
  ctx.lineTo(3, 66); ctx.quadraticCurveTo(3, 72, 12, 71); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(60, 35); ctx.quadraticCurveTo(69, 37, 69, 47);
  ctx.lineTo(69, 66); ctx.quadraticCurveTo(69, 72, 60, 71); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Corpo
  ctx.beginPath(); ctx.moveTo(20, 18); ctx.lineTo(52, 18);
  ctx.quadraticCurveTo(62, 18, 62, 32); ctx.lineTo(62, 72);
  ctx.quadraticCurveTo(62, 80, 54, 80); ctx.lineTo(18, 80);
  ctx.quadraticCurveTo(10, 80, 10, 72); ctx.lineTo(10, 32);
  ctx.quadraticCurveTo(10, 18, 20, 18); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Tampa e bolso frontal
  ctx.beginPath(); ctx.moveTo(21, 19); ctx.lineTo(51, 19);
  ctx.quadraticCurveTo(57, 19, 57, 27); ctx.lineTo(54, 43);
  ctx.quadraticCurveTo(53, 48, 46, 48); ctx.lineTo(26, 48);
  ctx.quadraticCurveTo(19, 48, 18, 43); ctx.lineTo(15, 27);
  ctx.quadraticCurveTo(15, 19, 21, 19); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.roundRect(19, 53, 34, 23, 10); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(24, 54); ctx.lineTo(24, 61); ctx.stroke();
  ctx.restore();
  regClick(x - 7, y - 7, size + 14, size * 1.15 + 14, openPackFromFound);
}
// Reduz a janela inteira em 40% mantendo proporções, conteúdo e ações.
// A renderização usa coordenadas virtuais; os cliques são convertidos de volta
// ao canvas real para preservar SIM, NÃO e mochila após o redimensionamento.
// Janela de saque compacta: desenhada na resolução final (sem ctx.scale).
// O texto e as hitboxes dos botões permanecem nítidos e alinhados.
function drawFound() {
  if (!game.found || !game.found.length) return;
  const e = game.found[0];
  const w = 287, h = 210;
  const x = Math.round((W - w) / 2), y = Math.round((H - h) / 2);
  const wd = e.type === "weapon" ? WDEF[e.inst.id] : null;
  // Apenas bloqueia cliques atrás da janela; não pinta o cenário.
  regClick(0, 0, W, H, () => {});
  drawFoundPanelSkin(x, y, w, h);
  foundText("ITEM ENCONTRADO", x + w / 2, y + 17, 14, "#efd4ab", w - 113);
  foundText("em: " + game.foundSrc, x + w - 10, y + 17, 8, "#dcc1a7", 65, "right");
  foundText("Você encontrou " + entryName(e) + ". Quer pegar?",
    x + w / 2, y + 48, 12, "#f4dcc1", w - 18);

  // Item central sem placa/fundo escuro: cenário visível através do painel.
  const pulse = 1 + Math.sin(performance.now() / 300) * 0.018;
  const cx = x + w / 2, cy = y + 107;
  if (wd) drawWeaponSide(wd, cx, cy, 0.81 * pulse);
  else drawEntryIcon(e, cx, cy, 0.77 * pulse);

  let info = "";
  if (wd) {
    info = RARITY[wd.rar].name + " · " + CAT_LABEL[wd.cat] + " · Dano " + wd.dmg +
      (wd.pellets ? " x" + wd.pellets : "") +
      (wd.melee ? " · Sem munição" : " · " + wd.mag + " balas");
  } else if (e.type === "mat") info = "Material de criação e melhoria";
  else if (e.type === "implant") info = implantDesc(e.im);
  else if (e.type === "food") info = "Alimento encontrado";
  else if (e.type === "ammo") info = "Munição: " + e.ammo;
  else if (e.type === "credit") info = "Créditos encontrados";
  if (info) foundText(info, cx, y + 148, 9, wd ? rarColor(wd) : "#dbc19d", w - 20);
  if (wd && !canUse(wd))
    foundText("Exige: " + reqText(wd), cx, y + 161, 9, "#ff9478", w - 20);

  const by = y + 166;
  foundButton(x + 13, by, 87, 28, "SIM", acceptFound);
  foundButton(x + 106, by, 87, 28, "NÃO", declineFound);
  foundBackpack(x + w - 56, by - 8, 34);
  const more = game.found.length - 1, usable = canUseFound(e);
  foundText("ENTER: PEGAR · ESC: RECUSAR · B: MOCHILA" +
    (usable ? " · C: USAR" : "") +
    (more ? " · T: TUDO (" + (more + 1) + ")" : ""),
    cx, y + h - 7, 8, "#d8b99e", w - 14);
  if (game.msgT > 0)
    txt(game.msg, cx, y + h + 20, 12, "#ffd96a", "center", true);
}

// =====================================================================
//  Pausa (Esc)
// =====================================================================
// ---------- Configurações: áudio ambiente e exposição visual ----------
function pauseSettingSlider(label, field, x, y, w, min, max, suffix) {
  const val = Math.max(min, Math.min(max, Number(save[field]) || 0));
  const t = (val - min) / (max - min), line = y + 29;
  txt(label, x, y + 8, 19, "#eee0b9", "left", true);
  txt(suffix === "percent" ? `${Math.round(val * 100)}%` : String(Math.round(val)), x + w, y + 8, 17, "#ffd36c", "right", true);
  ctx.fillStyle = "rgba(19,19,18,.9)";rr(x, line - 5, w, 12, 5);ctx.fill();
  ctx.fillStyle = "#b99544";rr(x, line - 3, w * t, 8, 4);ctx.fill();
  ctx.fillStyle = "#fff4be";circle(x + w * t, line + 1, 9);
  ctx.strokeStyle = "#a68035";ctx.lineWidth = 2;
  ctx.beginPath();ctx.arc(x + w * t,line + 1,9,0,6.283);ctx.stroke();
  regClick(x - 12, line - 18, w + 24, 38, () => {
    game.settingsDrag = {field,x,w,min,max};
    pauseSettingsDrag(mouse.x);
  });
}
function pauseSettingsDrag(x) {
  const d = game.settingsDrag;
  if (!d || !game.settingsOpen) return;
  save[d.field] = Math.round((d.min + Math.max(0, Math.min(1, (x - d.x) / d.w)) * (d.max-d.min)) * 100) / 100;
  if (d.field === "ambientVolume") {
    fmAmbientSetVolume();
    // Permite reativar o ambiente após subir o volume de zero.
    if (save.ambientVolume > 0 && SND.ac) fmAmbientStart();
  }
  persist();
}
function drawPauseSettings() {
  ctx.fillStyle = "rgba(6,8,7,.96)";ctx.fillRect(0,0,W,H);
  txt("ÁUDIO E VÍDEO", W/2, 90, 41, "#e7d5a8", "center", true);
  txt("Configurações pessoais salvas automaticamente", W/2, 123, 13, "#9d9a8b", "center");
  const x=260, w=440;
  pauseSettingSlider("Volume do som ambiente", "ambientVolume", x, 180, w, 0, 1, "percent");
  txt("Trilha de fundo do arquivo Ambiente sond · independente da música", W/2, 245, 13, "#b1a99a", "center");
  pauseSettingSlider("Brilho da imagem", "brightness", x, 293, w, .55, 1.6, "percent");
  txt("Ajusta a luminosidade do cenário sem clarear o HUD ou os menus", W/2, 355, 13, "#b1a99a", "center");
  btn(225,403,240,38,`Efeitos sonoros: ${SND.muted?"desligados":"ligados"}`,()=>{sndMute(!SND.muted);save.muted=SND.muted;persist();});
  btn(500,403,240,38,`Música dinâmica: ${save.music?"ligada":"desligada"}`,()=>{save.music=!save.music;musicSetOn(save.music);persist();});
  btn(W/2-130,465,260,42,"Voltar (Esc)",()=>{game.settingsOpen=false;game.settingsDrag=null;},true);
  txt("Aperte o botão e arraste para regular cada opção",W/2,H-44,13,"#b1a99a","center");
}
function applyGameBrightness() {
  const value = Math.max(.55,Math.min(1.6,Number(save.brightness)||1));
  if (Math.abs(value-1)<.01) return;
  ctx.save();ctx.setTransform(DPR,0,0,DPR,0,0);
  if (value>1) {
    ctx.globalCompositeOperation="screen";
    ctx.fillStyle=`rgba(255,238,205,${Math.min(.35,(value-1)*.48)})`;
  } else {
    ctx.globalCompositeOperation="source-over";
    ctx.fillStyle=`rgba(6,7,10,${Math.min(.54,(1-value)*.86)})`;
  }
  ctx.fillRect(0,0,W,H);ctx.restore();
}
function togglePause() {
  game.paused = !game.paused;
  if (!game.paused) { game.settingsOpen = false; game.settingsDrag = null; }
  mouse.down = false;
}
function drawPause() {
  if (game.settingsOpen) { drawPauseSettings(); return; }
  ctx.fillStyle = "rgba(6,7,5,0.82)"; ctx.fillRect(0, 0, W, H);
  txt("PAUSADO", W / 2, 100, 46, "#f2eedc", "center", true);
  txt(`${playerName()}${prof() ? ` · ${prof().name}` : ""}`, W / 2, 124, 14, "#ffd96a", "center", true);
  txt("Boneco: novo", W / 2 - 200, 113, 16, "#e5e0c8", "center", true);
  const ago = game.lastSave ? Math.round((performance.now() - game.lastSave) / 1000) : null;
  txt(ago == null ? "ainda não salvou nesta sessão" : ago < 3 ? "salvo agora!" : `último checkpoint: há ${ago < 60 ? `${ago}s` : `${Math.floor(ago / 60)} min`}`, W / 2 - 200, 164, 10, ago != null && ago < 3 ? "#8fe08a" : "rgba(229,224,200,0.55)", "center");
  txt(`${clockText()} · Área ${world.cell.code} (${REGIONS[world.cell.tier].name}) · $${econ().bounty} por abate · ${game.kills} abates`, W / 2, 140, 14, "#a9a58f", "center");
  let buttonY = 149;
  function pauseButton(label, action, highlight = false) {
    btn(W / 2 - 108, buttonY, 216, 24, label, action, highlight);
    buttonY += 28;
  }
  pauseButton("Continuar (Esc)", togglePause, true);
  pauseButton("Salvar progresso", manualSave);
  pauseButton("Missões", () => { game.paused = false; game.menu = "missions"; game.cur = 0; game.atBase = inSafe(); }, true);
  pauseButton("Objetivos", () => { game.paused = false; game.menu = "obj"; game.oscroll = 0; });
  pauseButton("Amigos", openFriends);
  pauseButton("Mensagens" + (inboxUnread() ? " · " + inboxUnread() : ""), openMessages);
  pauseButton(`Som: ${SND.muted ? "desligado" : "ligado"}`, () => { sndMute(!SND.muted); save.muted = SND.muted; persist(); });
  pauseButton(`Música: ${save.music ? "ligada" : "desligada"}`, () => { save.music = !save.music; musicSetOn(save.music); persist(); });
  pauseButton("Áudio, ambiente e brilho", () => { game.settingsOpen = true; game.settingsDrag = null; });
  pauseButton(`Gráficos: ${(GFX_Q[save.gfx] || "").split(" ")[0]}`, () => gfxSetQuality(((save.gfx || 0) + 2) % 3));
  pauseButton(`HUD: ${save.hud === 1 ? "compacto" : "completo"}`, () => { save.hud = save.hud === 1 ? 0 : 1; persist(); });
  pauseButton(NATIVE ? "Salvar e sair do jogo" : "Salvar e sair", saveAndQuit, true);
  // missões ativas direto na pausa
  const mx = 640, my = 330;
  txt(`MISSÕES ATIVAS (${save.missions.length}/3)`, mx, my, 12, "#ffd96a", "left", true);
  if (!save.missions.length) txt("Nenhuma. Pegue missões no quadro de um posto seguro.", mx, my + 22, 12, "#a9a58f", "left", false, 290);
  save.missions.forEach((m, i) => {
    const done = m.progress >= m.target, y = my + 14 + i * 50;
    ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(mx, y, 290, 44, 6); ctx.fill();
    if (done) { ctx.strokeStyle = "#6fae4f"; ctx.lineWidth = 1.5; ctx.stroke(); }
    txt(missionText(m), mx + 8, y + 18, 12, done ? "#6fae4f" : "#e5e0c8", "left", true, 274);
    const f = Math.min(1, m.progress / m.target);
    ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(mx + 8, y + 28, 150, 6);
    ctx.fillStyle = done ? "#6fae4f" : "#ffd96a"; ctx.fillRect(mx + 8, y + 28, 150 * f, 6);
    txt(done ? "entregar no posto" : `${Math.min(m.progress, m.target)}/${m.target}`, mx + 282, y + 35, 10, done ? "#6fae4f" : "#a9a58f", "right", true);
  });
  txt(GFX.on ? (save.gfx >= 2 ? "luz, sombras, brilho e clima" : "luz, sombras e clima, sem brilho") : GFX.failed ? "WebGL indisponível neste PC" : "modo antigo, mais leve", W / 2 - 200, 274, 11, "rgba(229,224,200,0.55)", "center");
  txt("Créditos: armas extras do pacote \"2D Guns\" de Kay Lousberg (OpenGameArt.org, CC0)", W / 2, H - 14, 11, "rgba(229,224,200,0.45)", "center");
  txt("WASD andar · Shift correr · mouse mirar e atacar · 1 2 3 / roda trocar arma · R recarregar · E usar · B mochila · M mapa · N cidade · Enter chat",
    W / 2, 498, 12, "rgba(229,224,200,0.6)", "center", false, W - 60);
}

// =====================================================================
//  Mochila (B): 3 armas equipadas + 14–30 espaços por nível
// =====================================================================
const PACK_COLS = 6;
function packSel() { game.inv = game.inv || { sel: 0 }; return game.inv; }
function selItem(s) { return s < SLOT_N ? player.slots[s] : player.pack[s - SLOT_N]; }
function packMove(dx, dy) {
  const inv = packSel(); let s = inv.sel;
  if (s < SLOT_N) {
    if (dx) s = clamp(s + dx, 0, SLOT_N - 1);
    if (dy > 0) s = SLOT_N + Math.min(PACK_COLS - 1, Math.round(s * 2));
  } else {
    const i = s - SLOT_N, col = i % PACK_COLS, row = Math.floor(i / PACK_COLS);
    if (dx) s = SLOT_N + row * PACK_COLS + clamp(col + dx, 0, PACK_COLS - 1);
    if (dy < 0) s = row === 0 ? Math.min(SLOT_N - 1, Math.round(col / 2)) : s - PACK_COLS;
    if (dy > 0 && (row + 1) * PACK_COLS < packCapacity()) s += PACK_COLS;
  }
  inv.sel = s;
}
function equipTo(slot) {
  const inv = packSel(), it = selItem(inv.sel);
  if (!it || it.kind !== "weapon") return;
  if (inv.sel < SLOT_N) { // troca a ordem dos slots
    const t = player.slots[slot]; player.slots[slot] = it; player.slots[inv.sel] = t; inv.sel = slot;
  } else {
    const pi = inv.sel - SLOT_N, old = player.slots[slot];
    player.slots[slot] = it;
    if (old) player.pack[pi] = old; else player.pack.splice(pi, 1);
    toast(`${instName(it)} equipada no slot ${slot + 1}`);
  }
  player.reloading = 0;
}
function packAct() {
  const inv = packSel(), it = selItem(inv.sel);
  if (!it) return;
  if (inv.sel < SLOT_N) {
    if (packUsed() >= packCapacity()) { toast("Mochila cheia"); return; }
    player.pack.push(it); player.slots[inv.sel] = null; player.reloading = 0;
    toast(`${instName(it)} guardada na mochila`);
  } else if (it.kind === "weapon") {
    const e = player.slots.indexOf(null);
    equipTo(e >= 0 ? e : player.cur);
  } else if (it.id === "trindade_eterna") INV.confirm = { trindade: true, name: "Trindade · 100 anos" };
  else if (it.id === "token_loja") INV.confirm = { token: true, name: "Token da Loja" };
  else if (it.id === "reset_stats") toast("Arraste o cartão até o personagem para resetar os atributos.");
  else toast(MATS[it.id].cashProtection ? safeDescription(it.id) + " Basta carregar na mochila." : "Materiais ficam na mochila até você usar na oficina");
}
function packDiscard() {
  const inv = packSel(), it = selItem(inv.sel);
  if (!it) return;
  if (inv.sel < SLOT_N) player.slots[inv.sel] = null; else player.pack.splice(inv.sel - SLOT_N, 1);
  player.reloading = 0;
  toast(`Descartou ${it.kind === "weapon" ? instName(it) : `${it.qty}x ${MATS[it.id].name}`}`);
}
function packKey(k) {
  if (k === "pageup") { invPackChangePage(-1); return; }
  if (k === "pagedown") { invPackChangePage(1); return; }
  if (k === "a" || k === "arrowleft") packMove(-1, 0);
  else if (k === "d" || k === "arrowright") packMove(1, 0);
  else if (k === "w" || k === "arrowup") packMove(0, -1);
  else if (k === "s" || k === "arrowdown") packMove(0, 1);
  else if (k === "enter") packAct();
  else if (k === "x" || k === "delete") packDiscard();
  else if (k === "v") cycleVest();
  else if (k === "1" || k === "2" || k === "3") equipTo(parseInt(k, 10) - 1);
}
function drawItemCell(it, x, y, w, h, sel, label) {
  ctx.fillStyle = sel ? "#2f2d24" : "rgba(26,26,21,0.95)"; rr(x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = sel ? "#ffd96a" : "#3d3b30"; ctx.lineWidth = sel ? 2 : 1; ctx.stroke();
  if (label) txt(label, x + 6, y + 13, 10, "#a9a58f", "left", true);
  if (!it) return;
  if (it.kind === "weapon") {
    const d = WDEF[it.id];
    if (d.rar >= 1) { ctx.strokeStyle = rarColor(d); ctx.globalAlpha = sel ? 1 : 0.55; ctx.lineWidth = 1.5; rr(x + 2, y + 2, w - 4, h - 4, 5); ctx.stroke(); ctx.globalAlpha = 1; }
    drawWeaponSide(d, x + w / 2, y + h / 2 - 4, Math.min(0.55, (w - 12) / 125));
    txt(d.short || d.name, x + w / 2, y + h - 8, 10, !canUse(d) ? "#e07b5a" : rarColor(d), "center", true, w - 8);
    const s = upSum(it);
    if (s) txt(`+${s}`, x + w - 6, y + 13, 10, "#ffd96a", "right", true);
  } else {
    drawMatIcon(it.id, x + w / 2, y + h / 2 - 6, 0.6);
    txt(`${it.qty}x`, x + w - 6, y + 13, 10, "#ffd96a", "right", true);
    txt(MATS[it.id].name, x + w / 2, y + h - 8, 9, "#e5e0c8", "center", false, w - 8);
  }
}
function drawAmmoCell(st, x, y, w, h) {
  ctx.fillStyle = "#1e1d16"; rr(x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = "#5a4a2a"; ctx.lineWidth = 1; ctx.stroke();
  drawEntryIcon({ type: "ammo", ammo: st.t }, x + w / 2, y + 26, 0.55);
  txt(`${st.n} balas`, x + w / 2, y + h - 6, 11, "#e0d8a0", "center", true);
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x + 6, y + h - 22, w - 12, 3);
  ctx.fillStyle = "#c9a040"; ctx.fillRect(x + 6, y + h - 22, (w - 12) * (st.n / AMMO_STACK), 3);
}
function drawPack() {
  const inv = packSel();
  menuFrame("Mochila", `Armas equipadas: ${player.slots.filter(Boolean).length}/${SLOT_N}  ·  Mochila: ${packUsed()}/${packCapacity()}  ·  $${game.money}`);
  for (let i = 0; i < SLOT_N; i++) {
    const x = 40 + i * 182, y = 92;
    drawItemCell(player.slots[i], x, y, 174, 92, inv.sel === i, `SLOT ${i + 1}${player.cur === i ? " · NA MÃO" : ""}`);
    rowClick(x, y, 174, 92, inv.sel === i, () => { inv.sel = i; }, packAct);
  }
  txt("Mochila", 40, 204, 13, "#e5e0c8", "left", true);
  txt(`munição: 1 espaço a cada ${AMMO_STACK} balas`, 580, 204, 10, "#a9a58f", "right");
  const stacks = [];
  for (const t of Object.keys(AMMO)) { let r = player.reserve[t] || 0; while (r > 0) { stacks.push({ t, n: Math.min(AMMO_STACK, r) }); r -= AMMO_STACK; } }
  for (let i = 0; i < PACK_MAX; i++) {
    const x = 40 + (i % PACK_COLS) * 90, y = 212 + Math.floor(i / PACK_COLS) * 54, s = SLOT_N + i;
    const unlocked = i < packCapacity();
    if (i >= player.pack.length && i < player.pack.length + stacks.length) {
      drawAmmoCell(stacks[i - player.pack.length], x, y, 86, 49); continue;
    }
    drawItemCell(player.pack[i], x, y, 86, 49, inv.sel === s);
    if (!unlocked && !player.pack[i]) {
      ctx.fillStyle = "rgba(5,5,5,0.70)"; ctx.fillRect(x + 2, y + 2, 82, 45);
      txt("NÍVEL " + packSlotUnlockLevel(i), x + 43, y + 27, 9, "#918778", "center");
    } else rowClick(x, y, 86, 49, inv.sel === s, () => { inv.sel = s; }, packAct);
  }
  const it = selItem(inv.sel), px = 600, pw = 320;
  ctx.fillStyle = "rgba(0,0,0,0.25)"; rr(px - 10, 92, pw + 20, 410, 8); ctx.fill();
  if (it && it.kind === "weapon") weaponDetail(WDEF[it.id], it, px, 100, pw);
  else if (it) {
    drawMatIcon(it.id, px + pw / 2, 160, 1.6);
    txt(MATS[it.id].name, px, 250, 18, "#f2eedc", "left", true);
    txt(`Quantidade: ${it.qty}`, px, 274, 13, "#c9c4ad");
    txt(MATS[it.id].cashProtection ? safeDescription(it.id) : "Usado na oficina dos postos para criar", px, 300, 12, "#a9a58f", "left", false, pw);
    txt(MATS[it.id].cashProtection ? "Na mochila; vale o maior cofre. Reutilizável." : "armas especiais e melhorar as suas.", px, 316, 12, "#a9a58f", "left", false, pw);
  } else txt("Espaço vazio", px + pw / 2, 280, 15, "#6d6a58", "center");
  const ammoTxt = Object.keys(AMMO).filter((t) => player.reserve[t] > 0).map((t) => `${t}: ${player.reserve[t]}`).join(" · ") || "sem munição de reserva";
  const Q = player.foodQ;
  txt(`Comida ${player.food} (fresca ${Q.fresca} · comum ${Q.comum} · estragada ${Q.podre}) · Água ${player.water} · Kit ${player.med} · Antibiótico ${player.anti} · Implantes ${player.bag.length}/${BAG_MAX}`, 40, 518, 12, "#c9c4ad", "left", true, 540);
  // colete equipado (V troca entre os que você tem)
  const nv = save.vestsOwned.filter(Boolean).length;
  ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(590, 508, 340, 42, 6); ctx.fill();
  if (save.vest >= 0) { drawVestIcon(save.vest, 614, 529, 0.62); txt(`${VESTS[save.vest].name} · ${Math.round(vestDur())}%`, 640, 525, 13, vestDur() <= 25 ? "#e05a4a" : RARITY[VESTS[save.vest].rar].color, "left", true, 220); txt(vestText(VESTS[save.vest]), 640, 542, 10, "#a9a58f", "left", false, 280); }
  else txt("Sem colete", 604, 534, 13, "#6d6a58", "left", true);
  txt(`V: trocar (${nv})`, 922, 524, 10, "#ffd96a", "right", true);
  regClick(590, 508, 340, 42, cycleVest);
  txt(`Munição: ${ammoTxt}`, 40, 538, 12, "#a9a58f", "left", false, 880);
  hint("Setas/WASD escolhem · Enter equipa ou guarda · 1 2 3 põe no slot · X descarta · V troca colete · B ou Esc fecha");
}

// =====================================================================
//  Baú da base: guarda armas e materiais para sempre
// =====================================================================
function myList() {
  const out = [];
  player.slots.forEach((it, i) => { if (it) out.push({ it, where: "slot", i }); });
  player.pack.forEach((it, i) => out.push({ it, where: "pack", i }));
  return out;
}
function vaultCapacity() { return Math.min(400, Math.max(40, (save.vaultRows || 5) * 8)); }
function buyVaultRow() {
  const rows = Math.max(5, Math.min(50, save.vaultRows || 5));
  if (rows >= 50) { toast("O baú já possui 10 páginas completas."); return; }
  const cost = rows < 25 ? 10000 : 50000;
  if (game.money < cost) { toast("Dinheiro insuficiente: $" + cost.toLocaleString("pt-BR")); return; }
  game.money -= cost; save.vaultRows = rows + 1; save.run = runSnapshot(); persist();
  toast("Fileira liberada: +8 espaços no Baú da Base.");
}
function stashClothingStored(id) { return save.vault.some(v => v && v.kind === "clothing" && v.id === id); }
function stashInventoryCapacity() { return backpackBaseCapacity(player.level); }
function stashEntries() {
  const equippedBackpackId = save.clothing?.pack;
  const entries = invPackEntries().filter(z => z && z.item &&
    !(z.type === "clothing" && (z.item.id === equippedBackpackId || stashClothingStored(z.item.id))));
  player.slots.forEach((item, i) => { if (item) entries.push({ area: "wslot", type: "weapon", i, item }); });
  player.bag.forEach((item, i) => entries.push({ area: "bag", type: "implant", i, item }));
  save.installed.forEach((item, i) => entries.push({ area: "installed", type: "implant", i, item }));
  if (save.vest >= 0 && save.vestsOwned[save.vest])
    entries.push({ area: "vest-equipped", type: "vest", item: { i: save.vest } });
  for (const [kind, id] of Object.entries(save.clothing || {})) {
    if (kind === "pack") continue;
    const item = CLOTHING_BY_ID[id];
    if (item && !stashClothingStored(item.id))
      entries.push({ area: "clothes-equipped", type: "clothing", item });
  }
  BACKPACK_CATALOG.forEach(item => {
    if (item.id !== equippedBackpackId && !stashClothingStored(item.id) &&
        !entries.some(z => z.type === "clothing" && z.item?.id === item.id))
      entries.push({ area: "clothes-list", type: "clothing", item });
  });
  for (const id of ["fresca", "comum", "podre"]) {
    const qty = Math.floor(Number(player.foodQ?.[id]) || 0);
    if (qty > 0) entries.push({ area: "food", type: "food", item: { id, qty } });
  }
  for (const id of ["water", "med", "anti"]) {
    const n = Math.floor(Number(player[id]) || 0);
    if (n > 0) entries.push({ area: "supply", type: "supply", item: { id, n } });
  }
  return entries;
}
function stashItemName(it) {
  if (!it) return "";
  if (it.kind === "weapon") return instName(it);
  if (it.kind === "mat") return (MATS[it.id]?.name || it.id) + " ×" + it.qty;
  if (it.kind === "ammo") return "Munição " + it.id + " ×" + it.qty;
  if (it.kind === "implant") return implantName(it);
  if (it.kind === "vest") return VESTS[it.id]?.name || "Colete";
  if (it.kind === "clothing") return CLOTHING_BY_ID[it.id]?.name || "Roupa";
  if (it.kind === "food") return (FOOD_Q[it.id]?.name || "Comida") + " ×" + it.qty;
  return ({ water: "Água", med: "Kit médico", anti: "Antibiótico" }[it.kind] || it.kind) + " ×" + (it.qty || 1);
}
function stashSourceName(z) {
  if (!z) return "";
  if (z.type === "weapon" || z.type === "mat") return stashItemName(z.item);
  if (z.type === "ammo") return "Munição " + z.item.t + " ×" + z.item.n;
  if (z.type === "implant") return implantName(z.item);
  if (z.type === "vest") return VESTS[z.item.i]?.name || "Colete";
  if (z.type === "clothing") return z.item.name;
  if (z.type === "food") return stashItemName({ kind: "food", ...z.item });
  if (z.type === "supply") return stashItemName({ kind: z.item.id, qty: z.item.n });
  return "Item";
}
function stashPersist() { save.run = runSnapshot(); persist(); }
function stashStore(at) {
  const sourceIndex = game.vcur | 0;
  const z = sourceIndex < stashInventoryCapacity() ? stashEntries()[sourceIndex] : null;
  if (!z || !z.item) { toast("Escolha um item no inventário inferior."); return; }
  let obj = null, merged = null;
  if (z.type === "weapon" || z.type === "mat") {
    obj = z.item;
    if (z.type === "mat") merged = save.vault.find(v => v && v.kind === "mat" &&
      v.id === obj.id && !!v.loot === !!obj.loot && !!v.tokenBound === !!obj.tokenBound);
  } else if (z.type === "ammo") {
    const id = z.item.t, qty = Math.min(Math.floor(z.item.n), Math.floor(player.reserve[id] || 0));
    if (qty <= 0) return;
    obj = { kind: "ammo", id, qty, tokenQty: Math.min(qty, Math.floor(player.tokenAmmo?.[id] || 0)) };
  } else if (z.type === "implant") {
    obj = { ...z.item, kind: "implant" };
  } else if (z.type === "vest") {
    if (!save.vestsOwned[z.item.i]) return;
    obj = { kind: "vest", id: z.item.i, dur: vestDur(z.item.i) };
  } else if (z.type === "clothing") {
    if (stashClothingStored(z.item.id)) { toast("Essa peça já está guardada."); return; }
    obj = { kind: "clothing", id: z.item.id };
  } else if (z.type === "food") {
    const qty = Math.floor(player.foodQ?.[z.item.id] || 0);
    if (qty <= 0) return;
    obj = { kind: "food", id: z.item.id, qty };
  } else if (z.type === "supply") {
    const id = z.item.id, qty = Math.floor(player[id] || 0);
    if (!["water", "med", "anti"].includes(id) || qty <= 0) return;
    obj = { kind: id, qty };
  } else { toast("Item inválido."); return; }
  if (!merged && save.vault.length >= vaultCapacity()) {
    toast("Baú cheio. Libere uma fileira para guardar mais itens."); return;
  }
  if (z.type === "weapon" || z.type === "mat") {
    if (z.area === "wslot") { player.slots[z.i] = null; player.reloading = 0; }
    else if (z.area === "pack") {
      const index = player.pack.indexOf(z.item); if (index < 0) return; player.pack.splice(index, 1);
    } else return;
  } else if (z.type === "ammo") {
    player.reserve[obj.id] -= obj.qty;
    player.tokenAmmo[obj.id] = Math.max(0, (player.tokenAmmo[obj.id] || 0) - obj.tokenQty);
  } else if (z.type === "implant") {
    const group = z.area === "installed" ? save.installed : player.bag;
    const index = group.indexOf(z.item); if (index < 0) return;
    group.splice(index, 1); if (z.area === "installed") recalcImplants();
  } else if (z.type === "vest") {
    save.vestsOwned[obj.id] = false;
    if (save.vest === obj.id) { save.vest = -1; recalcImplants(); }
  } else if (z.type === "clothing") {
    if (save.clothing[z.item.kind] === obj.id) save.clothing[z.item.kind] = null;
  } else if (z.type === "food") {
    player.foodQ[obj.id] -= obj.qty; player.food = Math.max(0, player.food - obj.qty);
  } else if (z.type === "supply") {
    player[obj.kind] -= obj.qty;
  }
  if (merged) merged.qty += obj.qty;
  else save.vault.splice(Math.max(0, Math.min(save.vault.length,
    Number.isInteger(at) ? at : save.vault.length)), 0, obj);
  game.vside = 0;
  game.vcur = Math.max(0, Math.min(game.vcur, stashEntries().length - 1));
  stashPersist(); toast("Guardado: " + stashItemName(obj));
}
function stashWithdraw(index = game.vcur | 0) {
  const obj = save.vault[index];
  if (!obj) { toast("Escolha um item do baú."); return; }
  const materialStack = obj.kind === "mat" && player.pack.find(item => item.kind === "mat" &&
    item.id === obj.id && !!item.loot === !!obj.loot && !!item.tokenBound === !!obj.tokenBound);
  let addedSlots = 1;
  if (obj.kind === "ammo") {
    const held = player.reserve[obj.id] || 0;
    addedSlots = Math.ceil((held + obj.qty) / AMMO_STACK) - Math.ceil(held / AMMO_STACK);
  } else if (materialStack || (obj.kind === "vest" && save.vestsOwned[obj.id]) ||
      (obj.kind === "food" && player.foodQ[obj.id] > 0) ||
      (["water", "med", "anti"].includes(obj.kind) && player[obj.kind] > 0)) {
    addedSlots = 0;
  }
  if (addedSlots > 0 && stashEntries().length + addedSlots > stashInventoryCapacity()) {
    toast("Inventário inferior cheio. Guarde um item para liberar espaço."); return;
  }
  if (obj.kind === "weapon") {
    if (!addWeapon(obj)) { toast("Inventário cheio."); return; }
  } else if (obj.kind === "mat") {
    if (materialStack) materialStack.qty += obj.qty;
    else {
      if (packUsed() >= packCapacity()) { toast("Inventário cheio."); return; }
      player.pack.push(obj);
    }
  } else if (obj.kind === "ammo") {
    if (ammoRoom(obj.id) < obj.qty) { toast("Sem espaço para munição."); return; }
    player.reserve[obj.id] = (player.reserve[obj.id] || 0) + obj.qty;
    player.tokenAmmo[obj.id] = (player.tokenAmmo[obj.id] || 0) + Math.min(obj.qty, obj.tokenQty || 0);
  } else if (obj.kind === "implant") {
    if (player.bag.length >= BAG_MAX) { toast("Sem espaço para implantes guardados."); return; }
    const im = { ...obj }; delete im.kind; player.bag.push(im);
  } else if (obj.kind === "vest") {
    save.vestsOwned[obj.id] = true;
    if (Number.isFinite(obj.dur)) save.vestDur[obj.id] = obj.dur;
  } else if (obj.kind === "clothing") {
    if (!CLOTHING_BY_ID[obj.id]) return;
  } else if (obj.kind === "food") {
    player.foodQ[obj.id] = (player.foodQ[obj.id] || 0) + obj.qty;
    player.food += obj.qty;
  } else if (["water", "med", "anti"].includes(obj.kind)) {
    player[obj.kind] += obj.qty;
  } else { toast("Tipo de item inválido."); return; }
  const title = stashItemName(obj);
  save.vault.splice(index, 1);
  game.vside = 1; game.vcur = Math.max(0, Math.min(index, save.vault.length - 1));
  stashPersist(); toast("Retirado: " + title);
}
function vaultMove() { if (game.vside === 1) stashWithdraw(game.vcur); else stashStore(); }
function stashKey(key) {
  if (key === "a" || key === "arrowleft") game.vpage = Math.max(0, (game.vpage || 0) - 1);
  else if (key === "d" || key === "arrowright") game.vpage = Math.min(9, (game.vpage || 0) + 1);
  else if (key === "tab") game.vside = game.vside === 1 ? 0 : 1;
  else if (key === "w" || key === "arrowup") game.vcur = Math.max(0, (game.vcur || 0) - 1);
  else if (key === "s" || key === "arrowdown") {
    const limit = game.vside === 1 ? save.vault.length : Math.min(stashEntries().length, stashInventoryCapacity());
    game.vcur = Math.max(0, Math.min(limit - 1, (game.vcur || 0) + 1));
  }
  else if (key === "enter") vaultMove();
}
function stashSlot(x, y, w, h, selected, disabled) {
  ctx.fillStyle = disabled ? "#090b0a" : "#171a18";
  rr(x, y, w, h, 3); ctx.fill();
  ctx.strokeStyle = selected ? "#ffdc86" : disabled ? "#282820" : "#806443";
  ctx.lineWidth = selected ? 2 : 1.5; ctx.stroke();
  ctx.fillStyle = disabled ? "rgba(35,35,31,.35)" : "rgba(154,150,129,.10)";
  for (let n = y + 7; n < y + h - 5; n += 5) ctx.fillRect(x + 5, n, w - 10, 1);
}
function stashIcon(entry, x, y, w, h) {
  if (!entry || !entry.item) return;
  if (entry.type === "ammo") {
    invAmmoCell(entry.item, x, y, w, h); return;
  }
  if (entry.type === "food") {
    invIcon({ type: "supply", item: { id: "food", n: entry.item.qty } }, x, y, w, h); return;
  }
  invIcon(entry, x, y, w, h);
}
function stashVaultIcon(item, x, y, w, h) {
  if (!item) return;
  let entry = null;
  if (item.kind === "weapon" || item.kind === "mat") entry = { type: item.kind, item };
  else if (item.kind === "ammo") entry = { type: "ammo", item: { t: item.id, n: item.qty } };
  else if (item.kind === "implant") entry = { type: "implant", item };
  else if (item.kind === "vest") entry = { type: "vest", item: { i: item.id } };
  else if (item.kind === "clothing") entry = { type: "clothing", item: CLOTHING_BY_ID[item.id] };
  else if (item.kind === "food") entry = { type: "supply", item: { id: "food", n: item.qty } };
  else if (["water", "med", "anti"].includes(item.kind)) entry = { type: "supply", item: { id: item.kind, n: item.qty } };
  if (entry) stashIcon(entry, x, y, w, h);
}
function stashSelect(side, index) {
  const prev = game.stashSelected;
  if (side === 1 && index >= vaultCapacity()) { toast("Fileira bloqueada."); return; }
  if (side === 0 && index >= stashInventoryCapacity()) return;
  const item = side === 0 ? stashEntries()[index] : save.vault[index];
  if (prev && prev.side !== side) {
    if (prev.side === 0) { game.vcur = prev.index; stashStore(side === 1 ? index : undefined); }
    else stashWithdraw(prev.index);
    game.stashSelected = null;
    return;
  }
  if (!item) { game.stashSelected = null; return; }
  if (prev && prev.side === side && prev.index === index) {
    if (side === 0) { game.vcur = index; stashStore(); } else stashWithdraw(index);
    game.stashSelected = null; return;
  }
  game.stashSelected = { side, index }; game.vside = side; game.vcur = index;
}
function drawStash() {
  const items = stashEntries(), vault = save.vault, rows = Math.max(5, Math.min(50, save.vaultRows || 5));
  game.vpage = Math.max(0, Math.min(9, game.vpage || 0));
  const inventoryCapacity = stashInventoryCapacity();
  const excess = Math.max(0, items.length - inventoryCapacity);
  menuFrame("BAÚ DA BASE", "Armazene e retire itens · clique no item e depois no destino.");
  ctx.fillStyle = "rgba(10,11,9,.72)"; rr(99, 110, 766, 307, 6); ctx.fill();
  ctx.strokeStyle = "#69533a"; ctx.lineWidth = 1.4; ctx.stroke();
  txt("ARMAZENAMENTO", 110, 82, 17, "#b9362d", "left", true);
  txt("Página " + (game.vpage + 1) + " / 10", 848, 82, 13, "#ffe2a2", "right", true);
  if (rows < 50) btn(385, 82, 260, 26, "Liberar +8 slots · $" + (rows < 25 ? 10000 : 50000).toLocaleString("pt-BR"), buyVaultRow, true);
  else txt("400 espaços liberados", 468, 100, 13, "#9fe6a1", "center", true);
  txt("Ocupação " + vault.length + "/" + vaultCapacity(), 120, 103, 11, "#c6bca7");
  btn(38, 250, 44, 38, "◀", () => { game.vpage = Math.max(0, game.vpage - 1); });
  btn(883, 250, 44, 38, "▶", () => { game.vpage = Math.min(9, game.vpage + 1); });
  for (let row = 0; row < 5; row++) {
    const disabled = game.vpage * 5 + row >= rows, y = 119 + row * 57;
    for (let col = 0; col < 8; col++) {
      const index = game.vpage * 40 + row * 8 + col, x = 112 + col * 93;
      const entry = disabled ? null : vault[index], selected = !!game.stashSelected && game.stashSelected.side === 1 && game.stashSelected.index === index;
      stashSlot(x, y, 88, 53, selected, disabled);
      if (entry) stashVaultIcon(entry, x, y, 88, 53);
      if (!disabled) regClick(x, y, 88, 53, () => stashSelect(1, index));
    }
    if (disabled) txt(game.vpage * 5 + row === rows ? "LIBERAR FILEIRA" : "BLOQUEADO", 480, y + 30, 12, "#9c8263", "center", true);
  }
  ctx.fillStyle = "rgba(9,10,8,.86)"; rr(26, 430, 906, 117, 5); ctx.fill();
  ctx.strokeStyle = "#60513c"; ctx.lineWidth = 1.2; ctx.stroke();
  txt("INVENTÁRIO", 480, 446, 15, "#e4d3aa", "center", true);
  txt("Ocupação " + Math.min(items.length, inventoryCapacity) + "/" + inventoryCapacity, 38, 446, 10, "#b6ac94", "left", true);
  if (excess) txt("+" + excess + " aguardando espaço", 916, 446, 11, "#d9bc7c", "right", true);
  else if (inventoryCapacity < 30)
    txt("+2 slots no nível " + packSlotUnlockLevel(inventoryCapacity), 916, 446, 11, "#d9bc7c", "right", true);
  for (let row = 0; row < 2; row++) for (let col = 0; col < 15; col++) {
    const index = row * 15 + col, x = 37 + col * 59, y = 455 + row * 43;
    const locked = index >= inventoryCapacity;
    const entry = locked ? null : items[index];
    const selected = !locked && game.stashSelected?.side === 0 && game.stashSelected.index === index;
    stashSlot(x, y, 55, 39, selected, locked);
    if (locked) {
      txt("NV " + packSlotUnlockLevel(index), x + 27.5, y + 23, 10, "#777164", "center", true);
      continue;
    }
    if (entry) stashIcon(entry, x, y, 55, 39);
    regClick(x, y, 55, 39, () => stashSelect(0, index));
  }
  btn(710, 553, 100, 25, "↓ Guardar", () => {
    const selected = game.stashSelected;
    if (!selected || selected.side !== 0) return toast("Selecione um item no inventário.");
    game.vcur = selected.index; stashStore(); game.stashSelected = null;
  }, true);
  btn(815, 553, 116, 25, "↑ Retirar", () => {
    const selected = game.stashSelected;
    if (!selected || selected.side !== 1) return toast("Selecione um item do baú.");
    stashWithdraw(selected.index); game.stashSelected = null;
  }, true);
  txt("Selecione e clique no destino ou use Guardar / Retirar.", 40, 570, 11, "#bdb19b");
}

// =====================================================================
//  Loja dos postos
// =====================================================================
const SHOP_TABS = ["Munição"];
const AMMO_PACK_SIZE = 999, AMMO_PACK_PRICE = 14000;
const CAT_ORDER = { pistols: 0, machinegun: 1, shotguns: 2, rifles: 3, melee: 4 };
const SHOP_WEAPONS = WLIST.filter((d) => d.rar <= 3 && !d.craftOnly && !d.fists && d.price > 0).sort((a, b) => CAT_ORDER[a.cat] - CAT_ORDER[b.cat] || a.price - b.price);
function shopList() { return Object.keys(AMMO); }
function openShop() {
  if (!inSafe() && !adm.shopAnywhere) { toast("A loja de munições fica na base."); return; }
  game.shop = true; game.shopTab = 0; game.shopCur = 0;
}
function shopBuy() {
  const type = shopList()[game.shopCur | 0];
  if (!type) return;
  const free = shopFree();
  if (!free && game.money < AMMO_PACK_PRICE) { toast("Você precisa de $14.000 para comprar munições."); return; }
  if (ammoRoom(type) < AMMO_PACK_SIZE) { toast("Espaço insuficiente para 999 munições na mochila."); return; }
  if (free) player.tokenAmmo[type] = (player.tokenAmmo[type] || 0) + AMMO_PACK_SIZE;
  else game.money -= AMMO_PACK_PRICE;
  player.reserve[type] = (player.reserve[type] || 0) + AMMO_PACK_SIZE;
  sfx.buy();
  checkpoint("compra de pacote de munição");
  toast("Comprou 999 munições " + type + (free ? " de graça (Token da Loja)" : " por $14.000"));
}
function vestText(v) {
  const up = vestUpgrade(VESTS.indexOf(v));
  return `-${v.armor + up.armor}% dano${up.speed ? ` · +${up.speed}% velocidade` : ""}${v.slow ? ` · -${v.slow}% velocidade` : ""}${v.hp ? ` · +${v.hp} vida` : ""}${v.acid ? ` · -${v.acid}% ácido` : ""}${v.stealth ? ` · +${v.stealth}% furtividade` : ""}`;
}
function buyVest(i) {
  const v = VESTS[i];
  if (save.vestsOwned[i]) { save.vest = i; recalcImplants(); persist(); toast(`${v.name} equipado`); return; }
  if (v.craft) { toast("Esse colete só pode ser criado na oficina"); return; }
  if (v.credits) {
    if (save.credits < v.credits) { toast(`Precisa de ${v.credits} créditos (compre no banco)`); return; }
    save.credits -= v.credits;
  } else {
    if (game.money < v.price) { toast("Dinheiro insuficiente"); return; }
    game.money -= v.price;
  }
  sfx.buy(); gainVest(i); save.vest = i; recalcImplants(); persist();
}
function shopKey(k) {
  if (k === "b" || k === "escape" || k === "e") { game.shop = false; return; }
  const len = shopList().length;
  if (k === "w" || k === "arrowup") game.shopCur = Math.max(0, game.shopCur - 1);
  else if (k === "s" || k === "arrowdown") game.shopCur = Math.min(len - 1, game.shopCur + 1);
  else if (k === "enter") shopBuy();
}
function drawShop() {
  const free = shopFree();
  menuFrame("Loja de Munições", free ? "TOKEN DA LOJA ATIVO · tudo de graça até " + new Date(save.shopFreeUntil).toLocaleString("pt-BR")
    : "Dinheiro: $" + game.money.toLocaleString("pt-BR") + " · Cada pacote: 999 munições por $14.000");
  const list = shopList();
  const selected = Math.min(list.length - 1, Math.max(0, game.shopCur | 0));
  game.shopCur = selected;
  list.forEach((type, i) => {
    const y = 110 + i * 42;
    if (y > 480) return;
    rowBox(40, y, 520, 38, selected === i);
    drawEntryIcon({ type: "ammo", ammo: type }, 76, y + 20, 0.5);
    txt(type + " · 999 unidades", 124, y + 18, 15, "#f2eedc", "left", true);
    txt("Você tem: " + (player.reserve[type] || 0), 124, y + 33, 11, "#a9a58f");
    txt(free ? "GRÁTIS" : "$14.000", 544, y + 25, 14, free ? "#ffd96a" : game.money >= AMMO_PACK_PRICE ? "#6fae4f" : "#e05a4a", "right", true);
    rowClick(40, y, 520, 38, selected === i, () => { game.shopCur = i; }, shopBuy);
  });
  const type = list[selected], px = 600;
  ctx.fillStyle = "rgba(0,0,0,.35)"; rr(px - 10, 100, 326, 380, 8); ctx.fill();
  if (type) {
    drawEntryIcon({ type: "ammo", ammo: type }, 760, 188, 1.6);
    txt("Munição " + type, px, 286, 20, "#f2eedc", "left", true);
    txt("Pacote com 999 unidades", px, 316, 15, "#ffd96a");
    txt(free ? "Preço: GRÁTIS (Token da Loja)" : "Preço: $14.000", px, 344, 15, free ? "#ffd96a" : "#6fae4f", "left", true);
    txt("Espaço necessário na mochila", px, 369, 12, "#a9a58f");
    btn(px + 60, 422, 200, 42, "Comprar (Enter)", shopBuy, true);
  }
  hint("W/S escolhe calibre · Enter compra · B, E ou Esc fecha");
  menuToast();
}

// =====================================================================
//  Personagem (aba do menu C): escolher a aparência
// =====================================================================
function pickSkin(i) {
  const s = SKINS[i];
  if (player.level < s.lvl && !adm.noReq) { toast(`${s.name} libera no nível ${s.lvl}`); return; }
  save.skin = i; persist(); toast(`Agora você é: ${s.name}`);
}
function skinsKey(k) {
  game.skc = game.skc == null ? save.skin : game.skc;
  if (k === "a" || k === "arrowleft") game.skc = (game.skc + SKINS.length - 1) % SKINS.length;
  else if (k === "d" || k === "arrowright") game.skc = (game.skc + 1) % SKINS.length;
  else if (k === "enter") pickSkin(game.skc);
}
function drawSkins() {
  game.skc = game.skc == null ? save.skin : game.skc;
  SKINS.forEach((s, i) => {
    const x = 40 + i * 98, y = 100, w = 92, h = 200, sel = game.skc === i, lock = player.level < s.lvl && !adm.noReq;
    rowBox(x, y, w, h, sel, save.skin === i ? "#6fae4f" : null);
    rowClick(x, y, w, h, sel, () => { game.skc = i; }, () => pickSkin(i));
    if (lock) ctx.globalAlpha = 0.35;
    if (!drawSpr(s.spr, x + w / 2, y + 92, w - 10, 170)) txt("?", x + w / 2, y + 100, 30, "#6d6a58", "center", true);
    ctx.globalAlpha = 1;
    txt(s.name, x + w / 2, y + h - 10, 11, sel ? "#ffd96a" : "#e5e0c8", "center", true, w - 6);
    if (lock) txt(`nível ${s.lvl}`, x + w / 2, y + 100, 13, "#e05a4a", "center", true);
    if (save.skin === i) txt("✔", x + w - 10, y + 16, 14, "#6fae4f", "right", true);
  });
  const s = SKINS[game.skc];
  ctx.fillStyle = "rgba(0,0,0,0.3)"; rr(40, 320, 880, 190, 8); ctx.fill();
  drawSpr(s.spr, 140, 415, 160, 180);
  txt(s.name, 250, 360, 24, "#f2eedc", "left", true);
  txt(player.level >= s.lvl ? "Disponível" : `Libera no nível ${s.lvl}`, 250, 386, 14, player.level >= s.lvl ? "#6fae4f" : "#e05a4a", "left", true);
  txt("A aparência muda o boneco no mapa e o retrato. Não muda atributos.", 250, 408, 13, "#a9a58f");
  // prévia de cima
  ctx.save(); ctx.translate(800, 420); ctx.scale(2.6, 2.6);
  const keep = save.skin, px = player.x, py = player.y, pa = player.angle; save.skin = game.skc;
  player.x = 0; player.y = 0; player.angle = -0.4; drawPlayer();
  save.skin = keep; player.x = px; player.y = py; player.angle = pa;
  ctx.restore();
  txt("visto de cima", 800, 500, 11, "#a9a58f", "center");
}

// =====================================================================
//  Oficina: criar armas especiais e melhorar armas (até 8)
// =====================================================================
function craftWeapons() { return allMyWeapons().filter((it) => !WDEF[it.id].fists); }
function craftVests() { return VESTS.map((v, i) => i).filter(i => save.vestsOwned[i]); }
function craftKey(k) {
  if (k === "tab") { game.ctab = ((game.ctab || 0) + 1) % 3; game.ccur = 0; game.cstat = 0; return; }
  const len = game.ctab === 0 ? RECIPES.length : game.ctab === 1 ? craftWeapons().length : craftVests().length;
  if (k === "w" || k === "arrowup") game.ccur = Math.max(0, game.ccur - 1);
  else if (k === "s" || k === "arrowdown") game.ccur = Math.max(0, Math.min(len - 1, game.ccur + 1));
  else if (k === "enter") { if (game.ctab === 0) craftRecipe(); else if (game.ctab === 1) upgradeWeapon(); else upgradeVest(); }
  else if (k === "g" && game.ctab === 1) craftPerfect();
  else if (k === "v") repairVest();
}
// o implante Artesão dá desconto no dinheiro da oficina
function craftMoney(m) { return Math.round(m * (1 - Math.min(0.5, player.fx.craftDisc / 100))); }
function recipeName(r) { return r.vest != null ? VESTS[r.vest].name : WDEF[r.id].name; }
function craftRecipe() {
  const r = RECIPES[game.ccur], cost = craftMoney(r.money);
  if (player.level < r.level) { toast(`Precisa do nível ${r.level}`); return; }
  if (r.needVest != null && !save.vestsOwned[r.needVest]) { toast(`Precisa ter a ${VESTS[r.needVest].name} (ela é usada como base)`); return; }
  if (r.vest != null && save.vestsOwned[r.vest]) { toast("Você já tem esse colete"); return; }
  if (game.money < cost) { toast(`Precisa de $${cost} na mochila`); return; }
  if (!hasMats(r.mats)) { toast("Faltam materiais"); return; }
  if (r.vest == null && player.slots.indexOf(null) < 0 && packUsed() >= packCapacity()) { toast("Mochila cheia"); return; }
  for (const m in r.mats) takeMat(m, r.mats[m]);
  game.money -= cost; stat("crafts");
  if (r.vest != null) {
    save.vestsOwned[r.needVest] = false;
    if (save.vestUpgrades) delete save.vestUpgrades[r.needVest];
    if (save.vest === r.needVest) save.vest = -1;
    gainVest(r.vest); save.vest = r.vest; recalcImplants();
  } else { addWeapon(newInst(r.id)); registerWeapon(r.id); }
  persist(); sfx.level();
  game.banner = { text: `${recipeName(r)} criado!`, sub: r.vest != null ? "Colete equipado" : "Abra a mochila (B) para equipar", t: 2600, gold: true };
}
function payUpgrade(c) {
  const cost = craftMoney(c.money);
  if (game.money < cost) { toast(`Precisa de $${cost} na mochila`); return false; }
  if (!hasMats(c.mats)) { toast("Faltam materiais"); return false; }
  for (const m in c.mats) takeMat(m, c.mats[m]);
  game.money -= cost;
  return true;
}
function finishUpgrade(message) {
  stat("upgrades");
  // Weapon instances in slots/pack belong to the current run checkpoint.
  save.run = runSnapshot();
  persist(); sfx.buy(); toast(message);
}
const CRAFT_PERFEITO_PRECO = 100000;
function craftPerfect() {
  if (game.ctab !== 1) return;
  const it = craftWeapons()[game.ccur];
  if (!it) return;
  if (it.gc && it.up.acc === 8 && it.up.dmg === 8 && it.up.rel === 8) {
    toast("Esta arma já tem Craft Perfeito (GC)."); return;
  }
  if (game.money < CRAFT_PERFEITO_PRECO) {
    toast("Craft Perfeito exige $100.000."); return;
  }
  game.money -= CRAFT_PERFEITO_PRECO;
  it.up = { acc: 8, dmg: 8, rel: 8 };
  it.gc = true;
  finishUpgrade(instName(it) + " · Craft Perfeito 8/8/8!");
  game.banner = { text: instName(it), sub: "CRAFT PERFEITO · Precisão 8 · Dano 8 · Recarga 8", t: 3300, gold: true };
}
function upgradeWeapon() {
  const it = craftWeapons()[game.ccur];
  if (it && it.gc) { toast("Arma GC já está no máximo. Não é possível sortear novamente."); return; }
  if (!it || !payUpgrade(upgradeCost(it))) return;
  it.up = rollUpgrades(UP_STATS, UP_MAX);
  finishUpgrade(`${WDEF[it.id].name}: Precisão ${it.up.acc} · Dano ${it.up.dmg} · Recarga ${it.up.rel}`);
}
function upgradeVest() {
  const i = craftVests()[game.ccur];
  if (i == null || !payUpgrade(vestUpgradeCost(i))) return;
  save.vestUpgrades = save.vestUpgrades || {};
  const up = save.vestUpgrades[i] = rollUpgrades(VEST_UP_STATS, VEST_UP_MAX);
  recalcImplants();
  finishUpgrade(`${VESTS[i].name}: Armadura ${up.armor} · Velocidade ${up.speed}`);
}
function matsLine(mats, x, y) {
  let xx = x;
  for (const m in mats) {
    if (!mats[m]) continue;
    const have = matCount(m), ok = have >= mats[m];
    drawMatIcon(m, xx + 10, y - 4, 0.28);
    const t = `${have}/${mats[m]}`;
    txt(t, xx + 24, y, 13, ok ? "#6fae4f" : "#e05a4a", "left", true);
    ctx.font = `bold 13px ${FONT}`; xx += 34 + ctx.measureText(t).width;
  }
}
function drawCraft() {
  game.ctab = game.ctab || 0; game.ccur = game.ccur || 0; game.cstat = game.cstat || 0;
  menuFrame("Oficina", `Dinheiro: $${game.money}  ·  Nível ${player.level}  ·  materiais da mochila e do baú contam aqui`);
  if (save.vest >= 0) {
    const vd = Math.round(vestDur()), c = repairCost();
    btn(W - 270, 20, 230, 30, vd >= 100 ? `Colete ${vd}% (inteiro)` : `V: consertar colete ${vd}% · $${Math.max(1, c)}`, repairVest, vd < 100, vd >= 100);
  }
  ["Criar equipamentos", "Melhorar armas", "Melhorar coletes"].forEach((t, i) => {
    const x = 60 + i * 290, sel = game.ctab === i;
    txt(t, x + 100, 104, 15, sel ? "#ffd96a" : "#6d6a58", "center", true);
    if (sel) { ctx.fillStyle = "#ffd96a"; ctx.fillRect(x + 30, 110, 140, 2); }
    regClick(x, 88, 200, 26, () => { game.ctab = i; game.ccur = 0; game.cstat = 0; });
  });
  const px = 600, pw = 320;
  ctx.fillStyle = "rgba(0,0,0,0.25)"; rr(px - 10, 122, pw + 20, 400, 8); ctx.fill();
  if (game.ctab === 0) {
    RECIPES.forEach((r, i) => {
      const y = 120 + i * 56, sel = game.ccur === i, cost = craftMoney(r.money);
      const ok = player.level >= r.level && game.money >= cost && hasMats(r.mats) && (r.needVest == null || save.vestsOwned[r.needVest]);
      rowBox(40, y, 520, 52, sel, ok ? "#6fae4f" : null);
      rowClick(40, y, 520, 52, sel, () => { game.ccur = i; }, craftRecipe);
      if (r.vest != null) drawVestIcon(r.vest, 96, y + 26, 0.7); else drawWeaponSide(WDEF[r.id], 96, y + 26, 0.36);
      txt(recipeName(r), 160, y + 19, 14, r.vest != null ? RARITY[VESTS[r.vest].rar].color : rarColor(WDEF[r.id]), "left", true, 280);
      matsLine(r.mats, 160, y + 41);
      txt(`$${cost}`, 548, y + 19, 13, game.money >= cost ? "#6fae4f" : "#e05a4a", "right", true);
      txt(`nível ${r.level}`, 548, y + 40, 11, player.level >= r.level ? "#6fae4f" : "#e05a4a", "right", true);
    });
    const r = RECIPES[game.ccur];
    if (r.vest != null) {
      const v = VESTS[r.vest];
      drawVestIcon(r.vest, px + pw / 2, 200, 2.2);
      txt(v.name, px, 290, 17, RARITY[v.rar].color, "left", true, pw);
      txt(vestText(v), px, 312, 12, "#c9c4ad", "left", false, pw);
      txt(`Precisa ter: ${VESTS[r.needVest].name}`, px, 340, 12, save.vestsOwned[r.needVest] ? "#6fae4f" : "#e05a4a", "left", true, pw);
      txt("(ela é consumida no craft)", px, 356, 11, "#a9a58f");
      txt("Placa de blindagem: só cai dos chefes de áreas pretas, roxas e cinzas", px, 382, 11, "#ffd96a", "left", false, pw);
    } else weaponDetail(WDEF[r.id], null, px, 130, pw);
    btn(px + 70, 470, 180, 40, "Criar (Enter)", craftRecipe, true);
    hint("W/S escolhe · Enter cria · Tab troca de aba · clique 2x para criar · E ou Esc fecha");
  } else {
    const isVest = game.ctab === 2, list = isVest ? craftVests() : craftWeapons();
    if (!list.length) txt(`Você não tem ${isVest ? "coletes" : "armas"} para melhorar.`, 300, 160, 15, "#6d6a58", "center");
    const vis = 9, off = Math.max(0, Math.min(list.length - vis, game.ccur - 4));
    list.slice(off, off + vis).forEach((it, j) => {
      const i = off + j, y = 124 + j * 42, sel = game.ccur === i;
      if (isVest) {
        const up = vestUpgrade(it);
        rowBox(40, y, 520, 34, sel);
        txt(VESTS[it].name, 52, y + 22, 13, "#e5e0c8", "left", true, 330);
        txt(`A${up.armor} V${up.speed}`, 548, y + 22, 12, "#ffd96a", "right");
      } else drawListItem(it, 40, y, 520, sel, `P${it.up.acc} D${it.up.dmg} R${it.up.rel}`);
      rowClick(40, y, 520, 34, sel, () => { game.ccur = i; }, () => {});
    });
    const it = list[game.ccur];
    if (it != null) {
      const d = isVest ? VESTS[it] : WDEF[it.id], up = isVest ? vestUpgrade(it) : it.up;
      ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(px, 130, pw, 90, 8); ctx.fill();
      if (isVest) drawVestIcon(it, px + pw / 2, 175, 1);
      else drawWeaponSide(d, px + pw / 2, 175, Math.min(1.6, (pw - 30) / 125));
      txt(isVest ? d.name : instName(it), px, 244, 17, "#f2eedc", "left", true, pw);
      (isVest ? VEST_UP_STATS : UP_STATS).forEach((s, i) => {
        const y = 262 + i * 48, lv = up[s.id];
        rowBox(px, y, pw, 44, false);
        txt(`${s.name} ${lv}`, px + 10, y + 17, 13, "#e5e0c8", "left", true);
        const effect = isVest ? (s.id === "armor" ? `+${lv}% de proteção` : `+${lv}% de velocidade`) : upEffect(d, s.id, lv);
        txt(effect, px + 10, y + 35, 11, "#a9a58f");
      });
      txt(`Sorteia todos: 1 a ${isVest ? VEST_UP_MAX : UP_MAX} por atributo.`, px, 422, 11, "#ffd96a", "left", false, pw);
      txt("Substitui os valores atuais; pode diminuir.", px, 438, 11, "#a9a58f", "left", false, pw);
      const c = isVest ? vestUpgradeCost(it) : upgradeCost(it), cost = craftMoney(c.money);
      txt(`Sorteio: $${cost}`, px, 459, 13, game.money >= cost ? "#6fae4f" : "#e05a4a", "left", true);
      matsLine(c.mats, px + 180, 459);
      btn(px + 70, 474, 180, 36, "Melhorar (Enter)", isVest ? upgradeVest : upgradeWeapon, true, !isVest && !!it.gc);
      if (!isVest) {
        const isGC = !!it.gc && it.up.acc === 8 && it.up.dmg === 8 && it.up.rel === 8;
        btn(px + 28, 515, 264, 35,
          isGC ? "CRAFT PERFEITO (GC)" : "Craft Perfeito 8/8/8 · $100.000",
          craftPerfect, true, isGC || game.money < CRAFT_PERFEITO_PRECO);
      }
    }
    hint(game.ctab === 1 ? "W/S escolhe · Enter melhora · G: Craft Perfeito 8/8/8 ($100.000) · Esc fecha" : "W/S escolhe · Enter melhora · Tab troca de aba · E ou Esc fecha");
  }
  menuToast();
}
