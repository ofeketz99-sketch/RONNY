function validPoint(s){return TripQueries.validPoint(s)}
let ronnyActiveDayGroupId=null;
function ronnyDayGroups(){return Array.isArray(state.settings.dayGroups)?state.settings.dayGroups:[]}
function ronnyGroupDays(group){
 if(!group)return [];
 const start=state.days.findIndex(d=>d.dayId===group.fromDayId);
 const end=state.days.findIndex(d=>d.dayId===group.toDayId);
 if(start<0||end<0)return [];
 const a=Math.min(start,end),b=Math.max(start,end);
 return state.days.map((_,i)=>i).filter(i=>i>=a&&i<=b);
}
function ronnyVisibleDayIndices(){
 if(viewScope!=='all')return [selectedDay];
 const selected=ronnyDayGroups().find(g=>g.id===ronnyActiveDayGroupId);
 return selected?ronnyGroupDays(selected):state.days.map((_,i)=>i);
}
function ronnyGroupCaption(){const g=ronnyDayGroups().find(g=>g.id===ronnyActiveDayGroupId);return g?.name||'כל הטיול'}
function ronnySetGroupView(id){
 ronnyActiveDayGroupId=id;
 if(planningResolution!=='day')setPlanningResolution('day',{fit:false});
 viewScope='all';$('map-scope').value='all';selectedStop=null;
 closeLegEditor();hidePointQuick();renderAll();fitMap();
}
function currentStopsForMap(){return TripQueries.currentStopsForMap(state,ronnyVisibleDayIndices())}
function makeDate(i){let d=new Date((state.startDate||'2026-10-26')+'T12:00:00');d.setDate(d.getDate()+i);return d}
function dayDate(i){return new Intl.DateTimeFormat('he-IL',{weekday:'short',day:'numeric',month:'short'}).format(makeDate(i))}
function money(n){return CoreFormat.money(n)}
function minsFmt(m){return CoreFormat.minsFmt(m)}
const MAP_ONLY_TYPES=new Set(['poi','note','idea','nature','viewpoint','dining','fuel','other']);
const WALK_TYPES=new Set(['walkStart','walkTurn','walkEnd']);
function walkStartIndex(points,index){for(let i=index;i>=0;i--){if(points[i]?.type==='walkEnd')break;if(points[i]?.type==='walkStart')return i;}return -1;}
function isMapOnlyPoint(s){return TripQueries.isMapOnlyPoint(s,MAP_ONLY_TYPES)}
function routeStopsForDay(dayIndex){return TripQueries.routeStopsForDay(state,dayIndex,MAP_ONLY_TYPES)}
function stops(){return routeStopsForDay(selectedDay)}
function commitRouteOrder(dayIndex, ordered){return TripStateCommands.commitRouteOrder(state,dayIndex,ordered,isMapOnlyPoint)}
function poiLinksForDay(dayIndex){return TripQueries.poiLinksForDay(state,dayIndex,MAP_ONLY_TYPES,kmBetween)}
function getStop(id){return TripQueries.getStop(state,id)}
function tripDefaultDepartureTime(){const t=state?.settings?.defaultDepartureTime;return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t||'')?t:'09:00'}
function applyTripDefaultDeparture(){
 let changed=false;
 for(let i=0;i<state.days.length;i++){
  const day=state.days[i],start=routeStopsForDay(i).find(p=>p.type==='start');
  if(!start||day.departureUsesDefault!==true||day.timeAnchor)continue;
  const wanted=tripDefaultDepartureTime();
  if(start.time!==wanted){start.time=wanted;changed=true;retimeAfterOrderChange(i)}
 }
 return changed;
}
function inheritedStartForNewDay(previousDayIndex){
 const previous=state.days[previousDayIndex];
 const ending=previous?.stops?.find(s=>s.type==='end'&&validPoint(s))||routeStopsForDay(previousDayIndex).filter(validPoint).at(-1);
 if(!ending)return null;
 return {id:uid(),name:'נקודת התחלה',type:'start',time:tripDefaultDepartureTime(),duration:0,cost:0,
  lat:Number(ending.lat),lng:Number(ending.lng),description:'',notes:'',
  fromPreviousDayEnd:ending.id};
}

const DAY_ACCENTS=['#7ea68d','#7f97bf','#c49284','#9a89c4','#c5a164','#73a7a4','#bf859b','#9bab73'];
function validDayColor(v){return typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v)}
function nextDayAccent(){return DAY_ACCENTS[state.days.length%DAY_ACCENTS.length]}
function selectedDayColor(){return state.days[selectedDay]?.color||DAY_ACCENTS[selectedDay%DAY_ACCENTS.length]}
function dayDefaultProfile(dayIndex=selectedDay){
 const preferred=state.days[dayIndex]?.travelMode;
 return TRAVEL_MODES[preferred]?preferred:(TRAVEL_MODES[state.settings.travelMode]?state.settings.travelMode:'driving');
}
function renumberGenericDayLabels(){return TripStateCommands.renumberGenericDayLabels(state)}
function applyDayTheme(){
 const color=selectedDayColor(),root=document.documentElement;
 root.style.setProperty('--day-accent',color);
 root.style.setProperty('--day-rail-bg',`color-mix(in srgb, ${color} 45%, #637869)`);
 root.style.setProperty('--day-active-glow',`color-mix(in srgb, ${color} 38%, transparent)`);
 root.style.setProperty('--day-wash',`color-mix(in srgb,${color} 12%,#fffaf1)`);
 root.style.setProperty('--day-ink',`color-mix(in srgb,${color} 76%,#26372b)`);
 const pane=$('day-context'),d=state.days[selectedDay];
 if(pane){const desc=String(d?.description||'').trim();pane.hidden=!desc;pane.innerHTML=desc?`<span class="day-context-bar" aria-hidden="true"></span><div class="day-context-copy"><strong>${esc(d.label||'יום '+(selectedDay+1))} · יום ${selectedDay+1}</strong><p>${esc(desc)}</p></div>`:''}
}
function lastRouteStop(day){return (day?.stops||[]).find(s=>(s.type==='end'||(day.loop&&s.type==='start'))&&validPoint(s))||null}
function ensureDayStart(i){
 if(i<=0||i>=state.days.length)return false;
 const curr=state.days[i],ending=lastRouteStop(state.days[i-1]);if(!ending)return false;
 let changed=false,existing=(curr.stops||[]).find(s=>s.type==='start');
 for(const extra of (curr.stops||[]).filter(s=>s.type==='start'&&s!==existing)){extra.type='via';changed=true}
 if(!existing){existing={id:uid(),name:'נקודת התחלה',type:'start',time:tripDefaultDepartureTime(),duration:0,cost:0,lat:+ending.lat,lng:+ending.lng,description:'',notes:'',autoInheritedStart:true};curr.stops.unshift(existing);curr.departureUsesDefault=true;changed=true}
 if(existing.fromPreviousDayEnd!==ending.id||+existing.lat!==+ending.lat||+existing.lng!==+ending.lng){existing.fromPreviousDayEnd=ending.id;existing.lat=+ending.lat;existing.lng=+ending.lng;changed=true}
 if(changed)positionRouteEndpoints(curr);
 return changed;
}
function synchronizeDayStarts(){let modified=false;for(let i=1;i<state.days.length;i++)modified=ensureDayStart(i)||modified;return modified}
function reverseDayItinerary(day){
 const forward=(day.stops||[]).filter(s=>!isMapOnlyPoint(s));
 if(forward.length<2)return false;
 const oldFirstClock=String(forward[0].time||'09:00');
 const oldLegs=new Map(forward.map(s=>[s.id,s.leg?cloneValue(s.leg):null]));
 const backward=[...forward].reverse();
 for(const s of backward)delete s.leg;
 // Each old incoming connection is the outgoing connection in the reverse order.
 // Keep all geometry and its metadata attached to the same physical connection.
 for(let i=1;i<backward.length;i++){
  const dest=backward[i],src=backward[i-1],originalLeg=oldLegs.get(src.id);
  if(!originalLeg||originalLeg.fromId!==dest.id)continue;
  const leg={...originalLeg,fromId:src.id};
  if(Array.isArray(leg.path))leg.path=[...leg.path].reverse();
  if(Array.isArray(leg.viaPoints))leg.viaPoints=[...leg.viaPoints].reverse();
  dest.leg=leg;
 }
 // The arrival end becomes departure start; the original start becomes end.
 // User-authored place names remain with the original places.
 const formerStart=forward.find(s=>s.type==='start');
 const formerEnd=forward.find(s=>s.type==='end');
 if(formerStart){formerStart.type='end';if(formerStart.name==='נקודת התחלה')formerStart.name='נקודת סיום'}
 if(formerEnd){formerEnd.type='start';if(formerEnd.name==='נקודת סיום')formerEnd.name='נקודת התחלה'}
 if(!formerEnd){const first=backward[0];first.type='start';if(first.name==='נקודת מעבר')first.name='נקודת התחלה'}
 if(!formerStart){const last=backward.at(-1);last.type='end';if(last.name==='נקודת מעבר')last.name='נקודת סיום'}
 const mapOnly=(day.stops||[]).filter(isMapOnlyPoint);
 day.stops=[...backward,...mapOnly];
 // Reversing an itinerary makes its start deliberately independent: otherwise
 // inherited-start synchronization would move the point to the previous day's end.
 const start=backward[0];start.autoInheritedStart=false;delete start.fromPreviousDayEnd;
 if(start.type==='start')start.duration=0;
 day.timeAnchor={stopId:start.id,kind:'departure',time:oldFirstClock};
 start.time=oldFirstClock;
 renumberWaypoints(day);
 return true;
}
function chooseDayReorderMode(from,to){
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='day-order-overlay';overlay.setAttribute('role','presentation');
  const source=state.days[from],destination=state.days[to],affected=Math.abs(to-from)+1;
  overlay.innerHTML=`<div class="map-confirm-card" role="dialog" aria-modal="true" aria-labelledby="day-order-title" aria-describedby="day-order-desc"><h3 id="day-order-title">שינוי סדר הימים</h3><p id="day-order-desc" class="day-order-explanation">${esc(source.label||'יום '+(from+1))} עובר למיקום ${to+1}. איך לטפל בכיוון המסלולים של ${affected} הימים שביניהם?</p><div class="day-order-options"><button type="button" class="day-order-choice preserve" data-order-mode="preserve">${icon('list-ordered','small-icon')}<span><strong>שמור את כיוון המסלולים</strong><small>סדר הימים ישתנה, וכל יום ישמור על כיוון הנסיעה והנקודות המקורי שלו.</small></span></button><button type="button" class="day-order-choice adapt" data-order-mode="adapt">${icon('route','small-icon')}<span><strong>התאם מחדש — הפוך כיוונים</strong><small>הפוך את סדר הנקודות וכיוון הדרכים בכל יום שהוחלף, כולל שרטוטים ומעברים הכרחיים.</small></span></button><button type="button" class="day-order-choice cancel" data-order-mode="cancel">ביטול</button></div></div>`;
  const prior=document.activeElement;document.body.appendChild(overlay);
  const finish=mode=>{document.removeEventListener('keydown',onKey,true);overlay.remove();prior?.focus?.({preventScroll:true});resolve(mode)};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish('cancel')}else if(e.key==='Tab'){const nodes=[...overlay.querySelectorAll('button')],i=nodes.indexOf(document.activeElement);if(i>=0&&((e.shiftKey&&i===0)||(!e.shiftKey&&i===nodes.length-1))){e.preventDefault();nodes[e.shiftKey?nodes.length-1:0].focus()}}};
  document.addEventListener('keydown',onKey,true);
  overlay.querySelectorAll('[data-order-mode]').forEach(btn=>btn.onclick=()=>finish(btn.dataset.orderMode));
  overlay.addEventListener('pointerdown',e=>e.stopPropagation());
  overlay.addEventListener('click',e=>{if(e.target===overlay)finish('cancel')});
  overlay.querySelector('.day-order-choice.preserve').focus({preventScroll:true});
 });
}
let dayReorderPending=false;
async function moveDay(from,to){
 if(dayReorderPending||from<0||to<0||from>=state.days.length||to>=state.days.length||from===to)return;
 dayReorderPending=true;
 let mode='cancel';
 try{mode=await chooseDayReorderMode(from,to)}finally{dayReorderPending=false}
 if(mode==='cancel'||!['preserve','adapt'].includes(mode))return;
 const oldRects=new Map(Array.from($('days')?.querySelectorAll('[data-day-id]')||[]).map(el=>[el.dataset.dayId,el.getBoundingClientRect()]));
 const managerRects=new Map(Array.from($('days-manager-list')?.querySelectorAll('[data-day-row]')||[]).map(el=>[el.dataset.dayRow,el.getBoundingClientRect()]));
 const oldDays=[...state.days],active=state.days[selectedDay],day=state.days.splice(from,1)[0];state.days.splice(to,0,day);
 renumberGenericDayLabels();
 for(const photo of state.photos||[]){const oldDay=oldDays[photo.day];if(oldDay)photo.day=state.days.indexOf(oldDay)}
 selectedDay=state.days.indexOf(active);selectedStop=null;
 // Do not silently change the coordinates of a preserved route when its new
 // preceding day is different from its original preceding day.
 for(const d of state.days){const first=d.stops.find(s=>s.type==='start');if(first?.autoInheritedStart){first.autoInheritedStart=false;delete first.fromPreviousDayEnd}}
 if(mode==='adapt'){
  const first=Math.min(from,to),last=Math.max(from,to);
  for(let i=first;i<=last;i++)reverseDayItinerary(state.days[i]);
 }
 invalidate();
 if(mode==='adapt')for(let i=Math.min(from,to);i<=Math.max(from,to);i++)retimeAfterOrderChange(i,0);
 save();renderAll();fitMap();
 if($('days-manager')?.classList.contains('open')){
  renderDaysManagerRows();
  if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
   $('days-manager-list')?.querySelectorAll('[data-day-row]').forEach(el=>{const prev=managerRects.get(el.dataset.dayRow);if(!prev)return;
    const current=el.getBoundingClientRect(),dy=prev.top-current.top;
    if(Math.abs(dy)>1)el.animate([{transform:`translateY(${dy}px)`},{transform:'translateY(0)'}],{duration:340,easing:'cubic-bezier(.22,1,.36,1)'});
   });
  }
 }
 if(!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
  $('days')?.querySelectorAll('[data-day-id]').forEach(el=>{const previous=oldRects.get(el.dataset.dayId);if(!previous)return;const now=el.getBoundingClientRect(),dx=previous.x-now.x,dy=previous.y-now.y;if(Math.abs(dx)>1||Math.abs(dy)>1)el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:360,easing:'cubic-bezier(.2,.8,.23,1)'})});
 }
 toast(mode==='adapt'?'סדר הימים וכיווני המסלולים עודכנו':'סדר הימים עודכן; כיווני המסלולים נשמרו');
}
function highlightMapPoint(id,on=true){
 if(!id)return;
 markerLayer?.eachLayer?.(layer=>{if(layer.options?.ronnyStopId!==id)return;
  const symbol=layer.getElement?.()?.querySelector('.point-pin');symbol?.classList.toggle('ronny-hover-linked',on);
  const outer=layer.getElement?.();if(outer)outer.style.zIndex=on?'1500':'';
 });
 document.querySelectorAll('.stop[data-stop],.notes-item[data-note-id]').forEach(el=>{
  if((el.dataset.stop||el.dataset.noteId)===id)el.classList.toggle('ronny-hover-linked',on)
 });
}

function renderDays(){
 const html=state.days.map((d,i)=>`<button type="button" draggable="true" class="day-pill ${i===selectedDay?'active':''} ${dayExcludedFromTotals(d)?'ronny-incomplete-day':''}" style="--pill-color:${esc(d.color||DAY_ACCENTS[i%DAY_ACCENTS.length])}" data-day-id="${esc(d.dayId)}" data-day="${i}" aria-label="יום ${i+1}: ${esc(d.label||'')}" aria-pressed="${i===selectedDay}" title="לחץ לבחירה · גרור כדי לשנות סדר"><span class="ronny-day-path-kind" title="${d.loop?'יום מעגלי':'יום קווי'}" aria-label="${d.loop?'יום מעגלי':'יום קווי'}">${icon(d.loop?'rotate-cw':'move-left','small-icon')}</span><strong>יום ${i+1}</strong><small>${esc(dayDate(i))}</small><span class="day-label">${/^יום\s+\d+$/u.test(String(d.label||''))?'':esc(d.label||'')}</span></button>`).join('');
 $('days').innerHTML=html;const prev=$('day-prev'),next=$('day-next');if(prev)prev.disabled=selectedDay<=0;if(next)next.disabled=selectedDay>=state.days.length-1;const active=$('days').querySelector('.day-pill.active');if(active){const strip=$('days').getBoundingClientRect(),rect=active.getBoundingClientRect();if(rect.left<strip.left+3||rect.right>strip.right-3)requestAnimationFrame(()=>active.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'}))}
 $('days').querySelectorAll('[data-day]').forEach(el=>{
  el.onclick=()=>selectDay(+el.dataset.day);
  el.addEventListener('dragstart',e=>{e.dataTransfer.setData('application/x-ronny-day',el.dataset.day);e.dataTransfer.effectAllowed='move';el.classList.add('is-day-dragging')});
  el.addEventListener('dragend',()=>document.querySelectorAll('.is-day-dragging,.is-day-drop-target').forEach(x=>x.classList.remove('is-day-dragging','is-day-drop-target')));
  el.addEventListener('dragover',e=>{if(!e.dataTransfer.types.includes('application/x-ronny-day'))return;e.preventDefault();el.classList.add('is-day-drop-target')});
  el.addEventListener('dragleave',()=>el.classList.remove('is-day-drop-target'));
  el.addEventListener('drop',e=>{e.preventDefault();const n=Number(e.dataTransfer.getData('application/x-ronny-day'));el.classList.remove('is-day-drop-target');moveDay(n,+el.dataset.day)});
 });
 renderDayTimeMode();
 $('add-day').onclick=()=>{
  if(state.days.length>=100){toast('ניתן ליצור עד 100 ימים בטיול');return}
  const after=Math.max(0,Math.min(selectedDay,state.days.length-1));
  const at=after+1;
  const inherited=inheritedStartForNewDay(after);
  if(inherited)inherited.autoInheritedStart=true;
  state.days.splice(at,0,{label:'יום '+(at+1),description:'',travelMode:'',dayId:uid(),color:nextDayAccent(),segments:[],stops:inherited?[inherited]:[],departureUsesDefault:!!inherited});
  // Photos refer to the numeric day index, not the day ID.
  state.photos=(state.photos||[]).map(photo=>({...photo,day:photo.day>=at?photo.day+1:photo.day}));
  renumberGenericDayLabels();
  synchronizeDayStarts();
  selectedDay=at;selectedStop=null;viewScope='day';$('map-scope').value='day';
  invalidate();save();renderAll();fitMap();toast('נוסף יום אחרי היום שנבחר');
 };

}
// RONNY 35.14 — reusable, explicit day color selector. Stored with the day and included in JSON exports.
function dayColorChooserMarkup(day, inputId, swatchAttr){
 const current=validDayColor(day.color)?day.color:DAY_ACCENTS[0];
 return `<div class="day-color-setting"><div class="day-color-setting-label">צבע היום <small>בחר גוון פסטל או צבע מותאם</small></div>
 <div class="day-color-choices" role="group" aria-label="גווני פסטל ליום">${DAY_ACCENTS.map(c=>`<button type="button" class="day-color-swatch" ${swatchAttr}="${c}" title="בחר גוון ${c}" aria-label="גוון ${c}" aria-pressed="${current.toLowerCase()===c.toLowerCase()}" style="--swatch:${c}"></button>`).join('')}</div>
 <label class="day-color-custom">צבע מותאם <input type="color" id="${inputId}" value="${current}" aria-label="בחירת צבע יום מותאם"></label>
 </div>`;
}
function wireDayColorChooser(scope, inputId, swatchAttr){
 const input=scope.querySelector('#'+inputId);if(!input)return;
 const buttons=[...scope.querySelectorAll('['+swatchAttr+']')];
 const refresh=()=>buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.getAttribute(swatchAttr).toLowerCase()===input.value.toLowerCase())));
 buttons.forEach(b=>b.addEventListener('click',()=>{input.value=b.getAttribute(swatchAttr);input.dispatchEvent(new Event('input',{bubbles:true}))}));
 input.addEventListener('input',()=>{input.dataset.userChoice='true';refresh()});
 refresh();
}
function editDay(){
 const day=state.days[selectedDay];
 const body=`<div class="day-editor-section"><div class="field"><label for="d-label">שם היום</label><input id="d-label" maxlength="65" value="${esc(day.label||'')}" placeholder="שם היום"></div>
 <div class="field"><label for="d-description">תיאור היום</label><textarea id="d-description" maxlength="1200" rows="4" placeholder="הערות ותכנון ליום הזה">${esc(day.description||'')}</textarea></div>
 <div class="field"><label for="d-travel-mode">ברירת מחדל לניווט ביום הזה</label><select id="d-travel-mode"><option value="" ${!day.travelMode?'selected':''}>לפי הגדרות הטיול · ${esc(TRAVEL_MODES[state.settings.travelMode]||TRAVEL_MODES.driving)}</option>${Object.entries(TRAVEL_MODES).map(([mode,label])=>`<option value="${mode}" ${day.travelMode===mode?'selected':''}>${label}</option>`).join('')}</select></div>
 ${dayColorChooserMarkup(day,'d-color','data-day-palette')}<label class="ronny-loop-setting"><input type="checkbox" id="d-loop" ${day.loop?'checked':''}><span class="ronny-loop-setting-icon">${pointSymbol('loop')}</span><span><strong>יום מעגלי — חזרה בסוף היום בלבד</strong><small>לחזרה בסוף הטיול כולו יש להפעיל ״טיול מעגלי״ בהגדרות הטיול. כאן המערכת מוסיפה מקטע חזרה בכבישים ומציגה סמל משולב של בית ומיטה במקום סיכה כפולה. נדרשות לפחות שתי נקודות דרך.</small></span></label></div>
 <div class="day-editor-section"><div class="field"><label>סדר הימים</label><div class="day-move-controls"><button type="button" class="btn" id="day-move-prev" ${selectedDay===0?'disabled':''}>${icon('arrow-right','small-icon')} יום קודם</button><button type="button" class="btn" id="day-move-next" ${selectedDay>=state.days.length-1?'disabled':''}>יום הבא ${icon('arrow-left','small-icon')}</button></div></div><div class="footnote">אפשר גם לגרור ימים בסרגל הימים כדי לסדר אותם.</div></div>`;
 const foot=`<button class="btn" id="day-duplicate" title="שכפול היום">${icon('copy')} שכפול</button><button class="btn danger-btn" id="day-delete" ${state.days.length===1?'disabled':''}>${icon('trash-2')} מחיקה</button><button class="btn btn-primary" id="day-save">${icon('check')} שמירה</button>`;
 openDrawer('הגדרות יום','DAY SETTINGS','שם, תיאור, צבע, סדר ופעולות',body,foot);
 wireDayColorChooser(document.getElementById('drawer'), 'd-color', 'data-day-palette');
 const store=()=>{const mode=$('d-travel-mode').value;const changed=(day.travelMode||'')!==mode;
  day.label=$('d-label').value.trim().slice(0,65)||'יום '+(state.days.indexOf(day)+1);
  day.description=$('d-description').value.trim().slice(0,1200);day.travelMode=TRAVEL_MODES[mode]?mode:'';const wasLoop=day.loop===true;day.loop=$('d-loop')?.checked===true;const loopChanged=wasLoop!==day.loop;const pathChanged=syncLoopDay(day);
  const chosen=$('d-color')?.value;if(validDayColor(chosen)&&$('d-color')?.dataset.userChoice==='true'){day.color=chosen;day.manualDayColor=true;}
  if(changed||loopChanged||pathChanged){invalidate();retimeAfterOrderChange(selectedDay)}save()};
 // Reflect the circular route immediately on map and stop list.
 $('d-loop')?.addEventListener('change',e=>{
  day.loop=e.target.checked;
  const modified=syncLoopDay(day);
  invalidate();if(modified)retimeAfterOrderChange(state.days.indexOf(day));
  save();renderAll();
  toast(day.loop?'היום מעגלי: היציאה והסיום באותה נקודה':'היום הוחזר למסלול קווי');
 });
 $('d-label')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('day-save').click()}});
 $('day-save').onclick=()=>{store();closeDrawer();renderAll();toast('פרטי היום נשמרו')};
 $('day-move-prev').onclick=()=>{store();closeDrawer();moveDay(state.days.indexOf(day),state.days.indexOf(day)-1)};
 $('day-move-next').onclick=()=>{store();closeDrawer();moveDay(state.days.indexOf(day),state.days.indexOf(day)+1)};
 $('day-duplicate').onclick=()=>{store();closeDrawer();duplicateDayAt(state.days.indexOf(day));};
 $('day-delete').onclick=async()=>{if(state.days.length===1)return;
  const msg=day.stops.length?`למחוק את היום ואת ${day.stops.length} הנקודות שבו?`:'למחוק את היום הנבחר?';
  if(!await confirmOnMap(msg,{title:'מחיקת יום',accept:'מחק יום'}))return;
  state.days.splice(selectedDay,1);renumberGenericDayLabels();selectedDay=Math.min(selectedDay,state.days.length-1);selectedStop=null;
  synchronizeDayStarts();invalidate();save();closeDrawer();renderAll();fitMap();toast('היום נמחק')};
}

// RONNY 28 — day sequence manager on the RIGHT, independent of the horizontal day strip.
let editingDayManagerId=null;
let managerBulkActive=false;const managerBulkSelected=new Set();
const daysManagerIsOpen=()=>$('days-manager')?.classList.contains('open');
function closeDaysManager(){
 if(!daysManagerIsOpen())return;
 $('days-manager').classList.remove('open');$('days-manager').setAttribute('aria-hidden','true');
 $('days-manager-shade').classList.remove('open');$('days-manager-shade').setAttribute('aria-hidden','true');
 editingDayManagerId=null;
}
function openDaysManager(){
 // Managers cannot overlap other editors.
 closeDrawer();hidePointQuick();closeLegEditor();hideContext();
 managerBulkActive=false;managerBulkSelected.clear();
 $('days-manager').classList.add('open');$('days-manager').setAttribute('aria-hidden','false');
 $('days-manager-shade').classList.add('open');$('days-manager-shade').setAttribute('aria-hidden','false');
 renderDaysManagerRows();$('days-manager-close').focus({preventScroll:true});
}
function cloneDayForDuplicate(day){
 const copy=cloneValue(day);
 copy.dayId=uid();
 copy.label=((String(day.label||'יום').trim()||'יום')+' — עותק').slice(0,65);
 if(!copy.manualDayColor)copy.color=nextDayAccent();
 const idMap=new Map();
 copy.stops=(copy.stops||[]).map(stop=>{
  const cloned=cloneValue(stop);
  const oldId=cloned.id;
  cloned.id=uid();
  cloned.autoInheritedStart=false;
  idMap.set(oldId,cloned.id);
  return cloned;
 });
 copy.stops.forEach(stop=>{if(stop.leg&&idMap.has(stop.leg.fromId))stop.leg.fromId=idMap.get(stop.leg.fromId)});
 return copy;
}
function duplicateDayAt(index,{reopenManager=false}={}){
 if(index<0||index>=state.days.length)return;
 if(state.days.length>=100){toast('ניתן ליצור עד 100 ימים');return;}
 const copy=cloneDayForDuplicate(state.days[index]);
 state.days.splice(index+1,0,copy);
 state.photos=(state.photos||[]).map(p=>({...p,day:p.day>index?p.day+1:p.day}));
 selectedDay=index+1;selectedStop=null;viewScope='day';$('map-scope').value='day';
 editingDayManagerId=null;managerBulkSelected.clear();managerBulkActive=false;
 renumberGenericDayLabels();synchronizeDayStarts();invalidate();save();renderAll();fitMap();
 if(reopenManager)openDaysManager();
 toast('היום שוכפל');
}

function renderDaysManagerRows(){
 const list=$('days-manager-list');if(!list)return;
 const selected=state.days[selectedDay];
 managerBulkSelected.forEach(id=>{if(!state.days.some(d=>d.dayId===id))managerBulkSelected.delete(id)});
 const toolbar=$('days-manager-bulk');
 if(toolbar){toolbar.innerHTML=`<button type="button" class="btn btn-soft" data-manager-bulk-toggle aria-pressed="${managerBulkActive}">${icon('list-checks','small-icon')} ${managerBulkActive?'סיים בחירה':'בחירה מרובה'}</button>${managerBulkActive?`<span class="manager-selected-count">${managerBulkSelected.size} נבחרו</span><button type="button" class="btn" data-manager-select-all>בחר הכול</button><button type="button" class="btn" data-manager-select-none>נקה</button><button type="button" class="btn danger-btn" data-manager-delete ${managerBulkSelected.size===0||managerBulkSelected.size===state.days.length?'disabled':''}>${icon('trash-2','small-icon')} מחק ${managerBulkSelected.size}</button>`:''}`;
  toolbar.querySelector('[data-manager-bulk-toggle]').onclick=()=>{managerBulkActive=!managerBulkActive;managerBulkSelected.clear();editingDayManagerId=null;renderDaysManagerRows()};
  toolbar.querySelector('[data-manager-select-all]')?.addEventListener('click',()=>{managerBulkSelected.clear();state.days.forEach(d=>managerBulkSelected.add(d.dayId));renderDaysManagerRows()});
  toolbar.querySelector('[data-manager-select-none]')?.addEventListener('click',()=>{managerBulkSelected.clear();renderDaysManagerRows()});
  toolbar.querySelector('[data-manager-delete]')?.addEventListener('click',deleteSelectedManagerDays);
 }
 list.innerHTML=state.days.map((d,i)=>{
  const editing=editingDayManagerId===d.dayId;
  const col=esc(d.color||DAY_ACCENTS[i%DAY_ACCENTS.length]);
  const count=(d.stops||[]).length;
  const description=String(d.description||'').trim();
  return `<article class="day-manager-row ronny-entity ${d===selected?'selected':''} ${dayExcludedFromTotals(d)?'ronny-incomplete-day':''}" data-day-row="${esc(d.dayId)}" style="--row-accent:${col}">
    <div class="day-manager-main">
      <div class="day-manager-leading">
        ${managerBulkActive?`<label class="day-manager-multi" title="בחר יום למחיקה"><input type="checkbox" data-day-check="${esc(d.dayId)}" ${managerBulkSelected.has(d.dayId)?'checked':''} aria-label="בחר את יום ${i+1}"><span aria-hidden="true"></span></label>`:''}
        <span class="day-manager-grip" data-day-grip="${esc(d.dayId)}" role="button" tabindex="0" aria-label="גרור יום ${i+1} לשינוי הסדר" title="גרור לשינוי הסדר">${icon('grip-vertical','small-icon')}</span>
        <div class="day-manager-info">
          <button class="day-manager-select" type="button" data-day-select="${esc(d.dayId)}" title="הצג את יום ${i+1}">
            <span class="day-manager-number">${i+1}</span>
            <span class="day-manager-details">
              <b>${/^יום\s+\d+$/u.test(String(d.label||''))?'יום ללא שם':esc(d.label||'יום ללא שם')}</b>
              <small>${esc(dayDate(i))} · ${count} נקודות</small>
              <div class="day-manager-transport-line">
                <span class="ronny-manager-path-kind day-manager-kind-badge" title="${d.loop?'יום מעגלי':'יום קווי'}" aria-label="${d.loop?'יום מעגלי':'יום קווי'}">${icon(d.loop?'rotate-cw':'move-left','small-icon')} ${d.loop?'יום מעגלי':'יום קווי'}</span>
                <span class="day-transport-chip">${icon('route','small-icon')} ${esc(TRAVEL_MODES[dayDefaultProfile(i)])}${d.travelMode?'':' · מהטיול'}</span>
              </div>
            </span>
          </button>
          ${!editing&&description?`<p class="day-manager-desc">${esc(description)}</p>`:''}
        </div>
      </div>
      <div class="day-manager-row-actions">
        <button type="button" data-day-edit="${esc(d.dayId)}" aria-label="עריכה" title="עריכה">${icon(editing?'x':'pencil','small-icon')}</button>
        <button type="button" data-day-duplicate="${esc(d.dayId)}" aria-label="שכפול" title="שכפול">${icon('copy','small-icon')}</button>
        <button type="button" data-day-delete="${esc(d.dayId)}" class="day-manager-remove" aria-label="מחיקה" title="מחיקה" ${state.days.length<=1?'disabled':''}>${icon('trash-2','small-icon')}</button>
        <div class="day-manager-arrows"><button type="button" data-day-up="${esc(d.dayId)}" aria-label="העבר למעלה" ${i===0?'disabled':''}>${icon('chevron-up','small-icon')}</button><button type="button" data-day-down="${esc(d.dayId)}" aria-label="העבר למטה" ${i===state.days.length-1?'disabled':''}>${icon('chevron-down','small-icon')}</button></div>
      </div>
    </div>
    ${editing?`<div class="day-manager-editor">
      <label class="day-manager-field"><span>שם היום</span><input data-day-name="${esc(d.dayId)}" value="${/^יום\s+\d+$/u.test(d.label||'')?'':esc(d.label||'')}" maxlength="65"></label>
      <label class="day-manager-field"><span>ברירת מחדל לתחבורה</span><select data-day-travel="${esc(d.dayId)}"><option value="" ${!d.travelMode?'selected':''}>לפי הטיול · ${esc(TRAVEL_MODES[state.settings.travelMode]||TRAVEL_MODES.driving)}</option>${Object.entries(TRAVEL_MODES).map(([m,label])=>`<option value="${m}" ${d.travelMode===m?'selected':''}>${label}</option>`).join('')}</select></label>
      <label class="day-manager-field day-manager-field-wide"><span>תיאור</span><textarea data-day-description="${esc(d.dayId)}" maxlength="1200" rows="4">${esc(d.description||'')}</textarea></label>
      ${dayColorChooserMarkup(d,'day-manager-color','data-manager-palette')}
      <label class="ronny-loop-setting is-inline"><input type="checkbox" data-day-loop="${esc(d.dayId)}" ${d.loop?'checked':''}><span class="ronny-loop-setting-icon">${pointSymbol('loop')}</span><span><strong>יום מעגלי</strong><small>חזרה לתחילת היום בלבד, לא לתחילת הטיול</small></span></label>
      <div class="day-manager-editor-actions"><button class="btn btn-soft" data-day-save="${esc(d.dayId)}" type="button">${icon('check','small-icon')} שמירה</button></div>
    </div>`:''}
  </article>`
 }).join('');
 wireDayColorChooser(list,'day-manager-color','data-manager-palette');
 list.querySelectorAll('[data-day-check]').forEach(c=>c.onchange=()=>{c.checked?managerBulkSelected.add(c.dataset.dayCheck):managerBulkSelected.delete(c.dataset.dayCheck);renderDaysManagerRows()});
 const findDay=id=>state.days.findIndex(d=>d.dayId===id);
 const selectManagerDay=id=>{const i=findDay(id);if(i<0)return;selectDay(i);renderDaysManagerRows()};
 list.querySelectorAll('[data-day-row]').forEach(row=>{
  row.setAttribute('role','group');
  row.addEventListener('click',e=>{
   if(e.target.closest('button,input,textarea,select,label,[data-day-grip]'))return;
   if(managerBulkActive){const id=row.dataset.dayRow;managerBulkSelected.has(id)?managerBulkSelected.delete(id):managerBulkSelected.add(id);renderDaysManagerRows();return}
   selectManagerDay(row.dataset.dayRow);
  });
 });
 list.querySelectorAll('[data-day-select]').forEach(b=>b.onclick=()=>{if(managerBulkActive){const id=b.dataset.daySelect;managerBulkSelected.has(id)?managerBulkSelected.delete(id):managerBulkSelected.add(id);renderDaysManagerRows()}else selectManagerDay(b.dataset.daySelect)});
 list.querySelectorAll('[data-day-edit]').forEach(b=>b.onclick=()=>{editingDayManagerId=editingDayManagerId===b.dataset.dayEdit?null:b.dataset.dayEdit;renderDaysManagerRows();if(editingDayManagerId)list.querySelector('[data-day-name]')?.focus()});
 list.querySelectorAll('[data-day-duplicate]').forEach(b=>b.onclick=()=>duplicateDayAt(findDay(b.dataset.dayDuplicate),{reopenManager:true}));
 list.querySelectorAll('[data-day-loop]').forEach(box=>box.addEventListener('change',()=>{
  const index=findDay(box.dataset.dayLoop), day=state.days[index];if(!day)return;
  day.loop=box.checked;const changed=syncLoopDay(day);invalidate();if(changed)retimeAfterOrderChange(index);
  save();renderDays();renderMap();if(index===selectedDay)renderSchedule();refreshIcons();
  toast(day.loop?'היום מעגלי: חזרה לנקודת ההתחלה':'היום הוחזר למסלול קווי');
 }));
 list.querySelectorAll('[data-day-name]').forEach(input=>input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();list.querySelector('[data-day-save]')?.click()}}));
 list.querySelectorAll('[data-day-save]').forEach(b=>b.onclick=()=>{
  const d=state.days[findDay(b.dataset.daySave)];if(!d)return;
  d.label=(list.querySelector('[data-day-name]')?.value.trim()||'יום '+(findDay(d.dayId)+1)).slice(0,65);
  d.description=(list.querySelector('[data-day-description]')?.value||'').trim().slice(0,1200);
  const chosen=list.querySelector('#day-manager-color')?.value;if(validDayColor(chosen)&&list.querySelector('#day-manager-color')?.dataset.userChoice==='true'){d.color=chosen;d.manualDayColor=true;}
  const mode=list.querySelector('[data-day-travel]')?.value||'',changed=(d.travelMode||'')!==mode;
  d.travelMode=TRAVEL_MODES[mode]?mode:'';const previousLoop=d.loop===true;d.loop=list.querySelector('[data-day-loop]')?.checked===true;const loopModified=syncLoopDay(d);
  editingDayManagerId=null;if(changed||previousLoop!==d.loop||loopModified){invalidate();if(findDay(d.dayId)===selectedDay)retimeAfterOrderChange(selectedDay)}save();renderDays();applyDayTheme();renderDaysManagerRows();if((changed||previousLoop!==d.loop||loopModified)&&findDay(d.dayId)===selectedDay){renderMap();renderSchedule()}toast('פרטי היום נשמרו');
 });
 for(const attr of ['up','down'])list.querySelectorAll(`[data-day-${attr}]`).forEach(b=>b.onclick=()=>{
  const i=findDay(b.dataset['day'+(attr==='up'?'Up':'Down')]);if(i>=0)moveDay(i,i+(attr==='up'?-1:1));
 });
 list.querySelectorAll('[data-day-delete]').forEach(b=>b.onclick=()=>deleteDayFromManager(b.dataset.dayDelete));
 enableDayManagerDragging(list);
 refreshIcons();
}

async function deleteSelectedManagerDays(){
 const ids=new Set([...managerBulkSelected].filter(id=>state.days.some(d=>d.dayId===id)));
 if(!ids.size||ids.size>=state.days.length){toast(ids.size?'לא ניתן למחוק את כל הימים — חייב להישאר לפחות יום אחד':'בחר ימים למחיקה');return}
 const former=state.days.map(d=>d.dayId),selectedId=state.days[selectedDay]?.dayId;
 closeDaysManager();const approved=await confirmOnMap(`למחוק ${ids.size} ימים ואת הנקודות שלהם?`,{title:'מחיקת ימים',accept:'מחק '+ids.size+' ימים'});
 if(approved){const surviving=former.filter(id=>!ids.has(id));const oldIdx=new Map(surviving.map((id,i)=>[id,i]));
 state.days=state.days.filter(d=>!ids.has(d.dayId));
 state.photos=(state.photos||[]).flatMap(p=>{const id=former[p.day];return oldIdx.has(id)?[{...p,day:oldIdx.get(id)}]:[]});
 selectedDay=Math.max(0,state.days.findIndex(d=>d.dayId===selectedId));
 selectedStop=null;editingDayManagerId=null;renumberGenericDayLabels();synchronizeDayStarts();invalidate();save();renderAll();fitMap();managerBulkSelected.clear();managerBulkActive=false;toast(ids.size+' ימים נמחקו')}
 openDaysManager();
}
async function deleteDayFromManager(id){
 const idx=state.days.findIndex(d=>d.dayId===id);if(idx<0||state.days.length<=1)return;
 const day=state.days[idx];const n=day.stops.length;
 closeDaysManager(); // Show the built-in map confirmation above the map, not beneath this drawer.
 const approved=await confirmOnMap(`למחוק את ${day.label||'יום '+(idx+1)}${n?' ואת '+n+' הנקודות שבו':''}?`,{title:'מחיקת יום',accept:'מחק יום'});
 if(approved){
  const current=state.days[selectedDay];state.days.splice(idx,1);
  state.photos=(state.photos||[]).filter(p=>p.day!==idx).map(p=>({...p,day:p.day>idx?p.day-1:p.day}));renumberGenericDayLabels();
  selectedDay=state.days.indexOf(current);if(selectedDay<0)selectedDay=Math.min(idx,state.days.length-1);
  selectedStop=null;editingDayManagerId=null;
  synchronizeDayStarts();invalidate();save();renderAll();fitMap();toast('היום נמחק');
 }
 openDaysManager();
}
function enableDayManagerDragging(list){
 const rows=()=>Array.from(list.querySelectorAll('[data-day-row]'));
 const clearTargets=()=>rows().forEach(r=>r.classList.remove('is-drop-target','is-drop-before','is-drop-after'));
 rows().forEach(row=>{
  let pointerId=null,startY=0,dragging=false,slot=-1;
  row.addEventListener('pointerdown',e=>{
   if(e.button!==0||e.target.closest('button,input,textarea,select,label'))return;
   pointerId=e.pointerId;startY=e.clientY;dragging=false;slot=-1;
   row.setPointerCapture?.(e.pointerId);
  });
  row.addEventListener('pointermove',e=>{
   if(pointerId!==e.pointerId)return;
   const dy=e.clientY-startY;
   if(!dragging&&Math.abs(dy)<6)return;
   dragging=true;e.preventDefault();row.classList.add('is-dragging');
   row.style.transform=`translateY(${Math.max(-list.clientHeight,Math.min(list.clientHeight,dy))}px)`;
   // Marker is an insertion slot, never an ambiguous destination card.
   clearTargets();const options=rows().filter(r=>r!==row);
   if(!options.length)return;
   let target=options.find(r=>e.clientY<r.getBoundingClientRect().top+r.getBoundingClientRect().height/2);
   if(target){target.classList.add('is-drop-target','is-drop-before');slot=rows().indexOf(target)}
   else{target=options.at(-1);target.classList.add('is-drop-target','is-drop-after');slot=rows().indexOf(target)+1}
   if(e.clientY<list.getBoundingClientRect().top+38)list.scrollTop-=12;
   else if(e.clientY>list.getBoundingClientRect().bottom-38)list.scrollTop+=12;
  });
  const finish=e=>{
   if(pointerId!==e.pointerId)return;
   pointerId=null;row.classList.remove('is-dragging');row.style.transform='';clearTargets();
   if(!dragging||slot<0)return;
   row.dataset.justDragged='true';setTimeout(()=>{if(row.isConnected)delete row.dataset.justDragged},100);
   const from=state.days.findIndex(d=>d.dayId===row.dataset.dayRow);
   const finalIndex=slot>from?slot-1:slot;
   if(from>=0&&finalIndex>=0&&finalIndex<state.days.length&&from!==finalIndex)moveDay(from,finalIndex);
  };
  row.addEventListener('pointerup',finish);row.addEventListener('pointercancel',finish);
 });
}
// RONNY 28 — one outside gesture only dismisses an open surface; it cannot create a new map point.
let suppressOutsideClick=false,outsideClickTime=0;
function topMostActiveSurface(){
 const modal=document.querySelector('.map-confirm-overlay');if(modal)return {el:modal,close:()=>currentMapDialogFinish?.(false)};
 if(daysManagerIsOpen())return {el:$('days-manager'),close:closeDaysManager};
 if($('drawer')?.classList.contains('open'))return {el:$('drawer'),close:closeDrawer};
 for(const [id,close] of [['outline-map-add',closeOutlineMapAdd],['point-quick',hidePointQuick],['leg-editor',closeLegEditor],['map-context',hideContext]]){
  if($(id)?.classList.contains('open'))return {el:$(id),close};
 }
 const pane=document.querySelector('.map-pane');
 for(const [cls,id,toggle] of [['map-tools-expanded','map-tools-side','map-tools-toggle'],['map-controls-expanded','map-controls','map-controls-toggle']]){
  if(pane?.classList.contains(cls))return {el:$(id),close:()=>{pane.classList.remove(cls);$(toggle)?.setAttribute('aria-expanded','false')}};
 }
 const quickMenu=document.querySelector('.map-quick-menu:not([hidden])');if(quickMenu)return {el:$('map-quick-views'),close:()=>{
  document.querySelectorAll('.map-quick-menu').forEach(m=>m.hidden=true);
  for(const id of ['map-day-trigger','map-layer-trigger'])$(id)?.setAttribute('aria-expanded','false');
 }};
 if($('search-results')?.classList.contains('open'))return {el:$('search-box'),close:hideSearch};
 return null;
}
function isWithinSurface(target,active){
 if(active.el.contains(target))return true;
 // JSON input is intentionally outside the drawer in the fixed header.
 // Its synthetic click comes from the import action INSIDE the transfer drawer.
 // Do not intercept or cancel the file picker activation.
 if(active.el.id==='drawer' && target?.id==='import-file' && !!active.el.querySelector('#import-btn'))return true;
 // A selected point remains an interactive part of its open editor:
 // the next pointer press can start a Leaflet drag without an extra click.
 if(active.el.id==='point-quick'){
  const marker=target.closest?.('.leaflet-marker-icon');
  if(marker&&marker.dataset.ronnyStopId===active.el.dataset.id)return true;
  if(planningResolution!=='day'&&marker?.dataset.ronnyOutlineId)return true;
  if(planningResolution!=='day'&&target.closest?.('[data-zoom-card]'))return true;
 }
 return false;
}
function interceptOutsidePointer(e){
 if(document.getElementById('ronny-time-dialog')?.open)return;
 if(e.button!==undefined&&e.button!==0)return;
 if(e.target.closest('.rail'))return;
 const active=topMostActiveSurface();if(!active||isWithinSurface(e.target,active))return;
 active.close();suppressOutsideClick=true;outsideClickTime=Date.now();
 e.preventDefault();e.stopImmediatePropagation();
}
function interceptOutsideClick(e){
 if(document.getElementById('ronny-time-dialog')?.open)return;
 if(suppressOutsideClick&&Date.now()-outsideClickTime<1100){
  suppressOutsideClick=false;e.preventDefault();e.stopImmediatePropagation();return;
 }
 suppressOutsideClick=false;
 // Keyboard-generated activation also dismisses rather than opening a map action.
 if(e.detail===0){if(e.target.closest('.rail'))return;const active=topMostActiveSurface();if(active&&!isWithinSurface(e.target,active)){active.close();e.preventDefault();e.stopImmediatePropagation()}}
}
function initOutsideDismissal(){
 document.addEventListener('pointerdown',interceptOutsidePointer,true);
 document.addEventListener('click',interceptOutsideClick,true);
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&daysManagerIsOpen()){e.preventDefault();e.stopImmediatePropagation();closeDaysManager()}},true);
}

function ronnyCleanDayGroups(){
 const groups=ronnyDayGroups();
 const clean=groups.filter(g=>ronnyGroupDays(g).length>0);
 if(clean.length!==groups.length){state.settings.dayGroups=clean;if(!clean.some(g=>g.id===ronnyActiveDayGroupId))ronnyActiveDayGroupId=null;}
 return clean;
}
function ronnyRenderGroupBar(){
 const bar=$('ronny-day-groups-bar');if(!bar)return;
 const groups=ronnyCleanDayGroups();
 bar.innerHTML=groups.length?`<button type="button" data-ronny-group-view="" class="ronny-group-chip ${viewScope==='all'&&!ronnyActiveDayGroupId?'selected':''}">כל הטיול</button>${groups.map(g=>`<button type="button" class="ronny-group-chip ${viewScope==='all'&&ronnyActiveDayGroupId===g.id?'selected':''}" data-ronny-group-view="${esc(g.id)}" title="${esc(g.description||'הצגת כל ימי המקטע במפה')}" style="--group-c:${esc(g.color||'#87a695')}">${esc(g.name||'מקטע')} <small>${ronnyGroupDays(g).length} ימים</small></button>`).join('')}`:'';
 bar.hidden=!groups.length;
 bar.querySelectorAll('[data-ronny-group-view]').forEach(b=>b.onclick=()=>ronnySetGroupView(b.dataset.ronnyGroupView||null));
}
function ronnyOpenGroups(){
 const shade=$('ronny-day-groups-shade'),panel=$('ronny-day-groups-panel');if(!shade||!panel)return;
 closeDaysManager();closeDrawer();shade.hidden=false;panel.hidden=false;ronnyRenderGroupsManager();refreshIcons();
}
function ronnyCloseGroups(){const shade=$('ronny-day-groups-shade'),panel=$('ronny-day-groups-panel');if(shade)shade.hidden=true;if(panel)panel.hidden=true;}
function ronnyGroupSelectOptions(current){return state.days.map((d,i)=>`<option value="${esc(d.dayId)}" ${d.dayId===current?'selected':''}>יום ${i+1} · ${esc(/^יום\s+\d+$/u.test(d.label||'')?'ללא שם':d.label||'ללא שם')}</option>`).join('')}
function ronnyRenderGroupsManager(){
 const el=$('ronny-day-groups-list');if(!el)return;
 const groups=ronnyCleanDayGroups();
 el.innerHTML=groups.length?groups.map(g=>`<article class="ronny-group-editor" data-ronny-group-id="${esc(g.id)}" style="--group-c:${esc(g.color||'#87a695')}"><label>שם המקטע<input data-group-name maxlength="65" value="${esc(g.name||'')}"></label><label>תיאור המקטע<textarea data-group-description rows="2" maxlength="600">${esc(g.description||'')}</textarea></label><div class="ronny-group-range"><label>מיום<select data-group-from>${ronnyGroupSelectOptions(g.fromDayId)}</select></label><label>עד יום<select data-group-to>${ronnyGroupSelectOptions(g.toDayId)}</select></label></div><label class="ronny-group-color">צבע המקטע <input data-group-color type="color" value="${esc(g.color||'#87a695')}"></label><div class="ronny-group-actions"><button type="button" class="btn btn-soft" data-group-save>${icon('check','small-icon')} שמירה</button><button type="button" class="btn btn-soft" data-group-show>${icon('layers-3','small-icon')} הצג במפה</button><button type="button" class="btn danger-btn" data-group-remove>${icon('trash-2','small-icon')} מחיקה</button></div></article>`).join(''):'<p class="ronny-group-empty">עדיין לא הוגדרו מקטעים. אפשר לקבץ כמה ימים רצופים ולתכנן אותם יחד.</p>';
 el.querySelectorAll('[data-ronny-group-id]').forEach(row=>{
  const id=row.dataset.ronnyGroupId;
  row.querySelector('[data-group-save]').onclick=()=>{
   const g=ronnyDayGroups().find(x=>x.id===id);if(!g)return;
   g.name=row.querySelector('[data-group-name]').value.trim().slice(0,65)||'מקטע טיול';
   g.description=row.querySelector('[data-group-description]').value.trim().slice(0,600);
   g.fromDayId=row.querySelector('[data-group-from]').value;
   g.toDayId=row.querySelector('[data-group-to]').value;
   if(state.days.findIndex(d=>d.dayId===g.fromDayId)>state.days.findIndex(d=>d.dayId===g.toDayId)){[g.fromDayId,g.toDayId]=[g.toDayId,g.fromDayId]}
   g.color=row.querySelector('[data-group-color]').value;
   save();ronnyRenderGroupsManager();ronnyRenderGroupBar();toast('המקטע נשמר');
   if(viewScope==='all')renderMap();
  };
  row.querySelector('[data-group-name]').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();row.querySelector('[data-group-save]').click()}});
  row.querySelector('[data-group-show]').onclick=()=>{row.querySelector('[data-group-save]').click();ronnyCloseGroups();ronnySetGroupView(id)};
  row.querySelector('[data-group-remove]').onclick=()=>{state.settings.dayGroups=ronnyDayGroups().filter(g=>g.id!==id);if(ronnyActiveDayGroupId===id)ronnyActiveDayGroupId=null;save();renderAll();ronnyRenderGroupsManager();toast('המקטע הוסר. הימים נשארו ללא שינוי')};
 });
 refreshIcons();
}
function ronnyInitGroups(){
 $('ronny-day-groups-open')?.addEventListener('click',ronnyOpenGroups);
 $('ronny-day-groups-close')?.addEventListener('click',ronnyCloseGroups);
 $('ronny-day-groups-shade')?.addEventListener('click',ronnyCloseGroups);
 $('ronny-day-groups-add')?.addEventListener('click',()=>{
  if(!state.settings.dayGroups)state.settings.dayGroups=[];
  const i=Math.max(0,selectedDay);
  state.settings.dayGroups.push({id:uid(),name:'מקטע '+(state.settings.dayGroups.length+1),description:'',fromDayId:state.days[i].dayId,toDayId:state.days[Math.min(state.days.length-1,i+Math.min(3,state.days.length-1))].dayId,color:DAY_ACCENTS[(state.settings.dayGroups.length-1)%DAY_ACCENTS.length]});
  save();ronnyRenderGroupsManager();ronnyRenderGroupBar();
 });
}

function initDaysManager(){
 ronnyInitGroups();
 $('manage-days-trigger').onclick=openDaysManager;
 $('days-manager-close').onclick=closeDaysManager;
 $('days-manager-add').onclick=()=>{$('add-day')?.click();renderDaysManagerRows()};
 $('days-manager-shade').onclick=closeDaysManager;
}

document.getElementById('ronny-local-save-status')?.addEventListener('click',()=>toast('הטיולים נשמרים אוטומטית בדפדפן הזה. לגיבוי או להעברה למחשב אחר השתמש בייצוא וייבוא JSON. אין עדיין סנכרון ענן.'));

// Route order is the source of truth; time labels are derived from that order.
// No route geometry is guessed: when routing is unavailable, clock times use a clearly labelled rough estimate.
const pendingRetimes=new Map();
const scheduleQuality=new Map();
