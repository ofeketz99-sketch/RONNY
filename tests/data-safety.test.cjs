'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const commands=vm.runInNewContext(read('scripts/src/00g-trip-state-commands.js')+'\nTripStateCommands');
const storage=vm.runInNewContext(read('scripts/src/00e-trip-storage.js')+'\nTripStorage');
const p=(id,type,extra={})=>({id,type,...extra});
const walkDay=()=>[p('s','start'),p('park','parking'),p('ws','walkStart'),p('wt','walkTurn'),p('we','walkEnd',{walkLoopSource:'ws'}),p('via','via'),p('e','end')];
const ids=list=>Array.from(list,x=>x.id);

test('a walking loop moves as one block past a neighbouring stop',()=>{
 const plan=commands.planRouteStep(walkDay(),'ws',1);
 assert.deepEqual(ids(plan.ordered),['s','park','via','ws','wt','we','e']);
});
test('a stop moving across a walk jumps over the whole block',()=>{
 const plan=commands.planRouteStep(walkDay(),'via',-1);
 assert.deepEqual(ids(plan.ordered),['s','park','via','ws','wt','we','e']);
});
test('walking points cannot leave their walk',()=>{
 assert.ok(commands.planRouteStep(walkDay(),'wt',-1).error);
 assert.ok(commands.planRouteStep(walkDay(),'we',1).error);
 assert.ok(commands.planRouteSwap(walkDay(),'wt','via').error);
});
test('a walk cannot be placed before the day start or after the day finish',()=>{
 assert.ok(commands.planRouteSwap(walkDay(),'ws','s').error);
 assert.ok(commands.planRouteSwap(walkDay(),'e','ws').error);
});
test('intermediate walking points may swap inside the same walk',()=>{
 const day=[p('s','start'),p('ws','walkStart'),p('a','walkTurn'),p('b','via'),p('we','walkEnd',{walkLoopSource:'ws'}),p('e','end')];
 assert.deepEqual(ids(commands.planRouteSwap(day,'a','b').ordered),['s','ws','b','a','we','e']);
});
test('a derived circular finish never moves',()=>{
 const day=[p('s','start'),p('v','via'),p('auto','end',{autoLoopEnd:true})];
 assert.ok(commands.planRouteStep(day,'v',1).error);
});

function fakeDb(initial){
 const rows=new Map(initial?[[initial.id,initial]]:[]);
 return {rows,transaction(){
  const tx={objectStore:()=>({
   get(id){const req={};queueMicrotask(()=>{req.result=rows.get(id);req.onsuccess?.();queueMicrotask(()=>tx.oncomplete?.())});return req},
   put(value){rows.set(value.id,value);return {}}
  })};
  return tx;
 }};
}
test('a stale tab cannot overwrite a newer saved trip',async()=>{
 const db=fakeDb({id:'t',rev:5,title:'newer'});
 const result=await storage.putIfCurrent(db,'trips',{id:'t',title:'stale'},4);
 assert.equal(result.conflict,true);
 assert.equal(db.rows.get('t').title,'newer');
});
test('a current tab saves and advances the revision',async()=>{
 const db=fakeDb({id:'t',rev:5,title:'old'});
 const result=await storage.putIfCurrent(db,'trips',{id:'t',title:'new'},5);
 assert.equal(result.conflict,false);
 assert.equal(result.rev,6);
 assert.equal(db.rows.get('t').title,'new');
 assert.equal(db.rows.get('t').rev,6);
});
test('a trip deleted in another tab is not resurrected',async()=>{
 const db=fakeDb(null);
 const result=await storage.putIfCurrent(db,'trips',{id:'t',title:'ghost'},3);
 assert.equal(result.conflict,true);
 assert.equal(db.rows.has('t'),false);
});
test('total distance has no reference to an undefined results array',()=>{
 assert.ok(!/results\[i-1\]/.test(read('scripts/src/62-geographic-stats.js')));
});
test('repository keeps files byte-exact across platforms',()=>{
 assert.match(read('.gitattributes'),/^\* -text$/m);
});
