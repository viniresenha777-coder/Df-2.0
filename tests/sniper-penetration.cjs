const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const read = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
const between = (text, first, last) => text.slice(text.indexOf(first), text.indexOf(last));

function fireAtAlignedZombies(id) {
  const zombies = [{ x: 10, y: 0, hp: 10000, r: 4 }, { x: 20, y: 0, hp: 10000, r: 4 }];
  const hits = [];
  const context = vm.createContext({
    bullets: [], game: { shake: 0 }, world: { cell: {} }, adm: {}, performance: { now: () => 0 },
    player: { angle: 0, x: 0, y: 0, fx: { accImp: 0, atkSpeed: 0, crit: 0, saver: 0 } },
    A: () => 10, thunderSpread: () => 0, vindicatorCritChance: () => 0, dmgMult: () => 1,
    muzzlePoint: () => ({ x: 0, y: 0 }), ejectsCasing: () => false, weaponNoise() {}, startReload() {}, sfx: { shot() {} },
    hitObstacle: () => null, Zs: () => zombies, zCenter: zombie => zombie,
    zDist: (zombie, x, y) => Math.hypot(zombie.x - x, zombie.y - y),
    hurt: (zombie, damage) => { hits.push([zombies.indexOf(zombie), damage]); zombie.hp -= damage; },
  });
  const items = read('items.js'), combat = read('combat.js');
  vm.runInContext([
    between(items, 'const AMMO =', '// ---------- Materiais e receitas'),
    between(items, 'function newInst(', '// Trovão: limites'),
    between(combat, 'const THUNDER_RANGE', '// ---------- Som, audição'),
    between(combat, 'function updateBullets(', '// Bala de outro jogador'),
    `const weapon = WDEF[${JSON.stringify(id)}], inst = newInst(weapon.id);`,
    'const curW = () => weapon, curInst = () => inst;',
    'attack(); for (let i = 0; i < 4; i++) updateBullets(16, 1);',
  ].join('\n'), context);
  return hits;
}

test('rifles, Vingador e Besta param no primeiro zumbi', () => {
  for (const id of ['caca', 'sniper', 'barrett', 'choque', 'vingador', 'besta']) {
    assert.deepEqual(fireAtAlignedZombies(id).map(([index]) => index), [0], id);
  }
  assert.deepEqual(fireAtAlignedZombies('vingador'), [[0, 600]]);
});

test('Trovão mantém dano no primeiro e no segundo zumbi', () => {
  assert.deepEqual(fireAtAlignedZombies('trovao'), [[0, 1000], [1, 400]]);
});

test('crítico do Vingador é exatamente o dobro do tiro normal', () => {
  const player = { fx: { firepower: 0, critDmg: 0 }, hp: 100, maxHp: 100 };
  const context = vm.createContext({ player, adm: { dmg: 1 }, trindadeActive: () => false,
    xpForDamage() {}, alertZombie() {} });
  vm.runInContext(between(read('combat.js'), 'function hurt(', '// só arma de cartucho'), context);
  const hit = (fx) => context.hurt({ hp: 10000 }, 600, null, true, fx);
  assert.equal(hit({ vindicator: true, shotCrit: true }), 1200);
  player.fx.firepower = 25;
  player.fx.critDmg = 40;
  assert.equal(hit({ vindicator: true, shotCrit: false }), 750);
  assert.equal(hit({ vindicator: true, shotCrit: true }), 1500);
  assert.equal(hit({ shotCrit: true }), 1800);
});
