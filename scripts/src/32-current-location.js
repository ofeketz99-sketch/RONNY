// Current location on the map (patch 141). The position is only drawn on the map:
// it is never saved, never sent anywhere and never added to the trip.
const RONNY_LOCATE_OPTIONS=Object.freeze({enableHighAccuracy:true,maximumAge:10000,timeout:20000});
// Programmatic moves start within this window; any other move start means the user took over.
const RONNY_LOCATE_OWN_MOVE_MS=700;
const ronnyLocate={state:'off',follow:false,watchId:null,fix:null,layer:null,dot:null,ring:null,button:null,ownMoveUntil:0};

// How close to zoom for a fix of `accuracy` metres. A precise fix never zooms the user out.
function ronnyLocateZoom(accuracy,currentZoom){
 const a=Number(accuracy),z=Number(currentZoom)||0;
 const target=!Number.isFinite(a)||a<=0||a<=50?16:a<=200?15:a<=1000?14:a<=5000?12:10;
 return a>1000?target:Math.max(z,target);
}
function ronnyLocateMessage(reason){
 return {
  unsupported:'הדפדפן הזה לא תומך באיתור מיקום',
  insecure:'איתור מיקום עובד רק בכתובת מאובטחת (https)',
  1:'אין הרשאה למיקום. אפשר לאשר אותה בהגדרות האתר בדפדפן ולנסות שוב',
  2:'המיקום לא זמין כרגע. בדקו שה־GPS בטלפון פועל',
  3:'לא התקבל מיקום בזמן. נסו שוב, רצוי בשטח פתוח'
 }[reason]||'לא ניתן לאתר את המיקום כרגע';
}
function ronnyLocateSyncButton(){
 const b=ronnyLocate.button;if(!b)return;
 const view=ronnyLocate.state==='on'?(ronnyLocate.follow?'follow':'free'):ronnyLocate.state;
 const label={off:'הצג את המיקום שלי',searching:'מאתר את המיקום שלך… לחיצה מבטלת',follow:'המפה עוקבת אחרי המיקום שלך · לחיצה מכבה',free:'חזור למיקום שלי'}[view];
 b.dataset.state=view;
 b.setAttribute('aria-pressed',String(view!=='off'));
 b.setAttribute('aria-label',label);
 b.title=label;
}
function ronnyLocateMoveMap(apply){ronnyLocate.ownMoveUntil=Date.now()+RONNY_LOCATE_OWN_MOVE_MS;apply()}
function ronnyLocateCenter(first){
 const fix=ronnyLocate.fix;if(!map||!fix)return;
 const here=L.latLng(fix.lat,fix.lng);
 if(!first){
  // While following, move only when the position nears the edge, so the map does not jitter.
  if(!map.getBounds().pad(-0.25).contains(here))ronnyLocateMoveMap(()=>map.panTo(here,{animate:true}));
  return;
 }
 if(fix.accuracy>1000&&ronnyLocate.ring){ronnyLocateMoveMap(()=>map.flyToBounds(ronnyLocate.ring.getBounds(),{maxZoom:15,duration:.8}));return}
 const zoom=ronnyLocateZoom(fix.accuracy,map.getZoom());
 // Same rule as day changes: large zoom jumps fly, so the tiles do not all vanish at once.
 ronnyLocateMoveMap(()=>Math.abs(zoom-map.getZoom())>=3?map.flyTo(here,zoom,{duration:.8}):map.setView(here,zoom,{animate:true}));
}
function ronnyLocateDraw(){
 const fix=ronnyLocate.fix;if(!map||!fix)return;
 const here=[fix.lat,fix.lng];
 if(!ronnyLocate.layer)ronnyLocate.layer=L.layerGroup().addTo(map);
 if(!ronnyLocate.ring){
  ronnyLocate.ring=L.circle(here,{radius:fix.accuracy,interactive:false,color:'#1a73e8',weight:1,opacity:.55,fillColor:'#1a73e8',fillOpacity:.12,className:'ronny-locate-ring'}).addTo(ronnyLocate.layer);
  ronnyLocate.dot=L.marker(here,{interactive:false,keyboard:false,zIndexOffset:900,icon:L.divIcon({className:'ronny-locate-marker',html:'<span class="ronny-locate-dot"></span>',iconSize:[22,22],iconAnchor:[11,11]})}).addTo(ronnyLocate.layer);
 }else{ronnyLocate.ring.setLatLng(here);ronnyLocate.ring.setRadius(fix.accuracy);ronnyLocate.dot.setLatLng(here)}
}
function ronnyLocateOnFix(position){
 if(ronnyLocate.state==='off')return;
 const c=position.coords,first=!ronnyLocate.fix;
 ronnyLocate.fix={lat:c.latitude,lng:c.longitude,accuracy:Math.max(1,Number(c.accuracy)||1)};
 ronnyLocate.state='on';
 ronnyLocateDraw();
 if(ronnyLocate.follow)ronnyLocateCenter(first);
 if(first&&ronnyLocate.fix.accuracy>1000)toast('המיקום משוער בלבד (±'+(ronnyLocate.fix.accuracy/1000).toFixed(1)+' ק״מ)');
 ronnyLocateSyncButton();
}
function ronnyLocateOnError(error){
 if(ronnyLocate.state==='off')return;
 // After a fix, a passing timeout or weak signal keeps the last known position on the map.
 if(ronnyLocate.fix&&error?.code!==1)return;
 ronnyLocateStop();
 toast(ronnyLocateMessage(error?.code));
}
function ronnyLocateStart(){
 if(!window.isSecureContext){toast(ronnyLocateMessage('insecure'));return}
 const geo=navigator.geolocation;
 if(!geo){toast(ronnyLocateMessage('unsupported'));return}
 ronnyLocate.state='searching';ronnyLocate.follow=true;ronnyLocate.fix=null;
 ronnyLocateSyncButton();
 ronnyLocate.watchId=geo.watchPosition(ronnyLocateOnFix,ronnyLocateOnError,RONNY_LOCATE_OPTIONS);
}
function ronnyLocateStop(){
 if(ronnyLocate.watchId!==null)navigator.geolocation?.clearWatch(ronnyLocate.watchId);
 ronnyLocate.layer?.clearLayers();
 Object.assign(ronnyLocate,{state:'off',follow:false,watchId:null,fix:null,dot:null,ring:null});
 ronnyLocateSyncButton();
}
// Off → locate and follow. Following → off. Map moved away → back to the position and follow again.
function ronnyLocateToggle(){
 if(ronnyLocate.state==='off'){ronnyLocateStart();return}
 if(ronnyLocate.state==='on'&&!ronnyLocate.follow){ronnyLocate.follow=true;ronnyLocateCenter(true);ronnyLocateSyncButton();return}
 ronnyLocateStop();
}
function ronnyLocateInit(){
 if(!map||ronnyLocate.button)return;
 const Control=L.Control.extend({options:{position:'topright'},onAdd(){
  const box=L.DomUtil.create('div','leaflet-bar ronny-locate-control');
  const button=L.DomUtil.create('button','ronny-locate-btn',box);
  button.type='button';button.id='map-locate';
  button.innerHTML='<i data-lucide="locate-fixed" aria-hidden="true"></i>';
  L.DomEvent.disableClickPropagation(box);L.DomEvent.disableScrollPropagation(box);
  L.DomEvent.on(button,'click',e=>{L.DomEvent.preventDefault(e);ronnyLocateToggle()});
  ronnyLocate.button=button;ronnyLocateSyncButton();
  return box;
 }});
 new Control().addTo(map);
 // A drag is always the user, even in the middle of the locate animation. Any other move that
 // the button did not start (zoom, a day, a point) also ends following.
 const release=()=>{if(!ronnyLocate.follow)return;ronnyLocate.follow=false;ronnyLocateSyncButton()};
 map.on('dragstart',release);
 map.on('movestart',()=>{if(Date.now()>=ronnyLocate.ownMoveUntil)release()});
 refreshIcons();
}
