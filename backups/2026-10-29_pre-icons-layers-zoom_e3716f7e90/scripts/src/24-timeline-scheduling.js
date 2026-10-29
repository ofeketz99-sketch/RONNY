function ronnyFutureWalkingClock(base,value){
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value||''))return null;
 let result=Math.floor(base/1440)*1440+clockMinutes(value);
 if(result<base)result+=1440;
 return result;
}
function ronnyApplyWalkingTimeline(arr,absolute,anchorIndex,timeAnchor=null){
 let durationChanged=false;
 for(let i=0;i<arr.length;i++){
  const start=arr[i];if(start?.type!=='walkStart')continue;
  let end=-1,turn=-1;
  for(let j=i+1;j<arr.length;j++){
   if(arr[j].type==='walkStart')break;
   if(arr[j].type==='walkTurn'&&turn<0)turn=j;
   if(arr[j].type==='walkEnd'&&arr[j].walkLoopSource===start.id){end=j;break}
  }
  if(end<0)continue;
  const total=Math.max(0,Math.min(3000,Number(start.duration)||0));
  const explicitTurn=ronnyFutureWalkingClock(absolute[i],start.walkTurnClock)??(anchorIndex===turn&&timeAnchor?.stopId===arr[turn]?.id?absolute[turn]:null);
  const explicitFinish=ronnyFutureWalkingClock(explicitTurn??absolute[i],start.walkFinishClock)??(anchorIndex===end&&timeAnchor?.stopId===arr[end]?.id?absolute[end]:null);
  if(total<=0&&explicitTurn===null&&explicitFinish===null)continue;
  const oldEnd=absolute[end],originalStart=absolute[i],originalTurn=turn>i?absolute[turn]:originalStart;
  let finish=explicitFinish??(total>0?originalStart+total:oldEnd);
  let turnTime=turn>i?(explicitTurn??(total>0||explicitFinish!==null?originalStart+Math.round((finish-originalStart)/2):originalTurn)):null;
  if(turnTime!==null&&turnTime>finish)finish=turnTime;
  const stretch=(from,to,newEnd)=>{
   const old=absolute.slice(from,to+1),span=old[to-from]-old[0];
   for(let k=from+1;k<=to;k++){
    const pct=span>0?(old[k-from]-old[0])/span:(k-from)/(to-from);
    absolute[k]=Math.round(absolute[from]+(newEnd-absolute[from])*Math.max(0,Math.min(1,pct)));
   }
  };
  if(turn>i){stretch(i,turn,turnTime);stretch(turn,end,finish)}
  else stretch(i,end,finish);
  const delta=absolute[end]-oldEnd;
  for(let k=end+1;k<absolute.length;k++)absolute[k]+=delta;
  if(explicitFinish!==null&&Math.round(finish-originalStart)!==total){
   start.duration=Math.max(0,Math.min(3000,Math.round(finish-originalStart)));durationChanged=true;
  }
  i=end;
 }
 return durationChanged;
}
function applyItineraryTimes(dayIndex,legs,anchor=0,quality='estimated'){
 const day=state.days[dayIndex],arr=routeStopsForDay(dayIndex);
 if(!arr.length||!Array.isArray(legs)||legs.length!==arr.length-1)return false;
 if(!day.timeAnchor&&day.departureUsesDefault===true&&arr[0]?.type==='start')arr[0].time=tripDefaultDepartureTime();
 let reference=day?.timeAnchor;
 let anchorIndex=reference?arr.findIndex(s=>s.id===reference.stopId):-1;
 if(anchorIndex<0){reference=null;anchorIndex=Math.min(Math.max(0,anchor),arr.length-1);if(day?.timeAnchor)delete day.timeAnchor}
 // A departure explicitly set at the day's first point is the reference for all following times.
 // Never silently transfer its authority to an intermediate arrival.
 if(day?.timeAnchor?.kind==='departure'&&day.timeAnchor.stopId===arr[0]?.id){
  reference=day.timeAnchor;anchorIndex=0;
 }
 const referenceStop=arr[anchorIndex];
 // Older versions let a stop's departure pin its ARRIVAL backward. Restore
 // the arrival-based meaning without moving the existing arrival timestamp.
 // A day's actual starting point is the one exception: its time is departure.
 if(reference?.kind==='departure'&&referenceStop.type!=='start'){
  reference={stopId:referenceStop.id,kind:'arrival',time:referenceStop.time};
  day.timeAnchor=reference;
 }
 const dwell=stop=>['start','walkStart'].includes(stop.type)?0:Math.max(0,Number(stop.duration)||0);
 const hop=i=>dwell(arr[i-1])+Math.ceil(Math.max(0,(Number(legs[i-1]?.duration)||0)/60)/5)*5;
 const absolute=new Array(arr.length);
 // An explicit departure fixes the departure, so subtract the stop's dwell
 // before propagating the arrival to preceding and following locations.
 const baseTime=reference?clockMinutes(reference.time):clockMinutes(referenceStop.time);
 const initialOffset=Number(referenceStop.dayOffset)||0;
 absolute[anchorIndex]=baseTime+initialOffset*1440-(reference?.kind==='departure'?dwell(referenceStop):0);
 for(let i=anchorIndex+1;i<arr.length;i++)absolute[i]=absolute[i-1]+hop(i);
 for(let i=anchorIndex-1;i>=0;i--)absolute[i]=absolute[i+1]-hop(i+1);
 let changed=ronnyApplyWalkingTimeline(arr,absolute,anchorIndex,reference);
 for(let i=0;i<arr.length;i++){
  const time=clockAt(absolute[i]);const extra=Math.floor(absolute[i]/1440);
  if(arr[i].time!==time){arr[i].time=time;changed=true}
  if((arr[i].dayOffset||0)!==extra){arr[i].dayOffset=extra;changed=true}
 }
 scheduleQuality.set(dayIndex,quality);
 if(changed)save();
 return changed;
}
function routeLegsForOrder(dayIndex){
 const arr=routeStopsForDay(dayIndex);
 return routeData?.day===dayIndex&&routeData?.ids?.length===arr.length&&routeData.ids.every((id,i)=>id===arr[i].id)&&routeData.legs?.length===arr.length-1?routeData.legs:null;
}
function retimeAfterOrderChange(dayIndex,anchor=0){
 const arr=routeStopsForDay(dayIndex);
 if(arr.length<1)return;
 const exact=routeLegsForOrder(dayIndex);
 if(exact){applyItineraryTimes(dayIndex,exact,anchor,'routed');pendingRetimes.delete(dayIndex)}
 else{applyItineraryTimes(dayIndex,approximateLegs(arr),anchor,'estimated');pendingRetimes.set(dayIndex,anchor)}
}
function initializePlannerVerticalResize(){
 const upper=$('planner-upper'),handle=$('planner-upper-resizer'),planner=$('planner');if(!upper||!handle||!planner)return;
 function bounds(){const max=Math.max(72,planner.clientHeight-190);return {min:72,max:Math.min(Math.round(planner.clientHeight*.72),max)}}
 function setHeight(n,persist=true){const b=bounds(),h=Math.max(b.min,Math.min(b.max,Math.round(n)));upper.style.height=h+'px';upper.style.flex='0 0 '+h+'px';if(persist){state.settings.plannerUpperHeight=h;save()}handle.setAttribute('aria-valuenow',String(h));return h}
 function reset(){upper.style.height='';upper.style.flex='';delete state.settings.plannerUpperHeight;save();handle.removeAttribute('aria-valuenow')}
 const stored=Number(state.settings.plannerUpperHeight);if(Number.isFinite(stored)&&stored>0)setHeight(stored,false);
 let y=null,h=0,moved=false;
 handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;y=e.clientY;h=upper.getBoundingClientRect().height;moved=false;handle.classList.add('dragging');handle.setPointerCapture(e.pointerId);e.preventDefault()});
 handle.addEventListener('pointermove',e=>{if(y===null)return;const delta=e.clientY-y;if(Math.abs(delta)>3)moved=true;setHeight(h+delta,false)});
 const finish=e=>{if(y===null)return;y=null;handle.classList.remove('dragging');if(moved){state.settings.plannerUpperHeight=Math.round(upper.getBoundingClientRect().height);save()}};
 handle.addEventListener('pointerup',e=>{const clicked=y!==null&&!moved;finish(e);if(clicked)toggleExtreme()});handle.addEventListener('pointercancel',finish);
 function toggleExtreme(){const v=bounds(),height=upper.getBoundingClientRect().height;setHeight(height<=(v.min+v.max)/2?v.max:v.min)}
 handle.addEventListener('click',e=>{if(e.detail===0)toggleExtreme()});
 handle.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(upper.getBoundingClientRect().height+(e.key==='ArrowDown'?24:-24))}else if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleExtreme()}else if(e.key==='Home'){e.preventDefault();setHeight(bounds().min)}else if(e.key==='End'){e.preventDefault();setHeight(bounds().max)}});
 window.addEventListener('resize',()=>{if(state.settings.plannerUpperHeight)setHeight(state.settings.plannerUpperHeight,false)});
}

function repairExistingSchedules(){
 state.days.forEach((day,di)=>{
  const arr=routeStopsForDay(di);
  const backwards=arr.some((s,i)=>i>0&&((Number(s.dayOffset)||0)*1440+clockMinutes(s.time))<((Number(arr[i-1].dayOffset)||0)*1440+clockMinutes(arr[i-1].time)));
  const needsMidpoint=arr.some((s,i)=>{if(s.type!=='walkStart'||s.walkTurnClock||!(+s.duration>0))return false;const next=arr.slice(i+1),turn=next.find(p=>p.type==='walkTurn'),end=next.find(p=>p.type==='walkEnd'&&p.walkLoopSource===s.id);return !!turn&&!!end&&next.indexOf(turn)<next.indexOf(end)&&Math.abs((clockMinutes(turn.time)-clockMinutes(s.time)+1440)%1440-Math.round(s.duration/2))>1;});
  if(backwards||needsMidpoint)retimeAfterOrderChange(di,0);
 });
}
function restorePlannerUpperHeight(){
 const upper=$('planner-upper'),planner=$('planner');if(!upper||!planner)return;
 const val=Number(state.settings.plannerUpperHeight);
 if(Number.isFinite(val)&&val>0){const max=Math.min(planner.clientHeight*.72,planner.clientHeight-190);const h=Math.max(72,Math.min(Math.max(72,max),val));upper.style.height=h+'px';upper.style.flex='0 0 '+h+'px'}
 else{upper.style.height='';upper.style.flex=''}
}
let notesExpandedDay=-1;
function showAllDayNotesOnMap(dayIndex){
 if(!map)return;
 const d=state.days[dayIndex];if(!d)return;
 const points=[...d.stops.filter(validPoint)];
 if(!points.length)return;
 const bounds=L.latLngBounds(points.map(s=>[Number(s.lat),Number(s.lng)]));
 const padding=[65,65];
 if(points.length===1)map.flyTo([Number(points[0].lat),Number(points[0].lng)],Math.min(12,map.getMaxZoom()),{duration:.55});
 else map.fitBounds(bounds,{padding,maxZoom:13,animate:true,duration:.7});
}
function renderDayNotes(){
 const panel=$('planner-notes');if(!panel)return;
 const day=state.days[selectedDay];const notes=(day?.stops||[]).filter(s=>s.type==='note');
 if(!notes.length){panel.hidden=true;panel.innerHTML='';if(notesExpandedDay===selectedDay)notesExpandedDay=-1;return}
 panel.hidden=false;
 const expanded=notesExpandedDay===selectedDay;
 panel.innerHTML=`<button type="button" class="notes-expander" id="notes-expander" aria-expanded="${expanded}">${icon('notebook-pen')}<strong>הערות</strong><span class="notes-count">${notes.length}</span>${icon(expanded?'chevron-up':'chevron-down')}</button>`+
  (expanded?`<div class="notes-list">${notes.map(s=>`<button type="button" class="notes-item" data-note-id="${esc(s.id)}" style="--note-color:${pointColor(s,selectedDay)}"><span class="notes-item-icon">${pointSymbol('note')}</span><span class="notes-item-copy"><strong>${esc(s.name||'הערה')}</strong>${s.description||s.notes?`<small>${esc(s.description||s.notes)}</small>`:''}</span>${icon('map-pin')}</button>`).join('')}</div>`:'');
 panel.querySelector('#notes-expander').onclick=()=>{
  if(notesExpandedDay===selectedDay)notesExpandedDay=-1;
  else{notesExpandedDay=selectedDay;showAllDayNotesOnMap(selectedDay)}
  renderDayNotes();
 };
 panel.querySelectorAll('[data-note-id]').forEach(b=>{b.onclick=()=>focusStop(b.dataset.noteId);b.addEventListener('pointerenter',()=>highlightMapPoint(b.dataset.noteId,true));b.addEventListener('pointerleave',()=>highlightMapPoint(b.dataset.noteId,false))});
 refreshIcons();
}
function mapSidePointsHTML(){
 const day=state.days[selectedDay],side=(day?.stops||[]).filter(isMapOnlyPoint);if(!side.length)return '';
 return `<section class="ronny-side-points" aria-label="נקודות צדדיות שאינן חלק מנתיב הנסיעה"><header><div>${icon('map-pinned','small-icon')}<strong>נקודות צדדיות</strong><span>${side.length}</span></div><small>מחוברות בקו אווירי לנקודת הדרך הקרובה · אינן משנות את המסלול</small></header><div class="ronny-side-points-list">${side.map(p=>`<div class="ronny-side-point ${ronnyBulkStops.has(p.id)?'ronny-bulk-selected':''}" data-side-point="${esc(p.id)}" role="button" tabindex="0" style="--side-accent:${pointColor(p,selectedDay)}">${ronnyBulkMode?`<label class="ronny-side-checkbox"><input type="checkbox" data-ronny-select-id="${esc(p.id)}" ${ronnyBulkStops.has(p.id)?'checked':''} aria-label="בחר ${esc(p.name)}"></label>`:''}<span class="ronny-side-symbol">${pointSymbol(p.type)}</span><div class="ronny-side-copy"><strong>${esc(p.name)}</strong><small>${esc(types[p.type]?.name||'נקודה צדדית')}${(p.description||p.notes)?' · '+esc((p.description||p.notes).slice(0,80)):''}</small></div><button class="ronny-side-edit" data-side-edit="${esc(p.id)}" title="עריכת הנקודה" aria-label="עריכת ${esc(p.name)}">${icon('pencil','small-icon')}</button></div>`).join('')}</div></section>`;
}
function bindMapSidePoints(){const root=$('schedule');root.querySelectorAll('[data-side-point]').forEach(el=>{
 const choose=()=>{const id=el.dataset.sidePoint;if(ronnyBulkMode){ronnyBulkStops.has(id)?ronnyBulkStops.delete(id):ronnyBulkStops.add(id);renderSchedule()}else focusStop(id)};
 el.addEventListener('click',e=>{if(e.target.closest('button,input,label'))return;choose()});
 el.addEventListener('keydown',e=>{if(e.target===el&&['Enter',' '].includes(e.key)){e.preventDefault();choose()}});
 });root.querySelectorAll('[data-side-edit]').forEach(b=>b.onclick=()=>openPointQuick(b.dataset.sideEdit));
}
function renderSchedule(){const b=$('ronny-default-departure');if(b){b.querySelector('span').textContent=tripDefaultDepartureTime();b.onclick=()=>openSettings('trip')}renderSegmentChips();const legacyNotePanel=$('planner-notes');if(legacyNotePanel)legacyNotePanel.hidden=true;let list=stops();$('stop-count').textContent=list.length+' עצירות';$('auto-time').title='תזמון לפי סדר העצירות וזמני הדרך. כשהניתוב אינו זמין, השעות מסומנות כאומדן בלבד';$('day-budget').textContent=money((state.days[selectedDay]?.stops||[]).reduce((a,s)=>a+(Number(s.cost)||0),0));if(!list.length){$('schedule').innerHTML=ronnyBulkToolbar('day')+dayOutlineBridgeHTML()+mapSidePointsHTML()+`<div class="no-stops"><span style="font-size:32px">🧭</span><strong>${(state.days[selectedDay]?.stops||[]).some(isMapOnlyPoint)?'עדיין אין נקודות דרך':'היום הזה עדיין ריק'}</strong><p>הוסף נקודת התחלה, מעבר, עצירה או סיום כדי ליצור נתיב נסיעה.</p><button class="btn btn-primary" id="empty-add">${icon('plus')} הוספת עצירה</button></div>`;$('empty-add').onclick=()=>openStopForm();bindRonnyBulkToolbar($('schedule'),'day');bindMapSidePoints();bindDayOutlineBridge();refreshIcons();return}
$('schedule').innerHTML=ronnyBulkToolbar('day')+dayOutlineBridgeHTML()+list.map((s,i)=>{const seg=segmentFor(s),prev=i?segmentFor(list[i-1]):null;const segmentHead=(seg?.id!==prev?.id)?`<div class="segment-heading" style="--segment-color:${seg?.color||'#a0b1be'}"><span>${esc(seg?.label||'ללא מקטע זמן')}</span><small>${seg?esc(seg.start)+'–'+esc(seg.end):''}</small></div>`:'';
 const rawLeg=routeData?.day===selectedDay&&routeData.ids?.[i]===s.id?routeData.legs?.[i-1]:null;const leg=rawLeg&&Number.isFinite(rawLeg.duration)&&Number.isFinite(rawLeg.distance)?rawLeg:null;
 const conf=i?legAt(i,list):null;
 const legAdjustment=leg?.manualOverride&&Number.isFinite(leg.baseDuration)?` · בסיס ${minsFmt(leg.baseDuration/60)}, ${leg.adjustmentMinutes>=0?'+':'−'}${minsFmt(Math.abs(leg.adjustmentMinutes))}`:'';
 const travel=i?`<div class="drive-note" style="--leg-color:${pointColor(s,selectedDay)}"><button class="leg-open" data-leg-index="${i}" type="button" title="שנה אופן מעבר או הוסף כיתוב">${icon(['draw','pencil'].includes(conf.mode)?'pencil-line':conf.mode==='straight'?'move-up-right':effectiveLegProfile(i,list)==='cycling'?'bike':effectiveLegProfile(i,list)==='driving'?'car-front':'footprints')} <span><strong>${esc(conf.label||routeModeName(conf.mode))}</strong> · ${leg?(leg.manualMissing?'משך לא הוגדר':minsFmt(leg.duration/60))+' · '+(leg.distance/1000).toFixed(1)+' ק״מ'+legAdjustment:conf.mode!=='auto'?(routeLegMinutes(conf)===null?'משך לא הוגדר':minsFmt(routeLegMinutes(conf)))+' · מעבר ידני':(conf.mode==='auto'&&routeLegMinutes(conf)!==null?minsFmt(approximateLegs(list)[i-1]?.duration/60)+' · זמני כביש באומדן': 'זמן הנסיעה טרם חושב')}</span>${icon('settings-2','small-icon')}</button></div>`:'';
 return `${segmentHead}<div class="stop ${ronnyBulkStops.has(s.id)?'ronny-bulk-selected':''} ${selectedStop===s.id?'focused':''} ${s.autoLoopEnd?'ronny-shared-loop-end':''}" data-stop="${esc(s.id)}" data-ronny-route-order="${i+1}" draggable="${!s.autoLoopEnd}" role="button" tabindex="0" aria-label="${esc(s.name)} — התמקדות במפה" style="--stop-color:${pointColor(s,selectedDay)}">${travel}${ronnyBulkMode&&!s.autoLoopEnd?`<label class="ronny-bulk-check" title="בחר נקודה למחיקה"><input type="checkbox" data-ronny-select-id="${esc(s.id)}" ${ronnyBulkStops.has(s.id)?'checked':''} aria-label="בחר נקודה ${esc(s.name)}"></label>`:''}<div class="stop-grid"><div class="stop-time">${s.type==='start'?(state.days[selectedDay]?.loop?'<small class="departure-flag">יציאה וסיום</small>':'<small class="departure-flag">יציאה</small>'):s.autoLoopEnd?`<small class="departure-flag">${s.autoTripLoopEnd?'חזרה לתחילת הטיול':'חזרה להתחלה'}</small>`:''}${esc(s.time||'--:--')}${s.dayOffset?`<small style="display:block">+${s.dayOffset} יום</small>`:''}</div><div class="stop-body" style="--stop-color:${pointColor(s,selectedDay)}"><span class="stop-order-badge ${s.type==='via'?'is-number':'is-type-icon'}" aria-label="${esc(s.type==='via'?'נקודת מעבר '+(i+1):types[s.type]?.name||'נקודת דרך')}">${s.type==='via'?i+1:pointSymbol(s.autoLoopEnd||(s.type==='start'&&state.days[selectedDay]?.loop)?'loop':s.type)}</span><div class="stop-main"><div class="stop-emoji point-stop-symbol" style="--symbol-color:${pointColor(s,selectedDay)}" aria-hidden="true">${s.type==='via'?icon('route','small-icon'):''}</div><div class="stop-info"><div class="stop-title" title="${esc(s.name)}">${esc(s.name)}</div><div class="stop-secondary"><span>${esc(types[s.type]?.name||'עצירה')}</span><span class="dot"></span><span>${s.autoLoopEnd?(s.autoTripLoopEnd?'נקודת ההתחלה של הטיול':'אותו מיקום של נקודת היציאה'):s.type==='walkStart'?(s.duration?minsFmt(+s.duration)+' זמן ההליכה':'זמן הליכה טרם הוגדר'):s.type==='start'?(state.days[selectedDay]?.loop?'נקודת יציאה וסיום':'שעת יציאה'):s.duration?minsFmt(+s.duration)+(s.type==='rest'?' עצירה':''):'ללא משך'}${!['start','end','walkStart'].includes(s.type)&&s.duration?` · יציאה ${quickEndTime(s.time,s.duration).slice(0,5)}`:''}</span>${s.cost?`<span class="dot"></span><span>${money(s.cost)}</span>`:''}</div></div><div class="stop-tools">${s.autoLoopEnd?`<button class="micro" title="הגדרות יום מעגלי" data-loop-day="${esc(s.id)}">${icon('settings-2')}</button>`:`<button class="micro" title="הזז למעלה" data-move="-1" data-id="${esc(s.id)}">${icon('chevron-up')}</button><button class="micro" title="הזז למטה" data-move="1" data-id="${esc(s.id)}">${icon('chevron-down')}</button><button class="micro" title="ערוך" data-edit="${esc(s.id)}">${icon('pencil')}</button>`}</div></div>${s.type==='hotel'?`<div class="mini-hotels">${icon('moon-star')} מקום לינה לאורך המסלול</div>`:''}${(s.description||s.notes)?`<div class="stop-note">${icon('notebook-pen')} ${esc(s.description||s.notes)}</div>`:''}</div></div></div>`
 }).join('')+mapSidePointsHTML();
$('schedule').querySelectorAll('[data-stop]').forEach(el=>{el.onclick=e=>{if(e.target.closest('input,label,[data-ronny-select-id],[data-move],[data-edit],[data-leg-index]'))return;if(ronnyBulkMode){const id=el.dataset.stop;ronnyBulkStops.has(id)?ronnyBulkStops.delete(id):ronnyBulkStops.add(id);renderSchedule();return}focusStop(el.dataset.stop)};el.addEventListener('keydown',e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(ronnyBulkMode){const id=el.dataset.stop;ronnyBulkStops.has(id)?ronnyBulkStops.delete(id):ronnyBulkStops.add(id);renderSchedule()}else focusStop(el.dataset.stop)}});el.addEventListener('pointerenter',()=>highlightMapPoint(el.dataset.stop,true));el.addEventListener('pointerleave',()=>highlightMapPoint(el.dataset.stop,false));el.addEventListener('focusin',()=>highlightMapPoint(el.dataset.stop,true));el.addEventListener('focusout',()=>highlightMapPoint(el.dataset.stop,false));el.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',el.dataset.stop);e.dataTransfer.effectAllowed='move';requestAnimationFrame(()=>el.classList.add('is-dragging'))});el.addEventListener('dragend',()=>{$('schedule').querySelectorAll('.is-dragging,.is-drop-target').forEach(x=>x.classList.remove('is-dragging','is-drop-target'))});el.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';$('schedule').querySelectorAll('.is-drop-target').forEach(x=>{if(x!==el)x.classList.remove('is-drop-target')});if(!el.classList.contains('is-dragging'))el.classList.add('is-drop-target')});el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget))el.classList.remove('is-drop-target')});el.addEventListener('drop',e=>{e.preventDefault();const from=e.dataTransfer.getData('text/plain'),to=el.dataset.stop;$('schedule').querySelectorAll('.is-dragging,.is-drop-target').forEach(x=>x.classList.remove('is-dragging','is-drop-target'));reorder(from,to)})});
bindRonnyBulkToolbar($('schedule'),'day');bindMapSidePoints();bindDayOutlineBridge();
$('schedule').querySelectorAll('[data-leg-index]').forEach(el=>{
 el.onclick=e=>{e.stopPropagation();openLegEditor(+el.dataset.legIndex)};
 el.addEventListener('pointerenter',()=>spotlightLeg(+el.dataset.legIndex));
 el.addEventListener('pointerleave',()=>spotlightLeg(+el.dataset.legIndex,false));
 el.addEventListener('focus',()=>spotlightLeg(+el.dataset.legIndex));
 el.addEventListener('blur',()=>spotlightLeg(+el.dataset.legIndex,false));
});
$('schedule').querySelectorAll('[data-move]').forEach(el=>el.onclick=e=>{e.stopPropagation();moveStop(el.dataset.id,+el.dataset.move)});
$('schedule').querySelectorAll('[data-edit]').forEach(el=>el.onclick=e=>{e.stopPropagation();openPointQuick(el.dataset.edit)});$('schedule').querySelectorAll('[data-loop-day]').forEach(el=>el.onclick=e=>{e.stopPropagation();editDay()});
refreshIcons()}

function captureSchedulePositions(){
 const schedule=$('schedule'),before=new Map();
 schedule.querySelectorAll('.stop[data-stop]').forEach(el=>before.set(el.dataset.stop,el.getBoundingClientRect()));
 return before;
}
function animateScheduleReorder(before,movedIds=[]){
 if(!before||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
 const schedule=$('schedule'),bounds=schedule.getBoundingClientRect();
 schedule.querySelectorAll('.stop[data-stop]').forEach(el=>{
   const old=before.get(el.dataset.stop);if(!old)return;
   const next=el.getBoundingClientRect();
   if((old.bottom<bounds.top&&next.bottom<bounds.top)||(old.top>bounds.bottom&&next.top>bounds.bottom))return;
   const dx=old.left-next.left,dy=old.top-next.top;
   if(Math.abs(dx)>1||Math.abs(dy)>1){
     el.animate([
       {transform:`translate(${dx}px, ${dy}px)`,opacity:.81},
       {transform:'translate(0px, 0px)',opacity:1}
     ],{duration:440,easing:'cubic-bezier(.2,.84,.25,1)',fill:'both'});
   }
   if(movedIds.includes(el.dataset.stop)){
     el.classList.add('reorder-arrived');
     el.addEventListener('animationend',()=>el.classList.remove('reorder-arrived'),{once:true});
   }
 });
 // Geographic positions stay fixed; pulse the matching map badges to acknowledge
 // their new order labels while the associated card (icon + text) slides as one.
 markerLayer?.eachLayer?.(marker=>{
  if(!movedIds.includes(marker.options?.ronnyStopId))return;
  const badge=marker.getElement?.()?.querySelector('.point-pin');
  if(badge?.animate)badge.animate([
   {filter:'brightness(1)',scale:'1'},
   {filter:'brightness(1.16) drop-shadow(0 0 8px var(--pin-color))',scale:'1.18',offset:.45},
   {filter:'brightness(1)',scale:'1'}
  ],{duration:560,easing:'cubic-bezier(.2,.8,.3,1)'});
 });
}
// RONNY 35.10: The list is a sequence of fixed, numbered positions.
// Cards (with their geographic coordinates) may move between positions.
// Start/end describe the first/last position rather than a permanently pinned place.
function commitOrderedDaySlots(dayIndex,ordered){
 const day=state.days[dayIndex];if(!day)return;
 const last=ordered.length-1;
 for(let i=0;i<ordered.length;i++){
  const s=ordered[i],before=s.type;
  const after=ordered.length<2?(before==='end'?'start':before):(i===0?'start':i===last?'end':(before==='start'||before==='end'?'via':before));
  if(before===after)continue;
  const name=String(s.name||'').trim();
  const defaults={start:'נקודת התחלה',end:'נקודת סיום',via:'נקודת מעבר',rest:'נקודת עצירה'};
  // Update ONLY a generic type label, never a custom place name.
  const generic=name===defaults[before]||(before==='via'&&/^נקודת מעבר\s*\d+$/.test(name))||(['start','end'].includes(before)&&ronnyIsAutoEndpointName(name))||!!s.autoChronoName;
  s.type=after;
  if(generic){s.name=defaults[after]||defaults.via;s.autoViaName=false;s.autoPlaceName=false;s.autoChronoName=false}
 }
 commitRouteOrder(dayIndex,ordered);
 renumberWaypoints(day);
}
function moveStop(id,delta){
 const arr=stops(),idx=arr.findIndex(s=>s.id===id),next=idx+delta;
 if(idx<0||next<0||next>=arr.length)return;
 const before=captureSchedulePositions(),other=arr[next].id;
 [arr[idx],arr[next]]=[arr[next],arr[idx]];
 commitOrderedDaySlots(selectedDay,arr);invalidate();retimeAfterOrderChange(selectedDay);save();renderAll();
 animateScheduleReorder(before,[id,other]);
}
function reorder(from,to){
 const arr=stops();let a=arr.findIndex(s=>s.id===from),b=arr.findIndex(s=>s.id===to);
 if(a<0||b<0||a===b)return;
 const before=captureSchedulePositions();
 // Two fixed sequence positions exchange their cards, including their locations.
 [arr[a],arr[b]]=[arr[b],arr[a]];
 commitOrderedDaySlots(selectedDay,arr);invalidate();retimeAfterOrderChange(selectedDay);save();renderAll();
 animateScheduleReorder(before,[from,to]);
}

function invalidate(){routeToken++;clearTimeout(routeDebounce);routeController?.abort();routeController=null;routeData=null;routeError='';}
// RONNY 35.31: temporary map distance measurement, independent of trip data and routing.
const ronnyMeasure={active:false,points:[],undoLengths:[],hover:null,pointerId:null,dragging:false,prevDragEnabled:true,prevDblClickEnabled:true};
let ronnyMeasureLayer=null;
