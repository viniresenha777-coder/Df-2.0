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
  assert.equal(info.pistolalamina.Dano, '45 × 4');
  assert.equal(info.pistolalamina['DPS teórico'], '270');
  const expectedDamage = {
    pistola: 30, colt: 45, glock: 9, silenciada: 42, revolver: 65, deagle: 60,
    pistola_natal: 100, uzi: 9, mp5: 13, p90: 18, vector: 26, ak47: 20,
    m4: 24, fal: 28, scar: 34, ak_ouro: 30, lancachamas: 3, m249: 30,
    minigun: 22, minigun_inf_oficina: 23, minigun_inf: 23, canoduplo: 6, escopeta: 7, spas: 15,
    aa12: 15, incendiaria: 24, dose: 12, pistolalamina: 45, caca: 85, sniper: 130,
    barrett: 280, choque: 110, lancador: 200, besta: 400, vingador: 600, trovao: 1000,
    faca: 16, taco: 35, facao: 55, katana: 50, machado: 75, marreta: 140,
    serra: 15, espada: 190, lamina: 250, katana_dragao: 350, espadafogo: 280, espadaserra: 50,
    punhos: 8,
  };
  const weaponDamage = vm.runInContext('Object.fromEntries(WLIST.map(d => [d.id, wStat(newInst(d.id)).dmg]))', context);
  assert.equal(Object.keys(weaponDamage).length, 49);
  assert.deepEqual({ ...weaponDamage }, expectedDamage);
  assert.equal(info.minigun_inf['Munição'], 'Munição infinita');
  assert.equal(info.minigun_inf_oficina['Munição'], '5.56');
  assert.equal(info.besta['Munição'], 'Flechas');
  assert.equal(info.faca['Munição'], 'Não utiliza munição');
  assert.equal(info.faca.Carregador, '—');
  assert.doesNotMatch(inventory + read('paperdoll.js') + read('library.js'), /weaponAggroText\(/);
});
