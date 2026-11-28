const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/interact.js'), 'utf8');
function fixture() {
  let seed = 123456;
  const events = [];
  const game = { time: 0, inside: null };
  const context = vm.createContext({ game, W: 960, H: 600, Math: Object.assign(Object.create(Math), {
    random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; }
  }), MATS: {}, WDEF: { gold: { rar: 4 }, epic: { rar: 3 } },
  TABLES: { furniture: { water: [1, 1, 2], weapon: 0.1 } }, MAT_CHANCE: {}, EMPTY_CHANCE: { furniture: 0.35 },
  VESTS: [{ price: 10 }], player: { fx: { lootSpots: 0, scavenger: 0, hunter: 0, armorFind: 0, miscFind: 0 }, flags: {} },
  vipActive: () => false, diffOf: () => 0, regionOf: () => 0, dropImplantIds: () => [],
  randomWeaponDrop: () => 'gold', newInst: id => ({ id }), pick: list => list[0],
  mouse: {}, rowAt: () => 0, deadZoneDrop: () => null, TOKEN_LOJA_CHANCE: 0,
  checkpoint: reason => events.push(reason), toast: message => events.push(message), missionProgress() {},
  stat: id => events.push(id), sfx: { pickup() {}, empty() {} } });
  vm.runInContext(source.slice(0, source.indexOf('function makeInterior(')), context);
  return { context, events, game };
}

test('reduções relativas de lendárias, épicas e coletes nas fronteiras de chance', () => {
  const { context: ctx } = fixture();
  for (const [entry, multiplier] of [[{ type: 'weapon', inst: { id: 'gold' } }, 0.65],
    [{ type: 'weapon', inst: { id: 'epic' } }, 0.75], [{ type: 'vest' }, 0.80]]) {
    ctx.Math.random = () => multiplier - 0.00001;
    assert.equal(ctx.regularLootResult(entry, true).length, 2);
    ctx.Math.random = () => multiplier;
    assert.deepEqual(Array.from(ctx.regularLootResult(entry, true), item => [item.type, item.amt]), [['credit', 1]]);
    assert.equal(ctx.regularLootResult(entry, false).length, 0);
  }
});

test('saques comuns podem estar vazios e respeitam o limite mesmo com bônus', () => {
  const { context: ctx } = fixture();
  let empty = 0, credits = 0;
  for (let i = 0; i < 10000; i++) {
    const loot = ctx.rollLoot('furniture', 0);
    assert.ok(loot.filter(item => item.type !== 'credit').length <= 1);
    assert.ok(loot.filter(item => item.type === 'credit' && item.amt === 1).length <= 1);
    if (!loot.length) empty++;
    if (loot.some(item => item.type === 'credit')) credits++;
  }
  assert.ok(empty > 0 && credits > 0);
  ctx.player.fx.lootSpots = 100;
  ctx.player.fx.hunter = 200;
  ctx.player.fx.armorFind = 200;
  ctx.vipActive = () => true;
  for (let i = 0; i < 10000; i++) assert.ok(ctx.rollLoot('furniture', 0).filter(item => item.type !== 'credit').length <= 1);
});

test('um spot não pode ser aberto de novo e Natal mantém a recompensa própria', () => {
  const { context: ctx, events, game } = fixture();
  ctx.Math.random = () => 0;
  const empty = { name: 'Armário', table: 'furniture', zone: 0 };
  ctx.openSpot(empty);
  ctx.openSpot(empty);
  assert.deepEqual(events, ['searches', 'Armário: vazio', 'busca sem saque']);
  const natal = { name: 'Caixa', table: 'natal', zone: 0 };
  ctx.openSpot(natal);
  ctx.openSpot(natal);
  assert.deepEqual(Array.from(game.found, item => item.type), ['weapon', 'mat']);
});
