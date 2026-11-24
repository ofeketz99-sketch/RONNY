'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const model=vm.runInNewContext(read('scripts/src/00k-trip-model.js')+'\nTripModel');
const commands=vm.runInNewContext(read('scripts/src/00g-trip-state-commands.js')+'\nTripStateCommands');
const geometry=vm.runInNewContext(read('scripts/src/00h-route-geometry.js')+'\nRouteGeometry');
const queries=vm.runInNewContext(read('scripts/src/00f-trip-queries.js')+'\nTripQueries');
const format=vm.runInNewContext(read('scripts/src/00d-core-format.js')+'\nCoreFormat');
const geo=vm.runInNewContext(read('scripts/src/00b-core-geo.js')+'\nCoreGeo');
const plain=v=>JSON.parse(JSON.stringify(v));
const p=(id,type,x={})=>({id,type,name:id,time:'09:00',duration:0,lat:0,lng:0,...x});
const walkRoute=(startExtra={})=>[p('s','start'),p('ws','walkStart',startExtra),p('wt','walkTurn'),p('we','walkEnd',{walkLoopSource:'ws',leg:{fromId:'wt',mode:'draw',walkAutoRetrace:true}}),p('e','end')];
const missing=(extra={})=>({duration:0,distance:900,manualMissing:true,...extra});
const known=(duration,extra={})=>({duration,distance:1000,manualMissing:false,...extra});

test('a walk block spans its first and last point',()=>{
 const blocks=model.walkBlocks(walkRoute(),commands.routeUnits);
 assert.equal(blocks.length,1);assert.equal(blocks[0].start.id,'ws');assert.equal(blocks[0].end.id,'we');
 assert.equal(model.walkMinutes({start:{time:'23:30'},end:{time:'00:10',dayOffset:1}}),40);
 assert.equal(model.walkMinutes({start:{time:''},end:{time:'10:00'}}),null);
});
test('a same-trail return takes as long as the way out',()=>{
 const legs=model.resolveWalkLegs(walkRoute(),[known(0),known(1800),missing()],commands.routeUnits);
 assert.equal(legs[2].duration,1800);assert.equal(legs[2].manualMissing,false);assert.equal(legs[2].derivedRetrace,true);
});
test('a return is not invented when the way out has no duration',()=>{
 const legs=model.resolveWalkLegs(walkRoute(),[known(0),missing(),missing()],commands.routeUnits);
 assert.equal(legs[2].manualMissing,true);assert.equal(legs[2].derivedRetrace,undefined);
});
test('a set total covers walking legs without a duration',()=>{
 const legs=model.resolveWalkLegs(walkRoute({duration:90}),[known(0),missing(),missing()],commands.routeUnits);
 assert.equal(legs[1].manualMissing,false);assert.equal(legs[1].walkCovered,true);assert.equal(legs[2].walkCovered,true);
});
test('an estimated way out marks the derived return as estimated',()=>{
 const legs=model.resolveWalkLegs(walkRoute(),[known(0),known(600,{estimated:true}),missing()],commands.routeUnits);
 assert.equal(legs[2].estimated,true);
});
test('a finish before the turn is rejected; a plausible overnight walk is allowed',()=>{
 assert.equal(model.walkClockIssue('12:00','14:00','13:00'),'finish');
 assert.equal(model.walkClockIssue('12:00','11:00',''),'turn');
 assert.equal(model.walkClockIssue('23:30','00:10','00:50'),null);
 assert.equal(model.walkClockIssue('22:00','','06:00'),null);
 assert.equal(model.walkClockIssue('06:00','12:00','19:30'),null);
});
test('overlapping activities share a timetable block and none is lost',()=>{
 const minutes=t=>t?Number(t.slice(0,2))*60+Number(t.slice(3)):null;
 const rows=[{name:'בית קפה',start:'10:15',end:'10:45'},{name:'מוזיאון',start:'10:00',end:'12:00'},{name:'ארוחה',start:'13:00',end:''},{name:'ללא שעה',start:'',end:''}];
 const blocks=model.timetableBlocks(rows,minutes);
 assert.equal(blocks.length,2);
 assert.deepEqual(plain(blocks[0].rows.map(r=>r.name)),['מוזיאון','בית קפה']);
 assert.deepEqual([blocks[0].from,blocks[0].to],[20,23]);
 assert.equal(blocks[1].rows[0].name,'ארוחה');
});
test('an activity crossing midnight runs to the end of the timetable',()=>{
 const minutes=t=>t?Number(t.slice(0,2))*60+Number(t.slice(3)):null;
 const [block]=model.timetableBlocks([{name:'ארוחה',start:'23:30',end:'01:00',crossesMidnight:true}],minutes);
 assert.deepEqual([block.from,block.to],[47,47]);
});
test('duplicate ids get new ids and same-day references follow',()=>{
 let n=0;const trip={days:[
  {dayId:'d',stops:[p('a','start'),p('b','end',{leg:{fromId:'a'}})]},
  {dayId:'d',timeAnchor:{stopId:'a'},stops:[p('a','start'),p('b','end',{leg:{fromId:'a'}})]}
 ]};
 assert.equal(model.dedupeIds(trip,()=>'new'+(++n)),true);
 const second=trip.days[1];
 assert.notEqual(second.dayId,'d');assert.notEqual(second.stops[0].id,'a');
 assert.equal(second.stops[1].leg.fromId,second.stops[0].id);assert.equal(second.timeAnchor.stopId,second.stops[0].id);
 assert.equal(trip.days[0].stops[1].leg.fromId,'a');
});
test('a trip without duplicates is left untouched',()=>{
 const trip={days:[{dayId:'d1',stops:[p('a','start'),p('b','end')]}]},before=plain(trip);
 assert.equal(model.dedupeIds(trip,()=>'never'),false);assert.deepEqual(plain(trip),before);
});
test('a route passing a waypoint twice splits at the first pass',()=>{
 const coords=[[0,0],[0,1.0002],[0,2],[0,1.0001],[.5,1],[1,1]];
 const stops=[{lat:0,lng:0},{lat:0,lng:1},{lat:0,lng:2},{lat:1,lng:1}];
 const parts=geometry.splitRoutedLegs(coords,stops,geo.kmBetween);
 assert.equal(parts[0].some(c=>c[1]===2),false);
 assert.equal(parts[1].some(c=>c[1]===2),true);
});
test('an approach to a waypoint does not end the leg early',()=>{
 const coords=[[0,0],[0,.5],[0,.9],[0,1],[0,1.5],[0,2]];
 const parts=geometry.splitRoutedLegs(coords,[{lat:0,lng:0},{lat:0,lng:1},{lat:0,lng:2}],geo.kmBetween);
 assert.deepEqual(plain(parts[0].at(-1)),[0,1]);
});
test('a drawing saved for an earlier order does not widen the zoom',()=>{
 const trip={days:[{stops:[p('a','start',{lat:1,lng:1}),p('b','via',{lat:1.1,lng:1.1,leg:{fromId:'gone',mode:'draw',path:[[40,40]]}}),p('c','end',{lat:1.2,lng:1.2,leg:{fromId:'b',mode:'draw',path:[[1.15,1.15]]}})]}]};
 const positions=plain(queries.focusMapPositions(trip,[0]));
 assert.equal(positions.some(x=>x[0]===40),false);assert.equal(positions.some(x=>x[0]===1.15),true);
});
test('minutes never display as 60',()=>{
 assert.equal(format.minsFmt(119.6),'2 ש׳ 0 ד׳');
 assert.equal(format.minsFmt(59.6),'1 ש׳ 0 ד׳');
 assert.equal(format.minsFmt(45),'45 ד׳');
});
