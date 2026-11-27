"use strict";
// =====================================================================
//  Menus: loja, baú, banco, VIP, clínica, atributos, missões, viagem,
//  mapa e painel de administrador (F2) — lógica e desenho.
// =====================================================================

// ---------- Teclas dentro dos menus ----------
function menuKey(k) {
  if (game.menu === "market" && game.marketBusy) return;
  if (game.input) { inputKey(k); return; }
  // Modais personalizados de esquemas capturam teclado antes do menu,
  // inclusive letras E/B que normalmente fechariam a Clínica.
  if (game.menu === "clinic" && game.implantNameDraft != null) { clinicPresetNameKey(k); return; }
  if (game.menu === "clinic" && game.implantPresetDelete) { clinicPresetDeleteKey(k); return; }
  if (game.menu === "clinic" && game.implantDropdown && k === "escape") { game.implantDropdown = false; return; }
  // Bloqueia fechar a Clínica sem resolver a confirmação de venda/descarte.
  if (game.menu === "clinic" && game.implantConfirm) { clinicConfirmKey(k); return; }
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
    else if (k === "c") fmPagamento.open();   // créditos só com dinheiro real (o Banco não troca mais dinheiro do jogo por créditos)
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
  } else if (inp.mode === "adm" && k === "-" && !inp.text) inp.text = "-";
  else if (/^[0-9]$/.test(k) && inp.text.length < 9) inp.text += k;
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
// desativado: créditos não são mais trocados por dinheiro do jogo (só comprados com dinheiro real)
function buyCredits(n) {
  toast("Créditos agora só pela loja Compre Créditos (Pix ou cartão)."); game.input = null; return;
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
  else if (k === "backspace" || k === "x" || k === "-") subPoint(k === "x" ? 5 : 1);
  else if (k === "f") confirmStats();
  else if (k === "z") revertStats();
}
// Distribuição com confirmação: os pontos colocados nesta visita à tela ficam "pendentes" e podem
// ser tirados com o botão −. Só depois de Confirmar eles ficam fixos (não dá para tirar o que já foi
// confirmado; para isso existe o reset). Fechar a tela sem confirmar devolve os pontos pendentes.
function statsBase() { if (!game.statBase) game.statBase = Object.assign({}, player.attrs); return game.statBase; }
function statsPending() { const b = statsBase(); return ATTRS.some((a) => (player.attrs[a.id] || 0) !== (b[a.id] || 0)); }
function subPoint(n, id) {
  const d = ATTRS.find((a) => a.id === (id || STATS_ORDER[game.cur] || STATS_ORDER[0]));
  const weapon = WEAPON_SKILL_IDS.includes(d.id), pool = weapon ? "wpoints" : "points";
  const amt = Math.min(n, player.attrs[d.id] - (statsBase()[d.id] || 0));
  if (amt <= 0) { toast("Só dá para tirar pontos que ainda não foram confirmados"); return; }
  player.attrs[d.id] -= amt; player[pool] += amt;
  if (d.id === "endurance") { recalcImplants(); player.hp = Math.min(player.hp, player.maxHp); }
  syncChar();
}
function confirmStats() {
  if (!statsPending()) { toast("Nenhum ponto para confirmar"); return; }
  game.statBase = Object.assign({}, player.attrs);
  syncChar(); persist();
  if (typeof checkpoint === "function") checkpoint("atributos confirmados");
  sfx.level && sfx.level();
  toast("Pontos confirmados!");
}
// devolve tudo o que foi colocado e não confirmado
function revertStats(silent) {
  const b = game.statBase;
  if (!b) return;
  let any = false;
  for (const a of ATTRS) {
    const diff = (player.attrs[a.id] || 0) - (b[a.id] || 0);
    if (diff > 0) { player.attrs[a.id] -= diff; player[WEAPON_SKILL_IDS.includes(a.id) ? "wpoints" : "points"] += diff; any = true; }
  }
  if (any) { recalcImplants(); player.hp = Math.min(player.hp, player.maxHp); syncChar(); if (!silent) toast("Pontos não confirmados foram devolvidos"); }
}
// chamado a cada quadro: saiu da tela de atributos sem confirmar → devolve os pendentes
function statsWatch() {
  if (game.menu === "stats" || !game.statBase) return;
  revertStats(false);
  game.statBase = null;
}
function addPoint(n, id) {
  if (!atBase()) { toast("Só dá para mudar atributos dentro da base"); return; }
  statsBase();
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
    case "natal": return `Missão de Natal: elimine ${NATAL_MISSAO.kills} zumbis e saqueie ${NATAL_MISSAO.searches} pontos de loot`;
    case "rescue": return m.progress >= m.target ? `Sobrevivente de ${m.code} resgatado` : game.escort ? "Leve o sobrevivente a um posto seguro" : `Resgate o sobrevivente em ${m.code} (num prédio marcado SOS)`;
    default: return `Chegue a uma área de perigo ${m.target} (${REGIONS[regionOf(m.target)].name})`;
  }
}
// Missão de Natal (uma vez por conta): recompensa Pistola Natalina (não vende no Mercado Negro).
// Não ocupa uma das 3 vagas de missões comuns.
const NATAL_MISSAO = { kills: 150, searches: 200 };
function natalOffer() { return { type: "natal", target: 2, progress: 0, k: 0, s: 0, money: 0, xp: 0 }; }
function natalDisponivel() { return !save.natalFeita && !save.missions.some((m) => m.type === "natal"); }
function makeOffers() {
  const L = player.level, cats = Object.keys(CATNAME), offers = [];
  const mk = (type, target, f, extra) => offers.push(Object.assign({ type, target, progress: 0, money: Math.round((300 + 120 * L) * f * econ(game.best).reward), xp: Math.round(baseXpNeed(L) * 0.6 * f) }, extra || {}));
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
    if (m.type === "natal" && (type === "kill" || type === "search") && m.progress < m.target) {
      if (type === "kill") m.k = Math.min(NATAL_MISSAO.kills, (m.k || 0) + n);
      else m.s = Math.min(NATAL_MISSAO.searches, (m.s || 0) + n);
      m.progress = (m.k >= NATAL_MISSAO.kills ? 1 : 0) + (m.s >= NATAL_MISSAO.searches ? 1 : 0);
      changed = true;
      if (m.progress >= m.target) toast("Missão de Natal concluída! Entregue no quadro de missões de um posto.");
      continue;
    }
    if (m.type !== type || m.progress >= m.target) continue;
    if ((type === "killcat" || type === "killtype") && m.cat !== cat) continue;
    m.progress = Math.min(m.target, type === "area" ? Math.max(m.progress, n) : m.progress + n);
    changed = true;
    if (m.progress >= m.target) toast(`Missão concluída: ${missionText(m)} (entregue num posto)`);
  }
  if (changed) persist();
}
function missionItems() {
  if (game.atBase && natalDisponivel() && !(game.natalOferta && game.board.includes(game.natalOferta))) game.board.unshift(game.natalOferta = natalOffer());
  if (!natalDisponivel() && game.natalOferta && game.board.includes(game.natalOferta)) game.board.splice(game.board.indexOf(game.natalOferta), 1);
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
    if (it.m.type !== "natal" && save.missions.filter((m) => m.type !== "natal").length >= 3) { toast("Máximo de 3 missões ativas"); return; }
    game.board.splice(game.board.indexOf(it.m), 1);
    if (it.m.type === "area") it.m.progress = Math.min(it.m.target, game.best);
    save.missions.push(it.m); persist(); toast("Missão aceita");
  } else if (it.m.progress >= it.m.target) {
    if (!game.atBase) { toast("Entregue no quadro de missões de um posto"); return; }
    if (it.m.type === "natal") {
      const inst = newInst("pistola_natal");
      inst.missao = true;
      const onde = addWeapon(inst);
      if (!onde) { toast("Abra espaço na mochila para receber a Pistola Natalina."); return; }
      save.missions.splice(save.missions.indexOf(it.m), 1);
      save.natalFeita = true;
      registerWeapon("pistola_natal");
      game.banner = { text: "Pistola Natalina recebida!", sub: "45 de dano · sem requisitos · não vende no Mercado Negro", t: 4200, gold: true };
      sfx.level(); persist(); checkpoint("missão de Natal");
      game.cur = Math.max(0, Math.min(game.cur, missionItems().length - 1));
      return;
    }
    save.missions.splice(save.missions.indexOf(it.m), 1);
    game.money += it.m.money; logMoney("Missão", it.m.type, it.m.money); gainXp(it.m.xp); sfx.buy();
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
  if (k === "tab") { game.tab ^= 1; game.cur = 0; game.implantDropdown = false; return; }
  const len = game.tab === 0 ? clinicItems().length : game.stock.length;
  if (k === "w" || k === "arrowup") game.cur = Math.max(0, game.cur - 1);
  else if (k === "s" || k === "arrowdown") game.cur = Math.max(0, Math.min(len - 1, game.cur + 1));
  else if (k === "enter") clinicAct();
  else if (k === "v" && game.tab === 0) sellImplant();
  else if (k === "x" && game.tab === 0) discardImplant();
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
    if (!fmGifts.ready(it.im, () => { if (clinicItems()[game.cur]?.im === it.im) clinicAct(); })) return;
    player.bag.splice(player.bag.indexOf(it.im), 1); save.installed.push(it.im);
    toast(`Instalou ${implantName(it.im)}`);
  } else {
    if (player.bag.length >= BAG_MAX) { toast("Mochila de implantes cheia"); return; }
    save.installed.splice(save.installed.indexOf(it.im), 1); player.bag.push(it.im);
    toast(`Removeu ${implantName(it.im)} (volta para a mochila)`);
  }
  game.implantPresetSelected = null;
  recalcImplants();
  // Instalações alteram o perfil e a mochila da partida: salvar os dois juntos.
  checkpoint("alterou implantes instalados");
  game.cur = Math.max(0, Math.min(game.cur, clinicItems().length - 1));
}
// muda a ordem dos instalados (o Mímico copia quem está à esquerda dele)
function shiftImplant(dir) {
  const it = clinicItems()[game.cur];
  if (!it || it.src !== "inst") { toast("Selecione um implante instalado"); return; }
  const a = save.installed.indexOf(it.im), b = a + dir;
  if (b < 0 || b >= save.installed.length) return;
  save.installed[a] = save.installed[b]; save.installed[b] = it.im;
  game.cur = player.bag.length + b;
  game.implantPresetSelected = null;
  recalcImplants();
  checkpoint("reordenou implantes");
}
function buyImplant(i) {
  const st = game.stock[i];
  if (!st) return;
  if (player.bag.length >= BAG_MAX) { toast("Mochila de implantes cheia"); return; }
  if (save.credits < st.price) { toast(`Precisa de ${st.price} créditos (compre em $ Compre Créditos)`); return; }
  save.credits -= st.price; sfx.buy();
  const im = newImplant(st.id);
  player.bag.push(im); persist();
  toast(`Comprou ${implantName(im)}`);
}
// A venda e o descarte afetam somente os implantes na mochila.
// Os instalados precisam ser retirados antes, para evitar perda acidental.
function confirmClinicImplant(action) {
  if (game.tab !== 0) return;
  const selected = clinicItems()[game.cur];
  if (!selected || selected.src !== "bag") {
    toast("Remova o implante instalado antes de vender ou descartar.");
    return;
  }
  if (selected.im.tokenBound || (action === "sell" && selected.im.validadeDias)) {
    toast("Este implante é intransferível e não pode ser vendido nem descartado.");
    return;
  }
  game.implantConfirm = { action, im: selected.im };
}
function sellImplant() { confirmClinicImplant("sell"); }
function discardImplant() { confirmClinicImplant("discard"); }
function clinicConfirmKey(k) {
  if (k === "escape" || k === "n" || k === "e") { game.implantConfirm = null; return; }
  if (k === "enter" || k === "y" || k === "s") applyClinicImplantConfirm();
}
function applyClinicImplantConfirm() {
  const pending = game.implantConfirm;
  if (!pending) return;
  game.implantConfirm = null;
  const i = player.bag.indexOf(pending.im);
  if (i < 0 || !IMP[pending.im.id] || pending.im.tokenBound || (pending.action === "sell" && pending.im.validadeDias)) {
    toast("Implante não disponível para essa operação.");
    return;
  }
  const name = implantName(pending.im);
  player.bag.splice(i, 1);
  if (pending.action === "sell") {
    const price = implantSellPrice(pending.im);
    game.money += price; logMoney("Implante vendido", name, price);
    sfx.buy();
    toast(`Vendeu ${name} por $${price.toLocaleString("pt-BR")}`);
  } else if (pending.action === "discard") {
    sfx.empty();
    toast(`Descartou ${name} sem receber dinheiro.`);
  } else return;
  game.cur = Math.max(0, Math.min(game.cur, clinicItems().length - 1));
  // O dinheiro e a mochila fazem parte da partida: persist() sozinho salva
  // só o perfil, por isso é necessário gravar também o checkpoint completo.
  checkpoint(pending.action === "sell" ? "venda de implante" : "descarte de implante");
}


// Loja do refúgio: 29 implantes novos (preço individual em créditos) e
// Trindade consumível (dinheiro do jogo, não é implante).
const TRINDADE_PRICE = 20000000;
function buyTrindade() {
  if (!inSafe()) { toast("Compre a Trindade na base."); return; }
  if (game.money < TRINDADE_PRICE) { toast("É preciso $20.000.000."); return; }
  if (!addMat("trindade_eterna", 1)) { toast("Mochila cheia."); return; }
  game.money -= TRINDADE_PRICE; logMoney("Compra", "Trindade", -TRINDADE_PRICE);
  sfx.buy(); checkpoint("compra de Trindade");
  toast("Trindade adquirida! Arraste-a sobre o personagem para consumir.");
}
// armas iniciais vendidas por dinheiro da mochila (Pistola 9mm e Escopeta)
function buyShopWeapon(id) {
  const d = WDEF[id];
  if (!d || !d.shop) return;
  if (!atBase()) { toast("Compre armas na Loja da base."); return; }
  if (game.money < d.shop) { toast(`Precisa de $${d.shop.toLocaleString("pt-BR")} na mochila`); return; }
  if (player.slots.indexOf(null) < 0 && packUsed() >= packCapacity()) { toast("Mochila cheia"); return; }
  game.money -= d.shop; logMoney("Loja", d.name, -d.shop);
  addWeapon(newInst(id)); registerWeapon(id);
  checkpoint("compra de arma na loja"); sfx.buy();
  game.banner = { text: `${d.name} comprada!`, sub: "Abra a mochila (B) para equipar", t: 2600, gold: true };
}
// armas vendidas por créditos (Shotgun Sweet, evento de Natal)
function buyCreditWeapon(id) {
  const d = WDEF[id];
  if (d && !d.credits && d.shop) { buyShopWeapon(id); return; }
  if (!d || !d.credits) return;
  if (!atBase()) { toast("Use a Loja de Créditos na base."); return; }
  if (save.credits < d.credits) { toast(`Precisa de ${d.credits.toLocaleString("pt-BR")} créditos (compre em $ Compre Créditos)`); return; }
  if (player.slots.indexOf(null) < 0 && packUsed() >= packCapacity()) { toast("Mochila cheia"); return; }
  save.credits -= d.credits;
  addWeapon(newInst(id)); registerWeapon(id);
  persist(); checkpoint("compra de arma por créditos"); sfx.level();
  game.banner = { text: `${d.name} comprada!`, sub: "Abra a mochila (B) para equipar", t: 2600, gold: true };
}
function fmOwnsCreditImplant(id) {
  return (
    player.bag.some((im) => im.id === id) ||
    save.installed.some((im) => im.id === id) ||
    save.vault.some((item) => item?.kind === "implant" && item.id === id)
  );
}
function fmCreditImplantPrice(id) {
  const def = IMP[id];
  return vipActive() && def.vipPrice ? def.vipPrice : def.price;
}
function fmOpenAdvancedImplantCase(item) {
  const index = player.pack.indexOf(item);
  if (index < 0 || item.kind !== "mat" || item.id !== FM_ADVANCED_CASE_ID || item.qty < 1) return;
  if (player.bag.length >= BAG_MAX) {
    toast("Libere espaço para receber o implante.");
    return;
  }
  const pool = IMP_IDS.filter((id) => IMP[id].kind === 2 && !IMP[id].mimic && !IMP[id].event && !IMP[id].tier);
  const im = newImplant(pick(pool));
  if (--item.qty === 0) player.pack.splice(index, 1);
  player.bag.push(im);
  checkpoint("abriu uma Caixa Avançada de Implante");
  toast("Implante obtido: " + implantName(im));
}
function buyCreditImplant(id) {
  const def = IMP[id];
  if (!def || !inSafe()) {
    toast("Implante indisponível.");
    return;
  }
  if (player.bag.length >= BAG_MAX) {
    toast("Libere espaço para receber o implante.");
    return;
  }
  if (!def.tier && fmOwnsCreditImplant(id)) {
    toast("Você já possui este implante.");
    return;
  }
  const price = fmCreditImplantPrice(id);
  if (save.credits < price) {
    toast("Créditos insuficientes. Necessário: " + price);
    return;
  }
  if (id === FM_MIMIC_ID && !addMat(FM_ADVANCED_CASE_ID, 2)) {
    toast("Libere um espaço de carga para as caixas do Kit Mimic.");
    return;
  }
  save.credits -= price;
  player.bag.push(newImplant(id));
  sfx.buy();
  checkpoint("compra de implante");
  toast(
    id === FM_MIMIC_ID
      ? "Kit Mimic adquirido. Você recebeu o implante e 2 caixas."
      : "Comprou " + def.name + " por " + price + " créditos.",
  );
}
function creditShopBuy(id) {
  if (id === "trindade_eterna") buyTrindade();
  else if (MATS[id]?.blueprint) {
    if (!atBase()) return;
    const cost = MATS[id].credits;
    if (save.credits < cost) { toast("Créditos insuficientes"); return; }
    if (!addMat(id, 1)) { toast("Mochila cheia"); return; }
    save.credits -= cost; persist(); checkpoint("compra de blueprint"); toast("Blueprint adquirido!");
  } else if (IMP[id]) buyCreditImplant(id);
}
const CREDIT_SHOP_SCENE = new Image();
CREDIT_SHOP_SCENE.src = "img/fm_loja_creditos.webp";
const CREDIT_SHOP_SECTIONS = [
  ["special", "Serviços"],
  ["implant", "Implantes"],
  ["vest", "Coletes"],
  ["clothing", "Vestuário"],
  ["ammo", "Munição"],
  ["explosive", "Explosivos"],
  ["melee", "Corpo a corpo"],
  ["pistols", "Pistolas"],
  ["rifles", "Rifles"],
  ["shotguns", "Escopetas"],
  ["machinegun", "Metralhadoras"],
  ["blueprints", "Blueprints"],
];
const CREDIT_SHOP_PAGE_SIZE = 5;
function openCreditShop() {
  game.menu = "creditshop";
  game.input = null;
  game.cur = 0;
  game.creditConfirm = null;
  creditShopSelectSection("special");
}
function creditShopSelectSection(section) {
  game.creditSection = section;
  game.creditCur = 0;
}
function creditShopRows(section) {
  if (section === "blueprints") return Object.keys(MATS).filter(id => MATS[id].blueprint).map(id => ({kind:"mat",id,title:MATS[id].name,price:MATS[id].credits,currency:"credits"}));
  if (section === "implant")
    // do mais fraco (mais barato) para o mais forte; o Kit Mimic fica no fim
    return IMP_IDS.filter((id) => !IMP[id].craftOnly && (IMP[id].price > 0 || IMP[id].kitOnly))
      .sort((a, b) => !!IMP[a].kitOnly - !!IMP[b].kitOnly || IMP[a].price - IMP[b].price).map((id) => ({
      kind: "implant",
      id,
      title: id === FM_MIMIC_ID ? "Kit Mimic" : IMP[id].name,
      owned: !IMP[id].tier && fmOwnsCreditImplant(id),   // tier 2 pode comprar vários (3 fazem um X na Oficina)
      price: fmCreditImplantPrice(id),
      currency: "credits",
    }));
  if (section === "vest")
    return VESTS.map((vest, id) => ({
      kind: "vest",
      id,
      title: vest.name,
      owned: !!save.vestsOwned[id],
      price: vest.craft ? null : vestCredits(vest) || vest.price,
      currency: vest.credits ? "credits" : "money",
    }));
  if (section === "ammo")
    return Object.keys(AMMO).map((id, index) => ({
      kind: "ammo",
      id,
      index,
      title: id === "virote" ? "Flechas" : id,
      price: shopFree() ? 0 : ammoPackPrice(id),
      currency: "money",
    }));
  if (section === "clothing")
    // capa e máscaras (à venda) primeiro; as outras roupas o personagem já tem
    return CLOTHING_ITEMS.slice()
      .sort((a, b) => !!CREDIT_CLOTHING[b.id] - !!CREDIT_CLOTHING[a.id])
      .map((item) => CREDIT_CLOTHING[item.id]
        ? { kind: "clothing", item, title: item.name, owned: clothingOwned(item.id), equipped: save.clothing[item.kind] === item.id, price: CREDIT_CLOTHING[item.id], currency: "credits" }
        : { kind: "clothing", item, title: item.name, owned: save.clothing[item.kind] === item.id });
  return WLIST.filter(
    (item) => !item.fists && (section === "explosive" ? item.grenade : item.cat === section && !item.grenade),
  ).map((item) => (item.credits
    ? { kind: "weapon", item, title: item.name, price: item.credits, currency: "credits" }
    : item.shop
    ? { kind: "weapon", item, title: item.name, price: item.shop, currency: "money" }
    : { kind: "weapon", item, title: item.name }));
}
function creditShopCost(row) {
  if (row.kind === "vest" && row.owned) return "Já possui";
  if (row.kind === "implant" && row.owned) return "Já possui";
  if (row.kind === "clothing" && row.price) return row.owned ? (row.equipped ? "Em uso" : "Já possui") : row.price.toLocaleString("pt-BR") + " cr";
  if (row.kind === "clothing") return row.owned ? "Em uso" : "Vestuário";
  if (row.kind === "weapon" && row.price && row.currency === "money") return "$" + row.price.toLocaleString("pt-BR");
  if (row.kind === "weapon" && row.price) return row.price.toLocaleString("pt-BR") + " cr";
  if (row.kind === "weapon") return RARITY[row.item.rar].name;
  if (row.kind === "vest" && row.price == null) return "Oficina";
  if (row.price === 0) return "Grátis";
  return row.currency === "credits" ? row.price.toLocaleString("pt-BR") + " cr" : bankMoney(row.price);
}
function creditShopCanBuy(row) {
  return Boolean(row && row.price != null && !row.owned);
}
function creditShopConfirm() {
  const row = game.creditConfirm;
  game.creditConfirm = null;
  if (!row) return;
  if (!atBase()) {
    toast("Use a Loja de Créditos na base.");
    return;
  }
  switch (row.kind) {
    case "vip":
      buyGM();
      break;
    case "reset":
      resetStatsWithCredits();
      break;
    case "mat":
    case "implant":
      creditShopBuy(row.id);
      break;
    case "clothing":
      buyCreditClothing(row.item.id);
      break;
    case "weapon":
      buyCreditWeapon(row.item.id);
      break;
    case "vest":
      if (save.vestsOwned[row.id]) return;
      buyVest(row.id);
      if (save.vestsOwned[row.id]) checkpoint("compra de colete");
      break;
    case "ammo":
      if (!inSafe()) {
        toast("A loja de munições fica na base.");
        return;
      }
      game.shopCur = row.index;
      shopBuy();
      break;
  }
}
function creditShopKey(key) {
  if (game.creditConfirm) {
    if (key === "escape" || key === "n") game.creditConfirm = null;
    else if (key === "enter" || key === "y") creditShopConfirm();
    return;
  }
  if (key === "escape" || key === "e" || key === "b") {
    game.menu = null;
    return;
  }
  const section = game.creditSection || "special";
  const active = CREDIT_SHOP_SECTIONS.findIndex(([id]) => id === section);
  if (key === "tab" || key === "arrowright" || key === "d" || key === "arrowleft" || key === "a") {
    const direction = key === "arrowleft" || key === "a" ? -1 : 1;
    const next = (active + direction + CREDIT_SHOP_SECTIONS.length) % CREDIT_SHOP_SECTIONS.length;
    creditShopSelectSection(CREDIT_SHOP_SECTIONS[next][0]);
    return;
  }
  if (section === "special") return;
  const rows = creditShopRows(section);
  if (key === "enter") {
    const row = rows[game.creditCur];
    if (creditShopCanBuy(row)) game.creditConfirm = row;
    return;
  }
  const movement = {
    w: -1,
    arrowup: -1,
    s: 1,
    arrowdown: 1,
    pageup: -CREDIT_SHOP_PAGE_SIZE,
    pagedown: CREDIT_SHOP_PAGE_SIZE,
  };
  if (movement[key]) game.creditCur = Math.max(0, Math.min(rows.length - 1, game.creditCur + movement[key]));
}
function creditShopPanel(x, y, w, h, fill, border) {
  ctx.fillStyle = fill;
  rr(x, y, w, h, 4);
  ctx.fill();
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.stroke();
}
function creditShopButton(x, y, w, h, title, action, active = false, disabled = false) {
  const hover = !disabled && mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
  creditShopPanel(
    x,
    y,
    w,
    h,
    disabled ? "#1a1917" : active ? (hover ? "#a34737" : "#80352d") : hover ? "#3a2a24" : "#26221e",
    disabled ? "#383530" : active ? "#cf7461" : hover ? "#b48064" : "#5a4940",
  );
  txt(title, x + w / 2, y + h / 2 + 4, 13, disabled ? "#9d948a" : "#f5e7d5", "center", true, w - 12);
  if (!disabled) regClick(x, y, w, h, action);
}
function creditShopArt(row, x, y, scale) {
  switch (row.kind) {
    case "mat":
      drawMatIcon(row.id, x, y, scale);
      break;
    case "implant":
      drawEntryIcon({ type: "implant", im: { id: row.id } }, x, y, scale);
      break;
    case "vest":
      drawVestIcon(row.id, x, y, scale);
      break;
    case "ammo":
      drawEntryIcon({ type: "ammo", ammo: row.id }, x, y, scale);
      break;
    case "clothing":
      drawClothingIcon(row.item, x - 28 * scale, y - 28 * scale, 56 * scale, 56 * scale);
      break;
    case "weapon":
      if (!drawVingadorMenuArt(row.item, x, y, 128 * scale)) drawWeaponSide(row.item, x, y, scale);
      break;
  }
}
function drawCreditShopSidebar() {
  creditShopPanel(24, 112, 206, 410, "rgba(14,14,13,.94)", "#57473e");
  txt("CONTA", 42, 144, 14, "#ce8b74", "left", true);
  const shortcuts = [
    [
      "Assinatura VIP",
      "1 mês · " + GM_COST + " créditos",
      () => {
        if (save.gm) {
          toast("Seu VIP é permanente.");
          return;
        }
        game.creditConfirm = { kind: "vip", title: "Assinatura VIP · 1 mês", price: GM_COST, currency: "credits" };
      },
    ],
    [
      "Compre Créditos",
      "Pix ou cartão · promoção 40%",
      () => fmPagamento.open(),
    ],
    [
      "Baú da Base",
      "Gerenciar itens guardados",
      () => {
        if (!atBase()) {
          toast("O baú fica na base.");
          return;
        }
        game.menu = "stash";
        game.vside = 0;
        game.vcur = 0;
        game.fmVaultSelection = null;
      },
    ],
  ];
  shortcuts.forEach(([title, detail, action], i) => {
    const y = 161 + i * 65;
    const hover = mouse.x >= 38 && mouse.x <= 216 && mouse.y >= y && mouse.y <= y + 57;
    creditShopPanel(38, y, 178, 57, hover ? "#362622" : "#211c19", hover ? "#bf7e68" : "#4e3a31");
    ctx.fillStyle = hover ? "#d78069" : "#a95042";
    ctx.fillRect(38, y, 3, 57);
    txt(title, 49, y + 23, 14, "#f5e7d5", "left", true);
    txt(detail, 49, y + 42, 11, "#c4b5a4", "left", false, 152);
    txt("›", 206, y + 25, 18, "#df8a73", "right", true);
    regClick(38, y, 178, 57, action);
  });
  ctx.fillStyle = "#4e3a31";
  ctx.fillRect(42, 370, 170, 1);
  txt("SALDO NO BANCO", 42, 395, 11, "#bdab9a", "left", true);
  txt(bankMoney(save.bank), 42, 421, 21, "#f5e7d5", "left", true);
  txt("VIP", 42, 459, 11, "#bdab9a", "left", true);
  txt(vipStatus(), 42, 480, 13, "#e6b37b", "left", false, 170);
}
function creditShopSample(section) {
  if (section === "blueprints") return {kind:"mat",id:"blueprint_sniper"};
  if (section === "special") return { kind: "mat", id: "reset_stats" };
  if (section === "implant") return { kind: "implant", id: FM_MIMIC_ID };
  if (section === "vest") return { kind: "vest", id: 1 };
  if (section === "clothing") return { kind: "clothing", item: CLOTHING_ITEMS[0] };
  if (section === "ammo") return { kind: "ammo", id: "5.56" };
  const item = WLIST.find(
    (weapon) =>
      !weapon.fists && (section === "explosive" ? weapon.grenade : weapon.cat === section && !weapon.grenade),
  );
  return item ? { kind: "weapon", item } : null;
}
function drawCreditShopSections(section) {
  CREDIT_SHOP_SECTIONS.forEach(([id, title], index) => {
    const row = Math.floor(index / 6);
    const x = 246 + (index % 6) * 115,
      y = 112 + row * 63;
    const w = 108,
      h = 55;
    const selected = id === section;
    const hover = mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h;
    creditShopPanel(
      x,
      y,
      w,
      h,
      selected ? "#41251f" : hover ? "#332722" : "rgba(25,22,20,.93)",
      selected ? "#cd715f" : hover ? "#a97563" : "#57473e",
    );
    const sample = creditShopSample(id);
    if (sample) creditShopArt(sample, x + w / 2, y + 20, sample.kind === "weapon" ? 0.61 : 0.52);
    txt(title, x + w / 2, y + 46, 12, selected ? "#ffe1cd" : "#e9d9c6", "center", true, w - 8);
    if (selected) {
      ctx.fillStyle = "#c86a57";
      ctx.fillRect(x + 1, y + h - 2, w - 2, 2);
    }
    regClick(x, y, w, h, () => creditShopSelectSection(id));
  });
}
function drawCreditShopServices() {
  creditShopPanel(246, 254, 357, 268, "rgba(20,17,15,.97)", "#635046");
  txt("Reset de atributos", 262, 282, 19, "#f5e7d5", "left", true);
  txt("Redistribua atributos e proficiências.", 262, 302, 12, "#c4b5a4");
  const groups = [
    ["ATRIBUTOS", ATTRS.filter((attr) => !PROF_IDS.includes(attr.id))],
    ["PROFICIÊNCIAS", ATTRS.filter((attr) => PROF_IDS.includes(attr.id))],
  ];
  const labels = { endurance: "Vida", acc: "Precisão", crit: "Crítico", reload: "Recarga", silence: "Silêncio" };
  groups.forEach(([title, attrs], i) => {
    const x = 262 + i * 171;
    txt(title, x, 324, 10, "#d18b75", "left", true);
    attrs.forEach((attr, n) => {
      const y = 341 + n * 14;
      txt(PROF_NAMES[attr.id] || labels[attr.id] || attr.name, x, y, 11, "#e5d9ca", "left", false, 123);
      txt(String(player.attrs[attr.id]), x + 145, y, 11, "#efb484", "right", true);
    });
  });
  creditShopButton(
    262,
    481,
    324,
    29,
    "Resetar · " + resetStatsLabel(),
    () => {
      game.creditConfirm = {
        kind: "reset",
        title: "Reset de atributos",
        price: resetStatsCost(),
        currency: "credits",
      };
    },
    true,
  );

  creditShopPanel(616, 254, 313, 268, "rgba(20,17,15,.95)", "#635046");
  txt("Trindade", 632, 282, 19, "#f5e7d5", "left", true);
  creditShopArt({ kind: "mat", id: "trindade_eterna" }, 773, 355, 2.0);
  txtWrap(
    "+35% de dano, velocidade de corrida e proteção proporcional aos atributos. Dura 100 anos após o uso.",
    632,
    422,
    12,
    "#decebc",
    281,
    16,
    3,
  );
  creditShopButton(
    632,
    481,
    281,
    29,
    "Comprar · " + bankMoney(TRINDADE_PRICE),
    () => {
      game.creditConfirm = {
        kind: "mat",
        id: "trindade_eterna",
        title: "Trindade",
        price: TRINDADE_PRICE,
        currency: "money",
      };
    },
    true,
  );
}
function creditShopDescription(row) {
  if (row.kind === "mat" && MATS[row.id]?.blueprint) return "Lendário · Consumido na Oficina. Drop comum a partir da região vermelha. Negociável no Mercado Negro.";
  switch (row.kind) {
    case "implant": {
      const description = implantDesc({ id: row.id, alloc: {} });
      return row.id === FM_MIMIC_ID ? description + " O kit inclui 2 Caixas Avançadas de Implante." : description;
    }
    case "vest":
      return vestText(VESTS[row.id]) + (VESTS[row.id].craft ? " · Fabricação na Oficina." : ".");
    case "ammo":
      return (
        "Pacote com " +
        AMMO_PACK_SIZE +
        " unidades. Você tem " +
        (player.reserve[row.id] || 0).toLocaleString("pt-BR") +
        "."
      );
    case "clothing": {
      const item = row.item;
      return item.kind === "pack"
        ? "+" + item.slots + " espaços · -" + item.speedPenalty + "% de velocidade · Nível " + item.level
        : item.setName + " · " + CLOTHING_LABELS[item.kind];
    }
    case "weapon":
      return (
        "Dano base " +
        row.item.dmg +
        " · " +
        reqText(row.item) +
        (row.item.craftOnly ? " · Fabricação na Oficina." : ".")
      );
  }
}
const FM_VINGADOR_CREDIT_ART = new Image();
FM_VINGADOR_CREDIT_ART.src = "img/weapons/w_fm_vingador_creditos.webp?v=2";
function drawCreditShopCatalog(section) {
  const rows = creditShopRows(section);
  creditShopPanel(246, 254, 357, 268, "rgba(20,17,15,.97)", "#635046");
  creditShopPanel(616, 254, 313, 268, "rgba(20,17,15,.95)", "#635046");
  if (!rows.length) {
    txt("Nenhum item nesta categoria.", 263, 284, 14, "#ead5c0");
    return;
  }
  const visible = CREDIT_SHOP_PAGE_SIZE;
  game.creditCur = Math.max(0, Math.min(rows.length - 1, game.creditCur | 0));
  const top = Math.floor(game.creditCur / visible) * visible;
  const selected = rows[game.creditCur];
  rows.slice(top, top + visible).forEach((row, index) => {
    const y = 266 + index * 41;
    const chosen = index + top === game.creditCur;
    creditShopPanel(257, y, 335, 37, chosen ? "#422821" : "#25201c", chosen ? "#ce735c" : "#45372f");
    creditShopArt(row, 285, y + 18, row.kind === "weapon" ? 0.38 : 0.45);
    txt(row.title, 311, y + 23, 12, chosen ? "#ffe4cd" : "#eee0d2", "left", true, 186);
    txt(creditShopCost(row), 584, y + 23, 11, row.owned ? "#b0c197" : "#e6b37b", "right", true, 80);
    regClick(257, y, 335, 37, () => {
      game.creditCur = top + index;
    });
  });
  creditShopButton(
    257,
    481,
    36,
    29,
    "‹",
    () => {
      game.creditCur = top - visible;
    },
    false,
    top === 0,
  );
  creditShopButton(
    556,
    481,
    36,
    29,
    "›",
    () => {
      game.creditCur = top + visible;
    },
    false,
    top + visible >= rows.length,
  );
  txt(
    Math.min(top + 1, rows.length) + "–" + Math.min(top + visible, rows.length) + " de " + rows.length,
    424,
    500,
    11,
    "#c4b5a4",
    "center",
  );
  txt(selected.title, 631, 282, 18, "#f5e7d5", "left", true, 282);
  if (selected.kind !== "weapon" || !drawVingadorMenuArt(selected.item, 774, 350, 280)) creditShopArt(selected, 774, 350, selected.kind === "weapon" ? 1.44 : 1.5);
  txtWrap(creditShopDescription(selected), 631, 417, 12, "#e3d3c3", 282, 15, 4);
  if (creditShopCanBuy(selected)) {
    creditShopButton(
      631,
      481,
      282,
      29,
      "Comprar · " + creditShopCost(selected),
      () => {
        game.creditConfirm = selected;
      },
      true,
    );
  } else if (selected.kind === "clothing") {
    creditShopButton(631, 481, 282, 29, "Abrir inventário", () => {
      game.menu = "pack";
    });
  } else if (selected.owned) {
    creditShopButton(631, 481, 282, 29, "Já possui", () => {}, false, true);
  }
}
function drawCreditShopDialog(title, detail, submit, cancel, amountLabel = "") {
  ctx.fillStyle = "rgba(6,5,5,.79)";
  ctx.fillRect(0, 0, W, H);
  regClick(0, 0, W, H, () => {});
  creditShopPanel(249, 177, 462, 239, "#211914", "#b56e57");
  txt(title, 480, 226, 22, "#f7e6d0", "center", true, 410);
  if (amountLabel) txt(amountLabel, 480, 278, 26, "#efb484", "center", true, 400);
  txt(detail, 480, amountLabel ? 314 : 275, 14, "#e4c7b3", "center", false, 430);
  creditShopButton(270, 358, 196, 34, "Confirmar", submit, true);
  creditShopButton(494, 358, 196, 34, "Cancelar", cancel);
}
function drawCreditShop() {
  const section = game.creditSection || "special";
  ctx.fillStyle = "#14110f";
  ctx.fillRect(0, 0, W, H);
  if (CREDIT_SHOP_SCENE.complete && CREDIT_SHOP_SCENE.naturalWidth) {
    ctx.drawImage(CREDIT_SHOP_SCENE, 0, 0, W, H);
  }
  const shade = ctx.createLinearGradient(0, 0, W, H);
  shade.addColorStop(0, "rgba(11,10,10,.81)");
  shade.addColorStop(0.65, "rgba(11,10,10,.52)");
  shade.addColorStop(1, "rgba(11,10,10,.73)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#786050";
  ctx.lineWidth = 1;
  ctx.strokeRect(11.5, 10.5, W - 23, H - 21);
  ctx.fillStyle = "#ae5341";
  ctx.fillRect(24, 91, 905, 2);
  txt("FRONTEIRA MORTA  /  SUPRIMENTOS", 25, 33, 11, "#e7ad91", "left", true);
  txt("Loja de Créditos", 24, 75, 37, "#f4e4ce", "left", true);
  txt("CRÉDITOS", 790, 40, 11, "#bca79a", "right", true);
  txt(save.credits.toLocaleString("pt-BR"), 791, 69, 24, "#efb484", "right", true);
  creditShopButton(809, 32, 120, 35, "Voltar", () => {
    game.menu = null;
  });
  drawCreditShopSidebar();
  drawCreditShopSections(section);
  txt(
    (CREDIT_SHOP_SECTIONS.find(([id]) => id === section) || CREDIT_SHOP_SECTIONS[0])[1].toUpperCase(),
    247,
    242,
    13,
    "#e2987f",
    "left",
    true,
  );
  if (section === "special") drawCreditShopServices();
  else drawCreditShopCatalog(section);
  const pending = game.creditConfirm;
  if (pending) {
    const amount =
      pending.currency === "credits"
        ? pending.price.toLocaleString("pt-BR") + " créditos"
        : creditShopCost(pending);
    drawCreditShopDialog(pending.title, amount, creditShopConfirm, () => {
      game.creditConfirm = null;
    });
  } else if (game.input?.mode === "credits") {
    const amount = Number(game.input.text || 0);
    drawCreditShopDialog(
      "Comprar créditos",
      "Custo " + bankMoney(amount * CREDIT_PRICE) + " · Banco " + bankMoney(save.bank),
      () => inputKey("enter"),
      () => {
        game.input = null;
      },
      amount ? amount.toLocaleString("pt-BR") : "Digite a quantidade",
    );
  } else hint("Tab troca categoria · ↑ ↓ ou roda selecionam · Enter compra · Esc volta");
}
// ---------- Viagem ----------
function travelKey(k) {
  if (k === "w" || k === "arrowup") game.cur = Math.max(0, game.cur - 1);
  else if (k === "s" || k === "arrowdown") game.cur = Math.min(OUTPOSTS.length - 1, game.cur + 1);
  else if (k === "enter") travelTo(game.cur);
}

// ---------- Painel de administrador (F2) ----------
const adm = { god: false, infAmmo: false, noReq: false, infStamina: false, freeze: false, dmg: 1, direct: false, shopAnywhere: false };
const ADM_TABS = ["Geral", "Personagem", "Dinheiro e itens", "Presentes", "Implantes", "Armas", "Banidos", "Bugs", "Dinheiro retido", "Recargas"];
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
  game.admRecargas = null;
  game.shop = false; game.input = null; game.menu = "admin";
  game.at = game.at || 0; game.ac = game.ac || 0;
  game.admGift = game.admGift || { name: "", type: "dinheiro", qty: 1000, itemIndex: 0, busy: false };
}
function admAsk(label, fn) { if (!canUseAdmin()) return; game.input = { mode: "adm", text: "", label, fn }; }
function admAskText(label, fn) { if (!canUseAdmin()) return; game.input = { mode: "admText", text: "", label, fn }; }
const ADM_GIFT_TYPES = ["dinheiro", "vip", "creditos", "arma", "implante", "colete", "roupa", "material", "municao", "suprimento"];
const ADM_GIFT_LABEL = { dinheiro: "Dinheiro", vip: "VIP temporário", creditos: "Créditos", arma: "Arma", implante: "Implante",
  colete: "Colete", roupa: "Roupa / mochila", material: "Material", municao: "Munição", suprimento: "Suprimento (comida, água, remédio)" };
const ADM_GIFT_QTY = { dinheiro: 1000, vip: 1, creditos: 100, material: 10, municao: 500, suprimento: 5 };
function admGiftOptions(g) {
  switch (g.type) {
    case "arma": return WLIST.filter(w => !w.fists).map(w => w.id);
    case "implante": return IMP_IDS.slice();
    case "colete": return VESTS.map((_, i) => String(i));
    case "roupa": return CLOTHING_ITEMS.map(c => c.id);
    case "material": return Object.keys(MATS);
    case "municao": return Object.keys(AMMO);
    case "suprimento": return Object.keys(fmGifts.SUPRIMENTOS);
    default: return [];
  }
}
function admGiftItem(g) { const o = admGiftOptions(g); return o.length ? o[((g.itemIndex || 0) % o.length + o.length) % o.length] : null; }
async function admSendGift() {
  if (!canUseAdmin()) return;
  const g = game.admGift;
  if (!g || g.busy) return;
  if (!g.name || g.name.trim().length < 3) { toast("Informe o nome do destinatário."); return; }
  g.busy = true;
  try {
    toast(await fmGifts.send(g.name, g.type, g.qty, admGiftItem(g), g.transferivel !== false, fmGifts.permitePrazo(g.type, admGiftItem(g)) ? g.dias || 0 : 0));
    admLoadGiftHistory();
  } catch (err) {
    toast(err.message || "Não foi possível enviar.");
  } finally { g.busy = false; }
}
async function admLoadGiftHistory() {
  game.admGiftHist = Object.assign({ page: 0, list: [] }, game.admGiftHist, { busy: true });
  try { game.admGiftHist = { list: await fmGifts.history(), busy: false, page: 0 }; }
  catch (e) { game.admGiftHist = { list: [], busy: false, page: 0, err: e.message || String(e) }; }
}
// histórico dos presentes enviados (aba Presentes, embaixo das opções)
function drawGiftHistory(top) {
  if (!game.admGiftHist) admLoadGiftHistory();
  const h = game.admGiftHist || { list: [], busy: true, page: 0 };
  if (!Array.isArray(h.list)) h.list = [];
  const y0 = top + 8, bottom = 500, lineH = 22, per = Math.max(1, Math.floor((bottom - y0 - 34) / lineH));
  const pages = Math.max(1, Math.ceil(h.list.length / per));
  h.page = Math.max(0, Math.min(pages - 1, h.page || 0));
  ctx.fillStyle = "rgba(0,0,0,0.35)"; rr(60, y0, 840, bottom - y0, 8); ctx.fill();
  ctx.strokeStyle = "rgba(212,175,55,0.35)"; ctx.lineWidth = 1; ctx.stroke();
  txt("Histórico de presentes enviados", 74, y0 + 21, 14, "#ffd96a", "left", true);
  btn(700, y0 + 6, 60, 22, "◀", () => { h.page = Math.max(0, h.page - 1); }, false, h.page <= 0);
  txt(`${h.page + 1}/${pages}`, 790, y0 + 21, 12, "#a9a58f", "center");
  btn(820, y0 + 6, 60, 22, "▶", () => { h.page = Math.min(pages - 1, h.page + 1); }, false, h.page >= pages - 1);
  btn(600, y0 + 6, 92, 22, h.busy ? "..." : "Atualizar", () => admLoadGiftHistory(), false, h.busy);
  if (h.err) { txt("Erro: " + h.err, 74, y0 + 52, 13, "#e05a4a"); return; }
  if (!h.busy && !h.list.length) { txt("Nenhum presente enviado ainda.", 74, y0 + 52, 13, "#6d6a58"); return; }
  h.list.slice(h.page * per, h.page * per + per).forEach((g, k) => {
    const y = y0 + 48 + k * lineH;
    const q = new Date(g.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    txt(q, 74, y, 12, "#a9a58f");
    txt(g.nome, 190, y, 13, "#e5e0c8", "left", true, 150);
    txt(g.reivindicado_em && g.reivindicado_resultado ? g.texto + " · " + g.reivindicado_resultado : g.texto, 350, y, 13,
      g.reivindicado_em ? "#9c977f" : g.texto.includes("Não transferível") ? "#ffb08a" : "#e5e0c8", "left", false, 300);
    const podeReivindicar = !g.reivindicar_em && (!g.recebido_em || ["arma", "dinheiro", "creditos"].includes(g.tipo));
    const status = g.reivindicado_em ? "reivindicado" : g.reivindicar_em ? "reivindicando..." : g.recebido_em ? "entregue" : "pendente";
    txt(status, podeReivindicar ? 772 : 886, y, 12, g.reivindicado_em ? "#c58bff" : g.reivindicar_em ? "#ff9a7a" : g.recebido_em ? "#6fae4f" : "#ffd96a", "right", true);
    if (podeReivindicar) {
      const conf = h.confirm === g.id;
      btn(780, y - 15, 106, 20, conf ? "Confirmar?" : "Reivindicar", async () => {
        if (!conf) { h.confirm = g.id; return; }
        h.confirm = null;
        try { toast(await fmGifts.reclaim(g.id)); } catch (e) { toast(e.message || "Não foi possível reivindicar."); }
        admLoadGiftHistory();
      }, conf);
    }
  });
}
async function admLoadRetido() {
  game.admRetido = { list: [], busy: true };
  try { game.admRetido = { list: await fmRetido.adminList(), busy: false }; }
  catch (e) { game.admRetido = { list: [], busy: false, err: e.message || String(e) }; }
}
async function admLoadBugs() {
  game.admBugs = { list: [], busy: true };
  try { game.admBugs = { list: await fmBugs.adminList(), busy: false }; }
  catch (e) { game.admBugs = { list: [], busy: false, err: e.message || String(e) }; }
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
  save.giftVests = {}; save.bank = 0; save.vault = []; save.installed = []; save.credits = 0; save.gm = false; save.missions = [];
  save.vestUpgrades = {}; save.vestDur = {}; save.vest = -1; save.vestsOwned = VESTS.map(() => false); save.outposts = OUTPOSTS.map((o, i) => i === 0);
  save.char = { level: 1, xp: 0, points: 0, wpoints: 0, attrs: defaultAttrs() };
  persist(); resetGame(); toast("Progresso apagado");
}
async function admLoadRecargas(cursores = [null]) {
  if (!canUseAdmin()) return;
  const st = { cursores, lista: [], carregando: true };
  game.admRecargas = st;
  const cursor = cursores[cursores.length - 1];
  try {
    const { data, error } = await fmCloud.socialClient().rpc("fm_admin_recargas", {
      p_antes: cursor?.criado_em || null, p_id: cursor?.id || null
    });
    if (error) throw error;
    st.lista = data.slice(0, 10);
    st.mais = data.length > 10;
  } catch (err) { st.erro = err.message || "Falha ao consultar recargas."; }
  finally { st.carregando = false; }
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
    rows.push({ label: "Colete (A/D troca, ganha o colete)", val: () => (save.vest >= 0 ? vestDefinition(save.vest).name : "nenhum"), act: (d) => { save.vest = ((save.vest + 1 + (d || 1) + VESTS.length + 1) % (VESTS.length + 1)) - 1; if (save.vest >= 0) save.vestsOwned[save.vest] = true; recalcImplants(); persist(); } });
    N("Comida", () => player.food, (v) => { player.food = v; }, 1, 0, 999);
    N("Água", () => player.water, (v) => { player.water = v; }, 1, 0, 999);
    N("Kits médicos", () => player.med, (v) => { player.med = v; }, 1, 0, 999);
    B("Munição +200 de todos os tipos", () => { for (const t in AMMO) player.reserve[t] += 200; toast("Munição adicionada"); });
    B("Concluir as missões ativas", () => { save.missions.forEach((m) => { m.progress = m.target; }); persist(); toast("Missões concluídas (entregue no quadro)"); });
    B("Novas missões no quadro", () => { game.board = makeOffers(); toast("Quadro renovado"); });
  } else if (tab === 5) {
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
  } else if (tab === 3) {
    const g = game.admGift || (game.admGift = { name: "", type: "dinheiro", qty: 1000, itemIndex: 0, busy: false, transferivel: true });
    B("Destinatário: " + (g.name || "(digitar nome in-game)"), () => admAskText("Nome do jogador", name => { g.name = name.slice(0,16); }));
    rows.push({ label: "Tipo de presente (A/D para escolher)", val: () => ADM_GIFT_LABEL[g.type],
      act: (d) => { g.type = ADM_GIFT_TYPES[(ADM_GIFT_TYPES.indexOf(g.type) + (d < 0 ? -1 : 1) + ADM_GIFT_TYPES.length) % ADM_GIFT_TYPES.length];
        g.dias = 0; g.itemIndex = 0; g.qty = ADM_GIFT_QTY[g.type] || 1; g.transferivel = true; } });
    if (admGiftOptions(g).length) {
      rows.push({ label: "Item (A/D alterna · Enter busca pelo nome)", val: () => fmGifts.itemNome(g.type, admGiftItem(g)),
        act: (d, how) => {
          const list = admGiftOptions(g);
          if (how === "enter") {
            admAskText("Buscar item pelo nome", (q) => {
              const t = q.trim().toLocaleLowerCase("pt-BR"), k = list.findIndex(id => fmGifts.itemNome(g.type, id).toLocaleLowerCase("pt-BR").includes(t) || id.includes(t));
              if (k >= 0) g.itemIndex = k; else toast("Nenhum item com esse nome.");
            });
            return;
          }
          g.itemIndex = ((g.itemIndex || 0) + (d < 0 ? -1 : 1) + list.length) % list.length;
        } });
    }
    if (g.type === "vip") {
      rows.push({ label: "Duração do VIP (A/D para escolher)", val: () =>
        g.qty === 1 ? "1 mês" : g.qty === 6 ? "6 meses" : "1 ano",
        act: (d) => { const o = [1,6,12]; g.qty = o[(o.indexOf([1,6,12].includes(g.qty)?g.qty:1)+(d<0?-1:1)+o.length)%o.length]; } });
    } else if (!(fmGifts.permitePrazo(g.type, admGiftItem(g)) && g.dias) && ["dinheiro", "creditos", "material", "municao", "suprimento"].includes(g.type)) {
      const max = { dinheiro: 10000000, creditos: 100000, municao: 100000 }[g.type] || 1000;
      N("Quantidade", () => g.qty, n => { g.qty = n; }, g.type === "dinheiro" ? 1000 : g.type === "municao" ? 100 : 10, 1, max);
    }
    const aceitaPrazo = fmGifts.permitePrazo(g.type, admGiftItem(g));
    if (aceitaPrazo) N("Validade em dias (0 = duração normal)", () => g.dias || 0, n => { g.dias = Math.floor(n); }, 1, 0, 36500);
    if (aceitaPrazo && g.dias) B("1 unidade vinculada ao destinatário", () => {});
    else if (["arma", "implante", "colete"].includes(g.type)) {
      rows.push({ label: "Pode vender no Mercado Negro? (A/D ou Enter)", val: () => g.transferivel !== false ? "Transferível" : "Não transferível",
        on: () => g.transferivel !== false, act: () => { g.transferivel = g.transferivel === false; } });
    }
    B(g.busy ? "ENVIANDO..." : "ENVIAR PRESENTE PARA O JOGADOR", () => admSendGift());
    B("Beta: consultar resumo dos convites", async () => {
      try {
        const {data, error} = await fmCloud.socialClient().rpc("fm_beta_admin", {p_code: null, p_action: "resumo"});
        if (error) throw error;
        toast("Beta: " + data.disponiveis + " livres · " + data.utilizados + " usados · " + data.revogados + " revogados.");
      } catch (err) { toast(err.message || "Falha ao consultar convites."); }
    });
    for (const [action, label] of [["consultar","Consultar código"], ["revogar","Bloquear código e conta"],
      ["restaurar","Restaurar acesso"], ["liberar","Liberar código para outro jogador"]]) {
      B("Beta: " + label, async () => {
        try {
          const code = window.prompt(label + " — cole o convite completo:");
          if (!code?.trim() || (action !== "consultar" && !window.confirm(label + "?"))) return;
          const {data, error} = await fmCloud.socialClient().rpc("fm_beta_admin", {p_code: code, p_action: action});
          if (error) throw error;
          window.alert("Convite: " + data.status + (data.email ? "\nE-mail: " + data.email : ""));
        } catch (err) { toast(err.message || "Falha ao gerenciar convite."); }
      });
    }
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
  } else if (tab === 7) {
    // relatórios de bug dos jogadores: Enter avalia (créditos > 0 aceita e paga · 0 recusa · -1 duplicado); A/D mostra o texto
    if (!game.admBugs) admLoadBugs();
    const st = game.admBugs || { list: [], busy: true };
    B(st.busy ? "Carregando relatórios..." : `Atualizar (${st.list.length} em aberto)`, () => { game.admBugs = null; admLoadBugs(); });
    if (st.err) rows.push({ label: "Erro: " + st.err, val: () => "", act: () => {} });
    else if (!st.busy && !st.list.length) rows.push({ label: "Nenhum relatório em aberto.", val: () => "", act: () => {} });
    st.list.forEach((b) => {
      const c = b.contexto || {}, onde = [c.setor, c.dentro ? "dentro de casa" : null, c.arma].filter(Boolean).join(" · ");
      rows.push({ label: `${b.nome || "?"}: ${b.texto.replace(/\s+/g, " ").slice(0, 60)}${b.texto.length > 60 ? "…" : ""}`, val: () => "Enter avalia · A/D lê",
        act: (d, how) => {
          if (how !== "enter") { toast(`${b.nome}: ${b.texto.slice(0, 260)}${onde ? " [" + onde + "]" : ""}${(c.erros || []).length ? " · erros: " + c.erros.length : ""}`); return; }
          admAsk("Créditos (ex.: 50/200/500 aceita · 0 recusa · -1 duplicado)", async (v) => {
            try { const r = await fmBugs.adminRate(b.id, Math.max(-1, Math.min(100000, Math.round(v)))); toast("Relatório " + r); game.admBugs = null; admLoadBugs(); }
            catch (e) { toast(e.message || "Falha ao avaliar"); }
          });
        } });
    });
  } else if (tab === 8) {
    // ganhos acima de $2.000.000/hora ficam Bloqueados; Enter abre a análise (login, personagem e de onde veio o dinheiro)
    if (!game.admRetido) admLoadRetido();
    const st = game.admRetido || { list: [], busy: true };
    const abertos = st.list.filter((r) => r.status === "retido");
    B(st.busy ? "Carregando..." : `Atualizar (${abertos.length} em análise)`, () => { game.admRetido = null; admLoadRetido(); });
    if (st.err) rows.push({ label: "Erro: " + st.err, val: () => "", act: () => {} });
    else if (!st.busy && !st.list.length) rows.push({ label: "Nenhum dinheiro retido.", val: () => "", act: () => {} });
    st.list.forEach((r) => {
      const q = new Date(r.quando).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
      rows.push({ label: `${r.nome || "?"} · ${r.login || "?"} · ${q} · $${Math.round(r.valor).toLocaleString("pt-BR")}`,
        val: () => r.status === "retido" ? "Enter analisa" : r.status, act: (d, how) => { if (how === "enter") fmRetido.abrir(r); } });
    });
  } else if (tab === 9) {
    if (!game.admRecargas) admLoadRecargas();
    const st = game.admRecargas;
    B(st.carregando ? "Consultando recargas…" : "Atualizar recargas", () => { if (!st.carregando) admLoadRecargas(); });
    const info = (label, valor = "") => rows.push({ label, val: () => valor, act: () => {} });
    if (st.erro) info(st.erro);
    else if (!st.carregando && !st.lista.length) info("Nenhuma recarga encontrada.");
    const situacao = { pago: "Pago", resgatado: "Créditos entregues", pendente: "Pendente", cancelado: "Cancelado", estornado: "Estornado" };
    for (const compra of st.lista) {
      const data = new Date(compra.pago_em || compra.criado_em).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short"
      });
      const valor = Number(compra.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      info(compra.nome + " · " + data + " · " + valor, compra.creditos.toLocaleString("pt-BR") + " créditos · " + (situacao[compra.status] || compra.status));
    }
    if (st.cursores.length > 1) B("Página anterior", () => { game.ac = 0; admLoadRecargas(st.cursores.slice(0, -1)); });
    if (st.mais) B("Próxima página", () => { game.ac = 0; admLoadRecargas([...st.cursores, st.lista[9]]); });
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
// moldura e linhas dos menus: desenho em js/estetica.js (clima de Natal da tela inicial)
function menuFrame(title, sub, bg) { uiFrame(title, sub, bg); }
function rowBox(x, y, w, h, sel, accent) { uiRow(x, y, w, h, sel, accent); }
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
  const retido = fmRetido.bloqueado();
  if (retido > 0) txt(`Bloqueado (em análise): ${bankMoney(retido)}`, W / 2 + 150, 484, 13, "#e07a5a", "center", true);
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
      ctx.fillStyle = "#000"; ctx.fillRect(x + 250, ry + 10, w - 340, 6);
      ctx.fillStyle = WEAPON_SKILL_IDS.includes(id) ? "#d08a5a" : "#6d8aa8"; ctx.fillRect(x + 250, ry + 10, (w - 340) * Math.min(1, v / cap), 6);
      // botão +: clique soma 1 (Shift + clique soma 5)
      const bx = x + w - 44, by = ry + 2, hov = mouse.x >= bx && mouse.x <= bx + 28 && mouse.y >= by && mouse.y <= by + 22;
      ctx.fillStyle = !can ? "#1f1e19" : hov ? "#5a4a2a" : "#352d1a"; rr(bx, by, 28, 22, 4); ctx.fill();
      ctx.strokeStyle = can ? "#d4af37" : "#3d3b30"; ctx.lineWidth = 1; ctx.stroke();
      txt("+", bx + 14, by + 17, 17, can ? "#f2eedc" : "#4a4840", "center", true);
      if (can) regClick(bx, by, 28, 22, () => { game.cur = i; addPoint(keys && keys.shift ? 5 : 1, id); });
      // botão −: só tira pontos ainda não confirmados
      const mx = bx - 34, pend = v - (statsBase()[id] || 0), canM = pend > 0, hovM = mouse.x >= mx && mouse.x <= mx + 28 && mouse.y >= by && mouse.y <= by + 22;
      ctx.fillStyle = !canM ? "#1f1e19" : hovM ? "#5a2a2a" : "#351a1a"; rr(mx, by, 28, 22, 4); ctx.fill();
      ctx.strokeStyle = canM ? "#e05a4a" : "#3d3b30"; ctx.lineWidth = 1; ctx.stroke();
      txt("−", mx + 14, by + 17, 17, canM ? "#f2eedc" : "#4a4840", "center", true);
      if (canM) { regClick(mx, by, 28, 22, () => { game.cur = i; subPoint(keys && keys.shift ? 5 : 1, id); }); txt("+" + pend, x + 216, ry + 18, 11, "#ffd96a", "left", true); }
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
  if (statsPending()) txt("Pontos ainda não confirmados: use − para tirar ou Confirmar para fixar.", 506, 380, 11, "#ffd96a", "left", true);
  else txt("Força usa pontos de atributo (Stats).", 506, 372, 11, "#6d6a58");
  // confirmar / desfazer a distribuição pendente
  if (statsPending()) {
    btn(700, 342, 104, 22, "Confirmar (F)", confirmStats, true);
    btn(812, 342, 100, 22, "Desfazer (Z)", () => revertStats(false));
  }
  // o reset de atributos fica só no Ferro Velho (aqui confundia com a distribuição de pontos)
  hint("W/S escolhe · Enter +1 · D +5 · Backspace −1 · F confirma · Z desfaz · Shift no +/− soma 5 · C ou Esc");
}

function drawMissionRow(x, y, w, m, sel, active) {
  const done = active && m.progress >= m.target;
  rowBox(x, y, w, 48, sel, done ? "#6fae4f" : null);
  txt(missionText(m), x + 10, y + 19, 14, done ? "#6fae4f" : "#e5e0c8", "left", true, w - 20);
  if (m.type === "natal") {
    const rew = "Recompensa: Pistola Natalina";
    txt(active ? (done ? "CONCLUÍDA, entregue num posto · Prêmio: Pistola Natalina" : `Zumbis ${m.k || 0}/${NATAL_MISSAO.kills} · Saques ${m.s || 0}/${NATAL_MISSAO.searches} · Prêmio: Pistola Natalina`) : rew, x + 10, y + 38, 12, "#ffd96a", "left", false, w - 20);
    return;
  }
  const rew = `Recompensa: $${m.money} + ${Math.round(m.xp * xpMult())} XP`;
  txt(active ? `${done ? "CONCLUÍDA, entregue num posto · " : `${m.progress}/${m.target} · `}${rew}` : rew, x + 10, y + 38, 12, "#a9a58f", "left", false, w - 20);
}
function drawMissions() {
  menuFrame(game.atBase ? "Quadro de missões" : "Missões ativas",
    `Ativas: ${save.missions.filter((m) => m.type !== "natal").length}/3 · Dinheiro: $${game.money}${game.atBase ? "" : " · entregue as concluídas no quadro de um posto"}`);
  missionItems();   // garante a Missão de Natal no quadro
  const offers = game.atBase ? game.board : [];
  if (game.atBase) txt("Disponíveis", 40, 104, 14, "#e5e0c8", "left", true);
  txt("Ativas", game.atBase ? 500 : 40, 104, 14, "#e5e0c8", "left", true);
  offers.forEach((m, i) => drawMissionRow(40, 114 + i * 54, 440, m, game.cur === i, false));
  save.missions.forEach((m, j) => drawMissionRow(game.atBase ? 500 : 40, 114 + j * 54, game.atBase ? 420 : 880, m, game.cur === offers.length + j, true));
  if (!offers.length && !save.missions.length) txt("Nenhuma missão no momento.", 40, 140, 15, "#6d6a58");
  hint("W/S move · Enter aceita/entrega · V abandona · M ou E fecha");
}


// ---------- Gerenciamento dos esquemas pela Clínica ----------
function clinicPresetStartSave() {
  if (!save.installed.length) { toast("Equipe implantes para montar um esquema."); return; }
  game.implantDropdown = false;
  game.implantNameDraft = game.implantPresetSelected || "";
}
function clinicPresetNameKey(k) {
  if (k === "escape") { game.implantNameDraft = null; return; }
  if (k === "enter") {
    const name = (game.implantNameDraft || "").trim();
    game.implantNameDraft = null;
    if (name) implantPresetSave(name); else toast("Digite um nome para o esquema.");
    return;
  }
  if (k === "backspace") { game.implantNameDraft = game.implantNameDraft.slice(0, -1); return; }
  const raw = game.rawKey || "";
  if (raw.length === 1 && /[\p{L}\p{N} _.-]/u.test(raw) && game.implantNameDraft.length < 24)
    game.implantNameDraft += raw;
}
function clinicPresetDeleteKey(k) {
  if (k === "escape" || k === "n" || k === "e") { game.implantPresetDelete = null; return; }
  if (k === "enter" || k === "s" || k === "y") clinicPresetConfirmDelete();
}
function clinicPresetConfirmDelete() {
  const name = game.implantPresetDelete;
  game.implantPresetDelete = null;
  if (name) implantPresetRemove(name);
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
  txt(`Único (só um instalado) · sucata $${implantSellPrice(im).toLocaleString("pt-BR")}`, W - 56, 448, 12, "#a9a58f", "right");
  txtWrap(implantDesc(im), 56, 470, 13, "#d8d2ba", W - 112, 17, 4);
}
function drawClinic() {
  const unlocked = implantUnlockedSlots(player.level);
  const editing = game.tab === 0;
  menuFrame("Implantes", `Nível ${player.level} · ${unlocked} espaços liberados de 14 · 225–415 bloqueados · Mochila ${player.bag.length}/${BAG_MAX}`);
  btn(40, 85, 194, 32, editing ? "Minha mochila" : "Ver meus implantes", () => {
    game.tab = 0; game.cur = 0; game.implantDropdown = false;
  }, editing);
  btn(246, 85, 232, 32, editing ? "Loja de implantes (Tab)" : "Loja de implantes", () => {
    game.tab = 1; game.cur = 0; game.implantDropdown = false;
  }, !editing);
  if (editing) {
    const presets = save.implantPresets || [];
    const selectedName = presets.some(p => p.name === game.implantPresetSelected)
      ? game.implantPresetSelected : "Atual";
    btn(501, 85, 271, 32, "Implantes: " + selectedName.slice(0, 18) + " ▾",
      () => { game.implantDropdown = !game.implantDropdown; game.implantShowStats = false; }, true);
    const onB = mouse.x >= 782 && mouse.x <= 815 && mouse.y >= 85 && mouse.y <= 117;
    btn(782, 85, 33, 32, "B", () => { game.implantShowStats = !game.implantShowStats; }, onB || !!game.implantShowStats);
    btn(825, 85, 99, 32, "Salvar", clinicPresetStartSave, false, !save.installed.length);
    txt("MOCHILA · Enter para instalar", 42, 135, 12, "#bcb8a0", "left", true);
    txt(`EQUIPADOS ${save.installed.length}/${unlocked}  ·  Slots 225+ indisponíveis`, 512, 135, 12, "#bcb8a0", "left", true);

    const pts = im => IMP[im.id].alloc
      ? `${allocUsed(im)}/${IMP[im.id].alloc.points} pts`
      : IMP[im.id].mimic ? "copia ←" : "";
    player.bag.forEach((im, i) => {
      const y = 148 + i * 34;
      drawImplantRow(40, y, 442, im, game.cur === i, pts(im));
      regClick(40, y, 442, 28, () => { game.cur = i; });
    });
    if (!player.bag.length)
      txt("Mochila vazia. Colete, compre ou remova implantes equipados.", 48, 177, 12, "#8e8a77");
    if (player.bag.length < BAG_MAX && save.installed.length > 0)
      txt("Clique em um slot ocupado para selecionar e remover.", 44, 407, 11, "#aaa48b");

    // Grade baseada na referência: 4 colunas x 5 linhas, 20 níveis indicados.
    for (let i = 0; i < IMPLANT_SLOT_LEVELS.length; i++) {
      const required = IMPLANT_SLOT_LEVELS[i];
      const col = i % 4, row = Math.floor(i / 4);
      const x = 514 + col * 102, y = 150 + row * 54, w = 93, h = 49;
      const forever = i >= IMPL_SLOTS;
      const open = !forever && player.level >= required;
      const im = save.installed[i];
      const selected = !!im && game.cur === player.bag.length + i;
      ctx.fillStyle = forever ? "#140f0f" : open ? "#1e281c" : "#1a1a17";
      rr(x, y, w, h, 3); ctx.fill();
      ctx.strokeStyle = selected ? "#ffd96a" : forever ? "#53302c" : open ? "#4e7549" : "#3e3c35";
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();
      if (im) {
        drawEntryIcon({ type: "implant", im }, x + w / 2, y + 19, 0.52);
        txt(String(required), x + w / 2, y + 46, 10, open ? "#d6d3bb" : "#db897d", "center", true);
      } else {
        txt(String(required), x + w / 2, y + 33, 25, open ? "#faf8e8" : "#848078", "center", true);
        if (forever) txt("BLOQUEADO", x + w / 2, y + 45, 9, "#ad6962", "center", true);
        else if (!open) txt("TRANCADO", x + w / 2, y + 45, 9, "#8b8378", "center");
      }
      regClick(x, y, w, h, () => {
        if (game.implantDropdown || game.implantNameDraft != null) return;
        if (forever) { toast("Este espaço está bloqueado: nível máximo atual é 200."); return; }
        if (!open) { toast("Espaço libera no nível " + required + "."); return; }
        if (im) game.cur = player.bag.length + i;
        else { toast("Espaço vazio. Selecione um implante na mochila e pressione Enter."); }
      });
    }
    const it = clinicItems()[game.cur];
    drawImplantInfo(it ? it.im : null);
    const canRemove = !!it && it.src === "bag" && !it.im.tokenBound;
    btn(523, 545, 190, 29, "Vender (V) · $" + (canRemove ? implantSellPrice(it.im) : 0).toLocaleString("pt-BR"),
      sellImplant, false, !canRemove);
    btn(723, 545, 188, 29, "Descartar (X)", discardImplant, false, !canRemove);
    hint("Enter instala/remove · Q/D ordena · A pontos · V vende · X descarta · Tab loja · E fecha");
  } else {
    const N = 9, first = Math.max(0, Math.min(game.stock.length - N, game.cur - 4));
    for (let r = 0; r < N && first + r < game.stock.length; r++) {
      const i = first + r, st = game.stock[i], im = { id: st.id, alloc: {} };
      const has = save.installed.some(x => x.id === st.id) ? "instalado · "
        : player.bag.some(x => x.id === st.id) ? "na mochila · " : "";
      drawImplantRow(140, 126 + r * 32, 680, im, game.cur === i, `${has}${st.price} créditos`,
        save.credits >= st.price ? "#6fae4f" : "#c0392b");
    }
    txt(`${game.cur + 1} / ${game.stock.length}`, 830, 144, 12, "#a9a58f");
    if (first > 0) txt("▲", 830, 164, 12, "#ffd96a");
    if (first + N < game.stock.length) txt("▼", 830, 400, 12, "#ffd96a");
    const st = game.stock[game.cur];
    drawImplantInfo(st ? { id: st.id, alloc: {} } : null);
    hint("W/S move · Enter compra · Tab retorna aos implantes · E fecha");
  }

  drawAllocPanel();

  // Menu suspenso sobre os slots: o clique aplica o esquema salvo imediatamente.
  if (editing && game.implantDropdown && game.implantNameDraft == null) {
    const presets = save.implantPresets || [];
    const x = 498, y = 125, w = 427, h = 100 + presets.length * 28;
    regClick(0, 0, W, H, () => { game.implantDropdown = false; });
    ctx.fillStyle = "#10130e"; rr(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = "#a89044"; ctx.lineWidth = 1.5; ctx.stroke();
    txt("ESQUEMAS SALVOS · selecionar para equipar", x + 12, y + 21, 13, "#f3dc93", "left", true);
    if (!presets.length) txt("Nenhum esquema salvo ainda.", x + 12, y + 54, 13, "#b7b1a0");
    presets.forEach((preset, i) => {
      const py = y + 31 + i * 28, isSelected = preset.name === game.implantPresetSelected;
      btn(x + 10, py, w - 20, 25,
        (isSelected ? "✓ " : "") + preset.name + " · " + preset.slots.length + " implantes",
        () => { implantPresetApply(preset.name); }, isSelected);
    });
    const actionY = y + 33 + presets.length * 28;
    btn(x + 10, actionY, 204, 30, "Salvar esquema atual", clinicPresetStartSave, true, !save.installed.length);
    btn(x + 225, actionY, 192, 30, "Excluir selecionado", () => {
      if (game.implantPresetSelected && presets.some(p => p.name === game.implantPresetSelected)) {
        game.implantPresetDelete = game.implantPresetSelected;
        game.implantDropdown = false;
      } else toast("Selecione um esquema salvo para excluir.");
    }, false, !game.implantPresetSelected);
    txt("Um esquema utiliza apenas implantes já possuídos.", x + 11, actionY + 53, 11, "#bbb399");
  }

  const overB = mouse.x >= 782 && mouse.x <= 815 && mouse.y >= 85 && mouse.y <= 117;
  if (editing && (overB || game.implantShowStats) &&
      !game.implantDropdown && game.implantNameDraft == null &&
      !game.implantPresetDelete && !game.implantConfirm && !allocOpen()) {
    const preset = (save.implantPresets || []).find(p => p.name === game.implantPresetSelected);
    const { totals, flags, count } = implantPresetTotals(preset);
    const stats = Object.entries(totals).filter(([, amount]) => amount !== 0);
    const rows = Math.ceil(stats.length / 2);
    const px = 487, py = 123, pw = 450, ph = Math.min(435, Math.max(180, 83 + rows * 19));
    ctx.fillStyle = "rgba(10,15,10,0.97)"; rr(px, py, pw, ph, 9); ctx.fill();
    ctx.strokeStyle = "#88b369"; ctx.lineWidth = 1.5; ctx.stroke();
    txt("B · SOMA DOS BÔNUS", px + 15, py + 23, 16, "#ccedac", "left", true);
    txt((preset ? preset.name : "Implantes equipados") + " · " + count + " implantes",
      px + 15, py + 44, 12, "#dfddca", "left", false, pw - 30);
    if (!stats.length) txt("Nenhum bônus ativo neste esquema.", px + 16, py + 81, 13, "#bcb8a0");
    stats.forEach(([key, amount], i) => {
      const col = Math.floor(i / Math.max(1, rows)), row = i % Math.max(1, rows);
      const x = px + 15 + col * 220, y = py + 67 + row * 19;
      const val = (amount > 0 ? "+" : "") + amount + "%";
      txt((FX_LABEL[key] || key).slice(0, 23), x, y, 11, "#c5c6b7", "left", false, 160);
      txt(val, x + 202, y, 12, amount >= 0 ? "#89d98d" : "#f18a83", "right", true, 60);
    });
    if (flags.length) txt("Efeitos especiais: " + flags.join(", "), px + 15,
      Math.min(py + ph - 16, py + 76 + rows * 19), 11, "#f0d58e", "left", false, pw - 30);
    txt("Somente bônus dos implantes; não inclui o evento nem profissão.",
      px + 15, py + ph - 8, 10, "#97a68a", "left");
  }

  if (game.implantNameDraft != null) {
    ctx.fillStyle = "rgba(0,0,0,0.88)"; ctx.fillRect(0, 0, W, H);
    regClick(0, 0, W, H, () => {});
    ctx.fillStyle = "#22261b"; rr(215, 200, 530, 206, 10); ctx.fill();
    ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2; ctx.stroke();
    txt("Salvar esquema de implantes", W / 2, 237, 21, "#ffe5a3", "center", true);
    txt("Exemplo: Loot, Dano, Velocidade, Boss...", W / 2, 263, 13, "#bdb89e", "center");
    ctx.fillStyle = "#111510"; ctx.fillRect(264, 279, 432, 38);
    ctx.strokeStyle = "#9a8d52"; ctx.lineWidth = 1; ctx.strokeRect(264, 279, 432, 38);
    txt(game.implantNameDraft + (Math.floor(performance.now() / 400) % 2 ? "|" : ""),
      277, 305, 17, "#f5f2dc", "left", true, 402);
    txt("Ao salvar com o mesmo nome, o esquema anterior será atualizado.", W / 2, 339, 12, "#b3ae96", "center");
    btn(286, 354, 177, 38, "Salvar (Enter)", () => {
      const name = game.implantNameDraft.trim();
      game.implantNameDraft = null; if (name) implantPresetSave(name);
    }, true, !game.implantNameDraft.trim());
    btn(496, 354, 177, 38, "Cancelar (Esc)", () => { game.implantNameDraft = null; });
  }

  if (game.implantPresetDelete) {
    const name = game.implantPresetDelete;
    ctx.fillStyle = "rgba(0,0,0,0.88)"; ctx.fillRect(0, 0, W, H);
    regClick(0, 0, W, H, () => {});
    ctx.fillStyle = "#22261b"; rr(220, 208, 520, 176, 10); ctx.fill();
    ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2; ctx.stroke();
    txt("Excluir o esquema " + name + "?", W / 2, 251, 21, "#f9d3a0", "center", true, 500);
    txt("Isso não apaga nem desmonta seus implantes.", W / 2, 289, 13, "#c9c4ad", "center");
    btn(290, 318, 179, 40, "Excluir (Enter)", clinicPresetConfirmDelete, true);
    btn(497, 318, 179, 40, "Cancelar", () => { game.implantPresetDelete = null; });
  }

  // Confirmação de venda/descarte preexistente, preservada.
  if (game.implantConfirm) {
    const c = game.implantConfirm;
    const price = IMP[c.im.id] ? implantSellPrice(c.im) : 0;
    const label = c.action === "sell" ? "Vender" : "Descartar";
    ctx.fillStyle = "rgba(0,0,0,0.80)"; ctx.fillRect(0, 0, W, H);
    regClick(0, 0, W, H, () => {});
    ctx.fillStyle = "#23241d"; rr(208, 197, 544, 198, 12); ctx.fill();
    ctx.strokeStyle = "#d4af37"; ctx.lineWidth = 2; ctx.stroke();
    txt(label + " implante?", W / 2, 230, 24, "#ffd96a", "center", true);
    txt(implantName(c.im), W / 2, 263, 17, "#f2eedc", "center", true, 500);
    txt(c.action === "sell" ? "Receber $" + price.toLocaleString("pt-BR") + " de dinheiro do jogo."
      : "O implante será destruído sem recompensa.", W / 2, 290, 14, "#ddd3b8", "center");
    txt("Esta ação não pode ser desfeita.", W / 2, 310, 12, "#e9a294", "center");
    btn(298, 333, 165, 42, "Confirmar (Enter)", applyClinicImplantConfirm, true);
    btn(495, 333, 165, 42, "Cancelar (Esc)", () => { game.implantConfirm = null; });
  }
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
  const cs = Math.floor(Math.min(490 / MAP_W, 360 / MAP_H)), gx = 34, gy = 96, now = performance.now(), fs = cs / 34;
  for (let cy = 0; cy < MAP_H; cy++) for (let cx = 0; cx < MAP_W; cx++) {
    const c = cellAt(cx, cy), x = gx + cx * cs, y = gy + cy * cs;
    if (!c) { ctx.fillStyle = "#121210"; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2); continue; }
    const RG = REGIONS[c.tier];
    ctx.fillStyle = RG.color; ctx.globalAlpha = c.visited ? 0.95 : 0.6; ctx.fillRect(x + 1, y + 1, cs - 2, cs - 2); ctx.globalAlpha = 1;
    if (c.tier === 6) { ctx.strokeStyle = "#55555c"; ctx.lineWidth = 1; ctx.strokeRect(x + 1.5, y + 1.5, cs - 3, cs - 3); }
    if (c.landmark) { ctx.fillStyle = "rgba(0,0,0,0.55)"; rr(x + 2, y + cs - 12, 10, 10, 2); ctx.fill(); txt({ hospital: "H", prisao: "P", bunker: "B" }[c.landmark], x + 7, y + cs - 4, 8, { hospital: "#ff7a6a", prisao: "#ffc060", bunker: "#a8e07a" }[c.landmark], "center", true); }
    if (c.op != null) txt("⌂", x + cs / 2, y + cs / 2 + 7 * fs, Math.round(20 * fs), save.outposts[c.op] ? "#ffffff" : "rgba(255,255,255,0.45)", "center", true);
    if (c.boss) {
      const p = 0.7 + 0.3 * Math.sin(now / 220 + cx);
      const natal = c.boss === "santa_natal";
      ctx.fillStyle = `rgba(0,0,0,${0.45 * p})`; circle(x + cs / 2, y + cs / 2, 12 * fs);
      // A caveira é a mesma dos outros chefes; só muda para verde natalino.
      const skullColor = natal ? `rgb(${Math.round(70 + 30 * p)},255,${Math.round(95 + 40 * p)})`
        : `rgba(255,${Math.round(90 * p)},${Math.round(70 * p)},1)`;
      txt("☠", x + cs / 2, y + cs / 2 + 7 * fs, Math.round(19 * fs), skullColor, "center", true);
    }
    if (c.tier === 8 && player.level < GRAY_LEVEL) txt("🔒", x + cs - 6, y + 9, 7, "#fff", "center");
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
    const x = gx + cx * cs + cs - 6, y = gy + cy * cs + 6;
    ctx.fillStyle = group.some(p => fmSocial.isFriend(p.uid)) ? "#8fe0a8" : "#73ceff";
    circle(x, y, 6);
    txt(String(group.length), x, y + 3, 8, "#101613", "center", true);
  }
  for (let cx = 0; cx < MAP_W; cx++) txt(colName(cx), gx + cx * cs + cs / 2, gy - 6, cs < 14 ? 7 : 9, "#a9a58f", "center", true);
  for (let cy = 0; cy < MAP_H; cy++) txt(String(cy + 1), gx - 6, gy + cy * cs + cs / 2 + 3, cs < 14 ? 7 : 9, "#a9a58f", "right", true);
  // legenda das cores
  const ly = gy + MAP_H * cs + 18;
  REGIONS.forEach((RG, i) => {
    const x = gx + (i % 3) * 160, y = ly + Math.floor(i / 3) * 20;
    ctx.fillStyle = RG.color; ctx.fillRect(x, y - 10, 14, 14);
    ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = 1; ctx.strokeRect(x, y - 10, 14, 14);
    txt(`${RG.name} · ${RG.diff}`, x + 19, y + 2, 11, "#c9c4ad", "left", true);
  });
  txt("⌂ base  ☠ vermelho = chefe comum  ☠ verde = Natal  H hospital  P prisão  B bunker", gx, ly + 66, 11, "#a9a58f");
  txt("Amarelo = você  ·  Azul = jogador online  ·  Verde = amigo", gx, ly + 81, 11, "#a9a58f");
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
    if (sel.boss) {
      const B = BOSSES[sel.boss], natal = sel.boss === "santa_natal";
      const label = natal ? " · 4 alces · 1 Papai Noel" : ` · deixa: ${B.drop}`;
      txt(`☠ ${B.name}${label}`, lx, y, 13, natal ? "#68f18c" : "#e04a4a", "left", true, 380);
      y += 18;
    }
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
  startLocationLoad(c.name, () => {
    if (game.inside) leaveHouseNow();
    gotoCell(c, { x: MID_X, y: MID_Y });
    toast(`Teletransportado para ${c.code}`);
  });
}
function admTeleportPlayer(p) {
  if (!canUseAdmin()) return;
  const c = cellAt(p.cx, p.cy);
  if (!c) { toast("Não foi possível achar a área do jogador"); return; }
  game.menu = null;
  startLocationLoad(c.name, () => {
    if (game.inside) leaveHouseNow();
    const m = /^house:(-?[\d.]+):(-?[\d.]+)/.exec(p.location || "");
    gotoCell(c, m ? (wd) => { const b = wd.buildings.find((b) => b.x === +m[1] && b.y === +m[2]); return b && b.door ? doorFront(b) : { x: MID_X, y: MID_Y }; }
                  : { x: p.x, y: p.y + 30 });
    toast(m ? `${p.name} está dentro de um prédio: você ficou na porta` : `Teletransportado até ${p.name}`);
  });
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
    txt(t, x + w / 2, 78, 14, game.at === i ? "#ffd96a" : "#a9a58f", "center", true, w - 5);
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
  if (game.at === 3) drawGiftHistory(100 + Math.min(vis, rows.length) * 28);
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
