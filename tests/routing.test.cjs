'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,'../scripts/src',name+'.js'),'utf8');
const routeGeometry=vm.runInNewContext(read('00h-route-geometry')+'\nRouteGeometry');
const routingService=vm.runInNewContext(read('00i-routing-service')+'\nRoutingService');
const json=x=>JSON.stringify(x);
test('manual and pencil geometry honor distinct endpoint rules',()=>{
 const points=[{lat:0,lng:0},{lat:1,lng:1}];
 for(const [mode,path,expected] of [
  ['pencil',[[0.2,0.3]],[[0,0],[0.2,0.3]]],
  ['draw',[[0.2,0.3]],[[0,0],[0.2,0.3],[1,1]]],
  ['straight',[[0.2,0.3]],[[0,0],[1,1]]],
  ['auto',[],[[0,0],[1,1]]]
 ]){
  assert.equal(json(routeGeometry.legCoords(1,points,()=>({mode,path}))),json(expected));
 }
});
test('split routed path keeps ordered waypoints and shared boundaries',()=>{
 const coords=[[0,0],[0.5,0],[1,0],[2,0],[3,0]];
 const waypoints=[{lat:0,lng:0},{lat:1,lng:0},{lat:3,lng:0}];
 const km=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 const result=routeGeometry.splitRoutedLegs(coords,waypoints,km);
 assert.equal(result.length,2);
 assert.equal(json(result[0]),json([[0,0],[0.5,0],[1,0]]));
 assert.equal(json(result[1]),json([[1,0],[2,0],[3,0]]));
 assert.equal(routeGeometry.splitRoutedLegs([],waypoints,km).length,0);
});
test('nearest segment works for bends and zero-length sections',()=>{
 assert.equal(routeGeometry.segmentOfPathNearest([[0,0],[0,1],[1,1]],{lat:0.8,lng:1}),1);
 assert.equal(routeGeometry.segmentOfPathNearest([[0,0],[0,1],[1,1]],{lat:0,lng:0.5}),0);
 assert.equal(routeGeometry.segmentOfPathNearest([[0,0],[0,0],[1,1]],{lat:0.8,lng:0.8}),1);
});
test('manual leg uses caller-provided timing, not a guessed travel time',()=>{
 const a=[{lat:0,lng:0},{lat:1,lng:1}];
 const deps={legAt:()=>({mode:'pencil',minutes:null}),legCoords:()=>[[0,0],[1,1]],routeLegMinutes:()=>null,distanceOfCoords:()=>2500};
 assert.equal(json(routeGeometry.manualLeg(1,a,deps)),json({duration:0,distance:2500,mode:'pencil',baseDuration:null,manualMissing:true}));
 deps.legAt=()=>({mode:'draw',minutes:30});deps.routeLegMinutes=()=>30;
 assert.equal(routeGeometry.manualLeg(1,a,deps).duration,1800);
 assert.equal(routeGeometry.manualLeg(1,a,deps).manualMissing,false);
});
test('distance ruler adds all consecutive line segments',()=>{
 const points=[[0,0],[3,4],[6,8]];
 assert.equal(routeGeometry.ronnyMeasureMeters(points,(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])),10);
 assert.equal(routeGeometry.ronnyMeasureMeters([],()=>999),0);
});
test('routing services preserve profile endpoint, geometry request and AbortSignal',async()=>{
 for(const [profile,expected] of [
 ['driving','router.project-osrm.org/route/v1/driving/'],
 ['walking','routing.openstreetmap.de/routed-foot/route/v1/driving/'],
 ['hiking','routing.openstreetmap.de/routed-foot/route/v1/driving/'],
 ['cycling','routing.openstreetmap.de/routed-bike/route/v1/driving/']
 ]){
  let recorded;
  const signal={id:'abort-marker'};
  const fetchMock=async(url,options)=>{
   recorded={url,options};return {ok:true,json:async()=>({code:'Ok',routes:[{distance:700,duration:200,legs:[{duration:200}],geometry:{coordinates:[[34,32],[35,33]]}}]})}
  };
  const r=await routingService.requestRoute([{lat:32,lng:34},{lat:33,lng:35}],profile,signal,fetchMock);
  assert.ok(recorded.url.includes(expected));
  assert.ok(recorded.url.includes('34.000000,32.000000;35.000000,33.000000?overview=full&geometries=geojson&steps=false'));
  assert.equal(recorded.options.signal,signal);
  assert.equal(r.distance,700);
  assert.equal(r.source,'OSRM / OpenStreetMap');
 }
});
test('routing errors remain visible and cannot return a fake route',async()=>{
 const pts=[{lat:0,lng:0},{lat:1,lng:1}];
 await assert.rejects(routingService.requestRoute(pts,'driving',null,async()=>({ok:false,status:503})),/HTTP 503/);
 await assert.rejects(routingService.requestRoute(pts,'driving',null,async()=>({ok:true,json:async()=>({code:'Ok',routes:[]})})),/אין מסלול/);
 await assert.rejects(routingService.requestRoute(pts,'driving',null,async()=>({ok:true,json:async()=>({code:'InvalidQuery',message:'bad route'})})),/bad route/);
 const abort=new Error('Aborted');abort.name='AbortError';
 await assert.rejects(routingService.requestRoute(pts,'driving',null,async()=>{throw abort}),e=>e===abort);
});
