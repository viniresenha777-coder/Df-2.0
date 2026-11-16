"use strict";
// =====================================================================
//  Personagem: atributos, experiência, fome, sede e cura
// =====================================================================

// Nenhum implante pode ser criado, equipado ou recuperado de versões antigas.
function newImplant() { return null; }
function randomImplant() { return null; }
function cleanImplant() { return null; }
function impColor() { return "#a9a58f"; }
function implantName() { return "Item removido"; }
function implantDesc() { return ""; }
function installBlock() { return "Implantes foram removidos do jogo"; }
function canSwapImplants() { return false; }
function allocUsed() { return 0; }
function fxText() { return ""; }
function implantFx() { return {}; }
function recalcImplants() {
  const all = {}, safe = {}, flags = {};
  STAT_KEYS.forEach((k) => { all[k] = 0; safe[k] = 0; });
  // Limpa implantes antigos ainda em memória. Bônus de profissão permanecem.
  if (save.installed.length) save.installed.length = 0;
  if (player.bag && player.bag.length) player.bag.length = 0;
  const pf = prof(); // bônus e penalidades da profissão
  if (pf && pf.fx) for (const k in pf.fx) { all[k] = (all[k] || 0) + pf.fx[k]; safe[k] = (safe[k] || 0) + pf.fx[k]; }
  player.fxAll = all; player.fxSafe = safe; player.flags = flags; player.fx = all;
  const vest = save.vest >= 0 ? VESTS[save.vest] : null;
  // Endurance vale a mesma quantidade em HP. Colete e implantes acrescentam
  // pontos de vida até o limite absoluto de 200, sem bônus automático por nível.
  const baseHp = Number.isFinite(player.attrs.endurance) ? player.attrs.endurance : 25;
  const implantBonus = Math.max(-20, Math.min(35, all.vigor || 0));
  const vestBonus = Math.max(0, Math.min(25, vest && vest.hp ? vest.hp : 0));
  player.maxHp = Math.max(1, Math.min(PLAYER_HP_CAP, baseHp + implantBonus + vestBonus));
  player.hp = Math.min(player.hp, player.maxHp);
  lastStandTick();
}
// Compatibilidade: mantém bônus de profissão calculados pela rotina normal.
function lastStandTick() {
  if (!player.fxAll) return;
  player.fx = player.flags.lastStand && player.hp / player.maxHp < 0.25 ? player.fxSafe : player.fxAll;
}
function makeStock() { return []; }

// ---------- Atributos ----------
function xpNeed(l) { return Math.round(30 + 6 * l + 0.12 * l * l); }
function A(id) { return player.attrs[id]; }
// Vest and implant protection stack additively; attribute armor remains a separate layer.
function equipmentProtection() {
  const vest = save.vest >= 0 ? (VESTS[save.vest].armor + vestUpgrade().armor) * vestEff() : 0;
  return Math.max(-50, Math.min(95, vest + (player.fx.thick || 0)));
}
function trindadeActive() { return (save.trindadeUntil || 0) > Date.now(); }
function armorRed() {
  const a = A("armor") / (A("armor") + 150);
  const baseline = Math.min(0.78, 1 - (1 - a) * (1 - equipmentProtection() / 100));
  return Math.min(0.95, baseline * (trindadeActive() ? 1.35 : 1));
}
function moneyMult() { return (1 + player.fx.greed / 100) * (vipActive() ? 2 : 1); }
function xpMult() { return (1 + player.fx.exp / 100) * (vipActive() ? 2 : 1); }
function attrEffect(id, v) {
  switch (id) {
    case "endurance": return `${Math.round(v)} de vida-base (melhorias até 200 HP)`;
    case "str": return `+${v - 10}% de dano melee · exigência das armas`;
    case "armor": return `-${Math.round((v / (v + 150)) * 100)}% de dano recebido`;
    case "agi": return `+${Math.round((v - 10) * 0.4)}% de velocidade`;
    case "acc": return `dispersão em ${Math.round(100 * Math.max(0.15, 10 / v))}% · +${Math.round((v - 10) * 0.3)}% de dano à distância`;
    case "crit": return `${Math.min(75, v * 0.5).toFixed(1)}% de chance de crítico`;
    case "reload": return `recarrega em ${Math.round(100 / (1 + (v - 10) * 0.012))}% do tempo`;
    case "silence": return `zumbis te veem de ${Math.round(100 / (1 + (v - 10) * 0.015))}% da distância`;
    case "stealth": return `${Math.min(60, v)}% de chance de o zumbi não te ver`;
    default: return `+${Math.round((v - 10) * 0.5)}% de dano com ${CATNAME[id]}`;
  }
}
function syncChar() {
  save.char.level = player.level; save.char.xp = player.xp; save.char.points = player.points; save.char.wpoints = player.wpoints; save.char.skillCurve = 2;
  persist();
}
function gainXp(n) {
  if (player.level >= MAX_LEVEL) return;
  player.xp += n * xpMult();
  let up = 0;
  while (player.level < MAX_LEVEL && player.xp >= xpNeed(player.level)) {
    player.xp -= xpNeed(player.level); player.level++;
    player.wpoints += weaponPointsForLevel(player.level);
    player.points += survivalPointsForLevel(player.level);
    up++;
  }
  if (player.level >= MAX_LEVEL) player.xp = 0;
  if (up) {
    recalcImplants(); player.hp = Math.min(player.maxHp, player.hp + 10 * up);
    sfx.level();
    game.banner = { text: `Nível ${player.level}!`, sub: "Aperte C para distribuir seus pontos", t: 2600, gold: true };
  }
  syncChar();
}

// ---------- Fome, sede, kit médico ----------
function drink() {
  if (player.water <= 0) { toast("Você não tem água"); return; }
  if (player.thirst >= 100) { toast("Sem sede"); return; }
  player.water--; player.thirst = Math.min(100, player.thirst + 40); toast("Você bebeu"); sfx.pickup(); stat("foodEaten");
}
function heal() {
  if (player.med <= 0) { toast("Você não tem kit médico"); return; }
  if (player.hp >= player.maxHp) { toast("Vida cheia"); return; }
  player.med--; player.hp = Math.min(player.maxHp, player.hp + 40 * (1 + profVal("med"))); toast("Você usou um kit médico"); sfx.pickup();
}
