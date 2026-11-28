const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const world = fs.readFileSync(path.join(__dirname, '../js/world.js'), 'utf8');
const loading = world.slice(world.indexOf('function startLocationLoad('), world.indexOf('function locationName('));
const flush = () => new Promise(resolve => setImmediate(resolve));

function scenario(preSaveOk = true) {
  let now = 0;
  let resolveTexture;
  const texture = new Promise(resolve => { resolveTexture = resolve; });
  const events = [];
  const game = { inside: null, hub: false };
  const keys = { e: true, w: true };
  const mouse = { down: true };
  const context = vm.createContext({ game, keys, mouse, console, performance: { now: () => now },
    updateCam() {}, checkpoint: reason => { events.push(reason); return Promise.resolve(preSaveOk); },
    toast: message => events.push(message), W: 960, H: 600,
    ctx: { save() {}, restore() {}, fillRect() {} }, clamp: v => v, txt() {} });
  vm.runInContext(loading, context);
  context.locationTexturesReady = () => texture;
  const step = (delta) => { now += delta; context.transTick(delta); context.drawTransition(); };
  return { game, keys, mouse, events, start: context.startLocationLoad, step, resolveTexture };
}

test('salva origem e destino, bloqueia duplicatas e espera o mínimo de três segundos', async () => {
  const s = scenario();
  s.start('Casa', () => { s.events.push('montou destino'); }, 'entrada no prédio');
  s.start('Duplicada', () => assert.fail('segunda transição executada'));
  assert.equal(s.keys.e, false);
  assert.equal(s.keys.w, false);
  assert.equal(s.mouse.down, false);
  s.step(140);
  assert.deepEqual(s.events, []);
  s.step(1);
  await flush();
  assert.deepEqual(s.events, ['antes da transição', 'montou destino']);
  s.step(1);
  s.step(1);
  s.resolveTexture();
  await flush();
  assert.equal(s.events.at(-1), 'entrada no prédio');
  s.step(2996);
  assert.equal(s.game.trans.phase, 'ready');
  s.step(1);
  assert.equal(s.game.trans.phase, 'in');
  s.step(230);
  assert.equal(s.game.trans, null);
});

test('mantém a tela além de três segundos quando ainda há textura pendente', async () => {
  const s = scenario();
  s.start('Área vizinha', () => {});
  s.step(140);
  s.step(1);
  await flush();
  s.step(1);
  s.step(5000);
  assert.equal(s.game.trans.phase, 'finishing');
  s.resolveTexture();
  await flush();
  s.step(1);
  assert.equal(s.game.trans.phase, 'in');
});

test('mantém o personagem na origem se o checkpoint inicial falhar', async () => {
  const s = scenario(false);
  s.start('Base', () => assert.fail('destino montado sem salvar a origem'));
  s.step(140);
  s.step(1);
  await flush();
  s.step(3000);
  s.step(230);
  assert.equal(s.game.trans, null);
  assert.match(s.events.at(-1), /continua no local atual/);
});
