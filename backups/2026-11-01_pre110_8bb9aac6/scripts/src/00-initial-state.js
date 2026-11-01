const $=id=>document.getElementById(id), esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const icon=(name,cls='small-icon')=>`<i data-lucide="${name}" class="${cls}"></i>`;
const uid=()=> (window.crypto?.randomUUID?.()||('stop'+Date.now().toString(36)+Math.random().toString(36).slice(2)));
const demo=()=>({version:2,title:'הרפתקה באלפים',startDate:'2026-10-26',settings:{googleKey:'',mapStyle:'streets',travelMode:'driving'},days:[
{label:'אגם לוצרן',stops:[{id:uid(),name:'Lucerne',type:'attraction',time:'09:00',duration:90,cost:0,lat:47.0502,lng:8.3093,notes:'סיור לאורך האגם והגשר העתיק'},{id:uid(),name:'Stoosbahn',type:'attraction',time:'11:45',duration:70,cost:120,lat:46.9917,lng:8.6698,notes:'פוניקולר והגעה לכפר סטוס'},{id:uid(),name:'Stoos',type:'nature',time:'13:30',duration:180,cost:0,lat:46.9803,lng:8.6628,notes:'מסלולי הליכה ונוף הררי'},{id:uid(),name:'Brunnen',type:'hotel',time:'18:00',duration:0,cost:650,lat:46.9938,lng:8.6061,notes:'לינה באזור האגם'}]},
{label:'האלפים הברניים',stops:[{id:uid(),name:'Interlaken',type:'attraction',time:'09:30',duration:70,cost:0,lat:46.6863,lng:7.8632,notes:'טיול במרכז העיירה'},{id:uid(),name:'Lauterbrunnen',type:'nature',time:'11:30',duration:150,cost:0,lat:46.5938,lng:7.9086,notes:'עמק המפלים'},{id:uid(),name:'Grindelwald',type:'attraction',time:'15:30',duration:140,cost:140,lat:46.6242,lng:8.0414,notes:'נוף עמק והרים'},{id:uid(),name:'Interlaken',type:'hotel',time:'19:00',duration:0,cost:720,lat:46.679,lng:7.85,notes:'לינה'}]},
{label:'אגמים ועיירות',stops:[{id:uid(),name:'Thun',type:'attraction',time:'10:00',duration:100,cost:0,lat:46.758,lng:7.629,notes:'העיר העתיקה'},{id:uid(),name:'Bern',type:'dining',time:'13:00',duration:90,cost:160,lat:46.948,lng:7.448,notes:'ארוחת צהריים'},{id:uid(),name:'Bern Old Town',type:'attraction',time:'15:00',duration:130,cost:0,lat:46.9479,lng:7.4474,notes:'העיר העתיקה'}]}
]});
// RONNY 5 — point taxonomy; legacy ids are retained for imported / saved trips.
const pointGroups=[
 {id:'route',label:'נקודות דרך נסיעה',subtitle:'נתיב נסיעה',color:'#65866f',types:['start','via','parking','end']},
 {id:'activity',label:'נקודות צד הדרך',subtitle:'מקושרות בקו מקווקו לנקודת הדרך הקרובה',color:'#bc8861',types:['viewpoint','dining','nature','fuel']},
 {id:'walk',label:'נקודות דרך הליכה',subtitle:'מסלולי הליכה',color:'#568973',types:['walkStart','walkTurn','walkEnd']},
 {id:'interest',label:'גישה מהירה',subtitle:'נקודות מידע המקושרות למסלול',color:'#668499',types:['poi','note','idea']}
];
const types={
 start:{name:'נקודת התחלה',icon:'house',emoji:'⌂',cls:'start',color:'#668b74',group:'route'},
 via:{name:'נקודת מעבר',icon:'circle-dot',emoji:'·',cls:'via',color:'#82927b',group:'route'},
 hike:{name:'נקודת מסלול הליכה (ישן)',icon:'footprints',emoji:'◦',cls:'hike',color:'#568973',group:'walk',legacy:true},
 walkStart:{name:'נקודת התחלה',icon:'footprints',emoji:'◦',cls:'hike',color:'#568973',group:'walk'},
 walkTurn:{name:'נקודת סיבוב',icon:'corner-up-left',emoji:'↶',cls:'hike',color:'#cf9654',group:'walk'},
 walkEnd:{name:'נקודת סיום',icon:'flag-triangle-right',emoji:'◦',cls:'hike',color:'#568973',group:'walk'},
 parking:{name:'חניה',icon:'square-parking',emoji:'P',cls:'parking',color:'#88a3ac',group:'route'},
 rest:{name:'עצירה (ישן)',icon:'bench',emoji:'🪑',cls:'rest',color:'#98765d',group:'route',legacy:true},
 note:{name:'הערה',icon:'asterisk',emoji:'✳',cls:'note',color:'#c29c55',group:'interest'},
 idea:{name:'רעיון',icon:'lightbulb',emoji:'💡',cls:'idea',color:'#b78a08',group:'interest'},
 end:{name:'נקודת סיום',icon:'bed-double',emoji:'▤',cls:'end',color:'#ac7278',group:'route'},
 viewpoint:{name:'צילום',icon:'camera',emoji:'◉',cls:'viewpoint',color:'#65829b',group:'activity'},
 nature:{name:'טבע',icon:'tree-pine',emoji:'♣',cls:'park',color:'#698d71',group:'activity'},
 other:{name:'אחר (ישן)',icon:'balloon-custom',emoji:'◯',cls:'other',color:'#bc8861',group:'activity',legacy:true},
 fuel:{name:'דלק',icon:'fuel',emoji:'⛽',cls:'other',color:'#bc8861',group:'activity'},
 dining:{name:'אוכל',icon:'utensils',emoji:'♧',cls:'dining',color:'#ae7973',group:'activity'},
 poi:{name:'נקודת עניין',icon:'eye',emoji:'◉',cls:'poi',color:'#7685a0',group:'interest'},
 attraction:{name:'אטרקציה (ישן)',icon:'map-pin',emoji:'📍',cls:'',color:'#ba9364',group:'activity',legacy:true},
 hotel:{name:'לינה (ישן)',icon:'bed-double',emoji:'🛏️',cls:'hotel',color:'#ac7278',group:'route',legacy:true}
};
const POINT_ORDER_KEY='ronny-point-order-v2';
let pointOrder=readPointOrder();
function readPointOrder(){try{const stored=JSON.parse(localStorage.getItem(POINT_ORDER_KEY)||'{}');const order={};pointGroups.forEach(g=>{const list=Array.isArray(stored[g.id])?stored[g.id]:[];order[g.id]=[...new Set([...list.filter(x=>g.types.includes(x)),...g.types])]});return order}catch(e){return Object.fromEntries(pointGroups.map(g=>[g.id,[...g.types]]))}}
function persistPointOrder(){try{localStorage.setItem(POINT_ORDER_KEY,JSON.stringify(pointOrder))}catch(e){toast('לא ניתן לשמור את סדר הסוגים בדפדפן')}}
function pointTypeAlias(t){return t==='attraction'?'poi':t==='hotel'?'end':types[t]?t:'other'}
const RONNY_LOOP_ICON='\x64ata:image/png;base64,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';
function pointSymbol(type){if(type==='loop')return '<img class="ronny-loop-symbol-img" src="'+RONNY_LOOP_ICON+'" alt="" draggable="false" aria-hidden="true">';const t=types[type]||types.other;if(t.icon==='bench')return '<svg class="point-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16M4 13h16M5 7v8M19 7v8M6 15l-1 5M18 15l1 5M3 15h18"/></svg>';if(t.icon==='balloon-custom')return '<svg class="point-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c-4 0-6 3-6 7 0 4 2 6 6 8 4-2 6-4 6-8 0-4-2-7-6-7Z"/><path d="M10 18h4l-2 2v2"/></svg>';return icon(t.icon,'point-symbol-icon')}

const RONNY_EXTRA_ICONS={"glencairn":{"label":"כוס וויסקי גלנקרן","src":"assets/glencairn_icon.svg"},"picnic":{"label":"סל פיקניק","path":"<path d=\"M4 11h16l-2 10H6L4 11Z\"/><path d=\"M7 11c0-4 2-7 5-7s5 3 5 7\"/><path d=\"M8 11l1 10m6-10-1 10\"/>"},"ferry":{"label":"חזית מעבורת","path":"<path d=\"M5 10h14l-1 8-6 3-6-3-1-8Z\"/><path d=\"M8 10V5h8v5M10 5V3h4v2M5 14h14\"/>"},"cablecar":{"label":"רכבל","path":"<path d=\"M3 5 21 3M12 4v6M7 10h10l2 3v6H5v-6l2-3Z\"/><path d=\"M5 15h14M9 10v5m6-5v5\"/>"}};
// The same eight choices are used for primary and secondary icons.
// Old saved iconId values can still render, but cannot be newly selected.
const RONNY_ICON_BANK=[
 {id:'glencairn',label:'כוס וויסקי'},{id:'nature',label:'טבע'},
 {id:'viewpoint',label:'צילום'},{id:'picnic',label:'סל פיקניק'},
 {id:'ferry',label:'מעבורת'},{id:'dining',label:'סכו״ם'},
 {id:'cablecar',label:'רכבל'},{id:'walkStart',label:'הליכה'}
];
function ronnyPointSymbol(type,stop){
 // Passage points always keep their original main icon/ordinal.
 if(type==='via')return pointSymbol(type);
 const key=stop&&(RONNY_ICON_BANK.some(i=>i.id===stop.iconId)||
  Object.hasOwn(types,stop.iconId)||Object.hasOwn(RONNY_EXTRA_ICONS,stop.iconId))?stop.iconId:null;
 if(!key)return pointSymbol(type);
 const extra=RONNY_EXTRA_ICONS[key];
 if(extra?.src)return '<img class="point-svg ronny-glencairn-icon" src="'+extra.src+'" alt="" aria-hidden="true" draggable="false">';
 if(extra)return '<svg class="point-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">'+extra.path+'</svg>';
 return pointSymbol(key);
}
function ronnyIconPickerMarkup(stop){
 if(stop.type==='via')return '';
 const selected=RONNY_ICON_BANK.some(i=>i.id===stop.iconId)?stop.iconId:'';
 const make=(key,label,markup)=>'<button type="button" data-ronny-icon="'+esc(key)+'" class="ronny-icon-choice'+(selected===key?' selected':'')+'" title="'+esc(label)+'">'+markup+'<small>'+esc(label)+'</small></button>';
 return '<details class="ronny-icon-editor"><summary>אייקון ראשי '+ronnyPointSymbol(stop.type,stop)+'</summary><div class="ronny-icon-grid">'+make('','ברירת מחדל',pointSymbol(stop.type))+RONNY_ICON_BANK.map(i=>make(i.id,i.label,ronnyPointSymbol(i.id,{iconId:i.id}))).join('')+'</div></details>';
}
// Match the existing dashed access connector: a walking start belongs to the
// latest valid non-walking route stop preceding it chronologically.
function ronnyLinkedWalkParkingIds(route){
 const linked=new Set();
 let previous=null;
 for(const point of route||[]){
  if(!point||!validPoint(point))continue;
  if(point.type==='walkStart'&&previous?.type==='parking')linked.add(previous.id);
  if(!WALK_TYPES.has(point.type))previous=point;
 }
 return linked;
}
function ronnySecondaryIconKey(stop,linkedWalk=false){
 if(!stop||!['via','parking'].includes(stop.type))return null;
 const key=stop.secondaryIconId;
 if(RONNY_ICON_BANK.some(i=>i.id===key))return key;
 // An explicit empty selection suppresses the automatic badge.
 if(Object.hasOwn(stop,'secondaryIconId'))return null;
 return stop.type==='parking'&&linkedWalk?'walkStart':null;
}
function ronnySecondaryIconLabel(stop,linkedWalk=false){
 const key=ronnySecondaryIconKey(stop,linkedWalk);
 if(!key)return 'ללא סמל';
 const label=RONNY_ICON_BANK.find(i=>i.id===key)?.label||'ללא סמל';
 return stop?.type==='parking'&&linkedWalk&&!Object.hasOwn(stop,'secondaryIconId')?label+' (אוטומטי)':label;
}
function ronnySecondaryIconMarkerMarkup(stop,linkedWalk=false){
 const key=ronnySecondaryIconKey(stop,linkedWalk);
 return key?'<span class="ronny-secondary-context-icon" aria-hidden="true">'+ronnyPointSymbol(key,{iconId:key})+'</span>':'';
}
function ronnySecondaryIconPickerMarkup(stop,linkedWalk=false){
 if(!['via','parking'].includes(stop.type))return '';
 const selected=ronnySecondaryIconKey(stop,linkedWalk)||'';
 const isAuto=stop.type==='parking'&&!Object.hasOwn(stop,'secondaryIconId');
 const choice=(key,label,markup)=>'<button type="button" class="ronny-secondary-icon-choice'+(selected===key?' selected':'')+'" data-ronny-secondary-icon="'+esc(key)+'" aria-pressed="'+String(selected===key)+'" aria-label="'+esc(label)+'" title="'+esc(label)+'">'+markup+'<small>'+esc(label)+'</small></button>';
 const auto=stop.type==='parking'?'<button type="button" class="ronny-secondary-auto'+(isAuto?' selected':'')+'" data-ronny-secondary-auto aria-pressed="'+String(isAuto)+'">אוטומטי לפי תחילת הליכה מקושרת</button>':'';
 const explanation=stop.type==='parking'?'במצב אוטומטי יופיע סמל הליכה רק כשמסלול הליכה מקושר לחנייה. בחירה ידנית גוברת עליו.':'בחר סמל קטן שיופיע מעל מספר נקודת המעבר.';
 return '<div class="ronny-secondary-icon-editor"><p>'+explanation+'</p>'+auto+'<div class="ronny-secondary-icon-grid">'+choice('','ללא סמל',icon('slash','small-icon'))+RONNY_ICON_BANK.map(c=>choice(c.id,c.label,ronnyPointSymbol(c.id,{iconId:c.id}))).join('')+'</div></div>';
}
function endpointChoiceAllowed(type,dayIndex=selectedDay,ignoreId=null){
 if(!['start','end'].includes(type))return true;
 const day=state.days[dayIndex];if(!day)return false;
 if(type==='start'&&dayIndex>0)return false;
 if(day.loop&&type==='end')return false;
 return !(day.stops||[]).some(p=>p.type===type&&p.id!==ignoreId);
}
function pointChoiceMarkup(selectedType){return `<div class="point-picker-hint">${icon('grip-vertical','small-icon')} גרור את הידית לשינוי סדר · במקלדת Alt וחצים</div><div class="point-type-picker" id="point-type-picker" aria-label="סוג הנקודה">${pointGroups.map(g=>`<section class="point-section" style="--group-accent:${g.color}" data-point-group="${g.id}"><div class="point-section-heading"><span class="group-indicator"></span><div><strong>${g.label}</strong><small>${g.subtitle}</small></div><span class="group-count">${g.types.length}</span></div><div class="point-choice-grid">${pointOrder[g.id].filter(type=>endpointChoiceAllowed(type,selectedDay)).map((type)=>`<button type="button" class="point-choice ${selectedType===type?'selected':''}" data-point-choice="${type}" draggable="true" aria-pressed="${selectedType===type}"><span class="point-grip" aria-hidden="true" title="גרור לשינוי הסדר">${icon('grip-vertical','small-icon')}</span><span class="point-choice-symbol" style="--symbol-color:${types[type].color}">${pointSymbol(type)}</span><span class="point-choice-name">${types[type].name}</span><span class="point-choice-check">${icon('check','small-icon')}</span></button>`).join('')}</div></section>`).join('')}</div>`}
function bindPointTypePicker({autoSaveOnPick=false}={}){const picker=$('point-type-picker');if(!picker)return;let from=null;picker.querySelectorAll('[data-point-choice]').forEach(btn=>{
 btn.addEventListener('click',e=>{
  // Clicking the grab handle sorts an option; it must not select/save that option.
  if(e.target.closest('.point-grip'))return;
  const type=btn.dataset.pointChoice;
  $('s-type').value=type;
  picker.querySelectorAll('[data-point-choice]').forEach(el=>{const active=el===btn;el.classList.toggle('selected',active);el.setAttribute('aria-pressed',String(active))});
  const title=$('s-point-label');if(title)title.textContent=types[type].name;
  if(!currentEdit){
   const name=$('s-name');
   if(name&&!name.dataset.userEdited){
    if(type==='start')name.value='נקודת התחלה';
    else if(type==='end')name.value='נקודת סיום';
    else if(!name.value.trim()||name.dataset.autoName==='true')name.value=types[type].name;
    name.dataset.autoName='true';
   }
   const dur=$('s-duration');if(dur&&['start','end','via','note','poi'].includes(type)&&Number(dur.value)===60)dur.value='0';
  }
  if(autoSaveOnPick)$('save-stop')?.click();
 });
 btn.addEventListener('dragstart',e=>{from=btn;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',btn.dataset.pointChoice);btn.classList.add('dragging')});
 btn.addEventListener('dragend',()=>{btn.classList.remove('dragging');picker.querySelectorAll('.point-choice').forEach(x=>x.classList.remove('drag-over'));from=null});
 btn.addEventListener('dragover',e=>{if(!from||!from.closest('[data-point-group]')?.isSameNode(btn.closest('[data-point-group]'))||from===btn)return;e.preventDefault();e.dataTransfer.dropEffect='move';btn.classList.add('drag-over')});
 btn.addEventListener('dragleave',()=>btn.classList.remove('drag-over'));
 btn.addEventListener('drop',e=>{e.preventDefault();btn.classList.remove('drag-over');const group=btn.closest('[data-point-group]');if(!from||from===btn||from.closest('[data-point-group]')!==group)return;const container=group.querySelector('.point-choice-grid');const before=Array.from(container.children).map(el=>({el,left:el.getBoundingClientRect().left,top:el.getBoundingClientRect().top}));const bounds=btn.getBoundingClientRect();if(e.clientY>bounds.top+bounds.height/2)btn.after(from);else btn.before(from);pointOrder[group.dataset.pointGroup]=Array.from(container.children).map(el=>el.dataset.pointChoice);persistPointOrder();before.forEach(p=>{const after=p.el.getBoundingClientRect();const dx=p.left-after.left,dy=p.top-after.top;if((dx||dy)&&p.el.animate)p.el.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'translate(0,0)'}],{duration:300,easing:'cubic-bezier(.2,.8,.25,1)'})});from.classList.remove('dragging');from=null;});
 btn.addEventListener('keydown',e=>{if(!e.altKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();const group=btn.closest('[data-point-group]'),grid=group.querySelector('.point-choice-grid');const entries=Array.from(grid.children),index=entries.indexOf(btn),to=index+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1);if(to<0||to>=entries.length)return;if(to>index)entries[to].after(btn);else entries[to].before(btn);pointOrder[group.dataset.pointGroup]=Array.from(grid.children).map(el=>el.dataset.pointChoice);persistPointOrder();btn.focus();btn.classList.add('reordered');setTimeout(()=>btn.classList.remove('reordered'),340)});
  });
 // Touch / stylus reordering: native HTML drag-and-drop is not supported on many mobile browsers.
 picker.querySelectorAll('.point-grip').forEach(grip=>{let picked=null,over=null;
  grip.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse')return;picked=grip.closest('[data-point-choice]');picked.classList.add('dragging');grip.setPointerCapture(e.pointerId);e.preventDefault()});
  grip.addEventListener('pointermove',e=>{if(!picked)return;const under=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-point-choice]');if(over&&over!==under)over.classList.remove('drag-over');over=under;if(over&&over!==picked&&over.closest('[data-point-group]')===picked.closest('[data-point-group]'))over.classList.add('drag-over')});
  grip.addEventListener('pointerup',e=>{if(!picked)return;const target=over,source=picked;picked.classList.remove('dragging');if(over)over.classList.remove('drag-over');picked=null;over=null;if(!target||target===source||target.closest('[data-point-group]')!==source.closest('[data-point-group]'))return;const group=source.closest('[data-point-group]'),grid=group.querySelector('.point-choice-grid');const bounds=target.getBoundingClientRect();if(e.clientY>bounds.top+bounds.height/2)target.after(source);else target.before(source);pointOrder[group.dataset.pointGroup]=Array.from(grid.children).map(el=>el.dataset.pointChoice);persistPointOrder();source.animate?.([{transform:'scale(1.05)',background:'#e9f0e6'},{transform:'scale(1)',background:'#fffaf3'}],{duration:350,easing:'ease-out'});});
  grip.addEventListener('pointercancel',()=>{picked?.classList.remove('dragging');over?.classList.remove('drag-over');picked=null;over=null});
 });refreshIcons()}

// RONNY library uses IndexedDB to store independent trips (including photo journals).
// One-time import from the legacy single-trip key keeps previous work intact.
const AVAILABLE_MAP_STYLES=['satellite','topo'];
const MAP_LABELS={streets:'מפה כללית · Esri',topo:'מפה טופוגרפית · OpenTopoMap','esri-topo':'מפה טופוגרפית · Esri',satellite:'תצ״א · ללא שמות','satellite-labels':'תצ״א · שמות, כבישים ואתרים'};
const DEFAULT_LAYER_VISIBILITY={routeLines:true,routeStops:true,poi:true,notes:true,ideas:true,poiLinks:true,routeLabels:true,routeTimes:false,photos:true};
const LAYER_FILTER_DEFS=[
 {key:'routeLines',label:'דרכים',hint:'הקווים בין נקודות המסלול'},
 {key:'routeStops',label:'נקודות דרך ועצירות',hint:'נקודות התחלה, עצירות, מעבר וסיום'},
 {key:'poi',label:'נקודות עניין',hint:'סמני עניין על המפה'},
 {key:'notes',label:'הערות',hint:'סמני הערות והשרשור שלהן למסלול'},
 {key:'ideas',label:'רעיונות',hint:'נורות צהובות שמוצגות בכל רמות התכנון'},
 {key:'poiLinks',label:'חיבורי עניין והערות',hint:'הקווים המקווקווים מהמסלול אל נקודות העניין וההערות'},
 {key:'routeLabels',label:'תיאורי דרך',hint:'כיתוב כמו רכבל, שביל או כביש על ציר הדרך'},
 {key:'routeTimes',label:'זמני דרך על הציר',hint:'שעת יציאה ושעת הגעה בין כל שתי נקודות'},
 {key:'photos',label:'תמונות',hint:'סמני תמונות שהוצמדו למפה'}
];
function normalizeLayerVisibility(value){const base={...DEFAULT_LAYER_VISIBILITY};if(value&&typeof value==='object')for(const key of Object.keys(base))if(key in value)base[key]=!!value[key];return base}

const MAP_DETAILS={streets:'מפת רחובות וכללית',topo:'קווי גובה ותבליט', 'esri-topo':'טופוגרפית עם כבישים ושמות',satellite:'תצלום אוויר נקי','satellite-labels':'תצלום אוויר, כבישים ושמות עדינים'};
const normalizeMapStyle=style=>AVAILABLE_MAP_STYLES.includes(style)?style:'streets';
const MAP_PREF_KEY='ronny-global-map-settings-v1';
const DEFAULT_HOME={lat:46.75,lng:8.12,zoom:9};
function readMapPrefs(){let obj={};try{obj=JSON.parse(localStorage.getItem(MAP_PREF_KEY)||'{}')||{}}catch(e){}
 const order=Array.isArray(obj.enabledMaps)?obj.enabledMaps.filter((v,i,a)=>AVAILABLE_MAP_STYLES.includes(v)&&a.indexOf(v)===i):AVAILABLE_MAP_STYLES.slice();
 if(!order.includes('satellite'))order.unshift('satellite');
  if(!order.includes('topo'))order.push('topo');
 const home=obj.home||DEFAULT_HOME;
 return {enabledMaps:order,defaultStyle:order.includes(obj.defaultStyle)?obj.defaultStyle:'satellite',home:{lat:Number.isFinite(+home.lat)&&Math.abs(+home.lat)<=90?+home.lat:DEFAULT_HOME.lat,lng:Number.isFinite(+home.lng)&&Math.abs(+home.lng)<=180?+home.lng:DEFAULT_HOME.lng,zoom:Number.isFinite(+home.zoom)?Math.max(2,Math.min(19,+home.zoom)):DEFAULT_HOME.zoom}};
}
let mapPrefs=readMapPrefs(),homePickMode=false;
function saveMapPrefs(){try{localStorage.setItem(MAP_PREF_KEY,JSON.stringify(mapPrefs));return true}catch(e){toast('לא ניתן לשמור הגדרות מפה בדפדפן');return false}}
function rebuildMapOptions(){const select=$('map-style');const previous=select.value;
 select.innerHTML=mapPrefs.enabledMaps.map(k=>`<option value="${k}">${esc(MAP_LABELS[k])}</option>`).join('');
 const next=mapPrefs.enabledMaps.includes(state.settings.mapStyle)?state.settings.mapStyle:mapPrefs.defaultStyle;
 select.value=next;
 if(map&&next!==state.settings.mapStyle)setMapStyle(next,false);
}

const LIB_DB='ronny-trip-library-v1', LIB_STORE='trips', LIB_ACTIVE='ronny-active-trip-v1', LIB_FALLBACK='ronny-local-library-v1';
let db=null, library=new Map(), activeTripId=null, saveQueue=Promise.resolve(), usingFallback=false, libraryReady=false, lastSaveError=false;
const cloneValue=value=>JSON.parse(JSON.stringify(value));
let state=demo();
let planningResolution='day',selectedOutlineId=null,selectedStageId=null,outlineAddArmed=false,outlineLayer=null,outlineMoveModeId=null;
let ronnyMarkerDraggedAt=0; // Recent physical drag must never count as a click.

let ronnyBulkMode=false;const ronnyBulkOutline=new Set(),ronnyBulkStops=new Set();
function resetPlannerBulk(){ronnyBulkMode=false;ronnyBulkOutline.clear();ronnyBulkStops.clear()}
function ronnyBulkIds(){return planningResolution==='day'?ronnyBulkStops:ronnyBulkOutline}
function ronnyBulkToolbar(kind){const ids=kind==='day'?ronnyBulkStops:ronnyBulkOutline;const len=kind==='day'?state.days[selectedDay]?.stops?.length||0:currentOutline().points.length;return `<div class="ronny-bulk-toolbar" role="toolbar" aria-label="בחירה מרובה"><button type="button" data-ronny-bulk-toggle aria-pressed="${ronnyBulkMode}" class="ronny-bulk-toggle ${ronnyBulkMode?'selected':''}">${icon(ronnyBulkMode?'check-square':'list-checks','small-icon')} ${ronnyBulkMode?'סיים בחירה':'בחירה מרובה'}</button>${ronnyBulkMode?`<span class="ronny-bulk-counter">${ids.size} נבחרו</span><button type="button" data-ronny-bulk-all>בחר הכול</button><button type="button" data-ronny-bulk-none>נקה</button><button type="button" class="ronny-bulk-remove" data-ronny-bulk-delete ${!ids.size?'disabled':''}>${icon('trash-2','small-icon')} מחק ${ids.size}</button>`:''}</div>`}
function bindRonnyBulkToolbar(root,kind){if(!root)return;const selected=kind==='day'?ronnyBulkStops:ronnyBulkOutline;root.querySelector('[data-ronny-bulk-toggle]')?.addEventListener('click',()=>{ronnyBulkMode=!ronnyBulkMode;ronnyBulkOutline.clear();ronnyBulkStops.clear();renderAll()});root.querySelector('[data-ronny-bulk-all]')?.addEventListener('click',()=>{const ids=kind==='day'?(state.days[selectedDay]?.stops||[]).map(s=>s.id):currentOutline().points.map(p=>p.id);selected.clear();ids.forEach(id=>selected.add(id));renderAll()});root.querySelector('[data-ronny-bulk-none]')?.addEventListener('click',()=>{selected.clear();renderAll()});root.querySelector('[data-ronny-bulk-delete]')?.addEventListener('click',()=>bulkDeletePlannerItems(kind));root.querySelectorAll('[data-ronny-select-id]').forEach(el=>el.addEventListener('change',()=>{el.checked?selected.add(el.dataset.ronnySelectId):selected.delete(el.dataset.ronnySelectId);const parent=el.closest('.zoom-card,.stop');parent?.classList.toggle('ronny-bulk-selected',el.checked);const counter=root.querySelector('.ronny-bulk-counter');if(counter)counter.textContent=selected.size+' נבחרו';const del=root.querySelector('[data-ronny-bulk-delete]');if(del){del.disabled=!selected.size;del.innerHTML=icon('trash-2','small-icon')+' מחק '+selected.size;refreshIcons()}}))}
function ronnyReducedMotion(){return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches}
async function animatePlannerRemoval(ids,kind){if(ronnyReducedMotion())return;const selector=kind==='day'?'[data-stop]':'[data-zoom-card]';const idattr=kind==='day'?'stop':'zoomCard';const targets=[...document.querySelectorAll(selector)].filter(el=>ids.includes(el.dataset[idattr]));targets.forEach(el=>{el.classList.add('ronny-removing');el.setAttribute('aria-busy','true')});if(kind==='day')markerLayer?.eachLayer?.(layer=>{if(ids.includes(layer.options?.ronnyStopId))layer.getElement?.()?.classList.add('ronny-marker-removing')});else outlineLayer?.eachLayer?.(layer=>{if(ids.includes(layer.options?.ronnyOutlineId))layer.getElement?.()?.classList.add('ronny-marker-removing')});if(targets.length)await new Promise(resolve=>setTimeout(resolve,265))}
async function bulkDeletePlannerItems(kind){const selected=kind==='day'?ronnyBulkStops:ronnyBulkOutline;const present=kind==='day'?state.days[selectedDay]?.stops||[]:currentOutline().points;const ids=[...selected].filter(id=>present.some(p=>p.id===id));if(!ids.length)return;hidePointQuick();const approved=await confirmOnMap(`למחוק ${ids.length} ${kind==='day'?'נקודות מהיום':'יעדים מהמתאר'}? ${kind==='outline'?'הימים שכבר נוצרו והנקודות שלהם יישארו ללא שינוי.':''}`,{title:'מחיקה מרובה',accept:'מחק '+ids.length});if(!approved)return;await animatePlannerRemoval(ids,kind);ronnyRememberUndo('מחיקת נקודות');const set=new Set(ids);if(kind==='outline'){const o=currentOutline();o.points=o.points.filter(p=>!set.has(p.id));ids.forEach(id=>{delete o.stagePlan[id]});if(set.has(selectedOutlineId))selectedOutlineId=null;if(set.has(selectedStageId))selectedStageId=null;}else{const d=state.days[selectedDay];d.stops=d.stops.filter(s=>!set.has(s.id));positionRouteEndpoints(d);selectedStop=null;invalidate();retimeAfterOrderChange(selectedDay)}selected.clear();ronnyBulkMode=false;save();renderAll();toast(ids.length+' פריטים נמחקו')}
// Each day is a separate route: at most one start and one finish.
// On replacement, the previous endpoint remains on the map as a waypoint.
function renumberWaypoints(day){
 // Number is determined by visible route order, and is local to this day.
 let counter=0;
 for(const stop of day.stops||[]){
  if(stop.type!=='via')continue;
  counter++;
  const defaultLabel=/^(?:נקודת מעבר(?:\s*\d+)?|מעבר דרך נקודה)$/.test(String(stop.name||'').trim());
  if(stop.autoViaName===true || (stop.autoViaName!==false && defaultLabel) || !String(stop.name||'').trim()){
   stop.name='נקודת מעבר';stop.autoViaName=false;
  }else if(stop.autoViaName!==true){stop.autoViaName=false;}
 }
}
function viaOrdinal(dayIndex,id){const via=(state.days[dayIndex]?.stops||[]).filter(s=>s.type==='via');return via.findIndex(s=>s.id===id)+1}
function positionRouteEndpoints(day){return TripStateCommands.positionRouteEndpoints(day,isMapOnlyPoint,renumberWaypoints)}
function enforceRouteEndpoints(day,updated){return TripStateCommands.enforceRouteEndpoints(day,updated)}
function normalizeSavedEndpoints(day){
 const seen=new Set();
 // Preserve the last marked endpoint when old imports contain duplicates.
 for(let i=day.stops.length-1;i>=0;i--){
  const s=day.stops[i];if(s.type==='start'||s.type==='end'){
   if(seen.has(s.type)){if(s.autoChronoName||ronnyIsAutoEndpointName(s.name)){s.name='נקודת מעבר';s.autoViaName=true;s.autoChronoName=false;}s.type='via';}else seen.add(s.type);
  }
 }
 positionRouteEndpoints(day);
}

// RONNY 35.17 — Day loop is a day-level setting, not a second pin to maintain.
// The hidden, derived endpoint participates in the road router and distance totals.
function syncWalkingLoops(day){
 if(!day||!Array.isArray(day.stops))return false;
 let changed=false;
 const starts=day.stops.filter(p=>p.type==='walkStart');
 for(const start of starts){
  if(start.walkLoop!==true){start.walkLoop=true;changed=true;}
  const routes=day.stops.filter(p=>!isMapOnlyPoint(p));
  const idx=routes.findIndex(p=>p.id===start.id);
  const next=routes.findIndex((p,i)=>i>idx&&p.type==='walkStart');
  const limit=next>=0?next:routes.length;
  const section=routes.slice(idx+1,limit);
  // Day endpoints are not walking waypoints; keep the walk finish before the day finish.
  const dayEndAt=section.findIndex(p=>p.type==='end');
  const walkingSection=dayEndAt<0?section:section.slice(0,dayEndAt);
  let end=section.find(p=>p.type==='walkEnd'&&p.walkLoopSource===start.id)||walkingSection.find(p=>p.type==='walkEnd'&&!p.walkLoopSource);
  const walkTail=walkingSection.filter(p=>p!==end).at(-1)||start;
  if(!end){
   end={id:uid(),name:'סיום ההליכה · חזרה להתחלה',type:'walkEnd',autoWalkEnd:true,
    walkLoopSource:start.id,lat:start.lat,lng:start.lng,time:start.time||'09:00',
    duration:0,cost:0,description:'',notes:''};
   day.stops.splice(day.stops.indexOf(walkTail)+1,0,end);changed=true;
  }else if(dayEndAt>=0&&day.stops.indexOf(end)>day.stops.indexOf(section[dayEndAt])){
   // Repair a saved walk finish that was previously inserted after the day finish.
   day.stops.splice(day.stops.indexOf(end),1);
   day.stops.splice(day.stops.indexOf(walkTail)+1,0,end);changed=true;
  }
  // The physical endpoint is always identical to the corresponding walking start.
  if(end.lat!==start.lat||end.lng!==start.lng){
   if(!end.autoWalkEnd&&!end.walkOldPosition)end.walkOldPosition={lat:end.lat,lng:end.lng};
   end.lat=start.lat;end.lng=start.lng;changed=true;
  }
  if(end.walkLoopSource!==start.id){end.walkLoopSource=start.id;changed=true;}
  // A turn is an ordinary required walking waypoint, never an automatic reversal.
  // Retracing is an independent, explicit choice; preserve the manually drawn return otherwise.
  if(start.walkRetrace){
   const points=day.stops.filter(p=>!isMapOnlyPoint(p));
   const first=points.findIndex(p=>p.id===start.id),last=points.findIndex(p=>p.id===end.id);
   if(last>first+1){
    const outward=[];let unverified=false;
    for(let j=first+1;j<last;j++){
      const leg=legAt(j,points),profile=leg.profile||'hiking';
      const routed=leg.mode==='auto'?routedLegVisualCache.get(routedShapeKey(points,j,profile)):null;
      if(leg.mode==='auto'&&!routed)unverified=true;
      const part=routed||legCoords(j,points);
      outward.push(...(j===first+1?part:part.slice(1)));
     }
    if(outward.length>1){
     const path=outward.slice().reverse().slice(1,-1),fromId=points[last-1].id;
     if(end.leg?.fromId!==fromId||end.leg?.mode!=='draw'||JSON.stringify(end.leg.path)!==JSON.stringify(path)||!end.leg.walkAutoRetrace||!!end.leg.walkRetraceUnverified!==unverified){
      end.leg={...(end.leg||{}),fromId,mode:'draw',profile:'hiking',path,viaPoints:[],walkAutoRetrace:true,walkRetraceUnverified:unverified};changed=true;
     }
    }
   }
  }else if(end.leg?.walkAutoRetrace){delete end.leg;changed=true;}
 }
 // Remove only obsolete autogenerated finishes whose start no longer exists.
 for(const end of [...day.stops].filter(p=>p.autoWalkEnd)){
  if(!starts.some(st=>st.id===end.walkLoopSource)){
   day.stops=day.stops.filter(p=>p!==end);changed=true;
  }
 }
 return changed;
}
function syncLoopDay(day,{tripLoop=false,tripOrigin=null}={}){
 // A loop has one physical arrival/departure pin. A derived final waypoint
 // links back to that exact start, so the road router can calculate the return.
 if(!day||!Array.isArray(day.stops))return false;
 let changed=false;
 let generated=day.stops.find(s=>s.autoLoopEnd);
 if(!day.loop&&!tripLoop){
  if(generated){day.stops=day.stops.filter(s=>!s.autoLoopEnd);changed=true;}
  if(day.preLoopEndId){
   const oldEnd=day.stops.find(s=>s.id===day.preLoopEndId);
   if(oldEnd){
    day.stops.filter(s=>s!==oldEnd&&s.type==='end').forEach(s=>s.type='rest');
    oldEnd.type='end';
    if(typeof day.preLoopEndName==='string')oldEnd.name=day.preLoopEndName;
    changed=true;
   }
   delete day.preLoopEndId;delete day.preLoopEndName;
  }
  if(changed)positionRouteEndpoints(day);
  return changed;
 }
 const route=day.stops.filter(s=>!isMapOnlyPoint(s)&&!s.autoLoopEnd);
 const start=route.find(s=>s.type==='start')||route[0];
 // A trip-level return always targets the FIRST DAY's departure point.
 // It is created once, as the final leg of the LAST DAY, never after an earlier day.
 const returnTarget=tripLoop&&validPoint(tripOrigin)?tripOrigin:start;
 if(!start){
  if(generated){day.stops=day.stops.filter(s=>!s.autoLoopEnd);return true;}
  return false;
 }
 if(start.type!=='start'){
  for(const s of route){if(s!==start&&s.type==='start')s.type='via';}
  start.type='start';changed=true;
 }
 // The old endpoint becomes a normal stop *between* the shared start/end,
 // rather than remaining a second, independent endpoint on the map.
 for(const stop of route){
  if(stop===start||stop.type!=='end')continue;
  if(!day.preLoopEndId){day.preLoopEndId=stop.id;day.preLoopEndName=stop.name;}
  stop.type='rest';
  if(stop.name==='נקודת סיום')stop.name='עצירה';
  changed=true;
 }
 if(!generated){
  generated={id:uid(),name:'',type:'end',autoLoopEnd:true,
   time:route.at(-1)?.time||start.time||'18:00',duration:0,cost:0,
   lat:validPoint(returnTarget)?+returnTarget.lat:null,lng:validPoint(returnTarget)?+returnTarget.lng:null,
   description:'',notes:''};
  day.stops.push(generated);changed=true;
 }
 if(generated.type!=='end'){generated.type='end';changed=true;}
 const endLat=validPoint(returnTarget)?+returnTarget.lat:null,endLng=validPoint(returnTarget)?+returnTarget.lng:null;
 if(generated.lat!==endLat||generated.lng!==endLng){generated.lat=endLat;generated.lng=endLng;changed=true;}
 if(generated.fromLoopStart!==returnTarget.id){generated.fromLoopStart=returnTarget.id;changed=true;}
 if(!!generated.autoTripLoopEnd!==!!tripLoop){generated.autoTripLoopEnd=!!tripLoop;changed=true;}
 const locationName=String(returnTarget.name||'').trim();
 const displayEndName=tripLoop?(locationName&&locationName!=='נקודת התחלה'?`סיום הטיול · ${locationName}`:'סיום הטיול · נקודת היציאה'):(locationName&&locationName!=='נקודת התחלה'?`סיום · ${locationName}`:'סיום · נקודת ההתחלה');
 if(generated.name!==displayEndName){generated.name=displayEndName;changed=true;}
 if(changed)positionRouteEndpoints(day);
 return changed;
}
function synchronizeLoopDays(){
 let changed=false;const days=state?.days||[];
 const start=(days[0]?.stops||[]).find(s=>s.type==='start'&&validPoint(s))||(days[0]?.stops||[]).find(s=>!isMapOnlyPoint(s)&&validPoint(s));
 days.forEach((d,i)=>{changed=syncLoopDay(d,{tripLoop:state?.settings?.tripLoop===true&&i===days.length-1,tripOrigin:start})||changed});
 return changed;
}
// Chronological day endpoint names (preserves user-entered locations).
function ronnyIsAutoEndpointName(name){return TripStateCommands.ronnyIsAutoEndpointName(name)}
function ronnyEndpointDayName(stop,i){return TripStateCommands.ronnyEndpointDayName(state,stop,i)}
function synchronizeChronologicalEndpointNames(){return TripStateCommands.synchronizeChronologicalEndpointNames(state)}
function prepareTrip(t){
 if(!t||!Array.isArray(t.days)||!t.days.length||!t.settings)throw Error('קובץ טיול לא תקין');
 const cleaned=cloneValue(t);
 cleaned.outline=normalizeOutline(cleaned.outline);
 cleaned.settings={googleKey:'',mapStyle:'streets',travelMode:'driving',plannerWidth:430,railWidth:54,drawerWidth:440,layerVisibility:{...DEFAULT_LAYER_VISIBILITY},...cleaned.settings};cleaned.settings.layerVisibility=normalizeLayerVisibility(cleaned.settings.layerVisibility);cleaned.settings.defaultDepartureTime=/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(cleaned.settings.defaultDepartureTime||'')?cleaned.settings.defaultDepartureTime:'09:00';
 delete cleaned.settings.mapyKey;delete cleaned.settings.routingProvider;
 cleaned.settings.mapStyle=mapPrefs.enabledMaps.includes(cleaned.settings.mapStyle)?cleaned.settings.mapStyle:mapPrefs.defaultStyle;
 if(!['driving','walking','hiking','cycling'].includes(cleaned.settings.travelMode))cleaned.settings.travelMode='driving';
 const center=cleaned.settings.startCenter;
 if(center&&!(Number.isFinite(+center.lat)&&Math.abs(+center.lat)<=90&&Number.isFinite(+center.lng)&&Math.abs(+center.lng)<=180&&Number.isFinite(+center.zoom)&&+center.zoom>=2&&+center.zoom<=19))delete cleaned.settings.startCenter;
 cleaned.photos=Array.isArray(cleaned.photos)?cleaned.photos:[];
 cleaned.days.forEach((d,i)=>{d.stops=Array.isArray(d.stops)?d.stops:[];d.label=typeof d.label==='string'?d.label.slice(0,65):'יום '+(i+1);d.description=typeof d.description==='string'?d.description.slice(0,1200):'';d.travelMode=TRAVEL_MODES[d.travelMode]?d.travelMode:'';d.dayId=typeof d.dayId==='string'&&d.dayId?d.dayId:uid();d.loop=d.loop===true;d.color=validDayColor(d.color)?d.color:DAY_ACCENTS[i%DAY_ACCENTS.length];d.stops.forEach(stop=>{if(stop.type==='via'&&stop.notes==='נקודת עיצוב מסלול — אפשר לגרור או למחוק')stop.notes=''});d.segments=Array.isArray(d.segments)?d.segments:[];normalizeSavedEndpoints(d);syncWalkingLoops(d);syncLoopDay(d,{tripLoop:cleaned.settings.tripLoop===true&&i===cleaned.days.length-1,tripOrigin:cleaned.days[0]?.stops?.find(s=>s.type==='start'&&validPoint(s))||cleaned.days[0]?.stops?.find(s=>!isMapOnlyPoint(s)&&validPoint(s))});if(d.timeAnchor&&(!d.stops.some(s=>s.id===d.timeAnchor.stopId&&!isMapOnlyPoint(s))||!['arrival','departure'].includes(d.timeAnchor.kind)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(d.timeAnchor.time||'')))delete d.timeAnchor});

 // Optional, trip-owned budget lines are independent of route points and remain
 // compatible with older JSON trips that do not contain extraExpenses.
 const validDayIds=new Set(cleaned.days.map(day=>day.dayId));
 const expenseIds=new Set();
 cleaned.extraExpenses=(Array.isArray(cleaned.extraExpenses)?cleaned.extraExpenses:[])
  .filter(item=>item&&typeof item==='object'&&!Array.isArray(item))
  .map(item=>{
   const name=typeof item.name==='string'?item.name.trim().slice(0,90):'';
   const amount=Number(item.amount);
   if(!name||!Number.isFinite(amount)||amount<0||amount>1e9)return null;
   let id=typeof item.id==='string'&&item.id.trim()?item.id.slice(0,100):uid();
   if(expenseIds.has(id))id=uid();
   expenseIds.add(id);
   return {id,name,amount:Math.round(amount*100)/100,
    dayId:typeof item.dayId==='string'&&validDayIds.has(item.dayId)?item.dayId:null};
  }).filter(Boolean);
 // Existing trips with manually chosen start times or anchors retain those values.
 cleaned.days.forEach(d=>{
  const start=(d.stops||[]).find(p=>p.type==='start');
  if(typeof d.departureUsesDefault!=='boolean')d.departureUsesDefault=!!start&&!d.timeAnchor&&(!start.time||start.time==='09:00');
  if(start&&d.departureUsesDefault&&!d.timeAnchor)start.time=cleaned.settings.defaultDepartureTime;
 });
 return cleaned;
}
