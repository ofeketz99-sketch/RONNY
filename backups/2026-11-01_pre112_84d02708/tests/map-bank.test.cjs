'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const initial=read('scripts/src/00-initial-state.js'),map=read('scripts/src/30-map-tools.js'),drawer=read('scripts/src/52-drawer-navigation.js'),events=read('scripts/src/66-event-bindings.js');
test('all nine basemaps are included for existing and new map bank users',()=>{
 const catalog=initial.slice(initial.indexOf('const AVAILABLE_MAP_STYLES='),initial.indexOf('const MAP_LABELS='));
 for(const key of ['satellite','topo','satellite-labels','streets','esri-topo','osm','hiking','cyclosm','topo-r'])assert.ok(catalog.includes("'"+key+"'"),key);
 assert.ok(initial.includes('for(const key of AVAILABLE_MAP_STYLES)if(!order.includes(key))order.push(key)'));
});
test('new tile services use keyless URLs and attribution, with no silent fallback',()=>{
 for(const host of ['tile.openstreetmap.org','tile.openmaps.fr/openhikingmap','tile.openmaps.fr/opentopomap','tile-cyclosm.openstreetmap.fr/cyclosm'])assert.ok(map.includes(host),host);
 assert.ok(map.includes('https://openmaps.fr/donate'));
 assert.ok(!map.includes('setMapStyle(fallback,true)'));
});
test('map bank active choice differs from default, quick switch stays two original maps',()=>{
 const html=read('index.html');assert.equal((html.match(/data-map-base=/g)||[]).length,2);
 assert.ok(drawer.includes('data-map-choose='));assert.ok(drawer.includes('selectedStyle=btn.dataset.mapChoose'));
 assert.ok(drawer.includes('setMapStyle(selectedStyle,false)'));
 assert.ok(drawer.includes("state.settings.mapStyle==='satellite'?'satellite':'other'"));
 for(const s of ['osm','hiking','cyclosm','topo-r'])assert.ok(events.includes("style==='"+s+"'"),s);
});
