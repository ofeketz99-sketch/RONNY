'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=n=>fs.readFileSync(path.join(__dirname,'../scripts/src',n+'.js'),'utf8');
function extract(text,from,until){const start=text.indexOf(from),end=text.indexOf(until,start+from.length);assert.ok(start>=0&&end>start);return text.slice(start,end)}
function createWalkSync(){
 let id=0;const cache=new Map();
 const ctx={
  uid:()=>String(++id),
  isMapOnlyPoint:p=>new Set(['poi','note','idea','nature','viewpoint','dining','fuel','other']).has(p?.type),
  legAt:(i,arr)=>arr[i].leg||{mode:'auto',path:[]},
  routedLegVisualCache:cache,
  routedShapeKey:(arr,i,profile)=>i+'-'+profile,
  legCoords:(i,arr)=>[[arr[i-1].lat,arr[i-1].lng],...(arr[i].leg?.path||[]),[arr[i].lat,arr[i].lng]]
 };
 return vm.runInNewContext(extract(source('00-initial-state'),'function syncWalkingLoops(','function syncLoopDay(')+'\nsyncWalkingLoops',ctx);
}
function createTimeline(){
 return vm.runInNewContext(extract(source('24-timeline-scheduling'),'function ronnyFutureWalkingClock(','function applyItineraryTimes(')+'\nronnyApplyWalkingTimeline',{clockMinutes:s=>{const [h,m]=String(s).split(':').map(Number);return 60*h+m}});
}
const stop=(id,type,lat=32,lng=34)=>({id,type,lat,lng,time:'10:00'});
const types=day=>day.stops.map(s=>s.type);
test('walking finish is before the day endpoint',()=>{
 const day={stops:[stop('s','start'),stop('w','walkStart'),stop('t','walkTurn',33,35),stop('e','end',34,36)]},sync=createWalkSync();
 assert.equal(sync(day),true);
 assert.equal(JSON.stringify(types(day)),JSON.stringify(['start','walkStart','walkTurn','walkEnd','end']));
 const finish=day.stops[3];assert.equal(finish.lat,day.stops[1].lat);assert.equal(finish.lng,day.stops[1].lng);
 assert.equal(finish.walkLoopSource,'w');assert.equal(sync(day),false);
});
test('previously persisted misplaced finish is moved without replacing its identity',()=>{
 const old={...stop('old','walkEnd'),walkLoopSource:'w',autoWalkEnd:true,notes:'retain this note'};
 const day={stops:[stop('s','start'),stop('w','walkStart'),stop('t','walkTurn',33,35),stop('end','end',34,36),old]},sync=createWalkSync();
 assert.equal(sync(day),true);assert.equal(day.stops[3],old);assert.equal(old.notes,'retain this note');
 assert.equal(sync(day),false);
});
test('manual outward geometry is mirrored without visiting the day endpoint',()=>{
 const w=stop('w','walkStart'),turn={...stop('t','walkTurn',33,35),leg:{mode:'draw',fromId:'w',path:[[32.5,34.5]]}};
 w.walkRetrace=true;const day={stops:[stop('s','start'),w,turn,stop('end','end',40,41)]};
 const sync=createWalkSync();assert.equal(sync(day),true);
 const finish=day.stops[3];assert.equal(finish.leg.walkAutoRetrace,true);
 assert.equal(finish.leg.walkRetraceUnverified,false);
 assert.equal(JSON.stringify(finish.leg.path),JSON.stringify([[32.5,34.5]]));
 assert.equal(finish.leg.fromId,'t');
 assert.equal(sync(day),false);
});
test('two independent walking loops remain before the final day endpoint',()=>{
 const day={stops:[stop('a','walkStart',1,1),stop('b','walkTurn',2,2),stop('c','walkStart',3,3),stop('d','walkTurn',4,4),stop('end','end',5,5)]};
 assert.equal(createWalkSync()(day),true);
 assert.equal(JSON.stringify(types(day)),JSON.stringify(['walkStart','walkTurn','walkEnd','walkStart','walkTurn','walkEnd','end']));
 assert.equal(day.stops[2].walkLoopSource,'a');assert.equal(day.stops[5].walkLoopSource,'c');
});
test('walking with no turn ends before the day endpoint',()=>{
 const day={stops:[stop('s','start'),stop('w','walkStart'),stop('e','end',40,41)]};
 createWalkSync()(day);assert.equal(JSON.stringify(types(day)),JSON.stringify(['start','walkStart','walkEnd','end']));
});
test('walking intermediate route points remain ahead of generated finish',()=>{
 const day={stops:[stop('w','walkStart'),stop('v','via',33,35),stop('t','walkTurn',34,36),stop('e','end',40,41)]};
 createWalkSync()(day);assert.equal(JSON.stringify(types(day)),JSON.stringify(['walkStart','via','walkTurn','walkEnd','end']));
});
test('retrace can be disabled without deleting day endpoint',()=>{
 const w={...stop('w','walkStart'),walkRetrace:true},day={stops:[stop('s','start'),w,stop('t','walkTurn',33,35),stop('e','end',40,41)]};
 const sync=createWalkSync();sync(day);const finish=day.stops[3];assert.equal(finish.leg.walkAutoRetrace,true);
 w.walkRetrace=false;assert.equal(sync(day),true);assert.equal(finish.leg,undefined);assert.equal(day.stops[4].type,'end');
});
test('time midpoint and following stops remain chronological',()=>{
 const arr=[{id:'w',type:'walkStart',duration:120},{id:'t',type:'walkTurn'},{id:'f',type:'walkEnd',walkLoopSource:'w'},{id:'n',type:'via'}];
 const abs=[600,615,640,680];createTimeline()(arr,abs,0);
 assert.equal(JSON.stringify(abs),JSON.stringify([600,660,720,760]));
});
test('manual turn and finish times preserve the user choices',()=>{
 const arr=[{id:'w',type:'walkStart',duration:90,walkTurnClock:'10:30',walkFinishClock:'11:50'},{id:'t',type:'walkTurn'},{id:'f',type:'walkEnd',walkLoopSource:'w'}];
 const abs=[600,630,650];assert.equal(createTimeline()(arr,abs,0),true);
 assert.equal(JSON.stringify(abs),JSON.stringify([600,630,710]));assert.equal(arr[0].duration,110);
});
test('walk crossing midnight preserves the following stop offset',()=>{
 const arr=[{id:'w',type:'walkStart',duration:0,walkFinishClock:'00:30'},{id:'f',type:'walkEnd',walkLoopSource:'w'},{id:'n',type:'via'}];
 const abs=[1425,1440,1470];createTimeline()(arr,abs,0);
 assert.equal(JSON.stringify(abs),JSON.stringify([1425,1470,1500]));
});
test('manual anchor inside walking route stays pinned',()=>{
 const arr=[{id:'w',type:'walkStart',duration:120},{id:'t',type:'walkTurn'},{id:'f',type:'walkEnd',walkLoopSource:'w'}],abs=[600,620,680];
 createTimeline()(arr,abs,1,{stopId:'t',kind:'arrival',time:'10:20'});
 assert.equal(abs[1],620);assert.equal(abs[2],720);
});
