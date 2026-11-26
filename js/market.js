"use strict";

const market = { vendaveis: 0, rows: [], tab: "comprar", page: 0, filter: "all", filterOpen: false, filterOffset: 0, error: "", loading: false, confirm: null };

const MARKET_FILTERS = [
  ["all", "Todos"], ["credits", "Créditos"], ["ammo", "Munição"], ["vest", "Coletes"], ["machinegun", "Metralhadoras"],
  ["pistols", "Pistolas"], ["rifles", "Rifles"], ["shotguns", "Escopetas"], ["melee", "Corpo a corpo"],
  ["implant", "Implantes"], ["mat", "Materiais"], ["food", "Comida"], ["supplies", "Suprimentos"]
];
const MARKET_SUPPLIES = { water: "Água", med: "Kit médico", anti: "Antibiótico" };

function marketCategory(item) {
  if (item.kind === "weapon") return WDEF[item.id]?.cat;
  if (item.kind === "credits") return "credits";
  return Object.hasOwn(MARKET_SUPPLIES, item.kind) ? "supplies" : item.kind;
}

function marketItemName(item) {
  if (item.kind === "credits") return `${Number(item.qty).toLocaleString("pt-BR")} créditos`;
  if (item.kind === "weapon" && WDEF[item.id]) return instName(item);
  if (item.kind === "mat" && MATS[item.id]) return `${item.qty}× ${MATS[item.id].name}`;
  if (item.kind === "ammo") return `${item.qty}× Munição ${item.id}`;
  if (item.kind === "vest" && VESTS[item.id]) return `${VESTS[item.id].name} · ${Math.round(item.dur ?? 100)}%`;
  if (item.kind === "implant" && IMP[item.id]) return implantName(item);
  if (item.kind === "food" && FOOD_Q[item.id]) return `${item.qty}× ${FOOD_Q[item.id].name}`;
  if (Object.hasOwn(MARKET_SUPPLIES, item.kind)) return `${item.qty}× ${MARKET_SUPPLIES[item.kind]}`;
  return "Item desconhecido";
}

function marketInventory() {
  const rows = [];
  const add = (item, local, index = 0) => {
    if (item && !item.tokenBound && !(item.kind === "weapon" && WDEF[item.id]?.noTrade)) rows.push({ item, local, index });
  };
  for (const [local, items] of [["slots", player.slots], ["pack", player.pack], ["vault", save.vault]])
    items.forEach((item, index) => add(item, local, index));
  player.bag.forEach((item, index) => add({ ...item, kind: "implant" }, "bag", index));
  VESTS.forEach((_, index) => {
    if (save.vestsOwned[index] && save.vest !== index)
      add({ kind: "vest", id: index, dur: vestDur(index) }, "vest", index);
  });
  for (const id of Object.keys(AMMO)) {
    const qty = sellableAmmo(id);
    if (qty > 0) add({ kind: "ammo", id, qty }, "ammo:" + id);
  }
  for (const id of Object.keys(FOOD_Q)) {
    const qty = player.foodQ[id];
    if (qty > 0) add({ kind: "food", id, qty }, "food:" + id);
  }
  for (const kind of Object.keys(MARKET_SUPPLIES)) {
    if (player[kind] > 0) add({ kind, qty: player[kind] }, kind);
  }
  // créditos comprados com dinheiro real (o servidor diz quantos podem ser vendidos)
  const cr = Math.min(market.vendaveis, save.credits || 0);
  if (cr >= 10) rows.unshift({ item: { kind: "credits", id: "credits", qty: cr }, local: "credits", index: cr });
  return rows;
}

async function marketRefresh() {
  if (market.loading) return;
  market.loading = true;
  market.error = "";
  fmCloud.socialClient().rpc("fm_creditos_vendaveis").then(({ data }) => { market.vendaveis = Number(data) || 0; }).catch(() => {});
  try {
    const { data, error } = await fmCloud.socialClient().rpc("fm_mercado_listar");
    if (error) throw error;
    market.rows = data;
  } catch (error) {
    market.rows = [];
    market.error = /schema cache|could not find the function/i.test(error.message || "")
      ? "O Mercado Negro ainda não está disponível no servidor."
      : "Não foi possível carregar os anúncios. Tente atualizar.";
  } finally {
    market.loading = false;
  }
}

function openMarket() {
  if (!game.hub || !fmCloud.isActive()) return;
  game.menu = "market";
  game.clicks = [];
  market.tab = "comprar";
  market.filter = "all";
  market.filterOpen = false;
  market.page = 0;
  market.confirm = null;
  marketRefresh();
}

async function marketTrade(acao, args) {
  if (game.menu !== "market" || !game.hub || game.marketBusy || market.error) return;
  market.confirm = null;
  const saved = checkpoint("Mercado Negro");
  game.marketBusy = true;
  try {
    if (!await saved) return;
    const result = await fmCloud.marketAction({
      acao, anuncio: null, local_item: null, posicao: null, preco: null, ...args
    });
    save.run = result.run;
    const p = result.run.p;
    player.pack = p.pack;
    player.slots = p.slots;
    player.reserve = p.reserve;
    player.bag = p.bag;
    player.food = p.food;
    player.foodQ = p.foodQ;
    for (const kind of Object.keys(MARKET_SUPPLIES)) player[kind] = p[kind];
    save.vault = result.vault;
    save.vestsOwned = result.vestsOwned;
    save.vestDur = result.vestDur;
    save.vestUpgrades = result.vestUpgrades;
    if (!player.slots[player.cur]) {
      player.cur = Math.max(0, player.slots.findIndex(Boolean));
      player.reloading = 0;
    }
    game.money = result.run.g.money;
    if (Number.isFinite(Number(result.credits))) save.credits = Number(result.credits);
    toast({ listar: "Anúncio publicado.", comprar: "Item entregue na mochila.", cancelar: "Item devolvido à mochila.", receber: "Dinheiro recebido." }[acao]);
  } catch (error) {
    toast(error.message || "Operação indisponível.");
  } finally {
    game.marketBusy = false;
    marketRefresh();
  }
}

// créditos: primeiro a quantidade (lotes de 10), depois o preço por crédito ($1.000 a $5.000); taxa de 10% na venda
function marketAskCredits(row) {
  const max = Math.min(500, Math.floor(row.item.qty / 10) * 10);
  game.input = {
    mode: "market", text: "", label: `Quantos créditos anunciar? (lotes de 10 · até ${max})`, unit: "",
    fn(qty) {
      if (!Number.isInteger(qty) || qty < 10 || qty > max || qty % 10) { toast(`Digite um múltiplo de 10 entre 10 e ${max}.`); return; }
      setTimeout(() => {
        game.input = {
          mode: "market", text: "", label: `${qty} créditos · preço POR crédito ($1.000 a $5.000) · taxa de 10%`,
          fn(per) {
            if (!Number.isInteger(per) || per < 1000 || per > 5000) { toast("Preço por crédito: de $1.000 a $5.000."); return; }
            marketTrade("listar", { local_item: "credits", posicao: qty, preco: qty * per });
          }
        };
      }, 0);
    }
  };
}
function marketAskPrice(row) {
  if (row.item.kind === "credits") { marketAskCredits(row); return; }
  game.input = {
    mode: "market", text: "", label: marketItemName(row.item),
    fn(price) {
      if (!Number.isInteger(price) || price < 1 || price > 1000000) {
        toast("Digite um preço entre $1 e $1.000.000.");
        return;
      }
      const current = marketInventory().find(item => item.local === row.local && item.index === row.index);
      if (!current || JSON.stringify(current.item) !== JSON.stringify(row.item)) {
        toast("O item mudou. Selecione-o novamente.");
        return;
      }
      marketTrade("listar", { local_item: row.local, posicao: row.index, preco: price });
    }
  };
}

function drawMarket() {
  menuFrame("Mercado Negro", `Dinheiro na mochila · ${bankMoney(game.money)}`, "mercado_bg");
  const locked = game.marketBusy || !!game.input || !!market.confirm;
  const tabs = [["comprar", "Comprar"], ["vender", "Anunciar"], ["meus", "Meus anúncios"]];
  tabs.forEach(([key, label], i) => btn(60 + i * 132, 84, 122, 34, label, () => {
    market.tab = key;
    market.page = 0;
  }, market.tab === key, locked));
  btn(W - 300, 84, 118, 34, "Atualizar", marketRefresh, false, locked || market.loading);
  btn(W - 170, 84, 110, 34, "Voltar", () => { game.menu = null; }, false, locked);

  const selected = MARKET_FILTERS.findIndex(([key]) => key === market.filter);
  btn(60, 127, 230, 32, "Categoria · " + MARKET_FILTERS[selected][1] + " ▾", () => {
    market.filterOpen = true;
    market.filterOffset = Math.min(selected, MARKET_FILTERS.length - MARKET_VISIBLE);
  }, false, locked);
  const available = market.tab === "vender" ? marketInventory()
    : market.rows.filter(row => market.tab === "meus" ? row.meu : !row.meu);
  const entries = available.filter(({ item }) => market.filter === "all" || marketCategory(item) === market.filter);
  const pageSize = 6;
  const last = Math.max(0, Math.ceil(entries.length / pageSize) - 1);
  market.page = Math.min(market.page, last);
  const status = market.error || (market.loading ? "Carregando anúncios…" : "");
  if (status) txt(status, W / 2, 201, 14, "#ffd96a", "center");
  if (!entries.length && !status) {
    txt(market.tab === "vender" ? "Nenhum item disponível para anunciar nesta categoria." : "Nenhum anúncio nesta aba.",
      W / 2, 230, 16, "#c9c4ad", "center");
  }
  entries.slice(market.page * pageSize, (market.page + 1) * pageSize).forEach((row, i) => {
    const y = 212 + i * 44;
    ctx.fillStyle = UI_GLASS ? "rgba(20,19,14,0.78)" : "#27251e";
    ctx.fillRect(60, y, W - 120, 40);
    txt(marketItemName(row.item), 78, y + 25, 15, "#f2eedc", "left", true, W - 390);
    if (row.price) txt(bankMoney(row.price), W - 214, y + 25, 15, "#aad279", "right", true);
    const action = market.tab === "vender" ? "" : !row.meu ? "comprar" : row.state === "sold" ? "receber" : "cancelar";
    const label = { comprar: "Comprar", receber: "Receber", cancelar: "Cancelar" }[action] || "Definir preço";
    btn(W - 194, y + 5, 122, 30, label, () => {
      if (!action) marketAskPrice(row);
      else market.confirm = { action, label, row };
    }, true, locked || !!status);
  });
  btn(60, 492, 105, 32, "Anterior", () => market.page--, false, locked || market.page === 0);
  btn(W - 165, 492, 105, 32, "Próxima", () => market.page++, false, locked || market.page === last);
  txt(`Página ${market.page + 1} de ${last + 1}`, W / 2, 514, 13, "#c9c4ad", "center");

  if (game.marketBusy) txt("Processando operação…", W / 2, 550, 14, "#ffd96a", "center");
  if (market.filterOpen) {
    drawMarketDropdown();
    return;
  }
  if (!game.input && !market.confirm) return;
  ctx.fillStyle = "rgba(7,7,5,0.9)";
  ctx.fillRect(W / 2 - 210, 196, 420, 170);
  if (game.input) {
    txt(game.input.label, W / 2, 231, 16, "#f2eedc", "center", true, 375);
    txt(game.input.unit === "" ? `Quantidade · ${game.input.text || "0"}` : `Preço em dinheiro · $${game.input.text || "0"}`, W / 2, 275, 21, "#ffd96a", "center");
    btn(W / 2 - 155, 310, 140, 33, "Voltar", () => { game.input = null; });
    btn(W / 2 + 15, 310, 140, 33, "Anunciar (Enter)", () => inputKey("enter"), true);
  } else {
    const { action, label, row } = market.confirm;
    txt(`${label} · ${marketItemName(row.item)}`, W / 2, 235, 16, "#f2eedc", "center", true, 375);
    txt(bankMoney(row.price), W / 2, 275, 21, "#ffd96a", "center");
    btn(W / 2 - 155, 310, 140, 33, "Voltar", () => { market.confirm = null; });
    btn(W / 2 + 15, 310, 140, 33, "Confirmar", () => marketTrade(action, { anuncio: row.id }), true);
  }
}

const MARKET_VISIBLE = 5;

function drawMarketDropdown() {
  const x = 60, y = 162, width = 230, row = 32;
  regClick(0, 0, W, H, () => { market.filterOpen = false; });
  ctx.fillStyle = UI_GLASS ? "rgba(22,21,16,0.94)" : "#211f19";
  ctx.fillRect(x, y, width, row * MARKET_VISIBLE);
  MARKET_FILTERS.slice(market.filterOffset, market.filterOffset + MARKET_VISIBLE).forEach(([key, label], i) => {
    btn(x, y + i * row, width - 8, row, label, () => {
      market.filter = key;
      market.page = 0;
      market.filterOpen = false;
    }, market.filter === key);
  });
  const unit = row * MARKET_VISIBLE / MARKET_FILTERS.length;
  ctx.fillStyle = "#baa46c";
  ctx.fillRect(x + width - 6, y + market.filterOffset * unit, 4, MARKET_VISIBLE * unit);
}

const saleMailState = { rows: [], next: 0, busy: false, loaded: false, error: false };
window.addEventListener("fm-sales", ({ detail }) => {
  const extra = detail.total - (Number(save.saleTotal) || 0);
  save.bank += extra;
  save.saleTotal = detail.total;
  if (extra > 0) toast("Mercado Negro · venda creditada no banco: " + bankMoney(extra));
  saleMailState.rows = detail.rows;
  saleMailState.loaded = true;
  saleMailState.error = false;
});
function pollSaleMail() {
  if (!fmCloud.isActive() || saleMailState.busy || Date.now() < saleMailState.next) return;
  saleMailState.busy = true;
  saleMailState.next = Date.now() + 15000;
  fmCloud.saleMail().catch(() => { saleMailState.error = true; }).finally(() => { saleMailState.busy = false; });
}
function saleMailEmpty() {
  if (saleMailState.error) return "Correio indisponível";
  return saleMailState.loaded ? "Nenhuma venda registrada" : "Buscando vendas…";
}
function drawSaleMail() {
  pollSaleMail();
  menuFrame("Caixa de correio", "Avisos de venda do Mercado Negro");
  btn(W - 158, 74, 100, 32, "Voltar", () => { game.menu = null; });
  if (!saleMailState.rows.length) txt(saleMailEmpty(), W / 2, 225, 16, "#c9c4ad", "center");
  saleMailState.rows.forEach((row, i) => {
    const y = 139 + 39 * i;
    txt(marketItemName(row.item) + " vendido", 55, y, 15, "#eee5cb", "left", true, 355);
    txt(bankMoney(row.price) + " no banco", 440, y, 14, "#a5c481", "left");
    txt(new Date(row.sold_at).toLocaleString("pt-BR"), W - 60, y, 12, "#b6af9a", "right");
  });
}
function drawSaleStatement() {
  pollSaleMail();
  const x = W - 202, y = 364;
  ctx.fillStyle = "rgba(15,14,11,0.88)";
  ctx.fillRect(x, y, 188, 186);
  txt("Últimas 10 vendas", x + 9, y + 18, 13, "#dec180", "left", true);
  if (!saleMailState.rows.length) txt(saleMailEmpty(), x + 9, y + 45, 11, "#b6af9a", "left");
  saleMailState.rows.forEach((row, i) => {
    const line = y + 38 + 15 * i;
    txt(marketItemName(row.item), x + 9, line, 11, "#e4ddcd", "left", false, 98);
    txt("+" + bankMoney(row.price), x + 180, line, 11, "#a5c481", "right", true, 72);
  });
}
