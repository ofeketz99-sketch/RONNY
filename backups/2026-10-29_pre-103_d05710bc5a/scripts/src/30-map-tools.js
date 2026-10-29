function ronnyMeasureMeters(points=ronnyMeasure.points){return RouteGeometry.ronnyMeasureMeters(points,kmBetween)}
function ronnyMeasureFormat(m){
 return m>=1000?(m/1000).toLocaleString('he-IL',{maximumFractionDigits:2,minimumFractionDigits:2})+' ק״מ':Math.round(m).toLocaleString('he-IL')+' מ׳';
}
function ronnyMeasureDraw(){
 if(!map||!ronnyMeasureLayer)return;
 ronnyMeasureLayer.clearLayers();
 const pts=ronnyMeasure.points;
 if(pts.length>1){
  L.polyline(pts,{color:'#fffdf6',weight:9,opacity:.92,interactive:false,lineJoin:'round',lineCap:'round'}).addTo(ronnyMeasureLayer);
  L.polyline(pts,{color:'#527e65',weight:4.5,opacity:1,interactive:false,lineJoin:'round',lineCap:'round'}).addTo(ronnyMeasureLayer);
 }
 if(pts.length){
  L.circleMarker(pts[0],{radius:5,color:'#fffdf6',weight:2,fillColor:'#547d64',fillOpacity:1,interactive:false}).addTo(ronnyMeasureLayer);
  L.circleMarker(pts[pts.length-1],{radius:5.5,color:'#fffdf6',weight:2,fillColor:'#527e65',fillOpacity:1,interactive:false}).addTo(ronnyMeasureLayer);
  const label=L.divIcon({className:'ronny-measure-tip-host',html:`<div class="ronny-measure-tip">${ronnyMeasureFormat(ronnyMeasureMeters())}</div>`,iconSize:[0,0],iconAnchor:[0,0]});
  L.marker(pts[pts.length-1],{icon:label,keyboard:false,interactive:false,zIndexOffset:5000}).addTo(ronnyMeasureLayer);
 }
 if(ronnyMeasure.active&&pts.length&&ronnyMeasure.hover&&!ronnyMeasure.dragging){
  L.polyline([pts[pts.length-1],ronnyMeasure.hover],{color:'#759a81',weight:2,opacity:.63,dashArray:'5 7',interactive:false}).addTo(ronnyMeasureLayer);
 }
 const total=ronnyMeasureMeters();
 const value=$('ronny-measure-value');if(value)value.textContent=ronnyMeasureFormat(total);
 const message=$('ronny-measure-detail');
 if(message)message.textContent=pts.length?`${pts.length} נקודות שרטוט · ${ronnyMeasureFormat(total)} · גלגלת העכבר משנה זום. סיום משאיר את הקו על המפה.`:'לחץ במפה להוספת נקודות, או לחץ וגרור לשרטוט חופשי. המדידה גאוגרפית לאורך הקו, לא לפי רשת הכבישים.';
 const undo=$('ronny-measure-undo'),clear=$('ronny-measure-clear');
 if(undo)undo.disabled=!ronnyMeasure.undoLengths.length;
 if(clear)clear.disabled=!pts.length;
}
function ronnyMeasureAppend(latlng,dragging=false){
 const p=[+latlng.lat,+latlng.lng];
 const prev=ronnyMeasure.points.at(-1);
 if(prev){
  if(dragging&&map.latLngToContainerPoint(prev).distanceTo(map.latLngToContainerPoint(p))<7)return;
  if(kmBetween(prev,p)<.15)return;
 }
 if(ronnyMeasure.points.length>=1400)return;
 ronnyMeasure.points.push(p);ronnyMeasure.hover=null;
 ronnyMeasureDraw();
}
function ronnyMeasureDeactivate(){
 if(!ronnyMeasure.active)return;
 ronnyMeasure.active=false;ronnyMeasure.dragging=false;ronnyMeasure.pointerId=null;ronnyMeasure.hover=null;
 if(map){if(ronnyMeasure.prevDragEnabled)map.dragging.enable();if(ronnyMeasure.prevDblClickEnabled)map.doubleClickZoom.enable();map.getContainer().classList.remove('ronny-measuring')}
 const button=$('map-distance-measure');if(button){button.setAttribute('aria-pressed','false');button.title='מדידת אורך קו על המפה'}
 const panel=$('ronny-measure-panel');if(panel)panel.hidden=true;
 ronnyMeasureDraw();updateMapHint();
}
function ronnyMeasureToggle(){
 if(ronnyMeasure.active){ronnyMeasureDeactivate();return}
 if(!map){toast('המפה עדיין לא נטענה');return}
 if(googleMode){toast('עבור לתצוגת המפה הרגילה כדי למדוד');return}
 if(savedPinPlacementId||outlineMoveModeId||newTripSetupDraft||forcedRelocateSession||pointMoveModeId||drawLegSession||forcedPointSession||homePickMode||photoPlacement){toast('סיים תחילה את הפעולה הפעילה במפה');return}
 ronnyMeasure.active=true;ronnyMeasure.hover=null;ronnyMeasure.prevDragEnabled=map.dragging.enabled();ronnyMeasure.prevDblClickEnabled=map.doubleClickZoom.enabled();map.dragging.disable();map.doubleClickZoom.disable();map.getContainer().classList.add('ronny-measuring');
 // Close the tools flyout immediately: its outside-click guard would eat the first map measurement.
 const pane=document.querySelector('.map-pane');
 if(pane?.classList.contains('map-tools-expanded')){
  pane.classList.remove('map-tools-expanded');
  $('map-tools-toggle')?.setAttribute('aria-expanded','false');
 }
 if(routeEdit){routeEdit=false;$('route-edit-toggle')?.setAttribute('aria-pressed','false');renderViaHandles()}
 if(quickStreetMode){quickStreetMode=false;$('street-link-mode')?.setAttribute('aria-pressed','false')}
 hideContext();hidePointQuick();closeLegEditor();
 const button=$('map-distance-measure');if(button){button.setAttribute('aria-pressed','true');button.title='סיים מדידה'}
 const panel=$('ronny-measure-panel');if(panel)panel.hidden=false;
 ronnyMeasureDraw();updateMapHint();
}
function ronnyMeasurePointerAllowed(e){
 if(!ronnyMeasure.active||e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return false;
 const blocked=e.target.closest?.('.leaflet-control,button,input,textarea,select,a,.ronny-measure-panel,.map-group-toggle,.map-tools-side,.map-context,.map-search');
 return !blocked;
}
function ronnyMeasureBindMapPointer(){
 if(!map)return;
 const container=map.getContainer();
 container.addEventListener('pointerdown',e=>{
  if(!ronnyMeasurePointerAllowed(e))return;
  e.preventDefault();e.stopPropagation();
  ronnyMeasure.pointerId=e.pointerId;ronnyMeasure.dragging=true;ronnyMeasure.hover=null;
  ronnyMeasure.undoLengths.push(ronnyMeasure.points.length);
  ronnyMeasureAppend(map.mouseEventToLatLng(e));
 },true);
 window.addEventListener('pointermove',e=>{
  if(!ronnyMeasure.active||!ronnyMeasure.dragging||ronnyMeasure.pointerId!==e.pointerId)return;
  const bounds=container.getBoundingClientRect();
  if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)return;
  e.preventDefault();e.stopPropagation();
  ronnyMeasureAppend(map.mouseEventToLatLng(e),true);
 },true);
 const release=e=>{
  if(!ronnyMeasure.active||!ronnyMeasure.dragging||ronnyMeasure.pointerId!==e.pointerId)return;
  ronnyMeasure.dragging=false;ronnyMeasure.pointerId=null;ronnyMeasure.hover=null;
  ronnyMeasureDraw();e.preventDefault();e.stopPropagation();
 };
 window.addEventListener('pointerup',release,true);
 window.addEventListener('pointercancel',release,true);
 map.on('mousemove',e=>{if(!ronnyMeasure.active||ronnyMeasure.dragging||!ronnyMeasure.points.length)return;ronnyMeasure.hover=[e.latlng.lat,e.latlng.lng];ronnyMeasureDraw()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ronnyMeasure.active){e.preventDefault();e.stopPropagation();ronnyMeasureDeactivate()}},true);
}
function ronnyMeasureBindControls(){
 $('map-distance-measure')?.addEventListener('click',ronnyMeasureToggle);
 $('ronny-measure-end')?.addEventListener('click',ronnyMeasureDeactivate);
 $('ronny-measure-undo')?.addEventListener('click',()=>{
  const previous=ronnyMeasure.undoLengths.pop();if(previous===undefined)return;
  ronnyMeasure.points.length=previous;ronnyMeasure.hover=null;ronnyMeasureDraw();
 });
 $('ronny-measure-clear')?.addEventListener('click',()=>{
  ronnyMeasure.points.length=0;ronnyMeasure.undoLengths.length=0;ronnyMeasure.hover=null;ronnyMeasureDraw();
 });
}
function initMap(){if(!window.L){$('map').innerHTML='<div style="padding:90px 30px;text-align:center;direction:rtl">לא ניתן לטעון את רכיב המפה. בדוק חיבור אינטרנט ופתח מחדש.</div>';toast('ספריית המפה לא נטענה');return}map=L.map('map',{zoomControl:false,worldCopyJump:true,preferCanvas:true}).setView([mapPrefs.home.lat,mapPrefs.home.lng],mapPrefs.home.zoom);L.control.zoom({position:'topright'}).addTo(map);markerLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup().addTo(map);poiLinkLayer=L.layerGroup().addTo(map);map.createPane('ronnyPoiLinks');map.getPane('ronnyPoiLinks').style.zIndex='420';map.getPane('ronnyPoiLinks').style.pointerEvents='none';map.createPane('ronnyRouteLabels');map.getPane('ronnyRouteLabels').style.zIndex='490';map.getPane('ronnyRouteLabels').style.pointerEvents='none';legTextSvgRenderer=L.svg({pane:'ronnyRouteLabels',padding:1});legLabelLayer=L.layerGroup().addTo(map);photoLayer=L.layerGroup().addTo(map);viaLayer=L.layerGroup().addTo(map);forcedHandleLayer=L.layerGroup().addTo(map);outlineLayer=L.layerGroup().addTo(map);savedPlaceLayer=L.layerGroup().addTo(map);savedPlacePreviewLayer=L.layerGroup().addTo(map);ronnyMeasureLayer=L.layerGroup().addTo(map);setMapStyle(state.settings.mapStyle||'streets',false);map.on('click',e=>{if(ronnyMeasure.active||savedPreviewMode)return;if(Date.now()-ronnyMarkerDraggedAt<450)return;if(savedPinPlacementId){const p=savedPlaces.places.find(x=>x.id===savedPinPlacementId);savedPinPlacementId=null;if(p){p.lat=+e.latlng.lat.toFixed(6);p.lng=+e.latlng.lng.toFixed(6);p.positionSource='user-map';persistSavedPlaces();renderSavedPlaceMarkers();showSavedPlaceLibrary();toast('מיקום המקום נקבע ונשמר');}return;}if(outlineMoveModeId&&planningResolution!=='day'){const id=outlineMoveModeId;outlineMoveModeId=null;const p=currentOutline().points.find(x=>x.id===id);if(p){const old={...p};p.lat=+e.latlng.lat.toFixed(6);p.lng=+e.latlng.lng.toFixed(6);syncOutlineAnchors(id,old);save();renderAll();updateMapHint();toast('מיקום היעד עודכן')}return;}if(planningResolution!=='day'&&!newTripSetupDraft&&!forcedRelocateSession&&!pointMoveModeId&&!drawLegSession&&!forcedPointSession&&!homePickMode&&!photoPlacement&&!quickStreetMode){if($('map-context')?.classList.contains('open')){hideContext();return}addOutlinePoint(e.latlng);return;}if(newTripSetupDraft){const draft={...newTripSetupDraft,lat:+e.latlng.lat.toFixed(6),lng:+e.latlng.lng.toFixed(6),zoom:map.getZoom()};newTripSetupDraft=null;updateMapHint();createTrip(draft);return}if(forcedRelocateSession){relocateForcedWaypoint(e.latlng);return}if(pointMoveModeId){relocatePoint(pointMoveModeId,e.latlng);return}if(drawLegSession){addDrawVertex(e.latlng.lat,e.latlng.lng);return}if(forcedPointSession){addForcedPoint(e.latlng);return}if($('leg-editor')?.classList.contains('open')){closeLegEditor();return}if($('point-quick')?.classList.contains('open')){hidePointQuick();return}if(homePickMode){homePickMode=false;mapPrefs.home={lat:+e.latlng.lat.toFixed(6),lng:+e.latlng.lng.toFixed(6),zoom:map.getZoom()};saveMapPrefs();updateMapHint();toast('נקודת הפתיחה נשמרה. בפעם הבאה האתר ייפתח כאן.');return}if($('map-context').classList.contains('open')){hideContext();return}if(photoPlacement){photoPlacement={lat:e.latlng.lat,lng:e.latlng.lng};$('photo-file').click();return}if(quickStreetMode){openGoogleStreetView(e.latlng.lat,e.latlng.lng);return}currentContext={lat:e.latlng.lat,lng:e.latlng.lng};showContext(e.containerPoint.x,e.containerPoint.y)});map.getContainer().addEventListener('click',e=>{if(!savedPreviewMode||e.target.closest?.('.leaflet-control'))return;e.stopPropagation();e.preventDefault()},true);
 map.on('movestart',hideContext);map.on('moveend zoomend resize',queueLegTextRefresh);ronnyMeasureBindMapPointer();setTimeout(()=>map.invalidateSize(),250)}
const MAP_SAFE_ZOOM={streets:17,topo:16,'esri-topo':16,satellite:17,'satellite-labels':17};
function setMapStyle(style,persist=true){
 if(!map)return;
 style=mapPrefs.enabledMaps.includes(style)?style:mapPrefs.defaultStyle;
 const services={
  streets:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',maxZoom:17,attrib:'Tiles © Esri and contributors'},
  topo:{url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxZoom:16,attrib:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://opentopomap.org/">OpenTopoMap</a>'},
  'esri-topo':{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',maxZoom:16,attrib:'Tiles © Esri and contributors'},
  satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxZoom:17,attrib:'Tiles © Esri, Vantor and contributors'},
  'satellite-labels':{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxZoom:17,attrib:'Tiles © Esri, Vantor and contributors'}
 };
 if(tiles){map.removeLayer(tiles);tiles=null}
 if(labelsTile){map.removeLayer(labelsTile);labelsTile=null}
  if(roadsTile){map.removeLayer(roadsTile);roadsTile=null}
 const config=services[style];
 // All zoom interactions, including wheel, pinch, +/- and flyTo, respect the active layer.
 // Avoid requesting tiles at optimistic vendor levels with "Map data not yet available" placeholders.
 map.setMaxZoom(config.maxZoom);
 if(map.getZoom()>config.maxZoom)map.setZoom(config.maxZoom,{animate:false});
 const layer=L.tileLayer(config.url,{attribution:config.attrib,maxZoom:config.maxZoom,maxNativeZoom:config.maxZoom,subdomains:style==='topo'?'abc':''});
 tileErrorCount=0;
 layer.on('tileerror',()=>{
  if(layer!==tiles)return;
  tileErrorCount++;
  if(tileErrorCount===5){
   const fallback=style==='streets'||style==='topo'?'esri-topo':'streets';
   // Only one alternate provider attempt. Avoid endless fallback loops on full network outages.
   if(!window._roamFallbackAttempted){
    window._roamFallbackAttempted=true;
    toast('מפת הרקע לא נטענה. מנסה שכבה חלופית. בדוק גם את החיבור לאינטרנט.');
    setMapStyle(fallback,true);
   }else toast('מפות הרקע אינן זמינות. ודא חיבור אינטרנט ואפשר גישה לשירותי Esri.');
  }
 });
 layer.on('tileload',()=>{if(layer===tiles)window._roamFallbackAttempted=false});
 tiles=layer.addTo(map);tiles.bringToBack();
  if(style==='satellite-labels'){
   // An understated hybrid view: aerial imagery with translucent road geometry,
   // plus place/site labels. Keep both overlays beneath all RONNY markers.
   roadsTile=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',{attribution:'Roads © Esri and contributors',maxZoom:17,zIndex:8,opacity:.43}).addTo(map);
   labelsTile=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{attribution:'Labels © Esri and contributors',maxZoom:17,zIndex:9,opacity:.84}).addTo(map);
  }
 $('map-style').value=style;
 state.settings.mapStyle=style;
 syncMapBaseSwitch();
 if(persist)save();
}
// The documented Maps URL opens a map viewport, not a Street View panorama.
// Street View coverage is not supported as a link-controlled Google Maps layer.
function googleMapsCurrentViewUrl(){
 if(!map)return null;
 const center=map.getCenter(),zoom=Math.min(21,Math.max(0,Math.round(map.getZoom())));
 if(!Number.isFinite(center.lat)||!Number.isFinite(center.lng)||!Number.isFinite(zoom))return null;
 const coordinates=encodeURIComponent(center.lat.toFixed(6)+','+center.lng.toFixed(6));
 const basemap=state.settings.mapStyle==='topo'?'terrain':'satellite';
 return 'https://www.google.com/maps/@?api=1&map_action=map&center='+coordinates+'&zoom='+zoom+'&basemap='+basemap;
}
function bindGoogleMapsCurrentView(){
 const link=$('map-google-view');if(!link)return;
 link.onclick=e=>{
  const url=googleMapsCurrentViewUrl();
  if(!url){e.preventDefault();toast('המפה עדיין לא זמינה');return}
  link.href=url;
  toast('כדי להציג קווי Street View כחולים בגוגל: שכבות ← Street View');
 };
}
const VIA_COLORS=['#7ea89a','#7d98c8','#c88d84','#9988c9','#caa061','#6fa8a9','#c27e9d','#a4b56d','#b98962','#889f7f','#6ea3c0','#c08fb6','#bca36b','#73a18e','#c47973','#878dbe'];
function autoViaColor(day,id){
 const ordinal=viaOrdinal(day,id)-1;
 if(ordinal<0)return VIA_COLORS[0];
 if(ordinal<VIA_COLORS.length)return VIA_COLORS[ordinal];
 const hue=(157+(ordinal-VIA_COLORS.length)*137.508)%360;
 return `hsl(${hue.toFixed(1)} 28% 66%)`;
}
function validCustomColor(value){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)}
// A waypoint's auto color belongs to its identity, not to its order number.
// Assign once (also migrates pre-v12 saved trips) and persist with the trip.
function ronnyColorRGB(color){
 const h=String(color||'').trim();if(!/^#[a-f\d]{6}$/i.test(h))return null;
 return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
}
function ronnyColorDistance(a,b){
 const x=ronnyColorRGB(a),y=ronnyColorRGB(b);
 if(!x||!y)return String(a||'').toLowerCase()===String(b||'').toLowerCase()?0:300;
 // Approximate visual-distance metric rather than exact-hex equality alone.
 return Math.sqrt(.30*(x[0]-y[0])**2+.59*(x[1]-y[1])**2+.11*(x[2]-y[2])**2);
}
function ronnyTooClose(a,b){return !!a&&!!b&&ronnyColorDistance(a,b)<56}
function ronnyChooseDistinctColor(preferred,neighbors,palette,seed=0){
 const around=neighbors.filter(Boolean),choices=[...palette];
 for(let i=0;i<42;i++)choices.push(hslToHex((seed*47+i*137.508+151)%360,28+(i%3)*4,65+(i%4)*2));
 let best=choices[0],bestScore=-Infinity;
 for(const c of choices){
  const score=around.length?Math.min(...around.map(n=>ronnyColorDistance(c,n))):150;
  const proximity=ronnyColorDistance(c,preferred);
  const objective=score>49?1000-proximity*.06:score;
  if(objective>bestScore){best=c;bestScore=objective}
  if(score>72&&(!preferred||proximity<56))return c;
 }
 return best;
}
let ronnyPreferredColorEntity=null;
function reconcileNeighborColors(items,baseColor,palette,seed=0,autoField='autoColor'){
 if(!Array.isArray(items)||items.length<2)return false;
 let changed=false;
 for(let pass=0;pass<3;pass++){
  let problems=0;
  for(let i=1;i<items.length;i++){
   const prev=items[i-1],curr=items[i];
   const left=baseColor(prev,i-1),right=baseColor(curr,i);
   if(!ronnyTooClose(left,right))continue;
   problems++;
   // Explicit day color choices have priority; auto colors are changed around them.
   const prevLocked=!!(prev.dayId&&prev.manualDayColor),currLocked=!!(curr.dayId&&curr.manualDayColor);
   if(prevLocked&&currLocked)continue;
   const prevManual=validCustomColor(prev.color),currentManual=validCustomColor(curr.color);
   const changePrevious=currLocked&&!prevLocked?true:prevLocked&&!currLocked?false:(curr.id&&curr.id===ronnyPreferredColorEntity)?true:currentManual&&!prevManual;
   const index=changePrevious?i-1:i,item=items[index],old=baseColor(item,index);
   const neighbors=[index?baseColor(items[index-1],index-1):'',index+1<items.length?baseColor(items[index+1],index+1):''];
   const replacement=ronnyChooseDistinctColor(old,neighbors,palette,seed+index);
   if(validCustomColor(item.color))item.color=replacement;
   else item[autoField]=replacement;
   changed=true;
  }
  if(!problems)break;
 }
 return changed;
}
function ensureStableViaColors(){
 if(!Array.isArray(state?.days))return;
 // Day colors may have become adjacent after a day reorder or duplication.
 reconcileNeighborColors(state.days,(day,i)=>validDayColor(day.color)?day.color:DAY_ACCENTS[i%DAY_ACCENTS.length],DAY_ACCENTS,17,'color');
 state.days.forEach((day,di)=>{
  const ordered=Array.isArray(day.stops)?day.stops:[];
  // Avoid reshuffling previously saved colors on every render. Add colors only when needed.
  const baseColor=(stop)=>{
   if(validCustomColor(stop.color))return stop.color;
   if(validCustomColor(stop.autoColor))return stop.autoColor;
   if(stop.type==='via')return autoViaColor(di,stop.id);
   return types[stop.type]?.color||'#668b74';
  };
  reconcileNeighborColors(ordered,baseColor,VIA_COLORS,di*41);
 });
}

function hslToHex(h,s,l){
 s/=100;l/=100;
 const k=n=>(n+h/30)%12;
 const a=s*Math.min(l,1-l);
 const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
 return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
}
function hexToHsl(color){
 const rgb=ronnyColorRGB(color);if(!rgb)return null;
 let [r,g,b]=rgb.map(v=>v/255);
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=0,s=0,l=(max+min)/2;
 if(d){
  s=d/(1-Math.abs(2*l-1));
  switch(max){
   case r:h=60*(((g-b)/d)%6);break;
   case g:h=60*(((b-r)/d)+2);break;
   default:h=60*(((r-g)/d)+4);break;
  }
 }
 if(h<0)h+=360;
 return {h,s:s*100,l:l*100};
}
function routeDisplayColor(base,variant=0){
 const hsl=hexToHsl(base);
 if(!hsl)return '#5d7f72';
 const sat=Math.min(66,Math.max(42,hsl.s+12));
 const light=Math.max(42,Math.min(54,hsl.l-10));
 const hue=(hsl.h+(variant%2?3:-3)+360)%360;
 return hslToHex(hue,sat,light);
}
function pointColor(s,day){
 if(s.type==='idea')return '#b78a08';
 if(validCustomColor(s.color))return s.color;
 if(validCustomColor(s.autoColor))return s.autoColor;
 if(s.type==='via')return autoViaColor(day,s.id);
 return types[s.type]?.color||'#668b74';
}
// The first click selects the marker. The next pointer-down can drag it directly.
// Avoid re-creating Leaflet markers between selection and the beginning of a drag.
function syncMarkerDragState(){
 if(!markerLayer)return;
 const popup=$('point-quick');
 const selectedId=popup?.classList.contains('open')?popup.dataset.id:null;
 markerLayer.eachLayer?.(m=>{
  if(!m.dragging||!m.options?.ronnyStopId)return;
  const selected=selectedId===m.options.ronnyStopId;
  // Direct repositioning is the default. Disable dragging only while another
  // map gesture (drawing, measuring, choosing a location) owns pointer input.
  const canDrag=!ronnyMeasure.active&&!drawLegSession&&!forcedPointSession&&!forcedRelocateSession&&!outlineMoveModeId&&!newTripSetupDraft&&(!pointMoveModeId||pointMoveModeId===m.options.ronnyStopId);
  if(canDrag&&!m.dragging.enabled())m.dragging.enable();
  else if(!canDrag&&m.dragging.enabled())m.dragging.disable();
  const marker=m.getElement?.()?.querySelector('.point-pin');
  marker?.classList.toggle('drag-marker',canDrag);
  marker?.classList.toggle('active',selected||selectedStop===m.options.ronnyStopId);
 });
}
function cancelPointMove(){
 if(!pointMoveModeId)return;
 pointMoveModeId=null;
 renderMarkers();updateMapHint();
}
function armPointMove(id){
 const existing=getStop(id);if(!existing||!map)return;
 hidePointQuick();closeLegEditor();hideContext();
 pointMoveModeId=id;selectedStop=id;
 renderMarkers();updateMapHint();
 toast('מצב הזזת נקודה: גרור את הסמן למיקום חדש, או לחץ על מיקום חדש במפה. Esc לביטול.');
}
function relocatePoint(id,latlng){
 const found=getStop(id);
 if(!found||!Number.isFinite(latlng?.lat)||!Number.isFinite(latlng?.lng))return;
 if(Math.abs(latlng.lat)>90||Math.abs(latlng.lng)>180)return;
 if(Math.abs(+found.stop.lat-latlng.lat)<0.0000005&&Math.abs(+found.stop.lng-latlng.lng)<0.0000005){pointMoveModeId=null;updateMapHint();return;}
 ronnyRememberUndo('הזזת נקודה');
 const original={lat:+found.stop.lat,lng:+found.stop.lng};
 found.stop.lat=+latlng.lat.toFixed(6);found.stop.lng=+latlng.lng.toFixed(6);
 if(found.stop.type==='start')relocateConnectedDayOrigin(found.day,original,{lat:found.stop.lat,lng:found.stop.lng});
 synchronizeLoopDays();synchronizeDayStarts();synchronizeLoopDays();
 pointMoveModeId=null;
 if($('point-quick')?.classList.contains('open'))hidePointQuick();
 if(!isMapOnlyPoint(found.stop)){invalidate();retimeAfterOrderChange(found.day)}
 save();renderAll();updateMapHint();
 toast(isMapOnlyPoint(found.stop)?'מיקום הנקודה עודכן. קו החיבור לנקודת הדרך הקרובה התעדכן.':'מיקום הנקודה עודכן. נתיבי הדרך והזמנים מחושבים מחדש.');
}
// Highlight the planning entry matching a clicked map marker without recentering the map.
let ronnyMapRevealToken=0;
function revealPlanningCardFromMap(id,kind='day'){
 const token=++ronnyMapRevealToken;
 const outline=kind==='outline';
 // A collapsed planner must reopen when a map point is selected.
 if(window.innerWidth<=760){
  $('planner')?.classList.add('show-mobile');
  setRail('plan');
 }else if(document.querySelector('.app')?.classList.contains('planner-collapsed')){
  setPlannerCollapsed(false);
 }
 const container=outline?$('zoom-scroll'):$('schedule');
 const root=outline?$('zoom-content'):$('schedule');
 const selector=outline?'[data-zoom-card]':'[data-stop], [data-side-point]';
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const reveal=()=>{
  if(token!==ronnyMapRevealToken||!container||!root)return false;
  const target=[...root.querySelectorAll(selector)].find(el=>
   outline?el.dataset.zoomCard===id:(el.dataset.stop===id||el.dataset.sidePoint===id));
  if(!target)return false;
  root.querySelectorAll('.ronny-map-reveal').forEach(el=>el.classList.remove('ronny-map-reveal'));
  target.classList.add('ronny-map-reveal');
  if(target.matches('.stop'))target.classList.add('focused');
  const parentBounds=container.getBoundingClientRect(),targetBounds=target.getBoundingClientRect();
  const availableHeight=container.clientHeight;
  if(availableHeight>0){
   // Center when practical; large cards instead align near the top.
   const offset=targetBounds.top-parentBounds.top;
   const preferred=targetBounds.height>availableHeight-28?16:Math.max(18,(availableHeight-targetBounds.height)/2);
   const destination=Math.max(0,Math.min(container.scrollHeight-availableHeight,container.scrollTop+offset-preferred));
   container.scrollTo({top:destination,behavior:reduced?'auto':'smooth'});
  }
  window.setTimeout(()=>{if(token===ronnyMapRevealToken)target.classList.remove('ronny-map-reveal')},2400);
  return true;
 };
 // Wait for the panel to expand, avoiding scroll while its size is zero.
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  reveal();
  if(token===ronnyMapRevealToken&&container?.clientHeight<60){
   window.setTimeout(reveal,320);
  }
 }));
}

function renderMarkers(){
 if(!map)return;
 markerLayer.clearLayers();
 const palette=['#08a99c','#517bb9','#a269d3','#d08b38','#3b967c','#d36776','#64748b'];
 const stageOverview=ronnyStageOverviewMode(),stageDays=new Set(ronnyVisibleDayIndices());
 // Precompute route order and walking-loop endpoints once per visible day.
 // Without this, every map marker rescans every stop in its day.
 const routeIndexByDay=new Map(),walkingEndByDay=new Map(),linkedWalkParkingByDay=new Map();
 for(const di of ronnyVisibleDayIndices()){
  const indexes=new Map(),walkEnds=new Map();
  const route=routeStopsForDay(di);
  linkedWalkParkingByDay.set(di,ronnyLinkedWalkParkingIds(route));
  route.forEach((p,index)=>{
   if(!indexes.has(p.id))indexes.set(p.id,index+1);
   if(p.type==='walkEnd'&&p.walkLoopSource&&!walkEnds.has(p.walkLoopSource))
    walkEnds.set(p.walkLoopSource,p);
  });
  routeIndexByDay.set(di,indexes);
  walkingEndByDay.set(di,walkEnds);
 }
 currentStopsForMap().forEach(({stop:s,di,si})=>{
   if(!validPoint(s)||!markerVisibleForStop(s)||s.autoLoopEnd||s.autoWalkEnd)return;
   if(stageOverview&&(s.type!=='start'||!stageDays.has(di)))return;
   const cls=types[s.type]?.cls||'';
   const override=viewScope==='all'?`style="background:${palette[di%palette.length]}"`:'';
   const routeOrder=isMapOnlyPoint(s)?null:(routeIndexByDay.get(di)?.get(s.id)??0);
   const tint=stageOverview?(ronnyGroupColorForDay(di)||pointColor(s,di)):s.type==='idea'?'#b78a08':['start','end'].includes(s.type)?'#222b26':pointColor(s,di);const html=stageOverview?`<div class="ronny-stage-start-marker" style="--pin-color:${tint}"><span>${di+1}</span></div>`:`<div class="marker point-pin ${s.type==='start'&&(state.days[di]?.loop||(di===0&&state.settings.tripLoop===true))?'ronny-loop-pin':''} ${cls} ${selectedStop===s.id?'active':''} ${(!ronnyMeasure.active&&!drawLegSession&&!forcedPointSession&&!forcedRelocateSession&&!outlineMoveModeId&&!newTripSetupDraft&&(!pointMoveModeId||pointMoveModeId===s.id))?'drag-marker':''} ${pointMoveModeId===s.id?'move-armed':''}" style="--pin-color:${tint}"><span class="point-pin-inner">${s.type==='via'?`<span class="via-number ronny-route-ordinal" aria-hidden="true">${routeOrder}</span>`:ronnyPointSymbol(s.type==='start'&&(state.days[di]?.loop||(di===0&&state.settings.tripLoop===true))?'loop':s.type,s)}</span></div>`;
   const walkFinish=s.type==='walkStart'?walkingEndByDay.get(di)?.get(s.id):null;
    const walkRange=walkFinish&&s.time&&walkFinish.time?s.time+'–'+walkFinish.time:s.time||'';
    const timeInfo=(viewScope==='all'||isMapOnlyPoint(s))?'':`<div class="map-time-badge" aria-label="${s.type==='walkStart'?'יציאה וחזרה מההליכה':s.type==='start'?'שעת יציאה':'שעת הגעה'}">${esc(s.type==='walkStart'?walkRange:s.time||'')}</div>`;
   const selectedQuick=$('point-quick')?.classList.contains('open')&&$('point-quick').dataset.id===s.id;
   const canDrag=!ronnyMeasure.active&&!drawLegSession&&!forcedPointSession&&!forcedRelocateSession&&!outlineMoveModeId&&!newTripSetupDraft&&(!pointMoveModeId||pointMoveModeId===s.id);
   const m=L.marker([+s.lat,+s.lng],{icon:L.divIcon({html:(stageOverview?'':ronnySecondaryIconMarkerMarkup(s,linkedWalkParkingByDay.get(di)?.has(s.id)===true))+html+timeInfo,className:'',iconSize:[36,36],iconAnchor:stageOverview?[18,18]:[18,34]}),alt:routeOrder!==null?'נקודה '+routeOrder+' — '+s.name:s.name,ronnyStopId:s.id,ronnyRouteOrder:routeOrder,draggable:canDrag,autoPan:true,title:'גרור לשינוי מיקום · לחץ לעריכה'}).addTo(markerLayer);
   const element=m.getElement?.();if(element){element.dataset.ronnyStopId=s.id;if(routeOrder!==null)element.dataset.ronnyRouteOrder=String(routeOrder)}
   // Dragging requires no prior click. Hide an existing editor while moving,
   // and leave it closed afterwards so further adjustments are unobstructed.
   m.on('dragstart',()=>{
    ronnyMarkerDraggedAt=Date.now();
    const panel=$('point-quick');
    if(panel?.classList.contains('open')&&panel.dataset.id===s.id)
     panel.classList.add('ronny-point-drag-hidden');
   });
   m.on('dragend',e=>{
    ronnyMarkerDraggedAt=Date.now();
    const ll=e.target.getLatLng();
    // relocatePoint commits coordinates, rebuilds the route and closes an open editor.
    relocatePoint(s.id,ll);
   });
   m.on('click',e=>{
    if(Date.now()-ronnyMarkerDraggedAt<450)return;
    if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);
    if(drawLegSession)return;
    if(quickStreetMode){openGoogleStreetView(s.lat,s.lng);return}
    if(pointMoveModeId===s.id)return;
    if(pointMoveModeId)cancelPointMove();
    if(routeEdit)return;
    // A repeated tap simply keeps the editor open; dragging is armed on selection.
    if($('point-quick')?.classList.contains('open')&&$('point-quick').dataset.id===s.id){
      revealPlanningCardFromMap(s.id,'day');
      return;
    }
    openPointQuick(s.id);
    revealPlanningCardFromMap(s.id,'day');
    syncMarkerDragState();
   });const permanent=state.settings.showMapDescriptions!==false&&s.showMapDescription===true&&!!String(s.description||s.notes||'').trim();
   const tip=permanent?`<div class="ronny-permanent-point-name">${esc(s.name)}</div><div class="ronny-permanent-point-desc">${esc(String(s.description||s.notes).slice(0,240))}</div>`:`<div class="point-tip-title">${esc(s.name)}</div>${(s.description||s.notes)?`<div class="point-tip-description">${esc(s.description||s.notes)}</div>`:''}${(viewScope==='all'||isMapOnlyPoint(s))?'':`<div class="point-tip-time">${s.type==='start'?'יציאה · ':''}${esc((viewScope==='all'?'יום '+(di+1)+' · ':'')+(s.time||''))}</div>`}`;
   m.bindTooltip(tip,{direction:'top',offset:[0,permanent?-5:-15],opacity:1,permanent,className:permanent?'ronny-map-description point-info-tooltip':'point-info-tooltip'});
 });refreshIcons();
}
// Overview routing has its own cancellable lifecycle, independent of day routing.
// Do not portray a missing road geometry as a real straight-line driving route.
let overviewRoadController=null,overviewRoadGeneration=0;
const overviewRoadFailures=new Map();
function paintOverviewRoads(){
 routeLayer.clearLayers();legLabelLayer?.clearLayers();legTextOccupied=[];
 let missing=0,knownMetres=0;
 const stageOverview=ronnyStageOverviewMode();
 ronnyVisibleDayIndices().forEach(di=>{
  const arr=routeStopsForDay(di).filter(validPoint);
  const shapes=new Map(),unknown=new Set();
  for(let i=1;i<arr.length;i++){
   if(arr[i].type==='walkStart')continue;
   const leg=legAt(i,arr),profile=effectiveLegProfile(i,arr,di);
   if(leg.mode==='auto'){
    const shape=routedLegVisualCache.get(routedShapeKey(arr,i,profile));
    if(shape?.length>1)shapes.set(i,shape);
    else{unknown.add(i);missing++}
   }else shapes.set(i,legCoords(i,arr));
  }
  const retraces=RouteGeometry.walkRetraceSegments(arr,shapes);
  for(let i=1;i<arr.length;i++){
   if(arr[i].type==='walkStart')continue;
   const leg=legAt(i,arr),from=arr.findIndex(s=>s.id===arr[i].walkLoopSource&&s.type==='walkStart');
   // Do not manufacture a partial return path from missing outbound segments.
   const missingRetrace=retraces.returns.has(i)&&from>=0&&[...unknown].some(j=>j>from&&j<i);
   if(missingRetrace)continue;
   const coords=retraces.returns.get(i)||shapes.get(i);
   if(!coords||coords.length<2)continue;
   const role=retraces.returns.has(i)?'return':retraces.outbound.has(i)?'outbound':null;
   knownMetres+=distanceOfCoords(coords);
   drawLegLineOverview(coords,leg.mode,di,i,role);
   if(!stageOverview)drawRouteAnnotations(i,coords,arr,legLabelLayer||routeLayer);
  }
 });
 ronnyRefreshStageSummary(knownMetres,missing);
 return missing;
}
function overviewRoadMessage(missing,loading=false){
 $('route-msg').textContent=loading
  ?'מחשב תוואי כבישים עבור '+missing+' מקטעים. מקטע לא מחושב יופיע כשהנתיב יהיה מוכן.'
  :missing?'לא התקבל תוואי כביש עבור '+missing+' מקטעים. לא מוצג קו ישר כאילו הוא כביש; אפשר לבחור יום או לנסות שוב בהמשך.'
  :'סקירת כל הטיול: נתיבי כביש מחושבים ותוואי שרטוט ידני מוצגים בצורתם האמיתית.';
}
function loadOverviewRoads(generation){
 if(!layerOn('routeLines'))return;
 const tasks=[];
 const now=Date.now();
 ronnyVisibleDayIndices().forEach(di=>{
  const arr=routeStopsForDay(di).filter(validPoint);
  if(arr.length<2)return;
  const {groups}=RoutePlan.build(arr,{legAt,effectiveLegProfile,kmBetween,manualLeg});
  for(const group of groups){
   let missing=false;
   for(let i=group.start+1;i<=group.end;i++){
    if(!routedLegVisualCache.has(routedShapeKey(arr,i,group.profile))){missing=true;break}
   }
   if(!missing)continue;
   const key=JSON.stringify([group.profile,group.stops.map(p=>[p.lat,p.lng])]);
   if(now-(overviewRoadFailures.get(key)||0)<45000)continue;
   tasks.push({arr,group,key});
  }
 });
 if(!tasks.length){overviewRoadMessage(paintOverviewRoads(),false);return}
 const controller=new AbortController();overviewRoadController=controller;
 const timeout=setTimeout(()=>controller.abort(),65000);
 let next=0;
 const repaint=()=>{
  if(controller.signal.aborted||generation!==overviewRoadGeneration||viewScope!=='all'||planningResolution!=='day')return;
  overviewRoadMessage(paintOverviewRoads(),true);
 };
 const worker=async()=>{
  while(next<tasks.length&&!controller.signal.aborted&&generation===overviewRoadGeneration){
   const {arr,group,key}=tasks[next++];
   try{
    let result=routeCache.get(key);
    if(!result){
     result=await requestRoute(group.stops,group.profile,controller.signal);
     if(routeCache.size>35)routeCache.delete(routeCache.keys().next().value);
     routeCache.set(key,result);
    }
    if(controller.signal.aborted||generation!==overviewRoadGeneration)break;
    const coords=result.geometry?.coordinates?.map(p=>[p[1],p[0]])||[];
    const sections=splitRoutedLegs(coords,arr.slice(group.start,group.end+1));
    if(sections.length!==group.end-group.start)throw Error('Invalid routed geometry');
    for(let i=group.start+1;i<=group.end;i++){
     const part=sections[i-group.start-1];
     if(!part||part.length<2)continue;
     rememberRoutedShape(arr,i,group.profile,part);
     const base=group.forced?result.legs.reduce((sum,leg)=>sum+(+leg.duration||0),0):result.legs[i-group.start-1]?.duration;
     if(Number.isFinite(base))routedLegDurationCache.set(routedShapeKey(arr,i,group.profile),base);
    }
    overviewRoadFailures.delete(key);
    repaint();
   }catch(err){
    if(!controller.signal.aborted)overviewRoadFailures.set(key,Date.now());
   }
  }
 };
 Promise.all(Array.from({length:Math.min(2,tasks.length)},worker)).finally(()=>{
  clearTimeout(timeout);
  if(overviewRoadController===controller)overviewRoadController=null;
  if(generation===overviewRoadGeneration&&viewScope==='all'&&planningResolution==='day'){
   overviewRoadMessage(paintOverviewRoads(),false);
  }
 });
}
function showOverview(){
 if(!map)return;
 overviewRoadGeneration++;
 overviewRoadController?.abort();overviewRoadController=null;
 routeToken++;clearTimeout(routeDebounce);routeController?.abort();routeController=null;
 routeData=null;clearLegSpotlight();paintedLegCoordinates.clear();
 const missing=paintOverviewRoads();
 $('route-stops').textContent=ronnyVisibleDayIndices().reduce((n,di)=>n+state.days[di].stops.length,0);
 $('route-distance').textContent='—';$('route-duration').textContent='—';
 $('route-card').querySelector('.route-kicker').textContent='סקירת מסלול • '+ronnyGroupCaption();
 overviewRoadMessage(missing,missing>0);
 renderSchedule();
 if(missing)loadOverviewRoads(overviewRoadGeneration);
}
function drawLegLineOverview(coords,mode,di,index,retraceRole=null){
 if(state.days[di]?.stops[index]?.type==='walkStart'||!Array.isArray(coords)||coords.length<2)return;
 const stageOverview=ronnyStageOverviewMode();
 const color=stageOverview?(ronnyGroupColorForDay(di)||routeDisplayColor(pointColor(state.days[di]?.stops[index],di),di*11+index)):
  retraceRole==='outbound'?'#2d8071':retraceRole==='return'?'#c38b47':routeDisplayColor(pointColor(state.days[di]?.stops[index],di),di*11+index);
 const visual=retraceRole?ronnyRetraceShift(coords):coords;
 if(layerOn('routeLines')){
  L.polyline(visual,{color:'#fffaf0',weight:stageOverview?9:8,opacity:stageOverview?1:.9,interactive:false}).addTo(routeLayer);
  L.polyline(visual,{color,weight:stageOverview?5.4:4.6,dashArray:stageOverview?(mode==='straight'?'9 7':undefined):(mode==='straight'?'8 9':mode==='auto'?'7 8':undefined),opacity:1,interactive:false,lineCap:'round',lineJoin:'round',className:retraceRole?'ronny-retrace-'+retraceRole:''}).addTo(routeLayer);
  const hit=L.polyline(visual,{color:'#ffffff',weight:34,opacity:.002,interactive:true,bubblingMouseEvents:false,className:'leg-hit-target'}).addTo(routeLayer);
  hit.on('click',e=>{
   if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);
   selectedDay=di;viewScope='day';$('map-scope').value='day';selectedStop=null;
   cancelPointMove();renderAll();openLegEditor(index,e.latlng);
  });
 }
}
async function requestRoute(list,profile,signal){return RoutingService.requestRoute(list,profile,signal,fetch)}
function drawRoute(){
 if(!map)return;if(viewScope==='all'){showOverview();return}
 overviewRoadGeneration++;overviewRoadController?.abort();overviewRoadController=null;
 if(syncWalkingLoops(state.days[selectedDay]))save();
 invalidate();clearLegSpotlight();paintedLegCoordinates.clear();routeLayer.clearLayers();legLabelLayer?.clearLayers();legTextOccupied=[];const arr=stops(),day=selectedDay;
 $('route-card').querySelector('.route-kicker').textContent='סקירת מסלול • יום '+(day+1);$('route-stops').textContent=arr.length;
 $('route-distance').textContent='—';$('route-duration').textContent='—';
 if(arr.length<2){forcedHandleLayer?.clearLayers();$('route-msg').textContent='הוסף שתי נקודות לפחות לחישוב מסלול';return}
 const token=++routeToken,{ids,results,groups}=RoutePlan.build(arr,{legAt,effectiveLegProfile,kmBetween,manualLeg});
 // Pre-draw manual geometry immediately, while public routing is being requested.
 const paint=(withResults=false)=>{
  if(token!==routeToken)return;
  routeLayer.clearLayers();legLabelLayer?.clearLayers();legTextOccupied=[];
  if(withResults){
   for(const group of groups){
    if(!group.result?.geometry?.coordinates?.length)continue;
    const coords=group.result.geometry.coordinates.map(pt=>[pt[1],pt[0]]);
    const sections=splitRoutedLegs(coords,arr.slice(group.start,group.end+1));
    for(let i=group.start+1;i<=group.end;i++)rememberRoutedShape(arr,i,group.profile,sections[i-group.start-1]||legCoords(i,arr));
   }
   if(syncWalkingLoops(state.days[day]))save();
  }
  const shapes=new Map(),uncertain=new Set();
  for(let i=1;i<arr.length;i++){
   if(arr[i].type==='walkStart')continue;
   const conf=legAt(i,arr);
   if(conf.mode==='auto'){
    const shape=routedLegVisualCache.get(routedShapeKey(arr,i,effectiveLegProfile(i,arr,day)));
    if(!shape)uncertain.add(i);
    shapes.set(i,shape||[[+arr[i-1].lat,+arr[i-1].lng],...(conf.viaPoints||[]),[+arr[i].lat,+arr[i].lng]]);
   }else shapes.set(i,legCoords(i,arr));
  }
  const retraces=RouteGeometry.walkRetraceSegments(arr,shapes);
  for(let i=1;i<arr.length;i++){
   if(arr[i].type==='walkStart')continue;
   const destination=arr[i],conf=legAt(i,arr);
   const geometry=retraces.returns.get(i)||shapes.get(i);
   if(retraces.returns.has(i)){
    for(let j=arr.findIndex(p=>p.id===destination.walkLoopSource)+1;j<i;j++)if(uncertain.has(j))uncertain.add(i);
   }
   const role=retraces.returns.has(i)?'return':retraces.outbound.has(i)?'outbound':null;
   drawLegLine(geometry,conf.mode,i,uncertain.has(i),role);
  }
 };
 paint();
 const finalize=()=>{
  if(token!==routeToken||day!==selectedDay||viewScope!=='day')return;
  let unavailable=false;
  for(let j=0;j<results.length;j++)if(!results[j]){results[j]=approximateLegs(arr,day)[j];results[j].estimated=true;unavailable=true}
  paint(true);
  for(let j=1;j<arr.length;j++)if(arr[j].leg?.walkAutoRetrace)results[j-1]=manualLeg(j,arr);
  const totalDistance=results.reduce((n,l)=>n+(+l.distance||0),0),totalSeconds=results.reduce((n,l)=>n+(+l.duration||0),0),manualMissing=results.some(l=>l.manualMissing);
  routeData={day,ids,legs:results,distance:totalDistance,duration:totalSeconds,source:'נתיב משולב'};
  if(ronnyDistanceSnapshot.key){ronnyDistanceSnapshot.key='';ronnyDistanceController?.abort();ronnyDistanceState();ronnyPaintDashboardDistance();}
  if(pendingRetimes.has(day)){applyItineraryTimes(day,results,pendingRetimes.get(day),manualMissing?'incomplete':unavailable?'estimated':'routed');pendingRetimes.delete(day);save();renderMarkers()}
  $('route-distance').textContent=(totalDistance/1000).toLocaleString('he-IL',{maximumFractionDigits:1})+' ק״מ';
  $('route-duration').textContent=manualMissing?'חלקי':minsFmt(totalSeconds/60);
  $('route-msg').textContent=manualMissing?'יש מקטע ידני ללא משך מעבר. הזן דקות כדי לחשב שעות מדויקות.':unavailable?'חלק מנתיבי ההליכה או הנסיעה לא חושבו: הקו המקווקו אינו תוואי מאומת. אפשר לשרטט דרך ידנית.':'מקטעים מחושבים בנפרד. משכי מעבר ידניים מוצגים לפי ההזנה שלך.';
  renderSchedule();renderViaHandles();renderForcedHandles();
  if($('leg-editor')?.classList.contains('open'))updateLegDurationPreview();
 };
 if(!groups.length){finalize();return}
 routeDebounce=setTimeout(async()=>{
  const controller=new AbortController();routeController=controller;const timeout=setTimeout(()=>controller.abort(),17000);
  await Promise.all(groups.map(async group=>{
   const key=JSON.stringify([group.profile,group.stops.map(p=>[p.lat,p.lng])]);
   try{let r=routeCache.get(key);if(!r){r=await requestRoute(group.stops,group.profile,controller.signal);if(routeCache.size>35)routeCache.delete(routeCache.keys().next().value);routeCache.set(key,r)}
    group.result=r;
    if(group.forced){
     const position=group.end,base=r.legs.reduce((t,x)=>t+(+x.duration||0),0);
     results[group.start]={...legTimingSnapshot(legAt(position,arr),base),distance:r.legs.reduce((t,x)=>t+(+x.distance||0),0),mode:'auto'};
     routedLegDurationCache.set(routedShapeKey(arr,position,group.profile),base);
    }else for(let i=0;i<r.legs.length;i++){
     const position=group.start+i+1,base=r.legs[i].duration;
     results[group.start+i]={...legTimingSnapshot(legAt(position,arr),base),distance:r.legs[i].distance,mode:'auto'};
     routedLegDurationCache.set(routedShapeKey(arr,position,group.profile),base);
    }
   }catch(e){group.result=null}
  }));clearTimeout(timeout);if(routeController===controller)routeController=null;finalize();
 },300);
}
function renderPoiLinks(){
 if(!map||!poiLinkLayer)return;
 poiLinkLayer.clearLayers();
 if(!layerOn('poiLinks')&&!layerOn('routeLines'))return;
 const days=ronnyVisibleDayIndices();
 for(const di of days){
  const route=routeStopsForDay(di);
  for(let i=0;i<route.length;i++){
   const start=route[i];if(start.type!=='walkStart'||!validPoint(start)||!layerOn('routeLines'))continue;
   const previous=[...route.slice(0,i)].reverse().find(p=>!WALK_TYPES.has(p.type)&&validPoint(p));
   if(!previous)continue;
   const coords=[[+previous.lat,+previous.lng],[+start.lat,+start.lng]];
   if(kmBetween(coords[0],coords[1])<1)continue;
   L.polyline(coords,{pane:'ronnyPoiLinks',color:'#fffdf6',weight:4,dashArray:'3 9',opacity:.9,interactive:false}).addTo(poiLinkLayer);
   L.polyline(coords,{pane:'ronnyPoiLinks',color:'#568973',weight:2.3,dashArray:'3 9',opacity:.95,interactive:false,className:'ronny-walk-access-link'}).addTo(poiLinkLayer);
  }
  if(!layerOn('poiLinks'))continue;
  for(const {point,nearest} of poiLinksForDay(di)){
    if((point.type==='note'&&!layerOn('notes'))||(point.type!=='note'&&!layerOn('poi'))||(!layerOn('routeStops')&&!layerOn('routeLines')))continue;
    const coords=[[+point.lat,+point.lng],[+nearest.lat,+nearest.lng]];
    // A pale thin halo keeps the dashed association visible over satellite imagery.
    L.polyline(coords,{pane:'ronnyPoiLinks',color:'#fffdf6',opacity:.78,weight:3.6,dashArray:'4 7',lineCap:'round',interactive:false,className:'poi-reference-link poi-reference-halo'}).addTo(poiLinkLayer);
    L.polyline(coords,{pane:'ronnyPoiLinks',color:pointColor(point,di),opacity:.94,weight:2.1,dashArray:'4 7',lineCap:'round',interactive:false,className:'poi-reference-link'}).addTo(poiLinkLayer);
  }
 }
}

/* Macro planner: outline -> stage -> days; it never destroys detailed days. */
const OUTLINE_COLORS=['#638a70','#6b87a8','#b18368','#8c779b','#a39559','#6c9c93','#a7717b','#869867'];
