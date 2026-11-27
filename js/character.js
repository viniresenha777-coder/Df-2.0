"use strict";
// =====================================================================
//  Personagem: implantes, atributos, experiência, fome, sede e cura
// =====================================================================

// ---------- Implantes ----------
function newImplant(id) {
  const im = { id, alloc: {} };
  if (id === FM_MIMIC_ID) im.tokenBound = true;      // o Mimic do kit é intransferível
  return im;
}
// Só implantes marcados com drop: true caem no saque (os 29 atuais não caem: só loja/eventos).
// A chance de cair é a mesma de uma arma Lendária naquele lugar (ver lootImplantDrop em interact.js).
function dropImplantIds() { return IMP_IDS.filter((id) => IMP[id].drop && !IMP[id].kitOnly && !IMP[id].craftOnly); }
// peso no sorteio: tier 1 é o mais comum, X e Err X os mais raros
const IMPLANT_TIER_WEIGHT = { 1: 6, 2: 3, 3: 1 };
function randomImplant() {
  const ids = dropImplantIds();
  if (!ids.length) return null;
  const w = (id) => IMP[id].err ? 0.5 : IMPLANT_TIER_WEIGHT[IMP[id].tier] || 1;
  let r = Math.random() * ids.reduce((a, id) => a + w(id), 0);
  for (const id of ids) { r -= w(id); if (r <= 0) return newImplant(id); }
  return newImplant(ids[ids.length - 1]);
}
function impColor(im) { return IMP_COLOR[IMP[im.id].kind || 0]; }
function implantName(im) { return IMP[im.id].name; }
function allocUsed(im) { let n = 0; for (const k in im.alloc || {}) n += im.alloc[k]; return n; }
// save antigo ou mexido: só entra implante que existe, com os pontos dentro do limite
function cleanImplant(im) {
  if (!im || !IMP[im.id]) return null;
  const d = IMP[im.id], out = newImplant(im.id);
  if (im.id === "implante_28" && typeof im.betaGiftId === "string") {
    out.betaGiftId = im.betaGiftId;
    out.semTroca = true;
  }
  if (im.tokenBound === true) out.tokenBound = true;
  if (im.semTroca === true) out.semTroca = true;   // presente do ADM marcado como não transferível
  if (im.validadeDias && im.presente) Object.assign(out, { presente: im.presente, validadeDias: im.validadeDias, expiraEm: im.expiraEm, semTroca: true });
  if (d.alloc && im.alloc) {
    let left = d.alloc.points;
    for (const o of d.alloc.opts) { const n = Math.max(0, Math.min(left, im.alloc[o.key] | 0)); if (n) { out.alloc[o.key] = n; left -= n; } }
  }
  return out;
}
// efeitos de um implante (fixos + pontos distribuídos). O Mímico copia o da esquerda, com os negativos em dobro.
function implantFx(im, i, list) {
  const d = IMP[im.id], fx = {};
  if (d.mimic) {
    const left = list && i > 0 ? list[i - 1] : null;
    if (!left || !IMP[left.id] || IMP[left.id].mimic) return fx;
    const src = implantFx(left, i - 1, list);
    for (const k in src) fx[k] = src[k] < 0 ? src[k] * 2 : src[k];
    return fx;
  }
  for (const k in d.fx) fx[k] = d.fx[k];
  if (d.alloc) for (const o of d.alloc.opts) { const n = (im.alloc && im.alloc[o.key]) || 0; if (n) fx[o.key] = (fx[o.key] || 0) + n * o.per; }
  if (im.id === "implante_28" && im.betaGiftId) {
    const beta = window.fmBetaAccess;
    const now = beta?.clockTime + (performance.now() - beta?.clockBase);
    if (!(beta?.implant_gift_id === im.betaGiftId && now < Date.parse(beta.beta_expires_at)))
      for (const key of Object.keys(fx)) fx[key] *= 0.5;
  }
  return fx;
}
function fxText(fx) { return Object.keys(fx).filter((k) => fx[k]).map((k) => `${sgn(fx[k])}% ${FX_LABEL[k] || k}`).join(" · "); }
function implantDesc(im) {
  const d = IMP[im.id], i = save.installed.indexOf(im), parts = [];
  if (d.mimic) {
    const left = i > 0 ? save.installed[i - 1] : null;
    if (left && !IMP[left.id].mimic) parts.push(`Copiando ${implantName(left)}: ${fxText(implantFx(im, i, save.installed)) || "nada"}`);
  } else {
    const t = fxText(im.betaGiftId ? implantFx(im, i, save.installed) : d.fx || {});
    if (im.betaGiftId) parts.push("Beta Tester · bônus integral por 60 dias; depois metade permanente");
    if (t) parts.push(t);
    if (d.alloc) {
      const a = {}; for (const o of d.alloc.opts) if (im.alloc && im.alloc[o.key]) a[o.key] = im.alloc[o.key] * o.per;
      parts.push(`Pontos ${allocUsed(im)}/${d.alloc.points}${allocUsed(im) ? ": " + fxText(a) : " (arraste para o boneco para distribuir)"}`);
    }
  }
  if (d.text) parts.push(d.text);
  return parts.join(" · ");
}
// por que este implante não pode ser instalado agora (ou null se pode)
// dois iguais, ou dois de cópia (Mimic), não podem ficar instalados juntos
function fmImplantInstallConflict(first, second) {
  return first === second || !!(IMP[first]?.mimic && IMP[second]?.mimic);
}
function installBlock(im) {
  if (save.installed.some((x) => fmImplantInstallConflict(x.id, im.id)))
    return "Já existe um implante igual ou com o mesmo efeito de cópia instalado.";
  if (save.installed.length >= implantUnlockedSlots(player.level))
    return "Slots ocupados. Próximo desbloqueio no nível " +
      (IMPLANT_SLOT_LEVELS[save.installed.length] || 200);
  return null;
}
function canSwapImplants() { return inSafe() || !!(player.flags && player.flags.hook); }
function recalcImplants() {
  const all = {}, safe = {}, flags = {};
  STAT_KEYS.forEach((k) => { all[k] = 0; safe[k] = 0; });
  // Não perder implantes de saves antigos, mas suspender o efeito em slots
  // que ainda não foram desbloqueados após a migração.
  save.installed.slice(0, implantUnlockedSlots(player.level)).forEach((im, i) => {
    const fx = implantFx(im, i, save.installed);
    for (const k in fx) { all[k] = (all[k] || 0) + fx[k]; if (fx[k] > 0) safe[k] = (safe[k] || 0) + fx[k]; }
    if (IMP[im.id].flag) flags[IMP[im.id].flag] = true;
  });
  const pf = prof(); // bônus e penalidades da profissão
  if (pf && pf.fx) for (const k in pf.fx) { all[k] = (all[k] || 0) + pf.fx[k]; safe[k] = (safe[k] || 0) + pf.fx[k]; }
  // O evento usa o mesmo sistema FX de implantes/profissões, mas não ocupa slot.
  // Inserir no recálculo (e não no save) impede acúmulo ao reconectar ou trocar implantes.
  if (EVENTO_NATAL.ativo) for (const k in EVENTO_NATAL.bonus) {
    const bonus = EVENTO_NATAL.bonus[k];
    all[k] = (all[k] || 0) + bonus;
    safe[k] = (safe[k] || 0) + bonus;
  }
  player.fxAll = all; player.fxSafe = safe; player.flags = flags; player.fx = all;
  const vest = save.vest >= 0 ? vestDefinition(save.vest) : null;
  // Endurance vale a mesma quantidade em HP. Colete e implantes acrescentam
  // pontos de vida até o limite absoluto de 200, sem bônus automático por nível.
  const baseHp = Number.isFinite(player.attrs.endurance) ? player.attrs.endurance : 25;
  const implantBonus = Math.max(-20, Math.min(35, all.vigor || 0));
  const vestBonus = Math.max(0, Math.min(25, vest && vest.hp ? vest.hp : 0));
  player.maxHp = Math.max(1, Math.min(PLAYER_HP_CAP, baseHp + implantBonus + vestBonus));
  player.hp = Math.min(player.hp, player.maxHp);
  lastStandTick();
}
// Último Suspiro (Desafia-Morte): com a vida crítica, as penalidades dos implantes deixam de valer
function lastStandTick() {
  if (!player.fxAll) return;
  const beta = window.fmBetaAccess;
  if (beta?.beta_expires_at) {
    const expired = beta.clockTime + performance.now() - beta.clockBase >= Date.parse(beta.beta_expires_at);
    const changed = player.betaExpired !== undefined && player.betaExpired !== expired;
    player.betaExpired = expired;
    if (changed) { recalcImplants(); return; }
  }
  player.fx = player.flags.lastStand && player.hp / player.maxHp < 0.25 ? player.fxSafe : player.fxAll;
}
function makeStock() { return IMP_IDS.filter((id) => !IMP[id].kitOnly && !IMP[id].craftOnly && IMP[id].price > 0).sort((a, b) => IMP[a].price - IMP[b].price).map((id) => ({ id, price: IMP[id].price })); }


// ---------- Esquemas de implantes (presets) ----------
function implantPresetSave(name) {
  name = String(name || "").trim().slice(0, 24);
  if (!name) { toast("Informe um nome para o esquema."); return false; }
  const installed = save.installed.slice(0, implantUnlockedSlots(player.level));
  if (!installed.length) { toast("Equipe pelo menos um implante antes de salvar um esquema."); return false; }
  const presets = save.implantPresets || (save.implantPresets = []);
  const existing = presets.findIndex(p => p.name.toLocaleLowerCase("pt-BR") === name.toLocaleLowerCase("pt-BR"));
  if (existing < 0 && presets.length >= IMPLANT_PRESET_MAX) {
    toast("Limite de " + IMPLANT_PRESET_MAX + " esquemas. Exclua um para salvar outro.");
    return false;
  }
  const entry = { name, slots: installed.map(im => ({
    id: im.id, alloc: { ...(im.alloc || {}) }
  })) };
  if (existing >= 0) presets[existing] = entry; else presets.push(entry);
  game.implantPresetSelected = name;
  game.implantDropdown = false;
  checkpoint("salvou esquema de implantes");
  toast("Esquema " + name + " salvo (" + entry.slots.length + " implantes).");
  return true;
}
function implantPresetApply(name) {
  const preset = (save.implantPresets || []).find(p => p.name === name);
  if (!preset) { toast("Esquema não encontrado."); return false; }
  const slots = preset.slots || [];
  if (slots.length > implantUnlockedSlots(player.level)) {
    const needed = IMPLANT_SLOT_LEVELS[slots.length - 1];
    toast("Este esquema precisa do nível " + needed + " para equipar todos os slots.");
    return false;
  }
  // A montagem trabalha com referências reais dos implantes já possuídos:
  // presets não criam itens, não clonam implantes e não ignoram a mochila.
  const available = [...save.installed, ...player.bag];
  const remaining = available.slice(), chosen = [];
  for (const template of slots) {
    if (!template || !IMP[template.id] || chosen.some(({ actual }) => fmImplantInstallConflict(actual.id, template.id))) {
      toast("Esquema inválido: implante repetido ou desconhecido.");
      return false;
    }
    const idx = remaining.findIndex(im => im.id === template.id);
    if (idx < 0) { toast("Falta o implante " + implantName(template) + " para este esquema."); return false; }
    chosen.push({ actual: remaining.splice(idx, 1)[0], template });
  }
  if (remaining.length > BAG_MAX) {
    toast("Não há espaço na mochila para trocar este esquema (precisa de " + remaining.length + ").");
    return false;
  }
  for (const {actual} of chosen) {
    if (!fmGifts.ready(actual, () => implantPresetApply(name))) return false;
  }
  // Todas as verificações foram realizadas, agora a troca é atômica.
  for (const item of chosen) {
    const cleaned = cleanImplant(item.template);
    item.actual.alloc = { ...(cleaned ? cleaned.alloc : {}) };
  }
  save.installed = chosen.map(entry => entry.actual);
  player.bag = remaining;
  game.implantPresetSelected = name;
  game.implantDropdown = false;
  game.cur = 0;
  recalcImplants();
  checkpoint("ativou esquema de implantes");
  toast("Esquema " + name + " equipado.");
  return true;
}
function implantPresetRemove(name) {
  const presets = save.implantPresets || [];
  const index = presets.findIndex(p => p.name === name);
  if (index < 0) return false;
  presets.splice(index, 1);
  if (game.implantPresetSelected === name) game.implantPresetSelected = null;
  checkpoint("apagou esquema de implantes");
  toast("Esquema " + name + " excluído. Implantes preservados.");
  return true;
}
// Somente os bônus dos implantes do esquema; não soma evento, VIP ou profissão.
function implantPresetTotals(preset) {
  const raw = preset ? preset.slots : save.installed.slice(0, implantUnlockedSlots(player.level));
  const list = (raw || []).map(cleanImplant).filter(Boolean);
  const totals = {}, flags = [];
  for (let i = 0; i < list.length; i++) {
    const im = list[i], fx = implantFx(im, i, list);
    for (const key in fx) totals[key] = (totals[key] || 0) + fx[key];
    if (IMP[im.id].flag && !flags.includes(IMP[im.id].flag)) flags.push(IMP[im.id].flag);
  }
  return { totals, flags, count: list.length };
}

// ---------- Atributos ----------
// curva de XP: nível 200 leva ~300 h jogando COM o bônus de evento (+100% XP) e ~630 h sem bônus
// (simulação com ~300 abates/h subindo de região). VIP dobra o XP por cima.
function xpNeed(l) { return Math.round(200 + 100 * l + 0.6 * Math.pow(l, 2.5)); }
function A(id) { return player.attrs[id]; }
// Vest and implant protection stack additively; attribute armor remains a separate layer.
function equipmentProtection() {
  const vest = save.vest >= 0 ? (vestDefinition(save.vest).armor + vestUpgrade().armor) * vestEff() : 0;
  return Math.max(-50, Math.min(95, vest + (player.fx.thick || 0)));
}
function trindadeActive() { return (save.trindadeUntil || 0) > fmWorld.nowMs(); }
function armorRed() {
  const a = A("armor") / (A("armor") + 150);
  const baseline = Math.min(0.78, 1 - (1 - a) * (1 - equipmentProtection() / 100));
  const boosted = baseline * (trindadeActive() ? 1.35 : 1);
  // Urso de Ferro tem teto próprio de 80% de redução total.
  return Math.min(player.flags.jugger ? 0.8 : 0.95, boosted);
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
  save.char.level = player.level; save.char.xp = player.xp; save.char.points = player.points; save.char.wpoints = player.wpoints; save.char.skillCurve = WEAPON_CURVE;
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
    // O servidor aceita no máximo +3 níveis por revisão. Um ganho grande
    // de XP (boss/evento) precisa salvar etapas intermediárias ANTES que
    // o navegador continue subindo mais níveis na mesma chamada.
    // Sem isso o servidor restaurava silenciosamente o nível antigo,
    // embora aceitasse o dinheiro e os itens do jogador.
    if (up % 3 === 0 && player.level < MAX_LEVEL &&
        player.xp >= xpNeed(player.level)) {
      syncChar();
      if (typeof checkpoint === "function") checkpoint("progresso de nível");
    }
  }
  if (player.level >= MAX_LEVEL) player.xp = 0;
  if (up) {
    recalcImplants(); player.hp = Math.min(player.maxHp, player.hp + 10 * up);
    sfx.level();
    game.banner = { text: `Nível ${player.level}!`, sub: "Distribua seus pontos em Atributos, na base", t: 2600, gold: true };
  }
  syncChar();
  // cada subida de nível grava o save completo na hora (o servidor só aceita poucos níveis por salvamento)
  if (up && typeof checkpoint === "function") checkpoint("subiu de nível");
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
