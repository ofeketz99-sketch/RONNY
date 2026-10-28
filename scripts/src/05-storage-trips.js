function openLibraryDB(){return new Promise((resolve,reject)=>{
 if(!window.indexedDB){reject(Error('IndexedDB לא זמין'));return}
 const req=indexedDB.open(LIB_DB,1);
 req.onupgradeneeded=()=>{const database=req.result;if(!database.objectStoreNames.contains(LIB_STORE))database.createObjectStore(LIB_STORE,{keyPath:'id'})};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('פתיחת הספרייה נכשלה'));
 req.onblocked=()=>reject(Error('מסד הנתונים נעול בטאב אחר'));
})}
function transact(method,record){return new Promise((resolve,reject)=>{
 if(!db)return reject(Error('מסד הנתונים אינו זמין'));
 const tx=db.transaction(LIB_STORE,method==='getAll'?'readonly':'readwrite');
 const store=tx.objectStore(LIB_STORE);let req;
 if(method==='getAll')req=store.getAll();else if(method==='delete')req=store.delete(record);else req=store.put(record);
 let output;req.onsuccess=()=>{output=req.result};req.onerror=()=>reject(req.error||Error('שמירת טיול נכשלה'));
 tx.oncomplete=()=>resolve(output);tx.onerror=()=>reject(tx.error||Error('פעולת שמירה נכשלה'));tx.onabort=()=>reject(tx.error||Error('פעולת שמירה בוטלה'));
})}
function fallbackRead(){try{return JSON.parse(localStorage.getItem(LIB_FALLBACK)||'[]')}catch(e){return []}}
async function getStoredTrips(){return usingFallback?fallbackRead():await transact('getAll')}
async function putTrip(record){if(usingFallback){const all=Array.from(library.values());localStorage.setItem(LIB_FALLBACK,JSON.stringify(all));return}await transact('put',record)}
async function deleteTrip(id){if(usingFallback){localStorage.setItem(LIB_FALLBACK,JSON.stringify(Array.from(library.values())));return}await transact('delete',id)}
function libraryRecord(){return {id:activeTripId,title:state.title||'טיול ללא שם',startDate:state.startDate||'',updatedAt:Date.now(),trip:cloneValue(state)}}
function ronnyLocalSaveStatus(kind='saved'){
 const el=document.getElementById('ronny-local-save-status');if(!el)return;
 const text={saving:'שומר בדפדפן...',saved:'נשמר בדפדפן זה',error:'שמירה נכשלה · ייצא גיבוי'};
 el.dataset.status=kind;el.querySelector('.ronny-local-save-label').textContent=text[kind]||text.saved;
}
function save(){
 if(!libraryReady||!activeTripId)return;
 ronnyLocalSaveStatus('saving');
 const walkingUpdated=state.days.some(day=>syncWalkingLoops(day));const loopsUpdated=synchronizeLoopDays();if(loopsUpdated||walkingUpdated)invalidate();
 ensureStableViaColors();
 const record=libraryRecord();library.set(record.id,record);
 try{localStorage.setItem(LIB_ACTIVE,record.id)}catch(e){}
 // Capture each immutable snapshot now, in order, to prevent cross-trip overwrites.
 saveQueue=saveQueue.catch(()=>{}).then(()=>putTrip(record)).then(()=>{lastSaveError=false;ronnyLocalSaveStatus('saved');return true}).catch(e=>{lastSaveError=true;ronnyLocalSaveStatus('error');toast('לא ניתן לשמור את הטיול. בצע ייצוא JSON לגיבוי. '+(e.name==='QuotaExceededError'?'האחסון מלא.':''));return false});
}
async function initTripLibrary(){
 try{db=await openLibraryDB()}catch(e){usingFallback=true}
 let records=[];try{records=await getStoredTrips()}catch(e){usingFallback=true;records=fallbackRead()}
 records.filter(r=>r&&r.id&&r.trip).forEach(r=>library.set(r.id,r));
 if(!library.size){
  let first=demo();
  try{const legacy=localStorage.getItem('roam-trip-v2');if(legacy)first=prepareTrip(JSON.parse(legacy))}catch(e){first=demo()}
  activeTripId=uid();state=prepareTrip(first);libraryReady=true;save();await saveQueue;
 }else{
  const savedId=(()=>{try{return localStorage.getItem(LIB_ACTIVE)}catch(e){return null}})();
  let record=library.get(savedId);if(!record)record=Array.from(library.values()).sort((a,b)=>b.updatedAt-a.updatedAt)[0];
  activeTripId=record.id;state=prepareTrip(record.trip);libraryReady=true;ronnyLocalSaveStatus('saved');
  try{localStorage.setItem(LIB_ACTIVE,activeTripId)}catch(e){}
 }
}
function freshTrip(){const date=new Date();return {version:3,outline:{points:[],stagePlan:{}},title:'הטיול החדש שלי',startDate:[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'),settings:{...state.settings,mapStyle:mapPrefs.defaultStyle,startCenter:{...mapPrefs.home}},photos:[],days:[{label:'יום 1',stops:[],segments:[]}]}}
function tripMapPositions(){
 const points=[];
 const add=p=>{if(validPoint(p))points.push([+p.lat,+p.lng])};
 (state.outline?.points||[]).forEach(add);
 (state.days||[]).forEach(day=>(day.stops||[]).forEach(add));
 return points;
}
function fitWholeTrip(){
 if(!map||!window.L)return;
 const coords=tripMapPositions();
 if(!coords.length){const c=state.settings.startCenter||mapPrefs.home;if(c)map.setView([+c.lat,+c.lng],+c.zoom||9);return}
 if(coords.length===1){map.flyTo(coords[0],Math.min(12,map.getMaxZoom?.()||12),{duration:.55});return}
 // Use ALL days and macro waypoints, not just the day currently selected.
 map.fitBounds(L.latLngBounds(coords),{paddingTopLeft:[92,96],paddingBottomRight:[90,98],maxZoom:12,animate:true,duration:.65});
}
let wholeTripFocusSeq=0;
function focusLoadedTrip(){if(!map)return;map.invalidateSize({pan:false});fitWholeTrip()}
function queueWholeTripFocus(){
 const seq=++wholeTripFocusSeq;
 const run=()=>{if(seq!==wholeTripFocusSeq||!map)return;focusLoadedTrip()};
 requestAnimationFrame(()=>requestAnimationFrame(run));
 setTimeout(run,340);
}
function applyCurrentTrip(){
 if(drawLegSession)stopLegDrawing();closeLegEditor();
 resetPlannerBulk();state=prepareTrip(state);if(+state.settings.railWidth===72)state.settings.railWidth=54;const detailedPoints=(state.days||[]).some(d=>(d.stops||[]).some(validPoint));planningResolution=detailedPoints?'day':(['outline','stage'].includes(state.settings.planningResolution)?'outline':'day');selectedOutlineId=null;selectedStageId=null;outlineAddArmed=false;selectedDay=0;selectedStop=null;viewScope='all';invalidate();pendingRetimes.clear();scheduleQuality.clear();repairExistingSchedules();restorePlannerUpperHeight();
 if(googleMode){googleMode=false;document.querySelector('.map-pane').classList.remove('google-mode');$('google-coverage-toggle').setAttribute('aria-pressed','false')}
 $('map-scope').value=viewScope;$('trip-name').value=state.title;$('start-date').value=state.startDate;
 $('travel-mode').value=state.settings.travelMode;rebuildMapOptions();document.documentElement.style.setProperty('--rail-width',(+state.settings.railWidth||54)+'px');
 document.documentElement.style.setProperty('--planner-width',(+state.settings.plannerWidth||430)+'px');
 document.documentElement.style.setProperty('--drawer-width',(+state.settings.drawerWidth||440)+'px');
 setMapStyle(state.settings.mapStyle,false);renderAll();
 // Selection always shows every day. Fit after the drawer closes and Leaflet has resized.
 queueWholeTripFocus()
}
async function saveTripExplicitly(){save();const ok=await saveQueue;if(ok)toast('הטיול נשמר בספריית RONNY')}
let newTripSetupDraft=null;
async function finishNewTripSetup(draft){
 if(!draft||!['driving','walking','hiking','cycling'].includes(draft.travelMode))return;
 const lat=Number(draft.lat),lng=Number(draft.lng),zoom=Number(draft.zoom);
 if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lng)||Math.abs(lng)>180||!Number.isInteger(zoom)||zoom<2||zoom>19){toast('נא לבחור נקודת מרכז תקינה וזום בין 2 ל־19');return}
 await saveQueue;const trip=freshTrip();trip.title=draft.title?.trim()||'הטיול החדש שלי';trip.settings.travelMode=draft.travelMode;trip.settings.planningResolution=draft.planningResolution==='day'?'day':'outline';trip.settings.startCenter={lat,lng,zoom};
 state=prepareTrip(trip);activeTripId=uid();newTripSetupDraft=null;save();applyCurrentTrip();closeDrawer();toast('הטיול נוצר עם הגדרות המסלול ומרכז המפה שבחרת');
}
function createTrip(draft=null){
 const c=map?.getCenter()||mapPrefs.home;
 const initial=draft||{title:'הטיול החדש שלי',travelMode:state.settings.travelMode||'driving',planningResolution:'outline',lat:+c.lat.toFixed(6),lng:+c.lng.toFixed(6),zoom:map?.getZoom()||mapPrefs.home.zoom};
 const body=`<p class="trip-setup-intro">קבע את הגדרות הטיול. לכל מקטע דרך אפשר לשנות את אמצעי התנועה בנפרד.</p>
 <div class="trip-setup-card"><strong>פרטי הטיול</strong><div class="field"><label for="new-trip-title">שם הטיול</label><input id="new-trip-title" maxlength="64" value="${esc(initial.title||'הטיול החדש שלי')}"></div>
 <div class="field"><label for="new-trip-resolution">איך מתחילים לתכנן?</label><select id="new-trip-resolution"><option value="outline" ${initial.planningResolution!=='day'?'selected':''}>מתאר כללי ללא שעות — מומלץ לטיולים ארוכים</option><option value="day" ${initial.planningResolution==='day'?'selected':''}>תכנון יומי מפורט</option></select></div><div class="field"><label for="new-trip-mode">ברירת מחדל לניווט</label><select id="new-trip-mode">${Object.entries(TRAVEL_MODES).map(([k,v])=>`<option value="${k}" ${initial.travelMode===k?'selected':''}>${v}</option>`).join('')}</select></div></div>
 <div class="trip-setup-card"><strong>מרכז המפה בעת פתיחת הטיול</strong>
 <div class="two-cols"><div class="field"><label for="new-trip-lat">קו רוחב</label><input type="number" id="new-trip-lat" step="any" min="-90" max="90" dir="ltr" value="${initial.lat}"></div><div class="field"><label for="new-trip-lng">קו אורך</label><input type="number" id="new-trip-lng" step="any" min="-180" max="180" dir="ltr" value="${initial.lng}"></div></div>
 <div class="field"><label for="new-trip-zoom">רמת זום</label><input type="number" id="new-trip-zoom" min="2" max="19" step="1" value="${initial.zoom}"></div>
 <div class="settings-choose"><button type="button" class="btn btn-soft" id="new-trip-current">${icon('crosshair')} מרכז המפה הנוכחי</button><button type="button" class="btn" id="new-trip-pick">${icon('mouse-pointer-2')} בחר נקודה במפה</button></div></div>`;
 openDrawer('טיול חדש','NEW TRIP','הגדרות ראשוניות',body,`<button type="button" class="btn" id="new-trip-cancel">ביטול</button><button type="button" class="btn btn-primary" id="new-trip-confirm">${icon('check')} צור טיול</button>`);
 const grab=()=>({title:$('new-trip-title').value,travelMode:$('new-trip-mode').value,planningResolution:$('new-trip-resolution').value,lat:$('new-trip-lat').value,lng:$('new-trip-lng').value,zoom:$('new-trip-zoom').value});
 $('new-trip-cancel').onclick=()=>{newTripSetupDraft=null;closeDrawer()};
 $('new-trip-current').onclick=()=>{const cp=map?.getCenter()||mapPrefs.home;$('new-trip-lat').value=(+cp.lat).toFixed(6);$('new-trip-lng').value=(+cp.lng).toFixed(6);$('new-trip-zoom').value=map?.getZoom()||mapPrefs.home.zoom};
 $('new-trip-pick').onclick=()=>{newTripSetupDraft=grab();closeDrawer();updateMapHint();toast('לחץ על נקודה במפה כדי לקבוע את מרכז הטיול החדש. Esc לביטול')};
 $('new-trip-confirm').onclick=()=>finishNewTripSetup(grab());
}

async function selectTrip(id){
 if(id===activeTripId){await saveQueue;closeDrawer();applyCurrentTrip();return}
 await saveQueue;const rec=library.get(id);if(!rec){toast('הטיול לא נמצא');return}
 activeTripId=id;state=cloneValue(rec.trip);try{localStorage.setItem(LIB_ACTIVE,id)}catch(e){};
 closeDrawer();applyCurrentTrip();toast('הטיול נטען מהספרייה — אפשר להמשיך לערוך')
}
async function duplicateTrip(id){
 await saveQueue;const from=library.get(id);if(!from)return;
 const trip=prepareTrip(from.trip);trip.title=(trip.title||'טיול')+' — עותק';activeTripId=uid();state=trip;save();applyCurrentTrip();closeDrawer();toast('עותק עצמאי נוסף לספרייה')
}
async function removeTrip(id){
 const rec=library.get(id);if(!rec)return;if(!await confirmOnMap('למחוק לצמיתות את "'+rec.title+'" מהספרייה המקומית? מומלץ לייצא גיבוי קודם.',{title:'מחיקת טיול',accept:'מחק טיול'}))return;
 await saveQueue;library.delete(id);
 try{await deleteTrip(id)}catch(e){library.set(id,rec);toast('מחיקת הטיול נכשלה');return}
 if(id===activeTripId){const next=Array.from(library.values()).sort((a,b)=>b.updatedAt-a.updatedAt)[0];if(next){activeTripId=next.id;state=cloneValue(next.trip);try{localStorage.setItem(LIB_ACTIVE,activeTripId)}catch(e){};applyCurrentTrip()}else{activeTripId=uid();state=prepareTrip(freshTrip());save();applyCurrentTrip()}}
 showLibrary();toast('הטיול נמחק מהספרייה')
}
async function renameSavedTrip(id,value){
 const next=String(value||'').trim().slice(0,64);
 if(!next){toast('יש להזין שם לטיול');return false}
 await saveQueue;
 const record=library.get(id);if(!record){toast('הטיול לא נמצא');return false}
 if(record.title===next){showLibrary();return true}
 const updated={...record,title:next,updatedAt:Date.now(),trip:{...record.trip,title:next}};
 const previous=record;
 if(id===activeTripId){
  state.title=next;$('trip-name').value=next;
  save();const ok=await saveQueue;
  if(!ok){state.title=previous.title;$('trip-name').value=previous.title;return false}
 }else{
  library.set(id,updated);
  try{await putTrip(updated)}catch(e){library.set(id,previous);toast('שמירת השם נכשלה');return false}
 }
 showLibrary();toast('שם הטיול נשמר');return true;
}
const tripExpandedIds=new Set(),tripSelectedIds=new Set();
async function deleteSelectedTrips(){
 const ids=[...tripSelectedIds].filter(id=>library.has(id));
 if(!ids.length){toast('לא נבחרו טיולים');return}
 if(!await confirmOnMap('למחוק '+ids.length+' טיולים מסומנים מהספרייה המקומית? פעולה זו אינה ניתנת לביטול.',{title:'מחיקת טיולים מסומנים',accept:'מחק '+ids.length+' טיולים'}))return;
 await saveQueue;
 for(const id of ids){const old=library.get(id);library.delete(id);try{await deleteTrip(id)}catch(e){library.set(id,old);toast('חלק מהטיולים לא נמחקו')}}
 tripSelectedIds.clear();
 if(!library.has(activeTripId)){const next=[...library.values()].sort((a,b)=>b.updatedAt-a.updatedAt)[0];if(next){activeTripId=next.id;state=prepareTrip(next.trip)}else{activeTripId=uid();state=prepareTrip(freshTrip());save()}try{localStorage.setItem(LIB_ACTIVE,activeTripId)}catch(e){}applyCurrentTrip()}
 showLibrary();toast('המחיקה הושלמה');
}
function showTransferCenter(){
 const body=`<p class="footnote">ייבוא גיבוי JSON מוסיף טיול לספרייה בלי למחוק טיולים קיימים. קובצי Google Takeout מיועדים לספריית המקומות ונקלטים במסלול נפרד.</p><div class="ronny-transfer-options"><button type="button" class="ronny-transfer-action" id="import-btn">${icon('upload')} <span><strong>ייבוא טיול מגיבוי JSON</strong><small>בחר קובץ .json שייצאת מ־RONNY</small></span></button><button type="button" class="ronny-transfer-action" id="export-btn">${icon('download')} <span><strong>ייצוא וגיבוי</strong><small>שמירת קובץ JSON במחשב</small></span></button><button type="button" class="ronny-transfer-action ronny-import-google" id="import-google-btn">${icon('map-pin')} <span><strong>ייבוא רשימות Google Takeout</strong><small>קובצי ZIP או CSV אל ספריית המקומות</small></span></button></div>`;
 openDrawer('ייבוא וייצוא','TRIP DATA','פעולות גיבוי וטעינה',body,`<button type="button" class="btn" id="transfer-close">${icon('check','small-icon')} סיום</button>`);
 $('import-btn').onclick=()=>$('import-file').click();
 $('import-google-btn').onclick=()=>{showSavedPlaceLibrary();setRail('saved-places')};
 $('export-btn').onclick=exportTrip;
 $('transfer-close').onclick=closeDrawer;
 refreshIcons();
}
function showLibrary(){
 const items=Array.from(library.values()).sort((a,b)=>b.updatedAt-a.updatedAt);
 const count=items.length;
 const html=`<div class="api-intro"><strong>הטיולים שלי — ${count} ${count===1?'טיול':'טיולים'}</strong><p>כל טיול נשמר בנפרד בדפדפן. פתיחת טיול מתאימה אוטומטית את המפה לכל המסלול.</p></div>
 <div class="ronny-library-toolbar" role="toolbar" aria-label="פעולות ספריית הטיולים"><button type="button" data-trip-bulk="all">בחר הכול</button><button type="button" data-trip-bulk="none">בטל בחירה</button><button type="button" data-trip-bulk="expand">פתח הכול</button><button type="button" data-trip-bulk="collapse">סגור הכול</button><button type="button" class="ronny-bulk-danger" data-trip-bulk="delete">מחק נבחרים</button></div>
 <div class="library-list">${items.map(r=>{const trip=r.trip||{},days=trip.days||[],stops=days.reduce((n,d)=>n+(d.stops?.length||0),0),current=r.id===activeTripId,expanded=tripExpandedIds.has(r.id);return `<article class="library-item ronny-entity ${current?'current':''} ${expanded?'expanded':'is-collapsed'}" data-trip-card="${esc(r.id)}" role="button" tabindex="0" aria-label="פתח את הטיול ${esc(r.title)}"><label class="ronny-trip-check" title="בחירת טיול לפעולות מרוכזות"><input type="checkbox" data-trip-select="${esc(r.id)}" ${tripSelectedIds.has(r.id)?'checked':''} aria-label="בחר טיול ${esc(r.title)}"></label><button type="button" class="ronny-trip-toggle" data-trip-open="${esc(r.id)}" aria-label="פתח את הטיול ${esc(r.title)}"><span class="library-icon">${icon('map-pinned')}</span><span class="ronny-trip-summ"><strong title="${esc(r.title)}">${esc(r.title)}</strong><small>${days.length} ימים · ${stops} נקודות</small></span></button><button type="button" class="ronny-trip-expand" data-trip-toggle="${esc(r.id)}" aria-expanded="${expanded}" aria-label="${expanded?'סגור פרטי טיול':'הצג פרטי טיול'}" title="הצג או הסתר פרטים">${icon(expanded?'chevron-up':'chevron-down','small-icon')}</button><div class="library-info"><div class="library-rename-editor ronny-rename-row" data-rename-editor="${esc(r.id)}" hidden><input data-rename-input="${esc(r.id)}" maxlength="64" aria-label="שם חדש לטיול" value="${esc(r.title)}"><button type="button" data-rename-save="${esc(r.id)}" title="שמור שם טיול">${icon('check','small-icon')}</button></div>${current?'<span class="library-current-label">טיול פתוח כעת</span>':''}<small>תחילה: ${esc(r.startDate||'לא נקבע')}</small><small>עודכן: ${new Date(r.updatedAt||Date.now()).toLocaleString('he-IL',{dateStyle:'short',timeStyle:'short'})}</small></div><div class="library-actions"><button class="btn ${current?'btn-soft':'btn-primary'}" data-trip-open="${esc(r.id)}">${icon(current?'check':'folder-open')} ${current?'פתוח':'פתח והמשך'}</button><button class="btn" data-trip-rename="${esc(r.id)}">${icon('pencil')} שנה שם</button><button class="btn" data-trip-copy="${esc(r.id)}">${icon('copy')} שכפל</button><button class="btn" style="color:#b64b58" data-trip-delete="${esc(r.id)}">${icon('trash-2')} מחק</button></div></article>`}).join('')}</div><p class="footnote" style="margin-top:14px">השמירה מתבצעת אוטומטית במכשיר הנוכחי בלבד. ליצירת גיבוי השתמש בייצוא JSON.</p>`;
 openDrawer('ספריית הטיולים','MY TRIPS','טענת טיול להמשך עבודה או יצירת טיול חדש',html,`<button class="btn" id="library-export">${icon('download')} גיבוי הטיול הנוכחי</button><button class="btn btn-primary" id="library-new">${icon('plus')} טיול חדש</button>`);
 $('library-new').onclick=()=>createTrip();$('library-export').onclick=exportTrip;
 $('drawer-body').querySelectorAll('[data-trip-select]').forEach(el=>el.onchange=()=>{el.checked?tripSelectedIds.add(el.dataset.tripSelect):tripSelectedIds.delete(el.dataset.tripSelect)});
 $('drawer-body').querySelectorAll('[data-trip-toggle]').forEach(btn=>btn.onclick=()=>{const id=btn.dataset.tripToggle;tripExpandedIds.has(id)?tripExpandedIds.delete(id):tripExpandedIds.add(id);const card=btn.closest('[data-trip-card]'),opened=tripExpandedIds.has(id);card?.classList.toggle('is-collapsed',!opened);card?.classList.toggle('expanded',opened);btn.setAttribute('aria-expanded',String(opened));btn.querySelector('svg')?.remove();btn.insertAdjacentHTML('beforeend',icon(opened?'chevron-up':'chevron-down','small-icon'));refreshIcons()});
 $('drawer-body').querySelectorAll('[data-trip-bulk]').forEach(btn=>btn.onclick=()=>{
  const action=btn.dataset.tripBulk;
  if(action==='delete'){deleteSelectedTrips();return}
  if(action==='all'||action==='none'){tripSelectedIds.clear();if(action==='all')items.forEach(x=>tripSelectedIds.add(x.id));$('drawer-body').querySelectorAll('[data-trip-select]').forEach(x=>x.checked=tripSelectedIds.has(x.dataset.tripSelect));return}
  if(action==='expand'||action==='collapse'){const open=action==='expand';items.forEach(x=>open?tripExpandedIds.add(x.id):tripExpandedIds.delete(x.id));$('drawer-body').querySelectorAll('[data-trip-card]').forEach(card=>{const isOpen=tripExpandedIds.has(card.dataset.tripCard);card.classList.toggle('is-collapsed',!isOpen);card.classList.toggle('expanded',isOpen);const toggle=card.querySelector('[data-trip-toggle]');toggle.setAttribute('aria-expanded',String(isOpen));toggle.querySelector('svg')?.remove();toggle.insertAdjacentHTML('beforeend',icon(isOpen?'chevron-up':'chevron-down','small-icon'))});refreshIcons()}
 });
 $('drawer-body').querySelectorAll('[data-trip-open]').forEach(el=>el.onclick=()=>selectTrip(el.dataset.tripOpen));
 $('drawer-body').querySelectorAll('[data-trip-card]').forEach(card=>{
  const open=()=>selectTrip(card.dataset.tripCard);
  card.addEventListener('click',e=>{if(e.target.closest('button,input,select,textarea,a,label,[data-rename-editor]'))return;open()});
  card.addEventListener('keydown',e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();open()}});
 });
 $('drawer-body').querySelectorAll('[data-trip-rename]').forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.tripRename,editor=[...$('drawer-body').querySelectorAll('[data-rename-editor]')].find(x=>x.dataset.renameEditor===id);
  if(!editor)return;
  tripExpandedIds.add(id);const card=btn.closest('[data-trip-card]');card?.classList.remove('is-collapsed');card?.classList.add('expanded');
  const opened=!editor.hidden;
  $('drawer-body').querySelectorAll('[data-rename-editor]').forEach(x=>x.hidden=true);
  editor.hidden=opened;
  if(!opened){const input=editor.querySelector('input');input.focus();input.select()}
 });
 $('drawer-body').querySelectorAll('[data-rename-save]').forEach(btn=>btn.onclick=()=>{
  const id=btn.dataset.renameSave,inp=[...$('drawer-body').querySelectorAll('[data-rename-input]')].find(x=>x.dataset.renameInput===id);
  if(inp)renameSavedTrip(id,inp.value);
 });
 $('drawer-body').querySelectorAll('[data-rename-input]').forEach(inp=>inp.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();e.stopPropagation();renameSavedTrip(inp.dataset.renameInput,inp.value)}
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();inp.closest('[data-rename-editor]').hidden=true}
 }));
 $('drawer-body').querySelectorAll('[data-trip-copy]').forEach(el=>el.onclick=()=>duplicateTrip(el.dataset.tripCopy));
 $('drawer-body').querySelectorAll('[data-trip-delete]').forEach(el=>el.onclick=()=>removeTrip(el.dataset.tripDelete));
 refreshIcons();
}
let selectedDay=0,selectedStop=null,routeData=null,routeError='',routeToken=0,
 markerLayer=null,routeLayer=null,poiLinkLayer=null,legLabelLayer=null,tiles=null,labelsTile=null,roadsTile=null,map=null,currentContext=null,
 currentEdit=null,toastTimer=null,searchPending=false,lastSearch=0,
 viewScope='day',routeCache=new Map(),routeController=null,routeDebounce=null,
 tileErrorCount=0,photoLayer=null,viaLayer=null,routeEdit=false,photoPlacement=null,googleMap=null,googleCoverage=null,googleMarkers=[],googleApiKeyLoaded='',googleScriptLoading=null,googleMode=false,quickStreetMode=false,drawLegSession=null,activeDrawEditLeg=null,pointMoveModeId=null;
const paintedLegCoordinates=new Map();
let legTextSvgRenderer=null,legTextId=0,legTextOccupied=[];
// Actual routed shapes survive visual-only route edits and group regrouping.
// Geometry is tied to the actual from/to positions, not list order alone.
const routedLegVisualCache=new Map();
// Keep the measured driving/walking duration separate from a user's timetable adjustment.
const routedLegDurationCache=new Map();
let activeLegSpotlight=null,legSpotlightLayer=null,forcedPointSession=null,forcedHandleLayer=null,forcedRelocateSession=null;
function routedShapeKey(arr,index,profile){
 const a=arr[index-1],b=arr[index];
 return [profile,a?.id,b?.id,Number(a?.lat).toFixed(6),Number(a?.lng).toFixed(6),Number(b?.lat).toFixed(6),Number(b?.lng).toFixed(6),JSON.stringify(legAt(index,arr).viaPoints||[])].join('|');
}
function rememberRoutedShape(arr,index,profile,coords){
 if(!coords||coords.length<2)return;
 const key=routedShapeKey(arr,index,profile);
 if(routedLegVisualCache.size>350)routedLegVisualCache.delete(routedLegVisualCache.keys().next().value);
 routedLegVisualCache.set(key,coords.map(c=>[+c[0],+c[1]]));
}
let legTextRefreshTimer=null;
function refreshLegTextLabels(){
 if(!map||!legLabelLayer)return;
 legLabelLayer.clearLayers();legTextOccupied=[];
 if(viewScope==='day'){
  const arr=stops();
  for(let i=1;i<arr.length;i++)drawRouteAnnotations(i,paintedLegCoordinates.get(i)||legCoords(i,arr),arr,legLabelLayer);
 }else{
  state.days.forEach((day,di)=>{
   const arr=routeStopsForDay(di).filter(validPoint);
   for(let i=1;i<arr.length;i++){
    const conf=legAt(i,arr),profile=effectiveLegProfile(i,arr,di);
    const shape=conf.mode==='auto'?(routedLegVisualCache.get(routedShapeKey(arr,i,profile))||[[+arr[i-1].lat,+arr[i-1].lng],...(conf.viaPoints||[]),[+arr[i].lat,+arr[i].lng]]):legCoords(i,arr);
    drawRouteAnnotations(i,shape,arr,legLabelLayer);
   }
  });
 }
}
function queueLegTextRefresh(){
 clearTimeout(legTextRefreshTimer);
 legTextRefreshTimer=setTimeout(refreshLegTextLabels,65);
}

function refreshIcons(){if(window.lucide)lucide.createIcons({attrs:{'stroke-width':1.9}})}
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3200)}
let currentMapDialogFinish=null,mapNoticeTimer=null;
function notifyOnMap(message){
 const pane=document.body;
 let el=$('map-action-notice');if(!el){el=document.createElement('div');el.id='map-action-notice';el.className='map-action-notice';el.setAttribute('role','status');el.setAttribute('aria-live','polite');pane.append(el)}
 el.textContent=message;el.hidden=false;clearTimeout(mapNoticeTimer);mapNoticeTimer=setTimeout(()=>el.hidden=true,2800);
}
function confirmOnMap(message,options={}){
 const pane=document.querySelector('.map-pane');if(!pane)return Promise.resolve(false);
 if(currentMapDialogFinish)currentMapDialogFinish(false);
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='map-confirm-overlay';overlay.setAttribute('role','presentation');
  overlay.innerHTML=`<div class="map-confirm-card" role="alertdialog" aria-modal="true" aria-labelledby="map-confirm-heading" aria-describedby="map-confirm-question"><h3 id="map-confirm-heading">${esc(options.title||'אישור פעולה')}</h3><p id="map-confirm-question">${esc(message)}</p><div class="map-confirm-actions"><button type="button" class="map-confirm-approve">${esc(options.accept||'אישור')}</button><button type="button" class="map-confirm-cancel">ביטול</button></div></div>`;
  pane.append(overlay);overlay.addEventListener('pointerdown',e=>e.stopPropagation());const previous=document.activeElement;
  const finish=accepted=>{if(currentMapDialogFinish!==finish)return;currentMapDialogFinish=null;document.removeEventListener('keydown',keyHandler,true);overlay.remove();previous?.focus?.();resolve(accepted)};
  currentMapDialogFinish=finish;
  const keyHandler=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(false)}else if(e.key==='Enter'&&e.target.closest('.map-confirm-card')){e.preventDefault();finish(e.target.classList.contains('map-confirm-approve'))}};
  document.addEventListener('keydown',keyHandler,true);
  overlay.querySelector('.map-confirm-approve').onclick=()=>finish(true);
  overlay.querySelector('.map-confirm-cancel').onclick=()=>finish(false);
  overlay.addEventListener('click',e=>{if(e.target===overlay)finish(false)});
  overlay.querySelector('.map-confirm-cancel').focus();
 });
}
const svAvailabilityCache=new Map();
async function inspectStreetView(lat,lng){
 const key=state.settings.googleKey?.trim();if(!key)return {status:'unknown',text:'לא נבדק · אין מפתח API'};
 const cacheKey=`${lat.toFixed(5)},${lng.toFixed(5)}|${key.slice(-7)}`;
 const old=svAvailabilityCache.get(cacheKey);if(old&&Date.now()-old.at<240000)return old.result;
 try{
  await Promise.race([loadGoogleApi(key),new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),9000))]);
  const service=new google.maps.StreetViewService();
  const response=await Promise.race([service.getPanorama({location:{lat,lng},radius:50}),new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),8000))]);
  const result=response?.data?.location?{status:'available',text:'זמין באזור · ✓'}:{status:'unknown',text:'לא ניתן לאמת'};
  svAvailabilityCache.set(cacheKey,{at:Date.now(),result});return result;
 }catch(err){
  const code=String(err?.code||err?.status||err?.message||'').toUpperCase();
  const result=code.includes('ZERO_RESULTS')?{status:'absent',text:'לא נמצא צילום בטווח 50 מ׳'}:{status:'unknown',text:'לא ניתן לבדוק כרגע'};
  svAvailabilityCache.set(cacheKey,{at:Date.now(),result});return result;
 }
}
async function refreshLegStreetViewAvailability(el,lat,lng){
 const status=el.querySelector('#leg-sv-status');if(!status)return;
 const key=state.settings.googleKey?.trim();
 if(!key){status.className='leg-street-status unknown';status.textContent='לא נבדק · פתיחה בגוגל';return}
 status.className='leg-street-status checking';status.innerHTML='<span class="sv-spinner" aria-hidden="true"></span> בודק זמינות…';
 const result=await inspectStreetView(lat,lng);
 if(!status.isConnected||!el.classList.contains('open')||Number(el.dataset.pointLat)!==lat||Number(el.dataset.pointLng)!==lng)return;
 status.className='leg-street-status '+result.status;
 status.textContent=result.status==='available'?'✓ '+result.text:result.text;
}

