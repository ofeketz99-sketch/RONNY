function quickEndTime(time,duration){
 const parts=String(time||'').split(':').map(Number);
 if(parts.length!==2||parts.some(x=>!Number.isFinite(x)))return '—';
 const n=parts[0]*60+parts[1]+Math.max(0,+duration||0);
 return `${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}${n>=1440?' (+1)':''}`;
}
function quickLegLinks(s,day){
 if(isMapOnlyPoint(s))return '';
 const arr=routeStopsForDay(day),idx=arr.findIndex(p=>p.id===s.id);
 if(idx<0||arr.length<2)return '';
 const directions=[];
 if(idx>0)directions.push({index:idx,heading:'הדרך אל הנקודה',other:arr[idx-1].name});
 if(idx<arr.length-1)directions.push({index:idx+1,heading:'הדרך מהנקודה',other:arr[idx+1].name});
 return `<div class="point-route-links"><strong>מקטעי הדרך של הנקודה</strong>${directions.map(item=>{
  const conf=legAt(item.index,arr),mins=routeLegMinutes(conf);
  const routed=routeData?.day===day&&routeData.ids?.[item.index]===arr[item.index].id?routeData.legs?.[item.index-1]:null;
  const derived=approximateLegs(arr,day)[item.index-1];
  const time=routed?.duration!==undefined&&!routed.manualMissing?minsFmt(routed.duration/60):derived?.duration!==undefined&&!derived.manualMissing?minsFmt(derived.duration/60):'זמן לא הוגדר';
  return `<button class="point-route-link" type="button" data-point-leg="${item.index}" title="עריכת מקטע הדרך">${icon('route','small-icon')}<span><b>${item.heading} · ${esc(item.other)}</b><small>${esc(conf.label||routeModeName(conf.mode))} · ${esc(time)}</small></span>${icon('pencil','small-icon')}</button>`;
 }).join('')}</div>`;
}
function ronnyRoleFieldMarkup(s){
 const role=TripModel.roleOf(s);
 if(!TripModel.canSwitchRole(s))return '<div class="ronny-role-field is-fixed"><span class="ronny-role-title">תפקיד</span>'+ronnyRoleChip(s)+'<small>'+(role==='walk'?'נקודה בתוך מסלול הליכה, עם הכללים הקיימים שלו':'התחלה או סיום של היום')+'</small></div>';
 const hints={stop:'נכנסת למסלול, לזמנים ולסיכומים',side:'מחוץ למסלול, בקו מקווקו לעצירה הקרובה',idea:'מחוץ למסלול, בלי קישור'};
 return '<div class="ronny-role-field"><span class="ronny-role-title" id="quick-role-label">תפקיד</span><div class="ronny-role-options" role="radiogroup" aria-labelledby="quick-role-label">'+TripModel.SWITCHABLE_ROLES.map(r=>'<button type="button" role="radio" class="'+(r===role?'selected':'')+'" aria-checked="'+(r===role)+'" data-point-role="'+r+'">'+icon(TripModel.ROLE_ICONS[r],'small-icon')+'<span>'+esc(TripModel.ROLE_LABELS[r])+'</span></button>').join('')+'</div><small>'+esc(hints[role])+'</small></div>';
}
// A circular day's base can arrive by transfer and still host the next night, so both cards may show.
function ronnyNightCardMarkup(s,dayIndex){return ronnyTransferCardMarkup(s,dayIndex)+ronnySharedNightCardMarkup(s,dayIndex)}
function ronnySharedNightCardMarkup(s,dayIndex){
 const group=ronnyNightIndex().byStop.get(s.id);
 if(group){
  const first=group.members[0],last=group.members.at(-1),cost=TripModel.nightCost(group),count=group.nights.length;
  const linkIndex=group.nights.includes(dayIndex-1)?dayIndex-1:dayIndex;
  return '<section class="ronny-night-card" aria-label="מקום לינה"><header>'+icon('moon-star','small-icon')+'<div><strong>לינה · '+(count>1?count+' לילות · ':'')+'יום '+(first.day+1)+' ← יום '+(last.day+1)+'</strong><small>מקום אחד: השם, המיקום והעלות משותפים</small></div></header><div class="ronny-night-times"><span>הגעה · יום '+(first.day+1)+'<b>'+esc(first.stop.time||'—')+'</b></span><span>יציאה · יום '+(last.day+1)+'<b>'+esc(last.stop.time||'—')+'</b></span></div><label class="ronny-night-cost"><span>עלות הלינה'+(count>1?' לכל השהות':'')+' (₪)</span><input id="quick-night-cost" type="number" min="0" step="1" value="'+cost.total+'"></label>'+(cost.conflict?'<p class="ronny-night-conflict" role="status">נמצאו סכומים שונים בשני הימים ('+cost.values.map(v=>money(v)).join(' + ')+'). שניהם נספרים עד שתקבעו סכום אחד כאן.</p>':'')+'<button type="button" class="ronny-night-break" data-night-transfer="'+linkIndex+'">'+icon('unlink-2','small-icon')+' יש מעבר בין הימים (טיסה, מעבורת...)</button></section>';
 }
 return '';
}
function ronnyTransferCardMarkup(s,dayIndex){
 if(s.type!=='start'||dayIndex<1)return '';
 const link=TripModel.dayLink(state,dayIndex-1,validPoint);if(link?.state!=='transfer')return '';
 return '<section class="ronny-transfer-card" aria-label="מעבר בין ימים"><header>'+icon('unlink-2','small-icon')+'<div><strong>מעבר בין ימים</strong><small>יום '+dayIndex+': '+esc(link.ending.name||'סיום')+' ← יום '+(dayIndex+1)+': '+esc(s.name||'התחלה')+'</small></div></header><div class="ronny-transfer-fields"><label><span>סוג המעבר</span><select id="quick-transfer-kind"><option value="">לא הוגדר</option>'+Object.entries(TripModel.TRANSFER_KINDS).map(([k,v])=>'<option value="'+k+'" '+(link.kind===k?'selected':'')+'>'+esc(v.label)+'</option>').join('')+'</select></label><label><span>הערה</span><input id="quick-transfer-note" maxlength="120" value="'+esc(link.note||'')+'" placeholder="מספר טיסה, שעה..."></label></div><button type="button" class="ronny-night-break" data-relink-start>'+icon('link','small-icon')+' חבר ללינה אחת</button></section>';
}
function changeExistingPointType(id,nextType){
 const obj=getStop(id);
 if(!obj||!types[nextType]||nextType===obj.stop.type)return;
 const oldType=obj.stop.type,stop=obj.stop,day=state.days[obj.day],previousRole=TripModel.roleOf(stop),wasMapOnly=isMapOnlyPoint(stop);
 // Flush edits that are already in the floating editor before changing its structure.
 hidePointQuick();
 const prevDefault=types[oldType]?.name||'';
 const genericName=stop.name===prevDefault||(/^נקודת מעבר\s*\d+$/.test(String(stop.name||''))&&oldType==='via')||(['start','end'].includes(oldType)&&(stop.autoChronoName||ronnyIsAutoEndpointName(stop.name)));
 stop.type=nextType;
 TripModel.keepRoleAfterCategoryChange(stop,previousRole);
 if(genericName){stop.name=types[nextType].name;stop.autoPlaceName=false;stop.autoViaName=false;stop.autoChronoName=false}
 if(!validCustomColor(stop.color))delete stop.autoColor;
 enforceRouteEndpoints(day,stop);
 ronnyPlaceAfterRoleChange(obj.day,stop,wasMapOnly);
 positionRouteEndpoints(day);syncWalkingLoops(day);
 ensureStableViaColors();
 // Side points and ideas do not participate in route calculations or itinerary timing.
 if(!wasMapOnly||!isMapOnlyPoint(stop)){
  invalidate();
  retimeAfterOrderChange(obj.day);
 }
 save();renderAll();openPointQuick(id);toast('סוג הנקודה עודכן');
}
function openPointQuick(id){
 closeLegEditor();if(drawLegSession)stopLegDrawing();
 const obj=getStop(id);if(!obj||!map)return;
 if(obj.stop.autoLoopEnd){selectedDay=obj.day;editDay();return;}
 if(obj.stop.autoWalkEnd){const st=getStop(obj.stop.walkLoopSource);if(st){openPointQuick(st.stop.id);return;}}
 const existingPopup=$('point-quick');
 const rememberedPosition=existingPopup?.classList.contains('open')&&existingPopup.dataset.id===id&&existingPopup.dataset.wasMoved==='yes'?
  {left:existingPopup.style.left,top:existingPopup.style.top}:null;
 hideContext();hidePointQuick();
 // Phone: the editor is a bottom sheet over the map, so leave the plan and keep the point visible above it.
 if(ronnyIsPhone()){if($('planner').classList.contains('show-mobile'))showMap();setTimeout(()=>{const ll=L.latLng(+obj.stop.lat,+obj.stop.lng);if(map&&Number.isFinite(ll.lat)&&Number.isFinite(ll.lng))map.panTo(map.containerPointToLatLng(map.latLngToContainerPoint(ll).add([0,map.getSize().y*.33])),{animate:!ronnyReducedMotion()})},300)}
 if(obj.day!==selectedDay||viewScope==='all'){
  selectedDay=obj.day;viewScope='day';$('map-scope').value='day';renderAll();
 }
 // Display current computed arrival before allowing manual departure edits.
 if(!isMapOnlyPoint(obj.stop))retimeAfterOrderChange(obj.day);
 selectedStop=id;
 // Keep the schedule's selected row in sync with the map marker, even across days.
 renderSchedule();
 const s=obj.stop,el=$('point-quick'),pt=map.latLngToContainerPoint([+s.lat,+s.lng]);
 const actualColor=pointColor(s,obj.day);
 const hexColor=validCustomColor(actualColor)?actualColor:(types[s.type]?.color||'#668b74');
 const colorSwatches=VIA_COLORS.slice(0,12);
 if(!colorSwatches.includes(hexColor))colorSwatches.push(hexColor);
 el.innerHTML=`<div class="point-quick-header"><div class="point-quick-top"><span style="color:${hexColor}">${ronnyPointSymbol(s.type,s)}</span><div class="point-quick-heading"><strong>${esc(types[s.type]?.name||'נקודה')}</strong><small>${esc(dayDate(obj.day))}</small></div><span class="popup-drag-handle" role="button" tabindex="0" title="גרור כדי להזיז את החלונית" aria-label="ידית לגרירת החלונית">${icon('grip-horizontal','small-icon')}</span><button type="button" data-quick-close aria-label="סגירה">${icon('x','small-icon')}</button></div></div>
 <div class="point-quick-form">${ronnyRoleFieldMarkup(s)}${ronnyNightCardMarkup(s,obj.day)}<div class="quick-field quick-type-field"><label for="quick-type">קטגוריה</label><select id="quick-type" aria-label="שינוי קטגוריית הנקודה">${pointGroups.map(g=>`<optgroup label="${esc(g.label)}">${g.types.filter(t=>t===s.type||endpointChoiceAllowed(t,obj.day,s.id)).map(t=>`<option value="${t}" ${s.type===t?'selected':''}>${esc(types[t].name)}</option>`).join('')}</optgroup>`).join('')}${types[s.type]?.legacy?`<optgroup label="סוג ישן"><option value="${esc(s.type)}" selected>${esc(types[s.type].name)}</option></optgroup>`:''}</select></div><div class="quick-field"><label for="quick-name">שם הנקודה</label><input id="quick-name" maxlength="110" value="${esc(s.name)}" placeholder="שם הנקודה"></div>
 <div class="quick-field"><label for="quick-description">תיאור</label><textarea id="quick-description" maxlength="2500" placeholder="תיאור">${esc(s.description||s.notes||'')}</textarea></div>
 <label class="ronny-description-choice"><input id="quick-show-description" type="checkbox" ${s.showMapDescription?'checked':''}><span>${icon('message-square-text','small-icon')} הצג את התיאור באופן קבוע על המפה</span></label>
 ${ronnyIconPickerMarkup(s)}
 ${ronnySecondaryIconPickerMarkup(s,ronnyLinkedWalkParkingIds(routeStopsForDay(obj.day)).has(s.id))}
 <fieldset class="quick-colors"><legend>צבע הנקודה</legend><div class="quick-color-row">${colorSwatches.map(c=>`<button type="button" class="quick-swatch ${c.toLowerCase()===hexColor.toLowerCase()?'selected':''}" style="background:${c}" data-quick-color="${c}" aria-label="צבע ${c}" aria-pressed="${c.toLowerCase()===hexColor.toLowerCase()}"></button>`).join('')}<label class="quick-color-native" title="בחירת צבע חופשי"><input id="quick-color-custom" type="color" value="${hexColor}"> צבע נוסף</label><button type="button" class="quick-color-reset" data-quick-color-auto>אוטומטי</button></div></fieldset>
 <div class="quick-two ${s.type==='start'?'start-departure-only':''}"><div class="quick-field"><label for="quick-time">${s.type==='walkStart'?'שעת יציאה להליכה':s.type==='start'?'שעת יציאה':'שעת הגעה'}</label><div class="ronny-time-control"><input id="quick-time" class="ronny-time-input" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="5" pattern="[0-2][0-9]:[0-5][0-9]" aria-label="שעה בפורמט 24 שעות" title="פורמט 24 שעות, למשל 14:30" value="${esc(s.time||(s.type==='start'?tripDefaultDepartureTime():'09:00'))}"><button type="button" class="ronny-time-trigger" aria-label="פתח בורר שעות (24 שעות)" title="בחירת שעה, 24 שעות">${icon('clock','small-icon')}</button></div>${ronnyCanPlaceByTime(s)?`<button type="button" class="ronny-time-lock-toggle" data-quick-time-lock aria-pressed="${s.timeLock?'true':'false'}" title="${s.timeLock?'השעה נעולה. לחיצה משחררת':'נעילת שעת ההגעה: שאר היום יסתדר סביבה'}">${icon(s.timeLock?'lock':'lock-open','small-icon')}<span>${s.timeLock?'שעה נעולה':'נעל שעה'}</span></button>`:''}</div>${['start','end'].includes(s.type)?'':`<div class="quick-field"><label for="quick-duration">${s.type==='walkStart'?'משך ההליכה הכולל':s.type==='rest'?'משך עצירה':'משך שהייה'} (בדקות)</label><input id="quick-duration" type="number" min="0" max="3000" step="5" value="${Math.max(0,Number(s.duration)||0)}"></div>`}</div>
 ${['start','end','walkStart'].includes(s.type)?'':`<div class="quick-field quick-departure-editor"><label for="quick-outbound">${s.type==='rest'?'שעת יציאה (מעדכנת את משך העצירה)':'שעת יציאה'}</label><div class="ronny-time-control"><input id="quick-outbound" class="ronny-time-input" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="5" pattern="[0-2][0-9]:[0-5][0-9]" aria-label="שעת יציאה בפורמט 24 שעות" value="${esc(quickEndTime(s.time,s.duration).slice(0,5))}"><button type="button" class="ronny-time-trigger" aria-label="בחירת שעת יציאה" title="בחירת שעת יציאה">${icon('clock','small-icon')}</button></div></div>`}
 <div class="quick-departure"><span>${s.type==='walkStart'?'יציאה להליכה · חזרה בסיום':s.type==='start'?'יציאה':s.type==='end'?'הגעה':'הגעה · עצירה · יציאה'}</span><span class="quick-save-state" id="quick-save-state">שמירה אוטומטית</span></div>
 ${s.type==='walkStart'?`<section class="walk-loop-options" aria-label="${s.walkRetrace?'מסלול הלוך חזור':'מסלול הליכה מעגלי'}"><div class="walk-loop-head"><div><strong>${s.walkRetrace?'מסלול הלוך חזור':'מסלול רגלי מעגלי'}</strong><small>נקודת היציאה היא גם נקודת הסיום, בלי סיכה כפולה</small></div><span class="walk-loop-badge">קבוע</span></div><label class="walk-retrace-switch"><input id="walk-retrace-check" type="checkbox" ${s.walkRetrace?'checked':''}><span class="walk-retrace-track" aria-hidden="true"></span><span class="walk-retrace-copy"><strong>הלוך וחזור באותו התוואי</strong><small>כבוי: ניתן לצייר שביל חזרה נפרד</small></span></label><div class="ronny-walk-clock-grid"><label>הגעה לנקודת הסיבוב<div class="ronny-time-control"><input id="ronny-walk-turn-time" class="ronny-time-input" data-ronny-allow-empty="true" type="text" inputmode="numeric" maxlength="5" placeholder="אוטומטי" value="${esc(s.walkTurnClock||'')}" aria-label="שעת הגעה לנקודת הסיבוב; ריק לחישוב"><button type="button" class="ronny-time-trigger" aria-label="בחר שעת סיבוב" title="בחר שעה">${icon('clock','small-icon')}</button></div><button type="button" class="ronny-walk-auto-time" data-ronny-clear-walk-clock="ronny-walk-turn-time">חישוב אוטומטי</button></label><label>חזרה לנקודת ההתחלה<div class="ronny-time-control"><input id="ronny-walk-finish-time" class="ronny-time-input" data-ronny-allow-empty="true" type="text" inputmode="numeric" maxlength="5" placeholder="אוטומטי" value="${esc(s.walkFinishClock||'')}" aria-label="שעת סיום ההליכה; ריק לחישוב"><button type="button" class="ronny-time-trigger" aria-label="בחר שעת סיום הליכה" title="בחר שעה">${icon('clock','small-icon')}</button></div><button type="button" class="ronny-walk-auto-time" data-ronny-clear-walk-clock="ronny-walk-finish-time">חישוב אוטומטי</button></label></div><small class="ronny-walk-clock-hint">השאר שדה ריק לחישוב אוטומטי. משך ההליכה הכולל מתחלק שווה סביב נקודת הסיבוב, אלא אם נקבעה שעה ידנית. זמן הסיום הידני גובר על המשך.</small><div class="walk-loop-foot"><span class="walk-loop-note">נקודת סיבוב אינה מחייבת חזרה באותו תוואי.</span><div class="walk-loop-route-actions"><button type="button" class="walk-loop-route" id="walk-edit-first-leg">${icon("pencil-line","small-icon")} שרטוט רגיל</button><button type="button" class="walk-loop-route" id="walk-edit-pencil-leg">${icon("pencil","small-icon")} עיפרון חופשי</button></div></div></section>`:''}
 ${quickLegLinks(s,obj.day)}</div>
 <div class="point-quick-actions"><button type="button" data-quick-move>${icon('move','small-icon')} שנה מיקום במפה</button><button type="button" data-quick-street-view class="ronny-point-street-view" title="פתח את תצוגת הרחוב של גוגל ליד הנקודה">${icon('scan-eye','small-icon')} Street View</button><button type="button" data-quick-details>${icon('sliders-horizontal','small-icon')} הגדרות מתקדמות</button><button type="button" class="danger" data-quick-delete>${icon('trash-2','small-icon')} מחיקה</button></div>`;
 if(s.type==='walkStart'){
 const retrace=el.querySelector('#walk-retrace-check');
 retrace.onchange=()=>{s.walkRetrace=retrace.checked;syncWalkingLoops(state.days[obj.day]);invalidate();save();renderAll();openPointQuick(id)};
 for(const [buttonId,mode] of [['walk-edit-first-leg','draw'],['walk-edit-pencil-leg','pencil']]){
  el.querySelector('#'+buttonId).onclick=()=>{
   if(obj.day!==selectedDay){selectedDay=obj.day;viewScope='day';$('map-scope').value='day';renderAll()}
   const route=stops(),first=route.findIndex(p=>p.id===id),next=route.findIndex((p,i)=>i>first&&['walkTurn','walkEnd'].includes(p.type));
   if(first<0||next<0){toast('הוסף נקודת סיבוב או נקודת דרך כדי לשרטט את ההליכה');return}
   startLegDrawing(next,mode);
  };
 }
}

 // Keep the core point fields immediately accessible and place the optional controls in
 // exclusive, native disclosure panels. Move existing inputs instead of rebuilding them,
 // so the timing, route, color and icon listeners retain their original DOM targets.
 const quickForm=el.querySelector('.point-quick-form');
 const addPointSection=(key,label,symbol,nodes,detail='')=>{
  const items=nodes.filter(Boolean);if(!items.length)return null;
  const section=document.createElement('details');
  section.className='ronny-point-accordion';
  section.name='ronny-point-details';
  section.dataset.ronnyPointSection=key;
  const summary=document.createElement('summary');
  summary.innerHTML=icon(symbol,'small-icon')+'<strong>'+label+'</strong>'+(detail?'<small>'+esc(detail)+'</small>':'');
  const content=document.createElement('div');
  content.className='ronny-point-accordion-body';
  items.forEach(node=>content.appendChild(node));
  section.append(summary,content);quickForm.appendChild(section);
  return section;
 };
 const iconSection=quickForm.querySelector('.ronny-icon-editor');
 if(iconSection){iconSection.name='ronny-point-details';iconSection.dataset.ronnyPointSection='icons';iconSection.classList.add('ronny-point-accordion');quickForm.appendChild(iconSection);}
 const secondaryEditor=quickForm.querySelector('.ronny-secondary-icon-editor');
 if(secondaryEditor)addPointSection('context','אייקון משני','layers-2',[secondaryEditor],ronnySecondaryIconLabel(s,ronnyLinkedWalkParkingIds(routeStopsForDay(obj.day)).has(s.id)));
 addPointSection('colors','צבע הנקודה','palette',[quickForm.querySelector('.quick-colors')]);
 const timingNodes=['.quick-two','.quick-departure-editor','.quick-departure','.walk-loop-options'].map(selector=>quickForm.querySelector(selector));
 const timingSection=addPointSection('timing',s.type==='walkStart'?'זמנים ופרטי ההליכה':'זמנים ושהייה','clock-3',timingNodes,
   String(s.time||(s.type==='start'?tripDefaultDepartureTime():'09:00')).slice(0,5));
  if(timingSection)timingSection.open=true;
  // Outline-created days hide the timetable, not the editor's time controls.
  if(timingSection&&state.days[obj.day]?.scheduleEnabled===false){
   const note=document.createElement('div');
   note.className='ronny-time-schedule-note';
   note.innerHTML='<span>התזמון היומי כבוי. אפשר לערוך שעות כאן, או להפעיל את הצגת השעות לכל היום.</span><button type="button" data-quick-enable-schedule>הפעל תזמון ליום</button>';
   timingSection.querySelector('.ronny-point-accordion-body')?.prepend(note);
   note.querySelector('button').onclick=()=>{
    const day=state.days[obj.day];if(!day)return;
    day.scheduleEnabled=true;invalidate();retimeAfterOrderChange(obj.day);
    save();renderAll();openPointQuick(id);
   };
  }
 addPointSection('routes','דרכים אל הנקודה וממנה','route',[quickForm.querySelector('.point-route-links')]);
 const saveStatus=el.querySelector('#quick-save-state');
 if(saveStatus)el.querySelector('.point-quick-heading')?.appendChild(saveStatus);
 // A disclosure changes the actual popup height after positioning. Clamp it
 // back into the map, including when the editor is near the bottom edge.
 quickForm.querySelectorAll('details[name="ronny-point-details"]').forEach(section=>{
  section.addEventListener('toggle',()=>{
   if(!section.open)return;
   requestAnimationFrame(()=>{if(el.classList.contains('open'))keepMapPopoverVisible(el)});
  });
 });

 el.dataset.id=id;el.dataset.mode='day';
 const pane=$('map')?.closest('.map-pane');
 const roomy=!!pane&&pane.clientWidth>=560&&pane.clientHeight>=560;
 el.classList.toggle('ronny-point-full',roomy);
 el.classList.toggle('ronny-point-compact',!roomy);
 el.classList.toggle('ronny-point-tight',roomy&&pane.clientHeight<725);
 el.classList.remove('ronny-quick-exiting');el.classList.add('open');
 if(roomy&&el.scrollHeight>pane.clientHeight-28){
  // If even the condensed layout cannot fit, prefer a usable compact fallback to clipped fields.
  el.classList.remove('ronny-point-full','ronny-point-tight');el.classList.add('ronny-point-compact');
 }
 if(rememberedPosition){el.style.left=rememberedPosition.left;el.style.top=rememberedPosition.top;keepMapPopoverVisible(el)}
 else{el.dataset.wasMoved='no';positionMapPopover(el,pt)}
 let pending=null,timeEditIntent=null;
 const fields=()=>({name:el.querySelector('#quick-name'),description:el.querySelector('#quick-description'),time:el.querySelector('#quick-time'),duration:el.querySelector('#quick-duration'),departure:el.querySelector('#quick-outbound'),walkTurn:el.querySelector('#ronny-walk-turn-time'),walkFinish:el.querySelector('#ronny-walk-finish-time')});
 const commit=()=>{
  clearTimeout(pending);pending=null;
  const target=getStop(id);if(!target)return;
  const f=fields(),stop=target.stop,day=state.days[target.day];const name=f.name.value.trim();
  const oldName=stop.name,oldDescription=stop.description||'',oldTime=stop.time||'',oldDuration=Number(stop.duration)||0;
  if(name){if(name!==stop.name){stop.autoPlaceName=false;stop.autoViaName=false;stop.autoChronoName=false;const night=ronnyNightIndex().byStop.get(stop.id);if(night)TripModel.setNightName(night,name);}stop.name=name;}
  else f.name.value=stop.name;
  stop.description=f.description.value;
  const validClock=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const walkClockMessage='השעה מוקדמת מהנקודה שלפניה בהליכה. בהליכת לילה הטווח חייב להיות קצר מ־12 שעות.';
  if(stop.type==='walkTurn'&&validClock(f.time.value)&&f.time.value!==stop.time&&timeEditIntent!=='departure'){
   const walkRoute=routeStopsForDay(target.day),at=walkRoute.findIndex(p=>p.id===id),owner=at>0?walkRoute.slice(0,at).reverse().find(p=>p.type==='walkStart'):null;
   if(owner&&TripModel.walkClockIssue(owner.time,f.time.value,owner.walkFinishClock)){f.time.value=stop.time;toast(walkClockMessage)}
  }
  const arrivalChanged=validClock(f.time.value)&&f.time.value!==oldTime;
  const duration=f.duration?Number(f.duration.value):oldDuration;
  if(Number.isFinite(duration))stop.duration=Math.max(0,Math.min(3000,duration));
  const departureChanged=!!f.departure&&timeEditIntent==='departure'&&
    validClock(f.departure.value)&&f.departure.value!==quickEndTime(oldTime,oldDuration).slice(0,5);
  // Arrival is set by the incoming leg (or by an explicit arrival edit).
  // Editing departure changes the DWELL, never the arrival or earlier legs.
  // For a departure after midnight, interpret the time as the following day.
  if(departureChanged){
   const fixedArrival=clockMinutes(oldTime);
   const requestedDeparture=clockMinutes(f.departure.value);
   stop.duration=(requestedDeparture-fixedArrival+1440)%1440;
   if(f.duration)f.duration.value=String(stop.duration);
  }
  const oldTurn=stop.walkTurnClock||'',oldFinish=stop.walkFinishClock||'';
  if(stop.type==='walkStart'){
   const t=f.walkTurn?.value||'',z=f.walkFinish?.value||'';
   const startClock=validClock(f.time.value)?f.time.value:stop.time;
   const nextTurn=t===''||validClock(t)?t:oldTurn,nextFinish=z===''||validClock(z)?z:oldFinish;
   if(TripModel.walkClockIssue(startClock,nextTurn,nextFinish)){
    if(f.walkTurn)f.walkTurn.value=oldTurn;if(f.walkFinish)f.walkFinish.value=oldFinish;toast(walkClockMessage);
   }else{stop.walkTurnClock=nextTurn;stop.walkFinishClock=nextFinish}
  }
  const walkClockChanged=oldTurn!==(stop.walkTurnClock||'')||oldFinish!==(stop.walkFinishClock||'');
  const durationChanged=oldDuration!==stop.duration;
  let newAnchor=null;
  const route=routeStopsForDay(target.day),start=route[0];
  const walkIndex=route.findIndex(p=>p.id===id);
  const walkOwner=stop.type==='walkTurn'&&walkIndex>0?route.slice(0,walkIndex).reverse().find(p=>p.type==='walkStart'):null;
  const walkTurnAdjusted=!!walkOwner&&arrivalChanged&&timeEditIntent!=='departure';
  if(walkTurnAdjusted)walkOwner.walkTurnClock=f.time.value;
  // Patch 130: a typed arrival places the point by its time (and asks when it overlaps).
  if(arrivalChanged&&timeEditIntent!=='departure'&&!walkTurnAdjusted&&ronnyCanPlaceByTime(stop)&&ronnyPlaceByTime(target.day,id,f.time.value)){
   timeEditIntent=null;if(f.time.isConnected)f.time.value=stop.time;
   const label=el.querySelector('#quick-save-state');if(label)label.textContent='נשמר';
   save();renderMarkers();renderSchedule();return;
  }
  const anchoredToStart=day.timeAnchor?.kind==='departure'&&day.timeAnchor.stopId===start?.id;
  let arrivalAdjustedLeg=false;
  if(!isMapOnlyPoint(stop)&&arrivalChanged&&timeEditIntent!=='departure'&&!walkTurnAdjusted){
   if(stop.type==='start'&&start?.id===id){newAnchor={stopId:id,kind:'departure',time:f.time.value};}
   else if(anchoredToStart){
    // Preserve the start-of-day departure anchor. A manual arrival at a later
    // stop becomes a total-duration edit to the incoming leg instead.
    const index=route.findIndex(p=>p.id===id);
    if(index>0){
     const previous=route[index-1],incoming=getLegMutableForDay(target.day,index);
     const previousDeparture=clockMinutes(previous.time)+(Number(previous.dayOffset)||0)*1440+(previous.type==='walkStart'?0:Math.max(0,Number(previous.duration)||0));
     let requested=clockMinutes(f.time.value)+Math.floor(previousDeparture/1440)*1440;
     if(requested<previousDeparture)requested+=1440;
     incoming.minutes=Math.min(2880,Math.max(0,Math.round(requested-previousDeparture)));
     incoming.minutesMode='total';arrivalAdjustedLeg=true;
    }
   }else newAnchor={stopId:id,kind:'arrival',time:f.time.value};
  }
  if(newAnchor){day.timeAnchor=newAnchor;stop.time=newAnchor.time;if(newAnchor.kind==='departure'&&start?.id===id)day.departureUsesDefault=false;}
  else if(arrivalChanged&&validClock(f.time.value)&&timeEditIntent!=='departure'&&!arrivalAdjustedLeg&&!walkTurnAdjusted)stop.time=f.time.value;
  const timingChanged=!!newAnchor||durationChanged||arrivalAdjustedLeg||walkClockChanged||walkTurnAdjusted;
  const enableSchedule=day.scheduleEnabled===false&&(arrivalChanged||departureChanged||durationChanged||walkClockChanged||walkTurnAdjusted);
  if(enableSchedule)day.scheduleEnabled=true;
  // Dwell-only changes propagate forward from the existing arrival chain;
  // they must not establish a new anchor at this stop or shift preceding legs.
  if(timingChanged){if(arrivalAdjustedLeg)invalidate();retimeAfterOrderChange(target.day,newAnchor?routeStopsForDay(target.day).findIndex(x=>x.id===id):0);}
  if(f.time!==document.activeElement)f.time.value=stop.time;
  if(f.duration&&f.duration!==document.activeElement)f.duration.value=String(stop.duration);
  if(f.departure&&f.departure!==document.activeElement)f.departure.value=quickEndTime(stop.time,stop.duration).slice(0,5);
  const label=el.querySelector('#quick-save-state');if(label)label.textContent='נשמר';
  timeEditIntent=null;
  if(oldName===stop.name&&oldDescription===stop.description&&!timingChanged&&oldTime===stop.time)return;
  save();renderMarkers();renderSchedule();
  if(enableSchedule){renderPlanningResolution();el.querySelector('.ronny-time-schedule-note')?.remove()}
 };
 activeQuickCommit=commit;
 const lockButton=el.querySelector('[data-quick-time-lock]');
 // Keep focus in the time field, so a typed time is read here instead of being committed (and re-rendered) on blur.
 lockButton?.addEventListener('mousedown',e=>e.preventDefault());
 lockButton?.addEventListener('click',()=>{
  const target=getStop(id);if(!target)return;const stop=target.stop;
  ronnyRememberUndo(stop.timeLock?'שחרור שעה נעולה':'נעילת שעה');
  if(stop.timeLock){delete stop.timeLock;commit()}
  else{
   const typed=el.querySelector('#quick-time')?.value;
   stop.timeLock=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(typed||'')?typed:String(stop.time||'09:00').slice(0,5);
   ronnyDropTimePin(target.day,id);commit(); // a typed time now goes through the locked path, without a pin
  }
  invalidate();retimeAfterOrderChange(target.day);save();activeQuickCommit=null;renderAll();openPointQuick(id);
  toast(stop.timeLock?'השעה ננעלה על '+stop.timeLock:'השעה שוחררה');
 });
 el.querySelectorAll('[data-ronny-clear-walk-clock]').forEach(button=>button.addEventListener('click',()=>{const input=el.querySelector('#'+button.dataset.ronnyClearWalkClock);if(input){input.value='';input.dispatchEvent(new Event('change',{bubbles:true}))}}));
 const queue=()=>{const label=el.querySelector('#quick-save-state');if(label)label.textContent='שומר…';clearTimeout(pending);pending=setTimeout(commit,280)};
 Object.values(fields()).filter(Boolean).forEach(field=>{
   const clockField=field.id==='quick-time'||field.id==='quick-outbound';
   field.addEventListener('input',()=>{
    if(field.id==='quick-time')timeEditIntent='arrival';
    else if(field.id==='quick-outbound')timeEditIntent='departure';
    if(!clockField)queue();
   });
   field.addEventListener('change',()=>{
    if(field.id==='quick-time')timeEditIntent='arrival';
    else if(field.id==='quick-outbound')timeEditIntent='departure';
    commit();
   });
  });
  el.querySelector('#quick-show-description')?.addEventListener('change',e=>{const obj=getStop(id);if(!obj)return;commit();obj.stop.showMapDescription=e.target.checked;if(e.target.checked)state.settings.showMapDescriptions=true;save();renderMap();refreshIcons();toast(e.target.checked?'התיאור מוצג על המפה':'התיאור הוסתר מהמפה')});
 el.querySelector('#quick-type').addEventListener('change',e=>changeExistingPointType(id,e.target.value));
 el.querySelectorAll('[data-ronny-icon]').forEach(btn=>btn.addEventListener('click',()=>{commit();const target=getStop(id);if(!target)return;const value=btn.dataset.ronnyIcon;if(value)target.stop.iconId=value;else delete target.stop.iconId;save();renderMarkers();renderSchedule();el.querySelectorAll('[data-ronny-icon]').forEach(item=>item.classList.toggle('selected',item.dataset.ronnyIcon===(target.stop.iconId||'')));const summary=el.querySelector('.ronny-icon-editor summary');if(summary)summary.innerHTML='אייקון ראשי '+ronnyPointSymbol(target.stop.type,target.stop);refreshIcons()}));
 const setSecondaryIcon=(key,automatic=false)=>{
  commit();
  const target=getStop(id);if(!target||!['via','parking'].includes(target.stop.type))return;
  if(automatic&&target.stop.type!=='parking')return;
  if(!automatic&&key&&!RONNY_ICON_BANK.some(c=>c.id===key))return;
  const previous=Object.hasOwn(target.stop,'secondaryIconId')?target.stop.secondaryIconId:null;
  const next=automatic?null:key;
  if(previous===next)return;
  ronnyRememberUndo('שינוי אייקון משני');
  if(automatic||(!key&&target.stop.type==='via'))delete target.stop.secondaryIconId;
  else target.stop.secondaryIconId=key;
  save();renderMarkers();
  const linked=ronnyLinkedWalkParkingIds(routeStopsForDay(target.day)).has(id);
  const active=ronnySecondaryIconKey(target.stop,linked)||'';
  el.querySelectorAll('[data-ronny-secondary-icon]').forEach(btn=>{
   const checked=btn.dataset.ronnySecondaryIcon===active;
   btn.classList.toggle('selected',checked);btn.setAttribute('aria-pressed',String(checked));
  });
  const autoButton=el.querySelector('[data-ronny-secondary-auto]');
  if(autoButton){
   const isAuto=!Object.hasOwn(target.stop,'secondaryIconId');
   autoButton.classList.toggle('selected',isAuto);autoButton.setAttribute('aria-pressed',String(isAuto));
  }
  const label=el.querySelector('[data-ronny-point-section="context"] summary small');
  if(label)label.textContent=ronnySecondaryIconLabel(target.stop,linked);
  const status=el.querySelector('#quick-save-state');if(status)status.textContent='האייקון המשני נשמר';
 };
 el.querySelectorAll('[data-ronny-secondary-icon]').forEach(btn=>btn.addEventListener('click',()=>setSecondaryIcon(btn.dataset.ronnySecondaryIcon)));
 el.querySelector('[data-ronny-secondary-auto]')?.addEventListener('click',()=>setSecondaryIcon('',true));
 el.querySelector('#quick-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();hidePointQuick()}});
 // Colors take effect instantly, unlike text changes which are debounced.
 const setColor=c=>{commit();const target=getStop(id);if(!target)return;target.stop.color=c;ronnyPreferredColorEntity=target.stop.id;try{ensureStableViaColors()}finally{ronnyPreferredColorEntity=null}save();renderMarkers();renderSchedule();el.querySelectorAll('[data-quick-color]').forEach(b=>{const selected=b.dataset.quickColor.toLowerCase()===pointColor(target.stop,target.day).toLowerCase();b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});const input=el.querySelector('#quick-color-custom');if(input&&validCustomColor(c))input.value=c;el.querySelector('#quick-save-state').textContent='הצבע נשמר'};
 el.querySelectorAll('[data-quick-color]').forEach(b=>b.addEventListener('click',()=>setColor(b.dataset.quickColor)));
 el.querySelector('#quick-color-custom').addEventListener('input',e=>setColor(e.target.value));
 el.querySelector('[data-quick-color-auto]').onclick=()=>{commit();const target=getStop(id);if(!target)return;delete target.stop.color;delete target.stop.autoColor;ensureStableViaColors();save();renderMarkers();renderSchedule();const c=pointColor(target.stop,target.day);el.querySelectorAll('[data-quick-color]').forEach(b=>b.classList.toggle('selected',b.dataset.quickColor.toLowerCase()===c.toLowerCase()));el.querySelector('#quick-save-state').textContent='הצבע האוטומטי נשמר'};
 el.querySelectorAll('[data-point-leg]').forEach(btn=>btn.addEventListener('click',()=>{const index=+btn.dataset.pointLeg;hidePointQuick();openLegEditor(index)}));
 el.querySelector('[data-quick-close]').onclick=()=>hidePointQuick();
 el.querySelector('[data-relink-start]')?.addEventListener('click',()=>{commit();ronnyRelinkDayStart(s.id)});
 el.querySelectorAll('[data-point-role]').forEach(btn=>btn.addEventListener('click',()=>ronnySetPointRole(id,btn.dataset.pointRole)));
 el.querySelector('#quick-night-cost')?.addEventListener('change',e=>{
  const group=ronnyNightIndex().byStop.get(id);if(!group)return;
  ronnyRememberUndo('עדכון עלות לינה');TripModel.setNightCost(group,e.target.value);
  e.target.value=String(TripModel.nightCost(group).total);el.querySelector('.ronny-night-conflict')?.remove();
  save();renderSchedule();renderMarkers();const label=el.querySelector('#quick-save-state');if(label)label.textContent='העלות נשמרה';
 });
 el.querySelector('[data-night-transfer]')?.addEventListener('click',e=>{
  commit();const index=+e.currentTarget.dataset.nightTransfer,link=TripModel.dayLink(state,index,validPoint);if(link?.state!=='night')return;
  ronnyRememberUndo('הגדרת מעבר בין ימים');TripModel.setTransfer(state,index);hidePointQuick();invalidate();save();renderAll();openPointQuick(link.start.id);
  $('quick-transfer-kind')?.focus({preventScroll:true});toast('הימים הופרדו. בחרו את סוג המעבר וגררו את התחלת היום למקום החדש.');
 });
 const storeTransfer=()=>{
  const found=getStop(id);if(!found||found.day<1)return;
  ronnyRememberUndo('עדכון מעבר בין ימים');
  TripModel.setTransfer(state,found.day-1,{kind:el.querySelector('#quick-transfer-kind').value||null,note:el.querySelector('#quick-transfer-note').value});
  save();renderDays();renderSchedule();renderPoiLinks();refreshIcons();const label=el.querySelector('#quick-save-state');if(label)label.textContent='המעבר נשמר';
 };
 el.querySelector('#quick-transfer-kind')?.addEventListener('change',storeTransfer);
 el.querySelector('#quick-transfer-note')?.addEventListener('change',storeTransfer);
 el.querySelector('[data-quick-delete]').onclick=async()=>{const nightGroup=ronnyNightIndex().byStop.get(id);const question=nightGroup?'למחוק את הלינה ״'+s.name+'״ מכל '+nightGroup.members.length+' הימים שחולקים אותה?':'למחוק את הנקודה ״'+s.name+'״?';if(!await confirmOnMap(question,{title:nightGroup?'מחיקת לינה':'מחיקת נקודה',accept:nightGroup?'מחק לינה':'מחק נקודה'}))return;clearTimeout(pending);const target=getStop(id);if(!target)return;await animatePlannerRemoval([id],'day');ronnyRememberUndo(nightGroup?'מחיקת לינה':'מחיקת נקודה');const removed=nightGroup?nightGroup.members:[{stop:target.stop,day:target.day}];for(const member of removed){const day=state.days[member.day];day.stops=day.stops.filter(x=>x.id!==member.stop.id);positionRouteEndpoints(day)}selectedStop=null;hidePointQuick();if(!isMapOnlyPoint(target.stop)){invalidate();removed.forEach(member=>retimeAfterOrderChange(member.day))}save();renderAll();toast(nightGroup?'הלינה נמחקה':'הנקודה נמחקה')};
 el.querySelector('[data-quick-move]').onclick=()=>armPointMove(id);
 el.querySelector('[data-quick-street-view]').onclick=()=>{const target=getStop(id);if(target&&validPoint(target.stop))openGoogleStreetView(+target.stop.lat,+target.stop.lng);};
 el.querySelector('[data-quick-details]').onclick=()=>{hidePointQuick();openStopForm(id)};
 syncMarkerDragState();
 refreshIcons();
}
function focusStop(id,options){
 const obj=getStop(id);if(!obj||!map)return;
 hidePointQuick();closeLegEditor();hideContext();
 if(obj.day!==selectedDay||viewScope!=='day'){
  selectedDay=obj.day;viewScope='day';$('map-scope').value='day';renderAll();
 }
 // Only update marker states. Recreating every Leaflet marker on a list click
 // causes needless flicker and interrupts pending pointer interactions.
 selectedStop=id;syncMarkerDragState();renderSchedule();
 if(window.innerWidth<=760)showMap();
 const target=L.latLng(+obj.stop.lat,+obj.stop.lng);
 if(!Number.isFinite(target.lat)||!Number.isFinite(target.lng))return;
 const zoom=map.getZoom(),reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 // Do not unnecessarily recenter (or zoom) when the stop is already comfortably on screen.
 const bounds=map.getBounds?.();
 const inside=bounds?.isValid?.()&&bounds.pad(-.14).contains(target);
 // Patch 140: the phone point arrows always bring the point to the centre, close enough to see it.
 if(options?.center){const near=Math.max(14,zoom);if(near===zoom)map.panTo(target,{animate:!reduced,duration:reduced?0:.48});else map.flyTo(target,near,{duration:reduced?0:.6,animate:!reduced})}
 else if(!inside){
  const preferred=Math.max(10,zoom);
  if(preferred===zoom)map.panTo(target,{animate:!reduced,duration:reduced?0:.48});
  else map.flyTo(target,preferred,{duration:reduced?0:.55,animate:!reduced});
 }
 const idToPulse=id;
 window.setTimeout(()=>{
  markerLayer?.eachLayer?.(m=>{
   if(m.options?.ronnyStopId!==idToPulse)return;
   const badge=m.getElement?.()?.querySelector('.point-pin');
   if(badge?.animate&&!reduced)badge.animate([
    {transform:'scale(1)',filter:'brightness(1)'},
    {transform:'scale(1.16)',filter:'brightness(1.12)',offset:.47},
    {transform:'scale(1)',filter:'brightness(1)'}
   ],{duration:430,easing:'ease-out'});
  });
 },reduced?0:180);
}
// Drawer history retains DOM elements, listeners, form state, and scroll offset.
const ronnyDrawerHistory=[];
function ronnyBackState(){const btn=$('ronny-rail-back');if(!btn)return;const available=ronnyDrawerHistory.length>0&&!!$('drawer')?.classList.contains('open');btn.disabled=!available;btn.hidden=!available}
