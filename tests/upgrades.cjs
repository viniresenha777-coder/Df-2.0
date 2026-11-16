const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const ctx = vm.createContext({console, Math: Object.create(Math)});
const run = code => vm.runInContext(code, ctx);
for (const name of ['config','util','items','save','character','inventory','render_extra'])
  run(fs.readFileSync(path.join(__dirname, '..', 'js', name+'.js'), 'utf8'));
run(`
var player={slots:[newInst('pistola')],pack:[{kind:'mat',id:'sucata',qty:100}],cur:0,fx:{craftDisc:0,thick:0,exp:0,greed:0,agility:0},attrs:{armor:0},hp:100,maxHp:100,hunger:100,thirst:100,flags:{}};
var game={money:100000,ccur:0,ctab:1,clicks:[]};
var persisted=null, messages=[], counts={};
function persist(){persisted=JSON.stringify(save);}
function stat(k){counts[k]=(counts[k]||0)+1;}
function toast(t){messages.push(t);}
function inSafe(){return true;}
function prof(){return null;}
function vestEff(){return 1;}
function recalcImplants(){}
function runSnapshot(){return {v:1,p:{slots:player.slots,pack:player.pack},g:{money:game.money}};}
var sfx={buy(){}};
function rng(values){let i=0;Math.random=()=>values[i++%values.length];}
`);
const json = expr => JSON.parse(run(`JSON.stringify(${expr})`));
// Minimum, mixed, maximum and rerolling down from the maximum.
for (const [values,expected] of [[[0,0,0],{acc:1,dmg:1,rel:1}], [[.125,.375,.75],{acc:2,dmg:4,rel:7}], [[.999,.999,.999],{acc:8,dmg:8,rel:8}], [[0,0,0],{acc:1,dmg:1,rel:1}]]) {
  run(`rng(${JSON.stringify(values)})`);
  const money=run('game.money'), scrap=run('matCount("sucata")'), cost=run('craftMoney(upgradeCost(player.slots[0]).money)');
  run('upgradeWeapon()');
  assert.deepEqual(json('player.slots[0].up'),expected);
  assert.equal(run('game.money'),money-cost);
  assert.equal(run('matCount("sucata")'),scrap-2);
  assert.deepEqual(JSON.parse(run('persisted')).run.p.slots[0].up,expected);
}
assert.equal(run('counts.upgrades'),4);
// Failure must not charge money, consume materials or alter any rolls.
run('game.money=0');let before=json('[game.money,player.slots[0].up,player.pack,counts]');run('upgradeWeapon()');assert.deepEqual(json('[game.money,player.slots[0].up,player.pack,counts]'),before);
run('game.money=100000;player.pack=[]');before=json('[game.money,player.slots[0].up,counts]');run('upgradeWeapon()');assert.deepEqual(json('[game.money,player.slots[0].up,counts]'),before);
// Each vest keeps its own roll; equipping another vest changes live effects.
run('player.pack=[{kind:"mat",id:"sucata",qty:100}];save.vestsOwned[0]=true;save.vestsOwned[1]=true;save.vest=0;game.ctab=2;rng([0,.999]);upgradeVest()');
assert.deepEqual(json('vestUpgrade(0)'),{armor:1,speed:24});
assert.equal(run('vestSpeedBonus()'),24);
assert.equal(run('equipmentProtection()'),run('VESTS[0].armor+1'));
run('game.ccur=1;rng([.999,0]);upgradeVest()');
assert.deepEqual(json('vestUpgrade(1)'),{armor:24,speed:1});
assert.deepEqual(json('vestUpgrade(0)'),{armor:1,speed:24});
run('save.vest=1');assert.equal(run('vestSpeedBonus()'),1);
run('save.vest=-1');assert.equal(run('vestSpeedBonus()'),0);
assert.deepEqual(json('cleanVestUpgrade({armor:999,speed:-5})'),{armor:24,speed:0});
assert.deepEqual(json('cleanVestUpgrade({armor:Infinity,speed:"oops"})'),{armor:0,speed:0});
// Reload, legacy saves, and upgrade validation for owned vests only.
run('var saved=JSON.stringify(save);function storeGet(){return saved;}save.vestUpgrades={};loadSave()');
assert.deepEqual(json('vestUpgrade(0)'),{armor:1,speed:24});
run('saved=JSON.stringify({vest:0,vestVer:2,vestDur:{0:33},vestUpgrades:{0:{armor:999,speed:12.9},1:{armor:24,speed:24}}});loadSave()');
assert.deepEqual(json('vestUpgrade(0)'),{armor:24,speed:12});
assert.deepEqual(json('vestUpgrade(1)'),{armor:0,speed:0});
assert.equal(run('save.vestDur[0]'),33);
run('saved=JSON.stringify({vest:0,vestVer:2});loadSave()');
assert.deepEqual(json('vestUpgrade(0)'),{armor:0,speed:0});
// Render both tabs with the actual UI code. Values are text, stat rows aren't buttons.
run(`
var labels=[], buttons=[];
var ctx={fill(){},fillRect(){},measureText(t){return {width:t.length*6}}};
function txt(t){labels.push(t);}function rr(){}function rowBox(){}function drawListItem(){}
function drawWeaponSide(){}function drawVestIcon(){}function drawMatIcon(){}
function menuFrame(){}function menuToast(){}function hint(t){labels.push(t);}
function btn(x,y,w,h,label,fn){buttons.push({label,fn});}
function vestDur(){return 100;}function repairCost(){return 0;}function repairVest(){}
`);
for(const tab of [1,2]) {
 run(`labels=[];buttons=[];game.clicks=[];game.ctab=${tab};game.ccur=0;drawCraft()`);
 assert.ok(json('labels').some(x=>x==='Substitui os valores atuais; pode diminuir.'));
 assert.ok(json('labels').some(x=>tab===1?x.startsWith('Precisão '):x.startsWith('Armadura ')));
 assert.equal(run('game.clicks.filter(c=>c.x===600 && c.y>=262 && c.y<406).length'),0);
 assert.equal(run('buttons.filter(b=>b.label==="Melhorar (Enter)").length'),1);
}
run('game.ctab=0;craftKey("tab")');assert.equal(run('game.ctab'),1);
run('craftKey("tab")');assert.equal(run('game.ctab'),2);
run('craftKey("tab")');assert.equal(run('game.ctab'),0);
console.log('PASS random upgrades: 1/1/1, 2/4/7, 8/8/8, rerolls, costs, failures, independent vests, effects, persistence, legacy saves, numeric UI and tabs');
