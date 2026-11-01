'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/src/30-map-tools.js'),'utf8');
const start=source.indexOf('const MAP_SAFE_ZOOM='),end=source.indexOf('// The documented Maps URL opens',start);
assert.ok(start>=0&&end>start,'map style implementation not found');
const selectedSource=source.slice(start,end);
function harness(){
 const entries=[],timerJobs=new Map(),form={value:'satellite'},errors=[];
 let timerId=0;
 const map={layers:[],zoom:10,maxZoom:21,hasLayer(layer){return this.layers.includes(layer)},removeLayer(layer){this.layers=this.layers.filter(x=>x!==layer)},setMaxZoom(z){this.maxZoom=z},getZoom(){return this.zoom},setZoom(z){this.zoom=z}};
 const makeLayer=(url,options)=>({
  url,options,opacity:options.opacity??1,events:new Map(),
  on(name,fn){this.events.set(name,[...(this.events.get(name)||[]),fn]);return this},
  emit(name){for(const fn of this.events.get(name)||[])fn()},
  addTo(m){m.layers.push(this);entries.push(this);return this},
  setOpacity(o){this.opacity=o;return this}
 });
 const env={
  map,tiles:null,labelsTile:null,roadsTile:null,tileErrorCount:0,
  mapPrefs:{enabledMaps:['satellite','satellite-labels','osm','hiking','cyclosm','topo-r']},
  state:{settings:{mapStyle:'satellite'}},
  L:{tileLayer:makeLayer},
  normalizeMapStyle:style=>env.mapPrefs.enabledMaps.includes(style)?style:'satellite',
  $:()=>form,save:()=>{env.saves=(env.saves||0)+1},syncMapBaseSwitch:()=>{},
  toast:s=>errors.push(s),
  setTimeout:(fn)=>{const id=++timerId;timerJobs.set(id,fn);return id},
  clearTimeout:id=>timerJobs.delete(id)
 };
 vm.runInNewContext(selectedSource+'\nthis.__transitionInfo=()=>({style:visibleBasemapStyle,transition:basemapTransition});',env);
 return {env,map,entries,form,errors,flush(){const jobs=[...timerJobs.entries()];for(const [id,fn] of jobs){if(timerJobs.has(id)){timerJobs.delete(id);fn()}}},pendingTimers:()=>timerJobs.size};
}
test('map change preserves outgoing tiles until the incoming basemap has finished loading',()=>{
 const h=harness(),{env,map}=h;
 env.setMapStyle('satellite');const old=env.tiles;
 env.setMapStyle('topo-r');const next=map.layers.at(-1);
 assert.equal(env.tiles,old);
 assert.equal(next.opacity,0);
 assert.ok(map.hasLayer(old));
 assert.ok(map.hasLayer(next));
 next.emit('tileload');next.emit('load');
 assert.equal(env.tiles,next);assert.equal(next.opacity,1);
 assert.ok(map.hasLayer(old),'outgoing tiles should stay during the fade');
 h.flush();assert.ok(!map.hasLayer(old));assert.equal(map.layers.length,1);
 assert.equal(env.state.settings.mapStyle,'topo-r');
});
test('rapid successive changes discard the pending layer rather than blanking the original',()=>{
 const h=harness(),{env,map}=h;
 env.setMapStyle('satellite');const old=env.tiles;
 env.setMapStyle('topo-r');const interrupted=map.layers.at(-1);
 env.setMapStyle('osm');
 assert.ok(!map.hasLayer(interrupted));
 assert.ok(map.hasLayer(old));
 assert.equal(env.tiles,old);
 assert.equal(map.layers.length,2);
 env.setMapStyle('satellite');
 assert.equal(map.layers.length,1);
 assert.equal(env.state.settings.mapStyle,'satellite');
 assert.equal(env.tiles,old);
 interrupted.emit('tileload');interrupted.emit('load');
 assert.equal(env.tiles,old,'stale load event cannot replace the current layer');
});
test('an unavailable map leaves the old image and reverts the current map selection',()=>{
 const h=harness(),{env,map}=h;
 env.setMapStyle('satellite');const old=env.tiles;
 env.setMapStyle('topo-r');const next=map.layers.at(-1);
 next.emit('tileerror');next.emit('load');
 assert.equal(env.tiles,old);assert.deepEqual(map.layers,[old]);
 assert.equal(env.state.settings.mapStyle,'satellite');
 assert.ok(h.errors.some(x=>x.includes('לא נטענה')));
});
test('old aerial labels stay visible until the incoming new map is ready',()=>{
 const h=harness(),{env,map}=h;
 env.setMapStyle('satellite-labels');
 const old=env.tiles,roads=env.roadsTile,labels=env.labelsTile;
 assert.equal(map.layers.length,3);
 env.setMapStyle('hiking');const next=map.layers.at(-1);
 assert.ok(map.hasLayer(roads)&&map.hasLayer(labels));assert.equal(next.opacity,0);
 next.emit('tileload');next.emit('load');
 assert.equal(roads.opacity,0);assert.equal(labels.opacity,0);
 h.flush();
 assert.ok(!map.hasLayer(old)&&!map.hasLayer(roads)&&!map.hasLayer(labels));
 assert.deepEqual(map.layers,[next]);
});
