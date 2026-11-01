'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const text=fs.readFileSync(path.join(__dirname,'../scripts/src/50-point-editing.js'),'utf8');
const start=text.indexOf('function focusStop(id){'),end=text.indexOf('// Drawer history retains',start);
assert.ok(start>=0&&end>start,'focusStop source exists');
function create(inside=true,zoom=13){
 const calls=[],stop={id:'via',type:'via',lat:46.04,lng:7.80};
 const map={getZoom:()=>zoom,getBounds:()=>({isValid:()=>true,pad:()=>({contains:()=>inside})}),
  panTo:(point,opt)=>calls.push(['pan',point,opt]),flyTo:(point,z,opt)=>calls.push(['fly',point,z,opt])};
 const env={map,L:{latLng:(lat,lng)=>({lat,lng})},selectedDay:0,viewScope:'day',selectedStop:null,
  getStop:id=>id==='via'?{day:0,stop}:null,hidePointQuick:()=>{},closeLegEditor:()=>{},hideContext:()=>{},
  $:()=>({value:'day'}),renderAll:()=>calls.push(['renderAll']),
  renderMarkers:()=>calls.push(['markers']),syncMarkerDragState:()=>calls.push(['markerState']),renderSchedule:()=>calls.push(['schedule']),
  showMap:()=>calls.push(['showMap']),markerLayer:{eachLayer:()=>{}},
  window:{innerWidth:1200,matchMedia:()=>({matches:true}),setTimeout:()=>{}}
 };
 vm.runInNewContext(text.slice(start,end),env);
 return {env,calls};
}
test('visible stop remains in place; map and timeline selections are synchronized',()=>{
 const h=create(true,14);h.env.focusStop('via');
 assert.equal(h.env.selectedStop,'via');
 assert.deepEqual(h.calls.map(c=>c[0]),['markerState','schedule']);
});
test('offscreen stop pans at the existing zoom instead of unnecessarily zooming',()=>{
 const h=create(false,13);h.env.focusStop('via');
 assert.equal(h.calls.some(c=>c[0]==='pan'),true);
 assert.equal(h.calls.some(c=>c[0]==='fly'),false);
});
test('distant stop at low zoom improves detail only once',()=>{
 const h=create(false,6);h.env.focusStop('via');
 const fly=h.calls.find(c=>c[0]==='fly');assert.ok(fly);assert.equal(fly[2],10);
});
