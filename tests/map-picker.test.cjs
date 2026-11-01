'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('index.html'),script=read('scripts/src/52-drawer-navigation.js');
test('map picker is a distinct on-map control with accessible popup',()=>{
 assert.match(html,/id="map-picker-toggle"[^>]*aria-controls="map-picker-menu"/);
 assert.match(html,/id="map-picker-menu"[^>]*role="menu"/);
 assert.equal((html.match(/data-map-base=/g)||[]).length,2);
});
test('all six maps are grouped and independent of the customizable quick switch',()=>{
 const initial=read('scripts/src/00-initial-state.js');
 const groups=initial.slice(initial.indexOf('const MAP_STYLE_GROUPS='),initial.indexOf('const AVAILABLE_MAP_STYLES='));
 const members=[...groups.matchAll(/styles:\[([^\]]+)\]/g)].map(m=>[...m[1].matchAll(/'([^']+)'/g)].map(x=>x[1]));
 assert.deepEqual(members.map(a=>a.length),[2,2,2]);
 assert.equal(new Set(members.flat()).size,6);
 assert.ok(script.includes('const MAP_PICKER_STYLES=MAP_STYLE_GROUPS.flatMap(group=>group.styles)'));
 assert.match(script,/MAP_STYLE_GROUPS\.map\(group=>/);
 assert.match(script,/function renderBank\(\)/);
 assert.match(script,/setMapStyle\(choice\)/);
 assert.match(script,/wrapper\.dataset\.activeSlot=slot/);
 assert.match(script,/mapMenu\.hidden=false/);
 assert.match(script,/if\(!e\.target\.closest\('#map-quick-views'\)\)/);
});
