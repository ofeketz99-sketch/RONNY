'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),script=read('scripts/src/52-drawer-navigation.js');
test('map picker is a distinct on-map control with an accessible popup',()=>{
 assert.match(html,/id="map-picker-toggle"[^>]*aria-controls="map-picker-menu"/);
 assert.match(html,/id="map-picker-menu"[^>]*role="menu"/);
 assert.equal((html.match(/data-map-base=/g)||[]).length,2);
});
test('seven supplemental maps, quick toggle and settings bank stay independent',()=>{
 const start=script.indexOf('const MAP_PICKER_STYLES='),end=script.indexOf(';',start);assert.ok(start>=0);
 const names=[...script.slice(start,end).matchAll(/'([^']+)'/g)].map(x=>x[1]);
 assert.equal(names.length,7);
 assert.ok(!names.includes('satellite')&&!names.includes('topo'));
 assert.match(script,/function renderBank\(\)/);assert.match(script,/AVAILABLE_MAP_STYLES\.map\(/);
 assert.match(script,/setMapStyle\(choice\)/);
 assert.match(script,/mapMenu\.hidden=false/);
 assert.match(script,/if\(!e\.target\.closest\('#map-quick-views'\)\)/);
});
