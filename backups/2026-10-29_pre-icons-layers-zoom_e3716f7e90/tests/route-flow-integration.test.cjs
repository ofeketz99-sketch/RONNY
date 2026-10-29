'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=n=>fs.readFileSync(path.join(__dirname,'../scripts/src',n+'.js'),'utf8');
const G=vm.runInNewContext(src('00h-route-geometry')+'\nRouteGeometry');
const P=vm.runInNewContext(src('00j-route-plan')+'\nRoutePlan');
const S=vm.runInNewContext(src('00i-routing-service')+'\nRoutingService');
const slice=(text,a,b)=>text.slice(text.indexOf(a),text.indexOf(b,text.indexOf(a)+a.length));
const point=(id,type,lat,lng)=>({id,type,lat,lng,time:'09:00',duration:0});
const same=(a,b)=>assert.equal(JSON.stringify(a),JSON.stringify(b));
function setup(){
 let count=0;
 const legAt=(i,arr)=>{const l=arr[i]?.leg;return l?.fromId===arr[i-1]?.id?l:{mode:'auto',path:[],viaPoints:[],minutes:null}};
 const legCoords=(i,arr)=>G.legCoords(i,arr,legAt);
 const sync=vm.runInNewContext(slice(src('00-initial-state'),'function syncWalkingLoops(','function syncLoopDay(')+'\nsyncWalkingLoops',{
  uid:()=>String(++count),isMapOnlyPoint:p=>['poi','note','idea','nature','viewpoint','dining','fuel','other'].includes(p.type),
  legAt,routedLegVisualCache:new Map(),routedShapeKey:(_,i,p)=>i+'-'+p,legCoords
 });
 const km=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])*111000;
 const profile=(i,arr)=>{let hike=false;for(let k=0;k<i;k++){if(arr[k].type==='walkStart')hike=true;if(arr[k].type==='walkEnd')hike=false}return legAt(i,arr).profile||(hike?'hiking':'driving')};
 const manualLeg=(i,arr)=>G.manualLeg(i,arr,{legAt,legCoords,routeLegMinutes:l=>l.minutes??null,distanceOfCoords:pts=>pts.slice(1).reduce((d,p,k)=>d+km(pts[k],p),0)});
 return {sync,legCoords,plan:arr=>P.build(arr,{legAt,effectiveLegProfile:profile,kmBetween:km,manualLeg})};
}
function day(retrace=false){
 return {stops:[point('parking','start',32,34),{...point('walk','walkStart',32.01,34.01),duration:120,walkRetrace:retrace},
 {...point('turn','walkTurn',32.03,34.04),leg:{fromId:'walk',mode:'draw',path:[[32.02,34.03]],minutes:60}},
 point('hotel','end',32.05,34.08)]};
}
test('day remains ordered when walking loop is inserted',()=>{
 const {sync,plan}=setup(),d=day();assert.equal(sync(d),true);
 same(d.stops.map(s=>s.type),['start','walkStart','walkTurn','walkEnd','end']);
 same([d.stops[3].lat,d.stops[3].lng],[d.stops[1].lat,d.stops[1].lng]);
 const p=plan(d.stops);assert.equal(p.results[0].mode,'access-link');
 assert.equal(p.results[1].mode,'draw');
 same(p.groups.map(g=>g.profile),['hiking','driving']);
 assert.equal(sync(d),false);
});
test('return along the same path remains inside the walking loop',()=>{
 const {sync,plan,legCoords}=setup(),d=day(true);sync(d);
 same(d.stops[3].leg.path,[[32.02,34.03]]);
 same(legCoords(3,d.stops),[[32.03,34.04],[32.02,34.03],[32.01,34.01]]);
 const p=plan(d.stops);assert.equal(p.results[2].mode,'draw');
 same(p.groups.map(g=>g.profile),['driving']);
});
test('saved trip round trip does not duplicate or move the walking finish',()=>{
 const {sync,plan}=setup(),d=day(true);sync(d);
 const copy=JSON.parse(JSON.stringify(d)),before=JSON.stringify(copy);
 assert.equal(sync(copy),false);assert.equal(JSON.stringify(copy),before);
 assert.equal(copy.stops[4].id,'hotel');assert.equal(plan(copy.stops).results.length,4);
});
test('mock routing excludes access leg and preserves service errors',async()=>{
 const {sync,plan}=setup(),d=day();sync(d);
 const p=plan(d.stops),requests=[];
 for(const group of p.groups){
  const result=await S.requestRoute(group.stops,group.profile,null,async(url)=>{
   requests.push(url);return {ok:true,json:async()=>({code:'Ok',routes:[{distance:100,duration:60,legs:group.stops.slice(1).map(()=>({distance:100,duration:60})),geometry:{coordinates:[]}}]})};
  });assert.equal(result.legs.length,group.stops.length-1);
 }
 assert.equal(requests.length,2);assert.match(requests[0],/routed-foot/);assert.match(requests[1],/router.project-osrm.org/);
 await assert.rejects(S.requestRoute(p.groups[0].stops,'hiking',null,async()=>({ok:false,status:503})),/HTTP 503/);
});
test('walking timetable shifts the next drive but preserves the start',()=>{
 const time=src('24-timeline-scheduling');
 const timeline=vm.runInNewContext(slice(time,'function ronnyFutureWalkingClock(','function applyItineraryTimes(')+'\nronnyApplyWalkingTimeline',{
  clockMinutes:s=>{const [h,m]=s.split(':').map(Number);return h*60+m}
 });
 const {sync}=setup(),d=day();sync(d);
 const absolute=[540,600,620,650,680];timeline(d.stops,absolute,0);
 same(absolute,[540,600,660,720,750]);
});
