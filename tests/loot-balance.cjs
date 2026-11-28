const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../js/interact.js'), 'utf8');
const items = fs.readFileSync(path.join(__dirname, '../js/items.js'), 'utf8');
const config = fs.readFileSync(path.join(__dirname, '../js/config.js'), 'utf8');
const character = fs.readFileSync(path.join(__dirname, '../js/character.js'), 'utf8');
function section(text, start, end) { return text.slice(text.indexOf(start), text.indexOf(end)); }
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
  vm.runInContext(section(config, 'const BOSSES =', 'const BOSS_SPEED =') +
    section(items, 'const REGULAR_LEGENDARY_REGION', 'function rollRarity(') +
    source.slice(0, source.indexOf('function makeInterior(')), context);
  return { context, events, game };
}

test('implantes X e Err X têm receita na Oficina e ficam fora do saque', () => {
  const { context: ctx } = fixture();
  vm.runInContext([
    section(config, 'const IMP =', 'const IMP_COLOR'),
    section(character, 'function newImplant(', 'function impColor('),
    section(items, 'const RECIPES =', 'const MAT_CHANCE'),
  ].join('\n'), ctx);
  const ids = vm.runInContext('IMP_IDS.filter(id => /^(x_|errx_)/.test(id))', ctx);
  const pool = ctx.dropImplantIds();
  assert.equal(ids.length, 10);
  for (const id of ids) {
    ctx.implantId = id;
    assert.equal(vm.runInContext('IMP[implantId].craftOnly', ctx), true);
    assert.equal(vm.runInContext('RECIPES.some(recipe => recipe.implant === implantId)', ctx), true);
    assert.ok(!pool.includes(id));
  }
  assert.ok(pool.includes('t1_experience'));
  assert.ok(pool.includes('t2_ironskin'));
});

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

test('armas lendárias respeitam a área mínima de cada fonte e a exceção VIP', () => {
  const { context: ctx } = fixture();
  ctx.GRAY_LEVEL = 100;
  ctx.TABLES.airdrop = { weapon: 1 };
  ctx.TABLES.boss = {};
  vm.runInContext([
    section(config, 'const REGIONS =', 'function rowAt('),
    section(items, 'const AMMO =', 'const SLOT_N ='),
    section(items, 'function newInst(', 'function wStat('),
    section(items, 'function rollRarity(', 'const FOOD_SPR'),
  ].join('\n'), ctx);
  const isLegendary = inst => ['ak_ouro', 'espadaserra', 'pistolalamina'].includes(inst.id);
  const highRoll = () => 0.99999;
  for (const vip of [false, true]) {
    ctx.vipActive = () => vip;
    for (let region = 0; region < 9; region++) {
      const zone = region * 3;
      const earlyException = vip && region < 2;
      const regular = earlyException || region >= 4;
      const natal = earlyException || region >= 3;
      ctx.Math.random = highRoll;
      assert.equal(isLegendary(ctx.lootEntry('weapon', {}, 'chest', zone).inst), regular);
      assert.equal(isLegendary(ctx.rollLootFull('airdrop', zone)[0].inst), regular);
      assert.equal(isLegendary(ctx.natalBoxLoot(zone)[0].inst), natal);
      assert.equal(isLegendary(ctx.bossLoot('santa_natal', zone)[0].inst), natal);
      let first = true;
      ctx.Math.random = () => {
        if (!first) return highRoll();
        first = false;
        return 0;
      };
      assert.equal(isLegendary(ctx.natalAlceLoot(zone)[0].inst), natal);
    }
  }
  // Limiares da exceção VIP, por arma sorteada com um bônus de raridade.
  for (const [zone, chance] of [[0, 0.000875], [3, 0.00175]]) {
    ctx.Math.random = () => 1 - chance - 1e-8;
    assert.notEqual(ctx.rollRarity(zone, 1, 4), 4);
    ctx.Math.random = () => 1 - chance + 1e-8;
    assert.equal(ctx.rollRarity(zone, 1, 4), 4);
  }
});

test('Apenas Alfa e Ceifador podem deixar um Coração do Demônio, com 15% por corpo', () => {
  const { context: ctx, game } = fixture();
  ctx.WLIST = [{ id: 'rare', rar: 2 }, { id: 'epic', rar: 3 }, { id: 'ak_ouro', rar: 4 }];
  ctx.UP_STATS = [{ id: 'dmg' }];
  ctx.UP_MAX = 8;
  ctx.player.fx.miscBlueprintFind = 100;
  ctx.vipActive = () => true;
  const hearts = loot => Array.from(loot).filter(item => item.id === 'coracao_demonio');

  for (const [bossId, zone] of [['alfa', 18], ['ceifador', 21]]) {
    ctx.Math.random = () => 0.149999;
    const hit = { table: 'boss', kind: 'corpse', bossId, zone };
    const reward = ctx.spotLootPrepared(hit);
    assert.equal(reward.length, 3);
    assert.equal(hearts(reward)[0].amt, 1);

    ctx.Math.random = () => 0.15;
    const miss = { table: 'boss', kind: 'corpse', bossId, zone };
    const ordinaryReward = ctx.spotLootPrepared(miss);
    assert.equal(ordinaryReward.length, 2);
    assert.equal(hearts(ordinaryReward).length, 0);

    game.time += 300001;
    assert.equal(ctx.spotLootPrepared(hit), reward);
    ctx.Math.random = () => 0;
    assert.equal(ctx.spotLootPrepared(miss), ordinaryReward);
    ctx.openSpot(hit);
    assert.equal(hearts(game.found).length, 1);
    game.found = null;
    ctx.openSpot(hit);
    assert.equal(game.found, null);
  }
  ctx.Math.random = () => 0;
  for (const id of ['acougueiro', 'matriarca', 'capataz', 'pestilento', 'carrasco', 'necromante', 'santa_natal']) {
    assert.equal(hearts(ctx.bossLoot(id, 24)).length, 0, id);
  }
  ctx.regionOf = () => 7;
  assert.equal(hearts(ctx.implantPartsDrop('boss', {}, 21)).length, 0);
  assert.equal(hearts(ctx.implantPartsDrop('airdrop', {}, 21)).length, 0);
});
