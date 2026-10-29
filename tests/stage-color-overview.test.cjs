'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('scripts/src/10-days-groups.js'),a=source.indexOf('function ronnyGroupForDay('),b=source.indexOf('function ronnyGroupCaption()',a);
assert.ok(a>=0&&b>a,'stage view helpers exist');
const html=read('index.html'),css=read('styles/app.css'),map=read('scripts/src/30-map-tools.js'),mapView=read('scripts/src/40-outline-mode.js');
function harness(){
 const state={days:[{dayId:'d1'},{dayId:'d2'},{dayId:'d3'}],settings:{dayGroups:[{id:'g1',name:'מקטע דרום',fromDayId:'d1',toDayId:'d2',color:'#72947b'},{id:'g2',name:'מקטע צפון',fromDayId:'d3',toDayId:'d3',color:'#bd977a'}]}};
 const el={hidden:true,style:{setProperty(k,v){this[k]=v}},innerHTML:''};
 const ctx={state,ronnyActiveDayGroupId:'g1',viewScope:'all',planningResolution:'day',
  ronnyDayGroups:()=>state.settings.dayGroups,
  ronnyGroupDays:g=>{const i=state.days.findIndex(d=>d.dayId===g.fromDayId),j=state.days.findIndex(d=>d.dayId===g.toDayId);return state.days.map((_,k)=>k).filter(k=>k>=Math.min(i,j)&&k<=Math.max(i,j))},
  validDayColor:x=>/^#[0-9a-f]{6}$/i.test(x),esc:x=>String(x),
  $:()=>el};
 vm.createContext(ctx);vm.runInContext(source.slice(a,b),ctx);
 return {ctx,el};
}
test('each day inherits its stage identity without overriding day colors',()=>{
 const {ctx}=harness();
 assert.equal(ctx.ronnyGroupColorForDay(0),'#72947b');
 assert.equal(ctx.ronnyGroupColorForDay(1),'#72947b');
 assert.equal(ctx.ronnyGroupColorForDay(2),'#bd977a');
 assert.match(source,/ronny-in-stage/);
 assert.match(css,/ronny-day-card\.ronny-in-stage::before/);
 assert.match(css,/background:var\(--stage-color\)/);
});
test('stage summary counts days and marks incomplete route distance accurately',()=>{
 const {ctx,el}=harness();
 assert.equal(ctx.ronnyStageOverviewMode(),true);
 ctx.ronnyRefreshStageSummary(92000,1);
 assert.equal(el.hidden,false);
 assert.match(el.innerHTML,/מקטע דרום/);
 assert.match(el.innerHTML,/2 ימים/);
 assert.match(el.innerHTML,/לפחות 92 ק״מ · חלקי/);
 ctx.ronnyRefreshStageSummary(120000,0);
 assert.match(el.innerHTML,/120 ק״מ/);
 assert.doesNotMatch(el.innerHTML,/חלקי/);
 ctx.viewScope='day';ctx.ronnyRefreshStageSummary();
 assert.equal(el.hidden,true);
});
test('overview suppresses point overlays and only shows daily starts, preserving regular day mode',()=>{
 assert.match(map,/stageOverview&&\(s\.type!=='start'\|\|!stageDays\.has\(di\)\)/);
 assert.match(map,/ronnyGroupColorForDay\(di\)/);
 assert.match(map,/if\(!stageOverview\)drawRouteAnnotations/);
 assert.match(map,/if\(!stageOverview\)L\.polyline\(visual,\{color:'#fff8ec'/);
 assert.match(mapView,/if\(ronnyStageOverviewMode\(\)\)/);
 assert.match(mapView,/poiLinkLayer\?\.clearLayers\(\);photoLayer\?\.clearLayers\(\)/);
 assert.match(html,/id="ronny-stage-summary"/);
 assert.match(mapView,/renderOutlineStageGuide\(\);renderMarkers\(\);drawRoute\(\);renderPoiLinks\(\);renderPhotos\(\)/);
});
