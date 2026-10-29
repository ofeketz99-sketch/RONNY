function ronnyGoBack(){
 const item=ronnyDrawerHistory.pop();
 if(!item){ronnyBackState();return}
 $('drawer-title').textContent=item.title;$('drawer-kicker').textContent=item.kicker;
 $('drawer-subtitle').textContent=item.subtitle;
 $('drawer-body').replaceChildren(...item.body);$('drawer-footer').replaceChildren(...item.footer);
 $('drawer').dataset.resizable=item.resizable;
 $('drawer-body').scrollTop=item.scrollTop;ronnyBackState();refreshIcons();
}
let pendingPointCommit=null;function closeDrawer(){ronnyDrawerHistory.length=0;ronnyBackState();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();if($('drawer')?.classList.contains('open')){const fallback=innerWidth<=760?($('planner').classList.contains('show-mobile')?'plan':'map'):(document.querySelector('.app')?.classList.contains('planner-collapsed')?null:'plan');setRail(fallback)}if(pendingPointCommit){const flush=pendingPointCommit;pendingPointCommit=null;flush()}$('drawer').classList.remove('open');$('drawer-backdrop').classList.remove('open');currentEdit=null}
function openDrawer(title,kicker,subtitle,body,footer,resizable=false){
 if($('drawer')?.classList.contains('open')){
  ronnyDrawerHistory.push({title:$('drawer-title').textContent,kicker:$('drawer-kicker').textContent,subtitle:$('drawer-subtitle').textContent,body:Array.from($('drawer-body').childNodes),footer:Array.from($('drawer-footer').childNodes),resizable:$('drawer').dataset.resizable,scrollTop:$('drawer-body').scrollTop});
  if(ronnyDrawerHistory.length>16)ronnyDrawerHistory.shift();
 }
 ronnyBackState();
 setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();if(pendingPointCommit){const flush=pendingPointCommit;pendingPointCommit=null;flush()}$('drawer-title').textContent=title;$('drawer-kicker').textContent=kicker;$('drawer-subtitle').textContent=subtitle;$('drawer-body').innerHTML=body;$('drawer-footer').innerHTML=footer;$('drawer').dataset.resizable=resizable?'true':'false';$('drawer').classList.add('open');$('drawer-backdrop').classList.add('open');ronnyBackState();refreshIcons()}
function openGoogleStreetView(lat,lng){window.open(googleLink(lat,lng),'_blank','noopener,noreferrer')}
function googleLink(lat,lng){return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${encodeURIComponent(lat+','+lng)}`}
function googleIframe(lat,lng){const k=state.settings.googleKey?.trim();return k?`<iframe loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="Google Street View" src="https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(k)}&location=${encodeURIComponent(lat+','+lng)}&heading=0&pitch=0&fov=80"></iframe>`:''}
function streetBody(lat,lng){const iframe=googleIframe(lat,lng);return `<div class="streetview">${iframe||`<div class="street-placeholder">${icon('scan-eye','icon')}<strong>תצוגת Street View</strong><p>אפשר לפתוח את תצוגת הרחוב בגוגל ללא מפתח API דרך הקישור שמתחת. להטמעה בתוך RONNY דרוש מפתח Google Maps Embed API.</p><button class="btn" id="configure-google">${icon('key-round')} חיבור גוגל</button></div>`}</div><a href="${googleLink(lat,lng)}" class="drawer-link" target="_blank" rel="noopener noreferrer">${icon('external-link')} פתיחה ב־Google Street View</a>`}
function openStreetView(lat,lng){openDrawer('תצוגת רחוב','STREET VIEW','תצוגת הרחוב של הנקודה שבחרת',streetBody(lat,lng),`<button class="btn" id="drawer-back">${icon('arrow-right')} חזרה</button><button class="btn btn-primary" id="street-add">${icon('plus')} הוסף עצירה כאן</button>`);$('configure-google')?.addEventListener('click',()=>openSettings('google'));$('street-add').onclick=()=>openStopForm(null,{lat,lng});$('drawer-back').onclick=closeDrawer}
const reverseNameCache=new Map();
async function nameNewPointByLocation(stopId,lat,lng){
 const key=`${lat.toFixed(4)},${lng.toFixed(4)}`;
 let choice=reverseNameCache.get(key);
 if(choice===undefined){
  try{const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),6000);
   try{const qs=new URLSearchParams({lat:lat.toFixed(6),lon:lng.toFixed(6),radius:'0.3',limit:'5',lang:'he'});
    const resp=await fetch('https://photon.komoot.io/reverse?'+qs,{signal:ctl.signal});if(!resp.ok)throw Error('reverse unavailable');
    const json=await resp.json();
    const candidates=(json.features||[]).filter(f=>Array.isArray(f.geometry?.coordinates));
    candidates.sort((a,b)=>kmBetween([lat,lng],[+a.geometry.coordinates[1],+a.geometry.coordinates[0]])-kmBetween([lat,lng],[+b.geometry.coordinates[1],+b.geometry.coordinates[0]]));
    choice='';for(const candidate of candidates){const p=candidate.properties||{};const meters=kmBetween([lat,lng],[+candidate.geometry.coordinates[1],+candidate.geometry.coordinates[0]]);
     if(meters>300)continue;const label=String(p.name||p.street||p.district||p.city||'').trim();if(label&&label.length<95){choice=label;break;}}
   }finally{clearTimeout(timer)}
  }catch(e){choice=''}
  if(reverseNameCache.size>=90)reverseNameCache.delete(reverseNameCache.keys().next().value);
  reverseNameCache.set(key,choice);
 }
 const found=getStop(stopId);
 if(!found||!found.stop.autoPlaceName||!choice||['start','end'].includes(found.stop.type))return;
 found.stop.name=choice;found.stop.autoPlaceName=true;found.stop.autoViaName=false;save();renderSchedule();renderMarkers();
 const active=$('point-quick');if(active?.classList.contains('open')&&active.dataset.id===stopId){const field=active.querySelector('#quick-name');if(field&&field.value===types[found.stop.type]?.name)field.value=choice;}
}
function createPointAtCurrentLevel(point,type){
 if(planningResolution==='day'){createPointAndEdit(point,type);return}
 const pointId=addOutlinePoint(point,point.name||types[type]?.name||'יעד',type);
 if(pointId){
  editOutlinePoint(pointId);
 }
}
function createPointAndEdit(point,type){
 const lat=+point.lat,lng=+point.lng;
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return;
 const day=state.days[selectedDay];if(!day)return;
 if(!endpointChoiceAllowed(type,selectedDay)){toast('כבר קיימת נקודת התחלה או סיום ליום זה');return;}
 const newStop={id:uid(),name:point.name||types[type]?.name||'נקודה',autoPlaceName:!point.name&&type!=='note',autoViaName:false,type,time:type==='start'?tripDefaultDepartureTime():findNextTime(),duration:(isMapOnlyPoint({type})||['start','end','via','walkStart','walkTurn','walkEnd'].includes(type))?0:(type==='parking'?15:60),cost:0,lat,lng,description:'',notes:'',segmentId:''};
 const replaced=false;
 if(type==='walkTurn'){
  const routes=day.stops.filter(p=>!isMapOnlyPoint(p));
  const finish=[...routes].reverse().find(p=>p.type==='walkEnd');
  if(finish&&routes.some(p=>p.type==='walkStart')){
   day.stops.splice(day.stops.indexOf(finish),0,newStop);
  }else day.stops.push(newStop);
 }else day.stops.push(newStop);
 positionRouteEndpoints(day);if(type==='start')day.departureUsesDefault=true;syncWalkingLoops(day);
 selectedStop=newStop.id;if(!isMapOnlyPoint(newStop)){invalidate();retimeAfterOrderChange(selectedDay)}save();renderAll();
 // Deliberately leave map center + zoom untouched on point insertion.
 openPointQuick(newStop.id);
 if(!point.name)nameNewPointByLocation(newStop.id,lat,lng);
 if(replaced)toast('נקודת '+(type==='start'?'ההתחלה':'הסיום')+' הקודמת הפכה לנקודת מעבר');
}
function openStopForm(id=null,point=null,chosenType=null,justCreated=false){
 if(!id){
  const p=point||map?.getCenter();if(!p)return;
  if(chosenType){createPointAndEdit(p,chosenType);return;}
  showPointTypeTree(p);return;
 }
 const found=getStop(id);if(!found)return;
 currentEdit=id;const s=found.stop;
 const segs=state.days[found.day]?.segments||[];
 const body=`<div class="api-intro"><strong>הגדרות מתקדמות לנקודה</strong><p>עריכת השם, התיאור, הצבע והזמנים מתבצעת ישירות בלחיצה על הנקודה במפה. כאן אפשר לשנות שיוך ליום, עלות וקואורדינטות.</p></div>
 <form id="stop-form" autocomplete="off">
 <div class="field"><label for="s-day">שיוך ליום</label><select id="s-day">${state.days.map((d,i)=>`<option value="${i}" ${i===found.day?'selected':''}>יום ${i+1} · ${esc(dayDate(i))}</option>`).join('')}</select></div>
 <div class="field"><label for="s-cost">עלות מתוכננת (₪)</label><input id="s-cost" type="number" min="0" value="${+s.cost||0}"></div>
 <div class="two-cols"><div class="field"><label for="s-lat">קו רוחב</label><input id="s-lat" type="number" step="any" min="-90" max="90" dir="ltr" value="${(+s.lat).toFixed(6)}"></div><div class="field"><label for="s-lng">קו אורך</label><input id="s-lng" type="number" step="any" min="-180" max="180" dir="ltr" value="${(+s.lng).toFixed(6)}"></div></div>
 <p class="coords-note">שינויים במיקום עשויים לגרום לחישוב מסלול מחדש. הצבע והזמנים אינם משתנים כאן.</p><div class="detail-saved" id="detail-save-state">נשמר אוטומטית</div></form>`;
 openDrawer('הגדרות מתקדמות','ADVANCED','שיוך ליום, עלות ומיקום',body,`<button class="btn btn-primary" id="finish-stop">${icon('check')} סיום</button>`,true);
 $('drawer-body').scrollTop=0;
 let timer=null;
 const commit=()=>{
  clearTimeout(timer);timer=null;
  const actual=getStop(id);if(!actual)return;
  const lat=Number($('s-lat')?.value),lng=Number($('s-lng')?.value);
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180)return;
  const targetDay=Number($('s-day').value);if(!state.days[targetDay])return;
  const cur=actual.stop;cur.cost=Math.max(0,Number($('s-cost').value)||0);if(cur.type==='start'&&(Number(cur.lat)!==lat||Number(cur.lng)!==lng)){cur.autoInheritedStart=false;delete cur.fromPreviousDayEnd}cur.lat=lat;cur.lng=lng;
  if(targetDay!==actual.day){
   state.days[actual.day].stops=state.days[actual.day].stops.filter(x=>x.id!==id);
   positionRouteEndpoints(state.days[actual.day]);enforceRouteEndpoints(state.days[targetDay],cur);
   state.days[targetDay].stops.push(cur);selectedDay=targetDay;viewScope='day';$('map-scope').value='day';
  }
  positionRouteEndpoints(state.days[targetDay]);
  if(!isMapOnlyPoint(cur)){retimeAfterOrderChange(targetDay);if(targetDay!==actual.day)retimeAfterOrderChange(actual.day)}
  const status=$('detail-save-state');if(status)status.textContent='נשמר';
  invalidate();save();renderAll();
 };
 const queue=()=>{const e=$('detail-save-state');if(e)e.textContent='שומר…';clearTimeout(timer);timer=setTimeout(commit,320)};
 pendingPointCommit=()=>{clearTimeout(timer);commit()};
 for(const inp of $('stop-form').querySelectorAll('input,select')){inp.addEventListener('input',queue);inp.addEventListener('change',commit)}
 $('stop-form').onsubmit=e=>{e.preventDefault();commit();closeDrawer()};
 $('finish-stop').onclick=()=>{commit();closeDrawer()};
}
function updateStreetPreview(){const lat=+$('s-lat').value,lng=+$('s-lng').value;if(!Number.isFinite(lat)||!Number.isFinite(lng))return;$('stop-street').innerHTML=streetBody(lat,lng);$('configure-google')?.addEventListener('click',()=>openSettings('google'))}
function findNextTime(){const list=stops();if(!list.length)return tripDefaultDepartureTime();const s=list[list.length-1],parts=(s.time||'09:00').split(':').map(Number),total=(parts[0]*60+parts[1]+(+s.duration||0)+40)%1440;return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`}
function openSettings(focus='trip'){
 // Draft all changes locally so Cancel / close doesn't alter the saved map bank.
 let draft=mapPrefs.enabledMaps.slice(),defaultStyle=mapPrefs.defaultStyle;
 const draftHome={...mapPrefs.home};
 const googleBody=`<div class="api-intro"><strong>Google — חיבור אופציונלי</strong><p>פתיחת Street View בטאב נפרד אינה מחייבת מפתח. רק הכיסוי הכחול והטמעה בתוך האתר מחייבים מפתח Google.</p></div>
 <div class="api-guide"><div class="api-guide-head"><strong>שכבת כיסוי Street View</strong></div><p>אם תרצה את שכבת הכיסוי של גוגל, הפעל Maps JavaScript API ו־Maps Embed API בחשבון Google Cloud.</p><a class="drawer-link" href="https://console.cloud.google.com/google/maps-apis/credentials" target="_blank" rel="noopener noreferrer">פתיחת Google Cloud ${icon('external-link')}</a><div class="field"><label for="google-key">מפתח Google (אופציונלי)</label><input id="google-key" dir="ltr" type="password" autocomplete="off" value="${esc(state.settings.googleKey||'')}" placeholder="AIza..."><button type="button" class="key-visibility" id="google-key-visibility">הצגת המפתח</button></div></div><p class="footnote">המפתח נשמר מקומית ואינו נכלל בייצוא הטיול.</p>`;
 const body=`<div class="settings-tabs" role="tablist" aria-label="קטגוריות הגדרות">
 <button class="settings-tab" id="settings-tab-trip" role="tab" aria-selected="false" aria-controls="settings-view-trip">${icon('route')} טיול</button>
 <button class="settings-tab active" id="settings-tab-maps" role="tab" aria-selected="true" aria-controls="settings-view-maps">${icon('layers-3')} בנק מפות</button>
 <button class="settings-tab" id="settings-tab-home" role="tab" aria-selected="false" aria-controls="settings-view-home">${icon('map-pin')} נקודת פתיחה</button>
 <button class="settings-tab" id="settings-tab-google" role="tab" aria-selected="false" aria-controls="settings-view-google">${icon('scan-eye')} Google</button></div>
 <section id="settings-view-trip" class="settings-view" role="tabpanel" hidden><div class="trip-setup-card"><strong>ברירת מחדל לאמצעי תנועה</strong><div class="field"><label for="trip-default-mode">אמצעי תחבורה בטיול הזה</label><select id="trip-default-mode">${Object.entries(TRAVEL_MODES).map(([k,v])=>`<option value="${k}" ${state.settings.travelMode===k?'selected':''}>${v}</option>`).join('')}</select></div><p class="footnote">רק מקטעים שלא הוגדר להם אמצעי תנועה משלהם יושפעו מהשינוי.</p></div>
 <div class="trip-setup-card"><strong>שעת יציאה ברירת מחדל</strong><div class="field"><label for="trip-default-departure">שעת יציאה לכל יום שלא נקבעה בו שעה ידנית</label><div class="ronny-time-control"><input id="trip-default-departure" class="ronny-time-input" type="text" inputmode="numeric" maxlength="5" autocomplete="off" value="${esc(tripDefaultDepartureTime())}" aria-label="שעת יציאה ברירת מחדל"><button class="ronny-time-trigger" type="button" aria-label="בחר שעת יציאה" title="בחר שעה">${icon('clock','small-icon')}</button></div></div><p class="footnote">ימים עם שעת יציאה או עוגן זמן ידניים לא ישתנו.</p></div>
  <div class="trip-setup-card"><strong>סיום המסלול כולו</strong><label class="ronny-loop-setting"><input type="checkbox" id="trip-round-loop" ${state.settings.tripLoop===true?'checked':''}><span class="ronny-loop-setting-icon">${pointSymbol('loop')}</span><span><strong>טיול מעגלי — חזרה לנקודת היציאה בסוף הטיול</strong><small>הדרך חזרה מחושבת רק אחרי התחנה האחרונה ביום האחרון, אל נקודת היציאה של היום הראשון. שונה מ״יום מעגלי״ שמחזיר בסוף יום מסוים.</small></span></label></div>
 <div class="trip-setup-card"><strong>מרכז המפה של הטיול</strong><div class="two-cols"><div class="field"><label for="trip-center-lat">קו רוחב</label><input id="trip-center-lat" type="number" dir="ltr" min="-90" max="90" step="any" value="${state.settings.startCenter?.lat??mapPrefs.home.lat}"></div><div class="field"><label for="trip-center-lng">קו אורך</label><input id="trip-center-lng" type="number" dir="ltr" min="-180" max="180" step="any" value="${state.settings.startCenter?.lng??mapPrefs.home.lng}"></div></div><div class="field"><label for="trip-center-zoom">רמת זום</label><input id="trip-center-zoom" type="number" min="2" max="19" value="${state.settings.startCenter?.zoom??mapPrefs.home.zoom}"></div><button type="button" class="btn btn-soft" id="trip-use-map-center">${icon('crosshair')} מרכז המפה הנוכחי</button></div></section>
 <section id="settings-view-maps" class="settings-view" role="tabpanel"><div class="api-intro"><strong>בנק המפות של RONNY</strong><p>מפת התצ״א והמפה הטופוגרפית זמינות תמיד במתג שעל המפה. כאן אפשר לבחור איזו מהן תהיה ברירת מחדל.</p></div><div class="map-bank-list" id="map-bank-list"></div><div class="settings-map-preview">שינוי בנק המפות ישפיע על כל הטיולים בדפדפן הזה. ניתן להחזיר כל שכבה בכל עת.</div></section>
 <section id="settings-view-home" class="settings-view" role="tabpanel" hidden><div class="api-intro"><strong>נקודת פתיחה קבועה</strong><p>המפה תיפתח במיקום ובזום שתבחר בכל פתיחה של האתר, גם אם לטיול יש עצירות במקומות אחרים. כפתור ״הצג הכול״ עדיין יציג את המסלול.</p></div>
 <div class="two-cols"><div class="field"><label for="home-lat">קו רוחב</label><input id="home-lat" type="number" dir="ltr" min="-90" max="90" step="any" value="${draftHome.lat}"></div><div class="field"><label for="home-lng">קו אורך</label><input id="home-lng" type="number" dir="ltr" min="-180" max="180" step="any" value="${draftHome.lng}"></div></div>
 <div class="field"><label for="home-zoom">רמת התקרבות (2–19)</label><input id="home-zoom" type="number" min="2" max="19" step="1" value="${draftHome.zoom}"></div>
 <div class="settings-choose"><button type="button" class="btn btn-soft" id="home-use-center">${icon('crosshair')} השתמש במרכז המפה הנוכחית</button><button type="button" class="btn" id="home-select-point">${icon('mouse-pointer-2')} בחר נקודה במפה</button><button type="button" class="btn" id="home-reset">${icon('rotate-ccw')} איפוס</button></div><p class="footnote" id="home-current-caption">נקודת הפתיחה נשמרת לכלל האתר, לא לטיול מסוים.</p></section>
 <section id="settings-view-google" class="settings-view" role="tabpanel" hidden>${googleBody}</section>`;
 openDrawer('הגדרות RONNY','PREFERENCES','בנק מפות, נקודת פתיחה ושירותים אופציונליים',body,`<button class="btn" id="settings-cancel">ביטול</button><button class="btn btn-primary" id="settings-save">${icon('check')} שמירת הגדרות</button>`);
 const activate=which=>{for(const id of ['trip','maps','home','google']){$('settings-view-'+id).hidden=id!==which;$('settings-tab-'+id).classList.toggle('active',id===which);$('settings-tab-'+id).setAttribute('aria-selected',String(id===which))}};
 for(const id of ['trip','maps','home','google'])$('settings-tab-'+id).onclick=()=>activate(id);
 function renderBank(){
  const list=$('map-bank-list');
  list.innerHTML=AVAILABLE_MAP_STYLES.map(k=>`<div class="map-bank-item"><span class="map-bank-name"><strong>${esc(MAP_LABELS[k])}</strong><small>${esc(MAP_DETAILS[k])}</small></span><label class="map-bank-default"><input type="radio" name="map-default" value="${k}" ${defaultStyle===k?'checked':''}> מפה ראשית כברירת מחדל</label></div>`).join('');
  list.querySelectorAll('[name=map-default]').forEach(el=>el.onchange=()=>{defaultStyle=el.value;renderBank()});
 }
 // Display bank choices in current order rather than the fixed catalog order.
 // An up/down button calls renderBank again after reordering.
 renderBank();
 $('trip-use-map-center').onclick=()=>{const c=map?.getCenter()||mapPrefs.home;$('trip-center-lat').value=(+c.lat).toFixed(6);$('trip-center-lng').value=(+c.lng).toFixed(6);$('trip-center-zoom').value=map?.getZoom()||mapPrefs.home.zoom};
 const updateCaption=()=>{$('home-current-caption').textContent=`נקודה: ${Number($('home-lat').value).toFixed(5)}, ${Number($('home-lng').value).toFixed(5)} · זום ${$('home-zoom').value}`};
 ['home-lat','home-lng','home-zoom'].forEach(id=>$(id).addEventListener('input',updateCaption));updateCaption();
 $('home-use-center').onclick=()=>{const c=map?.getCenter()||DEFAULT_HOME;$('home-lat').value=c.lat.toFixed(6);$('home-lng').value=c.lng.toFixed(6);$('home-zoom').value=map?.getZoom()||9;updateCaption();toast('מרכז המפה הועתק לשדות. לחץ שמירת הגדרות כדי לקבוע אותו')};
 $('home-reset').onclick=()=>{$('home-lat').value=DEFAULT_HOME.lat;$('home-lng').value=DEFAULT_HOME.lng;$('home-zoom').value=DEFAULT_HOME.zoom;updateCaption()};
 $('home-select-point').onclick=()=>{const lat=+$('home-lat').value,lng=+$('home-lng').value,z=+$('home-zoom').value;
  if(Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180&&Number.isFinite(z)&&z>=2&&z<=19){mapPrefs.home={lat,lng,zoom:z}}
  if(!draft.includes(defaultStyle))defaultStyle=draft[0];mapPrefs.enabledMaps=draft.slice();mapPrefs.defaultStyle=defaultStyle;
  state.settings.googleKey=$('google-key').value.trim();saveMapPrefs();save();rebuildMapOptions();
  closeDrawer();homePickMode=true;hideContext();updateMapHint();toast('לחץ על המקום במפה שישמש כנקודת פתיחה; הקביעה תישמר אוטומטית')};
 $('google-key-visibility').onclick=()=>{const field=$('google-key');field.type=field.type==='password'?'text':'password';$('google-key-visibility').textContent=field.type==='password'?'הצגת המפתח':'הסתרת המפתח'};
 $('settings-cancel').onclick=closeDrawer;
 $('settings-save').onclick=()=>{const lat=Number($('home-lat').value),lng=Number($('home-lng').value),zoom=Number($('home-zoom').value);
  if(!$('home-lat').value.trim()||!$('home-lng').value.trim()||!$('home-zoom').value.trim()||!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180||!Number.isInteger(zoom)||zoom<2||zoom>19){activate('home');toast('נא להזין נקודת פתיחה חוקית ורמת זום בין 2 ל־19');return}
  const tlat=Number($('trip-center-lat').value),tlng=Number($('trip-center-lng').value),tzoom=Number($('trip-center-zoom').value);
  if(!$('trip-center-lat').value.trim()||!$('trip-center-lng').value.trim()||!$('trip-center-zoom').value.trim()||!Number.isFinite(tlat)||Math.abs(tlat)>90||!Number.isFinite(tlng)||Math.abs(tlng)>180||!Number.isInteger(tzoom)||tzoom<2||tzoom>19){activate('trip');toast('נא להגדיר מרכז מפה חוקי לטיול');return}
  const departureValue=String($('trip-default-departure')?.value||'').trim();
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(departureValue)){activate('trip');toast('נא להזין שעת יציאה בפורמט 24 שעות');return}
  const defaultChanged=departureValue!==tripDefaultDepartureTime();
  state.settings.defaultDepartureTime=departureValue;
  const travelChanged=state.settings.travelMode!==$('trip-default-mode').value;
  state.settings.travelMode=$('trip-default-mode').value;
  const tripLoopChanged=state.settings.tripLoop!==$('trip-round-loop').checked;
  state.settings.tripLoop=$('trip-round-loop').checked;
  if(tripLoopChanged){synchronizeLoopDays();invalidate();retimeAfterOrderChange(state.days.length-1)}
  state.settings.startCenter={lat:tlat,lng:tlng,zoom:tzoom};$('travel-mode').value=state.settings.travelMode;
  if(defaultChanged){applyTripDefaultDeparture();invalidate()}if(travelChanged){invalidate();retimeAfterOrderChange(selectedDay)}
  if(googleMode&&state.settings.googleKey!==$('google-key').value.trim()){ googleMode=false;document.querySelector('.map-pane').classList.remove('google-mode');$('google-coverage-toggle').setAttribute('aria-pressed','false')}
  mapPrefs={enabledMaps:draft.slice(),defaultStyle:defaultStyle,home:{lat,lng,zoom}};
  state.settings.googleKey=$('google-key').value.trim();state.settings.mapStyle=mapPrefs.defaultStyle;saveMapPrefs();rebuildMapOptions();setMapStyle(mapPrefs.defaultStyle,false);save();closeDrawer();if(travelChanged||tripLoopChanged||defaultChanged){renderAll()}toast('הגדרות הטיול והמפות נשמרו')};
 activate(['trip','maps','home','google'].includes(focus)?focus:'trip');
 if(focus==='google')setTimeout(()=>$('google-key')?.focus(),180);
}
// Category tree appears at the exact tapped map location, never in the side drawer.
let contextGroup=null;
function mapTreeMarkup(active){
 return `<div class="map-tree-head"><span class="popup-drag-handle" role="button" tabindex="0" title="גרור כדי להזיז את התפריט" aria-label="ידית לגרירת התפריט">${icon('grip-horizontal','small-icon')}</span><div class="map-tree-head-row"><span>${icon('map-pin','small-icon')} ${planningResolution==='day'?'הוספת נקודה':'הוספת יעד למתאר'}</span><button type="button" class="tree-dismiss" data-tree-close aria-label="סגור">${icon('x','small-icon')}</button></div></div>`+
 `<div class="map-tree-hint">רחף על קטגוריה לבחירה · ${planningResolution==='day'?'יום '+(selectedDay+1):'מתאר הטיול'} · גרור כדי לסדר</div>`+
 pointGroups.map(g=>`<section class="tree-section" data-tree-group="${g.id}"><button type="button" class="tree-group-btn" data-tree-toggle="${g.id}" aria-expanded="${active===g.id}"><span class="tree-group-dot" style="background:${g.color}"></span><strong>${g.label}</strong>${icon('chevron-down','small-icon')}</button><div class="tree-children ${active===g.id?'open':''}">${pointOrder[g.id].filter(type=>endpointChoiceAllowed(type,selectedDay)).map(type=>`<button type="button" class="tree-point" data-tree-type="${type}" draggable="true" style="--point-accent:${types[type].color}"><span class="tree-drag-grip" title="גרור לשינוי סדר" aria-hidden="true">${icon('grip-vertical','small-icon')}</span><span class="tree-point-symbol">${pointSymbol(type)}</span><span>${types[type].name}</span>${icon('plus','small-icon')}</button>`).join('')}</div></section>`).join('')+
 `<div class="tree-quick-points" aria-label="הוספה מהירה ללא ניווט"><button type="button" class="ronny-poi-wide" data-tree-action="poi">${pointSymbol('poi')} נקודת עניין</button><button type="button" data-tree-action="note">${pointSymbol('note')} הערה</button><button type="button" data-tree-action="idea">${pointSymbol('idea')} רעיון</button></div><div class="tree-more-actions"><button type="button" data-tree-action="street">${icon('external-link','small-icon')} Street View</button><button type="button" data-tree-action="photo">${icon('image-plus','small-icon')} תמונה</button></div>`;
}
function showContext(x,y){
 const el=$('map-context');cancelPointTreeHover();el.innerHTML=mapTreeMarkup(contextGroup);
 // Context positions are Leaflet container pixels; map and pane share their origin.
 el.classList.add('open');el.scrollTop=0;
 positionMapPopover(el,{x,y});refreshIcons();
}
function showPointTypeTree(point){
 if(!point||!map)return;hidePointQuick();
 if(planningResolution==='day'&&viewScope==='all'){viewScope='day';$('map-scope').value='day';renderMap();}
 currentContext={lat:+point.lat,lng:+point.lng,name:point.name||''};
 const pixel=map.latLngToContainerPoint([point.lat,point.lng]);
 contextGroup=null;showContext(pixel.x,pixel.y);
}
let cancelPointTreeHover=()=>{};
function hideContext(){cancelPointTreeHover();const el=$('map-context');el.classList.remove('open');contextGroup=null;}
function expandPointTreeGroup(group){
 contextGroup=group;
 const el=$('map-context');
 el.querySelectorAll('[data-tree-group]').forEach(section=>{
  const on=section.dataset.treeGroup===group;
  section.querySelector('.tree-children')?.classList.toggle('open',on);
  section.querySelector('.tree-group-btn')?.setAttribute('aria-expanded',String(on));
 });
 // The tree grows when a branch opens: keep the popup fully inside the map.
 requestAnimationFrame(()=>keepMapPopoverVisible(el));
 setTimeout(()=>keepMapPopoverVisible(el),260);
}
function initPointTree(){
 const el=$('map-context');if(window.L)L.DomEvent.disableClickPropagation(el);
 // Hover intent: incidental pointer passes must not open other groups.
 const HOVER_DELAY_MS=270;
 let hoverTimer=null,hoverSection=null;
 const clearHover=()=>{
  clearTimeout(hoverTimer);hoverTimer=null;
  hoverSection?.classList.remove('hover-pending');hoverSection=null;
 };
 cancelPointTreeHover=clearHover;
 el.addEventListener('pointerover',e=>{
  if(e.pointerType!=='mouse'&&e.pointerType!=='pen')return;
  const section=e.target.closest('[data-tree-group]');
  if(!section||!el.contains(section)||section.contains(e.relatedTarget))return;
  clearHover();
  if(section.dataset.treeGroup===contextGroup||!el.classList.contains('open'))return;
  hoverSection=section;
  section.classList.add('hover-pending');
  hoverTimer=setTimeout(()=>{
   hoverTimer=null;
   if(el.classList.contains('open')&&section.isConnected&&section.matches(':hover')&&!dragging&&!sourceTouch)
    expandPointTreeGroup(section.dataset.treeGroup);
   clearHover();
  },HOVER_DELAY_MS);
 });
 el.addEventListener('pointerout',e=>{
  const section=e.target.closest('[data-tree-group]');
  if(section&&section===hoverSection&&!section.contains(e.relatedTarget))clearHover();
 });
 el.addEventListener('pointerleave',clearHover);

 el.addEventListener('keydown',e=>{const btn=e.target.closest('[data-tree-toggle]');if(btn&&e.key==='ArrowRight'){e.preventDefault();expandPointTreeGroup(btn.dataset.treeToggle)}if(btn&&e.key==='ArrowLeft'){e.preventDefault();expandPointTreeGroup(null)}});

 el.addEventListener('click',e=>{
  const btn=e.target.closest('button');if(!btn)return;
  if(btn.hasAttribute('data-tree-close')){hideContext();return}
  if(btn.dataset.treeToggle){clearHover();const group=btn.dataset.treeToggle;expandPointTreeGroup(contextGroup===group?null:group);return}
  if(btn.dataset.treeType){if(e.target.closest('.tree-drag-grip'))return;const p=currentContext,type=btn.dataset.treeType;hideContext();if(p)createPointAtCurrentLevel(p,type);return}
  if(['poi','note','idea'].includes(btn.dataset.treeAction)){const p=currentContext,type=btn.dataset.treeAction;hideContext();if(p)createPointAtCurrentLevel(p,type);return}
  if(btn.dataset.treeAction==='street'){const p=currentContext;hideContext();if(p)openGoogleStreetView(p.lat,p.lng)}
  if(btn.dataset.treeAction==='photo'){const p=currentContext;hideContext();if(p){photoPlacement={lat:p.lat,lng:p.lng};$('photo-file').click()}}
 });
 const shift=(source,target,after)=>{
  if(!source||!target||source===target||source.closest('[data-tree-group]')!==target.closest('[data-tree-group]'))return;
  const parent=source.parentElement;const positions=[...parent.children].map(el=>({el,box:el.getBoundingClientRect()}));
  if(after)target.after(source);else target.before(source);
  const group=source.closest('[data-tree-group]').dataset.treeGroup;
  pointOrder[group]=[...parent.querySelectorAll('[data-tree-type]')].map(el=>el.dataset.treeType);persistPointOrder();
  positions.forEach(({el,box})=>{const now=el.getBoundingClientRect();const dx=box.left-now.left,dy=box.top-now.top;if((dx||dy)&&el.animate)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:230,easing:'ease-out'})});
 };
 let dragging=null,sourceTouch=null,hoverTouch=null;
 el.addEventListener('dragstart',e=>{clearHover();const source=e.target.closest('[data-tree-type]');if(!source)return;dragging=source;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',source.dataset.treeType);source.classList.add('tree-dragging')});
 el.addEventListener('dragover',e=>{const target=e.target.closest('[data-tree-type]');if(target&&dragging&&target.closest('[data-tree-group]')===dragging.closest('[data-tree-group]')){e.preventDefault();e.dataTransfer.dropEffect='move';target.classList.add('tree-drag-over')}});
 el.addEventListener('dragleave',e=>e.target.closest('[data-tree-type]')?.classList.remove('tree-drag-over'));
 el.addEventListener('drop',e=>{const target=e.target.closest('[data-tree-type]');if(!target||!dragging)return;e.preventDefault();const bottom=e.clientY>target.getBoundingClientRect().top+target.offsetHeight/2;shift(dragging,target,bottom);target.classList.remove('tree-drag-over');dragging.classList.remove('tree-dragging');dragging=null});
 el.addEventListener('dragend',()=>{dragging?.classList.remove('tree-dragging');dragging=null;el.querySelectorAll('.tree-drag-over').forEach(x=>x.classList.remove('tree-drag-over'))});
 el.addEventListener('keydown',e=>{const btn=e.target.closest('[data-tree-type]');if(!btn||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const next=e.key==='ArrowUp'?btn.previousElementSibling:btn.nextElementSibling;if(!next)return;shift(btn,next,e.key==='ArrowDown');btn.focus()});
 el.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;clearHover();const grip=e.target.closest('.tree-drag-grip');if(!grip)return;sourceTouch=grip.closest('[data-tree-type]');sourceTouch.classList.add('tree-dragging');grip.setPointerCapture(e.pointerId);e.preventDefault()});
 el.addEventListener('pointermove',e=>{if(!sourceTouch)return;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-tree-type]');hoverTouch?.classList.remove('tree-drag-over');hoverTouch=target;if(target&&target!==sourceTouch)target.classList.add('tree-drag-over')});
 el.addEventListener('pointerup',e=>{if(!sourceTouch)return;const source=sourceTouch,target=hoverTouch;source.classList.remove('tree-dragging');target?.classList.remove('tree-drag-over');sourceTouch=hoverTouch=null;if(target)shift(source,target,e.clientY>target.getBoundingClientRect().top+target.offsetHeight/2)});
 el.addEventListener('pointercancel',()=>{sourceTouch?.classList.remove('tree-dragging');hoverTouch?.classList.remove('tree-drag-over');sourceTouch=hoverTouch=null});

}
function showPointTypeTreeExpanded(group){const p=currentContext;if(!p)return;const el=$('map-context'),x=parseFloat(el.style.left),y=parseFloat(el.style.top);el.innerHTML=mapTreeMarkup(group);el.style.left=x+'px';el.style.top=y+'px';keepMapPopoverVisible(el);refreshIcons();}

function syncMapBaseSwitch(){
 const wrapper=$('map-base-switch');if(!wrapper)return;
 const selected=state.settings.mapStyle==='topo'?'topo':'satellite';wrapper.dataset.style=selected;
 wrapper.querySelectorAll('[data-map-base]').forEach(btn=>{const current=btn.dataset.mapBase===selected;btn.setAttribute('aria-checked',String(current));btn.tabIndex=current?0:-1});
}
function initMapBaseSwitch(){
 const wrapper=$('map-base-switch');if(!wrapper)return;
 wrapper.querySelectorAll('[data-map-base]').forEach(btn=>{
  btn.onclick=()=>setMapStyle(btn.dataset.mapBase);
  btn.onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();const other=wrapper.querySelector('[data-map-base]:not([aria-checked="true"])');if(other){setMapStyle(other.dataset.mapBase);other.focus()}};
 });syncMapBaseSwitch();
}
function initMapQuickPickers(){
 const dayTrigger=$('map-day-trigger'),dayMenu=$('map-day-menu');initMapBaseSwitch();if(!dayTrigger||!dayMenu)return;
 const close=()=>{dayMenu.hidden=true;dayTrigger.setAttribute('aria-expanded','false')};
 dayTrigger.onclick=()=>{
  if(!dayMenu.hidden){close();return}
  const select=$('map-scope');
  dayMenu.innerHTML=`<div class="map-quick-title">בחירת יום ותצוגה</div>`+
   Array.from(select.options).map(o=>`<button type="button" class="map-quick-choice" role="menuitemradio" aria-checked="${select.value===o.value}" data-map-pick="${esc(o.value)}">${esc(o.textContent)}${select.value===o.value?`<span class="choice-check">${icon('check')}</span>`:''}</button>`).join('')+
   `<div class="map-quick-title">ימי הטיול</div>`+
   state.days.map((d,i)=>`<button type="button" class="map-quick-choice" data-map-day="${i}" aria-current="${selectedDay===i&&viewScope==='day'?'true':'false'}">יום ${i+1} · ${esc(dayDate(i))}${selectedDay===i&&viewScope==='day'?`<span class="choice-check">${icon('check')}</span>`:''}</button>`).join('');
  dayMenu.hidden=false;dayTrigger.setAttribute('aria-expanded','true');refreshIcons();
  dayMenu.querySelectorAll('[data-map-pick]').forEach(option=>option.onclick=()=>{select.value=option.dataset.mapPick;close();select.dispatchEvent(new Event('change',{bubbles:true}))});
  dayMenu.querySelectorAll('[data-map-day]').forEach(option=>option.onclick=()=>{close();selectDay(+option.dataset.mapDay)});
 };
 document.addEventListener('pointerdown',e=>{if(!e.target.closest('#map-quick-views'))close()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')close()});
}

function initMapGroupToggles(){const pane=document.querySelector('.map-pane');
 for(const [id,cls] of [['map-controls-toggle','map-controls-expanded'],['route-card-toggle','route-card-expanded']]){
  const btn=$(id);if(!btn)continue;btn.onclick=()=>{const open=pane.classList.toggle(cls);btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',(open?'הסתר ':'הצג ')+(id==='map-controls-toggle'?'הגדרות תצוגת מפה':id==='map-tools-toggle'?'כלי מפה':'סיכום מסלול'))};
 }
}
// Photon supports search-as-you-type; unlike the public Nominatim endpoint.
let searchDebounce=null,searchController=null,searchSeq=0,searchChoices=[],searchFocus=-1;
const searchCache=new Map();
function hideSearch(){ $('search-results').classList.remove('open');searchFocus=-1;searchChoices=[]; }
function googlePlacesSearchLink(query){return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(query)}
function externalSearchMarkup(query,empty=false){
 return `<div class="search-external">${empty?'<div class="search-help">לא נמצאה התאמה במאגר המקומות הפתוח. מלונות ועסקים מסוימים לא מופיעים בו.</div>':''}<a href="${esc(googlePlacesSearchLink(query))}" target="_blank" rel="noopener noreferrer">${icon('external-link','small-icon')} חיפוש ״${esc(query)}״ ב־Google Maps</a><div class="search-help" style="margin:8px 1px 0">נפתח בטאב נפרד · לא נדרש מפתח API. אפשר להוסיף מקום ידנית על המפה.</div></div>`;
}
function paintSearchResults(choices,query){
 const panel=$('search-results');searchChoices=choices;searchFocus=-1;
 const credit='<div class="search-credit">חיפוש מקומות: Photon · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></div>';
 panel.innerHTML=(choices.length?choices.map((p,i)=>`<button type="button" class="result" data-result="${i}" role="option" aria-selected="false"><span class="search-item-icon">${icon('map-pin','small-icon')}</span><span class="search-item-text"><strong>${esc(p.name)}</strong><small>${esc(p.description||'מיקום במפה')}</small></span>${icon('arrow-up-left','small-icon')}</button>`).join(''):'<div class="search-state">לא נמצאו התאמות במאגר המקומות הפתוח. אפשר להמשיך בחיפוש ב־Google Maps.</div>')+externalSearchMarkup(query,!choices.length)+credit;
 panel.classList.add('open'); panel.querySelectorAll('[data-result]').forEach(b=>b.onclick=()=>selectSearchResult(choices[+b.dataset.result]));refreshIcons();
}
function selectSearchResult(p){
 if(!p)return;
 $('place-search').value=p.name;hideSearch();
 // Intentional zoom after a search is distinct from placing a point (which preserves zoom).
 if(map){map.flyTo([p.lat,p.lng],Math.max(12,map.getZoom()),{duration:.6});map.once('moveend',()=>showPointTypeTree(p));}
 else showPointTypeTree(p);
}
function schedulePlaceSearch(){
 clearTimeout(searchDebounce);searchController?.abort();searchSeq++;
 const q=$('place-search').value.trim();
 if(!q){hideSearch();return}
 const local=state.days.flatMap(d=>d.stops).filter(p=>p.name?.toLocaleLowerCase().includes(q.toLocaleLowerCase())).slice(0,5).map(p=>({name:p.name,description:'נקודה מהטיול שלך',lat:+p.lat,lng:+p.lng}));
 if(q.length<2){if(local.length)paintSearchResults(local,q);else{$('search-results').innerHTML='<div class="search-state">המשך להקליד כדי לראות הצעות למקומות.</div>';$('search-results').classList.add('open')}return}
 searchChoices=[];$('search-results').innerHTML='<div class="search-state search-loading">מחפש מקומות…</div>'+externalSearchMarkup(q);$('search-results').classList.add('open');
 searchDebounce=setTimeout(()=>searchPlaces(q,local),420);
}
async function searchPlaces(overrideQuery=null,local=[]){
 const q=(overrideQuery??$('place-search').value).trim();if(q.length<2)return;
 const seq=++searchSeq;searchController?.abort();searchController=new AbortController();
 try{
  let results=searchCache.get(q.toLowerCase());
  if(!results){
   const near=map?.getCenter();const params=new URLSearchParams({q,limit:'7',lang:'he'});
   if(near){params.set('lat',near.lat.toFixed(5));params.set('lon',near.lng.toFixed(5));}
   const res=await fetch('https://photon.komoot.io/api/?'+params.toString(),{signal:searchController.signal,headers:{Accept:'application/json'}});
   if(!res.ok)throw Error('שירות החיפוש אינו זמין');
   const json=await res.json();
   results=(json.features||[]).filter(f=>f.geometry?.coordinates?.length===2).map(f=>{
    const p=f.properties||{};const name=[p.name,p.housenumber].filter(Boolean).join(' ')||p.street||p.city||'מקום ללא שם';
    const description=[p.street&&p.street!==p.name?p.street:null,p.city,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ');
    return {lat:+f.geometry.coordinates[1],lng:+f.geometry.coordinates[0],name,description};
   });
   // If a full POI name has no matches, retry without local bias and in English.
   if(!results.length&&q.length>=5){
    try{const globalParams=new URLSearchParams({q,limit:'8',lang:'en'});
      const alternate=await fetch('https://photon.komoot.io/api/?'+globalParams,{signal:searchController.signal,headers:{Accept:'application/json'}});
      if(alternate.ok){const alt=await alternate.json();results=(alt.features||[]).filter(f=>f.geometry?.coordinates?.length===2).map(f=>{const p=f.properties||{};return {lat:+f.geometry.coordinates[1],lng:+f.geometry.coordinates[0],name:p.name||p.street||'מקום',description:[p.city,p.state,p.country].filter(Boolean).join(' · ')}})}
    }catch(retryError){if(retryError.name==='AbortError')throw retryError}
   }
   if(searchCache.size>=40)searchCache.delete(searchCache.keys().next().value);
   searchCache.set(q.toLowerCase(),results);
  }
  if(seq!==searchSeq||q!==$('place-search').value.trim())return;
  const unique=new Set();paintSearchResults([...local,...results].filter(p=>{const key=p.name+'|'+p.lat.toFixed(4);if(unique.has(key))return false;unique.add(key);return true}).slice(0,9),q);
 }catch(e){if(e.name==='AbortError'||seq!==searchSeq)return;if(local.length)paintSearchResults(local,q);else{$('search-results').innerHTML='<div class="search-state">שירות החיפוש הפתוח אינו זמין כרגע.</div>'+externalSearchMarkup(q,true);$('search-results').classList.add('open');refreshIcons()}}
}
function searchKeydown(e){
 const items=[...$('search-results').querySelectorAll('[data-result]')];
 if(e.key==='Escape'){if(forcedRelocateSession){cancelForcedRelocate();return}if(forcedPointSession){stopForcedWaypointMode();return}hideSearch();return}
 if(e.key==='ArrowDown'||e.key==='ArrowUp'){
  if(!items.length)return;e.preventDefault();searchFocus=(searchFocus+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;
  items.forEach((x,i)=>{x.classList.toggle('keyboard-active',i===searchFocus);x.setAttribute('aria-selected',String(i===searchFocus))});items[searchFocus].scrollIntoView({block:'nearest'});
 }else if(e.key==='Enter'){
  e.preventDefault();if(searchFocus>=0&&searchChoices[searchFocus])selectSearchResult(searchChoices[searchFocus]);
  else if(searchChoices.length)selectSearchResult(searchChoices[0]);
  else if($('place-search').value.trim().length>=2)searchPlaces();
 }
}
function initMapSelectClickTargets(){
 document.querySelectorAll('.map-select').forEach(box=>{
  const sel=box.querySelector('select');if(!sel)return;
  let display=box.querySelector('.map-select-label');if(!display){display=document.createElement('span');display.className='map-select-label';box.append(display)}
  const update=()=>{display.textContent=sel.options[sel.selectedIndex]?.textContent||''};
  sel.addEventListener('change',update);box.addEventListener('click',e=>{if(e.target!==sel){try{sel.showPicker()}catch(_){sel.focus();sel.click()}}});
  new MutationObserver(update).observe(sel,{childList:true,subtree:true});update();
 });
}
function autoSchedule(){const arr=stops();if(arr.length<2){toast('נדרשות לפחות שתי עצירות ביום');return}retimeAfterOrderChange(selectedDay);save();renderSchedule();renderMarkers();toast(routeLegsForOrder(selectedDay)?'השעות עודכנו לפי משכי הביקור וזמני הדרך':'השעות עודכנו באומדן גס; יתוקנו אוטומטית עם קבלת זמני הדרך')}
function download(filename,content,mime){
 const blob=new Blob([content],{type:mime});const a=document.createElement('a'),url=URL.createObjectURL(blob);
 a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);
 a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
}
async function exportTrip(){
 try{
  const safe=JSON.parse(JSON.stringify(state));
  if(safe.settings){safe.settings.googleKey='';delete safe.settings.mapyKey;}
  const filename='ronny-trip-'+(state.startDate||new Date().toISOString().slice(0,10))+'.json';
  const content=JSON.stringify(safe,null,2);
  if(typeof window.showSaveFilePicker==='function'){
   let handle;
   try{
    handle=await window.showSaveFilePicker({suggestedName:filename,types:[{description:'קובץ גיבוי RONNY (JSON)',accept:{'application/json':['.json']}}]});
   }catch(err){
    if(err?.name==='AbortError')return;
    // Unsupported context/permissions: do not lose the backup; try standard download.
   }
   if(handle){
    const writable=await handle.createWritable();
    try{await writable.write(content);await writable.close();}
    catch(err){try{await writable.abort()}catch{}throw err}
    toast('הקובץ נשמר בשם ובמיקום שבחרת. מפתחות API אינם כלולים.');
    return;
   }
  }
  download(filename,content,'application/json;charset=utf-8');
  toast('הגיבוי הורד. אם לא נפתחה חלונית שמירה בשם, בדוק את תיקיית ההורדות או הפעל בדפדפן בחירת מיקום לכל הורדה.');
 }catch(err){
  console.error('RONNY JSON export failed',err);
  toast('לא ניתן לייצא JSON: '+(err?.message||'שגיאה לא ידועה'));
 }
}

function validateTrip(d){if(!d||typeof d.title!=='string'||!Array.isArray(d.days)||d.days.length<1||d.days.length>100)throw Error('מבנה קובץ לא תקין');for(const day of d.days){day.segments=Array.isArray(day.segments)?day.segments.filter(x=>x&&typeof x.id==='string'&&typeof x.label==='string'&&/^\d{2}:\d{2}$/.test(x.start||'')&&/^\d{2}:\d{2}$/.test(x.end||'')).slice(0,32):[];if(!Array.isArray(day.stops)||day.stops.length>300)throw Error('רשימת עצירות לא תקינה');for(const s of day.stops){if(typeof s.name!=='string'||!Number.isFinite(+s.lat)||!Number.isFinite(+s.lng)||Math.abs(+s.lat)>90||Math.abs(+s.lng)>180)throw Error('קואורדינטות או שמות לא תקינים');s.id=typeof s.id==='string'?s.id:uid();s.type=types[s.type]?s.type:'other';s.time=/^\d{2}:\d{2}$/.test(s.time||'')?s.time:'09:00';s.duration=Math.max(0,Number(s.duration)||0);s.cost=Math.max(0,Number(s.cost)||0);s.notes=String(s.notes||'');s.description=String(s.description||'');if(s.leg){const l=s.leg;if(!l||typeof l!=='object'||!['auto','draw','pencil','straight'].includes(l.mode)||typeof l.fromId!=='string'){delete s.leg}else{s.leg={fromId:l.fromId,mode:l.mode,label:String(l.label||'').slice(0,90),minutes:routeLegMinutes(l),minutesMode:l.minutesMode==='extra'&&l.mode==='auto'?'extra':'total',profile:Object.hasOwn(TRAVEL_MODES,l.profile)?l.profile:null,viaPoints:Array.isArray(l.viaPoints)?l.viaPoints.filter(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(+x))&&Math.abs(+p[0])<=90&&Math.abs(+p[1])<=180).slice(0,16).map(p=>[+p[0],+p[1]]):[],path:Array.isArray(l.path)?l.path.filter(p=>Array.isArray(p)&&p.length===2&&p.every(x=>Number.isFinite(+x))&&Math.abs(+p[0])<=90&&Math.abs(+p[1])<=180).slice(0,120).map(p=>[+p[0],+p[1]]):[]}}}}}if(d.settings){delete d.settings.mapyKey;delete d.settings.routingProvider;}return {...d,photos:Array.isArray(d.photos)?d.photos.filter(p=>p&&typeof p.id==='string'&&validPoint(p)&&typeof p.data==='string'&&/^data:image\/(jpeg|png|webp);base64,/.test(p.data)&&p.data.length<600000).slice(0,120):[],settings:{...state.settings,...d.settings,googleKey:'',mapStyle:normalizeMapStyle(d.settings?.mapStyle),layerVisibility:normalizeLayerVisibility(d.settings?.layerVisibility)}}}
function setRail(name){document.querySelectorAll('.rail-btn').forEach(e=>e.classList.remove('active'));$('rail-'+name)?.classList.add('active')}
function setPlannerCollapsed(flag){
 if(innerWidth<=760){if(!flag)showPlan();else showMap();return}
 document.querySelector('.app').classList.toggle('planner-collapsed',flag);$('planner-ribbon-open')?.setAttribute('aria-expanded',String(!flag));
 $('planner-resizer').setAttribute('aria-label',flag?'פתח את פאנל התכנון; גרור כדי לשנות רוחב':'סגור את פאנל התכנון; גרור כדי לשנות רוחב');
 try{localStorage.setItem('ronny-planner-collapsed-v1',flag?'true':'false')}catch(e){}
 if(!flag)setRail('plan');else setRail(null);
 setTimeout(()=>{map?.invalidateSize();if(googleMode&&window.google&&googleMap)google.maps.event.trigger(googleMap,'resize')},360);
}
function showPlan(){const open=innerWidth<=760?$('planner').classList.contains('show-mobile'):!document.querySelector('.app').classList.contains('planner-collapsed');closeDrawer();if(innerWidth<=760){$('planner').classList.toggle('show-mobile',!open);setRail(open?null:'plan')}else{setPlannerCollapsed(open);if(!open)$('planner').scrollTop=0}}
function showMap(){closeDrawer();if(innerWidth<=760){$('planner').classList.remove('show-mobile');setRail(null)}else setPlannerCollapsed(true);setTimeout(()=>map?.invalidateSize(),260)}

function ronnyBudgetExpenses(){
 if(!Array.isArray(state.extraExpenses))state.extraExpenses=[];
 return state.extraExpenses;
}
function ronnyBudgetAmount(value){
 if(String(value).trim()==='')return null;
 const n=Number(value);
 return Number.isFinite(n)&&n>=0&&n<=1e9?Math.round(n*100)/100:null;
}
function ronnyBudgetDayOptions(chosen){
 return '<option value="">כל הטיול (הוצאה כללית)</option>'+state.days.map((day,i)=>
  '<option value="'+esc(day.dayId)+'"'+(chosen===day.dayId?' selected':'')+'>יום '+(i+1)+' · '+esc(day.label||'')+'</option>'
 ).join('');
}
function ronnyBudgetModel(){
 const expenses=ronnyBudgetExpenses();
 const byDay=state.days.map((day,i)=>({
  i,dayId:day.dayId,
  total:(day.stops||[]).reduce((total,stop)=>total+(Number(stop.cost)||0),0)+
   expenses.filter(item=>item.dayId===day.dayId).reduce((total,item)=>total+item.amount,0)
 }));
 const general=expenses.filter(item=>!byDay.some(day=>day.dayId===item.dayId))
  .reduce((sum,item)=>sum+item.amount,0);
 return {byDay,general,total:byDay.reduce((sum,day)=>sum+day.total,0)+general};
}
function ronnyBudgetMarkup(){
 const expenses=ronnyBudgetExpenses();
 const {byDay,general,total}=ronnyBudgetModel();
 const peak=Math.max(1,...byDay.map(day=>day.total));
 return '<div class="ronny-budget-summary">'+
  '<span>סך עלויות מתוכננות</span><strong data-budget-total>'+money(total)+'</strong>'+
  '<small>עלויות מנקודות המסלול והוצאות שהוספת בעצמך. לא מתבצע אומדן מחירים אוטומטי.</small></div>'+
  '<section class="ronny-expenses" aria-labelledby="budget-expenses-title">'+
  '<h3 id="budget-expenses-title">הוצאות חופשיות</h3>'+
  '<p class="ronny-budget-hint">אפשר להוסיף כל הוצאה, למשל רכב, דלק, חניה או ביטוח, בלי ליצור נקודת מסלול.</p>'+
  '<div class="ronny-expenses-list">'+(expenses.map(item=>
   '<div class="ronny-expense-row" data-budget-row="'+esc(item.id)+'">'+
   '<div class="ronny-expense-pair"><label>שם ההוצאה<input type="text" data-budget-field="name" required maxlength="90" value="'+esc(item.name)+'" aria-label="שם ההוצאה"></label>'+
   '<label>סכום (₪)<input type="number" data-budget-field="amount" min="0" max="1000000000" step="0.01" required value="'+item.amount+'" aria-label="סכום ההוצאה"></label></div>'+
   '<div class="ronny-expense-pair"><label>שיוך ליום<select data-budget-field="dayId" aria-label="יום ההוצאה">'+ronnyBudgetDayOptions(item.dayId)+'</select></label>'+
   '<button type="button" data-budget-delete aria-label="מחק הוצאה '+esc(item.name)+'" title="מחק הוצאה">'+icon('trash-2','small-icon')+' מחיקה</button></div></div>'
  ).join('')||'<p class="ronny-budget-empty">עדיין לא הוספת הוצאות חופשיות.</p>')+'</div>'+
  '<form id="ronny-expense-add" class="ronny-expense-add">'+
  '<div class="ronny-expense-pair"><label>הוצאה חדשה<input name="name" type="text" maxlength="90" placeholder="למשל השכרת רכב" required></label>'+
  '<label>סכום (₪)<input name="amount" type="number" min="0" max="1000000000" step="0.01" placeholder="0" required></label></div>'+
  '<label>שיוך ליום<select name="dayId">'+ronnyBudgetDayOptions('')+'</select></label>'+
  '<button class="btn btn-soft" type="submit">'+icon('plus-circle','small-icon')+' הוסף הוצאה</button></form></section>'+
  '<section class="ronny-budget-days" aria-labelledby="budget-days-title"><h3 id="budget-days-title">חלוקה לפי ימים</h3>'+
  byDay.map(day=>'<div class="ronny-budget-day"><div><strong>יום '+(day.i+1)+'</strong><span>'+money(day.total)+'</span></div>'+
   '<div class="ronny-budget-track"><div style="width:'+Math.min(100,Math.max(0,day.total/peak*100))+'%"></div></div></div>').join('')+
  (general>0?'<p class="ronny-budget-general">הוצאות כלליות שאינן משויכות ליום: <strong>'+money(general)+'</strong></p>':'')+
  '</section>';
}
function ronnyBudgetBind(){
 const container=$('drawer-body');
 const add=container.querySelector('#ronny-expense-add');
 if(!add)return;
 const redraw=()=>{
  const current=container.scrollTop;
  container.innerHTML=ronnyBudgetMarkup();
  container.scrollTop=current;
  ronnyBudgetBind();refreshIcons();
 };
 add.addEventListener('submit',event=>{
  event.preventDefault();
  if(!add.reportValidity())return;
  const name=add.elements.namedItem('name').value.trim().slice(0,90);
  const amount=ronnyBudgetAmount(add.elements.namedItem('amount').value);
  if(!name||amount===null){toast('נא להזין שם וסכום תקין');return}
  const dayId=add.elements.namedItem('dayId').value||null;
  ronnyBudgetExpenses().push({id:uid(),name,amount,
   dayId:state.days.some(day=>day.dayId===dayId)?dayId:null});
  save();redraw();
  container.querySelector('#ronny-expense-add [name="name"]')?.focus();
 });
 container.querySelectorAll('[data-budget-row]').forEach(row=>{
  const id=row.dataset.budgetRow;
  const getItem=()=>ronnyBudgetExpenses().find(item=>item.id===id);
  row.querySelectorAll('[data-budget-field]').forEach(field=>field.addEventListener('change',()=>{
   const item=getItem();if(!item)return;
   if(!field.reportValidity())return;
   if(field.dataset.budgetField==='name'){
    const value=field.value.trim().slice(0,90);
    if(!value){field.setCustomValidity('יש להזין שם להוצאה');field.reportValidity();return}
    field.setCustomValidity('');item.name=value;
   }else if(field.dataset.budgetField==='amount'){
    const value=ronnyBudgetAmount(field.value);
    if(value===null){field.setCustomValidity('יש להזין סכום תקין');field.reportValidity();return}
    field.setCustomValidity('');item.amount=value;
   }else{
    item.dayId=state.days.some(day=>day.dayId===field.value)?field.value:null;
   }
   save();redraw();
  }));
  row.querySelector('[data-budget-delete]')?.addEventListener('click',()=>{
   const index=ronnyBudgetExpenses().findIndex(item=>item.id===id);
   if(index<0)return;
   ronnyBudgetExpenses().splice(index,1);save();redraw();
  });
 });
}
function showBudget(){
 openDrawer('סקירת תקציב','BUDGET','סיכום התכנון הכספי של הטיול',
  ronnyBudgetMarkup(),'<button class="btn btn-primary" id="budget-close">סיום</button>');
 $('budget-close').onclick=closeDrawer;
 ronnyBudgetBind();
}
function showLodging(){const hotels=state.days.flatMap((d,i)=>{const end=(d.stops||[]).filter(s=>s.type==='hotel'||(s.type==='end'&&!(d.loop&&s.autoLoopEnd)));const start=d.loop?(d.stops||[]).find(s=>s.type==='start'):null;return [...(start?[start]:[]),...end].map(s=>({...s,day:i,ronnyCombined:!!(d.loop&&s===start)}))});const body=`<p class="footnote">רשימת המקומות שהוגדרו כלינה. לחץ על מלון כדי לערוך פרטי הזמנה, תאריכים והערות.</p>${hotels.map(s=>`<button data-lodge="${esc(s.id)}" style="width:100%;display:flex;align-items:center;gap:12px;text-align:right;border:1px solid #e5eef1;padding:15px;border-radius:13px;background:white;margin-bottom:12px;cursor:pointer"><span class="ronny-lodge-symbol">${pointSymbol(s.ronnyCombined?'loop':pointTypeAlias(s.type))}</span><span style="flex:1"><strong style="display:block">${esc(s.ronnyCombined?'נקודת התחלה/סיום יום '+(s.day+1):s.type==='end'?'נקודת סיום יום '+(s.day+1):s.name)}</strong>${!ronnyIsAutoEndpointName(s.name)&&s.type!=='hotel'?`<small class="ronny-lodge-place">${esc(s.name)}</small>`:''}<small style="color:#8194a0">יום ${s.day+1} · ${esc(dayDate(s.day))}</small></span><strong>${money(s.cost)}</strong></button>`).join('')||'<div class="no-stops"><strong>לא הוגדרו מקומות לינה</strong><p>הוסף נקודה מסוג לינה כדי לרכז כאן את מקומות האירוח.</p></div>'}`;openDrawer('מקומות לינה','ACCOMMODATION','כל הלינות לאורך המסלול',body,`<button class="btn btn-primary" id="new-lodge">${icon('plus')} הוספת לינה</button>`);$('new-lodge').onclick=()=>openStopForm(null,null,'end');$('drawer-body').querySelectorAll('[data-lodge]').forEach(b=>b.onclick=()=>openPointQuick(b.dataset.lodge))}
/* RONNY version history is loaded from PATCH NOTES JSON files in the deployment. */
const RONNY_PATCH_INDEX_URL='./PATCH%20NOTES/index.json';
let ronnyPatchNotesCache=null;
let ronnyPatchNotesPromise=null;
