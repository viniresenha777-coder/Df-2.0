const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..');
const source = name => fs.readFileSync(`${root}/js/${name}.js`, 'utf8');
function load(ctx, names) { names.forEach(n => vm.runInContext(source(n), ctx, {filename:n})); }
function run(ctx, code) { return vm.runInContext(code, ctx); }
const flush = async () => { for (let i=0;i<12;i++) await Promise.resolve(); };
class Bus {
  channels = [];
  client(uid) {
    const bus=this;
    return {
      from: table => ({ select: () => ({eq: () => ({maybeSingle:async()=>({data:{nome:uid}})}), order:async()=>({data:[]})}) }),
      rpc: async()=>({data:[{inicio_ms:Date.now()-10000, agora_ms:Date.now()}]}),
      removeChannel: async c => { bus.channels=bus.channels.filter(x=>x!==c); bus.sync(); },
      channel(topic) {
        const c={topic, handlers:[], state:null,
          on(type, filter, fn){this.handlers.push({type,event:filter.event,fn});return this;},
          subscribe(fn){this.sub=fn;queueMicrotask(()=>fn('SUBSCRIBED'));return this;},
          presenceState(){return Object.fromEntries(bus.channels.filter(x=>x.topic===topic&&x.state).map(x=>[x.state.uid,[x.state]]));},
          async track(s){this.state=structuredClone(s);bus.sync();return 'ok';},
          async untrack(){this.state=null;bus.sync();},
          async send(m){ for(const other of bus.channels.filter(x=>x!==c&&x.topic===topic)) for(const h of other.handlers) if(h.type==='broadcast'&&h.event===m.event) h.fn({payload:structuredClone(m.payload)}); return 'ok'; }
        }; bus.channels.push(c);return c;
      }
    };
  }
  sync(){for(const c of this.channels)for(const h of c.handlers)if(h.type==='presence')h.fn();}
}
function client(bus, uid) {
  const db=bus.client(uid);
  const ctx=vm.createContext({console,Math,Date,performance,crypto,queueMicrotask,setInterval:()=>1,clearInterval(){},window:{addEventListener(){}},fmCloud:{userId:()=>uid,socialClient:()=>db}});
  load(ctx,['config','util']);
  run(ctx,`var world={cell:{cx:0,cy:0,zone:0},pop:true}; var game={inside:null}; var save={name:${JSON.stringify(uid)},skin:0}; var player={x:400,y:400,angle:0,r:14}; var zombies=[]; function persist(){} function Zs(){return game.inside?game.inside.zombies:zombies;} function IW(){return game.inside?game.inside.iw:WORLD_W;} function IH(){return game.inside?game.inside.ih:WORLD_H;} function makeZombie(x,y,type){return {x,y,type};} function alertZombie(){} function killZombie(z){z.dead=true;} function damagePlayer(d){player.damage=(player.damage||0)+d;} function addInfection(){}`);
  load(ctx,['social','shared_world']);return ctx;
}
(async()=>{
 const bus=new Bus(), a=client(bus,'alice'), b=client(bus,'bruno');
 await run(a,'fmSocial.start()');await run(b,'fmSocial.start()');await flush();
 run(a,'fmWorld.start()');run(b,'fmWorld.start()');await flush();
 for (const cell of run(a,'MAP_GRID.flatMap((row, cy) => [...row].flatMap((v, cx) => v === "." ? [] : [[cx, cy]]))')) {
   for(const c of [a,b])run(c,`world.cell.cx=${cell[0]};world.cell.cy=${cell[1]};fmSocial.refreshLocation()`);
   await flush();bus.sync();
   assert.equal(run(a,'fmSocial.inSector().length'),1,'players visible in each sector');
 }
 for(const c of [a,b])run(c,'game.inside={x:100,y:200,level:0,iw:1920,ih:1080,zombies:[]};player.x=1800;fmSocial.refreshLocation()');
 await flush();bus.sync();
 assert.equal(run(a,'fmSocial.inSector()[0].x'),1800,'large interior position is not clipped');
 run(a,'game.inside.zombies=[{netId:"z1",x:1800,y:400,type:Object.keys(ZTYPES)[0],hp:100,maxHp:100,r:15,dmg:10}];fmWorld.tick()');run(b,'fmWorld.requestSync()');
 await flush();
 assert.equal(run(b,'game.inside.zombies[0].netId'),'z1','interior zombies synchronized');
 assert.equal(run(b,'zombies.length'),0,'interior snapshot does not replace street zombies');
 run(b,'fmWorld.reportHit(game.inside.zombies[0],20,0)');await flush();
 assert.equal(run(a,'game.inside.zombies[0].hp'),80,'interior hit reaches host');
 run(b,'game.inside.level=1;fmSocial.refreshLocation()');await flush();
 assert.equal(run(a,'fmSocial.inSector().length'),0,'different floors isolated');
 run(b,'game.inside.level=0;game.inside.x=101;fmSocial.refreshLocation()');await flush();
 assert.equal(run(a,'fmSocial.inSector().length'),0,'different houses isolated');
 run(b,'game.inside=null;fmSocial.refreshLocation()');await flush();
 assert.equal(run(a,'fmSocial.inSector().length'),0,'street and house isolated');
 // Changing scene before subscription must not follow the former room's host.
 run(b,'world.cell.cx=5');assert.equal(run(b,'fmWorld.isFollower()'),false);
 console.log('PASS multiplayer: sectors, interiors, floors, large rooms, hits, transition isolation');
 const c=vm.createContext({console,Math});load(c,['config','util','items','interact','character','render_extra']);
 run(c,`var player={fx:{thick:20,exp:0,greed:0},attrs:{armor:0},hp:100,maxHp:100,hunger:100,thirst:100,flags:{}};var save={installed:[],vest:0,gm:false};function vestEff(){return 1;}function prof(){return null;}function curW(){return {};}function inSafe(){return false;}VESTS[0].armor=10;`);
 assert.ok(Math.abs(run(c,'armorRed()')-0.3)<1e-9,'10 vest + 20 implant = 30');
 assert.equal(run(c,'activeBonuses().filter(x=>x.text.includes("dano recebido")).length'),1);
 assert.equal(run(c,'activeBonuses().find(x=>x.text.includes("dano recebido")).text'),'-30% dano recebido');
 run(c,'save.gm=true;player.fx.exp=15');
 assert.equal(run(c,'activeBonuses().find(x=>x.text.includes("XP")).text'),'+130% XP');
 assert.equal(run(c,'activeBonuses().find(x=>x.text.includes("dinheiro")).text'),'+100% dinheiro');
 assert.equal(run(c,'activeBonuses().some(x=>x.text.includes("XP")&&x.text.includes("dinheiro"))'),false);
 run(c,'player.fx.thick=500');assert.ok(run(c,'armorRed()')<1,'stacking cannot create damage immunity');
 console.log('PASS bonuses: additive equipment protection, one total, separate XP/money, cap');
 for(const type of run(c,'Object.keys(BTYPES)')) {
   run(c,`var house={x:100,y:200,def:BTYPES[${JSON.stringify(type)}],iw:960,ih:600};var first=makeInterior(house,[],0);var rug1=JSON.stringify(house.rug);var second=makeInterior(house,[],0);`);
   assert.equal(run(c,'JSON.stringify(first.map(({searchable,...f})=>f))'),run(c,'JSON.stringify(second.map(({searchable,...f})=>f))'),`fixed layout: ${type}`);
   assert.equal(run(c,'rug1'),run(c,'JSON.stringify(house.rug)'));
 }
 console.log('PASS interiors: fixed furniture and decorations for every building type');
})().catch(e=>{console.error(e);process.exitCode=1;});
