'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const initial=read('scripts/src/00-initial-state.js'),map=read('scripts/src/30-map-tools.js'),drawer=read('scripts/src/52-drawer-navigation.js'),events=read('scripts/src/66-event-bindings.js');
test('six permitted basemaps are sorted into three map categories',()=>{
 const groups=initial.slice(initial.indexOf('const MAP_STYLE_GROUPS='),initial.indexOf('const AVAILABLE_MAP_STYLES='));
 const keys=[...groups.matchAll(/styles:\[([^\]]+)\]/g)].map(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
 assert.deepEqual(keys,[['topo-r','hiking'],['satellite','satellite-labels'],['osm','cyclosm']]);
 assert.equal(new Set(keys.flat()).size,6);
 for(const removed of ['topo','esri-topo','streets'])assert.ok(!keys.flat().includes(removed));
 assert.ok(initial.includes('MAP_STYLE_GROUPS.flatMap(group=>group.styles)'));
 assert.ok(initial.includes('for(const key of AVAILABLE_MAP_STYLES)if(!order.includes(key))order.push(key)'));
});
test('previous map selections migrate safely without losing valid quick maps',()=>{
 assert.ok(initial.includes("const DEFAULT_QUICK_MAPS=['satellite','topo-r']"));
 assert.ok(initial.includes("const LEGACY_MAP_STYLES={topo:'topo-r','esri-topo':'topo-r',streets:'osm'}"));
 assert.ok(initial.includes('migratedQuick[0]!==migratedQuick[1]'));
 assert.ok(initial.includes('quickMaps,defaultStyle'));
 assert.ok(initial.includes('normalizeMapStyle(cleaned.settings.mapStyle)'));
 assert.ok(drawer.includes('quickMaps:quickDraft.slice()'));
 assert.ok(drawer.includes('function assignQuickMap(style,slot)'));
});
test('remaining tile providers keep attribution, removed tile services are gone',()=>{
 for(const host of ['tile.openstreetmap.org','tile.openmaps.fr/openhikingmap','tile.openmaps.fr/opentopomap','tile-cyclosm.openstreetmap.fr/cyclosm'])assert.ok(map.includes(host),host);
 for(const disabled of ['World_Street_Map','World_Topo_Map','{s}.tile.opentopomap.org'])assert.ok(!map.includes(disabled),disabled);
 assert.ok(map.includes('https://openmaps.fr/donate'));
 assert.ok(!map.includes('setMapStyle(fallback,true)'));
 assert.ok(!events.includes("style==='topo'"));
 assert.ok(!events.includes("style==='esri-topo'"));
});
test('bank and picker show six maps; fast toggle still has two assignable controls',()=>{
 const html=read('index.html');
 assert.equal((html.match(/data-map-base=/g)||[]).length,2);
 assert.ok(!html.includes('<option value="topo">'));
 assert.ok(!html.includes('<option value="streets">'));
 assert.ok(!html.includes('<option value="esri-topo">'));
 assert.ok(drawer.includes('data-map-choose='));
 assert.ok(drawer.includes('MAP_STYLE_GROUPS.map(group=>'));
 assert.ok(drawer.includes('setMapStyle(choice)'));
 assert.ok(drawer.includes('wrapper.dataset.activeSlot='));
 assert.ok(drawer.includes('quickDraft.map((style,i)'));
 assert.ok(drawer.includes('e.dataTransfer.getData'));
});
