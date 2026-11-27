"use strict";
// =====================================================================
//  Retrato do personagem (renderizado no Blender) e inventário de arrastar (tecla B)
//
//  Retrato: img/portrait.png (roupa em cinza) + portrait_mask.png (jaqueta/calça) pintados com a cor
//  da roupa, mais as camadas do que está equipado (colete, mochila e acessório da cabeça).
//  Inventário: boneco no meio com os slots em volta; implantes à esquerda, coletes à direita,
//  mochila embaixo. Arraste para equipar, trocar, guardar ou descartar.
// =====================================================================

// ---------------------------------------------------------------- retrato
const PORTRAIT = { base: null, mask: null, gear: {}, cache: null, key: "" };
function portraitImg(name) {
  const im = new Image();
  im.src = `img/${name}.png${CHAR_V}`;
  return im;
}
function portraitReady(im) { return im && im.complete && im.naturalWidth > 0; }
// a capa 3D já está no retrato? (então o desenho 2D antigo da capa não aparece)
function cape3d() {
  const id = CAPE_GEAR[save.cape | 0];
  return !!(id && PORTRAIT.cache && portraitReady(PORTRAIT.gear[id]));
}
function portraitGearImg(id) {
  if (!(id in PORTRAIT.gear)) PORTRAIT.gear[id] = portraitImg(`portrait_${id}`);
  return PORTRAIT.gear[id];
}
// pinta a roupa (cinza) com as cores do personagem usando a máscara (vermelho = jaqueta, verde = calça)
function tintWithMask(base, mask, skin, equipment, portrait) {
  return clothingTintCanvas(base, mask, skin, equipment, !!portrait);
}
// imagem pronta do retrato (cache por roupa + equipamento); null se ainda não carregou
// arma do slot 1 no retrato: o corpo na pose de mira dessa arma (portrait_<pose>.png) e a arma por cima
// (portrait_<modelo>.png, já com o corpo escondendo o que fica atrás). Sem arma no slot 1: retrato descansado.
function portraitWeapon() {
  if (true) return null;   // retrato do inventário: personagem girando parado, sem arma
  const it = typeof player !== "undefined" && player.slots ? player.slots[0] : null;
  const w = it && typeof WDEF !== "undefined" ? WDEF[it.id] : null;
  if (!w) return null;
  const d = typeof WEAPON_3D !== "undefined" ? WEAPON_3D[it.id] : null;
  return { pose: weaponPose(w), m: d ? d.m : null, f: d && d.f ? d.f : "" };
}
function portraitCanvas() {
  if (!PORTRAIT.base) { PORTRAIT.base = portraitImg("portrait"); PORTRAIT.mask = portraitImg("portrait_mask"); }
  const pw = portraitWeapon();
  // arma sem modelo 3D: retrato descansado (não fica mirando com a mão vazia); punhos: guarda de luta
  const aim = pw && (pw.m || pw.pose === "punhos");
  const poseImg = aim ? portraitGearImg(pw.pose) : null, wImg = aim && pw.m ? portraitGearImg(pw.m) : null;
  const base = portraitReady(poseImg) ? poseImg : PORTRAIT.base;
  if (!portraitReady(base)) return null;
  const gear = playerGear();
  // mirando: a camada da peça feita naquela pose (portrait_<peça>_<pose>.png), se existir
  const aimGear = (id) => { const p = base === poseImg ? portraitGearImg(id + "_" + pw.pose) : null; return p && portraitReady(p) ? p : portraitGearImg(id); };
  if (base === poseImg) for (const id of gear) portraitGearImg(id + "_" + pw.pose);
  const imgs = gear.map(aimGear);
  const key = `${save.skin}|${clothingKey()}|${save.cape | 0}|${gear.join(",")}|${imgs.map((im) => (portraitReady(im) ? im.src.length : 0)).join("")}|${portraitReady(PORTRAIT.mask)}|${pw ? pw.pose + pw.m + pw.f : "-"}|${portraitReady(poseImg)}${portraitReady(wImg)}`;
  if (PORTRAIT.key === key && PORTRAIT.cache) return PORTRAIT.cache;
  const skin = SKINS[save.skin] || SKINS[0];
  const body = base === PORTRAIT.base && portraitReady(PORTRAIT.mask) ? tintWithMask(PORTRAIT.base, PORTRAIT.mask, skin, save.clothing, true) : base;
  const c = document.createElement("canvas"); c.width = base.naturalWidth; c.height = base.naturalHeight;
  const g = c.getContext("2d");
  // cada camada já vem com o corpo escondendo o que fica atrás dele: tudo vai por cima.
  // Quadro k = giro de -18° + 360°·k/n; de frente a mochila vai antes do colete, de lado/costas por último.
  g.drawImage(body, 0, 0);
  if (base === poseImg && portraitReady(wImg)) {
    if (pw.f) g.filter = pw.f;
    g.drawImage(wImg, 0, 0);
    g.filter = "none";
  }
  const n = Math.max(1, Math.round(c.width / PORTRAIT_FW)), fw = c.width / n;
  for (let k = 0; k < n; k++) {
    const yaw = ((-18 + 360 * k / n) % 360 + 360) % 360, front = yaw <= 80 || yaw >= 280;
    for (const id of gearOrder(gear, !front)) {
      const im = imgs[gear.indexOf(id)];
      if (!portraitReady(im)) continue;
      const tint = gearTint(id), src = tint ? tintedImg(im, "portrait_" + id, tint) : im;
      g.drawImage(src, k * fw, 0, fw, c.height, k * fw, 0, fw, c.height);
    }
  }
  // a imagem é uma tira de quadros (o boneco girando); recorte comum a todos os quadros,
  // para o tamanho não pular enquanto gira
  let box = { x: 0, y: 0, w: fw, h: c.height };
  try {
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let x0 = fw, y0 = c.height, x1 = 0, y1 = 0;
    for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
      if (d[(y * c.width + x) * 4 + 3] > 8) {
        const fx = x % fw;
        if (fx < x0) x0 = fx; if (fx > x1) x1 = fx; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    if (x1 > x0) box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  } catch (e) { /* sem servidor: usa o quadro inteiro */ }
  PORTRAIT.cache = c; PORTRAIT.box = box; PORTRAIT.key = key; PORTRAIT.n = n; PORTRAIT.fw = fw;
  return c;
}

// ---------------------------------------------------------------- girar o boneco arrastando
const PORTRAIT_FW = 240;               // largura de um quadro em portrait*.png
const PSPIN = { angle: 0, hit: null, drag: null };   // angle em quadros (0 = quase de frente)
function portraitFrame() {
  const n = PORTRAIT.n || 1;
  return ((Math.round(PSPIN.angle) % n) + n) % n;
}
// "front", "back" ou "side": para a capa (desenho 2D) ir atrás ou na frente do boneco
function portraitView() {
  if (!PORTRAIT.cache) return "front";
  const a = (portraitFrame() / (PORTRAIT.n || 1)) * 360;
  if (a <= 60 || a >= 300) return "front";
  if (a >= 130 && a <= 230) return "back";
  return "side";
}
// desenha o retrato centrado na caixa; devolve false se a imagem não existe (usa o desenho antigo).
// Arrastar sobre ele gira o boneco; onClick (opcional) roda com um clique sem arrastar.
function drawPortrait(cx, cy, maxW, maxH, onClick, minDragY = -Infinity) {
  const c = portraitCanvas();
  if (!c) return false;
  const b = PORTRAIT.box, k = Math.min(maxW / b.w, maxH / b.h), w = b.w * k, h = b.h * k;
  ctx.drawImage(c, portraitFrame() * PORTRAIT.fw + b.x, b.y, b.w, b.h, cx - w / 2, cy - h / 2, w, h);
  const top = Math.max(cy - h / 2, minDragY);
  PSPIN.hit = { x: cx - maxW / 2, y: top, w: maxW, h: cy + h / 2 - top, onClick, t: performance.now() };
  return true;
}
function portraitMouseDown(x, y) {
  const r = PSPIN.hit;
  if (!r || performance.now() - r.t > 250 || (PORTRAIT.n || 1) < 2) return false;
  if (x < r.x || x > r.x + r.w || y < r.y || y > r.y + r.h) return false;
  PSPIN.drag = { x0: x, a0: PSPIN.angle, moved: false, onClick: r.onClick };
  return true;
}
function portraitMouseMove(x) {
  const d = PSPIN.drag;
  if (!d) return;
  if (Math.abs(x - d.x0) > 4) d.moved = true;
  if (d.moved) PSPIN.angle = d.a0 + (x - d.x0) / 14;   // ~14 px por quadro (16 quadros = volta inteira)
}
function portraitMouseUp() {
  const d = PSPIN.drag;
  PSPIN.drag = null;
  if (d && !d.moved && d.onClick) d.onClick();
}

// ---------------------------------------------------------------- inventário: zonas de arrastar
// cada quadro registra as zonas (onde soltar) e o que pode ser arrastado
const INV = { zones: [], drag: null, hover: null, confirm: null, packPage: 0 };
// Ordem livre do inventário: cada item ganha uma chave (fmKey) e a ordem fica salva em save.fmInventoryOrder.
let fmInvCounter = 0;
function fmInvArrange(items) {
  const counts = {};
  items.forEach((it, i) => {
    let k;
    if (it.area === "ammo") {
      const t = it.item.t;
      counts[t] = (counts[t] || 0) + 1;
      k = "ammo:" + t + ":" + counts[t];
    } else if ((it.area === "pack" || it.area === "bag") && it.item && typeof it.item === "object") {
      if (!it.item.fmUiId) it.item.fmUiId = "i" + ++fmInvCounter + "_" + Math.random().toString(36).slice(2, 9);
      k = "obj:" + it.item.fmUiId;
    } else {
      const id = it.item && (it.item.id !== undefined ? it.item.id : it.item.i);
      k = it.type + ":" + (id === undefined ? i : id);
    }
    it.fmKey = k;
  });
  if (!INV.fmInvOrder && Array.isArray(save.fmInventoryOrder) && save.fmInventoryOrder.length)
    INV.fmInvOrder = save.fmInventoryOrder.slice();
  if (!INV.fmInvOrder) return items;
  const map = new Map(items.map((it) => [it.fmKey, it])),
    out = Array(Math.max(items.length, INV.fmInvOrder.length));
  INV.fmInvOrder.forEach((k, i) => {
    if (k && map.has(k)) {
      out[i] = map.get(k);
      map.delete(k);
    }
  });
  for (const it of map.values()) {
    let spot = out.findIndex((x) => !x);
    if (spot < 0) spot = out.length;
    out[spot] = it;
  }
  return out;
}
function fmMoveAmmo(from, to) {
  if (from == null || to == null || from === to) return;
  const items = invPackEntries(),
    len = Math.max(items.length, 30 + (fmBackpackEquipped()?.slots || 0));
  if (from < 0 || to < 0 || from >= len || to >= len) return;
  const arr = Array.from({ length: len }, (_, i) => (items[i] ? items[i].fmKey : null));
  [arr[from], arr[to]] = [arr[to], arr[from]];
  INV.fmInvOrder = arr;
  save.fmInventoryOrder = arr.slice(0, 150);
  persist();
}
function fmCanChangeBackpack(slots) {
  const old = fmBackpackEquipped()?.slots || 0;
  if (packUsed() > fmBackpackBase(player.level) + slots) return false;
  const items = invPackEntries();
  for (let i = 30 + slots; i < 30 + old; i++) if (items[i]) return false;
  return true;
}

// Uma única grade visual para armas, materiais, munição, coletes e roupas.
// Roupas e coletes conservam a posse no save; não consomem nem duplicam
// os espaços físicos da mochila de armas/materiais.
function invPackEntries() {
  const entries = player.pack.map((item, i) => ({
    area: "pack", i, sel: SLOT_N + i,
    type: item.kind === "weapon" ? "weapon" : "mat", item
  }));
  for (const t of Object.keys(AMMO)) {
    let reserve = Math.max(0, Math.floor(player.reserve[t] || 0));
    while (reserve > 0) {
      const amount = Math.min(AMMO_STACK, reserve);
      entries.push({ area: "ammo", type: "ammo", item: { t, n: amount } });
      reserve -= amount;
    }
  }
  VESTS.forEach((_, i) => {
    if (save.vestsOwned[i] && i !== save.vest)
      entries.push({ area: "vests", type: "vest", item: { i } });
  });
  for (const item of Object.values(save.giftVests)) {
    if (item.i !== save.vest) entries.push({ area: "vests", type: "vest", item });
  }
  CLOTHING_ITEMS.forEach(item => {
    const equipped = save.clothing[item.kind] === item.id;
    // mochilas ficam no slot próprio e no Baú da Base; roupas guardadas no baú também saem daqui
    if (!equipped && clothingOwned(item.id) && !save.vault.some((v) => v && v.kind === "clothing" && v.id === item.id))
      entries.push({ area: "clothes-list", kind: item.kind, type: "clothing", item });
  });
  player.bag.forEach((im, i) => entries.push({ area: "bag", i, type: "implant", item: im }));
  for (const id of ["food", "water", "med", "anti"]) {
    const n = Math.floor(Number(player[id]) || 0);
    if (n > 0) entries.push({ area: "supply", type: "supply", item: { id, n } });
  }
  return fmInvArrange(entries);
}
// página 1: 30 espaços + os espaços extras da mochila (painel ao lado); depois, páginas de 30
function invPackPages() {
  return 1 + Math.ceil(Math.max(0, invPackEntries().length - 30 - (fmBackpackEquipped()?.slots || 0)) / 30);
}
function invPackChangePage(direction) {
  INV.packPage = Math.max(0, Math.min(invPackPages() - 1, INV.packPage + direction));
}
function invJumpToClothing(kind) {
  const idx = invPackEntries().findIndex(e => e.type === "clothing" && e.item.kind === kind);
  if (idx >= 0) INV.packPage = Math.floor(idx / 30);
}

function invZone(z) { INV.zones.push(z); return z; }
function invZoneAt(x, y) {
  for (let i = INV.zones.length - 1; i >= 0; i--) {
    const z = INV.zones[i];
    if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z;
  }
  return null;
}
function invItemName(z) {
  if (!z || !z.item) return "";
  if (z.type === "weapon") return instName(z.item);
  if (z.type === "mat") return MATS[z.item.id].name;
  if (z.type === "vest") return vestDefinition(z.item.i).name;
  if (z.type === "ammo") return "Munição: " + z.item.t;
  if (z.type === "clothing") return z.item.name;
  if (z.type === "implant") return implantName(z.item);
  if (z.type === "supply") return SUPPLY[z.item.id].name;
  return "";
}
// comida, água, kit médico e antibiótico: na mochila, arrastar até o boneco consome um (único jeito de usar)
const SUPPLY = {
  food:  { name: "Comida",      n: () => player.food,  use: () => eat(),     icon: { type: "food" } },
  water: { name: "Água",        n: () => player.water, use: () => drink(),   icon: { type: "water" } },
  med:   { name: "Kit médico",  n: () => player.med,   use: () => heal(),    icon: { type: "med" } },
  anti:  { name: "Antibiótico", n: () => player.anti,  use: () => useAnti(), icon: { type: "pills", spr: "pills" } }
};

// chamado pelo main.js no clique / soltar do mouse com o inventário aberto
function invMouseDown(x, y) {
  const z = invZoneAt(x, y);
  if (z && z.item && z.drag !== false) { INV.drag = { z, x0: x, y0: y, moved: false }; return true; }
  return false;
}
function invMouseMove(x, y) {
  const d = INV.drag;
  if (d && !d.moved && Math.hypot(x - d.x0, y - d.y0) > 5) d.moved = true;
}
function invMouseUp(x, y) {
  const d = INV.drag;
  INV.drag = null;
  if (!d) return;
  if (!d.moved) { invClick(d.z); return; }
  const t = invZoneAt(x, y);
  invDrop(d.z, t);
}

// clique simples: seleciona; clicar de novo no selecionado faz a ação rápida (equipar/guardar/instalar)
function invClick(z) {
  const inv = packSel();
  if (z.sel != null) {
    if (inv.sel === z.sel) packAct(); else inv.sel = z.sel;
    return;
  }
  if (z.type === "clothing") {
    if (z.area === "clothes-slot") unequipClothing(z.kind);
    else equipClothing(z.item);
    return;
  }
  if (z.type === "vest") { if (z.area === "vestslot") unequipVest(); else equipVest(z.item.i); return; }
  if (z.type === "supply") { toast(`Arraste ${SUPPLY[z.item.id].name.toLowerCase()} até o personagem para usar`); return; }
  if (z.type === "implant") { if (z.area === "installed") moveImplant(z.item, "bag"); else moveImplant(z.item, "installed"); }
}

function equipClothing(item) {
  if (!item || CLOTHING_BY_ID[item.id] !== item || !CLOTHING_KINDS.includes(item.kind)) return;
  if (fmStashStoredClothing(item.id)) { toast("Retire esta peça do Baú da Base antes de equipar."); return; }
  if (!clothingOwned(item.id)) { toast(`Compre ${item.name} na Loja de Créditos (${CREDIT_CLOTHING[item.id].toLocaleString("pt-BR")} créditos)`); return; }
  if (save.clothing[item.kind] === item.id) { unequipClothing(item.kind); return; }   // clicar de novo tira
  if (item.kind === "pack") {
    if (player.level < item.level) { toast("Disponível no nível " + item.level); return; }
    if (!fmCanChangeBackpack(item.slots)) { toast("Esvazie os slots excedentes primeiro."); return; }
  }
  save.clothing[item.kind] = item.id;
  persist();
  toast(item.name + " equipada");
}
function unequipClothing(kind) {
  if (!CLOTHING_KINDS.includes(kind) || !save.clothing[kind]) return;
  if (kind === "pack" && !fmCanChangeBackpack(0)) { toast("Esvazie os slots extras antes de retirar a mochila."); return; }
  save.clothing[kind] = null; persist();
  toast(CLOTHING_LABELS[kind] + " retirada");
}
function equippedClothingSlot(x, y, kind) {
  const item = clothingGet(kind);
  slotBox(x, y, 58, 58, CLOTHING_LABELS[kind], {
    area: "clothes-slot", kind, type: "clothing", item
  });
  if (!item) {
    ctx.strokeStyle = "#54534b"; ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 15, y + 16, 28, 25);
    txt("+", x + 29, y + 34, 18, "#9b956e", "center", true);
    regClick(x, y, 58, 58, () => { invJumpToClothing(kind); });
  }
}
function equipVest(i) {
  const gift = save.giftVests[i];
  if (!save.vestsOwned[i] && !gift) return;
  if (gift && !fmGifts.ready(gift, () => { if (save.giftVests[i] === gift) equipVest(i); })) return;
  save.vest = i; recalcImplants(); persist(); toast(`${vestDefinition(i).name} equipado`);
}
function unequipVest() {
  if (save.vest < 0) return;
  toast(`${vestDefinition(save.vest).name} guardado`);
  save.vest = -1; recalcImplants(); persist();
}
function moveImplant(im, to) {
  if (!canSwapImplants()) { toast("Implantes só se instalam ou removem na base (ou com o implante Gancho)"); sfx.empty(); return; }
  if (to === "installed") {
    if (save.installed.includes(im)) return;
    const why = installBlock(im);
    if (why) { toast(why); return; }
    if (!player.bag.includes(im) || !fmGifts.ready(im, () => moveImplant(im, to))) return;
    player.bag.splice(player.bag.indexOf(im), 1); save.installed.push(im);
    toast(`Instalou ${implantName(im)}`);
  } else {
    if (player.bag.includes(im)) return;
    save.installed.splice(save.installed.indexOf(im), 1); player.bag.push(im);
    toast(`Removeu ${implantName(im)}`);
  }
  persist(); recalcImplants();
}

function invDrop(src, dst) {
  if (!dst || dst === src) return;
  if (src.type === "mat" && src.item.id === FM_ADVANCED_CASE_ID && dst.area === "doll") { fmOpenAdvancedImplantCase(src.item); return; }
  if (src.cell != null && dst.cell != null) { fmMoveAmmo(src.cell, dst.cell); return; }   // troca de lugar na grade
  const inv = packSel();
  // descartar (pede confirmação)
  if (dst.area === "discard") {
    if (src.sel == null) { toast("Isso não dá para descartar aqui"); return; }
    inv.sel = src.sel; INV.confirm = { name: invItemName(src) }; return;
  }
  if (src.type === "mat" && src.item.id === "trindade_eterna" && dst.area === "doll") { INV.confirm = { trindade: src.item, name: "Trindade · 100 anos" }; return; }
  if (src.type === "mat" && src.item.id === "token_loja" && dst.area === "doll") { INV.confirm = { token: src.item, name: "Token da Loja" }; return; }
  if (src.type === "mat" && src.item.id === "reset_stats" && dst.area === "doll") {
    INV.confirm = { resetStats: true, name: "Cartão Reset de Stats" };
    return;
  }
  if (src.type === "supply") {
    if (dst.area === "doll") SUPPLY[src.item.id].use();
    else toast("Solte no personagem para usar");
    return;
  }
  if (src.type === "clothing") {
    if (src.area === "clothes-list" && (dst.area === "clothes-slot" || dst.area === "doll")) {
      if (dst.area === "doll" || src.item.kind === dst.kind) equipClothing(src.item);
      else toast("Essa roupa não serve nesse slot");
    } else if (src.area === "clothes-slot" &&
        (dst.area === "pack" || dst.area === "clothes-list" || dst.area === "clothes-slot")) {
      if (dst.area === "clothes-slot" && dst.kind !== src.kind) toast("Essa roupa não serve nesse slot");
      else unequipClothing(src.kind);
    }
    return;
  }
  if (src.type === "vest") {
    if (src.area === "vests" && (dst.area === "vestslot" || dst.area === "doll")) equipVest(src.item.i);
    else if (src.area === "vestslot" && (dst.area === "vests" || dst.area === "pack")) unequipVest();
    return;
  }
  if (src.type === "implant" && src.area === "installed" && dst.area === "pack") { moveImplant(src.item, "bag"); return; }
  if (src.type === "implant") {
    if (dst.area === "doll") openAlloc(src.item);                    // soltar no boneco: distribuir os pontos
    else if (src.area === "bag" && dst.area === "installed") moveImplant(src.item, "installed");
    else if (src.area === "installed" && dst.area === "bag") moveImplant(src.item, "bag");
    else if (src.area === "installed" && dst.area === "installed" && dst.i !== src.i) {   // muda a ordem (o Mímico copia o da esquerda)
      if (!canSwapImplants()) { toast("A ordem dos implantes só muda na base (ou com o implante Gancho)"); return; }
      const b = Math.min(dst.i, save.installed.length - 1), t = save.installed[src.i];
      save.installed.splice(src.i, 1); save.installed.splice(b, 0, t);
      persist(); recalcImplants();
    }
    return;
  }
  // armas e materiais
  if (dst.area === "wslot") {
    if (src.type !== "weapon") { toast("Só armas vão nos slots de arma"); return; }
    inv.sel = src.sel; equipTo(dst.i); return;
  }
  if (dst.area === "pack") {
    if (src.area === "wslot") {
      if (packUsed() >= packCapacity()) { toast("Mochila cheia"); return; }
      player.pack.push(src.item); player.slots[src.i] = null; player.reloading = 0;
      toast(`${instName(src.item)} guardada na mochila`); inv.sel = SLOT_N + player.pack.length - 1; return;
    }
    if (src.area === "pack") {               // reorganiza a mochila
      const a = src.i, b = Math.min(dst.i, player.pack.length - 1);
      const t = player.pack[a]; player.pack[a] = player.pack[b]; player.pack[b] = t; inv.sel = SLOT_N + b;
    }
  }
}

// ---------------------------------------------------------------- desenho
function invCell(x, y, w, h, opt) {
  const hov = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  const drop = INV.drag && INV.drag.moved && hov;
  uiCell(x, y, w, h, opt.sel, hov, drop);
  if (opt.label) txt(opt.label, x + w / 2, y + h + 13, 11, "#c9c4ad", "center", true);
  return hov;
}
function invAmmoCell(st, x, y, w, h) {
  ctx.fillStyle = "#1e1d16"; rr(x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = "#5a4a2a"; ctx.lineWidth = 1; ctx.stroke();
  drawEntryIcon({ type: "ammo", ammo: "" }, x + 22, y + h / 2 + 2, 0.42);
  txt(st.t, x + w - 6, y + 17, 10, "#e0d8a0", "right", true, w - 40);
  txt(`${st.n}`, x + w - 6, y + 33, 11, "#ffd96a", "right", true);
  ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(x + 6, y + h - 6, w - 12, 3);
  ctx.fillStyle = "#c9a040"; ctx.fillRect(x + 6, y + h - 6, (w - 12) * (st.n / AMMO_STACK), 3);
}
function invIcon(z, x, y, w, h) {
  if (!z.item) return;
  if (z.type === "ammo") { invAmmoCell(z.item, x, y, w, h); return; }
  if (z.type === "weapon" || z.type === "mat") { drawItemCell(z.item, x, y, w, h, false); return; }
  if (z.type === "clothing") {
    drawClothingIcon(z.item, x, y, w, h);
    if (!z.item.icon) txt(z.item.kind === "jacket" ? "JAQ" : z.item.kind === "pants" ? "CAL" : "BOT", x + w / 2, y + h - 3, 8, "#e5dbc4", "center", true);
    return;
  }
  if (z.type === "vest") {
    const v = vestDefinition(z.item.i);
    drawVestIcon(z.item.i, x + w / 2, y + h / 2 - 2, Math.min(w, h) / 70);
    if (v.rar) { ctx.strokeStyle = RARITY[v.rar].color; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; rr(x + 2, y + 2, w - 4, h - 4, 4); ctx.stroke(); ctx.globalAlpha = 1; }
    return;
  }
  if (z.type === "supply") {
    drawEntryIcon(SUPPLY[z.item.id].icon, x + w / 2, y + h / 2 + 1, Math.min(w, h) / 64);
    txt(String(z.item.n), x + w - 4, y + 11, 10, "#ffd96a", "right", true);
    return;
  }
  if (z.type === "implant") {
    drawEntryIcon({ type: "implant", im: z.item }, x + w / 2, y + h / 2, Math.min(w, h) / 62);
    const d = IMP[z.item.id];
    if (d.alloc) txt(`${allocUsed(z.item)}/${d.alloc.points}`, x + w - 4, y + 11, 9, allocUsed(z.item) < d.alloc.points ? "#ffd96a" : "#8fd08a", "right", true);
    else if (d.mimic) txt("←", x + w - 4, y + 12, 11, "#c58bff", "right", true);
    txt(d.name.replace("Implante ", "").replace(/^d[ao] /, ""), x + w / 2, y + h - 4, 8, impColor(z.item), "center", true, w - 4);
  }
}
function slotBox(x, y, w, h, label, z) {
  if (z) { z.x = x; z.y = y; z.w = w; z.h = h; invZone(z); }
  const inv = packSel();
  const hov = invCell(x, y, w, h, { sel: z && z.sel != null && inv.sel === z.sel, label });
  if (z && z.item && !(INV.drag && INV.drag.moved && INV.drag.z.area === z.area && INV.drag.z.i === z.i)) invIcon(z, x, y, w, h);
  if (hov && z) INV.hover = z;
  return hov;
}
// peças que vêm com a roupa (chapéu, máscara, jaqueta, calça): clique abre a troca de roupa
function outfitSlot(x, y, w, h, label, piece) {
  const hov = invCell(x, y, w, h, { label });
  const s = SKINS[save.skin] || SKINS[0];
  ctx.save(); ctx.translate(x + w / 2, y + h / 2);
  if (piece === "jacket") { ctx.fillStyle = s.jacket; rr(-15, -16, 30, 30, 5); ctx.fill(); ctx.fillRect(-22, -14, 8, 22); ctx.fillRect(14, -14, 8, 22); }
  else if (piece === "pants") { ctx.fillStyle = s.pants; rr(-13, -18, 12, 34, 3); ctx.fill(); rr(1, -18, 12, 34, 3); ctx.fill(); ctx.fillRect(-13, -18, 26, 8); }
  else if (piece) { ctx.fillStyle = piece.color; ctx.beginPath(); ctx.ellipse(0, 2, 16, 13, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(-18, 1, 36, 4); }
  else { ctx.strokeStyle = "#3d3b30"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -8); ctx.lineTo(8, 8); ctx.moveTo(8, -8); ctx.lineTo(-8, 8); ctx.stroke(); }
  ctx.restore();
  if (hov) INV.hover = { type: "outfit", label, piece };
}
function headPieces() {
  const s = SKINS[save.skin] || SKINS[0], ids = SKIN_GEAR[save.skin] || [];
  const NAMES = { headset: "Fone", shemagh: "Shemagh", helmet: "Capacete", helmet2: "Capacete leve", balaclava: "Balaclava", gasmask: "Máscara de gás", ballistic: "Máscara balística" };
  const hat = ids.find((i) => ["headset", "helmet", "helmet2", "balaclava"].includes(i)) || (s.cap ? "cap" : s.hood ? "hood" : null);
  const mask = ids.find((i) => ["gasmask", "ballistic", "shemagh"].includes(i)) || (s.glasses ? "glasses" : null);
  const nm = (i) => NAMES[i] || { cap: "Boné", hood: "Capuz", glasses: "Óculos" }[i];
  return {
    hat: hat && { name: nm(hat), color: s.cap || s.hood || s.helmet || "#4a4a4a" },
    mask: mask && { name: nm(mask), color: s.mask || "#3a3d40" },
  };
}

function fmBagPanel(entries) {
  const bag = fmBackpackEquipped(),
    n = bag?.slots || 0;
  ctx.fillStyle = "rgba(7,10,9,0.94)";
  rr(736, 86, 212, 292, 7);
  ctx.fill();
  ctx.strokeStyle = "#6c583b";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  txt(bag ? bag.name : "Nenhuma mochila", 746, 104, 11, "#f2d68b", "left", true, 190);
  txt(
    bag ? "+" + n + " espaços · -" + bag.speedPenalty + "% velocidade" : "Equipe uma mochila ao lado da máscara",
    746,
    124,
    10,
    bag ? "#9dc995" : "#c2b8a4",
    "left",
    false,
    190,
  );
  for (let i = 0; i < 9; i++) {
    const x = 744 + (i % 3) * 58,
      y = 132 + Math.floor(i / 3) * 58,
      w = 54,
      h = 50,
      idx = 30 + i,
      active = !!bag && i < n,
      it = active ? entries[idx] : null;
    if (!active) {
      invCell(x, y, w, h, {});
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
      txt("—", x + w / 2, y + 30, 14, "#555043", "center", true);
      continue;
    }
    if (it?.type === "ammo") {
      invCell(x, y, w, h, {});
      if (!(INV.drag?.moved && INV.drag.z?.cell === idx)) invAmmoCell(it.item, x, y, w, h);
      const z = invZone({ ...it, x, y, w, h, cell: idx, fmBagSlot: true });
      if (mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h) INV.hover = z;
    } else if (it) slotBox(x, y, w, h, null, { ...it, cell: idx, fmBagSlot: true });
    else slotBox(x, y, w, h, null, { area: "backpack-extra", cell: idx, fmBagSlot: true, item: null, type: null });
  }
  btn(744, 311, 186, 24, "Trocar mochila", () => {
    INV.fmBagPicker = !INV.fmBagPicker;
  });
  if (bag) btn(744, 342, 186, 22, "Retirar mochila", () => unequipClothing("pack"));
}
function fmEquipVaultBackpack(bag) {
  const previous = save.clothing.pack;
  if (bag.id === previous) return false;
  const index = save.vault.findIndex((item) => item?.kind === "clothing" && item.id === bag.id);
  if (index < 0) {
    toast("Esta mochila não está no Baú da Base.");
    return false;
  }
  if (player.level < bag.level) {
    toast("Disponível no nível " + bag.level);
    return false;
  }
  if (!fmCanChangeBackpack(bag.slots)) {
    toast("Esvazie os slots excedentes antes de trocar de mochila.");
    return false;
  }

  if (previous && !fmStashStoredClothing(previous)) save.vault[index] = { kind: "clothing", id: previous };
  else save.vault.splice(index, 1);
  save.clothing.pack = bag.id;
  fmStashSave();
  toast(bag.name + " equipada");
  return true;
}
function fmBagChooser() {
  if (!INV.fmBagPicker) return;
  ctx.fillStyle = "rgba(5,7,6,.99)";
  rr(695, 82, 249, 347, 8);
  ctx.fill();
  ctx.strokeStyle = "#b68b4c";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  txt("MOCHILAS DO BAÚ DA BASE", 711, 103, 13, "#ffd891", "left", true);
  const bags = fmBackpacks.filter((bag) => bag.id !== save.clothing.pack && fmStashStoredClothing(bag.id));
  if (!bags.length) txt("Nenhuma mochila guardada no baú.", 711, 137, 12, "#c6bca7", "left");
  bags.forEach((bag, i) => {
    btn(711, 112 + i * 26, 220, 23, bag.name, () => {
      if (fmEquipVaultBackpack(bag)) INV.fmBagPicker = false;
    });
  });
  btn(711, 379, 220, 24, "Fechar", () => {
    INV.fmBagPicker = false;
  });
}
function drawInventory() {
  const inv = packSel();
  INV.zones = []; INV.hover = null;
  menuFrame("Inventário", `$${game.money}  ·  Mochila ${packUsed()}/${packCapacity()}  ·  ${playerName()} · nível ${player.level}`);

  // ---- implantes (esquerda)
  txt("Implantes", 40, 100, 14, "#e5e0c8", "left", true);
  txt(`${save.installed.length}/${IMPL_SLOTS}`, 234, 100, 12, "#ffd96a", "right", true);
  for (let i = 0; i < IMPL_SLOTS; i++) {
    const x = 40 + (i % 3) * 66, y = 110 + Math.floor(i / 3) * 66;
    slotBox(x, y, 60, 60, null, { area: "installed", i, type: "implant", item: save.installed[i] || null });
  }

  // ---- boneco e slots (meio)
  ctx.fillStyle = "rgba(0,0,0,0.3)"; rr(262, 88, 436, 342, 8); ctx.fill();
  invZone({ area: "doll", x: 372, y: 92, w: 216, h: 270 });           // soltar um implante aqui abre a distribuição de pontos
  const cp = CAPES[save.cape | 0];
  const cape = () => { if (cp && cp.color && !cape3d()) { ctx.fillStyle = shade(cp.color, -0.2); ctx.beginPath(); ctx.moveTo(452, 140); ctx.lineTo(508, 140); ctx.lineTo(530, 330); ctx.lineTo(430, 330); ctx.closePath(); ctx.fill(); } };
  if (portraitView() === "front") cape();
  if (!drawPortrait(480, 222, 200, 268)) drawHero(480, 230, 1.15);
  else txt("⟲ arraste para girar", 480, 361, 9, "#7d7a68", "center");
  if (portraitView() === "back") cape();
  const hp = headPieces();
  // chapéu e máscara: peça do guarda-roupa, se houver; senão o acessório que vem com o personagem
  if (clothingGet("hat")) equippedClothingSlot(296, 104, "hat"); else outfitSlot(296, 104, 58, 58, hp.hat ? hp.hat.name : "Chapéu", hp.hat);
  equippedClothingSlot(296, 186, "jacket");
  equippedClothingSlot(296, 268, "pants");
  if (clothingGet("mask")) equippedClothingSlot(606, 104, "mask"); else outfitSlot(606, 104, 58, 58, hp.mask ? hp.mask.name : "Máscara", hp.mask);
  slotBox(606, 186, 58, 58, "Colete", { area: "vestslot", type: "vest", item: save.vest >= 0 ? { i: save.vest } : null });
  // só coletes com modelo vestido (Natalino): escolher se aparece no personagem
  if (save.vest >= 0 && vestDefinition(save.vest).wear) {
    const on = save.vestShow !== false;
    txt(on ? "◉ Vestido" : "○ Oculto", 635, 258, 10, on ? "#ffd96a" : "#8f8a72", "center", true);
    regClick(606, 246, 58, 18, () => { save.vestShow = !on; persist(); toast(on ? "Colete escondido no personagem" : "Colete aparecendo no personagem"); });
  }
  equippedClothingSlot(606, 268, "boots");
  equippedClothingSlot(674, 104, "pack");                     // mochila: clique abre a troca pelo Baú da Base
  regClick(674, 104, 58, 58, () => { INV.fmBagPicker = true; });
  for (let i = 0; i < SLOT_N; i++) {
    const x = 300 + i * 124, y = 370;
    slotBox(x, y, 112, 52, null, { area: "wslot", i, sel: i, type: "weapon", item: player.slots[i] || null });
    txt(player.cur === i ? `Arma ${i + 1} · na mão` : `Arma ${i + 1}`, x + 56, y - 4, 10, player.cur === i ? "#ffd96a" : "#a9a58f", "center", true);
  }

  // ---- Grade única de inventário: o estilo é de slots escuros em metal
  // envelhecido, com espaços desbloqueados por nível e sem itens de exemplo.
  const inventoryEntries = invPackEntries();
  const physicalCapacity = packCapacity();
  const inventoryPages = invPackPages();
  fmBagPanel(inventoryEntries);                               // espaços extras da mochila (painel à direita)
  INV.packPage = Math.max(0, Math.min(inventoryPages - 1, INV.packPage));
  const baseCap = fmBackpackBase(player.level), nextCapacity = baseCap < 30 ? packSlotUnlockLevel(baseCap) : null;
  ctx.fillStyle = "rgba(9,10,9,0.93)";
  rr(31, 439, 901, 118, 8); ctx.fill();
  ctx.strokeStyle = "#49453a"; ctx.lineWidth = 1.4; ctx.stroke();
  ctx.fillStyle = "#1b1c19"; ctx.fillRect(39, 448, 885, 22);
  txt("INVENTÁRIO", 44, 465, 14, "#d6d1bd", "left", true);
  txt("Carga " + packUsed() + "/" + physicalCapacity + " · " +
      (nextCapacity ? "+2 slots no nível " + nextCapacity : "30 espaços base · mochila separada"),
      273, 464, 11, "#a7a08b", "left", false, 290);
  txt("Página " + (INV.packPage + 1) + "/" + inventoryPages, 759, 465, 11,
    "#d9b95e", "center", true);
  btn(829, 448, 42, 22, "◀", () => invPackChangePage(-1), false, INV.packPage === 0);
  btn(878, 448, 42, 22, "▶", () => invPackChangePage(1), false, INV.packPage >= inventoryPages - 1);

  // 15 colunas x 2 linhas = 30 espaços. Na página 1 os índices 30+ ficam no painel da mochila;
  // as páginas seguintes mostram o que passar disso.
  for (let i = 0; i < 30; i++) {
    const index = INV.packPage === 0 ? i : 30 + (fmBackpackEquipped()?.slots || 0) + (INV.packPage - 1) * 30 + i;
    const col = i % 15, row = Math.floor(i / 15);
    const x = 40 + col * 58, y = 475 + row * 38;
    const width = 55, height = 35;
    const entry = inventoryEntries[index];
    const locked = !entry && index >= fmBackpackBase(player.level);

    ctx.fillStyle = locked ? "rgba(11,11,11,0.92)" : "rgba(29,28,25,0.94)";
    rr(x, y, width, height, 3); ctx.fill();
    ctx.strokeStyle = locked ? "#292822" : "#514b40";
    ctx.lineWidth = 1.0; ctx.stroke();

    if (entry && entry.type === "ammo") {
      invCell(x, y, width, height, {});
      if (!(INV.drag && INV.drag.moved && INV.drag.z && INV.drag.z.cell === index))
        invAmmoCell(entry.item, x, y, width, height);
      const z = invZone({ ...entry, x, y, w: width, h: height, cell: index });
      if (mouse.x >= x && mouse.x <= x + width && mouse.y >= y && mouse.y <= y + height)
        INV.hover = z;
    } else if (entry) {
      entry.cell = index;
      slotBox(x, y, width, height, null, entry);
    } else if (!locked) {
      slotBox(x, y, width, height, null,
        { area: "pack", i: player.pack.length, item: null, type: null, cell: index });
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.42)"; ctx.fillRect(x + 3, y + 3, width - 6, height - 6);
      txt(index >= 30 ? "MOCHILA" : "NV " + packSlotUnlockLevel(index), x + width / 2, y + 25, 10, "#777164", "center", true);
    }
    // Moldura reforçada, com índice discreto e acabamento próximo à
    // referência, sem replicar os itens que estavam na fotografia.
    ctx.strokeStyle = locked ? "#3b332b" : entry ? "#76694a" : "#494437";
    ctx.lineWidth = .8; ctx.strokeRect(x + 1.5, y + 1.5, width - 3, height - 3);
  }

  fmBagChooser();
  // detalhes do item: balão junto do mouse (desenhado por último, sobre tudo)
  const fmItemHover = INV.hover && INV.hover.item ? INV.hover : null;

  // Lixeira permanece no inventário. Roupas e coletes não podem ser
  // descartados acidentalmente por esta ação de armas/materiais.
  const dz = invZone({ area: "discard", x: 712, y: 380, w: 220, h: 42 });
  const dh = invCell(dz.x, dz.y, dz.w, dz.h, {});
  txt("Descartar (arraste aqui)", dz.x + dz.w / 2, dz.y + 26, 12,
    dh && INV.drag ? "#e05a4a" : "#8a6a5a", "center", true);

  // item sendo arrastado acompanha o mouse
  if (INV.drag && INV.drag.moved) {
    const z = INV.drag.z, w = z.w, h = z.h;
    ctx.globalAlpha = 0.85; invIcon(z, mouse.x - w / 2, mouse.y - h / 2, w, h); ctx.globalAlpha = 1;
  }
  fmBalãoDetalhes(fmItemHover);
  // confirmação de descarte
  if (INV.confirm) {
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1a1913"; rr(W / 2 - 200, H / 2 - 60, 400, 120, 10); ctx.fill(); ctx.strokeStyle = "#e05a4a"; ctx.lineWidth = 2; ctx.stroke();
    txt((INV.confirm.token || INV.confirm.trindade)?.validadeDias ? "Ativar por " + (INV.confirm.token || INV.confirm.trindade).validadeDias + " dia(s)?" : INV.confirm.token ? "Ativar o Token da Loja?" : INV.confirm.trindade ? "Consumir Trindade por 100 anos?" : INV.confirm.resetStats ? "Resetar atributos e proficiências?" : `Descartar ${INV.confirm.name}?`, W / 2, H / 2 - 22, 16, "#f2eedc", "center", true, 370);
    txt(INV.confirm.token ? "A Loja da base fica de graça pelo prazo do token. Consome 1 item." : INV.confirm.trindade ? "+35% dano, corrida e armadura. Consome 1 item." : INV.confirm.resetStats ? "Todos os pontos investidos voltam. O cartão será consumido." : "Some para sempre.", W / 2, H / 2, 12, "#a9a58f", "center");
    btn(W / 2 - 150, H / 2 + 16, 140, 30, INV.confirm.token ? "Ativar" : INV.confirm.trindade ? "Consumir" : INV.confirm.resetStats ? "Resetar" : "Descartar", () => { const reset = INV.confirm.resetStats, trindade = INV.confirm.trindade, token = INV.confirm.token; INV.confirm = null; if (token) useTokenLoja(token); else if (trindade) useTrindadeItem(trindade); else if (reset) useResetStatsCard(); else packDiscard(); }, true);
    btn(W / 2 + 10, H / 2 + 16, 140, 30, "Cancelar", () => { INV.confirm = null; });
  }
  drawAllocPanel();
}
// linha "Ferro Velho: $X" do balão de detalhes (o mesmo valor que o Ferro Velho paga)
function fmScrapLine(kind, obj) {
  if (obj.validadeDias || (kind === "vest" && save.giftVests[obj.i])) return "Vinculado · venda bloqueada";
  const $ = (v) => "$" + Math.max(0, Math.round(v)).toLocaleString("pt-BR");
  const each = (unit, n) => n > 1 ? `Ferro Velho: ${$(unit)} cada · ${$(unit * n)} tudo` : `Ferro Velho: ${$(unit)}`;
  if (kind === "weapon") return obj.tokenBound ? "Ferro Velho: não vende" : "Ferro Velho: " + $(weaponSellPrice(obj));
  if (kind === "implant") { const v = obj.tokenBound ? 0 : implantSellPrice(obj); return v ? "Ferro Velho: " + $(v) : "Ferro Velho: não vende"; }
  if (kind === "vest") return "Ferro Velho: " + $(vestSellPrice(obj.i)) + (obj.i === save.vest ? " (tire o colete para vender)" : "");
  if (kind === "ammo") { const n = Math.min(obj.n || 0, sellableAmmo(obj.t)); return n > 0 ? `Ferro Velho: ${$(ammoSellPrice(obj.t) * n)} (${n.toLocaleString("pt-BR")} balas)` : "Ferro Velho: não vende"; }
  if (kind === "mat") return obj.id === "reset_stats" ? "Ferro Velho: não vende" : each(matSellPrice(obj.id), obj.qty || obj.n || 1);
  if (kind === "supply") {
    if (obj.id === "food") return `Ferro Velho: ${$(JUNK_CONS.fresca)} fresca · ${$(JUNK_CONS.comum)} comum · ${$(JUNK_CONS.podre)} podre`;
    const unit = JUNK_CONS[obj.id];
    return unit ? each(unit, SUPPLY[obj.id] ? SUPPLY[obj.id].n() : 1) : "";
  }
  if (kind === "clothing") return "Ferro Velho: não vende";
  return "";
}
function fmBalãoDetalhes(it) {
  if (!it || !it.item || INV.confirm || (INV.drag && INV.drag.moved)) return;
  const obj = it.item,
    kind = it.type,
    rows = [];
  const add = (v, color = "#e4dfd1") => rows.push([String(v), color]);
  let title = "Item";
  try {
    const gift = kind === "vest" ? save.giftVests[obj.i] : obj;
    if (gift?.validadeDias) add(gift.expiraEm ? "Vence em " + new Date(gift.expiraEm).toLocaleString("pt-BR") : "Após o primeiro uso: " + gift.validadeDias + " dia(s)", "#ffd96a");
    title = invItemName(it) || "Item";
    if (kind === "weapon") {
      const base = WDEF[obj.id],
        stat = wStat(obj),
        up = obj.up || { acc: 0, dmg: 0, rel: 0 };
      add("Categoria: " + (CAT_LABEL[base.cat] || CATNAME[base.cat] || "Arma"), "#8bc9f5");
      add("Dano: " + Math.round(stat.dmg), "#f2e9df");
      add("Ataques por segundo: " + (1000 / stat.delay).toFixed(2), "#eee1d2");
      if (stat.reload) add("Recarga: " + (stat.reload / 1000).toFixed(2) + " s", "#eee1d2");
      const sum = (up.acc || 0) + (up.dmg || 0) + (up.rel || 0);
      if (sum) {
        add("Aprimoramento total: +" + sum, "#f4c44d");
        if (up.dmg) add("Dano: +" + up.dmg + " nível" + (up.dmg === 1 ? "" : "s"), "#8bed92");
        if (up.acc) add("Precisão: +" + up.acc + " nível" + (up.acc === 1 ? "" : "s"), "#8bed92");
        if (up.rel) add("Recarga: +" + up.rel + " nível" + (up.rel === 1 ? "" : "s"), "#8bed92");
      }
      if (obj.gc) add("Craft perfeito", "#c6a4ff");
      add("Requisitos: " + reqText(base), canUse(base) ? "#88d997" : "#ff8383");
      if (base.noTrade || obj.semTroca) add("(Não transferível)", "#ff9a7a");
    } else if (kind === "ammo") {
      add("Calibre: " + obj.t, "#8bc9f5");
      add("Quantidade: " + obj.n, "#f4c44d");
    } else if (kind === "vest") {
      const vest = vestDefinition(obj.i);
      add("Tipo: colete", "#8bc9f5");
      if ((save.vestSemTroca || []).includes(obj.i)) add("(Não transferível)", "#ff9a7a");
      add("Proteção: " + (vest.armor || 0), "#8bed92");
    } else if (kind === "clothing") {
      add("Tipo: " + (obj.kind === "pack" ? "mochila" : "roupa"), "#8bc9f5");
      if (obj.kind === "pack") {
        add("+" + obj.slots + " espaços de inventário", "#8bed92");
        add("-" + obj.speedPenalty + "% velocidade", "#e4dfd1");
        add("Nível mínimo: " + obj.level, "#d6c58b");
        add(save.clothing.pack === obj.id ? "Clique para retirar" : "Clique para equipar", "#8bed92");
      } else {
        add("Peça: " + (CLOTHING_LABELS[obj.kind] || obj.kind || "equipamento"), "#e4dfd1");
        add("Clique para equipar", "#8bed92");
      }
    } else if (kind === "implant") {
      add("Tipo: implante", "#8bc9f5");
      if ((IMP[obj.id] && IMP[obj.id].noTrade) || obj.semTroca) add("(Não transferível)", "#ff9a7a");
      if (IMP[obj.id].mimic) {
        // Mimic: mostra o implante copiado e os atributos que ele está dando agora
        const i = save.installed.indexOf(obj), left = i > 0 ? save.installed[i - 1] : null;
        if (left && IMP[left.id] && !IMP[left.id].mimic) {
          add("Copiando: " + implantName(left), "#c58bff");
          const fx = implantFx(obj, i, save.installed);
          const keys = Object.keys(fx).filter((k) => fx[k]);
          if (keys.length) keys.forEach((k) => add(sgn(fx[k]) + "% " + (FX_LABEL[k] || k), fx[k] < 0 ? "#ff8383" : "#8bed92"));
          else add("O implante copiado não dá atributos", "#e4dfd1");
        } else add(i < 0 ? "Instale ao lado direito de outro implante para copiar" : "Nada para copiar à esquerda", "#d6c58b");
        add("Penalidades copiadas valem em dobro", "#e4dfd1");
      } else {
        // um atributo por linha: bônus em verde, penalidade (negativo) em vermelho
        const d = IMP[obj.id];
        const fxRow = (k, v) => add(sgn(v) + "% " + (FX_LABEL[k] || k), v < 0 ? "#ff8383" : "#8bed92");
        for (const k in d.fx || {}) if (d.fx[k]) fxRow(k, d.fx[k]);
        if (d.alloc) {
          const used = allocUsed(obj);
          add("Pontos " + used + "/" + d.alloc.points + (used ? "" : " (arraste para o boneco para distribuir)"), "#d6c58b");
          for (const o of d.alloc.opts) { const n = (obj.alloc && obj.alloc[o.key]) || 0; if (n) fxRow(o.key, n * o.per); }
        }
        if (d.text) add(d.text, "#e4dfd1");
      }
    } else if (kind === "mat") {
      add("Tipo: material", "#8bc9f5");
      add("Quantidade: " + (obj.qty || obj.n || 1), "#f4c44d");
    } else if (kind === "supply") {
      add("Tipo: suprimento", "#8bc9f5");
      add("Quantidade: " + (obj.n || 1), "#f4c44d");
    } else add("Item do inventário", "#ddd8c8");
    // quanto o Ferro Velho paga pelo item
    const scrap = fmScrapLine(kind, obj);
    if (scrap) add(scrap, "#f4c44d");
  } catch (err) {
    rows.length = 0;
    add("Detalhes indisponíveis", "#e4dfd1");
  }
  ctx.save();
  const widthMax = 340;
  const lines = [];
  const measure = (text, size = 11) => {
    ctx.font = size + "px " + FONT;
    return ctx.measureText(String(text)).width;
  };
  let w = Math.min(widthMax, Math.max(185, measure(title, 14) + 26, ...rows.map((r) => measure(r[0], 11) + 26)));
  w = Math.ceil(w);
  for (const row of rows) {
    const t = row[0],
      col = row[1];
    if (measure(t, 11) <= w - 24) {
      lines.push([t, col]);
      continue;
    }
    let buff = "";
    for (const word of t.split(" ")) {
      const next = buff ? buff + " " + word : word;
      if (buff && measure(next, 11) > w - 24) {
        lines.push([buff, col]);
        buff = word;
      } else buff = next;
    }
    if (buff) lines.push([buff, col]);
  }
  const h = 34 + lines.length * 16;
  const x = Math.max(6, Math.min(W - w - 6, mouse.x + 15)),
    y = Math.max(6, Math.min(H - h - 6, mouse.y - h - 12));
  ctx.fillStyle = "rgba(8,8,8,0.97)";
  ctx.strokeStyle = "#a76d3c";
  ctx.lineWidth = 1.3;
  ctx.fillRect(x, y, w, h);
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  txt(title, x + 12, y + 22, 14, "#ffcf6d", "left", true, w - 24);
  lines.forEach((r, i) => txt(r[0], x + 12, y + 40 + i * 16, 11, r[1], "left", false, w - 24));
  ctx.restore();
}

// ---------------------------------------------------------------- texto em várias linhas
function txtWrap(s, x, y, size, color, maxW, lineH, maxLines) {
  ctx.font = `${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = "left";
  const words = String(s).split(" "), lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  if (maxLines && lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,3}$/, "…"); }
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineH));
  return lines.length;
}

// ---------------------------------------------------------------- pontos dos implantes (Mutante, Fortuna, Matador)
const ALLOC = { im: null, t: 0 };
function allocOpen() { return !!ALLOC.im && performance.now() - ALLOC.t < 400; }
function openAlloc(im) {
  if (!IMP[im.id].alloc) { toast(`${implantName(im)} não tem pontos para distribuir`); return; }
  ALLOC.im = im; ALLOC.t = performance.now();
}
function allocAdd(im, key, n) {
  const d = IMP[im.id].alloc, cur = (im.alloc && im.alloc[key]) || 0;
  const v = Math.max(0, Math.min(cur + n, cur + d.points - allocUsed(im)));
  im.alloc = im.alloc || {};
  if (v) im.alloc[key] = v; else delete im.alloc[key];
  persist(); recalcImplants();
}
function drawAllocPanel() {
  const im = ALLOC.im;
  if (!im) return;
  if (!save.installed.includes(im) && !player.bag.includes(im)) { ALLOC.im = null; return; }
  if (performance.now() - ALLOC.t > 400) { ALLOC.im = null; return; }       // o menu foi fechado e aberto de novo
  ALLOC.t = performance.now();
  const d = IMP[im.id].alloc, n = d.opts.length, pw = 520, ph = 128 + n * 36, px = W / 2 - pw / 2, py = H / 2 - ph / 2;
  const free = d.points - allocUsed(im);
  ctx.fillStyle = "rgba(0,0,0,0.72)"; ctx.fillRect(0, 0, W, H);
  regClick(0, 0, W, H, () => {});                                            // nada atrás do painel recebe clique
  ctx.fillStyle = "#1a1913"; rr(px, py, pw, ph, 10); ctx.fill(); ctx.strokeStyle = impColor(im); ctx.lineWidth = 2; ctx.stroke();
  txt(implantName(im), W / 2, py + 30, 18, impColor(im), "center", true);
  txt(`Pontos livres: ${free} de ${d.points}`, W / 2, py + 52, 13, free ? "#ffd96a" : "#8fd08a", "center", true);
  d.opts.forEach((o, i) => {
    const y = py + 66 + i * 36, v = (im.alloc && im.alloc[o.key]) || 0;
    ctx.fillStyle = "rgba(255,255,255,0.04)"; rr(px + 16, y, pw - 32, 30, 5); ctx.fill();
    txt(`+${o.per}% ${FX_LABEL[o.key]} por ponto`, px + 28, y + 20, 13, "#d8d2ba");
    txt(`${v} pts`, px + pw - 208, y + 20, 13, "#f2eedc", "right", true);
    txt(v ? `+${v * o.per}%` : "—", px + pw - 150, y + 20, 13, v ? "#8fd08a" : "#6d6a58", "right", true);
    btn(px + pw - 138, y + 2, 26, 26, "−", () => allocAdd(im, o.key, -1), false, !v);
    btn(px + pw - 108, y + 2, 26, 26, "+", () => allocAdd(im, o.key, 1), false, !free);
    btn(px + pw - 76, y + 2, 52, 26, "+5", () => allocAdd(im, o.key, 5), false, !free);
  });
  btn(px + 16, py + ph - 46, 150, 32, "Zerar", () => { im.alloc = {}; persist(); recalcImplants(); });
  btn(px + pw - 166, py + ph - 46, 150, 32, "Pronto", () => { ALLOC.im = null; }, true);
}
