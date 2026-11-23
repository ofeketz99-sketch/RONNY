'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const model=vm.runInNewContext(read('scripts/src/00k-trip-model.js')+'\nTripModel');
const queries=vm.runInNewContext(read('scripts/src/00f-trip-queries.js')+'\nTripQueries');
const commands=vm.runInNewContext(read('scripts/src/00g-trip-state-commands.js')+'\nTripStateCommands');
const MAP_ONLY=new Set(['poi','note','idea','nature','viewpoint','dining','fuel','other']);
const valid=s=>Number.isFinite(Number(s?.lat))&&Number.isFinite(Number(s?.lng));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const p=(id,type,lat=0,lng=0,extra={})=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0,...extra});
const isAuto=commands.ronnyIsAutoEndpointName;
const plain=v=>JSON.parse(JSON.stringify(v));

test('legacy categories keep their original role without any stored field',()=>{
 for(const type of ['poi','note','nature','viewpoint','dining','fuel','other'])assert.equal(model.roleOf({type}),'side');
 for(const type of ['via','parking','rest','hike','attraction','hotel'])assert.equal(model.roleOf({type}),'stop');
 assert.equal(model.roleOf({type:'idea'}),'idea');
 for(const type of ['start','end'])assert.equal(model.roleOf({type}),'anchor');
 for(const type of ['walkStart','walkTurn','walkEnd'])assert.equal(model.roleOf({type}),'walk');
 const legacy=p('a','dining');model.normalizeStop(legacy);assert.equal(Object.hasOwn(legacy,'role'),false);
});
test('a restaurant switches role and back, keeping all of its data',()=>{
 const food=p('food','dining',32,35,{name:'מסעדה',iconId:'glencairn',cost:180,notes:'הזמנה',description:'תיאור'});
 const before=plain(food);
 assert.equal(model.setRole(food,'stop'),true);
 assert.equal(food.role,'stop');assert.equal(food.duration,60);
 assert.equal(queries.isMapOnlyPoint(food,MAP_ONLY),false);
 for(const key of ['name','lat','lng','iconId','cost','notes','description','type'])assert.equal(food[key],before[key]);
 assert.equal(model.setRole(food,'side'),true);
 assert.deepEqual(plain(food),before);
});
test('a duration the user changed survives leaving the schedule',()=>{
 const food=p('food','dining');model.setRole(food,'stop');food.duration=45;model.setRole(food,'side');
 assert.equal(food.duration,45);assert.equal(Object.hasOwn(food,'autoRoleDuration'),false);
});
test('anchors and walking points cannot change role',()=>{
 for(const type of ['start','end','walkStart','walkTurn','walkEnd']){
  const stop=p('x',type);assert.equal(model.setRole(stop,'side'),false);assert.equal(model.roleOf(stop),type.startsWith('walk')?'walk':'anchor');
  assert.equal(queries.isMapOnlyPoint({...stop,role:'side'},MAP_ONLY),false);
 }
});
test('a pass-through becomes a general side point and returns intact',()=>{
 const via=p('v','via',1,1,{name:'נקודת מעבר'});const before=plain(via);
 model.setRole(via,'side');assert.equal(via.type,'poi');assert.equal(via.name,'נקודת עניין');
 model.setRole(via,'stop');assert.deepEqual(plain(via),before);
});
test('side links use scheduled stops as anchors; ideas stay unlinked',()=>{
 const food=p('food','dining',5,5,{role:'stop'}),side=p('side','nature',5.1,5.1),idea=p('idea','dining',5.2,5.2,{role:'idea'});
 const trip={days:[{stops:[p('s','start'),food,p('e','end',9,9),side,idea]}]};
 const links=queries.poiLinksForDay(trip,0,MAP_ONLY,dist);
 assert.deepEqual(links.map(l=>[l.point.id,l.nearest.id]),[['side','food']]);
 assert.equal(queries.isIdeaPoint(idea),true);
});
test('a role-idea point stays visible on other days',()=>{
 const trip={days:[{stops:[p('a','via')]},{stops:[p('i','dining',1,1,{role:'idea'}),p('f','dining',2,2)]}]};
 assert.deepEqual(queries.currentStopsForMap(trip,[0]).map(x=>x.stop.id),['a','i']);
});
test('insertion picks the cheapest gap and never splits a walk or passes the endpoints',()=>{
 const route=[p('s','start',0,0),p('ws','walkStart',1,0),p('wt','walkTurn',1.5,0),p('we','walkEnd',1,0,{walkLoopSource:'ws'}),p('m','via',2,0),p('e','end',3,0)];
 const at=(lat)=>model.insertionIndex(route,p('x','dining',lat,0),dist,commands.routeUnits);
 assert.equal(at(1.5),4);assert.equal(at(0.5),1);assert.equal(at(2.5),5);assert.equal(at(-5),1);assert.equal(at(9),5);
 assert.equal(model.insertionIndex([],p('x','dining'),dist,commands.routeUnits),0);
});
const twoDays=()=>({days:[
 {dayId:'d1',stops:[p('a','start',1,1),p('b','end',2,2,{name:'מלון',cost:500})]},
 {dayId:'d2',stops:[p('c','start',2,2,{name:'נקודת יציאה יום 2',autoChronoName:true,fromPreviousDayEnd:'b',cost:500}),p('d','end',3,3)]}
]});
test('the end of a day and the next start form one night, counted once',()=>{
 const trip=twoDays(),index=model.nightIndex(trip,valid);
 assert.equal(index.groups.length,1);assert.equal(index.groups[0].owner.id,'b');
 const costs=model.countedCosts(trip,valid);assert.equal(costs.get('b'),500);assert.equal(costs.get('c'),0);
});
test('different amounts on one night are kept and flagged rather than dropped',()=>{
 const trip=twoDays();trip.days[1].stops[0].cost=200;
 const group=model.nightIndex(trip,valid).groups[0],cost=model.nightCost(group);
 assert.equal(cost.total,700);assert.equal(cost.conflict,true);
 model.setNightCost(group,650);
 assert.equal(trip.days[0].stops[1].cost,650);assert.equal(trip.days[1].stops[0].cost,0);
 assert.equal(model.nightCost(group).conflict,false);
});
test('circular days chain into one place with several nights',()=>{
 const trip={days:[
  {dayId:'d1',stops:[p('a','start',1,1),p('b','end',2,2)]},
  {dayId:'d2',loop:true,stops:[p('c','start',2,2,{fromPreviousDayEnd:'b'}),p('m','via',4,4),p('l','end',2,2,{autoLoopEnd:true})]},
  {dayId:'d3',stops:[p('e','start',2,2,{fromPreviousDayEnd:'c'}),p('f','end',5,5)]}
 ]};
 const index=model.nightIndex(trip,valid);
 assert.equal(index.groups.length,1);
 assert.deepEqual(plain(index.groups[0].members.map(m=>m.stop.id)),['b','c','e']);
 assert.deepEqual(plain(index.groups[0].nights),[0,1]);
 assert.equal(index.byStop.has('l'),false);
});
test('a user name reaches both days and is removed cleanly when the days separate',()=>{
 const trip=twoDays();
 assert.equal(model.syncNightNames(trip,valid,isAuto),true);
 const start=trip.days[1].stops[0];assert.equal(start.name,'מלון');assert.equal(start.nightNameInherited,true);
 model.setTransfer(trip,0,{kind:'flight',note:'LY1'});
 assert.equal(model.dayLink(trip,0,valid).state,'transfer');
 model.syncNightNames(trip,valid,isAuto);
 assert.equal(start.name,'');assert.equal(start.autoChronoName,true);assert.equal(start.nightNameInherited,undefined);
});
test('a custom name replaced by a shared name is restored on separation',()=>{
 const trip=twoDays();const start=trip.days[1].stops[0];start.name='לובי';start.autoChronoName=false;
 model.setNightName(model.nightIndex(trip,valid).groups[0],'מלון חדש');
 assert.equal(start.name,'מלון חדש');assert.equal(start.preNightName,'לובי');
 model.setTransfer(trip,0);model.syncNightNames(trip,valid,isAuto);
 assert.equal(start.name,'לובי');
});
test('a transfer keeps the start in place and labels only its original pair of days',()=>{
 const trip=twoDays();model.setTransfer(trip,0,{kind:'ferry',note:'לילה'});
 const start=trip.days[1].stops[0];start.lat=40;start.lng=20;
 let link=model.dayLink(trip,0,valid);assert.equal(link.state,'transfer');assert.equal(link.kind,'ferry');assert.equal(link.note,'לילה');
 trip.days[0].dayId='other';link=model.dayLink(trip,0,valid);
 assert.equal(link.state,'transfer');assert.equal(link.kind,null);
 assert.equal(start.dayTransfer.kind,'ferry');
});
test('an independent start with no link flag reads as a gap, never a shared night',()=>{
 const trip=twoDays();const start=trip.days[1].stops[0];delete start.fromPreviousDayEnd;start.lat=9;
 assert.equal(model.dayLink(trip,0,valid).state,'transfer');
});
test('a day with no end has an open link and no night',()=>{
 const trip=twoDays();trip.days[0].stops.pop();
 assert.equal(model.dayLink(trip,0,valid).state,'open');
 assert.equal(model.nightIndex(trip,valid).groups.length,0);
});
test('invalid saved values are removed without touching valid data',()=>{
 const bad=p('a','dining',1,1,{role:'captain',dayTransfer:{kind:'teleport'}});model.normalizeStop(bad);
 assert.equal(Object.hasOwn(bad,'role'),false);assert.equal(Object.hasOwn(bad,'dayTransfer'),false);
 const same=p('b','dining',1,1,{role:'side'});model.normalizeStop(same);assert.equal(Object.hasOwn(same,'role'),false);
 const start=p('c','start',1,1,{dayTransfer:{kind:'train',note:'x'.repeat(200),fromDayId:'d1'}});model.normalizeStop(start);
 assert.equal(start.startDetached,true);assert.equal(start.dayTransfer.note.length,120);
});
test('the render pipeline runs night sync in day view only',()=>{
 let calls=0;const base={syncWalkingLoops:()=>false,synchronizeLoopDays:()=>false,synchronizeDayStarts:()=>false,synchronizeChronologicalEndpointNames:()=>false,synchronizeNightIdentity:()=>{calls++;return true}};
 assert.equal(commands.synchronizeForRender({days:[]},true,base),true);assert.equal(calls,1);
 assert.equal(commands.synchronizeForRender({days:[]},false,base),false);assert.equal(calls,1);
});
