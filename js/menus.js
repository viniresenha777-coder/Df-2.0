"use strict";
// =====================================================================
//  Menus: loja, baú, banco, VIP, clínica, atributos, missões, viagem,
//  mapa e painel de administrador (F2) — lógica e desenho.
// =====================================================================

// ---------- Teclas dentro dos menus ----------
function menuKey(k) {
  if (game.menu === "market" && game.marketBusy) return;
  if (game.input) { inputKey(k); return; }
  if (game.menu === "admin") { if (!canUseAdmin()) { game.menu = null; game.input = null; return; } adminKey(k); return; }
  if (game.menu === "name") { nameKey(k); return; }
  if (game.menu === "friends") { friendsKey(k); return; }
  if (game.menu === "messages") { messagesKey(k); return; }
  if (game.menu === "prof") { profKey(k); return; }
  if (game.menu === "junk") { junkKey(k); return; }
  if (game.menu === "creditshop") { creditShopKey(k); return; }
  if (game.menu === "library") { libraryKey(k); return; }
  if (game.menu === "map" && game.mapAsk) { if (k === "escape" || k === "e" || k === "n") game.mapAsk = null; return; }   // janela do admin por cima do mapa
  if (k === "escape" || k === "e" || k === "b" || (k === "c" && game.menu === "stats") || (k === "m" && game.menu === "sector") || (k === "n" && game.menu === "map") || (k === "o" && game.menu === "obj")) { game.menu = null; return; }
  if (game.menu === "bank") {
    if (k === "d") game.input = { mode: "deposit", text: "" };
    else if (k === "s") game.input = { mode: "withdraw", text: "" };
    else if (k === "c") game.input = { mode: "credits", text: "" };
    else if (k === "a") deposit(game.money);
    else if (k === "t") withdraw(save.bank);
    else if (k === "g") buyGM();
  } else if (game.menu === "clinic") clinicKey(k);
  else if (game.menu === "stats") statsKey(k);
  else if (game.menu === "missions") missionKey(k);
  else if (game.menu === "travel") travelKey(k);
  else if (game.menu === "stash") stashKey(k);
  else if (game.menu === "pack") packKey(k);
  else if (game.menu === "craft") craftKey(k);
  else if (game.menu === "map") mapKey(k);
  else if (game.menu === "obj") objKey(k);
}
function inputKey(k) {
  const inp = game.input;
  if (k === "escape") { game.input = null; return; }
  if (k === "enter") {
    const rawText = inp.text || "";
    const a = parseInt(rawText || "0", 10);
    game.input = null;
    if (inp.mode === "admText") { if (canUseAdmin() && rawText.trim()) inp.fn(rawText.trim()); }
    else if (inp.mode === "adm") { if (canUseAdmin() && rawText !== "") inp.fn(a); }
    else if (inp.mode === "market") inp.fn(Number(rawText));
    else if (inp.mode === "deposit") deposit(a);
    else if (inp.mode === "credits") buyCredits(a);
    else withdraw(a);
    return;
  }
  if (k === "backspace") { inp.text = inp.text.slice(0, -1); return; }
  if (inp.mode === "admText") {
    const raw = game.rawKey || "";
    if (raw.length === 1 && /[\p{L}\p{N} _.-]/u.test(raw) && inp.text.length < 40)
      inp.text += raw;
  } else if (/^[0-9]$/.test(k) && inp.text.length < 9) inp.text += k;
}

// ---------- Banco e VIP (loja, baú e mochila ficam em inventory.js) ----------
function deposit(a) {
  if (a <= 0) { toast("Nada para depositar"); return; }
  if (game.money < a) { toast("Dinheiro insuficiente na mochila"); return; }
  game.money -= a; save.bank += a; persist(); toast(`Depositou $${a}`);
}
function withdraw(a) {
  if (a <= 0) { toast("O banco está vazio"); return; }
  if (save.bank < a) { toast("Saldo insuficiente"); return; }
  save.bank -= a; game.money += a; persist(); toast(`Sacou $${a}`);
}
function buyCredits(n) {
  if (n <= 0) { toast("Digite uma quantidade de créditos"); return; }
  const cost = n * CREDIT_PRICE;
  if (save.bank < cost) { toast(`Saldo do banco insuficiente (${n} créditos = $${cost})`); return; }
  save.bank -= cost; save.credits += n; persist(); toast(`Comprou ${n} créditos`);
}
function buyGM() {
  if (save.gm) { toast("Você já tem VIP legado permanente"); return; }
  if (save.credits < GM_COST) { toast(`Precisa de ${GM_COST} créditos para ativar o VIP`); return; }
  save.credits -= GM_COST; addVipMonths(1); persist(); toast("VIP de 1 mês ativado!"); sfx.level();
}

// ---------- Atributos ----------
// tela em duas colunas: Stats (esquerda) e Proficiências de armas (direita)
const PROF_IDS = ["melee", "pistols", "rifles", "shotguns", "machinegun"];
const PROF_NAMES = { melee: "Corpo a corpo", pistols: "Pistolas", rifles: "Rifles", shotguns: "Escopetas", machinegun: "Metralhadoras" };
const STATS_LEFT = ATTRS.filter((a) => !PROF_IDS.includes(a.id)).map((a) => a.id);
const STATS_ORDER = STATS_LEFT.concat(PROF_IDS);
function statsKey(k) {
  if (game.sconfirm) {                     // confirmação do reset por créditos
    if (k === "enter") { game.sconfirm = false; resetStatsWithCredits(); }
    else if (k === "escape" || k === "n") game.sconfirm = false;
    return;
  }
  const n = STATS_ORDER.length, col = game.cur >= STATS_LEFT.length;
  if (k === "w" || k === "arrowup") game.cur = Math.max(0, game.cur - 1);
  else if (k === "s" || k === "arrowdown") game.cur = Math.min(n - 1, game.cur + 1);
  else if (k === "a" || k === "arrowleft") { if (col) game.cur = Math.min(STATS_LEFT.length - 1, game.cur - STATS_LEFT.length); }
  else if (k === "arrowright") { if (!col) game.cur = STATS_LEFT.length + Math.min(PROF_IDS.length - 1, game.cur); }
  else if (k === "enter") addPoint(1);
  else if (k === "d") addPoint(5);
  else if (k === "r") { if (atBase()) game.sconfirm = true; else toast("Só dá para resetar atributos dentro da base"); }
}
function addPoint(n, id) {
  if (!atBase()) { toast("Só dá para mudar atributos dentro da base"); return; }
  const d = ATTRS.find((a) => a.id === (id || STATS_ORDER[game.cur] || STATS_ORDER[0]));
  const weapon = WEAPON_SKILL_IDS.includes(d.id), pool = weapon ? "wpoints" : "points";
  if (player[pool] <= 0) { toast(weapon ? "Sem pontos de armas" : "Sem pontos de atributo"); return; }
  const amt = Math.min(n, player[pool], weaponSkillCap(d.id) - player.attrs[d.id]);
  if (amt <= 0) { toast("Atributo no máximo"); return; }
  const previousMaxHp = player.maxHp;
  player.attrs[d.id] += amt; player[pool] -= amt;
  if (d.id === "endurance") {
    recalcImplants();
    player.hp = Math.min(player.maxHp, player.hp + Math.max(0, player.maxHp - previousMaxHp));
  }
  syncChar();
}

// ---------- Missões ----------
function missionText(m) {
  switch (m.type) {
    case "kill": return `Elimine ${m.target} zumbis`;
    case "killcat": return `Elimine ${m.target} zumbis usando ${CATNAME[m.cat]}`;
    case "killtype": return `Elimine ${m.target} ${ZTYPES[m.cat] ? ZTYPES[m.cat].plural : "zumbis"}`;
    case "search": return `Vasculhe ${m.target} lugares`;
    case "boss": return "Derrote um chefe";
    case "rescue": return m.progress >= m.target ? `Sobrevivente de ${m.code} resgatado` : game.escort ? "Leve o sobrevivente a um posto seguro" : `Resgate o sobrevivente em ${m.code} (num prédio marcado SOS)`;
    default: return `Chegue a uma área de perigo ${m.target} (${REGIONS[regionOf(m.target)].name})`;
  }
}
function makeOffers() {
  const L = player.level, cats = Object.keys(CATNAME), offers = [];
  const mk = (type, target, f, extra) => offers.push(Object.assign({ type, target, progress: 0, money: Math.round((30 + 12 * L) * f * econ(game.best).reward), xp: Math.round(xpNeed(L) * 0.6 * f) }, extra || {}));
  mk("kill", Math.min(80, 8 + Math.floor(L * 0.6)), 1);
  mk("killcat", Math.min(40, 6 + Math.floor(L / 8)), 1.1, { cat: pick(cats) });
  const types = Object.keys(ZTYPES).filter((t) => t !== "walker" && ZTYPES[t].from <= Math.max(game.best, 2));
  if (types.length) mk("killtype", Math.min(25, 3 + Math.floor(L / 6)), 1.3, { cat: pick(types) });
  mk("search", Math.min(20, 4 + Math.floor(L / 10)), 0.8);
  if (Math.random() < 0.6 && !save.missions.some((m) => m.type === "rescue")) rescueOffer(mk);
  if (L >= 5 && Math.random() < 0.6) mk("boss", 1, 2.2);
  else if (game.best < MAX_ZONE) mk("area", Math.min(MAX_ZONE, game.best + 2 + Math.floor(L / 20)), 1.2);
  else mk("kill", Math.min(120, 20 + L), 1.4);
  return offers;
}
function missionProgress(type, n, cat) {
  let changed = false;
  for (const m of save.missions) {
    if (m.type !== type || m.progress >= m.target) continue;
    if ((type === "killcat" || type === "killtype") && m.cat !== cat) continue;
    m.progress = Math.min(m.target, type === "area" ? Math.max(m.progress, n) : m.progress + n);
    changed = true;
    if (m.progress >= m.target) toast(`Missão concluída: ${missionText(m)} (entregue num posto)`);
  }
  if (changed) persist();
}
function missionItems() {
  return [...(game.atBase ? game.board.map((m) => ({ src: "offer", m })) : []), ...save.missions.map((m) => ({ src: "active", m }))];
}
function missionKey(k) {
  const items = missionItems();
  if (k === "w" || k === "arrowup") game.cur = Math.max(0, game.cur - 1);
  else if (k === "s" || k === "arrowdown") game.cur = Math.max(0, Math.min(items.length - 1, game.cur + 1));
  else if (k === "enter") missionAct(items[game.cur]);
  else if (k === "v") {
    const it = items[game.cur];
    if (it && it.src === "active") {
      if (it.m.type === "rescue") game.escort = null;
      save.missions.splice(save.missions.indexOf(it.m), 1); persist(); toast("Missão abandonada");
      game.cur = Math.max(0, Math.min(game.cur, missionItems().length - 1));
    }
  }
}
function missionAct(it) {
  if (!it) return;
  if (it.src === "offer") {
    if (save.missions.length >= 3) { toast("Máximo de 3 missões ativas"); return; }
    game.board.splice(game.board.indexOf(it.m), 1);
    if (it.m.type === "area") it.m.progress = Math.min(it.m.target, game.best);
    save.missions.push(it.m); persist(); toast("Missão aceita");
  } else if (it.m.progress >= it.m.target) {
    if (!game.atBase) { toast("Entregue no quadro de missões de um posto"); return; }
    save.missions.splice(save.missions.indexOf(it.m), 1);
    game.money += it.m.money; gainXp(it.m.xp); sfx.buy();
    toast(`Missão entregue: +$${it.m.money} e ${Math.round(it.m.xp * xpMult())} de XP`);
    if (game.board.length < 2) game.board = makeOffers();
    persist();
  } else toast("Missão em andamento");
  game.cur = Math.max(0, Math.min(game.cur, missionItems().length - 1));
}

// ---------- Clínica de implantes ----------
function clinicItems() {
  return [...player.bag.map((im) => ({ src: "bag", im })), ...save.installed.map((im) => ({ src: "inst", im }))];
}
function clinicKey(k) {
  if (allocOpen()) { ALLOC.im = null; return; }
  if (k === "tab") { game.tab ^= 1; game.cur = 0; return; }
  const len = game.tab === 0 ? clinicItems().length : game.stock.length;
  if (k === "w" || k === "arrowup") game.cur = Math.max(0, game.cur - 1);
  else if (k === "s" || k === "arrowdown") game.cur = Math.max(0, Math.min(len - 1, game.cur + 1));
  else if (k === "enter") clinicAct();
  else if (k === "v" && game.tab === 0) sellImplant();
  else if (k === "a" && game.tab === 0) { const it = clinicItems()[game.cur]; if (it) openAlloc(it.im); }
  else if ((k === "q" || k === "arrowleft") && game.tab === 0) shiftImplant(-1);
  else if ((k === "d" || k === "arrowright") && game.tab === 0) shiftImplant(1);
}
function clinicAct() {
  if (game.tab === 1) { buyImplant(game.cur); return; }
  const it = clinicItems()[game.cur];
  if (!it) return;
  if (it.src === "bag") {
    const why = installBlock(it.im);
    if (why) { toast(why); return; }
    player.bag.splice(player.bag.indexOf(it.im), 1); save.installed.push(it.im);
    toast(`Instalou ${implantName(it.im)}`);
  } else {
    if (player.bag.length >= BAG_MAX) { toast("Mochila de implantes cheia"); return; }
    save.installed.splice(save.installed.indexOf(it.im), 1); player.bag.push(it.im);
    toast(`Removeu ${implantName(it.im)} (volta para a mochila)`);
  }
  persist(); recalcImplants();
  game.cur = Math.max(0, Math.min(game.cur, clinicItems().length - 1));
}
// muda a ordem dos instalados (o Mímico copia quem está à esquerda dele)
function shiftImplant(dir) {
  const it = clinicItems()[game.cur];
  if (!it || it.src !== "inst") { toast("Selecione um implante instalado"); return; }
  const a = save.installed.indexOf(it.im), b = a + dir;
  if (b < 0 || b >= save.installed.length) return;
  save.installed[a] = save.installed[b]; save.installed[b] = it.im;
  game.cur = player.bag.length + b; persist(); recalcImplants();
}
function buyImplant(i) {
  const st = game.stock[i];
  if (!st) return;
  if (player.bag.length >= BAG_MAX) { toast("Mochila de implantes cheia"); return; }
  if (save.credits < st.price) { toast(`Precisa de ${st.price} créditos (compre no banco)`); return; }
  save.credits -= st.price; sfx.buy();
  const im = newImplant(st.id);
  player.bag.push(im); persist();
  toast(`Comprou ${implantName(im)}`);
}
function sellImplant() {
  const it = clinicItems()[game.cur];
  if (!it || it.src !== "bag") { toast("Só dá para vender implantes da mochila"); return; }
  const v = IMP[it.im.id].scrap;
  player.bag.splice(player.bag.indexOf(it.im), 1); game.money += v;
  toast(`Vendeu ${implantName(it.im)} por $${v}`);
  game.cur = Math.max(0, Math.min(game.cur, clinicItems().length - 1));
}


// Loja do refúgio: 29 implantes novos (preço individual em créditos) e
// Trindade consumível (dinheiro do jogo, não é implante).
const TRINDADE_PRICE = 20000000;
function creditShopItem() {
  const i = Math.max(0, Math.min(IMP_IDS.length, game.creditCur | 0));
  return i === 0 ? "trindade_eterna" : IMP_IDS[i - 1];
}
function buyTrindade() {
  if (!inSafe()) { toast("Compre a Trindade na base."); return; }
  if (game.money < TRINDADE_PRICE) { toast("É preciso $20.000.000."); return; }
  if (!addMat("trindade_eterna", 1)) { toast("Mochila cheia."); return; }
  game.money -= TRINDADE_PRICE;
  sfx.buy(); checkpoint("compra de Trindade");
  toast("Trindade adquirida! Arraste-a sobre o personagem para consumir.");
}
function buyCreditImplant(id) {
  const d = IMP[id];
  if (!d || !inSafe()) { toast("Implante indisponível."); return; }
  if (player.bag.length >= BAG_MAX) { toast("Mochila de implantes cheia."); return; }
  if (player.bag.some(im => im.id === id) || save.installed.some(im => im.id === id)) { toast("Você já possui este implante."); return; }
  if (save.credits < d.price) { toast("Créditos insuficientes. Necessário: " + d.price); return; }
  save.credits -= d.price;
  player.bag.push(newImplant(id));
  sfx.buy(); checkpoint("compra de implante");
  toast("Comprou " + d.name + " por " + d.price + " créditos.");
}
function creditShopBuy(id) {
  if (id === "trindade_eterna") buyTrindade();
  else if (IMP[id]) buyCreditImplant(id);
}
function creditShopKey(k) {
  if (game.creditConfirm) {
    if (k === "escape" || k === "n") game.creditConfirm = null;
    else if (k === "enter" || k === "s" || k === "y") {
      const chosen = game.creditConfirm; game.creditConfirm = null;
      creditShopBuy(chosen);
    }
    return;
  }
  if (k === "escape" || k === "e" || k === "b") { game.menu = null; return; }
  if (k === "w" || k === "arrowup") game.creditCur = Math.max(0, (game.creditCur | 0) - 1);
  else if (k === "s" || k === "arrowdown") game.creditCur = Math.min(IMP_IDS.length, (game.creditCur | 0) + 1);
  else if (k === "enter") game.creditConfirm = creditShopItem();
}
function drawCreditShop() {
  game.creditCur = Math.max(0, Math.min(IMP_IDS.length, game.creditCur | 0));
  menuFrame("Loja de Créditos", "Créditos: " + save.credits.toLocaleString("pt-BR") + " · Dinheiro: $" + game.money.toLocaleString("pt-BR") + " · 29 implantes disponíveis");
  const visible = 11, top = Math.max(0, Math.min(IMP_IDS.length + 1 - visible, game.creditCur - 5));
  for (let j = 0; j < visible && j + top <= IMP_IDS.length; j++) {
    const i = top + j, special = i === 0, id = special ? "trindade_eterna" : IMP_IDS[i - 1], y = 96 + j * 37;
    const d = special ? null : IMP[id];
    const owned = !special && (player.bag.some(im => im.id === id) || save.installed.some(im => im.id === id));
    rowBox(36, y, 514, 34, game.creditCur === i, special ? "#aa8933" : d.event ? "#8c476d" : owned ? "#47774d" : "#454338");
    if (special) drawMatIcon("trindade_eterna", 58, y + 17, 0.42);
    else drawEntryIcon({ type:"implant", im:{id, alloc:{}} }, 58, y + 17, 0.40);
    txt(special ? "★ Trindade · 100 anos (item)" : d.name, 82, y + 22, 13, game.creditCur === i ? "#ffd96a" : "#e5e0c8", "left", true, 306);
    txt(special ? "$20.000.000" : owned ? "POSSUI" : d.price.toLocaleString("pt-BR") + " cr", 532, y + 22, 12, special ? "#ffcb72" : owned ? "#7ed39d" : "#d4af37", "right", true);
    regClick(36, y, 514, 34, () => { if (game.creditCur === i) game.creditConfirm = id; else game.creditCur = i; });
  }
  const id = creditShopItem(), special = id === "trindade_eterna";
  if (special) {
    txt("Trindade · consumível", 578, 114, 20, "#ffd96a", "left", true, 348);
    drawMatIcon(id, 753, 215, 2.1);
    txtWrap("Dura 100 anos após o uso. +35% de dano, +35% de velocidade de corrida e +35% de proteção proporcional aos atributos. Não ocupa espaço de implante.", 574, 300, 13, "#c9c4ad", 344, 19, 8);
    if (trindadeActive()) txt("Ativa até " + new Date(save.trindadeUntil).toLocaleDateString("pt-BR"), 578, 418, 12, "#8fd08a");
  } else {
    const d = IMP[id], im = { id, alloc: {} };
    txt(d.name, 574, 114, 20, "#ffd96a", "left", true, 348);
    drawEntryIcon({ type: "implant", im }, 754, 201, 1.8);
    txtWrap(implantDesc(im), 574, 290, 13, "#c9c4ad", 344, 18, 9);
    if (d.event) txt("★ Edição de evento", 574, 425, 12, "#e7a2d2");
  }
  const price = special ? "$20.000.000" : IMP[id].price.toLocaleString("pt-BR") + " créditos";
  btn(608, 457, 270, 38, "Comprar · " + price, () => { game.creditConfirm = id; }, true);
  hint("W/S seleciona · Enter confirma · Esc fecha");
  if (game.creditConfirm) {
    const cid = game.creditConfirm, sp = cid === "trindade_eterna", cd = sp ? null : IMP[cid];
    ctx.fillStyle = "rgba(0,0,0,0.82)"; ctx.fillRect(0, 0, W, H);
    regClick(0, 0, W, H, () => {});
    ctx.fillStyle = "#27231b"; rr(226, 188, 508, 195, 9); ctx.fill();
    ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2; ctx.stroke();
    txt("CONFIRMAR COMPRA", W / 2, 228, 20, "#f2eedc", "center", true);
    txt(sp ? "Trindade · $20.000.000" : cd.name + " · " + cd.price + " créditos", W / 2, 272, 15, "#e3c46a", "center", true, 480);
    btn(276, 315, 184, 40, "Confirmar", () => { game.creditConfirm = null; creditShopBuy(cid); }, true);
    btn(506, 315, 184, 40, "Cancelar", () => { game.creditConfirm = null; });
  }
  menuToast();
}

// ---------- Viagem ----------
function travelKey(k) {
  if (k === "w" || k === "arrowup") game.cur = Math.max(0, game.cur - 1);
  else if (k === "s" || k === "arrowdown") game.cur = Math.min(OUTPOSTS.length - 1, game.cur + 1);
  else if (k === "enter") travelTo(game.cur);
}

// ---------- Painel de administrador (F2) ----------
const adm = { god: false, infAmmo: false, noReq: false, infStamina: false, freeze: false, dmg: 1, direct: false, shopAnywhere: false };
const ADM_TABS = ["Geral", "Personagem", "Dinheiro e itens", "Armas", "Implantes", "Presentes", "Banidos"];
function canUseAdmin() {
  return typeof fmCloud !== "undefined" && fmCloud.isActive() && fmCloud.isAdmin();
}
function toggleAdmin() {
  if (!canUseAdmin()) {
    if (game.menu === "admin") { game.menu = null; game.input = null; }
    return; // Para jogadores comuns, F2 não faz nada e não mostra qualquer aviso.
  }
  if (game.menu === "admin") { game.menu = null; game.input = null; return; }
  if (game.over) return;
  game.shop = false; game.input = null; game.menu = "admin";
  game.at = game.at || 0; game.ac = game.ac || 0;
  game.admGift = game.admGift || { name: "", type: "dinheiro", qty: 1000, itemIndex: 0, busy: false };
}
function admAsk(label, fn) { if (!canUseAdmin()) return; game.input = { mode: "adm", text: "", label, fn }; }
function admAskText(label, fn) { if (!canUseAdmin()) return; game.input = { mode: "admText", text: "", label, fn }; }
const ADM_GIFT_TYPES = ["dinheiro", "vip", "arma", "material"];
const ADM_GIFT_MATERIALS = ["sucata", "pecas", "eletronicos", "nucleo", "placa"];
function admGiftOptions(g) {
  return g.type === "arma" ? WLIST.filter(w => !w.fists).map(w => w.id) : ADM_GIFT_MATERIALS;
}
async function admSendGift() {
  if (!canUseAdmin()) return;
  const g = game.admGift;
  if (!g || g.busy) return;
  if (!g.name || g.name.trim().length < 3) { toast("Informe o nome do destinatário."); return; }
  g.busy = true;
  try {
    const options = admGiftOptions(g), item = options[Math.abs(g.itemIndex || 0) % options.length];
    toast(await fmGifts.send(g.name, g.type, g.qty, item));
  } catch (err) {
    toast(err.message || "Não foi possível enviar.");
  } finally { g.busy = false; }
}
function admSetLevel(n) {
  n = Math.max(1, Math.min(MAX_LEVEL, n));
  for (let l = player.level + 1; l <= n; l++) { player.points += survivalPointsForLevel(l); player.wpoints += weaponPointsForLevel(l); }
  player.level = n; player.xp = 0; recalcImplants(); syncChar();
}
function admGiveWeapon(id) {
  const r = addWeapon(newInst(id));
  toast(r ? `${WDEF[id].name} ${r === "slot" ? "equipada" : "na mochila"}` : "Mochila cheia");
}
function admGiveImplant(id) {
  const im = newImplant(id);
  if (adm.direct && !installBlock(im)) { save.installed.push(im); persist(); recalcImplants(); toast(`Instalado: ${implantName(im)}`); }
  else if (player.bag.length < BAG_MAX) { player.bag.push(im); toast(`Na mochila: ${implantName(im)}`); }
  else toast("Mochila de implantes cheia");
}
function admReset() {
  save.bank = 0; save.vault = []; save.installed = []; save.credits = 0; save.gm = false; save.missions = [];
  save.vestUpgrades = {}; save.vestDur = {}; save.vest = -1; save.vestsOwned = VESTS.map(() => false); save.outposts = OUTPOSTS.map((o, i) => i === 0);
  save.char = { level: 1, xp: 0, points: 0, wpoints: 0, attrs: defaultAttrs() };
  persist(); resetGame(); toast("Progresso apagado");
}
function admRows() {
  if (!canUseAdmin()) return [];
  const rows = [], tab = game.at;
  const T = (label, get, set) => rows.push({ label, on: get, val: () => (get() ? "LIGADO" : "desligado"), act: () => set(!get()) });
  const B = (label, fn) => rows.push({ label, val: () => "Enter", act: (d, how) => { if (how === "enter") fn(); } });
  const N = (label, get, set, step, lo, hi) => rows.push({ label, val: () => String(Math.round(get() * 100) / 100),
    act: (d, how) => { if (how === "enter") admAsk(label, (v) => set(Math.max(lo, Math.min(hi, v)))); else set(Math.max(lo, Math.min(hi, get() + d * step))); } });
  if (tab === 0) {
    B("Restaurar vida, energia, fome e sede", () => { player.hp = player.maxHp; player.stamina = 100; player.exhausted = false; player.hunger = 100; player.thirst = 100; toast("Status restaurados"); });
    T("Modo deus (não morre)", () => adm.god, (v) => { adm.god = v; });
    T("Energia infinita (correr sem limite)", () => adm.infStamina, (v) => { adm.infStamina = v; });
    T("Munição infinita", () => adm.infAmmo, (v) => { adm.infAmmo = v; });
    T("Ignorar requisitos de armas", () => adm.noReq, (v) => { adm.noReq = v; });
    T("Zumbis congelados", () => adm.freeze, (v) => { adm.freeze = v; });
    // Loja fica somente como imagem decorativa.
    rows.push({ label: "Multiplicador de dano", val: () => "x" + adm.dmg, act: (d) => { const o = [1, 2, 5, 10, 100, 1000], i = o.indexOf(adm.dmg); adm.dmg = o[(i + (d || 1) + o.length) % o.length]; } });
    N("Hora do dia (0 a 23)", () => Math.floor(game.clock / 60) % 24, (v) => { game.clock = Math.floor(game.clock / 1440) * 1440 + v * 60; }, 1, 0, 23);
    rows.push({ label: `Ir para área de perigo (0 a ${MAX_ZONE})`, val: () => `agora: zona ${game.area}`, act: (d, how) => { if (how === "enter") admAsk("Ir para qual zona?", (v) => teleportZone(v)); } });
    B("Liberar todos os postos (viagem rápida)", () => { save.outposts = OUTPOSTS.map(() => true); persist(); toast("Postos liberados"); });
    B("Disparar uma horda agora", () => { if (game.inside) { toast("Saia do prédio primeiro"); return; } startHorde(); });
    B("Soltar uma caixa de suprimentos", () => { if (game.inside) { toast("Saia do prédio primeiro"); return; } spawnAirdrop(); });
    B("Invocar um chefe aqui", () => {
      if (game.inside) { toast("Saia do prédio primeiro"); return; }
      const a = Math.random() * 6.283; spawnBoss(player.x + Math.cos(a) * 260, player.y + Math.sin(a) * 260, game.area); toast("Chefe invocado");
    });
    B("Eliminar todos os zumbis por perto", () => { [...Zs()].forEach((z) => { if (z.hp > 0) hurt(z, 1e9, null, true); }); toast("Zumbis eliminados"); });
    B("Apagar TODO o progresso salvo (pede confirmação)", () => admAsk("Digite 1 para confirmar o reset", (v) => { if (v === 1) admReset(); else toast("Reset cancelado"); }));
  } else if (tab === 1) {
    N("Nível", () => player.level, (v) => admSetLevel(v), 1, 1, MAX_LEVEL);
    B("Subir 10 níveis", () => admSetLevel(player.level + 10));
    N("Pontos de atributo livres", () => player.points, (v) => { player.points = v; syncChar(); }, 5, 0, 99999);
    N("Pontos de armas livres", () => player.wpoints, (v) => { player.wpoints = v; syncChar(); }, 5, 0, 99999);
    B("Atributos no máximo (Stats 100 · Proficiências 120)", () => { ATTRS.forEach((d) => { player.attrs[d.id] = weaponSkillCap(d.id); }); recalcImplants(); syncChar(); toast("Atributos nos limites permitidos"); });
    B("Voltar atributos ao valor inicial", () => { ATTRS.forEach((d) => { player.attrs[d.id] = d.start; }); recalcImplants(); syncChar(); toast("Atributos reiniciados"); });
    ATTRS.forEach((d) => N(d.name + (CATNAME[d.id] ? " (arma)" : ""), () => player.attrs[d.id], (v) => { player.attrs[d.id] = v; if (d.id === "endurance") recalcImplants(); syncChar(); }, 5, d.start, weaponSkillCap(d.id)));
  } else if (tab === 2) {
    N("Dinheiro na mochila", () => game.money, (v) => { game.money = v; }, 1000, 0, 999999999);
    N("Dinheiro no banco", () => save.bank, (v) => { save.bank = v; persist(); }, 10000, 0, 999999999);
    N("Créditos", () => save.credits, (v) => { save.credits = v; persist(); }, 50, 0, 999999);
    T("VIP ativo", () => save.gm, (v) => { save.gm = v; persist(); });
    rows.push({ label: "Colete (A/D troca, ganha o colete)", val: () => (save.vest >= 0 ? VESTS[save.vest].name : "nenhum"), act: (d) => { save.vest = ((save.vest + 1 + (d || 1) + VESTS.length + 1) % (VESTS.length + 1)) - 1; if (save.vest >= 0) save.vestsOwned[save.vest] = true; recalcImplants(); persist(); } });
    N("Comida", () => player.food, (v) => { player.food = v; }, 1, 0, 999);
    N("Água", () => player.water, (v) => { player.water = v; }, 1, 0, 999);
    N("Kits médicos", () => player.med, (v) => { player.med = v; }, 1, 0, 999);
    B("Munição +200 de todos os tipos", () => { for (const t in AMMO) player.reserve[t] += 200; toast("Munição adicionada"); });
    B("Concluir as missões ativas", () => { save.missions.forEach((m) => { m.progress = m.target; }); persist(); toast("Missões concluídas (entregue no quadro)"); });
    B("Novas missões no quadro", () => { game.board = makeOffers(); toast("Quadro renovado"); });
  } else if (tab === 3) {
    B("Materiais +10 de cada (na mochila)", () => { for (const m in MATS) addMat(m, 10); toast("Materiais adicionados"); });
    B("Arma na mão: todas as melhorias no máximo", () => { const it = curInst(); if (!it) { toast("Sem arma na mão"); return; } UP_STATS.forEach((s) => { it.up[s.id] = UP_MAX; }); toast("Arma no máximo"); });
    B("Esvaziar a mochila", () => { player.pack.length = 0; toast("Mochila vazia"); });
    WLIST.forEach((d) => {
      if (d.fists) return;
      rows.push({ label: `${d.name} · ${CAT_LABEL[d.cat]}${d.legendary ? " (lendária)" : d.special ? " (especial)" : ""}`, val: () => "dar", act: (x, how) => { if (how === "enter") admGiveWeapon(d.id); } });
    });
  } else if (tab === 4) {
    T("Instalar direto (sem passar pela clínica)", () => adm.direct, (v) => { adm.direct = v; });
    IMP_IDS.forEach((id) => rows.push({ label: `${IMP[id].name} · ${IMP[id].price} créditos`, val: () => "dar", act: (d, how) => { if (how === "enter") admGiveImplant(id); } }));
    B("Limpar a mochila de implantes", () => { player.bag.length = 0; toast("Mochila de implantes vazia"); });
    B("Remover os implantes instalados", () => { save.installed.length = 0; persist(); recalcImplants(); toast("Implantes removidos"); });
  } else if (tab === 5) {
    const g = game.admGift || (game.admGift = { name: "", type: "dinheiro", qty: 1000, itemIndex: 0, busy: false });
    B("Destinatário: " + (g.name || "(digitar nome in-game)"), () => admAskText("Nome do jogador", name => { g.name = name.slice(0,16); }));
    rows.push({ label: "Tipo de presente (A/D para escolher)", val: () =>
      ({dinheiro:"Dinheiro",vip:"VIP temporário",arma:"Arma",material:"Material"})[g.type],
      act: (d) => { g.type = ADM_GIFT_TYPES[(ADM_GIFT_TYPES.indexOf(g.type) + (d < 0 ? -1 : 1) + ADM_GIFT_TYPES.length) % ADM_GIFT_TYPES.length]; g.itemIndex = 0; g.qty = g.type === "vip" ? 1 : g.type === "arma" ? 1 : g.type === "material" ? 10 : 1000; } });
    if (g.type === "vip") {
      rows.push({ label: "Duração do VIP (A/D para escolher)", val: () =>
        g.qty === 1 ? "1 mês" : g.qty === 6 ? "6 meses" : "1 ano",
        act: (d) => { const o = [1,6,12]; g.qty = o[(o.indexOf([1,6,12].includes(g.qty)?g.qty:1)+(d<0?-1:1)+o.length)%o.length]; } });
    } else if (g.type === "dinheiro" || g.type === "material") {
      N("Quantidade", () => g.qty, n => { g.qty = n; }, 100, 1, g.type === "material" ? 1000 : 10000000);
    }
    if (g.type === "arma" || g.type === "material") {
      rows.push({label: "Item (A/D alterna)", val: () => {
        const list = admGiftOptions(g), item = list[(g.itemIndex || 0) % list.length];
        return g.type === "arma" ? WDEF[item].name : MATS[item].name;
      }, act: (d) => { const list = admGiftOptions(g);
        g.itemIndex = ((g.itemIndex || 0) + (d < 0 ? -1 : 1) + list.length) % list.length; }});
    }
    B("ENVIAR PRESENTE PARA O JOGADOR", () => admSendGift());
    rows.push({ label: "A entrega é automática e aparece em Mensagens (I).",
      val: () => g.busy ? "enviando..." : "somente ADM", act: () => {} });
  } else if (tab === 6) {
    // banidos: lista vem do servidor (só administradores conseguem ler)
    if (!game.admBans) admLoadBans();
    const st = game.admBans || { list: [], busy: true };
    B(st.busy ? "Carregando a lista..." : "Atualizar a lista", () => { game.admBans = null; admLoadBans(); });
    if (st.err) rows.push({ label: "Erro: " + st.err, val: () => "", act: () => {} });
    else if (!st.busy && !st.list.length) rows.push({ label: "Nenhum jogador banido.", val: () => "", act: () => {} });
    st.list.forEach((b) => {
      const ate = b.ate ? "até " + new Date(b.ate).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "permanente";
      rows.push({ label: `${b.nome} · ${ate}${b.motivo ? " · " + b.motivo : ""}`, val: () => "DESBANIR (Enter)",
        act: (d, how) => { if (how === "enter") admUnban(b); } });
    });
    rows.push({ label: "Para banir: mapa (N) → clique no jogador na lista de online.", val: () => "", act: () => {} });
  }
  return rows;
}
function adminKey(k) {
  if (!canUseAdmin()) { game.menu = null; game.input = null; return; }
  if (k === "escape" || k === "f2") { game.menu = null; return; }
  if (k === "tab") { game.at = (game.at + 1) % ADM_TABS.length; game.ac = 0; return; }
  const rows = admRows();
  game.ac = Math.max(0, Math.min(rows.length - 1, game.ac));
  const r = rows[game.ac];
  if (k === "w" || k === "arrowup") game.ac = Math.max(0, game.ac - 1);
  else if (k === "s" || k === "arrowdown") game.ac = Math.min(rows.length - 1, game.ac + 1);
  else if (k === "a" || k === "arrowleft") r.act(-1, "adjust");
  else if (k === "d" || k === "arrowright") r.act(1, "adjust");
  else if (k === "enter") r.act(1, "enter");
}

// =====================================================================
//  Desenho dos menus
// =====================================================================
function menuFrame(title, sub) {
  ctx.fillStyle = "rgba(8,9,7,0.92)"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(212,175,55,0.35)"; ctx.lineWidth = 1; rr(16, 12, W - 32, H - 24, 10); ctx.stroke();
  txt(title, W / 2, 46, 28, "#e5e0c8", "center", true);
  if (sub) txt(sub, W / 2, 72, 15, "#a9a58f", "center");
}
function rowBox(x, y, w, h, sel, accent) {
  ctx.fillStyle = sel ? "#2b2a22" : "#1a1a15"; rr(x, y, w, h, 5); ctx.fill();
  ctx.strokeStyle = sel ? "#ffd96a" : accent || "#3d3b30"; ctx.lineWidth = sel ? 2 : 1; ctx.stroke();
}
function hint(t) { txt(t, W / 2, H - 24, 13, "#a9a58f", "center"); }
function menuToast() {
  if (game.msgT > 0) txt(game.msg, W / 2, H - 50, 17, "#ffd96a", "center", true, W - 80);
}

function drawMenu() {
  if (game.menu === "name") { drawNameScreen(); return; }
  if (game.menu === "prof") { drawProf(); return; }
  if (game.menu === "bank") drawBank();
  else if (game.menu === "clinic") drawClinic();
  else if (game.menu === "stats") drawStats();
  else if (game.menu === "missions") drawMissions();
  else if (game.menu === "sector") drawSector();
  else if (game.menu === "junk") drawJunk();
  else if (game.menu === "market") drawMarket();
  else if (game.menu === "saleMail") drawSaleMail();
  else if (game.menu === "creditshop") drawCreditShop();
  else if (game.menu === "admin") drawAdmin();
  else if (game.menu === "travel") drawTravel();
  else if (game.menu === "map") drawMap();
  else if (game.menu === "friends") drawFriends();
  else if (game.menu === "messages") drawMessages();
  else if (game.menu === "pack") drawInventory();
  else if (game.menu === "craft") drawCraft();
  else if (game.menu === "obj") drawObjectives();
  else if (game.menu === "library") drawLibrary();
  else drawStash();
  if (game.menu !== "admin" && game.menu !== "craft") menuToast();
}

// Tela do banco: cenário escuro da cidade, o prédio do banco, a fala do guarda-livros e os dois saldos
// com campo de valor (clique no campo, digite, Enter ou "depositar"/"sacar"). Créditos e VIP embaixo.
const BANK_BG = new Image(); BANK_BG.src = "img/fm_exterior.webp?v=20261116-interior2";
const BANK_ART = new Image(); BANK_ART.src = "img/bank_art.webp?v=20261121-banco01";
function bankMoney(v) { return "$" + Math.max(0, Math.floor(v || 0)).toLocaleString("pt-BR"); }
function drawBank() {
  // fundo: cidade em ruínas, escurecida, com bordas mais escuras
  ctx.fillStyle = "#070605"; ctx.fillRect(0, 0, W, H);
  if (BANK_BG.complete && BANK_BG.naturalWidth) {
    const k = Math.max(W / BANK_BG.naturalWidth, H / BANK_BG.naturalHeight);
    ctx.globalAlpha = 0.85;
    ctx.drawImage(BANK_BG, (W - BANK_BG.naturalWidth * k) / 2, (H - BANK_BG.naturalHeight * k) / 2, BANK_BG.naturalWidth * k, BANK_BG.naturalHeight * k);
    ctx.globalAlpha = 1;
  }
  const vg = ctx.createRadialGradient(W / 2, H / 2, 120, W / 2, H / 2, 560);
  vg.addColorStop(0, "rgba(0,0,0,0.35)"); vg.addColorStop(1, "rgba(0,0,0,0.9)");
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(150,90,40,0.55)"; ctx.lineWidth = 2; rr(14, 10, W - 28, H - 20, 8); ctx.stroke();
  // título vermelho, com sombra
  ctx.save();
  ctx.font = "bold 40px Impact, 'Arial Black', sans-serif"; ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,0.85)"; ctx.fillText("BANCO", W / 2 + 2, 56);
  ctx.fillStyle = "#b3201a"; ctx.fillText("BANCO", W / 2, 54);
  ctx.restore();
  txt(`Créditos: ${save.credits.toLocaleString("pt-BR")}  ·  VIP: ${vipStatus()}`, W - 34, 34, 12, "#8f8a72", "right");
  // o prédio do banco, com as bordas sumindo no escuro
  const aw = 384, ah = 146, ax = (W - aw) / 2, ay = 70;
  if (BANK_ART.complete && BANK_ART.naturalWidth) {
    ctx.drawImage(BANK_ART, ax, ay, aw, ah);
    const fade = (x0, y0, x1, y1, ox, oy, w, h) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(7,6,5,1)"); g.addColorStop(1, "rgba(7,6,5,0)");
      ctx.fillStyle = g; ctx.fillRect(ox, oy, w, h);
    };
    fade(ax, 0, ax + 60, 0, ax, ay, 60, ah); fade(ax + aw, 0, ax + aw - 60, 0, ax + aw - 60, ay, 60, ah);
    fade(0, ay + ah, 0, ay + ah - 40, ax, ay + ah - 40, aw, 40); fade(0, ay, 0, ay + 24, ax, ay, aw, 24);
  }
  // fala do dono do banco
  txtWrap("Um homem enorme, de braços cruzados atrás de um balcão blindado, te encara antes de falar: — Tenho seis homens " +
    "armados vigiando este lugar dia e noite. O seu dinheiro está seguro aqui, mesmo que você não volte da rua. " +
    "Só não me peça juros: isso acabou junto com o resto do mundo.", 210, 246, 14, "#e8e2cc", 540, 19, 5);
  // os dois saldos, cada um com o seu campo de valor
  const inp = game.input, cols = [
    { x: W / 2 - 150, label: "Na mochila", val: game.money, mode: "deposit", act: "depositar", all: "depositar tudo",
      go: (a) => deposit(a), allFn: () => deposit(game.money) },
    { x: W / 2 + 150, label: "No banco", val: save.bank, mode: "withdraw", act: "sacar", all: "sacar tudo",
      go: (a) => withdraw(a), allFn: () => withdraw(save.bank) }
  ];
  const hov = (x, y, w, h) => mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  const link = (label, x, y, fn, on) => {
    ctx.font = `bold 14px ${FONT}`; const w = ctx.measureText(label).width + 12, h = hov(x - w / 2, y - 15, w, 20);
    txt(label, x, y, 14, !on ? "#6b4a40" : h ? "#ffd2c4" : "#e0a090", "center", true);
    if (on) regClick(x - w / 2, y - 15, w, 20, fn);
  };
  cols.forEach((c) => {
    txt(`${c.label}: ${bankMoney(c.val)}`, c.x, 362, 15, "#d8c9a4", "center", true);
    const bw = 170, bh = 26, bx = c.x - bw / 2, by = 372, typing = inp && inp.mode === c.mode;
    ctx.fillStyle = typing ? "#2b2a25" : "#1b1a17"; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = typing ? "#d4af37" : hov(bx, by, bw, bh) ? "#8a826a" : "#4a473d"; ctx.lineWidth = 1; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    const shown = typing ? (inp.text ? Number(inp.text).toLocaleString("pt-BR") : "") + (Math.floor(performance.now() / 500) % 2 ? "|" : "") : "0";
    txt(shown, c.x, by + 18, 14, typing ? "#f2eedc" : "#7d7866", "center", true);
    regClick(bx, by, bw, bh, () => { game.input = { mode: c.mode, text: "" }; });
    const amount = typing ? parseInt(inp.text || "0", 10) : 0;
    link(c.act, c.x, 418, () => { game.input = null; c.go(amount); }, typing && amount > 0);
    link(c.all, c.x, 456, () => { game.input = null; c.allFn(); }, c.val > 0);
  });
  drawSaleStatement();
  hint("Clique no campo, digite o valor e Enter  ·  D/S digitar · A/T tudo  ·  E, B ou Esc fecha");
  if (game.input && game.input.mode === "credits") {
    const mode = game.input.mode, dep = mode === "deposit";
    ctx.fillStyle = "rgba(0,0,0,0.95)"; rr(220, 200, 520, 180, 10); ctx.fill();
    ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2; ctx.stroke();
    txt(dep ? "Quanto deseja depositar?" : mode === "credits" ? "Quantos créditos deseja comprar?" : "Quanto deseja sacar?", W / 2, 240, 20, "#e5e0c8", "center", true);
    txt(`${mode === "credits" ? "" : "$"}${game.input.text || "0"}${Math.floor(performance.now() / 500) % 2 ? "|" : ""}`, W / 2, 300, 36, "#e5e0c8", "center", true);
    const avail = dep ? `Disponível: $${game.money}` : mode === "credits" ? `Banco: $${save.bank} (até ${Math.floor(save.bank / CREDIT_PRICE)} créditos)` : `Disponível: $${save.bank}`;
    txt(`${avail} · digite o valor · Enter confirma · Esc cancela`, W / 2, 350, 14, "#a9a58f", "center");
  }
}

function drawStats() {
  game.stab = 0;   // a sub-aba "Personagem" (troca de aparência) saiu da tela de atributos
  menuFrame(`Atributos · Nível ${player.level}`);
  game.cur = Math.max(0, Math.min(STATS_ORDER.length - 1, game.cur | 0));
  txt(`HP ${Math.ceil(player.hp)}/${Math.ceil(player.maxHp)}  ·  XP ${Math.floor(player.xp)}/${player.level >= MAX_LEVEL ? "máx" : xpNeed(player.level)}`, W / 2, 72, 14, "#a9a58f", "center");
  // uma coluna (Stats ou Proficiências): linhas com valor, barra e botão +
  const column = (x, y, w, title, ids, first, pool, poolName) => {
    ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(x, y, w, 300, 8); ctx.fill();
    ctx.strokeStyle = "rgba(192,57,43,0.55)"; ctx.lineWidth = 1.5; ctx.stroke();
    txt(title, x + 14, y + 24, 17, "#e05a4a", "left", true);
    txt(`${poolName}: ${player[pool]}`, x + w - 14, y + 24, 13, player[pool] > 0 ? "#ffd96a" : "#6d6a58", "right", true);
    ids.forEach((id, j) => {
      const d = ATTRS.find((a) => a.id === id), i = first + j, ry = y + 34 + j * 29, sel = game.cur === i, v = player.attrs[id];
      const cap = weaponSkillCap(id), full = v >= cap, can = player[pool] > 0 && !full;
      rowBox(x + 8, ry, w - 16, 26, sel);
      regClick(x + 8, ry, w - 60, 26, () => { game.cur = i; });
      txt(PROF_NAMES[id] || d.name, x + 18, ry + 18, 14, "#e5e0c8", "left", true, 170);
      txt(String(v), x + 210, ry + 18, 14, full ? "#6fae4f" : "#e05a4a", "right", true);
      ctx.fillStyle = "#000"; ctx.fillRect(x + 220, ry + 10, w - 290, 6);
      ctx.fillStyle = WEAPON_SKILL_IDS.includes(id) ? "#d08a5a" : "#6d8aa8"; ctx.fillRect(x + 220, ry + 10, (w - 290) * Math.min(1, v / cap), 6);
      // botão +: clique soma 1 (Shift + clique soma 5)
      const bx = x + w - 44, by = ry + 2, hov = mouse.x >= bx && mouse.x <= bx + 28 && mouse.y >= by && mouse.y <= by + 22;
      ctx.fillStyle = !can ? "#1f1e19" : hov ? "#5a4a2a" : "#352d1a"; rr(bx, by, 28, 22, 4); ctx.fill();
      ctx.strokeStyle = can ? "#d4af37" : "#3d3b30"; ctx.lineWidth = 1; ctx.stroke();
      txt("+", bx + 14, by + 17, 17, can ? "#f2eedc" : "#4a4840", "center", true);
      if (can) regClick(bx, by, 28, 22, () => { game.cur = i; addPoint(keys && keys.shift ? 5 : 1, id); });
    });
  };
  column(40, 86, 430, "Stats", STATS_LEFT, 0, "points", "Pontos");
  column(490, 86, 430, "Proficiências", PROF_IDS, STATS_LEFT.length, "wpoints", "Pontos de arma");
  // efeito do atributo escolhido (embaixo das proficiências)
  const sid = STATS_ORDER[game.cur], sd = ATTRS.find((a) => a.id === sid);
  ctx.strokeStyle = "rgba(192,57,43,0.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(500, 276); ctx.lineTo(910, 276); ctx.stroke();
  txt(PROF_NAMES[sid] || sd.name, 506, 298, 15, "#f2eedc", "left", true);
  txtWrap(attrEffect(sid, player.attrs[sid]), 506, 318, 12, "#a9a58f", 398, 15, 2);
  txt(WEAPON_SKILL_IDS.includes(sid) ? `Usa pontos de arma · máx. ${weaponSkillCap(sid)}` : `Usa pontos de atributo · máx. ${weaponSkillCap(sid)}`, 506, 356, 11, WEAPON_SKILL_IDS.includes(sid) ? "#d08a5a" : "#6d8aa8");
  txt("Força conta como ponto de arma (exigência das armas).", 506, 372, 11, "#6d6a58");
  // reset de atributos pago com créditos
  ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(40, 398, 880, 110, 8); ctx.fill();
  ctx.strokeStyle = "rgba(192,57,43,0.55)"; ctx.lineWidth = 1.5; ctx.stroke();
  txt("Reset de atributos", W / 2, 424, 18, "#f2eedc", "center", true);
  txt("Devolve todos os pontos investidos em stats e proficiências para você distribuir de novo.", W / 2, 446, 13, "#a9a58f", "center");
  const ok = save.credits >= RESET_STATS_CREDITS;
  txt(`${RESET_STATS_CREDITS} créditos · você tem ${save.credits}`, W / 2, 466, 14, ok ? "#e05a4a" : "#6d6a58", "center", true);
  btn(W / 2 - 90, 474, 180, 28, ok ? "Resetar (R)" : "Créditos insuficientes", () => { game.sconfirm = true; }, true, !ok);
  if (game.sconfirm) {
    ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1a1913"; rr(W / 2 - 210, H / 2 - 64, 420, 128, 10); ctx.fill(); ctx.strokeStyle = "#e05a4a"; ctx.lineWidth = 2; ctx.stroke();
    txt(`Resetar atributos por ${RESET_STATS_CREDITS} créditos?`, W / 2, H / 2 - 26, 17, "#f2eedc", "center", true);
    txt("Todos os pontos voltam para você distribuir de novo.", W / 2, H / 2 - 4, 13, "#a9a58f", "center");
    btn(W / 2 - 150, H / 2 + 16, 140, 32, "Resetar", () => { game.sconfirm = false; resetStatsWithCredits(); }, true);
    btn(W / 2 + 10, H / 2 + 16, 140, 32, "Cancelar", () => { game.sconfirm = false; });
  }
  hint("W/S escolhe · A/→ troca de coluna · Enter +1 · D +5 · clique no + (Shift soma 5) · R reset · C ou Esc");
}

function drawMissionRow(x, y, w, m, sel, active) {
  const done = active && m.progress >= m.target;
  rowBox(x, y, w, 48, sel, done ? "#6fae4f" : null);
  txt(missionText(m), x + 10, y + 19, 14, done ? "#6fae4f" : "#e5e0c8", "left", true, w - 20);
  const rew = `Recompensa: $${m.money} + ${Math.round(m.xp * xpMult())} XP`;
  txt(active ? `${done ? "CONCLUÍDA, entregue num posto · " : `${m.progress}/${m.target} · `}${rew}` : rew, x + 10, y + 38, 12, "#a9a58f", "left", false, w - 20);
}
function drawMissions() {
  menuFrame(game.atBase ? "Quadro de missões" : "Missões ativas",
    `Ativas: ${save.missions.length}/3 · Dinheiro: $${game.money}${game.atBase ? "" : " · entregue as concluídas no quadro de um posto"}`);
  const offers = game.atBase ? game.board : [];
  if (game.atBase) txt("Disponíveis", 40, 104, 14, "#e5e0c8", "left", true);
  txt("Ativas", game.atBase ? 500 : 40, 104, 14, "#e5e0c8", "left", true);
  offers.forEach((m, i) => drawMissionRow(40, 114 + i * 54, 440, m, game.cur === i, false));
  save.missions.forEach((m, j) => drawMissionRow(game.atBase ? 500 : 40, 114 + j * 54, game.atBase ? 420 : 880, m, game.cur === offers.length + j, true));
  if (!offers.length && !save.missions.length) txt("Nenhuma missão no momento.", 40, 140, 15, "#6d6a58");
  hint("W/S move · Enter aceita/entrega · V abandona · M ou E fecha");
}

function drawImplantRow(x, y, w, im, selected, right, rightColor) {
  rowBox(x, y, w, 28, selected);
  txt(implantName(im), x + 10, y + 19, 14, impColor(im), "left", true, w - (right ? 170 : 20));
  if (right) txt(right, x + w - 10, y + 19, 13, rightColor || "#a9a58f", "right", true);
}
// caixa com o nome e a descrição inteira do implante selecionado
function drawImplantInfo(im) {
  ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(40, 424, W - 80, 118, 8); ctx.fill();
  if (!im) { txt("Selecione um implante para ver os efeitos", W / 2, 488, 14, "#6d6a58", "center"); return; }
  txt(implantName(im), 56, 448, 17, impColor(im), "left", true);
  txt(`Único (só um instalado) · sucata $${IMP[im.id].scrap}`, W - 56, 448, 12, "#a9a58f", "right");
  txtWrap(implantDesc(im), 56, 470, 13, "#d8d2ba", W - 112, 17, 4);
}
function drawClinic() {
  menuFrame("Clínica de implantes", `Créditos: ${save.credits}  ·  Dinheiro: $${game.money}  ·  Instalados: ${save.installed.length}/${IMPL_SLOTS}  ·  Mochila: ${player.bag.length}/${BAG_MAX}`);
  txt("Meus implantes", W / 2 - 100, 100, 16, game.tab === 0 ? "#ffd96a" : "#6d6a58", "center", true);
  txt("Loja", W / 2 + 100, 100, 16, game.tab === 1 ? "#ffd96a" : "#6d6a58", "center", true);
  if (game.tab === 0) {
    txt("Na mochila (preservados ao morrer)", 40, 126, 13, "#a9a58f");
    txt("Instalados, na ordem dos slots (permanentes)", 500, 126, 13, "#a9a58f");
    const pts = (im) => (IMP[im.id].alloc ? `${allocUsed(im)}/${IMP[im.id].alloc.points} pts` : IMP[im.id].mimic ? "copia ←" : "");
    player.bag.forEach((im, i) => drawImplantRow(40, 134 + i * 32, 440, im, game.cur === i, pts(im)));
    save.installed.forEach((im, j) => drawImplantRow(500, 134 + j * 32, 420, im, game.cur === player.bag.length + j, `${j + 1}º  ${pts(im)}`));
    if (!player.bag.length && !save.installed.length) txt("Nenhum implante ainda. Compre na loja (Tab) ou ache em saques raros.", 40, 160, 15, "#6d6a58");
    const it = clinicItems()[game.cur];
    drawImplantInfo(it ? it.im : null);
    hint("W/S move · Enter instala/remove · A distribui pontos · Q/D muda a ordem · V vende · Tab loja · E fecha");
  } else {
    const N = 9, first = Math.max(0, Math.min(game.stock.length - N, game.cur - 4));
    for (let r = 0; r < N && first + r < game.stock.length; r++) {
      const i = first + r, st = game.stock[i], im = { id: st.id, alloc: {} };
      const has = save.installed.some((x) => x.id === st.id) ? "instalado · " : player.bag.some((x) => x.id === st.id) ? "na mochila · " : "";
      drawImplantRow(140, 126 + r * 32, 680, im, game.cur === i, `${has}${st.price} créditos`, save.credits >= st.price ? "#6fae4f" : "#c0392b");
    }
    txt(`${game.cur + 1} / ${game.stock.length}`, 830, 144, 12, "#a9a58f");
    if (first > 0) txt("▲", 830, 164, 12, "#ffd96a");
    if (first + N < game.stock.length) txt("▼", 830, 400, 12, "#ffd96a");
    const st = game.stock[game.cur];
    drawImplantInfo(st ? { id: st.id, alloc: {} } : null);
    hint("Implantes únicos, pagos com créditos (compre créditos no banco) · W/S move · Enter compra · Tab volta · E fecha");
  }
  drawAllocPanel();
}

function drawTravel() {
  menuFrame("Rádio · viagem rápida", "Um motorista leva você entre postos já descobertos. Paga com o dinheiro da mochila.");
  OUTPOSTS.forEach((o, i) => {
    const y = 90 + i * 58, here = game.inside && game.inside.outpost === o.id, known = save.outposts[o.id], cl = opCell(o.id), RG = REGIONS[cl.tier];
    rowBox(180, y, 600, 52, game.cur === i, here ? "#6fae4f" : null);
    rowClick(180, y, 600, 52, game.cur === i, () => { game.cur = i; }, () => travelTo(o.id));
    txt(known ? o.name : "??? (não descoberta)", 200, y + 22, 17, known ? "#e5e0c8" : "#6d6a58", "left", true);
    txt(`Área ${cl.code} · ${RG.name} · ${RG.diff}`, 200, y + 41, 13, RG.color === "#2a2a2e" ? "#9a9aa0" : RG.color);
    txt(here ? "você está aqui" : known ? `$${travelCost(o.id)}` : "explore para achar", 764, y + 32, 16, here ? "#6fae4f" : known ? (game.money >= travelCost(o.id) ? "#ffd96a" : "#c0392b") : "#6d6a58", "right", true);
  });
  txt("Dica: as bases aparecem como ⌂ no mapa (N). Descubra entrando nelas.", W / 2, 470, 14, "#a9a58f", "center");
  hint("W/S escolhe · Enter viaja · E ou Esc fecha");
}

// ---------- Mapa de áreas (grade com cores de dificuldade) ----------
function mapKey(k) {
  const s = game.mapSel || { cx: world.cell.cx, cy: world.cell.cy };
  const mv = { a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0], w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1] }[k];
  if (mv) game.mapSel = { cx: clamp(s.cx + mv[0], 0, MAP_W - 1), cy: clamp(s.cy + mv[1], 0, MAP_H - 1) };
  else if (k === "c") game.mapSel = { cx: world.cell.cx, cy: world.cell.cy };
}
function tierTextColor(t) { return REGIONS[t].color === "#2a2a2e" ? "#9a9aa0" : REGIONS[t].color; }
function drawMap() {
  const here = world.cell;
  if (!game.mapSel) game.mapSel = { cx: here.cx, cy: here.cy };
  menuFrame("Mapa da cidade", `${allCells().length} áreas · ${fmSocial.online().length + 1} jogador(es) online · ☠ = chefe vivo (${bossCells().length})`);
  const cs = 34, gx = 34, gy = 96, now = performance.now();
  for (let cy = 0; cy < MAP_H; cy++) for (let cx = 0; cx < MAP_W; cx++) {
    const c = cellAt(cx, cy), x = gx + cx * cs, y = gy + cy * cs;
    if (!c) { ctx.fillStyle = "#121210"; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2); continue; }
    const RG = REGIONS[c.tier];
    ctx.fillStyle = RG.color; ctx.globalAlpha = c.visited ? 0.95 : 0.6; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2); ctx.globalAlpha = 1;
    if (c.tier === 6) { ctx.strokeStyle = "#55555c"; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, cs - 3, cs - 3); }
    if (c.landmark) { ctx.fillStyle = "rgba(0,0,0,0.55)"; rr(x + 3, y + cs - 17, 14, 14, 3); ctx.fill(); txt({ hospital: "H", prisao: "P", bunker: "B" }[c.landmark], x + 10, y + cs - 6, 10, { hospital: "#ff7a6a", prisao: "#ffc060", bunker: "#a8e07a" }[c.landmark], "center", true); }
    if (c.op != null) txt("⌂", x + cs / 2, y + cs / 2 + 7, 20, save.outposts[c.op] ? "#ffffff" : "rgba(255,255,255,0.45)", "center", true);
    if (c.boss) {
      const p = 0.7 + 0.3 * Math.sin(now / 220 + cx);
      ctx.fillStyle = `rgba(0,0,0,${0.45 * p})`; circle(x + cs / 2, y + cs / 2, 12);
      txt("☠", x + cs / 2, y + cs / 2 + 7, 19, `rgba(255,${Math.round(90 * p)},${Math.round(70 * p)},1)`, "center", true);
    }
    if (c.tier === 8 && player.level < GRAY_LEVEL) txt("🔒", x + cs - 9, y + 12, 9, "#fff", "center");
    if (c === here) { ctx.strokeStyle = "#ffd96a"; ctx.lineWidth = 2.5 + Math.sin(now / 200); ctx.strokeRect(x + 2, y + 2, cs - 4, cs - 4); }
    if (game.mapSel.cx === cx && game.mapSel.cy === cy) { ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.strokeRect(x + 4, y + 4, cs - 8, cs - 8); ctx.setLineDash([]); }
    regClick(x, y, cs, cs, () => {
      game.mapSel = { cx, cy };
      if (canUseAdmin() && c !== here) game.mapAsk = { kind: "cell", cx, cy };   // admin: pergunta se teletransporta
    });
  }
  // Marcadores de sobreviventes online por setor: azul = jogador, verde = amigo.
  const locations = new Map();
  for (const p of fmSocial.online()) {
    const key = p.cx + "," + p.cy;
    if (!locations.has(key)) locations.set(key, []);
    locations.get(key).push(p);
  }
  for (const [key, group] of locations) {
    const [cx, cy] = key.split(",").map(Number);
    const x = gx + cx * cs + cs - 9, y = gy + cy * cs + 9;
    ctx.fillStyle = group.some(p => fmSocial.isFriend(p.uid)) ? "#8fe0a8" : "#73ceff";
    circle(x, y, 9);
    txt(String(group.length), x, y + 4, 11, "#101613", "center", true);
  }
  for (let cx = 0; cx < MAP_W; cx++) txt(String.fromCharCode(65 + cx), gx + cx * cs + cs / 2, gy - 6, 10, "#a9a58f", "center", true);
  for (let cy = 0; cy < MAP_H; cy++) txt(String(cy + 1), gx - 8, gy + cy * cs + cs / 2 + 4, 10, "#a9a58f", "right", true);
  // legenda das cores
  const ly = gy + MAP_H * cs + 18;
  REGIONS.forEach((RG, i) => {
    const x = gx + (i % 3) * 160, y = ly + Math.floor(i / 3) * 20;
    ctx.fillStyle = RG.color; ctx.fillRect(x, y - 10, 14, 14);
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.strokeRect(x, y - 10, 14, 14);
    txt(`${RG.name} · ${RG.diff}`, x + 19, y + 2, 11, "#c9c4ad", "left", true);
  });
  txt("⌂ base  ☠ chefe  H hospital  P prisão  B bunker  amarelo = você  azul = online  verde = amigo", gx, ly + 66, 11, "#a9a58f");
  // área escolhida
  const sel = cellAt(game.mapSel.cx, game.mapSel.cy), lx = 540;
  const sectorOnline = fmSocial.online().filter(p => p.cx === game.mapSel.cx && p.cy === game.mapSel.cy);
  txt("ONLINE: " + sectorOnline.length + (sectorOnline.length ? " · " + sectorOnline.map(p => p.name).join(", ") : ""), lx, 87, 12, "#73ceff", "left", true, 370);
  if (!sel) {
    txt(`${cellCode(game.mapSel.cx, game.mapSel.cy)} · sem passagem`, lx, 120, 20, "#6d6a58", "left", true);
    txt("Escombros e prédios caídos fecham essa área.", lx, 144, 13, "#a9a58f");
  } else {
    const RG = REGIONS[sel.tier], col = tierTextColor(sel.tier), z0 = sel.zone;
    txt(`${sel.code} · ${sel.name}`, lx, 118, 20, "#e5e0c8", "left", true, 380);
    txt(`Área ${RG.name} · ${RG.diff}`, lx, 140, 15, col, "left", true);
    txt(RG.desc, lx, 158, 12, "#c9c4ad", "left", false, 380);
    let y = 182;
    if (sel.op != null) { txt(`⌂ ${save.outposts[sel.op] ? OUTPOSTS[sel.op].name : "Base ainda não descoberta"}`, lx, y, 13, save.outposts[sel.op] ? "#6fd08a" : "#6d6a58", "left", true); y += 18; }
    if (sel.landmark) { txt(`★ ${BTYPES[sel.landmark].name}: o melhor saque da região`, lx, y, 13, "#ffb070", "left", true, 380); y += 18; }
    if (sel.boss) { const B = BOSSES[sel.boss]; txt(`☠ ${B.name} · deixa: ${B.drop}`, lx, y, 13, "#e04a4a", "left", true, 380); y += 18; }
    if (sel.tier === 8) { txt(`Só a partir do nível ${GRAY_LEVEL}${player.level >= GRAY_LEVEL ? " (liberada)" : ` · você está no ${player.level}`}`, lx, y, 12, player.level >= GRAY_LEVEL ? "#8fd08a" : "#ff8a6a", "left", true); y += 18; }
    const dist = Math.abs(sel.cx - here.cx) + Math.abs(sel.cy - here.cy);
    txt(sel === here ? "Você está aqui" : `A ${dist} ${dist > 1 ? "áreas" : "área"} de você`, lx, y, 12, "#ffd96a", "left", true); y += 24;
    txt("Criaturas", lx, y, 14, "#e5e0c8", "left", true); y += 18;
    const types = Object.keys(ZTYPES).filter((t) => ZTYPES[t].from <= z0);
    types.forEach((t, i) => txt(`• ${ZTYPES[t].name}`, lx + (i % 3) * 126, y + Math.floor(i / 3) * 16, 12, "#a9a58f"));
    y += Math.ceil(types.length / 3) * 16 + 6;
    txt(`Zumbis com ${Math.round(RG.hp * 100)}% de vida e ${Math.round(RG.dmg * 100)}% de dano`, lx, y, 12, "#e07b5a", "left", true); y += 16;
    const EC = ECON[sel.tier];
    txt(`Economia: dinheiro do saque x${EC.cash} · $${EC.bounty} por abate · missões x${EC.reward}`, lx, y, 12, "#8fe08a", "left", true, 380); y += 24;
    txt("Raridade das armas encontradas", lx, y, 13, "#e5e0c8", "left", true); y += 8;
    const tot = RG.loot.reduce((a, b2) => a + b2, 0);
    RARITY.forEach((ra, i) => {
      const yy = y + i * 18, pc = RG.loot[i] / tot;
      txt(ra.name, lx, yy + 12, 11, ra.color, "left", true);
      ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(lx + 76, yy + 3, 220, 10);
      ctx.fillStyle = ra.color; ctx.fillRect(lx + 76, yy + 3, 220 * pc, 10);
      txt(`${Math.round(pc * 100)}%`, lx + 304, yy + 12, 11, "#c9c4ad");
    });
  }
  drawMapPlayers(gx, ly + 82);
  hint(canUseAdmin() ? "Clique numa área para teletransportar · clique num jogador para ir até ele ou banir · N, E ou Esc fecha"
                     : "Clique ou WASD/setas escolhem a área · C volta para onde você está · N, E ou Esc fecha");
  drawMapAsk();
}

// ---------- Mapa: jogadores online (rolagem com a roda do mouse) e ações do administrador ----------
const MAP_PL = { x: 34, y: 0, w: 470, h: 0, rowH: 19, scroll: 0 };
function mapPlayers() {
  const list = fmSocial.online().slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return [{ uid: null, name: save.name || "Você", cx: world.cell.cx, cy: world.cell.cy, inside: !!game.inside, me: true }, ...list];
}
function drawMapPlayers(x, y) {
  const list = mapPlayers(), P = MAP_PL;
  P.x = x; P.y = y + 8; P.h = H - 40 - P.y;
  txt(`JOGADORES ONLINE (${list.length})`, x, y, 12, "#73ceff", "left", true);
  ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(P.x, P.y, P.w, P.h, 5); ctx.fill();
  const vis = Math.max(1, Math.floor((P.h - 6) / P.rowH)), max = Math.max(0, list.length - vis);
  P.scroll = clamp(P.scroll, 0, max);
  ctx.save(); ctx.beginPath(); ctx.rect(P.x, P.y, P.w, P.h); ctx.clip();
  list.slice(P.scroll, P.scroll + vis).forEach((p, i) => {
    const ry = P.y + 3 + i * P.rowH;
    const hov = !p.me && canUseAdmin() && !game.mapAsk && mouse.x >= P.x && mouse.x <= P.x + P.w - 12 && mouse.y >= ry && mouse.y < ry + P.rowH;
    if (hov) { ctx.fillStyle = "rgba(115,206,255,0.14)"; ctx.fillRect(P.x + 2, ry, P.w - 14, P.rowH - 1); }
    const friend = !p.me && fmSocial.isFriend(p.uid), where = cellAt(p.cx, p.cy);
    txt(p.me ? `${p.name} (você)` : p.name, P.x + 10, ry + 14, 12, p.me ? "#ffd96a" : friend ? "#8fe0a8" : "#e5e0c8", "left", true, 200);
    txt(`${cellCode(p.cx, p.cy)}${where ? " · " + where.name : ""}${p.inside ? " · em prédio" : ""}`, P.x + 220, ry + 14, 11, "#a9a58f", "left", false, 230);
    if (!p.me && canUseAdmin()) regClick(P.x, ry, P.w - 12, P.rowH, () => { game.mapAsk = { kind: "player", p }; });
  });
  ctx.restore();
  if (max > 0) {                                        // barra de rolagem
    const th = Math.max(16, P.h * vis / list.length), ty = P.y + (P.h - th) * (P.scroll / max);
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(P.x + P.w - 8, P.y + 2, 5, P.h - 4);
    ctx.fillStyle = "#73ceff"; ctx.fillRect(P.x + P.w - 8, ty, 5, th);
  }
}
// roda do mouse em cima da lista: rola só a lista
function mapWheel(dy) {
  const P = MAP_PL;
  if (game.mapAsk || mouse.x < P.x || mouse.x > P.x + P.w || mouse.y < P.y || mouse.y > P.y + P.h) return;
  P.scroll += dy > 0 ? 1 : -1;
}
const BAN_DAYS = [[1, "1 dia"], [7, "7 dias"], [30, "30 dias"], [365, "1 ano"], [0, "Permanente"]];
// janelas do administrador por cima do mapa (teletransporte, jogador, confirmação do banimento)
function drawMapAsk() {
  const a = game.mapAsk;
  if (!a) return;
  if (!canUseAdmin()) { game.mapAsk = null; return; }
  ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
  regClick(0, 0, W, H, () => {});                       // nada atrás da janela recebe clique
  const box = (pw, ph, stroke) => {
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    ctx.fillStyle = "#1a1913"; rr(px, py, pw, ph, 10); ctx.fill(); ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
    return { px, py, pw, ph };
  };
  if (a.kind === "cell") {
    const c = cellAt(a.cx, a.cy), { px, py, pw, ph } = box(420, 150, "#d4af37");
    txt("Teletransportar?", W / 2, py + 36, 20, "#e5e0c8", "center", true);
    txt(`${cellCode(a.cx, a.cy)}${c ? " · " + c.name : ""}`, W / 2, py + 62, 14, "#ffd96a", "center", true, pw - 30);
    btn(px + 40, py + ph - 52, 150, 34, "Sim", () => { game.mapAsk = null; admTeleportCell(a.cx, a.cy); }, true);
    btn(px + pw - 190, py + ph - 52, 150, 34, "Não", () => { game.mapAsk = null; });
  } else if (a.kind === "player") {
    const p = a.p, { px, py, pw, ph } = box(560, 218, "#d4af37");
    txt(p.name, W / 2, py + 34, 20, "#e5e0c8", "center", true, pw - 30);
    txt(`Está em ${cellCode(p.cx, p.cy)}${p.inside ? " (dentro de prédio)" : ""}`, W / 2, py + 56, 12, "#a9a58f", "center");
    btn(px + 20, py + 70, pw - 40, 32, "Teletransportar até ele", () => { game.mapAsk = null; admTeleportPlayer(p); }, true);
    txt("Banir por:", px + 20, py + 128, 13, "#e05a4a", "left", true);
    const bw = (pw - 40 - 4 * 8) / 5;
    BAN_DAYS.forEach(([d, label], i) => btn(px + 20 + i * (bw + 8), py + 138, bw, 30, label, () => { game.mapAsk = { kind: "ban", p, d, label }; }));
    btn(px + pw / 2 - 75, py + ph - 42, 150, 30, "Cancelar", () => { game.mapAsk = null; });
  } else if (a.kind === "ban") {
    const { px, py, pw, ph } = box(460, 150, "#e05a4a");
    txt(`Banir ${a.p.name}?`, W / 2, py + 36, 20, "#e5e0c8", "center", true, pw - 30);
    txt(a.d ? `Por ${a.label}. Ele cai do jogo em até 1 minuto e não entra até lá.` : "Para sempre (até alguém desbanir no F2).",
      W / 2, py + 62, 12, "#a9a58f", "center", false, pw - 30);
    btn(px + 40, py + ph - 52, 160, 34, "Banir", () => { game.mapAsk = null; admBan(a.p, a.d, a.label); }, true);
    btn(px + pw - 200, py + ph - 52, 160, 34, "Cancelar", () => { game.mapAsk = null; });
  }
}
function admTeleportCell(cx, cy) {
  if (!canUseAdmin()) return;
  const c = cellAt(cx, cy);
  if (!c) { toast("Essa área não tem passagem"); return; }
  game.menu = null;
  if (game.inside) leaveHouse();
  gotoCell(c, { x: MID_X, y: MID_Y });
  toast(`Teletransportado para ${c.code}`);
}
function admTeleportPlayer(p) {
  if (!canUseAdmin()) return;
  const c = cellAt(p.cx, p.cy);
  if (!c) { toast("Não foi possível achar a área do jogador"); return; }
  game.menu = null;
  if (game.inside) leaveHouse();
  const m = /^house:(-?[\d.]+):(-?[\d.]+)/.exec(p.location || "");
  gotoCell(c, m ? (wd) => { const b = wd.buildings.find((b) => b.x === +m[1] && b.y === +m[2]); return b && b.door ? doorFront(b) : { x: MID_X, y: MID_Y }; }
                : { x: p.x, y: p.y + 30 });
  toast(m ? `${p.name} está dentro de um prédio: você ficou na porta` : `Teletransportado até ${p.name}`);
}
async function admBan(p, days, label) {
  if (!canUseAdmin()) return;
  try {
    await fmCloud.ban(p.uid, days);
    toast(`${p.name} banido (${label})`);
    game.admBans = null;
  } catch (err) { toast(err.message || "Não foi possível banir"); }
}
async function admLoadBans() {
  if (!canUseAdmin() || (game.admBans && game.admBans.busy)) return;
  game.admBans = { list: game.admBans ? game.admBans.list : [], busy: true, err: null };
  try { game.admBans.list = (await fmCloud.bannedList()) || []; }
  catch (err) { game.admBans.err = err.message || "Falha ao carregar"; }
  finally { game.admBans.busy = false; }
}
async function admUnban(b) {
  if (!canUseAdmin()) return;
  try { await fmCloud.unban(b.jogador); toast(`${b.nome} desbanido`); }
  catch (err) { toast(err.message || "Não foi possível desbanir"); }
  game.admBans = null; admLoadBans();
}

function drawAdmin() {
  if (!canUseAdmin()) { game.menu = null; game.input = null; return; }
  const rows = admRows();
  game.ac = Math.max(0, Math.min(rows.length - 1, game.ac));
  menuFrame("Painel de administrador");
  ADM_TABS.forEach((t, i) => {
    const w = Math.floor(888 / ADM_TABS.length), x = 36 + i * w;
    ctx.fillStyle = game.at === i ? "rgba(212,175,55,0.16)" : "rgba(0,0,0,0)";
    ctx.fillRect(x, 55, w, 34);
    txt(t, x + w / 2, 78, 14, game.at === i ? "#ffd96a" : "#a9a58f", "center", true);
    regClick(x, 55, w, 34, () => { game.at = i; game.ac = 0; game.input = null; });
  });
  ctx.fillStyle = "#3d3b30"; ctx.fillRect(40, 90, 880, 1);
  const vis = 14, off = Math.max(0, Math.min(rows.length - vis, game.ac - 6));
  rows.slice(off, off + vis).forEach((r, j) => {
    const y = 100 + j * 28, sel = off + j === game.ac, on = r.on ? r.on() : null;
    rowBox(60, y, 840, 25, sel);
    txt(r.label, 74, y + 17, 14, "#e5e0c8", "left", false, 560);
    txt(r.val(), 886, y + 17, 14, on === true ? "#6fae4f" : "#ffd96a", "right", true);
    regClick(60, y, 840, 25, () => { game.ac = off + j; r.act(1,"enter"); });
  });
  if (rows.length > vis) txt(`${game.ac + 1}/${rows.length} · use W/S para rolar`, W / 2, 506, 12, "#a9a58f", "center");
  hint("CLIQUE nas abas e opções · W/S seleciona · A/D muda valor · Enter confirma · F2/Esc fecha");
  if (game.msgT > 0) txt(game.msg, W / 2, 536, 16, "#ffd96a", "center", true);
  if (game.input && (game.input.mode === "adm" || game.input.mode === "admText")) {
    ctx.fillStyle = "rgba(0,0,0,0.96)"; rr(220, 200, 520, 170, 10); ctx.fill();
    ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2; ctx.stroke();
    txt(game.input.label, W / 2, 240, 20, "#e5e0c8", "center", true);
    txt(`${game.input.text || ""}${Math.floor(performance.now() / 500) % 2 ? "|" : ""}`, W / 2, 300, game.input.mode === "admText" ? 23 : 36, "#e5e0c8", "center", true, 490);
    txt(game.input.mode === "admText" ? "Digite o nome no jogo · Enter confirma · Esc cancela" : "Digite um número · Enter confirma · Esc cancela", W / 2, 345, 14, "#a9a58f", "center");
  }
}
