'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const source=read('scripts/src/00-initial-state.js');
const start=source.indexOf('const RONNY_SECONDARY_ICON_CHOICES='),end=source.indexOf('function endpointChoiceAllowed(',start);
assert.ok(start>=0&&end>start,'secondary helper declarations are present');
const code=source.slice(start,end);
const api=vm.runInNewContext(code+'\n({ronnySecondaryIconKey,ronnySecondaryIconLabel,ronnySecondaryIconMarkerMarkup,ronnySecondaryIconPickerMarkup})',{
 esc:s=>String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;'),
 icon:()=>'<svg class="small-icon"></svg>',
 ronnyPointSymbol:(type,stop)=>'<svg data-icon="'+(stop?.iconId||type)+'"></svg>'
});
test('context icon is optional and only supported for via and parking',()=>{
 assert.equal(api.ronnySecondaryIconKey({type:'via',secondaryIconId:'ferry'}),'ferry');
 assert.equal(api.ronnySecondaryIconKey({type:'parking',secondaryIconId:'viewpoint'}),'viewpoint');
 assert.equal(api.ronnySecondaryIconKey({type:'via',secondaryIconId:'unknown'}),null);
 assert.equal(api.ronnySecondaryIconKey({type:'end',secondaryIconId:'ferry'}),null);
 assert.equal(api.ronnySecondaryIconMarkerMarkup({type:'via'}),'');
 assert.match(api.ronnySecondaryIconMarkerMarkup({type:'parking',secondaryIconId:'dining'}),/ronny-secondary-context-icon/);
 assert.equal(api.ronnySecondaryIconMarkerMarkup({type:'end',secondaryIconId:'ferry'}),'');
});
test('picker exposes none, ferry and viewpoint without changing the main icon selector',()=>{
 const ui=api.ronnySecondaryIconPickerMarkup({type:'via',secondaryIconId:'ferry'});
 assert.match(ui,/data-ronny-secondary-icon=""/);
 assert.match(ui,/data-ronny-secondary-icon="ferry" aria-pressed="true"/);
 assert.match(ui,/data-ronny-secondary-icon="viewpoint"/);
 assert.equal(api.ronnySecondaryIconPickerMarkup({type:'start'}),'');
 assert.match(read('scripts/src/50-point-editing.js'),/ronnyIconPickerMarkup\(s\)/);
 assert.match(read('scripts/src/50-point-editing.js'),/data-ronny-secondary-icon/);
});
test('one real route marker carries a passive extra symbol and retains drag plumbing',()=>{
 const marker=read('scripts/src/30-map-tools.js'),styles=read('styles/app.css');
 assert.match(marker,/html:ronnySecondaryIconMarkerMarkup\(s\)\+html\+timeInfo/);
 assert.match(marker,/draggable:canDrag/);
 assert.match(marker,/ronnyStopId:s\.id/);
 assert.match(styles,/\.ronny-secondary-context-icon[\s\S]*?pointer-events:none/);
 assert.match(read('scripts/src/00-initial-state.js'),/function ronnyPointSymbol\(/);
});
