const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const read = name => fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
function section(text, first, last) { return text.slice(text.indexOf(first), text.indexOf(last)); }

test('todas as armas do cadastro exibem estatísticas e munição consistentes', () => {
  const items = read('items.js'), inventory = read('inventory.js'), junk = read('junk.js');
  const context = vm.createContext({});
  vm.runInContext([
    section(items, 'const AMMO =', '// ---------- Materiais e receitas'),
    section(items, 'function newInst(', '// coloca a arma num slot vazio'),
    section(junk, 'const JUNK_RAR =', 'const RESET_STATS_PRICE'),
    'const SCRAP_RATE = 0.3;',
    section(junk, 'function weaponSellPrice(', 'function weaponParts('),
    section(inventory, 'function weaponAmmoName(', '// luz atrás da arma'),
  ].join('\n'), context);
  const rows = vm.runInContext('WLIST.map(d => [d.id, Object.fromEntries(weaponInfoRows(d))])', context);
  const info = Object.fromEntries(rows);
  for (const [id, fields] of rows) {
    assert.notEqual(fields['Munição'], '—', id);
    assert.equal(Object.keys(fields).length, 7, id);
    assert.ok(fields['DPS teórico'], id);
  }
  assert.equal(info.pistolalamina.Dano, '14 × 4');
  assert.equal(info.pistolalamina['DPS teórico'], '84');
  assert.equal(info.minigun_inf['Munição'], 'Munição infinita');
  assert.equal(info.minigun_inf_oficina['Munição'], '5.56');
  assert.equal(info.besta['Munição'], 'Flechas');
  assert.equal(info.faca['Munição'], 'Não utiliza munição');
  assert.equal(info.faca.Carregador, '—');
  assert.doesNotMatch(inventory + read('paperdoll.js') + read('library.js'), /weaponAggroText\(/);
});
