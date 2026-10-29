'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/src/00f-trip-queries.js'),'utf8');
const Q=vm.runInNewContext(source+'\nTripQueries');
const types=new Set(['poi','note','idea','nature','viewpoint','dining','fuel','other']);
function sample(){
 return {outline:{points:[{id:'macro',lat:5,lng:6},{id:'unset',lat:null,lng:null}]},days:[
  {stops:[{id:'start',type:'start',lat:10,lng:20},{id:'poi',type:'poi',lat:10.1,lng:20},{id:'idea',type:'idea',lat:10.2,lng:20},{id:'finish',type:'end',lat:10.3,lng:20}]},
  {stops:[{id:'s2',type:'start',lat:11,lng:21},{id:'other-idea',type:'idea',lat:12,lng:22},{id:'unlocated',type:'poi',lat:null,lng:null}]}
 ]};
}
const json=value=>JSON.stringify(value);
test('coordinate validity preserves legacy bounds and zero',()=>{
 assert.equal(Q.validPoint({lat:0,lng:0}),true);
 assert.equal(Q.validPoint({lat:'90',lng:'180'}),true);
 assert.equal(Q.validPoint({lat:91,lng:0}),false);
 assert.equal(Q.validPoint({lat:0,lng:null}),false);
 assert.equal(Q.validPoint({lat:'',lng:0}),false);
});
test('route query excludes map-only points without copying stops',()=>{
 const trip=sample(), result=Q.routeStopsForDay(trip,0,types);
 assert.equal(result.length,2);
 assert.equal(result[0],trip.days[0].stops[0]);
 assert.equal(result[1],trip.days[0].stops[3]);
 assert.equal(Q.routeStopsForDay(trip,45,types).length,0);
 assert.equal(Q.isMapOnlyPoint(trip.days[0].stops[1],types),true);
});
test('map view includes only ideas from nonselected days, preserving ordering',()=>{
 const trip=sample();
 assert.equal(json(Q.currentStopsForMap(trip,[0]).map(x=>[x.stop.id,x.di,x.si])),json([['start',0,0],['poi',0,1],['idea',0,2],['finish',0,3],['other-idea',1,1]]));
 assert.equal(json(Q.currentStopsForMap(trip,[0,1]).map(x=>x.stop.id)),json(['start','poi','idea','finish','s2','other-idea','unlocated']));
});
test('focus positions exclude other-day ideas while retaining selected stops and drawn bends',()=>{
 const trip=sample();
 trip.days[0].stops[3].leg={mode:'draw',path:[[10.31,20.02],null,[10.32,20.03]],viaPoints:[[10.35,20.06]]};
 trip.days[1].stops.push({id:'remote',type:'idea',lat:59,lng:-6});
 const original=json(trip);
 assert.equal(json(Q.focusMapPositions(trip,[0])),json([[10,20],[10.1,20],[10.2,20],[10.3,20],[10.31,20.02],[10.32,20.03],[10.35,20.06]]));
 assert.equal(json(Q.focusMapPositions(trip,[1])),json([[11,21],[12,22],[59,-6]]));
 assert.equal(Q.focusMapPositions(trip,[50]).length,0);
 assert.ok(Q.currentStopsForMap(trip,[0]).some(x=>x.stop.id==='remote'));
 assert.equal(json(trip),original);
});
test('POI linkage selects nearest route stop, excluding ideas and invalid coordinates',()=>{
 const trip=sample(),dist=(a,b)=>Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
 const links=Q.poiLinksForDay(trip,0,types,dist);
 assert.equal(links.length,1);
 assert.equal(links[0].point,trip.days[0].stops[1]);
 assert.equal(links[0].nearest,trip.days[0].stops[0]);
 assert.equal(Q.poiLinksForDay(trip,99,types,dist).length,0);
});
test('stop lookup and map extent read from the provided trip only',()=>{
 const trip=sample();
 const stop=Q.getStop(trip,'s2');
 assert.equal(stop.day,1);
 assert.equal(stop.stop,trip.days[1].stops[0]);
 assert.equal(Q.getStop(trip,'missing'),null);
 assert.equal(json(Q.tripMapPositions(trip)),json([[5,6],[10,20],[10.1,20],[10.2,20],[10.3,20],[11,21],[12,22]]));
});
test('missing end and excluded days preserve loop and explicit exclusion rules',()=>{
 const day={stops:[{type:'start'}],excludedUntilEnd:true};
 assert.equal(Q.dayMissingEndpoint(day),true);
 assert.equal(Q.dayExcludedFromTotals(day),true);
 assert.equal(Q.dayMissingEndpoint({...day,loop:true}),false);
 assert.equal(Q.dayExcludedFromTotals({...day,excludedUntilEnd:false}),false);
 assert.equal(Q.dayMissingEndpoint({stops:[]}),false);
});
test('all queries leave supplied trip unchanged',()=>{
 const trip=sample(),before=json(trip);
 Q.routeStopsForDay(trip,0,types);
 Q.currentStopsForMap(trip,[0]);
 Q.focusMapPositions(trip,[0]);
 Q.poiLinksForDay(trip,0,types,()=>1);
 Q.getStop(trip,'start');
 Q.tripMapPositions(trip);
 assert.equal(json(trip),before);
});
