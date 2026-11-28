const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

function shop() {
  const weapon = { kind: 'weapon', id: 'pistola' }, legendary = { kind: 'weapon', id: 'ak_ouro' }, implant = { id: 'test' };
  const player = { slots: [weapon], cur: 0, pack: [legendary], bag: [], foodQ: {} };
  const save = { vestsOwned: [true], vest: 0, installed: [implant] };
  const game = { money: 0, jcur: 0 };
  const context = vm.createContext({ player, save, game, MATS: { reset_stats: { price: 100 } }, AMMO: {},
    WDEF: { pistola: { rar: 0 }, ak_ouro: { rar: 4 } }, VESTS: [{ name: 'Colete', rar: 1 }],
    IMP: { test: { scrap: 20 } }, instName: item => item.id, upSum: () => 0, vestDur: () => 100,
    atBase: () => true, toast() {}, logMoney() {}, checkpoint() {}, sfx: { buy() {}, reload() {} } });
  const inventory = fs.readFileSync(path.join(__dirname, '../js/inventory.js'), 'utf8');
  vm.runInContext(inventory.slice(inventory.indexOf('function fmStashItemEquipped('), inventory.indexOf('function fmStashEntries(')), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/junk.js'), 'utf8'), context);
  return { context, weapon, legendary, implant, player, save, game };
}

test('equipamentos em uso ficam fora da lista e o Ferro Velho recusa referências antigas', () => {
  const { context, weapon, legendary, implant, player, save, game } = shop();
  assert.deepEqual(Array.from(context.junkItems(), entry => entry.it), [legendary]);
  const entries = [{ kind: 'weapon', it: weapon, where: 'slot', i: 0 },
    { kind: 'vest', idx: 0 }, { kind: 'implant', im: implant }];
  for (const entry of entries) context.sellEntry({ ...entry, qty: 1, unit: 100 }, 1);
  context.dismantle(entries[0]);
  assert.equal(game.money, 0);
  assert.equal(player.slots[0], weapon);
  assert.equal(save.vestsOwned[0], true);
  assert.equal(save.installed[0], implant);
  player.slots[0] = null;
  player.pack.push(weapon);
  const unequipped = context.junkItems().find(entry => entry.it === weapon);
  context.askSell(unequipped, 1);
  assert.equal(game.money, 1000);
  assert.deepEqual(player.pack, [legendary]);
});

test('lendário só é vendido após confirmar o código 132 para o item atual', () => {
  const { context, legendary, player, game } = shop();
  const entry = context.junkItems()[0];
  context.sellEntry(entry, 1);
  assert.equal(game.money, 0);
  context.askSell(entry, 1);
  for (const key of ['1', '2', '3', 'enter']) context.junkKey(key);
  assert.equal(game.money, 0);
  assert.equal(player.pack[0], legendary);
  context.junkKey('escape');
  assert.equal(game.jconfirm, null);
  assert.equal(player.pack[0], legendary);
  context.askSell(entry, 1);
  for (const key of ['1', '3', '2', 'enter']) context.junkKey(key);
  assert.equal(game.jconfirm, null);
  assert.equal(player.pack.length, 0);
  assert.equal(game.money, 50000);
  context.confirmJunkAction();
  assert.equal(game.money, 50000);
});
