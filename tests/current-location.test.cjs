'use strict';
// Patch 141: current location button. Runs the module against a fake map and geolocation.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../scripts/src/32-current-location.js'),'utf8');

function create({secure=true,geolocation=true,zoom=8,inside=true}={}){
 const calls=[],toasts=[],handlers={},watch={};
 const layer=()=>{const o={added:[],addTo(){return o},clearLayers(){o.added.length=0;calls.push(['clear'])}};return o};
 const shape=kind=>opts=>({kind,opts,addTo(g){g.added.push(this);return this},setLatLng(p){calls.push([kind+'-move',p])},setRadius(r){calls.push([kind+'-radius',r])},getBounds:()=>'ring-bounds'});
 const map={
  zoom,getZoom(){return this.zoom},getBounds:()=>({pad:()=>({contains:()=>inside})}),
  on:(name,fn)=>{handlers[name]=fn},
  setView:(p,z)=>{calls.push(['setView',p,z]);handlers.movestart?.()},
  flyTo:(p,z)=>{calls.push(['flyTo',p,z]);handlers.movestart?.()},
  flyToBounds:b=>{calls.push(['flyToBounds',b]);handlers.movestart?.()},
  panTo:p=>{calls.push(['panTo',p]);handlers.movestart?.()}
 };
 const button={dataset:{},attrs:{},type:'',id:'',innerHTML:'',title:'',setAttribute(k,v){this.attrs[k]=v}};
 const L={
  latLng:(lat,lng)=>({lat,lng}),layerGroup:layer,circle:(p,o)=>shape('ring')(o),marker:(p,o)=>shape('dot')(o),divIcon:o=>o,
  DomUtil:{create:tag=>tag==='button'?button:{}},
  DomEvent:{disableClickPropagation(){},disableScrollPropagation(){},preventDefault(){},on:(el,name,fn)=>{button.click=fn}},
  Control:{extend:def=>function(){this.addTo=()=>{def.onAdd()}}}
 };
 const geo={watchPosition:(ok,fail,opts)=>{Object.assign(watch,{ok,fail,opts});calls.push(['watch']);return 7},clearWatch:id=>calls.push(['clearWatch',id])};
 const clock={t:1000};
 const env={map,L,Date:{now:()=>clock.t},Object,Math,Number,String,
  window:{isSecureContext:secure},navigator:geolocation?{geolocation:geo}:{},
  toast:m=>toasts.push(m),refreshIcons:()=>{}};
 vm.runInNewContext(source,env);
 env.ronnyLocateInit();
 const fix=(lat,lng,accuracy)=>watch.ok({coords:{latitude:lat,longitude:lng,accuracy}});
 return {env,map,clock,calls,toasts,handlers,watch,button,fix,state:()=>button.dataset.state,names:()=>calls.map(c=>c[0])};
}

test('the button starts off and asks for a precise, continuous position',()=>{
 const h=create();
 assert.equal(h.state(),'off');
 assert.equal(h.button.id,'map-locate');
 h.button.click({});
 assert.equal(h.state(),'searching');
 assert.equal(h.button.attrs['aria-pressed'],'true');
 assert.equal(h.watch.opts.enableHighAccuracy,true);
});

test('first fix draws the dot and centres on it without turning following off',()=>{
 const h=create({zoom:8});
 h.button.click({});h.fix(32.1,34.8,20);
 assert.equal(h.state(),'follow');
 const fly=h.calls.find(c=>c[0]==='flyTo');
 assert.deepEqual(fly[1],{lat:32.1,lng:34.8});
 assert.equal(fly[2],16);
 assert.equal(h.toasts.length,0);
});

test('a small zoom change uses setView and never zooms out a precise fix',()=>{
 const h=create({zoom:17});
 h.button.click({});h.fix(32.1,34.8,20);
 const view=h.calls.find(c=>c[0]==='setView');
 assert.equal(view[2],17);
});

test('a rough fix fits its accuracy circle and says it is approximate',()=>{
 const h=create();
 h.button.click({});h.fix(32.1,34.8,4000);
 assert.ok(h.names().includes('flyToBounds'));
 assert.match(h.toasts[0],/משוער/);
});

test('later fixes move the dot and pan only when it nears the edge',()=>{
 const inside=create({inside:true});
 inside.button.click({});inside.fix(32.1,34.8,20);inside.fix(32.2,34.9,15);
 assert.ok(inside.names().includes('dot-move'));
 assert.ok(!inside.names().includes('panTo'));
 const edge=create({inside:false});
 edge.button.click({});edge.fix(32.1,34.8,20);edge.fix(32.2,34.9,15);
 assert.ok(edge.names().includes('panTo'));
 assert.equal(edge.state(),'follow');
});

test('moving the map stops following; the next tap returns to the position',()=>{
 const h=create();
 h.button.click({});h.fix(32.1,34.8,20);
 h.clock.t+=5000;
 h.handlers.movestart();
 assert.equal(h.state(),'free');
 h.fix(32.3,34.9,20);
 assert.ok(!h.names().includes('panTo'),'no automatic pan while the user looks elsewhere');
 h.button.click({});
 assert.equal(h.state(),'follow');
 assert.ok(h.calls.filter(c=>c[0]==='flyTo'||c[0]==='setView').length>=2);
});

test('a drag during the locate animation still stops following',()=>{
 const h=create();
 h.button.click({});h.fix(32.1,34.8,20);
 h.handlers.dragstart();
 assert.equal(h.state(),'free');
});

test('tapping while following stops the GPS and removes the dot',()=>{
 const h=create();
 h.button.click({});h.fix(32.1,34.8,20);
 h.button.click({});
 assert.equal(h.state(),'off');
 assert.ok(h.names().includes('clearWatch'));
 assert.ok(h.names().includes('clear'));
 // Turning it on again starts from scratch: a new search, not the old position.
 h.button.click({});
 assert.equal(h.state(),'searching');
});

test('denied permission stops and explains how to allow it',()=>{
 const h=create();
 h.button.click({});h.watch.fail({code:1});
 assert.equal(h.state(),'off');
 assert.match(h.toasts[0],/הרשאה/);
});

test('a timeout after a fix keeps the last position on the map',()=>{
 const h=create();
 h.button.click({});h.fix(32.1,34.8,20);h.watch.fail({code:3});
 assert.equal(h.state(),'follow');
 assert.equal(h.toasts.length,0);
});

test('without https or geolocation nothing is requested and the reason is shown',()=>{
 const insecure=create({secure:false});
 insecure.button.click({});
 assert.equal(insecure.state(),'off');
 assert.ok(!insecure.names().includes('watch'));
 assert.match(insecure.toasts[0],/https/);
 const none=create({geolocation:false});
 none.button.click({});
 assert.equal(none.state(),'off');
 assert.match(none.toasts[0],/לא תומך/);
});

test('zoom level follows accuracy',()=>{
 const {env}=create();
 assert.equal(env.ronnyLocateZoom(10,5),16);
 assert.equal(env.ronnyLocateZoom(150,5),15);
 assert.equal(env.ronnyLocateZoom(800,5),14);
 assert.equal(env.ronnyLocateZoom(3000,18),12);
 assert.equal(env.ronnyLocateZoom(30,18),18);
});
