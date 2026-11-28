const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function section(file, start, end) {
  const source = readFileSync(resolve(__dirname, '../js', file + '.js'), 'utf8');
  return source.slice(source.indexOf(start), source.indexOf(end));
}

test('o baú mostra a ficha de implantes, armas e coletes sob o mouse', () => {
  const lines = [];
  const mouse = { x: 120, y: 125 };
  const vault = [
    { kind: 'implant', id: 'olho' },
    { kind: 'weapon', id: 'pistola' },
    { kind: 'vest', id: 0, dur: 40 },
    { kind: 'vest', id: 0, i: 10001, dur: 25, validadeDias: 7 },
    { kind: 'mat', id: 'sucata', qty: 2 },
  ];
  const inventory = [{ type: 'implant', item: vault[0] }];
  const vest = { name: 'Colete', armor: 20, price: 1000 };
  const ctx = vm.createContext({
    mouse, save: { vault, installed: [], giftVests: {}, vest: 0 }, game: {},
    W: 960, H: 600, FONT: 'sans-serif', INV: {},
    ctx: { fill() {}, stroke() {}, fillRect() {}, strokeRect() {}, save() {}, restore() {},
      measureText: value => ({ width: value.length * 6 }) },
    fmVaultRows: () => 5, fmVaultCapacity: () => 40, fmStashInventoryCapacity: () => 30,
    fmStashEntries: () => inventory, fmStashIcon() {}, fmStashMetal() {}, fmVaultBuy() {}, menuFrame() {}, rr() {},
    btn() {}, rowClick() {}, txt: text => lines.push(text),
    VESTS: [vest], vestDefinition: () => vest, vestDur: () => 90,
    vestUpgrade: () => ({ armor: 2, speed: 0 }), SCRAP_RATE: 0.3,
    WDEF: { pistola: { cat: 'pistols' } }, CAT_LABEL: { pistols: 'Pistola' },
    weaponInfoRows: () => [['Munição', '9mm'], ['DPS teórico', '75']],
    reqText: () => 'Nível 5', canUse: () => true, instName: () => 'Pistola',
    IMP: { olho: { name: 'Olho', fx: { hunter: 25 } } }, FX_LABEL: { hunter: 'chance de achar armas' },
    sgn: n => '+' + n, implantName: () => 'Olho', implantSellPrice: () => 2000,
    MATS: { sucata: { name: 'Sucata' } },
  });
  vm.runInContext([
    section('inventory', 'function fmStashItemTitle(', 'function fmStashSave('),
    section('inventory', 'function fmVaultLayout(', 'function fmVaultPin('),
    section('inventory', 'function fmStashStoredEntry(', 'function fmStashSelect('),
    section('inventory', 'function drawItemTooltip(', 'const AMMO_PACK_SIZE'),
    section('inventory', 'function vestText(', 'function buyVest('),
    section('paperdoll', 'function invItemName(', 'const SUPPLY ='),
    section('paperdoll', 'function fmScrapLine(', 'function txtWrap('),
    section('junk', 'function vestSellPrice(', 'function ammoSellPrice('),
  ].join('\n'), ctx);

  function hover(x, y = 125) {
    mouse.x = x;
    mouse.y = y;
    lines.length = 0;
    ctx.drawStash();
    return lines.join('\n');
  }

  assert.match(hover(120), /\+25% chance de achar armas/);
  assert.match(hover(120), /Ferro Velho: \$2\.000/);
  assert.match(hover(213), /Munição: 9mm[\s\S]*DPS teórico: 75[\s\S]*Requisitos: Nível 5/);
  assert.match(hover(306), /Proteção: -22% dano[\s\S]*Durabilidade atual: 40%[\s\S]*Ferro Velho: \$120/);
  assert.doesNotMatch(hover(306), /tire o colete/);
  assert.match(hover(399), /Após o primeiro uso: 7 dia\(s\)[\s\S]*Durabilidade atual: 25%[\s\S]*venda bloqueada/);
  assert.match(hover(492), /Sucata ×2/);
  assert.match(hover(42, 460), /\+25% chance de achar armas/);
});
