const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const ctx = vm.createContext({console,Math,performance});
const run = code => vm.runInContext(code,ctx);
const source = n => fs.readFileSync(path.join(__dirname,'..','js',n+'.js'),'utf8');
for (const n of ['config','util','items','save','character','inventory','checkpoint']) run(source(n));
run(source('main').split('function resetGame() {')[1].split('// ---------- Controles ----------')[0].replace(/^/, 'function resetGame() {'));
run(`
var player,game,world,bullets,zombies,MAP=null,mouse={down:false};
var written=null,notes=[],travel=0;
function storeWrite(s){written=s;return Promise.resolve();}
function storeGet(){return written;}
function toast(s){notes.push(s);}
function stat(k){save.stats[k]=(save.stats[k]||0)+1;}
function recalcImplants(){player.maxHp=100;}
function makeWorld(){return {cell:{cx:0,cy:0,zone:0},outposts:[{}]};}
function doorFront(){return {x:100,y:200};}
function makeOffers(){return [];}
function manageRows(){}
function cellAt(cx,cy){return {cx,cy,tier:0};}
function gotoCell(c,p){travel++;world.cell=c;player.x=p.x;player.y=p.y;}
function inSafe(){return true;}
function packUsed(){return player.pack.length;}
var sfx={buy(){}};
save.name='Teste';save.prof='soldado';
function prepare(ids,money){
 resetGame();save.bank=12345;save.credits=77;save.vault=[];save.stats={};
 player.slots=[newInst('pistola',{acc:8,dmg:7,rel:6}),null,newInst('faca')];player.slots[0].ammo=3;
 player.pack=[newInst('ak47',{dmg:4}),{kind:'mat',id:'sucata',qty:9},...ids.map(id=>({kind:'mat',id,qty:1}))];
 player.reserve['9mm']=650;player.food=7;player.foodQ={podre:2,comum:3,fresca:2};player.water=8;player.med=4;player.anti=6;
 player.bag=[{id:'u',alloc:{}}];game.money=money;player.hp=-10;player.x=900;player.y=800;world.cell={cx:2,cy:3,zone:1};
}
`);
const json = code=>JSON.parse(run(`JSON.stringify(${code})`));
const possessions = '[player.slots,player.pack,player.reserve,player.food,player.foodQ,player.water,player.med,player.anti,player.bag,save.bank,save.credits]';
(async()=>{
for (const [ids,money,expected] of [[[],12345,0],[['cofre10k'],5000,5000],[['cofre10k'],10000,10000],[['cofre10k'],15000,10000],[['cofre100k'],123456,100000],[['cofre500k'],800000,500000],[['cofre10k','cofre100k'],150000,100000]]) {
 run(`prepare(${JSON.stringify(ids)},${money})`);
 const before=json(possessions);
 await run('recordDeath()');
 assert.equal(run('game.money'),expected);
 assert.equal(run('game.lost'),money-expected);
 assert.equal(run('save.stats.deaths'),1);
 assert.deepEqual(json(possessions),before);
 await run('recordDeath()');assert.equal(run('save.stats.deaths'),1,'death handled once');
 // Simulate reloading the app directly from the death screen.
 run('loadSave();resetGame();restoreRun()');
 assert.deepEqual(json(possessions),before,'possessions survive reload and respawn');
 assert.equal(run('game.money'),expected);
 assert.equal(run('player.hp'),100);
 assert.equal(run('game.over'),false);
 assert.deepEqual(json('[player.x,player.y,world.cell.cx,world.cell.cy]'),[100,200,0,0]);
 assert.equal(run('save.run.respawn'),undefined,'respawn is checkpointed as a live run');
}
// A safe in the base vault protects no carried cash.
run('prepare([],9000);save.vault=[{kind:"mat",id:"cofre500k",qty:1}]');await run('recordDeath()');assert.equal(run('game.money'),0);
// Enter path keeps items too, and a reusable safe works on another death.
run('prepare(["cofre10k"],15000)');const before=json(possessions);await run('recordDeath()');run('respawnPlayer()');assert.deepEqual(json(possessions),before);assert.equal(run('game.money'),10000);
run('game.money=18000');await run('recordDeath()');assert.equal(run('game.money'),10000);assert.equal(run('game.lost'),8000);
// Shop purchases are atomic for capacity/funds and serialized in the run.
run('resetGame();game.shopTab=4;game.shopCur=0;game.money=5000;shopBuy()');
assert.equal(run('game.money'),4000);assert.equal(run('cashProtection()'),10000);
assert.equal(JSON.parse(run('written')).run.p.pack[0].id,'cofre10k');
run('game.money=0');const noMoney=json('[player.pack,game.money]');run('shopBuy()');assert.deepEqual(json('[player.pack,game.money]'),noMoney);
run('game.money=10000;game.shopCur=1;player.pack=Array.from({length:PACK_MAX},()=>newInst("faca"))');const full=json('[player.pack,game.money]');run('shopBuy()');assert.deepEqual(json('[player.pack,game.money]'),full);
// Moving a safe to/from the vault updates both inventories in the same save.
run('resetGame();save.vault=[];player.slots=[null,null,null];player.pack=[{kind:"mat",id:"cofre10k",qty:1}];game.vside=0;game.vcur=0;vaultMove()');
assert.equal(run('cashProtection()'),0);
run('loadSave();resetGame();restoreRun()');
assert.equal(run('player.pack.length'),0);assert.equal(run('save.vault[0].id'),'cofre10k');
run('game.vside=1;game.vcur=0;vaultMove();loadSave();resetGame();restoreRun()');
assert.equal(run('cashProtection()'),10000);assert.equal(run('save.vault.length'),0);
assert.equal(run('validItem({kind:"mat",id:"cofre500k",qty:1})'),true);
assert.equal(run('validItem({kind:"mat",id:"cofre500k",qty:0})'),false);
console.log('PASS death/safes: no safe, all limits, excess, largest safe, vault exclusion, repeated deaths, item/credit/ammo retention, reload, respawn, purchase and save');
})().catch(e=>{console.error(e);process.exitCode=1});
