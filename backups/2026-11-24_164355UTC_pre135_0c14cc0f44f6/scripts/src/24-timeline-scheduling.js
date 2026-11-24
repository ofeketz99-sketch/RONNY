function ronnyFutureWalkingClock(base,value){
 if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value||''))return null;
 let result=Math.floor(base/1440)*1440+clockMinutes(value);
 if(result<base){
  result+=1440;
  // An earlier clock is an overnight walk only when the span is plausible.
  if(result-base>=720)return null;
 }
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
// Patch 130: a point can lock its arrival time ("we arrive at the bar at 14:30").
// Everything before it is planned as usual; the difference between when you would arrive
// and the locked time is shown as free time (positive) or as being late (negative).
const ronnyTimeGaps=new Map();
// The lock's day: the occurrence nearest to when you would arrive, but never earlier than 3 hours before the day starts
// (so 23:00 on a morning plan is tonight, not last night, and 00:15 after a late evening is after midnight).
function ronnyLockMinute(stop,natural,dayStart=natural){
 if(!stop?.timeLock||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(stop.timeLock)||['start','end'].includes(stop.type)||WALK_TYPES.has(stop.type)||stop.autoLoopEnd)return null;
 const clock=clockMinutes(stop.timeLock);let lock=clock+Math.round((natural-clock)/1440)*1440;
 while(lock<dayStart-180)lock+=1440;
 return lock;
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
 // Keep exact time along the day and round only the shown clock, so rounding never accumulates.
 const hop=i=>dwell(arr[i-1])+Math.max(0,(Number(legs[i-1]?.duration)||0)/60);
 const exact=new Array(arr.length),absolute=new Array(arr.length);
 // An explicit departure fixes the departure, so subtract the stop's dwell
 // before propagating the arrival to preceding and following locations.
 const baseTime=reference?clockMinutes(reference.time):clockMinutes(referenceStop.time);
 const initialOffset=Number(referenceStop.dayOffset)||0;
 const anchorMinute=baseTime+initialOffset*1440-(reference?.kind==='departure'?dwell(referenceStop):0);
 exact[anchorIndex]=0;
 for(let i=anchorIndex+1;i<arr.length;i++)exact[i]=exact[i-1]+hop(i);
 for(let i=anchorIndex-1;i>=0;i--)exact[i]=exact[i+1]-hop(i+1);
 for(let i=0;i<arr.length;i++)absolute[i]=anchorMinute+Math.round(exact[i]/5)*5;
 let changed=ronnyApplyWalkingTimeline(arr,absolute,anchorIndex,reference);
 const gaps=new Map();let shift=0;
 for(let i=anchorIndex+1;i<arr.length;i++){
  absolute[i]+=shift;
  const locked=ronnyLockMinute(arr[i],absolute[i],absolute[0]);if(locked==null)continue;
  const diff=locked-absolute[i];if(Math.abs(diff)>=5)gaps.set(arr[i].id,diff);
  // Early: wait for the locked time. Late: you really arrive later, so the rest of the day follows the real arrival.
  if(diff>0){absolute[i]=locked;shift+=diff}
 }
 ronnyTimeGaps.set(dayIndex,gaps);
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
let ronnyClampPlannerUpper=()=>{};
function initializePlannerVerticalResize(){
 const upper=$('planner-upper'),handle=$('planner-upper-resizer'),planner=$('planner');if(!upper||!handle||!planner)return;
 // Patch 130: never taller than its own content, so a saved height cannot leave an empty band.
 function natural(){const h=upper.style.height,f=upper.style.flex;upper.style.height='';upper.style.flex='';const n=upper.scrollHeight;upper.style.height=h;upper.style.flex=f;return n}
 function bounds(){const max=Math.max(72,planner.clientHeight-190);return {min:72,max:Math.max(72,Math.min(Math.round(planner.clientHeight*.72),max,natural()))}}
 ronnyClampPlannerUpper=()=>{if(state.settings.plannerUpperHeightV2)setHeight(state.settings.plannerUpperHeightV2,false)};
 function setHeight(n,persist=true){const b=bounds(),h=Math.max(b.min,Math.min(b.max,Math.round(n)));upper.style.height=h+'px';upper.style.flex='0 0 '+h+'px';if(persist){state.settings.plannerUpperHeightV2=h;save()}handle.setAttribute('aria-valuenow',String(h));return h}
 function reset(){upper.style.height='';upper.style.flex='';delete state.settings.plannerUpperHeightV2;save();handle.removeAttribute('aria-valuenow')}
 const stored=Number(state.settings.plannerUpperHeightV2);if(Number.isFinite(stored)&&stored>0)setHeight(stored,false);
 let y=null,h=0,moved=false;
 handle.addEventListener('pointerdown',e=>{if(e.button!==0)return;y=e.clientY;h=upper.getBoundingClientRect().height;moved=false;handle.classList.add('dragging');handle.setPointerCapture(e.pointerId);e.preventDefault()});
 handle.addEventListener('pointermove',e=>{if(y===null)return;const delta=e.clientY-y;if(Math.abs(delta)>3)moved=true;setHeight(h+delta,false)});
 const finish=e=>{if(y===null)return;y=null;handle.classList.remove('dragging');if(moved){state.settings.plannerUpperHeightV2=Math.round(upper.getBoundingClientRect().height);save()}};
 handle.addEventListener('pointerup',e=>{const clicked=y!==null&&!moved;finish(e);if(clicked)toggleExtreme()});handle.addEventListener('pointercancel',finish);
 function toggleExtreme(){const v=bounds(),height=upper.getBoundingClientRect().height;setHeight(height<=(v.min+v.max)/2?v.max:v.min)}
 handle.addEventListener('click',e=>{if(e.detail===0)toggleExtreme()});
 handle.addEventListener('keydown',e=>{if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();setHeight(upper.getBoundingClientRect().height+(e.key==='ArrowDown'?24:-24))}else if(e.key==='Enter'||e.key===' '){e.preventDefault();toggleExtreme()}else if(e.key==='Home'){e.preventDefault();setHeight(bounds().min)}else if(e.key==='End'){e.preventDefault();setHeight(bounds().max)}});
 window.addEventListener('resize',()=>{if(state.settings.plannerUpperHeightV2)setHeight(state.settings.plannerUpperHeightV2,false)});
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
 const val=Number(state.settings.plannerUpperHeightV2);
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
 return `<section class="ronny-side-points" aria-label="נקודות צדדיות שאינן חלק מנתיב הנסיעה"><header><div>${icon('map-pinned','small-icon')}<strong>מחוץ ללו״ז</strong><span>${side.length}</span></div><small>נקודות צד מחוברות בקו מקווקו לעצירה הקרובה · רעיונות ללא קישור</small></header><div class="ronny-side-points-list">${side.map(p=>`<div class="ronny-side-point ${ronnyBulkStops.has(p.id)?'ronny-bulk-selected':''}" data-side-point="${esc(p.id)}" role="group" aria-label="${esc(p.name)}" tabindex="0" style="--side-accent:${pointColor(p,selectedDay)}">${ronnyBulkMode?`<label class="ronny-side-checkbox"><input type="checkbox" data-ronny-select-id="${esc(p.id)}" ${ronnyBulkStops.has(p.id)?'checked':''} aria-label="בחר ${esc(p.name)}"></label>`:''}<span class="ronny-side-symbol">${ronnyPointSymbol(p.type,p)}</span><div class="ronny-side-copy"><strong>${esc(p.name)}</strong><small>${ronnyRoleChip(p)}${esc(types[p.type]?.name||'נקודה צדדית')}${(p.description||p.notes)?' · '+esc((p.description||p.notes).slice(0,80)):''}</small></div><button type="button" class="ronny-side-schedule" data-side-schedule="${esc(p.id)}" title="הוסף ללוח הזמנים ולמסלול (שומר שם, מיקום ועלות)" aria-label="הוסף את ${esc(p.name)} ללוח הזמנים">${icon('calendar-plus','small-icon')}<span>ללו״ז</span></button><button class="ronny-side-edit" data-side-edit="${esc(p.id)}" title="עריכת הנקודה" aria-label="עריכת ${esc(p.name)}">${icon('pencil','small-icon')}</button></div>`).join('')}</div></section>`;
}
function bindMapSidePoints(){const root=$('schedule');root.querySelectorAll('[data-side-point]').forEach(el=>{
 const choose=()=>{const id=el.dataset.sidePoint;if(ronnyBulkMode){ronnyBulkStops.has(id)?ronnyBulkStops.delete(id):ronnyBulkStops.add(id);renderSchedule()}else focusStop(id)};
 el.addEventListener('click',e=>{if(e.target.closest('button,input,label'))return;choose()});
 el.addEventListener('keydown',e=>{if(e.target===el&&['Enter',' '].includes(e.key)){e.preventDefault();choose()}});
 });root.querySelectorAll('[data-side-edit]').forEach(b=>b.onclick=()=>openPointQuick(b.dataset.sideEdit));root.querySelectorAll('[data-side-schedule]').forEach(b=>b.onclick=e=>{e.stopPropagation();ronnySetPointRole(b.dataset.sideSchedule,'stop')});
}
// Day-at-a-glance: only use confirmed leg values or explicitly entered manual estimates.
function renderCompactDaySummary(){
 // Patch 130: the day's numbers sit in the top bar beside the whole-trip numbers; warnings stay above the schedule.
 const panel=$('ronny-day-summary'),warnSlot=$('ronny-day-warnings');if(!panel)return;
 const caption=$('ronny-day-summary-caption');if(caption)caption.textContent='יום '+(selectedDay+1);
 const day=state.days[selectedDay];if(!day){panel.innerHTML='';if(warnSlot)warnSlot.innerHTML='';return}
 const list=routeStopsForDay(selectedDay).filter(validPoint);
 const legs=routeLegsForOrder(selectedDay);
 const counted=ronnyCountedCosts(),moneyTotal=(day.stops||[]).reduce((sum,p)=>sum+ronnyCountedCost(p,counted),0)+
  (state.extraExpenses||[]).filter(x=>x.dayId===day.dayId).reduce((sum,x)=>sum+(Number(x.amount)||0),0);
 const stay=list.filter(p=>!['start','end','walkStart','walkEnd','walkTurn','via'].includes(p.type))
  .reduce((sum,p)=>sum+Math.max(0,Number(p.duration)||0),0);
 const walks=TripModel.walkBlocks(list,TripStateCommands.routeUnits),insideWalk=i=>walks.some(b=>i>b.from&&i<=b.to);
 const walkTotal=walks.reduce((sum,b)=>sum+(TripModel.walkMinutes(b)||0),0);
 let seconds=0,meters=0,pending=0,walkMeters=0,estimated=false;
 for(let i=1;i<list.length;i++){
  if(list[i].type==='walkStart')continue; // Dotted connector is not a travel leg.
  const routed=legs?.[i-1],cfg=legAt(i,list);
  if(insideWalk(i)){
   // Walking has its own stat, so it is never counted as time on the road.
   if(Number.isFinite(routed?.distance))walkMeters+=routed.distance;
   else if(cfg.mode!=='auto'){const shape=legCoords(i,list);if(shape?.length>1)walkMeters+=distanceOfCoords(shape)}
   estimated=estimated||!!routed?.estimated;
   continue;
  }
  if(Number.isFinite(routed?.duration)&&Number.isFinite(routed?.distance)){
   seconds+=routed.duration;meters+=routed.distance;estimated=estimated||!!routed.estimated;
  }else if(cfg.mode!=='auto'){
   const m=routeLegMinutes(cfg);
   if(m===null)pending++;else seconds+=m*60;
   const geometry=legCoords(i,list);
   if(geometry?.length>1)meters+=distanceOfCoords(geometry);
  }else pending++;
 }
 const start=list.find(p=>p.type==='start')||list[0];
 const end=list.findLast(p=>p.type==='end')||list.at(-1);
 const times=start?.time&&end?.time?start.time.slice(0,5)+'–'+end.time.slice(0,5):'—';
 const warnings=[];
 if(!start||start.type!=='start')warnings.push('חסרה נקודת יציאה');
 if(!end||end.type!=='end')warnings.push('חסרה נקודת סיום');
 if(pending)warnings.push(pending+' מקטעים ללא נתוני דרך מלאים');
 const statIcons={'שעות':'clock-3','זמן בדרך':'car-front','הליכה':'footprints','זמן שהייה':'hourglass','מרחק':'route','עלות היום':'wallet'};
 const stat=(label,value,extra='')=>'<span class="ronny-day-stat" title="'+esc(label+(extra?' · '+extra:''))+'">'+icon(statIcons[label]||'circle','small-icon')+'<strong>'+value+'</strong><small>'+label+'</small>'+(extra?'<em>'+extra+'</em>':'')+'</span>';
 const approx=estimated?'~':'',totalMeters=meters+walkMeters;
 const warningsHTML=warnings.length?'<div class="ronny-day-warnings">'+icon('alert-triangle','small-icon')+warnings.map(esc).join(' · ')+'</div>':'';
 if(warnSlot)warnSlot.innerHTML=warningsHTML;
 panel.innerHTML='<div class="ronny-day-summary-main'+(walks.length?' has-walk':'')+'">'+
  stat('שעות',esc(times))+stat('זמן בדרך',pending&&!seconds?'—':approx+minsFmt(Math.round(seconds/60)),pending?'חלקי':estimated?'אומדן':'')+
  (walks.length?stat('הליכה',minsFmt(walkTotal),walkMeters?approx+(walkMeters/1000).toFixed(1)+' ק״מ':''):'')+
  stat('זמן שהייה',minsFmt(stay))+stat('מרחק',pending&&!totalMeters?'—':approx+(totalMeters/1000).toFixed(1)+' ק״מ',pending?'חלקי':estimated?'אומדן':'')+
  stat('עלות היום',money(moneyTotal))+'</div>';
}
// A walk renders as one activity: a head with the whole span, and its points as sub-points.
function ronnyWalkBlockHTML(list,unit,inner){
 const start=list[unit.from],end=list[unit.to],id=esc(start.id),minutes=TripModel.walkMinutes({start,end}),legs=routeLegsForOrder(selectedDay);
 let meters=0,exact=true;
 for(let i=unit.from+1;i<=unit.to;i++){
  const routed=legs?.[i-1];
  if(Number.isFinite(routed?.distance)){meters+=routed.distance;if(routed.estimated)exact=false}
  else if(legAt(i,list).mode!=='auto')meters+=distanceOfCoords(legCoords(i,list));
  else exact=false;
 }
 const custom=String(start.name||'').trim(),title=custom&&custom!==types.walkStart.name?custom:'מסלול הליכה';
 const details=[start.time&&end.time?start.time.slice(0,5)+'–'+end.time.slice(0,5):'',minutes?minsFmt(minutes):'משך לא הוגדר',meters?(exact?'':'~')+(meters/1000).toFixed(1)+' ק״מ':''].filter(Boolean).join(' · ');
 return '<section class="ronny-walk-block" data-walk-block="'+id+'" style="--walk-color:'+pointColor(start,selectedDay)+'"><div class="ronny-walk-head" data-walk-head="'+id+'" data-drag-ok="1" role="group" tabindex="0" aria-label="'+esc(title+': '+details)+'"><span class="ronny-drag-grip" data-drag-grip title="גרור כדי להזיז את כל ההליכה" aria-hidden="true">'+icon('grip-vertical')+'</span><span class="ronny-walk-time" aria-hidden="true">'+esc(String(start.time||'--:--').slice(0,5))+(end.time?'<small>'+esc(String(end.time).slice(0,5))+'</small>':'')+'</span><span class="ronny-walk-node">'+icon('footprints','small-icon')+'</span><div class="ronny-walk-copy"><strong>'+esc(title)+'<span>'+(start.walkRetrace?'הלוך־חזור':'מעגלי')+'</span></strong><small>'+esc(details)+'</small></div><div class="stop-tools"><button class="micro" title="הזז את כל ההליכה למעלה" aria-label="הזז את כל ההליכה למעלה" data-move="-1" data-id="'+id+'">'+icon('chevron-up')+'</button><button class="micro" title="הזז את כל ההליכה למטה" aria-label="הזז את כל ההליכה למטה" data-move="1" data-id="'+id+'">'+icon('chevron-down')+'</button><button class="micro" title="ערוך את ההליכה" aria-label="ערוך את ההליכה" data-edit="'+id+'">'+icon('pencil')+'</button></div></div><div class="ronny-walk-subs">'+inner+'</div></section>';
}
function ronnyComposeSchedule(list,cards){
 return TripStateCommands.routeUnits(list).map(unit=>unit.walk?cards[unit.from].travel+ronnyWalkBlockHTML(list,unit,cards.slice(unit.from,unit.to+1).map(c=>c.card).join('')):cards[unit.from].card).join('');
}
function ronnyBindWalkHeads(){
 $('schedule').querySelectorAll('[data-walk-head]').forEach(el=>{
  const id=el.dataset.walkHead;
  el.addEventListener('click',e=>{if(!e.target.closest('button'))focusStop(id)});
  el.addEventListener('keydown',e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();focusStop(id)}});
  el.addEventListener('pointerenter',()=>highlightMapPoint(id,true));
  el.addEventListener('pointerleave',()=>highlightMapPoint(id,false));
 });
}
function ronnySyncSeparatorValues(){
 for(const [id,target,size] of [['planner-resizer',$('planner'),'width'],['rail-resizer',document.querySelector('.rail'),'width'],['drawer-resizer',$('drawer'),'width'],['planner-upper-resizer',$('planner-upper'),'height']]){
  const handle=$(id);if(!handle||!target)continue;
  const value=Math.round(target.getBoundingClientRect()[size]);
  handle.setAttribute('aria-valuemin','0');handle.setAttribute('aria-valuemax',String(Math.max(value,size==='width'?innerWidth:innerHeight)));handle.setAttribute('aria-valuenow',String(value));
 }
}
function renderSchedule(){
 // Patch 133: a day with locked times is recalculated the first time it is shown, so locks and gaps are right after loading.
 if(!ronnyTimeGaps.has(selectedDay)&&(state.days[selectedDay]?.stops||[]).some(p=>p.timeLock)){ronnyTimeGaps.set(selectedDay,new Map());retimeAfterOrderChange(selectedDay)}
 renderCompactDaySummary();ronnyClampPlannerUpper();const b=$('ronny-default-departure');if(b){b.querySelector('span').textContent=tripDefaultDepartureTime();b.onclick=()=>openSettings('trip')}const legacyNotePanel=$('planner-notes');if(legacyNotePanel)legacyNotePanel.hidden=true;let list=stops();const nightIndex=ronnyNightIndex(),countedCosts=TripModel.costsFromIndex(nightIndex);$('stop-count').textContent=list.length+' עצירות';$('auto-time').title='תזמון לפי סדר העצירות וזמני הדרך. כשהניתוב אינו זמין, השעות מסומנות כאומדן בלבד';$('day-budget').textContent=money((state.days[selectedDay]?.stops||[]).reduce((a,s)=>a+ronnyCountedCost(s,countedCosts),0)+(state.extraExpenses||[]).filter(x=>x.dayId===state.days[selectedDay]?.dayId).reduce((a,x)=>a+(Number(x.amount)||0),0));if(!list.length){$('schedule').innerHTML=ronnyBulkToolbar('day')+dayOutlineBridgeHTML()+ronnyDayLinkBand(selectedDay-1)+mapSidePointsHTML()+`<div class="no-stops"><span style="font-size:32px">🧭</span><strong>${(state.days[selectedDay]?.stops||[]).some(isMapOnlyPoint)?'עדיין אין נקודות דרך':'היום הזה עדיין ריק'}</strong><p>הוסף נקודת התחלה, מעבר, עצירה או סיום כדי ליצור נתיב נסיעה.</p><button class="btn btn-primary" id="empty-add">${icon('plus')} הוספת עצירה</button></div>`;$('empty-add').onclick=()=>openStopForm();bindRonnyBulkToolbar($('schedule'),'day');bindMapSidePoints();bindDayOutlineBridge();$('schedule').querySelectorAll('.ronny-link-band').forEach(b=>b.onclick=()=>ronnyOpenDayLink(+b.dataset.dayLink));refreshIcons();return}
const walkUnits=TripStateCommands.routeUnits(list).filter(u=>u.walk);const scheduleCards=list.map((s,i)=>{
 const walkUnit=walkUnits.find(u=>i>=u.from&&i<=u.to),walkFirst=!!walkUnit&&i===walkUnit.from,walkEdge=walkFirst||(!!walkUnit&&i===walkUnit.to);
 const staleDrawing=i>0&&!!s.leg&&s.leg.fromId!==list[i-1].id&&['draw','pencil','straight'].includes(s.leg.mode)&&!s.leg.walkAutoRetrace;
 const nightGroup=nightIndex.byStop.get(s.id),nightCopy=!!nightGroup&&nightGroup.owner!==s,nightTotal=nightGroup?TripModel.nightCost(nightGroup).total:0;
 const rawLeg=routeData?.day===selectedDay&&routeData.ids?.[i]===s.id?routeData.legs?.[i-1]:null;const leg=rawLeg&&Number.isFinite(rawLeg.duration)&&Number.isFinite(rawLeg.distance)?rawLeg:null;
 const conf=i?legAt(i,list):null;
 const legAdjustment=leg?.manualOverride&&Number.isFinite(leg.baseDuration)?` · בסיס ${minsFmt(leg.baseDuration/60)}, ${leg.adjustmentMinutes>=0?'+':'−'}${minsFmt(Math.abs(leg.adjustmentMinutes))}`:'';
 const travel=i?`<div class="drive-note" style="--leg-color:${pointColor(s,selectedDay)}"><button class="leg-open" data-leg-index="${i}" type="button" title="שנה אופן מעבר או הוסף כיתוב">${icon(['draw','pencil'].includes(conf.mode)?'pencil-line':conf.mode==='straight'?'move-up-right':effectiveLegProfile(i,list)==='cycling'?'bike':effectiveLegProfile(i,list)==='driving'?'car-front':'footprints')} <span><strong>${esc(conf.label||routeModeName(conf.mode))}</strong> · ${leg?(leg.walkCovered?'חלק מזמן ההליכה':leg.manualMissing?'משך לא הוגדר':(leg.estimated?'~':'')+minsFmt(leg.duration/60))+' · '+(leg.estimated?'~':'')+(leg.distance/1000).toFixed(1)+' ק״מ'+(leg.estimated?' · אומדן':'')+legAdjustment:conf.mode!=='auto'?(routeLegMinutes(conf)===null?'משך לא הוגדר':minsFmt(routeLegMinutes(conf)))+' · מעבר ידני':(conf.mode==='auto'&&routeLegMinutes(conf)!==null?minsFmt(approximateLegs(list)[i-1]?.duration/60)+' · זמני כביש באומדן': 'זמן הנסיעה טרם חושב')}${staleDrawing?' · יש שרטוט שמור לסדר הקודם':''}</span>${icon('settings-2','small-icon')}</button>${conf?.minutesMode==='total'&&leg?.manualOverride&&leg.adjustmentMinutes>=30&&ronnyCanPlaceByTime(s)?`<button type="button" class="ronny-pin-to-lock" data-pin-to-lock="${esc(s.id)}" title="הדרך נמתחה ב־${minsFmt(leg.adjustmentMinutes)} כדי להגיע בשעה שנקבעה. להפוך את זה לשעה נעולה עם זמן פנוי">${icon('lock','small-icon')} הפוך לזמן פנוי</button>`:''}</div>`:'';
 const card=`<div class="stop ${ronnyBulkStops.has(s.id)?'ronny-bulk-selected':''} ${selectedStop===s.id?'focused':''} ${s.autoLoopEnd?'ronny-shared-loop-end':''} ${walkUnit?'ronny-walk-sub':''} ${walkUnit&&i===walkUnit.to?'ronny-walk-sub-last':''} ${walkUnit&&WALK_TYPES.has(s.type)&&!s.cost?'ronny-walk-sub-plain':''} ${i===0?'ronny-rail-first':''} ${i===list.length-1?'ronny-rail-last':''}" data-stop="${esc(s.id)}" data-ronny-route-order="${i+1}" data-drag-ok="${!s.autoLoopEnd&&!walkEdge?'1':''}"${s.autoLoopEnd?' data-loop-end="1"':''} role="group" tabindex="0" aria-label="${esc(s.name)} — התמקדות במפה" style="--stop-color:${pointColor(s,selectedDay)};--rail-next:${pointColor(list[i+1]||s,selectedDay)}">${walkFirst?'':travel}${ronnyGapHTML(s)}${ronnyBulkMode&&!s.autoLoopEnd?`<label class="ronny-bulk-check" title="בחר נקודה למחיקה"><input type="checkbox" data-ronny-select-id="${esc(s.id)}" ${ronnyBulkStops.has(s.id)?'checked':''} aria-label="בחר נקודה ${esc(s.name)}"></label>`:''}<div class="stop-grid"><div class="stop-time"><span class="ronny-time-chip">${s.type==='start'?(state.days[selectedDay]?.loop?'<small class="departure-flag">יציאה וסיום</small>':'<small class="departure-flag">יציאה</small>'):s.autoLoopEnd?`<small class="departure-flag">${s.autoTripLoopEnd?'חזרה לתחילת הטיול':'חזרה להתחלה'}</small>`:''}${s.timeLock?`<span class="ronny-lock-mark" title="שעה נעולה: ${esc(s.timeLock)}" aria-label="שעה נעולה">${icon('lock','small-icon')}</span>`:''}${esc(s.time||'--:--')}${s.dayOffset?`<small style="display:block">${s.dayOffset>0?'+':'−'}${Math.abs(s.dayOffset)} יום</small>`:''}</span></div><div class="stop-body" style="--stop-color:${pointColor(s,selectedDay)}">${!s.autoLoopEnd&&!walkEdge?`<span class="ronny-drag-grip" data-drag-grip title="גרור כדי להזיז" aria-hidden="true">${icon('grip-vertical')}</span>`:''}<span class="stop-order-badge ${s.type==='via'?'is-number':'is-type-icon'}" aria-label="${esc(s.type==='via'?'נקודת מעבר '+(i+1):types[s.type]?.name||'נקודת דרך')}">${s.type==='via'?i+1:pointSymbol(s.autoLoopEnd||(s.type==='start'&&state.days[selectedDay]?.loop)?'loop':s.type)}</span><div class="stop-main"><div class="stop-emoji point-stop-symbol" style="--symbol-color:${pointColor(s,selectedDay)}" aria-hidden="true">${s.type==='via'?icon('route','small-icon'):''}</div><div class="stop-info"><div class="stop-title" title="${esc(s.name)}">${esc(s.name)}</div><div class="stop-secondary">${ronnyRoleChip(s,!!nightGroup)}<span class="ronny-category-label">${esc(types[s.type]?.name||'עצירה')}</span><span class="dot"></span><span>${s.autoLoopEnd?(s.autoTripLoopEnd?'נקודת ההתחלה של הטיול':'אותו מיקום של נקודת היציאה'):s.type==='walkStart'?(s.duration?minsFmt(+s.duration)+' זמן ההליכה':'זמן הליכה טרם הוגדר'):s.type==='start'?(state.days[selectedDay]?.loop?'נקודת יציאה וסיום':'שעת יציאה'):s.duration?minsFmt(+s.duration)+(s.type==='rest'?' עצירה':''):'ללא משך'}${!['start','end','walkStart'].includes(s.type)&&s.duration?` · יציאה ${quickEndTime(s.time,s.duration).slice(0,5)}`:''}</span>${nightGroup?(nightTotal?`<span class="dot"></span><span title="${nightCopy?'העלות נספרת פעם אחת, ביום ההגעה':'עלות הלינה'}">${money(nightTotal)}${nightCopy?' · נספר ביום '+(nightGroup.members[0].day+1):''}</span>`:''):s.cost?`<span class="dot"></span><span>${money(s.cost)}</span>`:''}</div></div><div class="stop-tools">${TripModel.canSwitchRole(s)?`<button class="micro ronny-role-toggle" title="הפוך לנקודת צד (שומר שם, מיקום ועלות)" aria-label="הפוך את ${esc(s.name)} לנקודת צד" data-role-toggle="${esc(s.id)}" data-role-next="side">${icon('map-pinned')}</button>`:''}${s.autoLoopEnd?`<button class="micro" title="הגדרות יום מעגלי" data-loop-day="${esc(s.id)}">${icon('settings-2')}</button>`:`${walkEdge?'':`<button class="micro" title="הזז למעלה" data-move="-1" data-id="${esc(s.id)}">${icon('chevron-up')}</button><button class="micro" title="הזז למטה" data-move="1" data-id="${esc(s.id)}">${icon('chevron-down')}</button>`}${ronnyNavigateLink(s)}<button class="micro" title="ערוך" data-edit="${esc(s.id)}">${icon('pencil')}</button>`}</div></div>${s.type==='hotel'?`<div class="mini-hotels">${icon('moon-star')} מקום לינה לאורך המסלול</div>`:''}${(s.description||s.notes)?`<div class="stop-note">${icon('notebook-pen')} ${esc(s.description||s.notes)}</div>`:''}</div></div></div>`;
 return {travel,card};
 });
$('schedule').innerHTML=ronnyBulkToolbar('day')+dayOutlineBridgeHTML()+ronnyDayLinkBand(selectedDay-1)+ronnyComposeSchedule(list,scheduleCards)+mapSidePointsHTML();
ronnyBindWalkHeads();ronnyBindScheduleDrag();
$('schedule').querySelectorAll('.ronny-link-band').forEach(b=>b.onclick=e=>{e.stopPropagation();ronnyOpenDayLink(+b.dataset.dayLink)});
$('schedule').querySelectorAll('[data-role-toggle]').forEach(b=>b.onclick=e=>{e.stopPropagation();ronnySetPointRole(b.dataset.roleToggle,b.dataset.roleNext)});
$('schedule').querySelectorAll('[data-stop]').forEach(el=>{el.onclick=e=>{if(e.target.closest('a,input,label,[data-ronny-select-id],[data-move],[data-edit],[data-leg-index]'))return;if(ronnyBulkMode){const id=el.dataset.stop;ronnyBulkStops.has(id)?ronnyBulkStops.delete(id):ronnyBulkStops.add(id);renderSchedule();return}focusStop(el.dataset.stop)};el.addEventListener('keydown',e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(ronnyBulkMode){const id=el.dataset.stop;ronnyBulkStops.has(id)?ronnyBulkStops.delete(id):ronnyBulkStops.add(id);renderSchedule()}else focusStop(el.dataset.stop)}});el.addEventListener('pointerenter',()=>highlightMapPoint(el.dataset.stop,true));el.addEventListener('pointerleave',()=>highlightMapPoint(el.dataset.stop,false));el.addEventListener('focusin',()=>highlightMapPoint(el.dataset.stop,true));el.addEventListener('focusout',()=>highlightMapPoint(el.dataset.stop,false));});
bindRonnyBulkToolbar($('schedule'),'day');bindMapSidePoints();bindDayOutlineBridge();
$('schedule').querySelectorAll('[data-leg-index]').forEach(el=>{
 el.onclick=e=>{e.stopPropagation();const i=+el.dataset.legIndex;openLegEditor(i);ronnySelectLeg(i,{fit:true})};
 el.addEventListener('pointerenter',()=>spotlightLeg(+el.dataset.legIndex));
 el.addEventListener('pointerleave',()=>spotlightLeg(+el.dataset.legIndex,false));
 el.addEventListener('focus',()=>spotlightLeg(+el.dataset.legIndex));
 el.addEventListener('blur',()=>spotlightLeg(+el.dataset.legIndex,false));
});
ronnyMarkSelectedLeg();
$('schedule').querySelectorAll('[data-pin-to-lock]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=e=>{e.stopPropagation();ronnyConvertPinToLock(b.dataset.pinToLock)}});
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
 const last=ordered.length-1,hadStart=ordered.some(s=>s.type==='start'),hadEnd=ordered.some(s=>s.type==='end');
 for(let i=0;i<ordered.length;i++){
  const s=ordered[i],before=s.type;
  // Walking points and derived loop finishes keep their identity. A day gains
  // a start or finish only when the user already defined that endpoint.
  if(WALK_TYPES.has(before)||s.autoLoopEnd)continue;
  let after=before;
  if(ordered.length<2)after=before==='end'?'start':before;
  else if(hadStart&&i===0)after='start';
  else if(hadEnd&&i===last)after='end';
  else if(before==='start'||before==='end')after='via';
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
 const plan=TripStateCommands.planRouteStep(stops(),id,delta);
 if(!plan)return;if(plan.error){toast(plan.error);return}
 ronnyRememberUndo('שינוי סדר נקודות');const before=captureSchedulePositions();
 commitOrderedDaySlots(selectedDay,plan.ordered);invalidate();retimeAfterOrderChange(selectedDay);save();renderAll();
 animateScheduleReorder(before,plan.moved);ronnyNoticeStaleDrawings();
}
function ronnyNoticeStaleDrawings(){const list=stops();if(list.some((s,i)=>i>0&&s.leg&&s.leg.fromId!==list[i-1].id&&['draw','pencil','straight'].includes(s.leg.mode)&&!s.leg.walkAutoRetrace))toast('שרטוט ידני שמור ולא מוצג כרגע. הוא יחזור אם תחזירו את הסדר הקודם.')}
function reorder(from,to){
 // Two sequence positions exchange their cards; a walking loop moves as one block.
 const plan=TripStateCommands.planRouteSwap(stops(),from,to);
 if(!plan)return;if(plan.error){toast(plan.error);return}
 ronnyRememberUndo('שינוי סדר נקודות');const before=captureSchedulePositions();
 commitOrderedDaySlots(selectedDay,plan.ordered);invalidate();retimeAfterOrderChange(selectedDay);save();renderAll();
 animateScheduleReorder(before,plan.moved);ronnyNoticeStaleDrawings();
}
// Patch 130: drag-and-drop MOVES a card to the marked position (it no longer swaps two cards).
function ronnyMoveStopTo(from,beforeId){
 const plan=TripStateCommands.planRouteMove(stops(),from,beforeId);
 if(!plan)return;if(plan.error){toast(plan.error);return}
 ronnyRememberUndo('שינוי סדר נקודות');const before=captureSchedulePositions();
 commitOrderedDaySlots(selectedDay,plan.ordered);invalidate();retimeAfterOrderChange(selectedDay);save();renderAll();
 animateScheduleReorder(before,plan.moved);ronnyNoticeStaleDrawings();
}
// Patch 130: a manually typed arrival time places the point where that time belongs in the day.
// An overlap with the activity before or after is shown to the user, who decides how to resolve it.
function ronnyAbsMinute(p){return p&&/^\d{2}:\d{2}/.test(p.time||'')?clockMinutes(String(p.time).slice(0,5))+(Number(p.dayOffset)||0)*1440:null}
function ronnyStopDwell(p){return ['start','walkStart'].includes(p?.type)?0:Math.max(0,Number(p?.duration)||0)}
// The routed drive when this pair is already routed; otherwise the rough estimate with a 30% margin (it runs short on real roads).
function ronnyTravelEstimate(a,b){
 const ids=routeData?.ids,j=ids?ids.indexOf(b?.id):-1,routed=j>0&&ids[j-1]===a?.id?Number(routeData.legs?.[j-1]?.duration):NaN;
 if(Number.isFinite(routed))return Math.max(0,Math.round(routed/60));
 try{return Math.max(0,Math.round(1.3*(Number(approximateLegs([a,b])?.[0]?.duration)||0)/60))}catch(e){return 0}
}
function ronnyCanPlaceByTime(stop){return !!stop&&!isMapOnlyPoint(stop)&&!['start','end'].includes(stop.type)&&!WALK_TYPES.has(stop.type)&&!stop.autoLoopEnd}
// Returns true when it handled the time (applied it or opened the conflict dialog).
// Patch 133: a typed arrival time is a LOCKED time. The point keeps it; the day plans around it, and
// empty time or lateness shows as a badge (no more stretching the incoming drive to hours).
function ronnyPlaceByTime(dayIndex,id,clock){
 const route=routeStopsForDay(dayIndex),stop=route.find(p=>p.id===id);if(!ronnyCanPlaceByTime(stop))return false;
 // A time before the day's start that plainly continues a late evening (e.g. 00:15 after 23:00) means after midnight.
 let requested=clockMinutes(clock);
 const first=ronnyAbsMinute(route[0]),last=Math.max(...route.filter(p=>p.id!==id).map(p=>ronnyAbsMinute(p)??-Infinity));
 if(first!=null&&requested<first&&first-requested>180&&Number.isFinite(last)&&requested+1440-last<=360)requested+=1440;
 const plan=TripStateCommands.planTimedPlacement(route,id,requested,{minuteOf:ronnyAbsMinute,dwellOf:ronnyStopDwell,isFixed:p=>!!p.timeLock&&p.id!==id});
 if(!plan||!plan.prev)return false;
 plan.requested=requested;
 if(plan.overlapPrev||plan.overlapNext){ronnyOpenTimeConflict(dayIndex,id,clock,plan);return true}
 ronnyApplyTimedPlacement(dayIndex,id,clock,plan,{prev:'lock',next:'keep'});return true;
}
function ronnyApplyTimedPlacement(dayIndex,id,clock,plan,choice){
 activeQuickCommit=null; // the editor already saved; re-opening it must not save again
 ronnyRememberUndo('שינוי שעת הגעה');const before=captureSchedulePositions();
 const day=state.days[dayIndex],requested=plan.requested??clockMinutes(clock);
 if(plan.moves){const mv=TripStateCommands.planRouteMove(routeStopsForDay(dayIndex),id,plan.beforeId);if(mv?.error){toast(mv.error);return}if(mv)commitOrderedDaySlots(dayIndex,mv.ordered)}
 const route=routeStopsForDay(dayIndex),idx=route.findIndex(p=>p.id===id),stop=route[idx],prev=route[idx-1];
 const travel=prev?ronnyTravelEstimate(prev,stop):0;
 ronnyDropTimePin(dayIndex,id);
 if(choice.prev==='after')delete stop.timeLock;else stop.timeLock=clockAt(requested);
 if(choice.prev==='shorten'&&prev&&!['start','walkStart','walkEnd'].includes(prev.type))prev.duration=Math.max(0,requested-travel-(ronnyAbsMinute(prev)??requested));
 if(choice.prev==='earlier-start'&&prev?.type==='start'){day.timeAnchor={stopId:prev.id,kind:'departure',time:clockAt(Math.floor((requested-travel)/5)*5)};day.departureUsesDefault=false;prev.time=day.timeAnchor.time}
 if(choice.next==='shorten-here'&&plan.next&&plan.nextArrival!=null)stop.duration=Math.max(0,plan.nextArrival-ronnyTravelEstimate(stop,plan.next)-requested);
 if(choice.next==='unlock-next'&&plan.next)delete plan.next.timeLock;
 invalidate();retimeAfterOrderChange(dayIndex);save();renderAll();animateScheduleReorder(before,[id]);
 if($('point-quick')?.classList.contains('open')&&$('point-quick').dataset.id===id)openPointQuick(id);
 toast((stop.timeLock?'השעה ננעלה על '+stop.timeLock:'השעה תחושב לפי הדרך')+(plan.moves?' · הנקודה עברה למקום בין '+(plan.prev?.name||'הקודמת')+(plan.next?' ל־'+plan.next.name:''):''));
}
function ronnyOpenTimeConflict(dayIndex,id,clock,plan){
 document.querySelector('.ronny-conflict-overlay')?.remove();
 const stop=getStop(id)?.stop;if(!stop)return;
 const requested=plan.requested??clockMinutes(clock),t=m=>clockAt(m),dwell=ronnyStopDwell(stop);
 const prevName=esc(plan.prev?.name||''),nextName=esc(plan.next?.name||'');
 const prevIsStart=plan.prev?.type==='start',prevCanShorten=!!plan.prev&&!['start','walkStart','walkEnd'].includes(plan.prev.type);
 const prevTravel=plan.prev?ronnyTravelEstimate(plan.prev,stop):0;
 const radio=(group,value,label,hint,checked)=>`<label class="ronny-conflict-choice"><input type="radio" name="${group}" value="${value}" ${checked?'checked':''}><span><strong>${label}</strong>${hint?'<small>'+hint+'</small>':''}</span></label>`;
 let body='';
 if(plan.overlapPrev){
  const opts=[];
  if(prevCanShorten)opts.push(radio('prev','shorten','לקצר את '+prevName,'יסתיים ב־'+t(requested-prevTravel)+' במקום '+t(plan.prevDeparture),true));
  if(prevIsStart)opts.push(radio('prev','earlier-start','להקדים את היציאה','יציאה ב־'+t(Math.floor((requested-prevTravel)/5)*5)+' במקום '+t(plan.prevDeparture),true));
  opts.push(radio('prev','after','להגיע מיד אחרי '+prevName,'השעה תחושב לפי הדרך, בערך '+t(plan.prevDeparture+prevTravel),!prevCanShorten&&!prevIsStart));
  body+=`<section class="ronny-conflict-part"><h4>${icon('alert-triangle','small-icon')} חפיפה עם ${prevName}</h4><p>${prevName}: ${prevIsStart?'יציאה ב־':'עד '}${t(plan.prevDeparture)} · ${esc(stop.name)}: הגעה ב־${t(requested)}</p>${opts.join('')}</section>`;
 }
 if(plan.overlapNext){
  const canShorten=plan.nextArrival-requested>0;
  body+=`<section class="ronny-conflict-part"><h4>${icon('alert-triangle','small-icon')} חפיפה עם ${nextName} (שעה נעולה)</h4><p>${esc(stop.name)}: עד ${t(requested+dwell)} · ${nextName}: נעול ל־${t(plan.nextArrival)}</p>${canShorten?radio('next','shorten-here','לקצר את השהייה ב־'+esc(stop.name),'כדי להגיע ל־'+nextName+' ב־'+t(plan.nextArrival),true):''}${radio('next','unlock-next','לשחרר את הנעילה של '+nextName,'הוא וכל מה שאחריו יזוזו מאוחר יותר',!canShorten)}${radio('next','keep','להשאיר כך',''+nextName+' יסומן באיחור',false)}</section>`;
 }
 const overlay=document.createElement('div');overlay.className='map-confirm-overlay ronny-conflict-overlay';overlay.setAttribute('role','presentation');
 overlay.innerHTML=`<div class="map-confirm-card ronny-conflict-card" role="alertdialog" aria-modal="true" aria-labelledby="ronny-conflict-title"><h3 id="ronny-conflict-title">התנגשות בלוח הזמנים</h3><p class="ronny-conflict-lead">${esc(stop.name)} ב־${t(requested)}${plan.moves?' · המקום החדש: בין '+prevName+(plan.next?' ל־'+nextName:''):''}. איך לסדר את זה?</p>${body}<div class="map-confirm-actions"><button type="button" class="map-confirm-approve ronny-conflict-apply">החל</button><button type="button" class="map-confirm-cancel">ביטול</button></div></div>`;
 document.body.append(overlay);refreshIcons();
 const close=()=>{overlay.remove();document.removeEventListener('keydown',onKey,true)};
 const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close()}};
 document.addEventListener('keydown',onKey,true);
 overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
 overlay.querySelector('.map-confirm-cancel').onclick=close;
 overlay.querySelector('.ronny-conflict-apply').onclick=()=>{
  const choice={prev:overlay.querySelector('input[name=prev]:checked')?.value||'lock',next:overlay.querySelector('input[name=next]:checked')?.value||'keep'};
  close();ronnyApplyTimedPlacement(dayIndex,id,clock,plan,choice);
 };
 overlay.querySelector('.ronny-conflict-apply').focus();
}
// A drive that was stretched to reach a typed time becomes a locked arrival with visible free time.
function ronnyConvertPinToLock(id){
 const route=routeStopsForDay(selectedDay),i=route.findIndex(p=>p.id===id),stop=route[i];if(i<1||!stop?.leg)return;
 closeLegEditor();ronnyRememberUndo('הפיכת דרך מוארכת לזמן פנוי');
 stop.timeLock=String(stop.time||'').slice(0,5);stop.leg.minutes=null;delete stop.leg.minutesMode;delete stop.leg.ronnyTimePin;
 invalidate();retimeAfterOrderChange(selectedDay);save();renderAll();toast('השעה ננעלה על '+stop.timeLock+'. הזמן העודף מוצג כזמן פנוי');
}
// Free time before a locked point, or how late you arrive to it.
// A lock replaces the automatic pin that placement put on the incoming road, so the real gap shows.
function ronnyDropTimePin(dayIndex,id){const route=routeStopsForDay(dayIndex),i=route.findIndex(p=>p.id===id);const leg=i>0?route[i].leg:null;if(leg?.ronnyTimePin&&leg.fromId===route[i-1].id){leg.minutes=null;delete leg.minutesMode;delete leg.ronnyTimePin}}
function ronnyGapHTML(s){
 const gap=ronnyTimeGaps.get(selectedDay)?.get(s.id);if(!gap)return '';
 const late=gap<0,text=late?'איחור של '+minsFmt(-gap)+' · השעה הנעולה '+esc(s.timeLock||''):'זמן פנוי · '+minsFmt(gap);
 return '<div class="ronny-time-gap '+(late?'is-late':'is-free')+'" title="'+(late?'לפי הדרך והשהיות, מגיעים אחרי השעה שננעלה':'אין פעילות מתוכננת בזמן הזה')+'">'+icon(late?'alarm-clock':'coffee','small-icon')+'<span>'+text+'</span></div>';
}
// Phone: open the point in Google Maps navigation.
function ronnyNavigateLink(s){
 const lat=+s.lat,lng=+s.lng;if(!Number.isFinite(lat)||!Number.isFinite(lng))return '';
 return `<a class="micro ronny-nav-link" href="https://www.google.com/maps/dir/?api=1&amp;destination=${lat.toFixed(6)},${lng.toFixed(6)}" target="_blank" rel="noopener noreferrer" title="ניווט בגוגל מפות" aria-label="ניווט אל ${esc(s.name)}">${icon('navigation')}</a>`;
}
// One pointer-based drag for cards and walk blocks: mouse, touch and pen.
// Mouse: drag from the grip or anywhere on the card. Touch: drag from the grip (the rest of the card scrolls).
// A floating label follows the pointer and a line shows exactly where the card will land.
let ronnyScheduleDrag=null,ronnyScheduleDragEndedAt=0;
function ronnyBindScheduleDrag(){
 const root=$('schedule');if(!root||root.dataset.ronnyDragBound)return;root.dataset.ronnyDragBound='1';
 root.addEventListener('pointerdown',ronnyScheduleDragDown);
 root.addEventListener('click',e=>{if(Date.now()-ronnyScheduleDragEndedAt<400){e.stopPropagation();e.preventDefault()}},true);
 root.addEventListener('dragstart',e=>{if(e.target.closest?.('.stop,[data-walk-head]'))e.preventDefault()});
}
function ronnyScheduleDragSource(target){
 const head=target.closest('[data-walk-head]');
 if(head)return {el:head.closest('.ronny-walk-block')||head,id:head.dataset.walkHead,inner:false,label:head.querySelector('.ronny-walk-copy strong')?.firstChild?.textContent||'מסלול הליכה'};
 const card=target.closest('.stop[data-stop]');
 if(card&&card.dataset.dragOk==='1')return {el:card,id:card.dataset.stop,inner:card.classList.contains('ronny-walk-sub'),label:card.querySelector('.stop-title')?.textContent||''};
 return null;
}
function ronnyScheduleDragDown(e){
 if(e.button!==0||ronnyBulkMode||ronnyScheduleDrag)return;
 const src=ronnyScheduleDragSource(e.target);if(!src)return;
 const onGrip=!!e.target.closest('[data-drag-grip]');
 if(!onGrip&&(e.pointerType!=='mouse'||e.target.closest('a,button,input,select,textarea,label,[data-leg-index]')))return;
 if(onGrip)e.preventDefault();
 ronnyScheduleDrag={...src,pointerId:e.pointerId,x0:e.clientX,y0:e.clientY,x:e.clientX,y:e.clientY,active:false,slot:undefined};
 addEventListener('pointermove',ronnyScheduleDragMove,{passive:false});
 addEventListener('pointerup',ronnyScheduleDragUp);
 addEventListener('pointercancel',ronnyScheduleDragCancel);
 addEventListener('keydown',ronnyScheduleDragKey);
}
function ronnyScheduleDragMove(e){
 const d=ronnyScheduleDrag;if(!d||e.pointerId!==d.pointerId)return;
 d.x=e.clientX;d.y=e.clientY;
 if(!d.active){if(Math.hypot(d.x-d.x0,d.y-d.y0)<6)return;ronnyScheduleDragBegin()}
 e.preventDefault();ronnyScheduleDragPaint();
}
function ronnyScheduleDragBegin(){
 const d=ronnyScheduleDrag;d.active=true;
 getSelection?.()?.removeAllRanges?.();
 const ghost=document.createElement('div');ghost.className='ronny-drag-ghost';ghost.setAttribute('aria-hidden','true');
 ghost.innerHTML=icon('grip-vertical','small-icon')+'<span></span>';ghost.querySelector('span').textContent=d.label;
 const line=document.createElement('div');line.className='ronny-drop-line';line.hidden=true;
 document.body.append(ghost,line);d.ghost=ghost;d.line=line;refreshIcons();
 d.el.classList.add('ronny-drag-source');document.body.classList.add('ronny-schedule-dragging');
 d.raf=requestAnimationFrame(ronnyScheduleDragScroll);
}
// Candidate positions: the other top-level units, or for a point inside a walk, the points of that walk after its start.
function ronnyScheduleDropTargets(d){
 const root=$('schedule');
 if(d.inner){const subs=[...(d.el.closest('.ronny-walk-subs')?.querySelectorAll(':scope > .stop[data-stop]')||[])];return subs.slice(1).filter(x=>x!==d.el).map(el=>({el,id:el.dataset.stop}))}
 return [...root.querySelectorAll(':scope > .stop[data-stop], :scope > .ronny-walk-block')].filter(x=>x!==d.el).map(el=>({el,id:el.dataset.stop||el.dataset.walkBlock,loopEnd:el.dataset.loopEnd==='1'}));
}
function ronnyScheduleDragPaint(){
 const d=ronnyScheduleDrag;if(!d?.active)return;
 d.ghost.style.transform=`translate(${Math.round(d.x-d.ghost.offsetWidth/2)}px,${Math.round(d.y-d.ghost.offsetHeight-14)}px)`;
 // Measure the card itself, not the travel row drawn above it, so the line sits in the gap between cards.
 const targets=ronnyScheduleDropTargets(d),rects=targets.map(t=>(t.el.querySelector(':scope > .stop-grid')||t.el).getBoundingClientRect());
 let k=rects.findIndex(r=>d.y<r.top+r.height/2);
 if(k<0&&targets.length&&(d.inner||targets.at(-1).loopEnd))k=targets.length-1;
 const before=k<0?null:targets[k].id,ref=rects[k<0?rects.length-1:k];
 if(!ref){d.slot=undefined;d.line.hidden=true;return}
 const y=k<0?ref.bottom+5:ref.top-5;
 const plan=TripStateCommands.planRouteMove(stops(),d.id,before),box=$('schedule').getBoundingClientRect();
 d.slot=plan&&!plan.error?{before}:undefined;
 d.line.hidden=!plan||y<box.top||y>box.bottom;
 d.line.classList.toggle('is-invalid',!!plan?.error);
 d.line.title=plan?.error||'';
 d.line.style.cssText=`top:${Math.round(y-1.5)}px;left:${Math.round(ref.left)}px;width:${Math.round(ref.width)}px`;
}
function ronnyScheduleDragScroll(){
 const d=ronnyScheduleDrag;if(!d?.active)return;
 const root=$('schedule'),r=root.getBoundingClientRect(),edge=Math.min(64,r.height/4);
 let v=0;if(d.y<r.top+edge)v=-(r.top+edge-d.y)/3;else if(d.y>r.bottom-edge)v=(d.y-(r.bottom-edge))/3;
 if(v){const old=root.scrollTop;root.scrollTop+=Math.max(-22,Math.min(22,v));if(root.scrollTop!==old)ronnyScheduleDragPaint()}
 d.raf=requestAnimationFrame(ronnyScheduleDragScroll);
}
function ronnyScheduleDragFinish(){
 const d=ronnyScheduleDrag;ronnyScheduleDrag=null;if(!d)return null;
 removeEventListener('pointermove',ronnyScheduleDragMove,{passive:false});removeEventListener('pointerup',ronnyScheduleDragUp);
 removeEventListener('pointercancel',ronnyScheduleDragCancel);removeEventListener('keydown',ronnyScheduleDragKey);
 cancelAnimationFrame(d.raf);d.ghost?.remove();d.line?.remove();
 d.el.classList.remove('ronny-drag-source');document.body.classList.remove('ronny-schedule-dragging');
 if(d.active)ronnyScheduleDragEndedAt=Date.now();
 return d;
}
function ronnyScheduleDragUp(e){
 if(!ronnyScheduleDrag||e.pointerId!==ronnyScheduleDrag.pointerId)return;
 const d=ronnyScheduleDragFinish();
 if(d.active&&d.slot)ronnyMoveStopTo(d.id,d.slot.before);
 else if(d.active&&d.line&&d.line.classList.contains('is-invalid')&&d.line.title)toast(d.line.title);
}
function ronnyScheduleDragCancel(e){if(ronnyScheduleDrag&&(!e||e.pointerId===ronnyScheduleDrag.pointerId))ronnyScheduleDragFinish()}
function ronnyScheduleDragKey(e){if(e.key==='Escape'&&ronnyScheduleDrag){e.preventDefault();ronnyScheduleDragFinish()}}

function invalidate(){routeToken++;clearTimeout(routeDebounce);routeController?.abort();routeController=null;routeData=null;routeError='';}
// RONNY 35.31: temporary map distance measurement, independent of trip data and routing.
const ronnyMeasure={active:false,points:[],undoLengths:[],hover:null,pointerId:null,dragging:false,prevDragEnabled:true,prevDblClickEnabled:true};
let ronnyMeasureLayer=null;
