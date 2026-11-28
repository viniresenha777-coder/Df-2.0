const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const sources = Object.fromEntries(['world', 'interact', 'main', 'render'].map(name => [name,
  fs.readFileSync(path.join(__dirname, `../js/${name}.js`), 'utf8')]));

test('as quatro bordas mostram passagem válida e aguardam E', () => {
  const player = { r: 12, level: 1 };
  const game = {};
  const moves = [];
  let tier = 0;
  const context = vm.createContext({ player, game, adm: {}, GRAY_LEVEL: 20, WORLD_W: 1000, WORLD_H: 800,
    H_STREETS: [[300, 500]], V_STREETS: [[400, 600]], world: { cell: { cx: 0, cy: 0 } },
    cellAt: (cx, cy) => ({ cx, cy, tier }), nearSpot: () => null,
    startLocationLoad: (_, load) => { game.trans = true; load(); },
    gotoCell: (cell, pos) => moves.push([cell.cx, cell.cy, pos.x, pos.y]) });
  vm.runInContext(sources.world.slice(sources.world.indexOf('function streetExit('), sources.world.indexOf('function startLocationLoad(')), context);
  vm.runInContext(sources.interact.slice(sources.interact.indexOf('function interact()'), sources.interact.indexOf('  if (!s) return;', sources.interact.indexOf('function interact()'))) + '}', context);

  for (const [x, y, expected] of [[22, 400, [-1, 0, 961, 400]], [978, 400, [1, 0, 39, 400]],
    [500, 22, [0, -1, 500, 761]], [500, 778, [0, 1, 500, 39]]]) {
    Object.assign(player, { x, y });
    game.trans = false;
    const previousMoves = moves.length;
    assert.ok(context.nearbyAreaExit());
    assert.equal(moves.length, previousMoves);
    context.interact();
    assert.deepEqual(moves.at(-1), expected);
    context.interact();
    assert.equal(moves.length, previousMoves + 1);
  }
  game.trans = false;
  Object.assign(player, { x: 60, y: 400 });
  assert.equal(context.nearbyAreaExit(), null);
  Object.assign(player, { x: 22, y: 210 });
  assert.equal(context.nearbyAreaExit(), null);
  player.y = 400;
  tier = 8;
  assert.equal(context.nearbyAreaExit(), null);
  assert.doesNotMatch(sources.main, /edgeCheck\(/);
  assert.match(sources.main, /if \(e\.repeat && !game\.menu\) return/);
  assert.match(sources.render, /Pressione \[E\] para mudar de área\./);
});
