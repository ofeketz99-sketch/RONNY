'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const src=fs.readFileSync(path.join(__dirname,'../scripts/src/10-days-groups.js'),'utf8');
const from=src.indexOf('function ronnySetGroupView(id){'),end=src.indexOf('function currentStopsForMap()',from);
assert.ok(from>=0&&end>from);
function harness(){
 const counts={fit:0,render:0,scrolls:[],selectDay:0};
 const state={days:[{dayId:'d1'},{dayId:'d2'},{dayId:'d3'},{dayId:'d4'}],settings:{dayGroups:[{id:'g1',fromDayId:'d1',toDayId:'d2'},{id:'g2',fromDayId:'d3',toDayId:'d4'}]}};
 const ctx={state,wholeTripFocusSeq:0,ronnyActiveDayGroupId:null,planningResolution:'day',viewScope:'day',selectedDay:0,selectedStop:'x',
  ronnyDayGroups:()=>state.settings.dayGroups,
  ronnyGroupDays:g=>{const a=state.days.findIndex(d=>d.dayId===g.fromDayId),b=state.days.findIndex(d=>d.dayId===g.toDayId);return state.days.map((_,i)=>i).filter(i=>i>=Math.min(a,b)&&i<=Math.max(a,b))},
  $:name=>name==='map-scope'?{value:'day'}:name==='days'?{querySelector:query=>({scrollIntoView:opts=>counts.scrolls.push({query,...opts})})}:null,
  requestAnimationFrame:fn=>fn(),setPlanningResolution:()=>{},closeLegEditor:()=>{},hidePointQuick:()=>{},renderAll:()=>{counts.render++},fitMap:()=>{counts.fit++},selectDay:()=>{counts.selectDay++}};
 vm.createContext(ctx);vm.runInContext(src.slice(from,end),ctx);
 return {ctx,counts};
}
test('stage 2 focuses its first day without switching to single-day map',()=>{
 const {ctx,counts}=harness();ctx.ronnySetGroupView('g2');
 assert.equal(ctx.selectedDay,2);assert.equal(ctx.viewScope,'all');assert.equal(ctx.ronnyActiveDayGroupId,'g2');
 assert.equal(counts.fit,1);assert.equal(counts.render,1);assert.equal(counts.selectDay,0);
 assert.equal(counts.scrolls.length,1);assert.equal(counts.scrolls[0].query,'[data-day="2"]');
 assert.equal(counts.scrolls[0].inline,'start');
});
test('whole trip does not reset the selected day',()=>{
 const {ctx,counts}=harness();ctx.selectedDay=3;ctx.ronnySetGroupView(null);
 assert.equal(ctx.selectedDay,3);assert.equal(ctx.viewScope,'all');assert.equal(counts.fit,1);assert.equal(counts.scrolls.length,0);
});
test('fast group changes keep the last selected stage',()=>{
 const {ctx}=harness();ctx.ronnySetGroupView('g1');ctx.ronnySetGroupView('g2');
 assert.equal(ctx.selectedDay,2);assert.equal(ctx.ronnyActiveDayGroupId,'g2');
});
