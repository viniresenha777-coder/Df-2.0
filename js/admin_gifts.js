"use strict";
// Correio administrativo: o Supabase autoriza as ofertas; somente contas
// registradas em fm_administradores podem criar presentes (RLS no servidor).
const fmGifts = (() => {
  let timer = null, busy = false;
  const db = () => fmCloud.socialClient();
  const uid = () => fmCloud.userId();
  const normalize = v => String(v || "").trim();
  const types = new Set(["dinheiro", "vip", "creditos", "arma", "implante", "colete", "roupa", "material", "municao", "suprimento"]);
  const SUPRIMENTOS = { comida: "Comida", water: "Água", med: "Kit médico", anti: "Antibiótico" };
  const comItem = new Set(["arma", "implante", "colete", "roupa", "material", "municao", "suprimento"]);
  const unico = new Set(["arma", "implante", "colete", "roupa"]);     // quantidade sempre 1
  const comTroca = new Set(["arma", "implante", "colete"]);           // aceitam "não transferível"
  function permitePrazo(type, id) {
    return comTroca.has(type) || (type === "material" && ["trindade_eterna", "token_loja"].includes(id));
  }
  function itemValido(type, id) {
    if (type === "arma") return !!WDEF[id] && !WDEF[id].fists;
    if (type === "implante") return !!IMP[id];
    if (type === "colete") return !!VESTS[Number(id)];
    if (type === "roupa") return !!CLOTHING_BY_ID[id];
    if (type === "material") return Object.prototype.hasOwnProperty.call(MATS, id);
    if (type === "municao") return Object.prototype.hasOwnProperty.call(AMMO, id);
    if (type === "suprimento") return Object.prototype.hasOwnProperty.call(SUPRIMENTOS, id);
    return true;
  }
  function itemNome(type, id) {
    if (type === "arma") return WDEF[id] ? WDEF[id].name : id;
    if (type === "implante") return IMP[id] ? IMP[id].name : id;
    if (type === "colete") return VESTS[Number(id)] ? VESTS[Number(id)].name : id;
    if (type === "roupa") return CLOTHING_BY_ID[id] ? CLOTHING_BY_ID[id].name : id;
    if (type === "material") return MATS[id] ? MATS[id].name : id;
    if (type === "municao") return "Munição " + id;
    if (type === "suprimento") return SUPRIMENTOS[id] || id;
    return "";
  }
  // texto curto de um presente (histórico do ADM e Mensagens do jogador)
  function descrever(g) {
    const n = Number(g.quantidade) || 0;
    if (g.tipo === "dinheiro") return (g.item_id === "analise" ? "Liberado da análise: " : "") + "$" + n.toLocaleString("pt-BR");
    if (g.tipo === "vip") return "VIP de " + (n === 12 ? "1 ano" : n + (n === 1 ? " mês" : " meses"));
    if (g.tipo === "creditos") return n.toLocaleString("pt-BR") + " créditos";
    const nome = itemNome(g.tipo, g.item_id);
    const base = unico.has(g.tipo) ? nome : n.toLocaleString("pt-BR") + "x " + nome;
    if (g.validade_dias) return base + " · " + g.validade_dias + " dia(s) após o primeiro uso · Não transferível";
    return base + (comTroca.has(g.tipo) && g.transferivel === false ? " (Não transferível)" : "");
  }

  async function send(name, type, amount, itemId, transferivel = true, dias = 0) {
    if (!fmCloud.isActive() || !fmCloud.isAdmin()) throw new Error("Envio indisponível.");
    const targetName = normalize(name);
    if (targetName.length < 3 || targetName.length > 16) throw new Error("Digite o nome exato do jogador.");
    if (!types.has(type)) throw new Error("Tipo de presente inválido.");
    if (!Number.isInteger(dias) || dias < 0 || dias > 36500 || (dias && !permitePrazo(type, itemId))) throw new Error("Validade inválida.");
    const n = (dias > 0 || unico.has(type)) ? 1 : Math.floor(Number(amount));
    if (type === "vip" && ![1, 6, 12].includes(n)) throw new Error("Escolha VIP por 1 mês, 6 meses ou 1 ano.");
    if (!Number.isInteger(n) || n < 1 || n > 10000000) throw new Error("Quantidade inválida.");
    if ((type === "material" || type === "suprimento") && n > 1000) throw new Error("Máximo: 1.000 unidades.");
    if ((type === "municao" || type === "creditos") && n > 100000) throw new Error("Máximo: 100.000.");
    if (comItem.has(type) && !itemValido(type, itemId)) throw new Error("Item inexistente.");
    const { data: profiles, error: lookupError } = await db().from("fm_perfis")
      .select("jogador,nome").ilike("nome", targetName).limit(25);
    if (lookupError) throw new Error("Falha ao buscar jogador: " + lookupError.message);
    const target = (profiles || []).find(p => p.nome.toLocaleLowerCase("pt-BR") === targetName.toLocaleLowerCase("pt-BR"));
    if (!target) throw new Error("Jogador não encontrado: confira o nome exato.");
    if (target.jogador === uid()) throw new Error("O destinatário precisa ser outra conta.");
    const payload = {
      remetente: uid(), destinatario: target.jogador, tipo: type,
      quantidade: n, item_id: comItem.has(type) ? String(itemId) : null,
      validade_dias: dias, transferivel: dias ? false : comTroca.has(type) ? !!transferivel : true
    };
    const { error } = await db().from("fm_presentes").insert(payload);
    if (error) throw new Error("Envio recusado pelo servidor: " + error.message);
    return "Presente enviado para " + target.nome + ": " + descrever(payload) + ".";
  }

  // histórico do que este ADM enviou (o RLS só deixa ler os presentes que ele mesmo mandou)
  async function history() {
    const { data, error } = await db().from("fm_presentes")
      .select("id,destinatario,tipo,quantidade,item_id,validade_dias,transferivel,criado_em,recebido_em,reivindicar_em,reivindicado_em,reivindicado_resultado")
      .eq("remetente", uid()).order("criado_em", { ascending: false }).limit(60);
    if (error) throw new Error(error.message);
    const ids = [...new Set((data || []).map(g => g.destinatario))];
    const nomes = {};
    if (ids.length) {
      const { data: perfis } = await db().from("fm_perfis").select("jogador,nome").in("jogador", ids);
      (perfis || []).forEach(p => { nomes[p.jogador] = p.nome; });
    }
    return (data || []).map(g => ({ ...g, nome: nomes[g.destinatario] || "?", texto: descrever(g) }));
  }

  // ADM: reivindica um presente (pendente: exclui; entregue: arma, dinheiro e créditos são retirados do jogador)
  async function reclaim(id) {
    const { data, error } = await db().rpc("fm_presente_reivindicar", { presente: id });
    if (error) throw new Error(error.message);
    return data === "excluido" ? "Presente excluído: o jogador não vai mais receber." : "Reivindicado: o item sai do jogador assim que o jogo dele conferir (em até 12 s, ou quando ele entrar).";
  }
  // jogador: retira o que o ADM reivindicou (a arma é achada pela marca do presente)
  function retirar(g) {
    const n = Number(g.quantidade) || 0;
    if (g.tipo === "arma") {
      const i = player.slots.findIndex(w => w && w.presente === g.id);
      if (i >= 0) { player.slots[i] = null; if (player.cur === i) { player.cur = Math.max(0, player.slots.findIndex(Boolean)); player.reloading = 0; } return "arma retirada"; }
      for (const list of [player.pack, save.vault]) {
        const k = list.findIndex(w => w && w.kind === "weapon" && w.presente === g.id);
        if (k >= 0) { list.splice(k, 1); return "arma retirada"; }
      }
      return "arma não encontrada (vendida ou descartada)";
    }
    if (g.tipo === "dinheiro") {
      const daMochila = Math.min(game.money, n), doBanco = Math.min(save.bank, n - daMochila);
      game.money -= daMochila; save.bank -= doBanco;
      if (daMochila + doBanco) logMoney("Reivindicado pelo ADM", "", -(daMochila + doBanco));
      return "$" + (daMochila + doBanco).toLocaleString("pt-BR") + " de $" + n.toLocaleString("pt-BR") + " retirados";
    }
    if (g.tipo === "creditos") {
      const t = Math.min(save.credits || 0, n);
      save.credits = (save.credits || 0) - t;
      return t + " de " + n + " créditos retirados";
    }
    return "nada a retirar";
  }
  async function pollReclaims() {
    const { data, error } = await db().from("fm_presentes")
      .select("id,tipo,quantidade,item_id,transferivel")
      .eq("destinatario", uid()).not("reivindicar_em", "is", null).is("reivindicado_em", null).limit(10);
    if (error) throw error;
    for (const g of data || []) {
      const resultado = retirar(g);
      if (!Array.isArray(save.inbox)) save.inbox = [];
      save.inbox.push({ id: "r" + g.id, text: "O administrador reivindicou: " + descrever(g) + " (" + resultado + ")", createdAt: Date.now(), read: false });
      save.inbox = save.inbox.slice(-100);
      save.run = runSnapshot();
      await storeWrite(JSON.stringify(save));
      await db().rpc("fm_presente_reivindicado", { presente: g.id, resultado });
      toast("O administrador reivindicou um presente. Veja em Mensagens (I).");
    }
  }

  async function acknowledge(id) {
    const { error } = await db().from("fm_presentes")
      .update({ recebido_em: new Date().toISOString() })
      .eq("id", id).eq("destinatario", uid()).is("recebido_em", null);
    if (error) console.warn("Aviso: entrega já salva, confirmação pendente:", error);
  }
  function canReceive(g) {
    if (!types.has(g.tipo) || (comItem.has(g.tipo) && !itemValido(g.tipo, g.item_id))) return false;
    if (g.validade_dias && ["arma","material"].includes(g.tipo)) return packUsed() < packCapacity();
    if (g.tipo === "arma" && window.fmBetaAccess?.weapon_gift_ids?.includes(g.id)) return packUsed() < packCapacity();
    if (g.tipo === "arma") return player.slots.includes(null) || packUsed() < packCapacity();
    if (g.tipo === "material") return player.pack.some(it => it.kind === "mat" && it.id === g.item_id && !it.loot) || packUsed() < packCapacity();
    if (g.tipo === "implante") return player.bag.length < BAG_MAX;
    if (g.tipo === "vip") return [1, 6, 12].includes(g.quantidade);
    return Number.isInteger(g.quantidade) && g.quantidade > 0;
  }
  function apply(g) {
    if (g.validade_dias) {
      const marca = { presente: g.id, validadeDias: g.validade_dias, semTroca: true };
      if (g.tipo === "arma") player.pack.push(Object.assign(newInst(g.item_id), marca));
      else if (g.tipo === "implante") player.bag.push(Object.assign(newImplant(g.item_id), marca));
      else if (g.tipo === "material") player.pack.push({ ...marca, kind: "mat", id: g.item_id, qty: 1 });
      else if (g.tipo === "colete") {
        const key = Math.max(10000, ...Object.keys(save.giftVests).map(Number)) + 1;
        save.giftVests = { ...save.giftVests, [key]: { ...marca, id: Number(g.item_id), i: key } };
      } else return false;
      return true;
    }
    const semTroca = g.transferivel === false;
    if (g.tipo === "dinheiro" && g.item_id === "analise") { save.bank += g.quantidade; logMoney("Liberado pelo ADM", "análise", g.quantidade); }
    else if (g.tipo === "dinheiro") { game.money += g.quantidade; logMoney("Presente ADM", "", g.quantidade); }
    else if (g.tipo === "vip") addVipMonths(g.quantidade);
    else if (g.tipo === "creditos") save.credits = (save.credits || 0) + g.quantidade;
    else if (g.tipo === "arma") { const inst = newInst(g.item_id); inst.presente = g.id; if (semTroca) inst.semTroca = true;
      if (window.fmBetaAccess?.weapon_gift_ids?.includes(g.id)) {
        if (packUsed() >= packCapacity()) return false;
        player.pack.push(inst); return true;
      }
      return !!addWeapon(inst); }
    else if (g.tipo === "implante") { const im = newImplant(g.item_id); if (g.id === window.fmBetaAccess?.implant_gift_id && im.id === "implante_28") {
        im.betaGiftId = g.id; im.semTroca = true;
      }
      if (semTroca) im.semTroca = true; player.bag.push(im); }
    else if (g.tipo === "colete") {
      const i = Number(g.item_id);
      save.vestsOwned[i] = true; if (save.vestDur) save.vestDur[i] = 100;
      if (!Array.isArray(save.vestSemTroca)) save.vestSemTroca = [];
      const k = save.vestSemTroca.indexOf(i);
      if (semTroca && k < 0) save.vestSemTroca.push(i); else if (!semTroca && k >= 0) save.vestSemTroca.splice(k, 1);
    }
    else if (g.tipo === "roupa") { if (!save.clothesOwned) save.clothesOwned = {}; save.clothesOwned[g.item_id] = true; }
    else if (g.tipo === "material") return !!addMat(g.item_id, g.quantidade);
    else if (g.tipo === "municao") player.reserve[g.item_id] = (player.reserve[g.item_id] || 0) + g.quantidade;
    else if (g.tipo === "suprimento") {
      if (g.item_id === "comida") { player.foodQ.comum = (player.foodQ.comum || 0) + g.quantidade; player.food += g.quantidade; }
      else player[g.item_id] = (player[g.item_id] || 0) + g.quantidade;
    }
    return true;
  }
  async function poll() {
    if (busy || !fmCloud.isActive() || !uid() || !save.name || !save.prof ||
        !world || game.over || game.savingExit || game.quitting) return;
    busy = true;
    try {
      const { data, error } = await db().from("fm_presentes")
        .select("id,tipo,quantidade,item_id,validade_dias,transferivel,criado_em")
        .eq("destinatario", uid()).is("recebido_em", null)
        .order("criado_em", { ascending: true }).limit(30);
      if (error) throw error;
      if (!Array.isArray(save.receivedGifts)) save.receivedGifts = [];
      for (const g of data || []) {
        if (save.receivedGifts.includes(g.id)) { await acknowledge(g.id); continue; }
        if (!canReceive(g)) {
          if (!game.giftBagWarnAt || Date.now() - game.giftBagWarnAt > 30000) {
            game.giftBagWarnAt = Date.now();
            toast("Você tem um presente pendente. Abra espaço na mochila!");
          }
          continue;
        }
        // Snapshot de rollback para falhas de rede. Nunca confirma presente
        // antes de salvar o UUID de recebimento no progresso do destinatário.
        const old = {
          money: game.money, bank: save.bank, gm: save.gm, vipUntil: save.vipUntil, run: save.run,
          gifts: save.receivedGifts.slice(), inbox: (save.inbox || []).slice(),
          slots: player.slots.slice(), pack: player.pack.slice(), bag: player.bag.slice(),
          credits: save.credits, giftVests: save.giftVests, vestsOwned: JSON.stringify(save.vestsOwned), vestDur: JSON.stringify(save.vestDur || {}),
          vestSemTroca: (save.vestSemTroca || []).slice(), clothesOwned: JSON.stringify(save.clothesOwned || {}),
          reserve: JSON.stringify(player.reserve), foodQ: JSON.stringify(player.foodQ), food: player.food,
          water: player.water, med: player.med, anti: player.anti
        };
        try {
          if (!apply(g)) throw new Error("Sem espaço para o presente.");
          save.receivedGifts.push(g.id);
          const description = g.tipo === "dinheiro" && g.item_id === "analise" ? "dinheiro retido liberado após análise: $" + g.quantidade.toLocaleString("pt-BR") + " (no banco)" :
            g.tipo === "vip" ? descrever(g) + " · válido até " + new Date(save.vipUntil).toLocaleDateString("pt-BR") : descrever(g);
          if (!Array.isArray(save.inbox)) save.inbox = [];
          save.inbox.push({ id: g.id, text: "Presente do administrador: " + description,
            createdAt: Date.now(), read: false });
          save.inbox = save.inbox.slice(-100);
          save.run = runSnapshot();
          await storeWrite(JSON.stringify(save));
        } catch (err) {
          game.money = old.money; save.bank = old.bank; save.gm = old.gm; save.vipUntil = old.vipUntil; save.run = old.run;
          save.receivedGifts = old.gifts; save.inbox = old.inbox;
          player.slots = old.slots; player.pack = old.pack; player.bag = old.bag; save.credits = old.credits;
          save.giftVests = old.giftVests; save.vestsOwned = JSON.parse(old.vestsOwned); save.vestDur = JSON.parse(old.vestDur); save.vestSemTroca = old.vestSemTroca;
          save.clothesOwned = JSON.parse(old.clothesOwned); player.reserve = JSON.parse(old.reserve); player.foodQ = JSON.parse(old.foodQ);
          player.food = old.food; player.water = old.water; player.med = old.med; player.anti = old.anti;
          throw err;
        }
        await acknowledge(g.id);
        game.banner = { text: "VOCÊ RECEBEU UM PRESENTE!", sub: "Abra Mensagens (I) para ver os detalhes.",
          t: 4800, gold: true };
        toast("Novo presente do administrador! Veja em Mensagens (I).");
      }
      await pollReclaims();
    } catch (err) {
      console.warn("Correio de presentes:", err);
    } finally { busy = false; }
  }
  function start() {
    if (timer) return;
    poll();
    timer = setInterval(poll, 12000);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  const activating = new Set();
  function ready(item, retry) {
    if (!item?.validadeDias) return true;
    if (item.expiraEm) return item.expiraEm > fmWorld.nowMs();
    if (activating.has(item.presente)) return false;
    activating.add(item.presente);
    const account = uid();
    (async () => {
      try {
        const { data, error } = await db().rpc("fm_ativar_presente", { p_presente: item.presente });
        if (error) throw error;
        const deadline = Date.parse(data);
        if (!Number.isFinite(deadline)) throw new Error("Prazo inválido.");
        if (uid() !== account) return;
        item.expiraEm = deadline;
        for (const copy of [...player.pack, ...player.slots, ...player.bag, ...save.installed, ...save.vault, ...Object.values(save.giftVests)]) {
          if (copy?.presente === item.presente) copy.expiraEm = deadline;
        }
        if (deadline > fmWorld.nowMs()) retry();
        checkpoint("ativou presente");
      } catch (err) { toast("Não foi possível ativar o presente: " + err.message); }
      finally { activating.delete(item.presente); }
    })();
    return false;
  }
  let nextCheck = 0;
  function expire(now) {
    if (now < nextCheck) return;
    nextCheck = now + 250;
    const expired = it => it && it.validadeDias && it.expiraEm && it.expiraEm <= fmWorld.nowMs();
    let changed = false;
    for (const list of [player.pack, player.bag, player.slots, save.installed, save.vault]) {
      for (let i = list.length - 1; i >= 0; --i) {
        if (!expired(list[i])) continue;
        if (list === player.slots) {
          list[i] = null;
          if (i === player.cur) { player.cur = Math.max(0, list.findIndex(Boolean)); player.reloading = 0; }
        } else list.splice(i, 1);
        changed = true;
      }
    }
    for (const vest of Object.values(save.giftVests)) {
      if (!expired(vest)) continue;
      if (save.vest === vest.i) save.vest = -1;
      delete save.vestDur[vest.i];
      delete save.vestUpgrades[vest.i];
      delete save.giftVests[vest.i];
      changed = true;
    }
    if (changed) { recalcImplants(); checkpoint("presente vencido"); }
  }
  return { ready, expire, permitePrazo, send, start, stop, poll, history, reclaim, itemNome, descrever, SUPRIMENTOS };
})();
