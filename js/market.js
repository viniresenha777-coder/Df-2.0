"use strict";

const market = { rows: [], tab: "comprar", page: 0, error: "", loading: false, confirm: null };

function marketItemName(item) {
  if (item.kind === "weapon" && WDEF[item.id]) return instName(item);
  if (item.kind === "mat" && MATS[item.id]) return `${item.qty}× ${MATS[item.id].name}`;
  return "Item desconhecido";
}

function marketInventory() {
  return ["slots", "pack"].flatMap(local =>
    player[local].map((item, index) => ({ item, local, index })).filter(({ item }) =>
      item?.loot === true && !item.tokenBound && (item.kind === "weapon" ||
        (item.kind === "mat" && !["token_loja", "reset_stats"].includes(item.id))))
  );
}

async function marketRefresh() {
  if (market.loading) return;
  market.loading = true;
  market.error = "";
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
    if (!player.slots[player.cur]) {
      player.cur = Math.max(0, player.slots.findIndex(Boolean));
      player.reloading = 0;
    }
    game.money = result.run.g.money;
    toast({ listar: "Anúncio publicado.", comprar: "Item entregue na mochila.", cancelar: "Item devolvido à mochila.", receber: "Dinheiro recebido." }[acao]);
  } catch (error) {
    toast(error.message || "Operação indisponível.");
  } finally {
    game.marketBusy = false;
    marketRefresh();
  }
}

function marketAskPrice(row) {
  game.input = {
    mode: "market", text: "", label: marketItemName(row.item),
    fn(price) {
      if (!Number.isInteger(price) || price < 1 || price > 1000000) {
        toast("Digite um preço entre $1 e $1.000.000.");
        return;
      }
      if (player[row.local][row.index] !== row.item) return;
      marketTrade("listar", { local_item: row.local, posicao: row.index, preco: price });
    }
  };
}

function drawMarket() {
  menuFrame("Mercado Negro", `Dinheiro na mochila · ${bankMoney(game.money)}`);
  const locked = game.marketBusy || !!game.input || !!market.confirm;
  const tabs = [["comprar", "Comprar"], ["vender", "Anunciar"], ["meus", "Meus anúncios"]];
  tabs.forEach(([key, label], i) => btn(60 + i * 132, 84, 122, 34, label, () => {
    market.tab = key;
    market.page = 0;
  }, market.tab === key, locked));
  btn(W - 300, 84, 118, 34, "Atualizar", marketRefresh, false, locked || market.loading);
  btn(W - 170, 84, 110, 34, "Voltar", () => { game.menu = null; }, false, locked);

  const entries = market.tab === "vender" ? marketInventory()
    : market.rows.filter(row => market.tab === "meus" ? row.meu : !row.meu);
  const last = Math.max(0, Math.ceil(entries.length / 7) - 1);
  market.page = Math.min(market.page, last);
  const status = market.error || (market.loading ? "Carregando anúncios…" : "");
  if (status) txt(status, W / 2, 142, 14, "#ffd96a", "center");
  if (!entries.length && !status) {
    txt(market.tab === "vender" ? "Nenhuma arma ou material de saque elegível na mochila." : "Nenhum anúncio nesta aba.",
      W / 2, 230, 16, "#c9c4ad", "center");
  }
  entries.slice(market.page * 7, market.page * 7 + 7).forEach((row, i) => {
    const y = 160 + i * 46;
    ctx.fillStyle = "#27251e";
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
  if (!game.input && !market.confirm) return;
  ctx.fillStyle = "rgba(7,7,5,0.9)";
  ctx.fillRect(W / 2 - 210, 196, 420, 170);
  if (game.input) {
    txt(game.input.label, W / 2, 231, 16, "#f2eedc", "center", true, 375);
    txt(`Preço em dinheiro · $${game.input.text || "0"}`, W / 2, 275, 21, "#ffd96a", "center");
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
