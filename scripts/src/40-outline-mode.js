function normalizeOutline(value){
 const raw=value&&typeof value==='object'?value:{};
 const points=Array.isArray(raw.points)?raw.points.filter(p=>p&&typeof p.name==='string'&&validPoint(p)).slice(0,90).map(p=>({id:typeof p.id==='string'&&p.id?p.id:uid(),name:(/^יעד\s+\d+$/.test(p.name.trim())?'יעד':p.name.slice(0,70))||'יעד',description:String(p.description||'').slice(0,2500),showMapDescription:p.showMapDescription===true,lat:Number(p.lat),lng:Number(p.lng)})):[];
 const stagePlan={};
 if(raw.stagePlan&&typeof raw.stagePlan==='object')for(const [id,c] of Object.entries(raw.stagePlan))if(c&&typeof c==='object')stagePlan[id]={label:String(c.label||'').slice(0,80),description:String(c.description||'').slice(0,1200),days:Math.min(90,Math.max(1,Number(c.days)||1)),dayIds:Array.isArray(c.dayIds)?c.dayIds.filter(x=>typeof x==='string').slice(0,100):[]};
 return {points,stagePlan};
}
function currentOutline(){if(!state.outline)state.outline={points:[],stagePlan:{}};return state.outline}
function outlineSegments(){const pts=currentOutline().points;return pts.slice(1).map((end,i)=>({from:pts[i],to:end,index:i,config:currentOutline().stagePlan[end.id]||{label:'',days:1,description:'',dayIds:[]}}))}
function findOutlineStage(id){return outlineSegments().find(x=>x.to.id===id)||null}
function stageConfig(id){const o=currentOutline();if(!o.stagePlan[id])o.stagePlan[id]={label:'',description:'',days:1,dayIds:[]};return o.stagePlan[id]}
let ronnyOfferedDayAllocation=false;
function setPlanningResolution(level,options={}){
 if(!['outline','stage','day'].includes(level))return;
 const shouldOfferAllocation=level==='day'&&planningResolution!=='day'&&!ronnyOfferedDayAllocation&&currentOutline().points.length>0&&state.days.length===1&&!state.days[0].stops.length&&!state.days[0].outlineDayMapped;
 if(level==='stage'){level='outline';if(!findOutlineStage(selectedStageId))selectedStageId=null}
 if(level==='day'){outlineAddArmed=false;}if(level!=='day')ronnyBulkStops.clear();else ronnyBulkOutline.clear();ronnyBulkMode=false;
 if(drawLegSession)stopLegDrawing();closeLegEditor();hidePointQuick();hideContext();closeDrawer();closeOutlineMapAdd();
 if(level!=='day'){selectedStop=null;outlineAddArmed=false;cancelPointMove()}outlineMoveModeId=null;closeOutlineMapAdd();
 planningResolution=level;state.settings.planningResolution=level==='day'?'day':'outline';
 renderAll();save();
 if(options.fit!==false){if(level!=='day')fitOutlineMap();else fitMap()}
 if(shouldOfferAllocation){ronnyOfferedDayAllocation=true;requestAnimationFrame(openOutlineDayAssignment)}
}
function renderPlanningResolution(){
 const macro=planningResolution!=='day';
 $('planner')?.classList.toggle('is-macro',macro);document.body.classList.toggle('ronny-macro-mode',macro);
 document.body.classList.toggle('ronny-no-times',!macro&&state.days[selectedDay]?.scheduleEnabled===false);
 document.querySelectorAll('[data-plan-level]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.planLevel===planningResolution)));
 $('zoom-workspace').style.display=macro?'flex':'';
 if(macro)renderZoomWorkspace();
}
function renderDayTimeMode(){
 const el=$('day-time-mode');if(!el)return;
 const day=state.days[selectedDay],on=day?.scheduleEnabled!==false;
 el.innerHTML=`<span>${on?'תכנון יומי לפי שעות':'תכנון יומי כללי · ללא שעות'}</span><button type="button" class="zoom-soft-button" id="toggle-day-clock">${icon(on?'clock-3':'clock-4','small-icon')} ${on?'הסתר שעות':'הפעל תזמון'}</button>`;
 $('toggle-day-clock').onclick=()=>{day.scheduleEnabled=!on;if(day.scheduleEnabled){invalidate();retimeAfterOrderChange(selectedDay)}save();renderAll()};refreshIcons();
}
function renderZoomWorkspace(){
 const previousScroll=$('zoom-scroll')?.scrollTop||0;
 const previousCardIds=new Set([...document.querySelectorAll('#zoom-content [data-zoom-card]')].map(x=>x.dataset.zoomCard));
 const out=currentOutline(),segments=outlineSegments();
 const actualDays=state.days.length===1&&!state.days[0].stops.length&&!state.days[0].outlineStageId?0:state.days.length;
 const head=`<span class="zoom-overline">מתאר הטיול · תכנון ללא שעות</span><h2>המסלול הגדול</h2><p>לחץ ברצף על נקודות במפה כדי ליצור יעדים. אין קטגוריות או חלוניות בין לחיצות. לאחר מכן סדר ושנה את שמות היעדים לפי הצורך. הימים והלינות יוגדרו בנפרד.</p><div class="zoom-stats"><span class="zoom-stat">${out.points.length} יעדים</span><span class="zoom-stat">${segments.length} חיבורים</span><span class="zoom-stat">${actualDays} ימים</span></div>`;
 let html=ronnyBulkToolbar('outline')+`<div class="zoom-map-helper">${icon('mouse-pointer-click','small-icon')} <strong>לחץ על המפה כדי להוסיף יעד. המשך ללחוץ ברצף; כל לחיצה יוצרת את היעד הבא.</strong> המתאר גאוגרפי בלבד: כל חיבור הוא מעבר בין יעדים, ולא חלוקת ימים.</div>`;
 html+=out.points.length?`<div class="zoom-stack">${out.points.map((p,i)=>{
  const previous=out.points[i-1],seg=previous?segments[i-1]:null;
  const linked=seg?(seg.config.dayIds||[]).map(id=>state.days.find(d=>d.dayId===id)).filter(Boolean):[];
  const expanded=seg?.to.id===selectedStageId;
  return `${previous?`<div class="zoom-between" data-outline-between="${esc(p.id)}" role="button" tabindex="0" aria-label="פתח תכנון הקטע ${esc(previous.name)} עד ${esc(p.name)}"><span class="zoom-between-line"></span><button type="button" class="zoom-stage-button" data-outline-stage="${esc(p.id)}" aria-expanded="${expanded}"><span><strong>${esc(seg.config.label||`${previous.name} — ${p.name}`)}</strong><br><small>${linked.length?`${linked.length} ימים ששויכו בעבר`:'מקטע גאוגרפי · ללא חלוקת ימים'}</small></span><span class="stage-chevron">${icon('chevron-left','small-icon')}</span></button>${expanded?`<section class="zoom-stage-inline" aria-label="פרטי מקטע גאוגרפי"><div class="zoom-field"><label for="stage-title-input">שם החלק בטיול (לא חובה)</label><input id="stage-title-input" maxlength="80" value="${esc(seg.config.label||'')}" placeholder="${esc(previous.name+' — '+p.name)}"></div><div class="zoom-field"><label for="stage-description-input">מה רוצים לעשות בדרך? (לא חובה)</label><textarea id="stage-description-input" maxlength="1200" placeholder="רעיונות ועצירות שאפשר לפרט בהמשך">${esc(seg.config.description||'')}</textarea></div><div class="stage-inline-actions"><button type="button" id="stage-save">${icon('check','small-icon')} שמור</button><button type="button" class="stage-create-action" id="zoom-create-days" >${icon('calendar-plus','small-icon')} שיוך עוגנים לימים</button></div>${linked.length?`<div class="zoom-hint">בחר יום להמשך תכנון. כל יום עצמאי ואפשר להפעיל בו שעות מאוחר יותר.</div>${linked.map(d=>`<div class="zoom-draft-day"><span><strong>${esc(d.label)}</strong><small>יום ${state.days.indexOf(d)+1} · ${d.scheduleEnabled===false?'ללא שעות':'עם שעות'}</small></span><button type="button" data-stage-open-day="${esc(d.dayId)}">פתח יום</button></div>`).join('')}`:''}</section>`:''}</div>`:''}
   <article class="zoom-card ronny-entity ${ronnyBulkOutline.has(p.id)?'ronny-bulk-selected':''} ${p.id===selectedOutlineId?'is-selected':''}" draggable="true" data-zoom-card="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.name)} — לחץ להתמקדות במפה" title="לחץ להתמקדות · גרור את הכרטיס לשינוי הסדר · או השתמש בחצים" style="--point-c:${i===0?'#232c28':OUTLINE_COLORS[(i-1)%OUTLINE_COLORS.length]}">${ronnyBulkMode?`<label class="ronny-bulk-check" title="בחר יעד למחיקה"><input type="checkbox" data-ronny-select-id="${esc(p.id)}" ${ronnyBulkOutline.has(p.id)?'checked':''} aria-label="בחר יעד ${esc(p.name)}"></label>`:''}<div class="zoom-card-head"><span class="zoom-number">${i+1}</span><span class="zoom-card-title" title="${esc(p.name)}">${esc(p.name)}</span><span class="zoom-reorder-grip" aria-hidden="true" title="גרור לסידור מחדש">${icon('grip-vertical','small-icon')}</span></div><div class="ronny-rename-row" data-outline-rename="${esc(p.id)}" hidden><input data-outline-name="${esc(p.id)}" maxlength="70" value="${esc(p.name)}" aria-label="שם יעד חדש"><button type="button" data-outline-save="${esc(p.id)}" title="שמור שם" aria-label="שמור שם">${icon('check','small-icon')}</button><button type="button" data-outline-cancel="${esc(p.id)}" title="ביטול" aria-label="בטל שינוי שם">${icon('x','small-icon')}</button></div><div class="zoom-controls"><button type="button" data-zoom-edit="${esc(p.id)}" title="שנה שם" aria-label="שנה שם היעד">${icon('pencil','small-icon')}</button><button type="button" data-zoom-up="${esc(p.id)}" aria-label="הזז יעד למעלה" title="הזז למעלה" ${i===0?'disabled':''}>${icon('arrow-up','small-icon')}</button><button type="button" data-zoom-down="${esc(p.id)}" aria-label="הזז יעד למטה" title="הזז למטה" ${i===out.points.length-1?'disabled':''}>${icon('arrow-down','small-icon')}</button><button type="button" class="zoom-danger" data-zoom-delete="${esc(p.id)}" title="מחק יעד" aria-label="מחק יעד">${icon('trash-2','small-icon')}</button></div></article>`
 }).join('')}</div>`:`<div class="zoom-empty"><strong>התחל לתכנן גאוגרפית על המפה</strong>לחץ על כמה יעדים ברצף במפה. אחר כך אפשר לתת להם שמות ולשייך את העוגנים לימי טיול נפרדים.</div>`;
 html+=`<p class="zoom-hint">המתאר הוא רצף גאוגרפי בלבד; הוא לא מגדיר מתי נוסעים, היכן ישנים או כמה זמן נדרש. את החלוקה לימים בוחרים בנפרד.</p>`;
 const foot=`${out.points.length?`<button type="button" class="btn btn-primary" id="zoom-derive-all">${icon('calendar-range','small-icon')} שיוך עוגנים לימים</button>`:''}<button type="button" class="btn btn-soft" id="zoom-from-days">${icon('copy','small-icon')} בנה מתאר מימים קיימים</button><button type="button" class="btn" id="zoom-fit-outline">${icon('maximize-2','small-icon')} הצג את המתאר</button>`;
 $('zoom-header').innerHTML=head;$('zoom-content').innerHTML=html;$('zoom-footer').innerHTML=foot;
 if($('zoom-scroll'))$('zoom-scroll').scrollTop=previousScroll;
 for(const card of document.querySelectorAll('#zoom-content [data-zoom-card]'))if(!previousCardIds.has(card.dataset.zoomCard))card.classList.add('ronny-card-enter');
 $('zoom-from-days').onclick=importOutlineFromDays;$('zoom-derive-all')?.addEventListener('click',openOutlineDayAssignment);
 $('zoom-fit-outline').onclick=fitOutlineMap;
 document.querySelectorAll('[data-outline-stage]').forEach(b=>b.onclick=()=>{
  const id=b.dataset.outlineStage,closing=selectedStageId===id;
  if(closing){const inside=b.closest('.zoom-between')?.querySelector('.zoom-stage-inline');if(inside&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){inside.classList.add('ronny-stage-closing');b.setAttribute('aria-expanded','false');setTimeout(()=>{if(selectedStageId===id){selectedStageId=null;renderZoomWorkspace()}},160);return}}
  selectedStageId=closing?null:id;renderZoomWorkspace();
  if(selectedStageId){const el=document.querySelector(`[data-outline-between="${CSS.escape(id)}"]`);el?.scrollIntoView({block:'nearest',behavior:window.matchMedia?.('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});}
 });
 document.querySelectorAll('[data-zoom-edit]').forEach(b=>b.onclick=()=>editOutlinePoint(b.dataset.zoomEdit));
 document.querySelectorAll('[data-outline-save]').forEach(b=>b.onclick=()=>saveOutlinePointName(b.dataset.outlineSave));
 document.querySelectorAll('[data-outline-cancel]').forEach(b=>b.onclick=()=>{b.closest('[data-outline-rename]').hidden=true});
 document.querySelectorAll('[data-outline-name]').forEach(inp=>inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();saveOutlinePointName(inp.dataset.outlineName)}if(e.key==='Escape'){e.preventDefault();inp.closest('[data-outline-rename]').hidden=true;inp.closest('.zoom-card')?.focus()}}));
 document.querySelectorAll('[data-zoom-up]').forEach(b=>b.onclick=()=>moveOutlinePoint(b.dataset.zoomUp,-1));
 document.querySelectorAll('[data-zoom-down]').forEach(b=>b.onclick=()=>moveOutlinePoint(b.dataset.zoomDown,1));
 document.querySelectorAll('[data-zoom-delete]').forEach(b=>b.onclick=()=>deleteOutlinePoint(b.dataset.zoomDelete));
 document.querySelectorAll('[data-outline-between]').forEach(section=>{
  const btn=section.querySelector('[data-outline-stage]');if(!btn)return;
  section.addEventListener('click',e=>{if(e.target===btn||e.target.closest('[data-outline-stage]'))return;if(e.target.closest('input,textarea,select,a,button,.zoom-stage-inline'))return;btn.click()});
  section.addEventListener('keydown',e=>{if(e.target===section&&(e.key==='Enter'||e.key===' ')){e.preventDefault();btn.click()}});
 });
 bindRonnyBulkToolbar($('zoom-content'),'outline');
 bindOutlineReorderScroll();
 document.querySelectorAll('[data-zoom-card]').forEach(b=>{
  b.addEventListener('click',e=>{if(performance.now()<outlineSuppressClickUntil||e.target.closest('button,input,textarea,select,a,label'))return;if(ronnyBulkMode){const id=b.dataset.zoomCard;ronnyBulkOutline.has(id)?ronnyBulkOutline.delete(id):ronnyBulkOutline.add(id);renderZoomWorkspace();return}selectOutlinePoint(b.dataset.zoomCard,true)});
  b.addEventListener('keydown',e=>{if(e.target===b&&(e.key==='Enter'||e.key===' ')){e.preventDefault();if(ronnyBulkMode){ronnyBulkOutline.has(b.dataset.zoomCard)?ronnyBulkOutline.delete(b.dataset.zoomCard):ronnyBulkOutline.add(b.dataset.zoomCard);renderAll()}else selectOutlinePoint(b.dataset.zoomCard,true)}});
  b.addEventListener('dragstart',e=>{if(ronnyBulkMode){e.preventDefault();return}e.dataTransfer.setData('application/x-ronny-outline',b.dataset.zoomCard);e.dataTransfer.setData('text/plain',b.dataset.zoomCard);e.dataTransfer.effectAllowed='move';beginOutlineCardDrag(b.dataset.zoomCard,e);b.classList.add('is-dragging')});
  b.addEventListener('dragend',()=>finishOutlineCardDrag(false));
 });
 if(selectedStageId&&findOutlineStage(selectedStageId)){
  const id=selectedStageId;
  const saveFields=()=>{const c=stageConfig(id);c.label=$('stage-title-input').value.trim().slice(0,80);c.description=$('stage-description-input').value.trim().slice(0,1200);save()};
  $('stage-save').onclick=()=>{saveFields();renderZoomWorkspace();toast('פרטי הדרך נשמרו')};
  $('zoom-create-days').onclick=()=>{saveFields();openOutlineDayAssignment()};
  document.querySelectorAll('[data-stage-open-day]').forEach(b=>b.onclick=()=>openDayFromOutline(b.dataset.stageOpenDay));
 }
 refreshIcons();
}
function initResolutionUI(){document.querySelectorAll('[data-plan-level]').forEach(b=>b.onclick=()=>setPlanningResolution(b.dataset.planLevel))}
let outlinePendingLatLng=null;
function closeOutlineMapAdd(){
 const el=$('outline-map-add');if(el)el.classList.remove('open');outlinePendingLatLng=null;
}
function openOutlineMapAdd(latlng,point){
 if(planningResolution==='day'||!latlng)return;
 closeOutlineMapAdd();hideContext();hidePointQuick();closeLegEditor();
 const el=$('outline-map-add');if(!el)return;
 outlinePendingLatLng={lat:+latlng.lat,lng:+latlng.lng};
 const index=currentOutline().points.length+1;
 el.innerHTML=`<div class="outline-map-add-header"><span>${icon('map-pin-plus','small-icon')} יעד חדש במתאר</span><button type="button" id="outline-map-close" aria-label="סגור">${icon('x','small-icon')}</button></div><label for="outline-quick-name">שם היעד</label><input id="outline-quick-name" maxlength="70" placeholder="לדוגמה: מדריד" value="יעד"><div class="outline-map-add-actions"><button type="button" id="outline-map-cancel">ביטול</button><button type="button" class="outline-add-confirm" id="outline-map-confirm">${icon('check','small-icon')} הוסף יעד</button></div>`;
 el.classList.add('open');
 const pane=document.querySelector('.map-pane');
 if(pane)positionMapPopover(el,point||{x:pane.clientWidth/2,y:pane.clientHeight/2});
 const accept=()=>{const at=outlinePendingLatLng;if(!at)return;const name=$('outline-quick-name').value.trim().slice(0,70)||`יעד`;closeOutlineMapAdd();addOutlinePoint(at,name)};
 $('outline-map-confirm').onclick=accept;$('outline-map-cancel').onclick=closeOutlineMapAdd;$('outline-map-close').onclick=closeOutlineMapAdd;
 $('outline-quick-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();accept()}else if(e.key==='Escape'){e.preventDefault();closeOutlineMapAdd()}});
 if(window.L){L.DomEvent.disableClickPropagation(el);L.DomEvent.disableScrollPropagation(el)}
 setTimeout(()=>{if(el.classList.contains('open')){$('outline-quick-name')?.focus();$('outline-quick-name')?.select()}},0);
 refreshIcons();
}
function addOutlinePoint(latlng,name,type="attraction"){
 if(!Number.isFinite(latlng?.lat)||!Number.isFinite(latlng?.lng))return null;
 const out=currentOutline();if(out.points.length>=90){toast('הגעת למגבלת 90 יעדים במתאר');outlineAddArmed=false;return}
 const i=out.points.length;const p={id:uid(),name:String(name||'יעד').slice(0,70),description:'',lat:Number(Number(latlng.lat).toFixed(6)),lng:Number(Number(latlng.lng).toFixed(6))};
 out.points.push(p);selectedOutlineId=p.id;outlineAddArmed=true;save();renderAll();return p.id;
}
let outlineDrag=null,outlineScrollFrame=0,outlineSuppressClickUntil=0;
function clearOutlineDropIndicator(){document.querySelectorAll('.ronny-drop-before,.ronny-drop-after,.is-dragging').forEach(el=>el.classList.remove('ronny-drop-before','ronny-drop-after','is-dragging'));}
function outlineDropIndex(clientY){const cards=[...document.querySelectorAll('#zoom-content [data-zoom-card]')];for(let i=0;i<cards.length;i++){const rect=cards[i].getBoundingClientRect();if(clientY<rect.top+rect.height/2)return i;}return cards.length}
function updateOutlineDropTarget(clientY){if(!outlineDrag)return;outlineDrag.y=clientY;outlineDrag.to=outlineDropIndex(clientY);document.querySelectorAll('#zoom-content [data-zoom-card]').forEach((card,i)=>{card.classList.toggle('ronny-drop-before',i===outlineDrag.to);card.classList.toggle('ronny-drop-after',i===currentOutline().points.length-1&&outlineDrag.to===currentOutline().points.length)})}
function outlineScrollWhileDragging(){if(!outlineDrag){outlineScrollFrame=0;return}const scroller=$('zoom-scroll');if(!scroller){outlineScrollFrame=0;return}const rect=scroller.getBoundingClientRect(),y=outlineDrag.y;
 // Broad activation region: around 28% of the panel, at least 100px, maximum 170px.
 const zone=Math.min(170,Math.max(100,rect.height*.28));let velocity=0;
 if(y<rect.top+zone){const t=Math.min(1,Math.max(0,(rect.top+zone-y)/zone));velocity=-Math.max(2,27*t*t)}
 else if(y>rect.bottom-zone){const t=Math.min(1,Math.max(0,(y-(rect.bottom-zone))/zone));velocity=Math.max(2,27*t*t)}
 if(velocity&&scroller.scrollHeight>scroller.clientHeight){const old=scroller.scrollTop;scroller.scrollTop+=velocity;if(old!==scroller.scrollTop)updateOutlineDropTarget(y)}
 outlineScrollFrame=requestAnimationFrame(outlineScrollWhileDragging);
}
function beginOutlineCardDrag(id,e){finishOutlineCardDrag(false);outlineDrag={id,y:e.clientY,to:currentOutline().points.findIndex(x=>x.id===id)};document.body.classList.add('ronny-outline-sorting');updateOutlineDropTarget(e.clientY);outlineScrollFrame=requestAnimationFrame(outlineScrollWhileDragging)}
function finishOutlineCardDrag(commit=false){const last=outlineDrag;outlineDrag=null;outlineSuppressClickUntil=performance.now()+420;if(outlineScrollFrame)cancelAnimationFrame(outlineScrollFrame);outlineScrollFrame=0;document.body.classList.remove('ronny-outline-sorting');clearOutlineDropIndicator();if(commit&&last)reorderOutlineToIndex(last.id,last.to)}
function bindOutlineReorderScroll(){const scroller=$('zoom-scroll');if(!scroller||scroller.dataset.reorderBound)return;scroller.dataset.reorderBound='true';
 scroller.addEventListener('dragover',e=>{if(!outlineDrag)return;e.preventDefault();e.dataTransfer.dropEffect='move';updateOutlineDropTarget(e.clientY)});
 scroller.addEventListener('drop',e=>{if(!outlineDrag)return;e.preventDefault();e.stopPropagation();updateOutlineDropTarget(e.clientY);finishOutlineCardDrag(true)});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&outlineDrag){finishOutlineCardDrag(false)}});
}
function reorderOutlineToIndex(id,insertAt){const arr=currentOutline().points;const from=arr.findIndex(p=>p.id===id);if(from<0)return;let to=Math.min(arr.length,Math.max(0,insertAt));if(from<to)to--;if(to===from)return;const [p]=arr.splice(from,1);arr.splice(to,0,p);selectedOutlineId=id;save();renderAll();const card=[...document.querySelectorAll('[data-zoom-card]')].find(x=>x.dataset.zoomCard===id);if(card){card.classList.add('ronny-order-arrived');card.addEventListener('animationend',()=>card.classList.remove('ronny-order-arrived'),{once:true})}toast('היעד הועבר למיקום '+(to+1))}
function reorderOutlinePoint(fromId,toId){const idx=currentOutline().points.findIndex(p=>p.id===toId);if(idx>=0)reorderOutlineToIndex(fromId,idx)}
function moveOutlinePoint(id,delta){const i=currentOutline().points.findIndex(p=>p.id===id);if(i<0)return;reorderOutlineToIndex(id,i+delta+(delta>0?1:0))}
function selectOutlinePoint(id,focus){const p=currentOutline().points.find(x=>x.id===id);if(!p)return;selectedOutlineId=id;renderAll();if(focus)map?.flyTo([p.lat,p.lng],Math.max(7,map.getZoom()),{duration:.48})}
function openOutlinePointQuick(id){
 if(planningResolution==='day'||!map)return;
 const p=currentOutline().points.find(x=>x.id===id);if(!p)return;
 hideContext();closeLegEditor();closeOutlineMapAdd();hidePointQuick();
 selectedOutlineId=id;renderZoomWorkspace();
 const el=$('point-quick'),pos=map.latLngToContainerPoint([p.lat,p.lng]);if(!el)return;
 const index=currentOutline().points.indexOf(p)+1;
 el.dataset.mode='outline';el.dataset.id=id;el.dataset.wasMoved='no';el.classList.remove('ronny-point-full','ronny-point-compact');
 el.innerHTML=`<div class="point-quick-header"><div class="point-quick-top"><span style="color:#5a8a6b">${icon('map-pin','small-icon')}</span><div class="point-quick-heading"><strong>יעד ${index} במתאר</strong><small>עריכת יעד · ללא שעות או סוגי נקודות</small></div><span class="popup-drag-handle" role="button" tabindex="0" title="גרור להזזת החלונית" aria-label="גרור את החלונית">${icon('grip-horizontal','small-icon')}</span><button type="button" data-quick-close aria-label="סגור">${icon('x','small-icon')}</button></div></div>
 <div class="point-quick-form"><div class="quick-field"><label for="outline-popup-name">שם היעד</label><input id="outline-popup-name" maxlength="70" value="${esc(p.name)}" aria-label="שם היעד"></div><div class="quick-field"><label for="outline-popup-description">תיאור או הערות</label><textarea id="outline-popup-description" maxlength="2500" placeholder="הערות על היעד">${esc(p.description||'')}</textarea></div> <label class="ronny-description-choice"><input id="outline-show-description" type="checkbox" ${p.showMapDescription?'checked':''}><span>${icon('message-square-text','small-icon')} הצג את תיאור היעד על המפה</span></label><div class="quick-departure"><span>נקודת יעד במתאר הטיול</span><span class="quick-save-state" id="quick-save-state">שמירה אוטומטית</span></div></div>
 <div class="point-quick-actions"><button type="button" data-quick-move>${icon('move','small-icon')} שנה מיקום במפה</button><button type="button" data-quick-street-view class="ronny-point-street-view" title="פתח את תצוגת הרחוב של גוגל ליד היעד">${icon('scan-eye','small-icon')} Street View</button><button type="button" data-outline-focus>${icon('locate-fixed','small-icon')} התמקד בנקודה</button><button type="button" class="danger" data-quick-delete>${icon('trash-2','small-icon')} מחיקה</button></div>`;
 el.classList.remove('ronny-quick-exiting');el.classList.add('open');positionMapPopover(el,pos);
 let pending=null;
 const commit=()=>{
  clearTimeout(pending);pending=null;
  const current=currentOutline().points.find(x=>x.id===id);if(!current)return;
  const name=el.querySelector('#outline-popup-name')?.value.trim().slice(0,70)||current.name;
  const description=(el.querySelector('#outline-popup-description')?.value||'').slice(0,2500);
  if(current.name!==name||current.description!==description){const old={...current};current.name=name;current.description=description;if(old.name!==name)syncOutlineAnchors(id,old);save();renderZoomWorkspace();renderOutlineMap()}
  const status=el.querySelector('#quick-save-state');if(status)status.textContent='נשמר';
 };
 activeQuickCommit=commit;
 for(const input of [el.querySelector('#outline-popup-name'),el.querySelector('#outline-popup-description')]){
  input.addEventListener('input',()=>{el.querySelector('#quick-save-state').textContent='שומר…';clearTimeout(pending);pending=setTimeout(commit,320)});
  input.addEventListener('change',commit);
 }
 el.querySelector('#outline-show-description')?.addEventListener('change',e=>{p.showMapDescription=e.target.checked;if(e.target.checked)state.settings.showMapDescriptions=true;save();renderMap();toast(e.target.checked?'תיאור היעד מוצג במפה':'תיאור היעד הוסתר מהמפה')});
 el.querySelector('#outline-popup-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();hidePointQuick()}});
 el.querySelector('[data-quick-close]').onclick=hidePointQuick;
 el.querySelector('[data-outline-focus]').onclick=()=>{commit();map.flyTo([p.lat,p.lng],Math.max(9,map.getZoom()),{duration:.45})};
 el.querySelector('[data-quick-street-view]').onclick=()=>{const target=currentOutline().points.find(x=>x.id===id);if(target)openGoogleStreetView(+target.lat,+target.lng)};
 el.querySelector('[data-quick-move]').onclick=()=>{commit();outlineMoveModeId=id;hidePointQuick();updateMapHint();toast('בחר מיקום חדש ליעד בלחיצה על המפה · Esc לביטול')};
 el.querySelector('[data-quick-delete]').onclick=async()=>{commit();hidePointQuick();await deleteOutlinePoint(id)};
 refreshIcons();
}
function editOutlinePoint(id){
 const editor=[...document.querySelectorAll('[data-outline-rename]')].find(x=>x.dataset.outlineRename===id);
 if(!editor)return;
 document.querySelectorAll('[data-outline-rename]').forEach(x=>{if(x!==editor)x.hidden=true});
 editor.hidden=!editor.hidden;
 if(!editor.hidden){const input=editor.querySelector('input');input?.focus();input?.select()}
}
function saveOutlinePointName(id){
 const p=currentOutline().points.find(x=>x.id===id);
 const input=[...document.querySelectorAll('[data-outline-name]')].find(x=>x.dataset.outlineName===id);
 if(!p||!input)return;
 const next=input.value.trim().slice(0,70);
 if(!next){toast('נא להזין שם יעד');input.focus();return}
 const old={...p};p.name=next;syncOutlineAnchors(id,old);save();renderAll();toast('שם היעד נשמר');
}
async function deleteOutlinePoint(id){const o=currentOutline(),i=o.points.findIndex(x=>x.id===id);if(i<0)return;
 if(!await confirmOnMap('למחוק את היעד מהמתאר? ימים שכבר נוצרו יישארו ללא שינוי.',{title:'מחיקת יעד במתאר',accept:'מחק יעד'}))return;
 await animatePlannerRemoval([id],'outline');o.points.splice(i,1);if(selectedOutlineId===id)selectedOutlineId=null;if(selectedStageId===id)selectedStageId=null;save();setPlanningResolution('outline',{fit:false});
}
function importOutlineFromDays(){
 const out=currentOutline();if(out.points.length){toast('כדי לייבא נקודות מימים, יש להתחיל ממתאר ריק.');return}
 const candidates=[];for(const day of state.days){const points=routeStopsForDay(state.days.indexOf(day)).filter(validPoint);if(!points.length)continue;
  for(const s of [points[0],points.at(-1)]){if(!s)continue;const prev=candidates.at(-1);if(prev&&kmBetween([prev.lat,prev.lng],[s.lat,s.lng])<100)continue;candidates.push({id:uid(),name:s.name||types[s.type]?.name||'יעד',lat:+s.lat,lng:+s.lng})}}
 if(candidates.length<2){toast('לא נמצאו מספיק נקודות מסלול בימים. הוסף יעדים ישירות על המפה.');return}
 out.points=candidates.slice(0,90);save();renderAll();fitOutlineMap();toast('יעדי המתאר יובאו מהימים, בלי לשנות את המסלולים שלהם')
}
function dayStageContext(day){const sid=day?.outlineStageId;return sid?findOutlineStage(sid):null}
function dayOutlineBridgeHTML(){
 const points=currentOutline().points;if(!points.length)return '';
 const day=state.days[selectedDay];const assigned=(day.stops||[]).filter(p=>p.outlineAnchorId).map(p=>p.name);
 return `<div class="ronny-stage-bridge"><span class="ronny-stage-badge">חיבור למתאר</span><strong>${assigned.length?`${assigned.length} עוגנים משויכים ליום הזה`:'המתאר זמין לתכנון היומי'}</strong><small>${assigned.length?esc(assigned.join(' · ')):'אפשר לשייך עוגנים גאוגרפיים לכל יום. זה לא קובע שעות או מקום לינה.'}</small><button type="button" data-outline-derive-days>${icon('calendar-range','small-icon')} ${assigned.length?'עריכת שיוך העוגנים':'שיוך עוגנים לימים'}</button></div>`;
}
function bindDayOutlineBridge(){document.querySelectorAll('[data-outline-derive-days]').forEach(b=>b.onclick=openOutlineDayAssignment)}
function syncOutlineAnchors(id,oldPoint){const p=currentOutline().points.find(x=>x.id===id);if(!p)return;for(const d of state.days){const seg=dayStageContext(d);if(seg&&d.outlineLabelLastSynced){const freshLabel=String(d.outlineLabelLastSynced).replaceAll(oldPoint.name,p.name);if(d.label===d.outlineLabelLastSynced)d.label=freshLabel;d.outlineLabelLastSynced=freshLabel}for(const stop of d.stops||[]){if(stop.outlineAnchorId!==id)continue;const old=stop.outlineLastSynced||oldPoint;if(old){if(Number.isFinite(+old.lat)&&Number.isFinite(+old.lng)&&Math.abs(+stop.lat-(+old.lat))<0.00002&&Math.abs(+stop.lng-(+old.lng))<0.00002){stop.lat=p.lat;stop.lng=p.lng}if(stop.name===old.name||['נקודת התחלה','נקודת סיום'].includes(stop.name))stop.name=p.name}stop.outlineLastSynced={lat:p.lat,lng:p.lng,name:p.name}}}invalidate()}
function createOutlineDaysInternal(stageIds){const outline=outlineSegments(),stageOrder=new Map(outline.map((s,i)=>[s.to.id,i]));const fresh=state.days.length===1&&!state.days[0].stops.length&&!state.days[0].outlineStageId;const selections=outline.filter(s=>stageIds.includes(s.to.id)&&!(stageConfig(s.to.id).dayIds||[]).some(id=>state.days.some(d=>d.dayId===id)));const quantity=selections.reduce((sum,s)=>sum+Math.max(1,Math.min(90,Number(stageConfig(s.to.id).days)||1)),0);if(!quantity)return [];
 if(state.days.length-(fresh?1:0)+quantity>100){toast('ניתן לתכנן לכל היותר 100 ימים. הקטן את חלוקת המקטעים.');return []}if(fresh)state.days=[];
 const created=[];for(const seg of selections){const count=Math.max(1,Math.min(90,Number(stageConfig(seg.to.id).days)||1)),conf=stageConfig(seg.to.id),here=stageOrder.get(seg.to.id);let insertion=state.days.findIndex(d=>d.outlineStageId&&stageOrder.has(d.outlineStageId)&&stageOrder.get(d.outlineStageId)>here);if(insertion<0)insertion=state.days.length;conf.dayIds=[];
 for(let i=0;i<count;i++){const dayId=uid(),color=DAY_ACCENTS[(insertion+i)%DAY_ACCENTS.length],points=[];const anchored=(p,type)=>({id:uid(),name:p.name,type,lat:p.lat,lng:p.lng,time:tripDefaultDepartureTime(),duration:0,cost:0,description:'',notes:'',outlineAnchorId:p.id,outlineLastSynced:{lat:p.lat,lng:p.lng,name:p.name},autoInheritedStart:false});if(i===0)points.push(anchored(seg.from,'start'));if(i===count-1)points.push(anchored(seg.to,'end'));
 state.days.splice(insertion+i,0,{label:count===1?`${seg.from.name} — ${seg.to.name}`:`${seg.from.name} — ${seg.to.name} · חלק ${i+1}`,outlineLabelLastSynced:count===1?`${seg.from.name} — ${seg.to.name}`:`${seg.from.name} — ${seg.to.name} · חלק ${i+1}`,dayId,outlineStageId:seg.to.id,description:conf.description||'',travelMode:'',color,segments:[],stops:points,scheduleEnabled:false});conf.dayIds.push(dayId);created.push(dayId)} }
 invalidate();save();return created;
}
async function deriveAllOutlineDays(options={}){return openOutlineDayAssignment();}
async function legacyDeriveAllOutlineDays(options={}){const segs=outlineSegments(),remaining=segs.filter(s=>!(stageConfig(s.to.id).dayIds||[]).some(id=>state.days.some(d=>d.dayId===id)));if(!remaining.length){toast('כל מקטעי המתאר כבר חולקו לימים.');return []}const n=remaining.reduce((a,s)=>a+Math.max(1,Math.min(90,Number(stageConfig(s.to.id).days)||1)),0);const pristine=state.days.length===1&&!state.days[0].stops.length&&!state.days[0].outlineStageId;
 if(!options.automatic){const ok=await confirmOnMap(`ליצור ${n} ימים מתוך ${remaining.length} מקטעי המתאר? ימי טיול קיימים ונקודות מפורטות לא יימחקו.`,{title:'שיוך המתאר לימים',accept:'המשך'});if(!ok)return []}
 const added=createOutlineDaysInternal(remaining.map(s=>s.to.id));if(added.length){if(options.openFirst!==false)openDayFromOutline(added[0]);else renderAll();toast(`נוצרו ${added.length} ימים המקושרים למתאר. עכשיו אפשר לפרט את הדרכים והעצירות.`)}return added;
}
function renderOutlineStageGuide(){
 if(!map||!outlineLayer||planningResolution!=='day')return;
 outlineLayer.clearLayers();
 const prefs=outlineGuidePrefs(),pts=currentOutline().points;
 if(!prefs.enabled||pts.length<2)return;
 for(let i=1;i<pts.length;i++){
  const a=pts[i-1],b=pts[i];
  const active=viewScope==='day'&&state.days[selectedDay]?.stops?.some(s=>s.outlineAnchorId===b.id);
  L.polyline([[a.lat,a.lng],[b.lat,b.lng]],{
   color:prefs.color,weight:active?prefs.weight+.6:prefs.weight,
   opacity:active?Math.min(1,prefs.opacity+.1):prefs.opacity,
   dashArray:outlineDashPattern(prefs.dash),lineCap:'round',lineJoin:'round',
   interactive:false,className:'ronny-outline-guide'
  }).addTo(outlineLayer);
 }
 if(prefs.endpoints)pts.forEach((p,i)=>{if(i===0)return;
  L.circleMarker([p.lat,p.lng],{radius:Math.max(3.2,prefs.weight*.8),
   fillColor:prefs.color,fillOpacity:Math.min(1,prefs.opacity+.1),
   color:'#fffdf5',weight:1.2,opacity:.85,interactive:false,className:'ronny-outline-endpoint'
  }).addTo(outlineLayer)
 });
}
function openDayFromOutline(dayId){const i=state.days.findIndex(d=>d.dayId===dayId);if(i<0)return;planningResolution='day';state.settings.planningResolution='day';selectDay(i);save()}
async function createDaysForStage(stageId){const seg=findOutlineStage(stageId);if(!seg)return;const existing=stageConfig(stageId).dayIds||[];if(existing.some(id=>state.days.some(d=>d.dayId===id))){toast('המקטע כבר מחובר לימים. בחר יום כדי לערוך אותו.');return;}const count=Math.max(1,Math.min(90,Number(stageConfig(stageId).days)||1));const yes=await confirmOnMap(`ליצור ${count} ימים עבור המקטע ${seg.from.name} — ${seg.to.name}?`,{title:'יצירת ימים ממקטע',accept:'צור ימים'});if(!yes)return;const created=createOutlineDaysInternal([stageId]);if(created.length){openDayFromOutline(created[0]);toast(`${created.length} ימים נוצרו מתוך המתאר.`)}}

function renderOutlineMap(){
 if(!map||!outlineLayer)return;
 routeToken++;clearTimeout(routeDebounce);routeController?.abort();routeController=null;
 markerLayer?.clearLayers();routeLayer?.clearLayers();poiLinkLayer?.clearLayers();legLabelLayer?.clearLayers();photoLayer?.clearLayers();viaLayer?.clearLayers();forcedHandleLayer?.clearLayers();outlineLayer.clearLayers();
 const points=currentOutline().points;const segs=outlineSegments();
 for(const s of segs){
  const a=[s.from.lat,s.from.lng],b=[s.to.lat,s.to.lng],color=OUTLINE_COLORS[s.index%OUTLINE_COLORS.length],chosen=selectedStageId===s.to.id;
  L.polyline([a,b],{color:'#fffdf6',weight:chosen?11:8,opacity:.9,interactive:false}).addTo(outlineLayer);
  const l=L.polyline([a,b],{color,weight:chosen?6:4.5,opacity:.94,dashArray:'10 8',lineCap:'round',interactive:true,bubblingMouseEvents:false}).addTo(outlineLayer);
  l.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);closeOutlineMapAdd();selectedStageId=s.to.id;renderZoomWorkspace()});
 }
 // Ideas remain visible in macro planning levels even when route markers are hidden.
 if(layerOn('ideas'))state.days.forEach((day,di)=>(day.stops||[]).filter(p=>p.type==='idea'&&validPoint(p)).forEach(p=>{
  const html='<div class="marker point-pin idea" style="--pin-color:#b78a08"><span class="point-pin-inner">'+pointSymbol('idea')+'</span></div>';
  const marker=L.marker([+p.lat,+p.lng],{icon:L.divIcon({html,className:'',iconSize:[36,36],iconAnchor:[18,34]}),title:p.name}).addTo(outlineLayer);
  marker.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);planningResolution='day';state.settings.planningResolution='day';selectedDay=di;renderAll();openPointQuick(p.id)});
  marker.bindTooltip(esc(p.name),{direction:'top'});
 }));
 points.forEach((p,i)=>{
  const col=i===0?'#222b26':OUTLINE_COLORS[(i-1)%OUTLINE_COLORS.length];
  const html=`<div class="zoom-pin ${p.id===selectedOutlineId?'selected':''}" style="--pin-c:${col}"><span>${i+1}</span></div><div class="zoom-node-label">${esc(p.name)}</div>`;
  const m=L.marker([p.lat,p.lng],{draggable:true,autoPan:true,icon:L.divIcon({className:'',html,iconSize:[42,40],iconAnchor:[21,20]}),ronnyOutlineId:p.id,title:'בחר יעד · גרור לשינוי מיקום'}).addTo(outlineLayer);
  if(state.settings.showMapDescriptions!==false&&p.showMapDescription&&p.description?.trim())m.bindTooltip(`<div class="ronny-permanent-point-desc">${esc(p.description.slice(0,240))}</div>`,{permanent:true,direction:'top',offset:[0,-8],className:'ronny-map-description ronny-outline-description',opacity:1});
  const node=m.getElement?.();if(node)node.dataset.ronnyOutlineId=p.id;
  let returnOutlineEditorAfterDrag=false;
  m.on('dragstart',()=>{
   ronnyMarkerDraggedAt=Date.now();
   const panel=$('point-quick');
   returnOutlineEditorAfterDrag=!!(panel?.classList.contains('open')&&panel.dataset.mode==='outline'&&panel.dataset.id===p.id);
   if(returnOutlineEditorAfterDrag)panel.classList.add('ronny-point-drag-hidden');
  });
  m.on('dragend',e=>{
   ronnyMarkerDraggedAt=Date.now();
   const ll=e.target.getLatLng(),restore=returnOutlineEditorAfterDrag;
   returnOutlineEditorAfterDrag=false;
   hidePointQuick();const old={...p};p.lat=+ll.lat.toFixed(6);p.lng=+ll.lng.toFixed(6);
   syncOutlineAnchors(p.id,old);save();renderAll();
   if(restore&&planningResolution==='outline'&&currentOutline().points.some(pt=>pt.id===p.id))openOutlinePointQuick(p.id);
   toast('מיקום היעד עודכן');
  });
  m.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);if(Date.now()-ronnyMarkerDraggedAt<450)return;closeOutlineMapAdd();if(planningResolution==='outline'){openOutlinePointQuick(p.id);revealPlanningCardFromMap(p.id,'outline')}});
 });
}
function fitOutlineMap(){if(!map)return;const o=currentOutline(),pts=o.points;
 if(!pts.length)return;const ll=pts.map(p=>[p.lat,p.lng]);if(ll.length===1)map.flyTo(ll[0],15,{duration:.5});else map.fitBounds(L.latLngBounds(ll),{padding:[38,44],maxZoom:16,animate:true,duration:.55});
}

function renderMap(){const dToggle=$('map-description-toggle');if(dToggle)dToggle.setAttribute('aria-pressed',String(state.settings.showMapDescriptions!==false));outlineLayer?.clearLayers();if(planningResolution!=='day'){renderOutlineMap();renderSavedPlaceMarkers();return}renderOutlineStageGuide();renderMarkers();drawRoute();renderPoiLinks();renderPhotos();renderViaHandles();renderSavedPlaceMarkers();if(googleMode)updateGoogleMap()}

function renderAll(){ronnyRenderGroupBar();const modelChanged=TripStateCommands.synchronizeForRender(state,planningResolution==='day',{syncWalkingLoops,synchronizeLoopDays,synchronizeDayStarts,synchronizeChronologicalEndpointNames});ensureStableViaColors();applyDayTheme();renderDays();renderSchedule();renderPlanningResolution();renderMap();renderTripDashboard();refreshIcons();if(modelChanged)save()}
function dayMissingEndpoint(d){return TripQueries.dayMissingEndpoint(d)}
function dayExcludedFromTotals(d){return TripQueries.dayExcludedFromTotals(d)}
function selectDay(i){if(i<0||i>=state.days.length)return;
 if(i!==selectedDay&&dayMissingEndpoint(state.days[selectedDay])){
  if(!window.confirm('לא נקבעה נקודת סיום\n\nנתוני היום לא ייספרו עד לקביעת סיום. להמשיך?'))return;
  state.days[selectedDay].excludedUntilEnd=true;save();
 }
 ronnyBulkStops.clear();ronnyBulkMode=false;planningResolution='day';cancelForcedRelocate();stopForcedWaypointMode();cancelPointMove();stopLegDrawing();closeLegEditor();selectedDay=i;selectedStop=null;viewScope='day';$('map-scope').value='day';hideContext();renderAll();fitMap();if(window.innerWidth<=760){$('planner').classList.remove('show-mobile');setRail(null)}}
function fitMap(){
 if(!map)return;
 if(planningResolution!=='day'){fitOutlineMap();return}
 // Only the selected entity defines the viewport; other days' idea markers remain visible separately.
 const coords=TripQueries.focusMapPositions(state,ronnyVisibleDayIndices());
 if(!coords.length){const home=state.settings.startCenter||mapPrefs.home;map.flyTo([home.lat,home.lng],home.zoom,{duration:.65});return}
 if(coords.length===1){map.flyTo(coords[0],15,{duration:.65});return}
 map.fitBounds(L.latLngBounds(coords),{padding:[38,44],maxZoom:16,animate:true,duration:.65});
}
let activeQuickCommit=null;
function hidePointQuick(){if(activeQuickCommit){const flush=activeQuickCommit;activeQuickCommit=null;flush()}const el=$('point-quick');if(el){el.classList.remove('ronny-point-drag-hidden');const wasOpen=el.classList.contains('open');el.classList.remove('open');if(wasOpen&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){el.classList.add('ronny-quick-exiting');setTimeout(()=>{if(!el.classList.contains('open'))el.classList.remove('ronny-quick-exiting')},175)}else el.classList.remove('ronny-quick-exiting');el.dataset.id='';el.dataset.mode=''}syncMarkerDragState()}
