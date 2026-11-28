const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function source(name, start, end) {
  const file = readFileSync(resolve(__dirname, '../js', name + '.js'), 'utf8');
  return file.slice(file.indexOf(start), file.indexOf(end));
}

function stash() {
  const player = { level: 80, slots: [], bag: Array.from({ length: 8 }, () => ({ id: 'test' })), pack: [], maxHp: 25 };
  const stored = { kind: 'implant', id: 'test', alloc: { hunter: 3 }, semTroca: true };
  const save = { installed: Array.from({ length: 8 }, () => ({ id: 'test' })), vault: [stored] };
  const notices = [];
  let snapshot;
  const context = vm.createContext({
    player, save, game: {}, IMP: { test: { name: 'Implante teste', alloc: { points: 3, opts: [{ key: 'hunter' }] } } },
    world: { cell: { cx: 0, cy: 0 } }, MAP_VERSION: 1, SLOT_N: 3, PACK_MAX: 39, AMMO: {}, AMMO_STACK: 500,
    FM_MIMIC_ID: 'mimic', validItem: () => true, cellAt: () => null, recalcImplants() {},
    fmBackpackBase: () => 14,
    invPackEntries: () => [
      ...player.pack.map(item => ({ type: 'mat', item })),
      ...player.bag.map(item => ({ type: 'implant', item })),
    ],
    toast: message => notices.push(message),
    persist: () => { snapshot = JSON.parse(JSON.stringify(save.run)); },
  });
  vm.runInContext([
    source('inventory', 'function fmStashStoredClothing(', 'function drawItemTooltip('),
    source('checkpoint', 'function runSnapshot(', 'function checkpoint(reason)'),
    source('checkpoint', 'function restoreRun(', 'function checkpointTick('),
    source('character', 'function newImplant(', '// efeitos de um implante'),
  ].join('\n'), context);
  return { context, player, save, stored, notices, lastSaved: () => snapshot };
}

test('retira o nono implante, mantém os equipados e recupera a mochila inteira ao carregar', () => {
  const { context, player, save, stored, lastSaved } = stash();
  const installed = save.installed.slice();
  context.fmStashSelect(1, 0);
  context.fmStashSelect(0, 8);
  assert.equal(save.vault.length, 0);
  assert.deepEqual(save.installed, installed);
  assert.equal(player.bag.length, 9);
  const { kind, ...implant } = stored;
  assert.deepEqual(lastSaved().p.bag.at(-1), implant);

  player.bag = [];
  save.run = lastSaved();
  context.restoreRun();
  assert.equal(player.bag.length, 9);
  assert.deepEqual(JSON.parse(JSON.stringify(player.bag.at(-1))), implant);
});

test('a retirada mantém o implante no baú quando o inventário inferior está cheio', () => {
  const { context, player, save, stored, notices, lastSaved } = stash();
  player.pack = Array.from({ length: 6 }, () => ({ kind: 'mat', id: 'sucata' }));
  context.fmStashWithdraw(0);
  assert.equal(save.vault[0], stored);
  assert.equal(player.bag.length, 8);
  assert.equal(lastSaved(), undefined);
  assert.match(notices[0], /Inventário inferior cheio/);
});

test('o baú mantém posições livres e troca itens entre páginas sem compactar a grade', () => {
  const { context, save, stored, notices } = stash();
  const other = { kind: 'mat', id: 'sucata', qty: 3 };
  save.vault.push(other);
  save.vaultRows = 6;
  context.fmStashSelect(1, 0);
  context.fmStashSelect(1, 42);
  let layout = context.fmVaultLayout();
  assert.equal(layout[0], null);
  assert.equal(layout[1], other);
  assert.equal(layout[42], stored);
  assert.equal(save.vault.length, 2);

  context.fmStashSelect(1, 42);
  context.fmStashSelect(1, 48);
  assert.match(notices.at(-1), /fileira ainda está bloqueada/);
  context.fmStashSelect(1, 1);
  layout = context.fmVaultLayout();
  assert.equal(layout[1], stored);
  assert.equal(layout[42], other);

  save.vault = JSON.parse(JSON.stringify(save.vault));
  assert.equal(context.fmVaultLayout()[42].id, 'sucata');
  context.fmStashWithdraw(1);
  assert.equal(context.fmVaultLayout()[1], null);
  assert.equal(context.fmVaultLayout()[42].id, 'sucata');
});

test('o inventário conta pilhas de 1.200 munições por calibre', () => {
  const { context, player } = stash();
  context.packCapacity = () => 3;
  player.reserve = { '9mm': 1200, '.50': 1199 };
  vm.runInContext(source('survival', 'const AMMO_STACK =', '// ---------- Durabilidade dos coletes'), context);
  assert.equal(context.ammoSlots(), 2);
  assert.equal(context.ammoRoom('9mm'), 1200);
  assert.equal(context.ammoRoom('.50'), 1201);
  assert.equal(context.addAmmo('.50', 1202), 1201);
  assert.equal(player.reserve['.50'], 2400);
  assert.equal(context.ammoSlots(), 3);
  assert.equal(context.ammoRoom('9mm'), 0);
});

test('arrastar no baú só muda a posição ao soltar em um espaço liberado', () => {
  const { context, save, stored, lastSaved } = stash();
  const other = { kind: 'mat', id: 'sucata', qty: 3 };
  save.vault.push(other);
  context.game.vpage = 0;
  context.game.fmStashCells = [stored, other, null].map((item, index) => ({
    side: 1, page: 0, index, stored: item,
    entry: item ? context.fmStashStoredEntry(item) : null,
    x: index * 100, y: 0, w: 90, h: 50,
  }));
  assert.equal(context.fmStashMouseDown(10, 10), true);
  context.fmStashMouseMove(210, 10);
  assert.equal(context.fmVaultLayout()[0], stored);
  assert.equal(lastSaved(), undefined);
  context.fmStashMouseUp(210, 10);
  assert.equal(context.fmVaultLayout()[0], null);
  assert.equal(context.fmVaultLayout()[2], stored);
  assert.equal(context.game.fmStashDrag, null);

  context.game.fmStashCells[2].stored = stored;
  context.game.fmStashCells[2].entry = context.fmStashStoredEntry(stored);
  assert.equal(context.fmStashMouseDown(210, 10), true);
  context.fmStashMouseUp(1500, 400);
  assert.equal(context.fmVaultLayout()[2], stored);
  assert.equal(context.game.fmStashDrag, null);
});
