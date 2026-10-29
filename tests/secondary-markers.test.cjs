'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read('scripts/src/00-initial-state.js');
const from=src.indexOf('const RONNY_ICON_BANK='),to=src.indexOf('function endpointChoiceAllowed(',from);
assert.ok(from>=0&&to>from);
const context={
 types:{via:{icon:'circle-dot'},parking:{icon:'square-parking'},viewpoint:{icon:'camera'},walkStart:{icon:'footprints'},nature:{icon:'tree-pine'},dining:{icon:'utensils'}},
 RONNY_EXTRA_ICONS:{glencairn:{src:'glencairn.svg'},picnic:{path:'<path/>'},ferry:{path:'<path/>'},cablecar:{path:'<path/>'}},
 WALK_TYPES:new Set(['walkStart','walkEnd','walkTurn']),
 validPoint:p=>Number.isFinite(Number(p?.lat))&&Number.isFinite(Number(p?.lng)),
 pointSymbol:t=>'<svg data-default="'+t+'"></svg>',
 icon:()=>'<svg></svg>',
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;')
};
const api=vm.runInNewContext(src.slice(from,to)+'\n({RONNY_ICON_BANK,ronnyIconPickerMarkup,ronnyPointSymbol,ronnyLinkedWalkParkingIds,ronnySecondaryIconKey,ronnySecondaryIconLabel,ronnySecondaryIconMarkerMarkup,ronnySecondaryIconPickerMarkup})',context);
const route=()=>[
 {id:'parking',type:'parking',lat:32,lng:34},
 {id:'photo',type:'viewpoint',lat:32,lng:34},
 {id:'walk',type:'walkStart',lat:32.01,lng:34.02}
];
test('primary and secondary share exactly eight selectable icons',()=>{
 assert.deepEqual(Array.from(api.RONNY_ICON_BANK,x=>x.id),['glencairn','nature','viewpoint','picnic','ferry','dining','cablecar','walkStart']);
 for(const key of ['glencairn','nature','viewpoint','picnic','ferry','dining','cablecar','walkStart']){
  assert.match(api.ronnyIconPickerMarkup({type:'parking'}),new RegExp('data-ronny-icon="'+key+'"'));
  assert.match(api.ronnySecondaryIconPickerMarkup({type:'via'}),new RegExp('data-ronny-secondary-icon="'+key+'"'));
 }
 assert.doesNotMatch(api.ronnyIconPickerMarkup({type:'parking'}),/data-ronny-icon="fuel"/);
 assert.doesNotMatch(api.ronnySecondaryIconPickerMarkup({type:'parking'}),/data-ronny-secondary-icon="fuel"/);
});
test('via keeps main icon and has only secondary selector',()=>{
 assert.equal(api.ronnyIconPickerMarkup({type:'via',iconId:'ferry'}),'');
 assert.equal(api.ronnyPointSymbol('via',{iconId:'ferry'}),'<svg data-default="via"></svg>');
 assert.match(api.ronnySecondaryIconPickerMarkup({type:'via'}),/data-ronny-secondary-icon="ferry"/);
 assert.doesNotMatch(api.ronnySecondaryIconPickerMarkup({type:'via'}),/data-ronny-secondary-auto/);
});
test('photography replaces viewpoint label/icon but preserves type ID',()=>{
 assert.match(src,/viewpoint:\{name:'צילום',icon:'camera'/);
 assert.equal(api.ronnyPointSymbol('viewpoint',{type:'viewpoint'}),'<svg data-default="viewpoint"></svg>');
 assert.match(api.ronnyIconPickerMarkup({type:'parking'}),/data-ronny-icon="viewpoint"/);
});
test('automatic walking badge follows the exact previous nonwalking stop',()=>{
 const parking={id:'parking',type:'parking',lat:32,lng:34};
 const routeStops=route();
 let linked=api.ronnyLinkedWalkParkingIds(routeStops);
 assert.equal(linked.has('parking'),false,'a viewpoint breaks chronological parking link');
 routeStops.splice(1,1);
 linked=api.ronnyLinkedWalkParkingIds(routeStops);
 assert.equal(linked.has('parking'),true);
 assert.equal(api.ronnySecondaryIconKey(parking,linked.has('parking')),'walkStart');
 assert.match(api.ronnySecondaryIconLabel(parking,true),/אוטומטי/);
 assert.match(api.ronnySecondaryIconMarkerMarkup(parking,true),/ronny-secondary-context-icon/);
 assert.match(api.ronnySecondaryIconPickerMarkup(parking,true),/data-ronny-secondary-auto/);
 assert.equal(api.ronnySecondaryIconKey(parking,false),null,'badge disappears when disconnected');
 const moved=[{id:'parking',type:'parking',lat:32,lng:34},{id:'other',type:'via',lat:32.1,lng:34.1},{id:'walk',type:'walkStart',lat:32.2,lng:34.2}];
 assert.equal(api.ronnyLinkedWalkParkingIds(moved).has('parking'),false);
});
test('manual choice wins; explicit none hides auto; restoring auto enables it again',()=>{
 const p={id:'p',type:'parking',secondaryIconId:'ferry'};
 assert.equal(api.ronnySecondaryIconKey(p,true),'ferry');
 p.secondaryIconId='';
 assert.equal(api.ronnySecondaryIconKey(p,true),null);
 delete p.secondaryIconId;
 assert.equal(api.ronnySecondaryIconKey(p,true),'walkStart');
 assert.equal(api.ronnySecondaryIconKey({type:'via',secondaryIconId:'walkStart'},false),'walkStart');
 assert.equal(api.ronnySecondaryIconKey({type:'end',secondaryIconId:'walkStart'},true),null);
});
test('map uses same link cache and still creates a draggable main marker',()=>{
 const map=read('scripts/src/30-map-tools.js');
 assert.match(map,/linkedWalkParkingByDay\.set\(di,ronnyLinkedWalkParkingIds\(route\)\)/);
 assert.match(map,/ronnySecondaryIconMarkerMarkup\(s,linkedWalkParkingByDay\.get\(di\)\?\.has\(s\.id\)===true\)/);
 assert.match(map,/draggable:canDrag/);
 assert.match(read('scripts/src/50-point-editing.js'),/setSecondaryIcon/);
 assert.match(read('styles/app.css'),/\.ronny-secondary-context-icon[\s\S]*?pointer-events:none/);
});
