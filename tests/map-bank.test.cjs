'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const initial=read('scripts/src/00-initial-state.js'),map=read('scripts/src/30-map-tools.js'),drawer=read('scripts/src/52-drawer-navigation.js'),events=read('scripts/src/66-event-bindings.js');
test('all nine basemaps are sorted into topo, satellite, and road families',()=>{
 const groups=initial.slice(initial.indexOf('const MAP_STYLE_GROUPS='),initial.indexOf('const AVAILABLE_MAP_STYLES='));
 const keys=[...groups.matchAll(/styles:\[([^\]]+)\]/g)].map(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
 assert.deepEqual(keys,[
 ['topo','topo-r','esri-topo','hiking'],
 ['satellite','satellite-labels'],
 ['osm','streets','cyclosm']
 ]);
 assert.equal(new Set(keys.flat()).size,9);
 assert.ok(initial.includes('MAP_STYLE_GROUPS.flatMap(group=>group.styles)'));
 assert.ok(initial.includes('for(const key of AVAILABLE_MAP_STYLES)if(!order.includes(key))order.push(key)'));
});
test('quick maps migrate previous settings safely and are stored separately',()=>{
 assert.ok(initial.includes("const DEFAULT_QUICK_MAPS=['satellite','topo']"));
 assert.ok(initial.includes('rawQuick[0]!==rawQuick[1]'));
 assert.ok(initial.includes('quickMaps,defaultStyle'));
 assert.ok(drawer.includes('quickMaps:quickDraft.slice()'));
 assert.ok(drawer.includes('function assignQuickMap(style,slot)'));
 assert.ok(drawer.includes('if(other>=0&&other!==slot)quickDraft[other]=quickDraft[slot]'));
});
test('tile providers remain keyless and style changes remain explicit',()=>{
 for(const host of ['tile.openstreetmap.org','tile.openmaps.fr/openhikingmap','tile.openmaps.fr/opentopomap','tile-cyclosm.openstreetmap.fr/cyclosm'])assert.ok(map.includes(host),host);
 assert.ok(map.includes('https://openmaps.fr/donate'));
 assert.ok(!map.includes('setMapStyle(fallback,true)'));
});
test('bank keeps all maps while quick switch stays two configurable buttons',()=>{
 const html=read('index.html');
 assert.equal((html.match(/data-map-base=/g)||[]).length,2);
 assert.ok(drawer.includes('data-map-choose='));
 assert.ok(drawer.includes('MAP_STYLE_GROUPS.map(group=>'));
 assert.ok(drawer.includes('MAP_STYLE_GROUPS.flatMap(group=>group.styles)'));
 assert.ok(drawer.includes('setMapStyle(choice)'));
 assert.ok(drawer.includes('wrapper.dataset.activeSlot='));
 assert.ok(drawer.includes('quickDraft.map((style,i)'));
 assert.ok(drawer.includes('e.dataTransfer.getData'));
 for(const s of ['osm','hiking','cyclosm','topo-r'])assert.ok(events.includes("style==='"+s+"'"),s);
});
