function openLegEditor(index,clickLocation=null){
 const arr=stops();if(index<1||index>=arr.length||!map)return;
 if(arr[index]?.type==='walkStart')return;
 if(drawLegSession)stopLegDrawing();cancelPointMove();hideContext();hidePointQuick();
 const leg=legAt(index,arr);activeDrawEditLeg=['draw','pencil'].includes(leg.mode)?index:null;renderViaHandles();
 const coords=paintedLegCoordinates.get(index)||legCoords(index,arr);
 const at=clickLocation&&Number.isFinite(clickLocation.lat)&&Number.isFinite(clickLocation.lng)?clickLocation:L.latLng(coords[Math.floor(coords.length/2)]);
 const clickPoint=map.latLngToContainerPoint(at);
 const el=$('leg-editor'),pane=document.querySelector('.map-pane');
 const stayInPlace=!clickLocation&&el.classList.contains('open')&&el.dataset.index===String(index);
 const remembered=stayInPlace?{left:el.style.left,top:el.style.top}:null;
 el.dataset.index=String(index);const geo=stayInPlace&&Number.isFinite(+el.dataset.pointLat)?{lat:+el.dataset.pointLat,lng:+el.dataset.pointLng}:at;el.dataset.pointLat=String(geo.lat);el.dataset.pointLng=String(geo.lng);
 el.innerHTML=`<div class="leg-editor-head"><div><strong>אופן מעבר בין נקודות</strong><small>${esc(arr[index-1].name)} ← ${esc(arr[index].name)}</small></div><span class="popup-drag-handle" role="button" tabindex="0" title="גרור כדי להזיז את החלונית" aria-label="ידית לגרירת החלונית">${icon('grip-horizontal','small-icon')}</span><button class="leg-x" type="button" id="leg-close" aria-label="סגור">${icon('x','small-icon')}</button></div>
 <div class="leg-modes">${[['auto','route','מצא נתיב'],['draw','pencil-line','שרטט נתיב'],['pencil','pencil','עיפרון חופשי'],['straight','move-up-right','קו אווירי']].map(([value,ic,title])=>`<button type="button" class="leg-mode ${leg.mode===value?'selected':''}" data-leg-mode="${value}" aria-pressed="${leg.mode===value}">${icon(ic,'small-icon')} ${title}</button>`).join('')}</div>
 
 <div class="leg-field"><label for="leg-profile">אמצעי תנועה למקטע זה</label><select id="leg-profile" aria-label="אמצעי תנועה למקטע"> <option value="" ${!leg.profile?'selected':''}>ברירת מחדל מהטיול · ${esc(TRAVEL_MODES[dayDefaultProfile()]||TRAVEL_MODES.driving)}</option>${Object.entries(TRAVEL_MODES).map(([k,v])=>`<option value="${k}" ${leg.profile===k?'selected':''}>${v}</option>`).join('')}</select></div>
 <div class="leg-field"><label for="leg-title">תיאור על הדרך</label><input id="leg-title" type="text" maxlength="90" placeholder="כיתוב לאורך התוואי" value="${esc(leg.label||'')}"><small class="leg-quiet-note">מוצג על קטע ישר כשיש מקום פנוי</small></div>
 <div class="leg-time-box">
  <strong style="font-size:12px;color:#405f48">זמני הדרך</strong>
  ${leg.mode==='auto'?`<div class="leg-time-modes" role="radiogroup" aria-label="שיטת עדכון משך הדרך">
   <label><input type="radio" name="leg-time-mode" value="total" ${legTimingMode(leg)==='total'?'checked':''}>משך כולל</label>
   <label><input type="radio" name="leg-time-mode" value="extra" ${legTimingMode(leg)==='extra'?'checked':''}>הוספת דקות</label>
  </div>`:''}
  <div class="leg-field"><label for="leg-duration" id="leg-duration-label">${leg.mode==='auto'&&legTimingMode(leg)==='extra'?'תוספת דקות מעבר לזמן המחושב':'משך מעבר כולל (דקות)'}</label><input id="leg-duration" type="number" min="0" max="2880" step="1" placeholder="${leg.mode==='auto'?'השאר ריק כדי להשתמש בחישוב':'הכנס משך מעבר'}" value="${routeLegMinutes(leg)??''}"></div>
  <div class="leg-time-metrics" id="leg-time-metrics" role="status" aria-live="polite"></div>
  <p class="leg-time-hint" id="leg-time-hint"></p>
 </div>
 ${leg.mode==='auto'?`<div class="leg-waypoints-box"><strong>מעברים הכרחיים (${(leg.viaPoints||[]).length})</strong><div class="leg-waypoints-list">${(leg.viaPoints||[]).map((p,j)=>`<div class="leg-waypoint-row"><span><b class="leg-waypoint-ordinal">${j+1}</b>מעבר הכרחי · ${(+p[0]).toFixed(5)}, ${(+p[1]).toFixed(5)}</span><button type="button" class="waypoint-actions-trigger" data-forced-actions="${j}" title="פעולות מעבר הכרחי ${j+1}" aria-label="פעולות מעבר הכרחי ${j+1}">${icon('ellipsis','small-icon')}</button></div>`).join('')}</div><button type="button" class="leg-waypoints-add" id="leg-forced-add">${icon('map-pin-plus','small-icon')} הוסף מעבר הכרחי במפה</button></div>`:''}
 <div class="leg-extra-actions"><button type="button" id="leg-street-view" title="פותח את Google Maps גם אם אין צילום זמין">${icon('external-link','small-icon')} Street View <span id="leg-sv-status" class="leg-street-status unknown" role="status" aria-live="polite">לא נבדק</span></button><button type="button" id="leg-add-photo">${icon('image-plus','small-icon')} הוסף תמונה</button></div>
 ${['draw','pencil'].includes(leg.mode)?`<div class="leg-draw-buttons"><button type="button" id="leg-start-draw">${icon('pencil-line','small-icon')} חזור לשרטוט</button>${leg.path?.length?`<button type="button" id="leg-clear-draw">איפוס שרטוט</button>`:''}</div>`:''}
 `;
 el.classList.toggle('ronny-leg-compact',pane.clientWidth<600);
 el.classList.toggle('ronny-leg-short',pane.clientHeight<520 || pane.clientWidth<600);
 el.classList.add('open');
 // Use the actual click position. After choosing another mode, retain any manually dragged location.
 if(remembered){el.style.left=remembered.left;el.style.top=remembered.top}
 else positionMapPopover(el,clickPoint);
 $('leg-close').onclick=closeLegEditor;
 $('leg-street-view').onclick=()=>openGoogleStreetView(+el.dataset.pointLat,+el.dataset.pointLng);
 refreshLegStreetViewAvailability(el,+el.dataset.pointLat,+el.dataset.pointLng);
 $('leg-add-photo').onclick=()=>{photoPlacement={lat:+el.dataset.pointLat,lng:+el.dataset.pointLng};$('photo-file').click()};
 $('leg-forced-add')?.addEventListener('click',()=>startForcedWaypointMode(index));
 el.querySelectorAll('[data-forced-actions]').forEach(b=>b.onclick=()=>openForcedWaypointActions(index,+b.dataset.forcedActions));
 renderForcedHandles();
 el.querySelectorAll('[data-leg-mode]').forEach(b=>b.onclick=()=>{const l=getLegMutable(index);
  if(l.mode==='auto'&&b.dataset.legMode!=='auto'&&legTimingMode(l)==='extra'&&routeLegMinutes(l)!==null){
   const base=cachedLegBaseSeconds(index,arr)??approximateLegs(arr)[index-1]?.baseDuration??0;
   l.minutes=Math.round(base/60+routeLegMinutes(l));l.minutesMode='total';
  }
  if(['draw','pencil'].includes(b.dataset.legMode)){startLegDrawing(index,b.dataset.legMode);retimeAfterOrderChange(selectedDay);return}
  l.mode=b.dataset.legMode;l.path=Array.isArray(l.path)?l.path:[];save();invalidate();retimeAfterOrderChange(selectedDay);drawRoute();renderSchedule();openLegEditor(index)
 });
 $('leg-profile').onchange=e=>{const l=getLegMutable(index);l.profile=e.target.value||null;save();invalidate();retimeAfterOrderChange(selectedDay);drawRoute();renderSchedule();toast('אמצעי התנועה של המקטע עודכן')};
 $('leg-title').oninput=e=>{const l=getLegMutable(index);l.label=e.target.value.slice(0,90);save();refreshLegTextLabels();renderSchedule()};
 const timeInput=$('leg-duration');
 const persistLegTime=()=>{const l=getLegMutable(index),v=timeInput.value.trim();if(!l)return;
  l.minutes=v===''?null:Math.min(2880,Math.max(0,Number(v)||0));
  l.minutesMode=el.querySelector('input[name="leg-time-mode"]:checked')?.value||'total';
  save();invalidate();retimeAfterOrderChange(selectedDay);drawRoute();renderSchedule();renderMarkers();updateLegDurationPreview();
 };
 timeInput.addEventListener('input',()=>updateLegDurationPreview());
 timeInput.addEventListener('change',persistLegTime);
 el.querySelectorAll('input[name="leg-time-mode"]').forEach(input=>input.onchange=()=>{
  const original=getLegMutable(index),previous=legTimingMode(original),next=input.value;
  const raw=timeInput.value.trim(),minutes=raw===''?null:Math.max(0,Number(raw)||0);
  if(minutes!==null&&previous!==next){
   const base=cachedLegBaseSeconds(index,arr)??approximateLegs(arr)[index-1]?.baseDuration??0;
   const total=previous==='extra'?Math.round(base/60+minutes):minutes;
   timeInput.value=String(next==='extra'?Math.max(0,Math.round(total-base/60)):Math.round(total));
  }
  original.minutesMode=next;
  $('leg-duration-label').textContent=next==='extra'?'תוספת דקות מעבר לזמן המחושב':'משך מעבר כולל (דקות)';
  persistLegTime();
 });
 updateLegDurationPreview();
 requestAnimationFrame(()=>keepMapPopoverVisible(el));
 $('leg-start-draw')?.addEventListener('click',()=>startLegDrawing(index,leg.mode==='pencil'?'pencil':'draw'));$('leg-add-draw')?.addEventListener('click',()=>{drawLegSession={index,day:selectedDay};closeLegEditor();renderViaHandles();renderDrawBanner();updateMapHint()});$('leg-clear-draw')?.addEventListener('click',async()=>{if(!await confirmOnMap('לאפס את השרטוט של מקטע זה?',{title:'איפוס שרטוט',accept:'אפס שרטוט'}))return;const l=getLegMutable(index);l.path=[];save();drawRoute();openLegEditor(index)});
 refreshIcons();
}

function approximateLegs(list,dayIndex=selectedDay){
 const rad=Math.PI/180;
 const speedFor=p=>p==='driving'?45:p==='cycling'?14:p==='hiking'?3.7:4.5;
 return list.slice(1).map((p,i)=>{
  if(p.type==='walkStart')return {duration:0,baseDuration:0,distance:0,mode:'association',estimated:false,manualMissing:false};
  const index=i+1,conf=legAt(index,list);
  if(conf.mode!=='auto')return manualLeg(index,list);
  const profile=effectiveLegProfile(index,list,dayIndex),speed=speedFor(profile),a=list[i];
  const forced=Array.isArray(conf.viaPoints)?conf.viaPoints:[];
  let km=0;
  if(forced.length)km=distanceOfCoords([[+a.lat,+a.lng],...forced,[+p.lat,+p.lng]])/1000;
  else{
   const lat1=Number(a.lat)*rad,lat2=Number(p.lat)*rad;
   const dlat=lat2-lat1,dlon=(Number(p.lng)-Number(a.lng))*rad;
   const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlon/2)**2;
   km=6371*2*Math.atan2(Math.sqrt(Math.max(0,h)),Math.sqrt(Math.max(0,1-h)));
  }
  const approxSeconds=Math.max(0,Math.round(((km*(profile==='driving'?1.4:1.3)/speed)*60+(km>.1?4:0))/5)*5)*60;
  const routedSeconds=cachedLegBaseSeconds(index,list,dayIndex);
  const measured=routedSeconds!==null;
  return {...legTimingSnapshot(conf,measured?routedSeconds:approxSeconds),distance:km*1000*(forced.length?1:1.3),mode:'auto',estimated:!measured};
 });
}
// RONNY 30.1 — Arrival anchors define the timeline. Departure at an intermediate
// stop is calculated from its arrival and dwell, and editing departure edits dwell.

