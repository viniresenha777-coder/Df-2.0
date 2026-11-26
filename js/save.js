"use strict";
// =====================================================================
//  Progresso que não se perde ao morrer: banco, baú da base (armas e
//  materiais), implantes instalados, personagem, missões, colete e postos.
// =====================================================================
const SAVE_KEY = "fronteira-morta";
const save = {
  bank: 0, vault: [], vaultRows: 5, installed: [], implantPresets: [], credits: 0, gm: false, vipUntil: 0, trindadeUntil: 0, shopFreeUntil: 0, missions: [], receivedGifts: [], inbox: [],
  vest: -1, fmInventoryOrder: [], clothing: { jacket: "cl_moletom", pants: "cl_pants_cargo_futurista", boots: "cl_boots_sapatos_couro" }, roupaInicial: true, outposts: OUTPOSTS.map((o, i) => i === 0), muted: false, hud: 0, skin: 0, cape: 0, prof: null, name: "", classicChar: false, vestDur: {}, vestUpgrades: {}, vestShow: true, music: true, gfx: 2, ambientVolume: 0.55, brightness: 1.0,
  stats: {}, story: 0, ach: {}, daily: null, coll: [], vestsOwned: VESTS.map(() => false), clothesOwned: {}, vestVer: 2,
  char: { level: 1, xp: 0, points: 0, wpoints: 0, attrs: defaultAttrs() }
};

function validItem(it) {
  if (!it) return false;
  // o Baú da Base guarda qualquer tipo de item (munição, implante, colete, roupa, comida e suprimentos)
  if (it.kind === "ammo") {
    if (!Object.prototype.hasOwnProperty.call(AMMO, it.id)) return false;
    it.qty = Math.min(500000, Math.floor(Number(it.qty) || 0));
    it.tokenQty = Math.max(0, Math.min(it.qty, Math.floor(Number(it.tokenQty) || 0)));
    return it.qty > 0;
  }
  if (it.kind === "implant") {
    if (!IMP[it.id]) return false;
    const obj = cleanImplant(it);
    if (!obj) return false;
    it.alloc = obj.alloc;
    it.tokenBound = obj.tokenBound === true;
    return true;
  }
  if (it.kind === "vest") return Number.isInteger(it.id) && !!VESTS[it.id];
  if (it.kind === "clothing") return !!CLOTHING_BY_ID[it.id];
  if (it.kind === "food") {
    if (!["fresca", "comum", "podre"].includes(it.id)) return false;
    it.qty = Math.min(500000, Math.floor(Number(it.qty) || 0));
    return it.qty > 0;
  }
  if (["water", "med", "anti"].includes(it.kind)) {
    it.qty = Math.min(500000, Math.floor(Number(it.qty) || 0));
    return it.qty > 0;
  }
  if (it.kind === "weapon") {
    if (it.id === "revolver_orn") it.id = "revolver";
    if (it.id === "baioneta") it.id = "m4";
    if (!WDEF[it.id] || WDEF[it.id].fists) return false;
    it.up = it.up || {};
    for (const s of UP_STATS) it.up[s.id] = clamp(Math.floor(it.up[s.id] || 0), 0, UP_MAX);
    it.ammo = clamp(it.ammo || 0, 0, WDEF[it.id].mag || 0);
    return true;
  }
  return it.kind === "mat" && !!MATS[it.id] && it.qty > 0;
}
function loadSave() {
  try {
    const s = JSON.parse(storeGet());
    if (!s) return;
    save.bank = s.bank || 0;
    save.saleTotal = Number(s.saleTotal) || 0;
    save.run = s.run && s.run.v === 1 ? s.run : null; // checkpoint da partida
    if (Array.isArray(s.vault)) save.vault = s.vault.filter(validItem).slice(0, VAULT_MAX);
    else if (Array.isArray(s.stash)) save.vault = s.stash.map((v, i) => (v && OLD_IDS[i] ? newInst(OLD_IDS[i]) : null)).filter(Boolean); // save antigo
    save.vaultRows = Math.min(50, Math.max(5, Math.floor(Number(s.vaultRows) || 5), 5 + Math.ceil(Math.max(0, save.vault.length - 40) / 8)));
    { const seen = {}; save.installed = (s.installed || []).map(cleanImplant).filter((im) => im && !seen[im.id] && (seen[im.id] = true)).slice(0, IMPL_SLOTS); }
    // Os esquemas armazenam somente a ordem e distribuição dos implantes.
    // Na ativação, o jogador precisa possuir cada implante de verdade.
    save.implantPresets = Array.isArray(s.implantPresets) ? s.implantPresets.slice(0, IMPLANT_PRESET_MAX)
      .filter(p => p && typeof p.name === "string" && Array.isArray(p.slots))
      .map(p => ({ name: p.name.trim().slice(0, 24),
        slots: p.slots.slice(0, IMPL_SLOTS).map(cleanImplant).filter(Boolean)
          .map(im => ({ id: im.id, alloc: im.alloc }))
      }))
      .filter(p => p.name && new Set(p.slots.map(im => im.id)).size === p.slots.length)
      : [];
    save.credits = s.credits || 0; save.gm = !!s.gm;
    save.vipUntil = Number.isFinite(s.vipUntil) && s.vipUntil > 0 ? Math.floor(s.vipUntil) : 0;
    save.trindadeUntil = Number.isFinite(s.trindadeUntil) && s.trindadeUntil > 0 ? Math.floor(s.trindadeUntil) : 0;
    save.shopFreeUntil = Number.isFinite(s.shopFreeUntil) && s.shopFreeUntil > 0 ? Math.floor(s.shopFreeUntil) : 0;
    save.inbox = Array.isArray(s.inbox)
      ? s.inbox.filter(x => x && typeof x.id === "string" && typeof x.text === "string")
        .slice(-100).map(x => ({ id: x.id.slice(0,50), text: x.text.slice(0,200),
          createdAt: Number(x.createdAt) || Date.now(), read: !!x.read })) : [];
    save.receivedGifts = Array.isArray(s.receivedGifts) ? s.receivedGifts.filter(id => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(-2000) : [];
    save.missions = (s.missions || []).filter((m) => m && m.type && m.target).slice(0, 3);
    save.vest = typeof s.vest === "number" ? s.vest : -1;
    if (s.vestVer !== 2 && save.vest >= 0) save.vest = [0, 2, 4][save.vest] != null ? [0, 2, 4][save.vest] : 0; // coletes do save antigo
    save.vest = clamp(save.vest, -1, VESTS.length - 1);
    save.vestsOwned = VESTS.map((v, i) => !!(s.vestsOwned && s.vestsOwned[i]) || i === save.vest);
    save.vestUpgrades = {};
    for (let i = 0; i < VESTS.length; i++) if (save.vestsOwned[i])
      save.vestUpgrades[i] = cleanVestUpgrade(s.vestUpgrades && s.vestUpgrades[i]);
    save.outposts = OUTPOSTS.map((o, i) => i === 0 || !!(s.outposts && s.outposts[i]));
    save.muted = !!s.muted; save.hud = s.hud === 1 ? 1 : 0; save.skin = clamp(s.skin | 0, 0, SKINS.length - 1); save.clothing = clothingClean(s.clothing);
    save.resetFreeAt = Number(s.resetFreeAt) || 0;   // último reset de atributos grátis (1 por mês)
    // roupa inicial (moletom com capuz, calça cargo futurista, sapatos de couro): personagem novo já vem vestido;
    // save antigo recebe uma vez só nas partes que estiverem vazias (depois o jogador tira se quiser)
    if (!s.roupaInicial) {
      const ini = { jacket: "cl_moletom", pants: "cl_pants_cargo_futurista", boots: "cl_boots_sapatos_couro" };
      for (const k in ini) if (!save.clothing[k]) save.clothing[k] = ini[k];
    }
    save.roupaInicial = true;
    // capa e máscaras compradas; save antigo: quem já estava usando uma fica com ela
    save.clothesOwned = {};
    for (const id in CREDIT_CLOTHING) {
      if (s.clothesOwned ? s.clothesOwned[id] === true : Object.values(save.clothing).includes(id)) save.clothesOwned[id] = true;
    }
    for (const kind of CLOTHING_KINDS) if (save.clothing[kind] && !clothingOwned(save.clothing[kind])) save.clothing[kind] = null;
    save.fmInventoryOrder = Array.isArray(s.fmInventoryOrder) ? s.fmInventoryOrder.filter((k) => k === null || typeof k === "string").slice(0, 150) : [];
    save.cape = clamp(s.cape | 0, 0, CAPES.length - 1); save.vestShow = s.vestShow !== false; save.prof = typeof s.prof === "string" ? s.prof : null; save.name = typeof s.name === "string" ? s.name.slice(0, 16) : ""; save.classicChar = false; // Somente o novo boneco está disponível.
    save.vestDur = s.vestDur && typeof s.vestDur === "object" ? s.vestDur : {};
    save.music = s.music !== false;
    // sliders do menu: dados antigos recebem padrões seguros
    save.ambientVolume = Number.isFinite(s.ambientVolume) ? clamp(s.ambientVolume, 0, 1) : 0.55;
    save.brightness = Number.isFinite(s.brightness) ? clamp(s.brightness, 0.55, 1.6) : 1;
    save.gfx = s.gfx === 0 || s.gfx === 1 ? s.gfx : 2;
    save.stats = s.stats && typeof s.stats === "object" ? s.stats : {};
    save.story = s.story | 0; save.ach = s.ach && typeof s.ach === "object" ? s.ach : {};
    save.daily = s.daily && s.daily.list ? s.daily : null;
    save.coll = Array.isArray(s.coll) ? s.coll.filter((id) => WDEF[id]) : [];
    if (s.char) {
      const c = s.char;
      save.char.level = Math.min(MAX_LEVEL, Math.max(1, c.level || 1));
      save.char.xp = c.xp || 0; save.char.points = c.points || 0; save.char.wpoints = c.wpoints || 0;
      // Migração: valores de versões antigas acima dos novos limites voltam
      // para a reserva de pontos correspondente, sem apagar investimento.
      ATTRS.forEach((d) => {
        const raw = c.attrs && Number(c.attrs[d.id]);
        const previous = Number.isFinite(raw) ? Math.max(d.start, Math.floor(raw)) : d.start;
        const cap = weaponSkillCap(d.id);
        save.char.attrs[d.id] = Math.min(cap, previous);
        const excess = Math.max(0, previous - cap);
        if (excess) {
          if (WEAPON_SKILL_IDS.includes(d.id)) save.char.wpoints += excess;
          else save.char.points += excess;
        }
      });
    }
  } catch (e) { /* sem armazenamento: o progresso vale só nesta sessão */ }
}
// no .exe o arquivo só é gravado nos checkpoints (troca de área e a cada 1 minuto)
// VIP adquirido no jogo antigo permanece válido como benefício legado.
// Presentes novos são temporários: duração em meses de calendário UTC.
function vipActive() { return !!save.gm || (save.vipUntil || 0) > Date.now(); }
function addVipMonths(months) {
  if (![1, 6, 12].includes(months)) throw new Error("Prazo de VIP não permitido.");
  const start = new Date(Math.max(Date.now(), Number(save.vipUntil) || 0));
  const targetMonth = start.getUTCMonth() + months;
  const d = start.getUTCDate(), next = new Date(start.valueOf());
  next.setUTCDate(1); next.setUTCMonth(targetMonth);
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth()+1, 0)).getUTCDate();
  next.setUTCDate(Math.min(d, last));
  save.vipUntil = next.getTime();
  return save.vipUntil;
}
function vipStatus() {
  if (save.gm) return "VIP legado (sem vencimento)";
  if ((save.vipUntil || 0) <= Date.now()) return "inativo";
  return "ativo até " + new Date(save.vipUntil).toLocaleDateString("pt-BR");
}
function inboxUnread() { return (save.inbox || []).filter(m => !m.read).length; }
function markInboxRead() { if (!save.inbox) return; save.inbox.forEach(x => { x.read = true; }); persist(); }

function persist() {
  if (NATIVE) return;
  storeWrite(JSON.stringify(save)).catch((error) => {
    console.error("Falha ao sincronizar progresso:", error);
    if (typeof game !== "undefined" && game && !game.savingExit)
      toast("Falha na sincronização online. Use Salvar progresso para tentar novamente.");
  });
}
