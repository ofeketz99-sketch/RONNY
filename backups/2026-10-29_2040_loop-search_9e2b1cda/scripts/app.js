
(function(){'use strict';
// Pure CoreTime logic: no DOM, network, trip state, or map dependencies.
const CoreTime=(()=>{
function clockMinutes(value){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));return m?((+m[1])*60+(+m[2])):540}
function clockAt(total){const m=((Math.round(total)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function ronnyValidate24(s){const m=String(s||'').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?m[1]+':'+m[2]:null}
function ronnyNormalize24(s){
 const t=String(s||'').trim();if(ronnyValidate24(t))return t;
 const compact=t.match(/^(\d{1,2}):(\d{1,2})$/)||t.match(/^(\d{1,2})(\d{2})$/);
 if(compact){const h=Number(compact[1]),m=Number(compact[2]);if(h>=0&&h<24&&m>=0&&m<60)return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
 if(/^\d{1,2}$/.test(t)&&Number(t)<24)return t.padStart(2,'0')+':00';
 return null;
}
return Object.freeze({clockMinutes, clockAt, ronnyValidate24, ronnyNormalize24});
})();
// Pure CoreGeo logic: no DOM, network, trip state, or map dependencies.
const CoreGeo=(()=>{
function kmBetween(a,b){const k=Math.PI/180,lat1=a[0]*k,lat2=b[0]*k,dlat=(b[0]-a[0])*k,dlng=(b[1]-a[1])*k;const h=Math.sin(dlat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dlng/2)**2;return 6371000*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)))}
function distanceOfCoords(coords){let d=0;for(let i=1;i<coords.length;i++)d+=kmBetween(coords[i-1],coords[i]);return d}
function ronnyPolyContains(lng,lat,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [ax,ay]=polygon[i],[bx,by]=polygon[j];if(((ay>lat)!==(by>lat))&&lng<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside}return inside}
function parseCoordinatePair(raw){
 if(typeof raw!=='string')return null;
 const m=raw.trim().match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)(?:\s|$)/);
 if(!m)return null;
 const lat=+m[1],lng=+m[2];return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
return Object.freeze({kmBetween, distanceOfCoords, ronnyPolyContains, parseCoordinatePair});
})();
// Pure CoreLegTiming logic: no DOM, network, trip state, or map dependencies.
const CoreLegTiming=(()=>{
function routeModeName(mode){return {auto:'מצא נתיב',draw:'שרטט נתיב',pencil:'עיפרון חופשי',straight:'קו אווירי'}[mode]||'מצא נתיב'}
function routeLegMinutes(leg){return leg.minutes!==null&&leg.minutes!==undefined&&leg.minutes!==''&&Number.isFinite(+leg.minutes)?Math.max(0,+leg.minutes):null}
function legTimingMode(leg){return leg?.mode==='auto'&&leg?.minutesMode==='extra'?'extra':'total'}
function resolveLegDuration(leg,baseSeconds){
 const seconds=Math.max(0,Number(baseSeconds)||0),override=routeLegMinutes(leg);
 return override===null?seconds:legTimingMode(leg)==='extra'?seconds+override*60:override*60;
}
function legTimingSnapshot(leg,baseSeconds){
 const base=Math.max(0,Number(baseSeconds)||0),duration=resolveLegDuration(leg,base);
 return {duration,baseDuration:base,adjustmentMinutes:(duration-base)/60,manualOverride:routeLegMinutes(leg)!==null,minutesMode:legTimingMode(leg)};
}
return Object.freeze({routeModeName, routeLegMinutes, legTimingMode, resolveLegDuration, legTimingSnapshot});
})();
// Pure CoreFormat logic: no DOM, network, trip state, or map dependencies.
const CoreFormat=(()=>{
function money(n){return '₪'+(Number(n)||0).toLocaleString('he-IL',{maximumFractionDigits:0})}
function minsFmt(m){if(!Number.isFinite(m))return '—';const h=Math.floor(m/60);return h?`${h} ש׳ ${Math.round(m%60)} ד׳`:`${Math.round(m)} ד׳`}
return Object.freeze({money, minsFmt});
})();
// Persistence transport only. Queue order and trip state stay with the library controller.
const TripStorage=(()=>{
function open(indexedDBApi,dbName,storeName){return new Promise((resolve,reject)=>{
 if(!indexedDBApi){reject(Error('IndexedDB לא זמין'));return}
 const req=indexedDBApi.open(dbName,1);
 req.onupgradeneeded=()=>{const database=req.result;if(!database.objectStoreNames.contains(storeName))database.createObjectStore(storeName,{keyPath:'id'})};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('פתיחת הספרייה נכשלה'));
 req.onblocked=()=>reject(Error('מסד הנתונים נעול בטאב אחר'));
})}
function transact(database,storeName,method,record){return new Promise((resolve,reject)=>{
 if(!database)return reject(Error('מסד הנתונים אינו זמין'));
 const tx=database.transaction(storeName,method==='getAll'?'readonly':'readwrite');
 const store=tx.objectStore(storeName);let req;
 if(method==='getAll')req=store.getAll();else if(method==='delete')req=store.delete(record);else req=store.put(record);
 let output;req.onsuccess=()=>{output=req.result};req.onerror=()=>reject(req.error||Error('שמירת טיול נכשלה'));
 tx.oncomplete=()=>resolve(output);tx.onerror=()=>reject(tx.error||Error('פעולת שמירה נכשלה'));tx.onabort=()=>reject(tx.error||Error('פעולת שמירה בוטלה'));
})}
function readFallback(read){try{return JSON.parse(read()||'[]')}catch(e){return []}}
function writeFallback(write,records){write(JSON.stringify(records))}
return Object.freeze({open,transact,readFallback,writeFallback});
})();
// Read-only trip queries. State and view selection are injected explicitly.
const TripQueries=(()=>{
function validPoint(s){return s?.lat!==null&&s?.lat!==undefined&&s?.lat!==''&&s?.lng!==null&&s?.lng!==undefined&&s?.lng!==''&&Number.isFinite(Number(s.lat))&&Number.isFinite(Number(s.lng))&&Math.abs(Number(s.lat))<=90&&Math.abs(Number(s.lng))<=180}
function isMapOnlyPoint(s,mapOnlyTypes){return mapOnlyTypes.has(s?.type)}
function routeStopsForDay(trip,dayIndex,mapOnlyTypes){return (trip.days[dayIndex]?.stops||[]).filter(s=>!isMapOnlyPoint(s,mapOnlyTypes))}
function currentStopsForMap(trip,selected){const r=selected.flatMap(di=>trip.days[di].stops.map((stop,si)=>({stop,di,si})));trip.days.forEach((d,di)=>{if(!selected.includes(di))(d.stops||[]).forEach((stop,si)=>{if(stop.type==='idea')r.push({stop,di,si})})});return r}
function focusMapPositions(trip,dayIndices){
 const positions=[];
 const add=point=>{
  const p=Array.isArray(point)?{lat:point[0],lng:point[1]}:point;
  if(validPoint(p))positions.push([+p.lat,+p.lng]);
 };
 for(const di of dayIndices){
  for(const stop of (trip.days[di]?.stops||[])){
   if(!validPoint(stop))continue;
   add(stop);
   for(const field of ['path','viaPoints']){
    if(Array.isArray(stop.leg?.[field]))stop.leg[field].forEach(add);
   }
  }
 }
 return positions;
}
function poiLinksForDay(trip,dayIndex,mapOnlyTypes,kmBetween){const day=trip.days[dayIndex];if(!day)return [];const routes=routeStopsForDay(trip,dayIndex,mapOnlyTypes).filter(validPoint);if(!routes.length)return [];return day.stops.filter(s=>isMapOnlyPoint(s,mapOnlyTypes)&&s.type!=='idea'&&validPoint(s)).map(p=>{let nearest=null,meters=Infinity;for(const r of routes){const distance=kmBetween([+p.lat,+p.lng],[+r.lat,+r.lng]);if(distance<meters){meters=distance;nearest=r}}return {point:p,nearest,meters}}).filter(x=>x.nearest)}
function getStop(trip,id){for(let i=0;i<trip.days.length;i++){const s=trip.days[i].stops.find(s=>s.id===id);if(s)return {stop:s,day:i}}return null}
function dayMissingEndpoint(d){return !!(d?.stops||[]).some(p=>p.type==='start')&&!d.loop&&!(d?.stops||[]).some(p=>p.type==='end')}
function dayExcludedFromTotals(d){return dayMissingEndpoint(d)&&d.excludedUntilEnd===true}
function tripMapPositions(trip){const points=[];const add=p=>{if(validPoint(p))points.push([+p.lat,+p.lng])};(trip.outline?.points||[]).forEach(add);(trip.days||[]).forEach(day=>(day.stops||[]).forEach(add));return points;}
return Object.freeze({validPoint,currentStopsForMap,focusMapPositions,isMapOnlyPoint,routeStopsForDay,poiLinksForDay,getStop,dayMissingEndpoint,dayExcludedFromTotals,tripMapPositions});
})();
// State-only commands. Dependencies are injected; no DOM or map access.
const TripStateCommands=(()=>{
function ronnyIsAutoEndpointName(name){return /^(?:נקודת (?:התחלה|יציאה|סיום)(?: יום \d+)?|נקודת התחלה\/סיום יום \d+)$/u.test(String(name||'').trim())}
function ronnyEndpointDayName(trip,stop,i){return stop.type==='start'?(trip.days[i]?.loop?'נקודת התחלה/סיום יום ':'נקודת יציאה יום ')+(i+1):stop.type==='end'?'נקודת סיום יום '+(i+1):String(stop.name||'')}
function synchronizeChronologicalEndpointNames(trip){let changed=false;trip.days.forEach((d,i)=>(d.stops||[]).forEach(p=>{if(p.autoLoopEnd)return;if(!['start','end'].includes(p.type)){if(p.autoChronoName){p.name='נקודת מעבר';p.autoChronoName=false;p.autoViaName=true;changed=true}return}if(p.autoChronoName||ronnyIsAutoEndpointName(p.name)||!String(p.name||'').trim()){const n=ronnyEndpointDayName(trip,p,i);if(n!==p.name||p.autoChronoName!==true){p.name=n;p.autoChronoName=true;p.autoPlaceName=false;changed=true}}}));return changed}
function positionRouteEndpoints(day,isMapOnlyPoint,renumberWaypoints){
 const arr=day.stops||[];
 const start=arr.find(s=>s.type==='start'),end=arr.find(s=>s.type==='end');
 day.stops=[...(start?[start]:[]),...arr.filter(s=>s!==start&&s!==end&&!isMapOnlyPoint(s)),...(end?[end]:[]),...arr.filter(isMapOnlyPoint)];
 renumberWaypoints(day);
}
function enforceRouteEndpoints(day,updated){
 if(updated.type!=='start'&&updated.type!=='end')return false;
 let replaced=false;
 for(const other of day.stops){
  if(other.id!==updated.id&&other.type===updated.type){if(other.autoChronoName||ronnyIsAutoEndpointName(other.name)){other.name='נקודת מעבר';other.autoViaName=true;other.autoChronoName=false;}other.type='via';replaced=true;}
 }
 return replaced;
}
function commitRouteOrder(trip,dayIndex,ordered,isMapOnlyPoint){const day=trip.days[dayIndex];if(!day)return;day.stops=[...ordered,...day.stops.filter(isMapOnlyPoint)]}
function renumberGenericDayLabels(trip){
 trip.days.forEach((d,i)=>{if(/^יום\s+\d+$/u.test(String(d.label||'')))d.label='יום '+(i+1)});
}
function synchronizeForRender(trip,isDayView,{syncWalkingLoops,synchronizeLoopDays,synchronizeDayStarts,synchronizeChronologicalEndpointNames}){const walkingLinked=trip.days.some(day=>syncWalkingLoops(day));const loopLinked=synchronizeLoopDays();const linked=isDayView?synchronizeDayStarts():false;const chronoLinked=synchronizeChronologicalEndpointNames();return !!(linked||loopLinked||walkingLinked||chronoLinked)}
return Object.freeze({ronnyIsAutoEndpointName,ronnyEndpointDayName,synchronizeChronologicalEndpointNames,positionRouteEndpoints,enforceRouteEndpoints,commitRouteOrder,renumberGenericDayLabels,synchronizeForRender});
})();
// Geometry and manual-leg calculations; no browser, routing network, UI or trip state.
const RouteGeometry=(()=>{
function legCoords(index,arr,legAt){
 const a=arr[index-1],b=arr[index],leg=legAt(index,arr);
 const start=[+a.lat,+a.lng],path=Array.isArray(leg.path)?leg.path.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)):[];
 if(leg.mode==='pencil')return [start,...path];
 return [start,...(leg.mode==='draw'?path:[]),[+b.lat,+b.lng]];
}
function splitRoutedLegs(coords,waypoints,kmBetween){
 if(!Array.isArray(coords)||coords.length<2||waypoints.length<2)return [];
 const parts=[];let start=0;
 for(let j=1;j<waypoints.length;j++){
  let end=coords.length-1;
  if(j<waypoints.length-1){
   const pt=[+waypoints[j].lat,+waypoints[j].lng];let best=Infinity;
   for(let k=start+1;k<coords.length-(waypoints.length-j-1);k++){
    const d=kmBetween(coords[k],pt);if(d<best){best=d;end=k}
   }
  }
  parts.push(coords.slice(start,end+1).length>1?coords.slice(start,end+1):[coords[start],coords[Math.min(start+1,coords.length-1)]]);
  start=end;
 }
 return parts;
}
function segmentOfPathNearest(coords,latlng){
 let best=Infinity,at=0;
 const scale=Math.cos(latlng.lat*Math.PI/180);
 for(let j=0;j<coords.length-1;j++){
  const [ay,ax]=coords[j],[by,bx]=coords[j+1];const x=latlng.lng*scale,y=latlng.lat;
  const x1=ax*scale,x2=bx*scale,y1=ay,y2=by;
  const q=Math.max(0,Math.min(1,((x-x1)*(x2-x1)+(y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2||1)));
  const d=(x-x1-q*(x2-x1))**2+(y-y1-q*(y2-y1))**2;
  if(d<best){best=d;at=j}
 }
 return at;
}
function manualLeg(index,arr,{legAt,legCoords,routeLegMinutes,distanceOfCoords}){
 const leg=legAt(index,arr),coords=legCoords(index,arr),minutes=routeLegMinutes(leg);
 return {duration:(minutes??0)*60,distance:distanceOfCoords(coords),mode:leg.mode,baseDuration:null,manualMissing:minutes===null};
}
function walkRetraceSegments(arr,shapes){
 const outbound=new Set(),returns=new Map();
 for(let end=1;end<arr.length;end++){
  const finish=arr[end];if(finish?.type!=='walkEnd'||!finish.leg?.walkAutoRetrace)continue;
  const first=arr.findIndex(p=>p.id===finish.walkLoopSource&&p.type==='walkStart');
  if(first<0||first>=end-1||!arr[first].walkRetrace)continue;
  const full=[];
  for(let i=first+1;i<end;i++){
   outbound.add(i);
   const part=shapes.get(i);
   if(!Array.isArray(part)||part.length<2)continue;
   const prev=full.at(-1),next=part[0];
   const connected=prev&&Math.abs(prev[0]-next[0])<1e-7&&Math.abs(prev[1]-next[1])<1e-7;
   full.push(...(connected?part.slice(1):part));
  }
  if(full.length>1)returns.set(end,full.slice().reverse());
 }
 return {outbound,returns};
}
function ronnyMeasureMeters(points,kmBetween){
 let total=0;
 for(let i=1;i<points.length;i++)total+=kmBetween(points[i-1],points[i]);
 return total;
}
return Object.freeze({legCoords,splitRoutedLegs,segmentOfPathNearest,manualLeg,ronnyMeasureMeters,walkRetraceSegments});
})();
// Routing network boundary. fetch and AbortSignal are supplied by the caller.
const RoutingService=(()=>{
async function requestRoute(list,profile,signal,fetchFn){
 const service=profile==='driving'?'https://router.project-osrm.org/route/v1/driving/':`https://routing.openstreetmap.de/routed-${profile==='walking'||profile==='hiking'?'foot':'bike'}/route/v1/driving/`;
 const coords=list.map(s=>`${Number(s.lng).toFixed(6)},${Number(s.lat).toFixed(6)}`).join(';');
 const res=await fetchFn(service+coords+'?overview=full&geometries=geojson&steps=false',{signal});
 if(!res.ok)throw Error('HTTP '+res.status);const data=await res.json();if(data.code!=='Ok'||!data.routes?.length)throw Error(data.message||'אין מסלול');
 const r=data.routes[0];return {distance:r.distance,duration:r.duration,legs:r.legs,geometry:r.geometry,source:'OSRM / OpenStreetMap'};
}
return Object.freeze({requestRoute});
})();
// Pure routing request planner; explicit dependencies, no UI or browser access.
const RoutePlan=(()=>{
function build(arr,{legAt,effectiveLegProfile,kmBetween,manualLeg}){
 const ids=arr.map(s=>s.id),results=Array(arr.length-1).fill(null),groups=[];
 for(let i=1;i<arr.length;){
   // Walking access is represented by a dashed connector, not a routed segment.
   if(arr[i].type==='walkStart'){
    results[i-1]={duration:0,baseDuration:0,distance:0,mode:'access-link',estimated:false,manualMissing:false};
    i++;continue;
   }
  const conf=legAt(i,arr);
  // A newly created circular hike has coincident start/end until a path is drawn.
  // Never request a routing service with two identical geographic coordinates.
  if(kmBetween([+arr[i-1].lat,+arr[i-1].lng],[+arr[i].lat,+arr[i].lng])<0.02&&conf.mode==='auto'&&!(conf.viaPoints||[]).length){
   results[i-1]={duration:0,baseDuration:0,distance:0,mode:'auto',estimated:false,manualMissing:false};
   i++;continue;
  }
  if(conf.mode!=='auto'){results[i-1]=manualLeg(i,arr);i++;continue}
  const forced=Array.isArray(conf.viaPoints)?conf.viaPoints:[];
  if(forced.length){groups.push({start:i-1,end:i,profile:effectiveLegProfile(i,arr),forced:true,stops:[{...arr[i-1]},...forced.map(([lat,lng])=>({lat,lng})),{...arr[i]}]});i++;continue}
  const start=i-1;
  while(i<arr.length&&arr[i].type!=='walkStart'&&legAt(i,arr).mode==='auto'&&!legAt(i,arr).viaPoints?.length&&effectiveLegProfile(i,arr)===effectiveLegProfile(start+1,arr)&&i-start<24)i++;
  groups.push({start,end:i-1,profile:effectiveLegProfile(start+1,arr),stops:arr.slice(start,i).map(p=>({...p}))});
 }
 return {ids,results,groups};
}
return Object.freeze({build});
})();
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
 viewpoint:{name:'תצפית',icon:'binoculars',emoji:'◉',cls:'viewpoint',color:'#65829b',group:'activity'},
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
const RONNY_LOOP_ICON='\x64ata:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEgAAABICAYAAABV7bNHAAAfoUlEQVR42t2cd5xU5dXHf+eWaTszuzs7u0svS0sEWyyvJSbBqAiixij2AoqgFCtWUIIU6YgFsaEIWECjYkTBghrltUSSGPV9TSxRitvZnZmdcu99znn/mDuzM8uiRjFvkvv5XJadXWae+73nnOec3zkXwv/DISIEQCMi5X7vs6zEAE24l6GTxxY0m6b+KVHJ9vZ/s1YnOl39s9dK/w9wNCJiAMhkmvc3NGO0iDpeOU5fQ9e9mq7Bth0AaNZ0z3vQZJWub32UaKgjIgYROfhPPUREBwD56qsSsWNL7UyLI2KJSEZEbBFRSsRxRGzOfp99Xdnx96xk0xHuexj/kRYkIjoRqWRyZ2+vGXxSMwIHQSUYeomq3fml9vZ7W+lvn35KqXRGKiLltN/gH8t/HfQTNn0lAjgmO7AdO3WRN1C5SkRMIrL/Yyxn8+bNBgBIqrZG2fFPRJIikszU1f6dr7r+au47ZBAHqsrZEwkrb0VYeSvCHOoa5SN++TN+5tknWCRj2+kmJZyUTKpxjAvc/A9xqyycVMsX/ZQd+0ycmIikrfe2/jcPOfQAZZYHVbRPN+42oA93H9iHuw3Inl3791bhblHlrQjznPmzWCSjrFSjk4VUf1EOkhvw/03h5C2nrn87HMv677deU90H9uVwtyj3GFTDXfr14uqanu7Zg6v69uCqmh6qa//e3LV/b2WWB9WM2dNZxFJWqskRTkkmVX8hAMgHH3h+SEj0Q8KhoUMdSdcPVJrvRU1DL9J9zu/feF0/Y8xFkrEy5PP64DgOiKhjvGpfIBF0TUNDU5NMvfoqmj51mtjpuJhev67s5BjDG33IdTeHiGRvX4fxQ7kV0VAn3bp9EOu+TRpJL9J9zmuvb9bPGDMWtm2Tz+eDoxTQEc7uwR2KFaIVFTR70WIBQNOnToOdjivTG3jQyTSCiB5y3W2vQzJ+KDiS3vEj1kObCNKTdL/z8uaX9LMvuhiOYni9XjiO49ov7W7SRBBInpYIwKxQGa2g2YsWox1STJle/4NOslGIaKXrbvbehER7F042kcvEvxhs+Mo3EqQ7GX7nxZc26WePHSciQh6PB8zc7kYEUPEyBIB7hQJq5wQigqZpaGxqlmlTrqSbb5wmdjompsevq0zqAiMQfXhvu5ux9+F8NdjwlWwiSDcyAs4LGzfo5467BCAij8cDxZy3ktwdEgDk/unCEXLRSYHTiQiYGdGKCGYtXCIaaTTthhtdd/OvzCTqiIhW7k130/YunC/3NXyBFyHcjYyA87sNz+pnjx0vRASPabbDcVFQkRlTPjQThACBQLIBPP+LJAIBM1O0IoKZCxfLrLlzyPSFyLbSyvSXPJRJNpxHRPaHH35o/ku4WB5OYtv+hrf0BQh30cwS55lnn9ZHT5gkhq6T2QFO0SfLbjF6tzWJG4iIICI5A8y7G6ZfNwVTr7tB7HRMDNOns5U6zwhUrt4bGbexd+BsP8Dwhl+AcLVmBp3fPv2kfuHEyeLxmGQYRrHluK5VuJV3xFZEidyAlNvt3KDkWhKiFRGZMX8hiIhuvPZ62Jm4Mjz+VZlkgxDRmu8LSfu+cCRTf6DhDW/MwVn327X66AkTi+C4ZKDrOhzHEdu2oWnabvlPFo648Wh3CxM3LsGNLXl3i5TTb+bOx5z5t5LpDZHjZJTh8a92kg3nEJEt8t2TSe37wLHaGg5mzb8JwlWaGXQeW/eoftHEy+DzeknXdSilAAh0TQMzo6WlFeFwGNFoFPFEQizLgq7rRV6W3dGKgqt0YmJUHLgF0YoKzJi3EHMXziPTGyJ2Moo8/tVOsulMoiEW8OF3Kku07w6n8VDd639BREU1M+g8+vga/eLLroTf74Ou62DXcgzdQCqdBoFkwcwZeG3Ds/T6hvV4ePkyVEWjiMXjYhoFnl5gVbJ73liYLO2WeUfKy/GbuQswb+ECMrxhsJNRMD2PZJL1Z+Qg/aBBOg8nWXu4bpY8J+KU62bIWf3Iw/olV02RkkCANNdaAMA0TInFY1QZjeLBZXfhZ0f9EgC7p4FPPvkA5158Cf7y0UeIlJXBziWPsrv1SIecO7/9C6DrOhJtbSgJBMS2bYrFEzJr2o107VVT2E63km544dips72Bqsflgw88NGSItdctqB1O3ZGaGXhe2C7XzZCzctVD+vgrrkYejrhwTANNu5ppQL9+8ty6x/Czo34BZcUwY84MXHb1lUjE6tC//4+w/rE1+Olhh6GxuRmmaXS0mVw2QNQRjAvHNE00NTfjmJ//XF57YROuvfwy8ft9mH7rXCxYvFAzfaWinAwMj/+RTLL+dBoyxNrrKkBOxbNiO3+m7HiLnWkWEcdesfJeDlRFuKpvD+7SrxdX9e3B1TU9VfeBfdksD6phJw3n2q8+YxGH47E6Pn/caDbKg6yXlvCIX5/IDfVfskiGY621fNq5p7MZCXH3gX25uqYnV+Wr+/azqqanqnJ/VlXTg7sP7MueSIh/fdapKh6rYxHhFzY9owJV5dx9YB/2REK8YPFcFrEdK9WoHDum0m11pwLAB3tLBcjBseNfDVV2PG6nm0XEdu5bsYz9leVcXdOzEA53G9CHjbISPn/sBZyI1bOIw9u3fcLHjBzGHhdAj0E17IuW8uFH/1R98cXHSsTidLKJR48fw2Z5kLsP7NMZnPzXqr7tcE4581ROxOtZRPHWrVu4/377cKRnF+7Srxd36dcrC2lJOyTlxO10W+2v9oroloOTitceo+xYwk43iYjtLL/vTvZXlrUv3rWg3IKunXYtKzvGIg7/+f13eb//+gn7K8u4+8C+Oa2Huw/sy4HqCA855AD14YfvsYjFjtXKEy6/lM3yIHdzIVXtGY465cxTORGrYxHF7733JvcdPJBLu1UW3bAuNT3ZLA/xotvmZyGlm5Sy45adrj/he0HKW06qbpiy40kXjn3n8qXsi5YWwenar7eq7NNdlVRF+LY7F7FIikUc3vTSc6rHoBoOdY1ytwI4uQvtNqAPh7pGuWbIIPXOu2+wiM3ixPmKa65gszzE3Qb04UKX6gBH5eC8++7vufc+A7ise1X23/TtkT+zFt6TPZGQWnL7QuVaEjt2LJNK1A37TpDycNL1w5UdT1npJhZxnNuXLWFvtJS79Cu2nPIe1VzRq5t6fN1qJWKxiMUPrbqfy3pUc6RXV+6aX3TPYkg1WUil3au4W/8+/Nrrm7KQJMFTrr+KvRVh7jqgd4Hl9GFPJMy/OuPXKh6rZRHhd955nXv9uD+X9ajmbv17F8EphtSLPZGwewOzkJQdT9rx2mO+DhLtabey2746UfOE1ikn4zF9pbz0rqXaddNvQXlZKQSAMEMjQsayEA6H8fDdd+FnPzsaQAaz5y3CrIWLEQ4HoWu5hLEgzxHJyxwiAl3Xkc5kYOoGVt27DMcdOxwAY/LVV2PF6jUoDYehaRoaGhsx4thjsfq+u1ESiuKdd9/AqAsuQjweh9/vz2pMe8pniEBE2NXSgoUzb8GkSyexnWnVdd3TpuzUCZ5A1WudlSXUOZyGk8j0PsHKNkxfKS+5Y4l2w4xZRXAoWzkKM9P6R1fh8MOPRjrZhKtuvBn3r1qFaCSSzXKFsx9TVGDtngLqug7LskQEWLn8Lho54kTU7fwShx03HOl0GrtaWjH82GOw6t5lCIaq8Pbbr+G0Cy5Eoq0NgRwcwp5Sy6I6sKU1hsWzZ2LC+AnsZGI66WaC7dQIT6Dq9yJ/MIkOtnfLg9y+lWOnG07SvP4nmG3d9IV54dJF2g0zZqK8vBQiAuHsCjRNQ6KtjY449FA5/PCfonVXLc4fPwH3PfwwqqLRvChGOTmMCpIakCtjUL68UErB6/XCsi3cNGuO2OlWhMMhdKmqRm1tHU4YdixW37sMwVAUb731Kk674EK0/QNwCjPustIwrp52kyy/f7lmeENK2Anqpv93VrL2cKKD7VyzIV/Nu+1gZSWbDtd0z1p2MobpDfOC2xZp02bdiory8nYVkFxryJoPBYNBAjz42yd/w4YXX0JVNArHcfKuIyLtGoVbiiK7UNF1nXIiGBGBmckwdDEMg5TjiD8YpKbmZow47lg8fM/dKAlGsWXLKzh9zFgkU6msWymnfU1faz6u4UpWYyorLaUrb5gqGpE27qJxStltYd0seVbSrUeSr/TjXItcyyVLzc3NpZqO1RrBa3iDasGShdq0mXNQUV4Gzl6kZK+wXQAVIF9WkEYI+P2ilIIA0DSSWDwuqVRKFDOUYigWCDPETYcTiQQymQw0TcvfXRHAUQ58wWp6/oWXsN/gH+Oxh1agJBjFG2+8jFGjL8rCyYn+ObltdwWuuLbLSSaUhSQQlJaGccUNU7Fi5QpNNwOOpmsVCuoJkR2B3JCFkZuysFONN+ie0hqA7YfXrDZunDlHKisixJx9MzfotAfZTu4Wi5AGQNc0JBIJGnXyybh4zAUIeA1omp4VuUiDQEjTNNle2yhTb5lBn3z2GXw+HyAAK6ZIeTmeemYd1j79DO6943aEwpV4/fcv4cwLL0Y6ky6A0+5ZklMCcsZExSJJITUigrCIpmkUDoUwacp1CAWD+qhTT7N0r3eIk5YbTD/dJCKGQURKJFbpZKxLAJu3b9umTZ05R8rCIcq6BxcIx9Tu6rn4UVhCikDTNCRTKdl38GA8eNdtBCOYw9eh/hTaZ7AHPo8uJ555jqu5CoLBEvzx/b/gyfXPYtnCeSiPdMXmVzfi7LHjYNk2fD4fHEcVVa7UuTcVYtt9XyIiZoamaQiU+HHZdTfiwP2GGP0HDGQQLpdEYhkRfWUAgLLUSMMbKgV0+4GH1xj1DfVSGY3Ctu2i4Ed76FsVmjNphEwmg8E/GgQYJfjrx+/j6mm/EcvK5GIFtSWTOOLQQ3DrLTPRo2tXlAQCcJSC12OiobEJI4cNw/IlCxAMV+PlV57H2WPHZX/u9YKVKiIiuT2SinUi+jZiBWVDhM/jRUNTkyy6827cvXSpMrzhkEJ8FIDbs0GanZ8DuqhMTF54ZTP8fh+pwqYeSft9EOn8c7MB0NXZCY7jEKBj246deG7TJgRLSiAipGuaxBIJygZxDY5jkwhgGgbqG5tw8vDhWLn8TvhLonj5lQ04b/xEAEBJwA+lVF5gK7QSKkghRNpbSUX519dEbkcphEMh2vjyZtTt3EbV3foJixybB8TAAECjbTt2atu2bxeP6aHiRdBu4kxnn0Uu0cIq2TB0lJWWwu/zkWRdkABISSAAQIhFYBgGauvrcOqJI/HgsjvgL4li46Zn8evzR8PKZMTn81E8kRDXnckNhdKePLTvY9nPZwiA0nC4yMKzeyh1khsJTNNAQ1Oj/OWj/6Hqbv0IrAaI/NVriIhhJxvKAKA1Fkcmk4Gu6wKR3ZpKBECICv2Kvkl+ExEopYqahYqZmFmYBaFgEA2NjRh10olYsexO+AIRbHjhGZx+wRgMP+aXOO2UU8jUCUTkdoCyt0HX9Wxkc+NIQXCBEmDjS6/Io088Ca/Pk3e9QjhFTRUhEGlwHAc7autyEbMc6FpqAGAQFCAwDJ00Tc/nCkX3qNBwqL310mljnejb1HukaT689uZbOPH4Y7Hi7jvh80fwuw2/xennXoBRp52KlfeuEECjzj4ByBCg77Exc/LIU0nXNcmVKrl0pGMkpw4iXEGmoCWTacMgIraSjY0AUF1ZKaXhkNa8axcMwyjoeYpQkVhMnXozadkMmTrkH4RsXMpZEDOjvLwMT61/ApteeRkr77kHPn8ETz39OC6+4ipA13H+GacBAN1z/zK88vrrUhIIQISRsSz06dVTbpl2I23ftgNTZ80R916SRhriiQSOG/oLTBg/SYb98mg8sGp1p92TwhifW5thGNS9a5ccrXgyibjhpnx/AuQX0eoust+QwXj+xZdQGg5nWzbZi6I8k877WWDOupKbOYsI5zlxNlsWESHbcRAKBuW1N95EVbSC7lq8CIGSCNY+sQbjrrgKPq8XPr8fum4A0PD0cxvwwqZNCJeVkYgg0dYmBx9wAObM8CHRFpenn3s+f/2GrqN1Vwt0TZMJ4y8jx84IkVYQEQqikBQHBdu2URWNYt99fiQAhHT9s8rKiniuFvsdJEMAaaPPPAMqN7OTHzCgPdY2rv/D7/chEAi4dZoOjbQ8T03TxDAMaJomZaVh7GpppZNHDKel8+agJBjFmkcfwkWTL4fP64XH40E6nZGctm0YBjTDINMwkDt1XctGBiIyDAOGrruv6yDTgGG48Una1+husAWJpeSvwTAMtMbjOP6YX6Kqa08BFIHpFQAwREQD8LqTbvyT7gscMHLkCOfXJ47Un1j/rFRVVpJt2wXbO+UzaRGB1+PBJ599BrZbMXjIYHnz+fWUzqQBgMKhMGC34pCf7I8/bN5EBKA0UoUlt9+Gr+obcf8dtwN6ACtX349J11yPkoAfANDU3IyKSDn5/QEoZaN/37447NBDEQ4GIQJJpVMYNKA/lKPg9Xhw2CEHQ9OyPqbpmiQSbRg0cABYORIsKYFh6NSWTMLv87pNTMrnSOKqCKlUCl0qq3Dt5RMFcHQn09bWlsk8IiJUoBw2DRNJiaiY1VC/jQ8beiRnxe9CJbBHkcLXpV8vLqmKqElXTeLaum0sEmeRNhZJsDgtbCUb2E41sditSsRWqx5dyVdeewVbmRYWEb5vxTIuqY7k1clo7+58x7IlqrHhS/d92jgrwNnu6binzSJJV7lUBa/nTsv9eYL/9Od3+ajjhnK4WyV37d+7qBmQk2ZDXaP83IanWCSdEVGSSTXNAoANGzZ4qXDqXaUaF2i+yBQgae3YUWuOHHUmPvn8c4RDoT2OyhGRJNraqGt1lVRVVVO2GHV1DoHkKvX6pmYaeezRWDx3DgwzjLvvuwNXT52OcCgIwzDQ1NyMm6+9BjdcMxWpRB3+9unnAJEwM+UUgcKEhjSCiJC4taJIcW6tFKOqIiI1A/alj//3j/jFyF8JM2cDcvaCIcKSTKbpgTuXYtSpoxxAmSqTentnfWLoW2+9pQCowsROA8BstT6ueQKjAMf6/PMvzBNGnYHtO3ciFAy6uktx7QW3OLUcB5Zl5bIAyUo+2fnC5qYmuWLiBFoy/1YAHty+bCmumz4TZaVhydVglm3jlWeewH77Hyqjx4/FumfWUzgUygf+4hvTcRlSJMgREWzHkWgkgleffYp69emFnx53gvzlgw8pFydFRBKJNtxz2yI656xzFThtKMWfxRoah7705vU7amqO0Q46aLyjuW+YL4g1zyfnKCu5AdA9ffv2dp5a8zAqKyrQlkxmt36R9tNdkGKBoesoCQRQEgggEPBTwO9HMBBAWzKJm66dQkvmzwNgYvHSRbhu+i0oKw1DXDg5yLquQdMEn//9C5i6Dl3XYBg6CgO0aRjwmB2/N+HxmNmvpgnTMBDw+RCLxRGLxwHo0DUdAuSycYnF4rhj/hycc9a5CiplKMXb2lqbRkS69/syGBxjHHTQeIeoQFF0n58g4CBnZ91Hpyk7/TKgmYMGDXKeXLUSoWAQqVQqn8G212luquUKX+52DgCob2zCDVdejlumTwegYe6i+bhx5myUl5UVFbqCIgWF/AF/dnfSDBi6AcMwoBs6DEOHrmfPwr93OEXXdWiaRl6vh7I7Xv4aSdMILa0xWjT7FhpzwYUMlTIUy/aWWPOw0sqajzdvftD39ttv27kpHaNDXaJERO/d+8gU886T2cHzmuE56oADDrTXPvSAcco55yNjWfB6PNlCkHbP20kj0khDY3Mzpl87BVOvvx4AMHPuHMxasBgVFRFXNJM9tA8ILS2t2NXYhHQmA6W4WKVAoXgoHap6crNYdzxGBI7t5Os1jQjNu1pk3m9upkvHXaqgUoajeGcq3jIsGu37P1u2rPVv3Hh6ZsaMvMS0e56eg0REbdL86YlcEt2kecxDDz/sSPuR++8xTh99ERzHgW7oYMVF1pSrlZqad2HWjTfg2qunAGBMnzUbc5fcthuc3QoVIgIUxpxzFo49+ufiNT3EXNABgRR8bcclBdMNbjVProSLyspKgB1ouiYtu1po4ZxZdNnEycq1nJ3pttjx4Wifj7ZsWetfsmSdtW4dvt1cY+75itbW7RXKat0q0iYitvW7537Lpd2quKpv9/w2mdvyq2t6srcizIuXLnC34hRff9N17ImEuduAPlxd02uP7eRo7278lz//dzZFENl7p2plZbXwAUceqm6+ZSqLOLaomDhWy8540ydDAGDt2rX+6dOnax1GJ79ZUco9oROv/bQ6UBF9WdP1wSCvvfaJx/ULJ15GwWBJrv0DFkE8HseCGdMxacJlADK4ZurNsnT5vVRZUYGcVr2nD1RKYfP6J2XIfgdg5ao1VFtfB4/Hk5UupF2W2H34TECkCXWQWQACi8Los05HKBSWp597ns4Y9SsF0Q3lOLWpRGxYKNLz/XbLWcff3Bf5mi5rW9uX3ZXd8rGouIg49oMr72V/ZVm+J1/Wo1rdtXxp9q45cZ589aT2aY1+vXYbRuh4Rnt34z/98U2lVEodfNRhDJ/B/soy9kTChafyREKcO81IiM3ykDLL27/P/izMnkiIfZVl6v0/v51NOFXMFpUQx4rV7qr//EAAWL/+nsCoUaP0wjGb7zLEqdyG4o7Urr8fb5aUb9aR6j36/AudtlRKv2badPj9PtT06YMJ4ycCnMYlV07BA6vXSFU0SrbjtGvmskdRT0SEsjNGPpSXl6E8WoFgMAjFCp2oEYWjntQxLyNX+k2m0mSaBgBWzGKIcH28pXlEeVXfP65fvz6watWqjGs5e5yw/UZARCQikoP0ebp1+zAKhF8hSXabOH6Ck0wm9Ztm3yo7duzApZdPluZdTfTMho2oikZJKVXUXOhc1AY0jciybKx54mkcuP9n+Phvn4hhGmTbNlikKDukr5scdn/X0HXU1zdiyuSJ6N+vn4KQAVB9uq15eHlVn60d4Mgeh5L/kRG8bO/vDwbRwXYmXruf4St5CVCVmhFQM2bP1GYvXAKvzwMRQjiUvfP0D45hJ1MpMDMCfn92zlGkExDtsqkUtrHdndTQdTQ0NuLKCZdi3qxbFMCGsp2GdFvi+GB5961b1q71b/wwv5V/3a37TjOKBMAgIttq2XmIFghuIuIyzfCpa6dO0+649z5URiuQyVj5u/0PTZRqWvvkaqe6k+zuXQVuZRg66hub5PLx42jBnFkKbBtKSWOiteX4ssre723ZssW/ZMkSq8Ct8E2B+TuNoOWmIKxk3ZGa4X9eIwmR4VGTr5qiLX9oJaqi0aKOguxp7/yapUnHHpd00nsq+LthGGhobJTJ4y7GorlzOAsHzZlky/ElZb3e3YNbfeOu9V3mpCk7nC2mJ1D9pp1pO4kFSXYy2h0L5/Pos85AQ2MTDMPYs0PL1834totZhE5UzJxOXtDHMAwD9Q2NmDzuYsrCcQyl0NwWj43sAKewJfyttvTvNcSYs6RUYsdxpif0jE7iZWg8+pIJ9Nhvn0JVZWX7LvZt37Og90YFIw/55eYaCu7rhp6FM+nii7Bk/lyVhSNNbbHWkaXRnm99zW71rQB936d9HBEx/cHumxwrfaoSsjSwtmLZnXLKyBOoobER7pC4fEvg7Y8hFHS5CFQ0RpMDlm02NmLSuLFYMv9WFw43JmItI0qjPd/asmWt/9ts5T/o0z6FlmS3NZxIHu+TugbdspScOWastuHFFxGtqEAHS+psoZLfCKiou9T5UziG7lrOWCyed6uCOIZjS7OVysacPWTI39py9urzYrmYZJZUPutYyTOUEvZ4DHrkgXv52KE/zw6JF8ekzq6cpL05WwSn4yyJoeuob2jCxIvHYvG8OQriGMrhRivVMrykrNe7mzdv9m3c+GFmn332kT3E/n+uBXVMATLJ+lG64X1MNzVJxJN02nmj6dU3tki0IrJbTJIO9tTpLe64lTc0YvL4cVh06+w8nEyydUQOzquvvmrNmDFDviuUvW5BBaqkI/KBxxuoWgfHOk/ZrAVDJbJ25Qr56WGHUlNzsxRaUntAbt+1RDpuNO1wdF1HfUOjXH7JJYVwGhKdw5HvC2evWlBnMSmTahxtenwPkga1q7mVTjn7PLyzdSsi5eVk72kitWgHa+9l6UUZ8kw35jgNmWTL8cHyPluzYteHmQI4e+XQ8MMcjoiYXn/0IcdKjYeQXh4p4ydXr8RP9t+Pmnftgiff2i4ooztu75LtPuTgTJk8qQCOqmuLNQ7/IeH84EduONtJN14mkhKRNru+7kt1xNFHsbcizD0G1XB1v15F0/f50x0yr+rbQ3kiYXXLnN+wSNoSaRPHat3eXPfZ/gCwZUuR2PXvdgi1Q2qaIpJ2IX2hjjtpOOulJVzRqyt37d/b/U9NemfP/r25uqYH+yvLONKrK9+3YrkSyVgiaXGs1r/HYjv3ycEp0HP+PQ+RdkhWsuF6kbSIiqt0stmePW8WD9h/MAeqytkbCbE3ElbeSIi9FWEV7d1dnXLmqeoPf3jTEbFsEUeUHdvaUvtxTQc42g+5fvpnQQLeM4gOtq1UwwRN996mm14T0FRTw07e8s67+Oh//0rNu5rJND3o3bOnHH7IT2TIvvsS4DMAC46deSSeaJwQifRr3bz5Qd+yZRvs7yyT/gtbkgEAyda6Ixw7/rpwQr7+SImVbvlTJtl0FgCMGjVKX7t2rWdPAvu/rQV1SCb13H/UZtvxoczqJLA6EMxdRcQLIhugWpD+PkReeOW1tzaNGDEi88EHaz0NDZX8i6FDFe2FBPBf1opy3RJ37CZ/7NixI9Dc3Fz61VdflRS+vnbtWv2vf93gnT59uuY+0fBPvan/B7zj0gDQVT7QAAAAAElFTkSuQmCC';
function pointSymbol(type){if(type==='loop')return '<img class="ronny-loop-symbol-img" src="'+RONNY_LOOP_ICON+'" alt="" draggable="false" aria-hidden="true">';const t=types[type]||types.other;if(t.icon==='bench')return '<svg class="point-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h16M4 13h16M5 7v8M19 7v8M6 15l-1 5M18 15l1 5M3 15h18"/></svg>';if(t.icon==='balloon-custom')return '<svg class="point-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c-4 0-6 3-6 7 0 4 2 6 6 8 4-2 6-4 6-8 0-4-2-7-6-7Z"/><path d="M10 18h4l-2 2v2"/></svg>';return icon(t.icon,'point-symbol-icon')}

const RONNY_EXTRA_ICONS={"glencairn":{"label":"כוס וויסקי גלנקרן","src":"assets/glencairn_icon.svg"},"picnic":{"label":"סל פיקניק","path":"<path d=\"M4 11h16l-2 10H6L4 11Z\"/><path d=\"M7 11c0-4 2-7 5-7s5 3 5 7\"/><path d=\"M8 11l1 10m6-10-1 10\"/>"},"ferry":{"label":"חזית מעבורת","path":"<path d=\"M5 10h14l-1 8-6 3-6-3-1-8Z\"/><path d=\"M8 10V5h8v5M10 5V3h4v2M5 14h14\"/>"},"cablecar":{"label":"רכבל","path":"<path d=\"M3 5 21 3M12 4v6M7 10h10l2 3v6H5v-6l2-3Z\"/><path d=\"M5 15h14M9 10v5m6-5v5\"/>"}};
const RONNY_ICON_BANK=[...Object.entries(types).map(([id,v])=>({id,label:v.name})),...Object.entries(RONNY_EXTRA_ICONS).map(([id,v])=>({id,label:v.label}))];
function ronnyPointSymbol(type,stop){
 const key=stop&&RONNY_ICON_BANK.some(i=>i.id===stop.iconId)?stop.iconId:null;
 if(!key)return pointSymbol(type);
 const extra=RONNY_EXTRA_ICONS[key];
 if(extra?.src)return '<img class="point-svg ronny-glencairn-icon" src="'+extra.src+'" alt="" aria-hidden="true" draggable="false">';
 if(extra)return '<svg class="point-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">'+extra.path+'</svg>';
 return pointSymbol(key);
}
function ronnyIconPickerMarkup(stop){
 const selected=RONNY_ICON_BANK.some(i=>i.id===stop.iconId)?stop.iconId:'';
 const make=(key,label,markup)=>'<button type="button" data-ronny-icon="'+esc(key)+'" class="ronny-icon-choice'+(selected===key?' selected':'')+'" title="'+esc(label)+'">'+markup+'<small>'+esc(label)+'</small></button>';
 return '<details class="ronny-icon-editor"><summary>אייקון הנקודה '+ronnyPointSymbol(stop.type,stop)+'</summary><div class="ronny-icon-grid">'+make('','ברירת מחדל',pointSymbol(stop.type))+RONNY_ICON_BANK.map(i=>make(i.id,i.label,ronnyPointSymbol(i.id,{iconId:i.id}))).join('')+'</div></details>';
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
async function bulkDeletePlannerItems(kind){const selected=kind==='day'?ronnyBulkStops:ronnyBulkOutline;const present=kind==='day'?state.days[selectedDay]?.stops||[]:currentOutline().points;const ids=[...selected].filter(id=>present.some(p=>p.id===id));if(!ids.length)return;hidePointQuick();const approved=await confirmOnMap(`למחוק ${ids.length} ${kind==='day'?'נקודות מהיום':'יעדים מהמתאר'}? ${kind==='outline'?'הימים שכבר נוצרו והנקודות שלהם יישארו ללא שינוי.':''}`,{title:'מחיקה מרובה',accept:'מחק '+ids.length});if(!approved)return;await animatePlannerRemoval(ids,kind);const set=new Set(ids);if(kind==='outline'){const o=currentOutline();o.points=o.points.filter(p=>!set.has(p.id));ids.forEach(id=>{delete o.stagePlan[id]});if(set.has(selectedOutlineId))selectedOutlineId=null;if(set.has(selectedStageId))selectedStageId=null;}else{const d=state.days[selectedDay];d.stops=d.stops.filter(s=>!set.has(s.id));positionRouteEndpoints(d);selectedStop=null;invalidate();retimeAfterOrderChange(selectedDay)}selected.clear();ronnyBulkMode=false;save();renderAll();toast(ids.length+' פריטים נמחקו')}
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
function openLibraryDB(){return TripStorage.open(window.indexedDB,LIB_DB,LIB_STORE)}
function transact(method,record){return TripStorage.transact(db,LIB_STORE,method,record)}
function fallbackRead(){return TripStorage.readFallback(()=>localStorage.getItem(LIB_FALLBACK))}
async function getStoredTrips(){return usingFallback?fallbackRead():await transact('getAll')}
async function putTrip(record){if(usingFallback){const all=Array.from(library.values());TripStorage.writeFallback(value=>localStorage.setItem(LIB_FALLBACK,value),all);return}await transact('put',record)}
async function deleteTrip(id){if(usingFallback){TripStorage.writeFallback(value=>localStorage.setItem(LIB_FALLBACK,value),Array.from(library.values()));return}await transact('delete',id)}
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
function tripMapPositions(){return TripQueries.tripMapPositions(state)}
function fitWholeTrip(){
 if(!map||!window.L)return;
 const coords=tripMapPositions();
 if(!coords.length){const c=state.settings.startCenter||mapPrefs.home;if(c)map.setView([+c.lat,+c.lng],+c.zoom||9);return}
 if(coords.length===1){map.flyTo(coords[0],Math.min(12,map.getMaxZoom?.()||12),{duration:.55});return}
 // Use ALL days and macro waypoints, not just the day currently selected.
 map.fitBounds(L.latLngBounds(coords),{paddingTopLeft:[92,96],paddingBottomRight:[90,98],maxZoom:12,animate:true,duration:.65});
}

const RONNY_WORKSPACE_PREFIX='ronny-workspace-v1:';
let ronnyWorkspaceReady=false;
function ronnyReadWorkspace(){
 if(!activeTripId)return null;
 try{
  const view=JSON.parse(localStorage.getItem(RONNY_WORKSPACE_PREFIX+activeTripId)||'null');
  return view&&view.version===1&&typeof view==='object'?view:null;
 }catch(e){return null}
}
function ronnyApplyWorkspaceSelection(view){
 if(!view)return;
 const index=state.days.findIndex(day=>day.dayId===view.dayId);
 if(index>=0)selectedDay=index;
 planningResolution=view.resolution==='outline'?'outline':'day';
 viewScope=view.scope==='all'?'all':'day';
 ronnyActiveDayGroupId=viewScope==='all'&&ronnyDayGroups().some(group=>group.id===view.groupId)?view.groupId:null;
}
function ronnyRememberWorkspace(){
 if(!ronnyWorkspaceReady||!activeTripId||!map||!state?.days?.length)return;
 const center=map.getCenter(),zoom=map.getZoom();
 if(!Number.isFinite(center.lat)||!Number.isFinite(center.lng)||!Number.isFinite(zoom))return;
 try{
  localStorage.setItem(RONNY_WORKSPACE_PREFIX+activeTripId,JSON.stringify({
   version:1,dayId:state.days[selectedDay]?.dayId||null,
   resolution:planningResolution==='day'?'day':'outline',
   scope:viewScope==='all'?'all':'day',
   groupId:viewScope==='all'?ronnyActiveDayGroupId:null,
   lat:+center.lat.toFixed(7),lng:+center.lng.toFixed(7),zoom
  }));
 }catch(e){}
}
function ronnyRestoreWorkspaceViewport(view){
 if(!map)return;
 map.invalidateSize({pan:false});
 const z=Number(view?.zoom),lat=Number(view?.lat),lng=Number(view?.lng);
 if(view&&Number.isFinite(z)&&z>=2&&z<=19&&Number.isFinite(lat)&&Math.abs(lat)<=90&&Number.isFinite(lng)&&Math.abs(lng)<=180){
  map.setView([lat,lng],z,{animate:false});
 }else fitMap();
 ronnyWorkspaceReady=true;
 ronnyRememberWorkspace();
}
function ronnyQueueWorkspaceViewport(view){
 // A rapid day switch may cancel the queued fit; the new selection must still be savable.
 ronnyWorkspaceReady=true;
 const seq=++wholeTripFocusSeq;let completed=false;
 const restore=()=>{if(completed||seq!==wholeTripFocusSeq||!map)return;completed=true;ronnyRestoreWorkspaceViewport(view)};
 requestAnimationFrame(()=>requestAnimationFrame(restore));
 setTimeout(restore,340);
}

let wholeTripFocusSeq=0;
function focusLoadedTrip(){if(!map)return;map.invalidateSize({pan:false});fitMap()}
function queueWholeTripFocus(){
 const seq=++wholeTripFocusSeq;
 const run=()=>{if(seq!==wholeTripFocusSeq||!map)return;focusLoadedTrip()};
 requestAnimationFrame(()=>requestAnimationFrame(run));
 setTimeout(run,340);
}
function applyCurrentTrip(){
 if(drawLegSession)stopLegDrawing();closeLegEditor();
 ronnyWorkspaceReady=false;wholeTripFocusSeq++;
 resetPlannerBulk();state=prepareTrip(state);if(+state.settings.railWidth===72)state.settings.railWidth=54;const detailedPoints=(state.days||[]).some(d=>(d.stops||[]).some(validPoint));planningResolution=detailedPoints?'day':(['outline','stage'].includes(state.settings.planningResolution)?'outline':'day');selectedOutlineId=null;selectedStageId=null;outlineAddArmed=false;selectedDay=0;selectedStop=null;viewScope='all';ronnyActiveDayGroupId=null;invalidate();pendingRetimes.clear();scheduleQuality.clear();repairExistingSchedules();restorePlannerUpperHeight();
 const resume=ronnyReadWorkspace();ronnyApplyWorkspaceSelection(resume);
 if(googleMode){googleMode=false;document.querySelector('.map-pane').classList.remove('google-mode');$('google-coverage-toggle').setAttribute('aria-pressed','false')}
 $('map-scope').value=viewScope;$('trip-name').value=state.title;$('start-date').value=state.startDate;
 $('travel-mode').value=state.settings.travelMode;rebuildMapOptions();document.documentElement.style.setProperty('--rail-width',(+state.settings.railWidth||54)+'px');
 document.documentElement.style.setProperty('--planner-width',(+state.settings.plannerWidth||430)+'px');
 document.documentElement.style.setProperty('--drawer-width',(+state.settings.drawerWidth||440)+'px');
 setMapStyle(state.settings.mapStyle,false);renderAll();
 // Restore this trip's own previous map and day view, or fit a trip without a saved workspace.
 ronnyQueueWorkspaceViewport(resume)
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
  // A stage shows labels only for its visible days, even if other ideas remain on the map.
  ronnyVisibleDayIndices().forEach(di=>{
   const arr=routeStopsForDay(di).filter(validPoint);
   for(let i=1;i<arr.length;i++){
    const conf=legAt(i,arr),profile=effectiveLegProfile(i,arr,di);
    const shape=conf.mode==='auto'?routedLegVisualCache.get(routedShapeKey(arr,i,profile)):legCoords(i,arr);
    if(shape?.length>1)drawRouteAnnotations(i,shape,arr,legLabelLayer);
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
 wholeTripFocusSeq++;
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
 if(e.target?.closest?.('a[download]'))return;
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
 const groups=ronnyCleanDayGroups(),ids=[null,...groups.map(g=>g.id)];
 const position=viewScope==='all'?Math.max(0,ids.indexOf(ronnyActiveDayGroupId)):0;
 const chip=(id,label,selected,color)=>'<button type="button" class="ronny-group-chip'+(selected?' selected':'')+'" data-ronny-group-view="'+esc(id||'')+'" style="--group-c:'+esc(color||'#87a695')+'">'+label+'</button>';
 bar.innerHTML=groups.length?
  '<button type="button" class="ronny-group-nav" data-group-step="-1" aria-label="מקטע קודם" title="מקטע קודם" '+(position===0?'disabled':'')+'>'+icon('chevron-right','small-icon')+'</button>'+
  '<div class="ronny-group-strip">'+chip('','כל הטיול',viewScope==='all'&&!ronnyActiveDayGroupId,'#87a695')+
  groups.map(g=>chip(g.id,esc(g.name||'מקטע')+' <small>'+ronnyGroupDays(g).length+' ימים</small>',viewScope==='all'&&ronnyActiveDayGroupId===g.id,g.color)).join('')+'</div>'+
  '<button type="button" class="ronny-group-nav" data-group-step="1" aria-label="מקטע הבא" title="מקטע הבא" '+(position>=ids.length-1?'disabled':'')+'>'+icon('chevron-left','small-icon')+'</button>':'';
 bar.hidden=!groups.length;
 bar.querySelectorAll('[data-ronny-group-view]').forEach(btn=>btn.onclick=()=>ronnySetGroupView(btn.dataset.ronnyGroupView||null));
 bar.querySelectorAll('[data-group-step]').forEach(btn=>btn.onclick=()=>{
  const next=ids[position+Number(btn.dataset.groupStep)];if(next===undefined)return;
  ronnySetGroupView(next);
  bar.querySelector('.ronny-group-chip.selected')?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});
 });
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
function clockMinutes(value){return CoreTime.clockMinutes(value)}
function clockAt(total){return CoreTime.clockAt(total)}

// Each destination owns the settings of the connection from the previous stop.
// The fromId prevents a manually traced cable-car path from accidentally
// attaching to an unrelated connection after reordering.
function legAt(index,arr=stops()){
 if(index<1||index>=arr.length)return {mode:'auto',label:'',path:[],viaPoints:[],minutes:null};
 const leg=arr[index]?.leg;
 if(!leg||leg.fromId!==arr[index-1].id||!['auto','draw','pencil','straight'].includes(leg.mode))return {mode:'auto',label:'',path:[],viaPoints:[],minutes:null};
 return leg;
}
const TRAVEL_MODES={driving:'נסיעה ברכב',walking:'הליכה',hiking:'מסלול הליכה בטבע',cycling:'רכיבה'};
function effectiveLegProfile(index,arr=stops(),dayIndex=selectedDay){
 const p=legAt(index,arr).profile;
 if(Object.hasOwn(TRAVEL_MODES,p))return p;
 return walkStartIndex(arr,index-1)>=0?'hiking':dayDefaultProfile(dayIndex);
}
function getLegMutable(index){
 const arr=stops(),target=arr[index];if(index<1||!target)return null;
 if(!target.leg||target.leg.fromId!==arr[index-1].id){target.leg={fromId:arr[index-1].id,mode:'auto',label:'',path:[],viaPoints:[],minutes:null};}
 return target.leg;
}
function getLegMutableForDay(dayIndex,index){
 const arr=routeStopsForDay(dayIndex),target=arr[index];if(index<1||!target)return null;
 if(!target.leg||target.leg.fromId!==arr[index-1].id){target.leg={fromId:arr[index-1].id,mode:'auto',label:'',path:[],viaPoints:[],minutes:null};}
 return target.leg;
}
function legCoords(index,arr=stops()){return RouteGeometry.legCoords(index,arr,legAt)}
function kmBetween(a,b){return CoreGeo.kmBetween(a,b)}
function distanceOfCoords(coords){return CoreGeo.distanceOfCoords(coords)}
function routeModeName(mode){return CoreLegTiming.routeModeName(mode)}
function routeLegMinutes(leg){return CoreLegTiming.routeLegMinutes(leg)}
function legTimingMode(leg){return CoreLegTiming.legTimingMode(leg)}
function resolveLegDuration(leg,baseSeconds){return CoreLegTiming.resolveLegDuration(leg,baseSeconds)}
function legTimingSnapshot(leg,baseSeconds){return CoreLegTiming.legTimingSnapshot(leg,baseSeconds)}
function cachedLegBaseSeconds(index,arr=stops(),di=selectedDay){
 if(index<1||index>=arr.length)return null;
 const existing=routeData?.day===di&&routeData.ids?.length===arr.length&&routeData.ids.every((id,i)=>id===arr[i].id)?routeData.legs?.[index-1]:null;
 if(Number.isFinite(existing?.baseDuration))return existing.baseDuration;
 const key=routedShapeKey(arr,index,effectiveLegProfile(index,arr,di));
 const stored=routedLegDurationCache.get(key);
 return Number.isFinite(stored)?stored:null;
}

function layerVisibility(){state.settings=state.settings||{};state.settings.layerVisibility=normalizeLayerVisibility(state.settings.layerVisibility);return state.settings.layerVisibility}
function layerOn(key){return layerVisibility()[key]!==false}
function routeTimeTextForLeg(index,arr=stops()){
 const a=arr[index-1],b=arr[index];if(!a||!b)return '';
 const depart=(a.type==='start'?a.time:quickEndTime(a.time,a.duration).slice(0,5))||'';
 const arrive=String(b.time||'').slice(0,5);
 return depart&&arrive?`${depart} → ${arrive}`:'';
}
function markerVisibleForStop(stop){
 if(stop?.type==='idea')return layerOn('ideas');
 if(stop?.type==='note')return layerOn('notes');
 if(isMapOnlyPoint(stop))return layerOn('poi');
 return layerOn('routeStops');
}
function normalizeLegAngle(deg){let a=((deg+180)%360+360)%360-180;if(a>90)a-=180;if(a<-90)a+=180;return a}
function placeAlongSegment(a,b,f){return [a[0]+(b[0]-a[0])*f,a[1]+(b[1]-a[1])*f]}
function bestRouteLabelPlacement(coords){
 if(!map||!Array.isArray(coords)||coords.length<2)return null;
 const pts=coords.map(c=>({ll:[+c[0],+c[1]],p:map.latLngToContainerPoint([+c[0],+c[1]])})).filter(x=>Number.isFinite(x.p?.x)&&Number.isFinite(x.p?.y));
 if(pts.length<2)return null;
 const center={x:map.getSize().x/2,y:map.getSize().y/2};
 const angleAt=i=>Math.atan2(pts[i+1].p.y-pts[i].p.y,pts[i+1].p.x-pts[i].p.x)*180/Math.PI;
 let best=null,total=0;const lengths=[];
 for(let i=1;i<pts.length;i++){const len=Math.hypot(pts[i].p.x-pts[i-1].p.x,pts[i].p.y-pts[i-1].p.y);lengths.push(len);total+=len}
 let walked=0;
 for(let i=1;i<pts.length;i++){
  const len=lengths[i-1];if(len<42){walked+=len;continue}
  const a=pts[i-1],b=pts[i],midPx={x:(a.p.x+b.p.x)/2,y:(a.p.y+b.p.y)/2};
  const angle=normalizeLegAngle(angleAt(i-1));
  const prev=i>1?normalizeLegAngle(angleAt(i-2)):angle,next=i<pts.length-1?normalizeLegAngle(angleAt(i)):angle;
  const straightPenalty=Math.abs(angle-prev)+Math.abs(angle-next);
  const centralPenalty=Math.abs((walked+len/2)-total/2)*0.75+Math.hypot(midPx.x-center.x,midPx.y-center.y)*0.28;
  const score=centralPenalty+straightPenalty*1.85-len*0.22;
  if(!best||score<best.score){best={score,latlng:placeAlongSegment(a.ll,b.ll,.5),angle}}
  walked+=len;
 }
 if(best)return best;
 const a=pts[0],b=pts[1];return {score:0,latlng:placeAlongSegment(a.ll,b.ll,.5),angle:normalizeLegAngle(angleAt(0))};
}
function offsetPlacementByPixels(placement,pixels){
 if(!placement||!map||!pixels)return placement;
 const base=map.latLngToContainerPoint(placement.latlng);
 const radians=(placement.angle+90)*Math.PI/180;
 const shifted=L.point(base.x+Math.cos(radians)*pixels,base.y+Math.sin(radians)*pixels);
 const ll=map.containerPointToLatLng(shifted);
 return {...placement,latlng:[ll.lat,ll.lng]};
}
// RONNY 31.3 — full captions follow the *visible* route after every pan or zoom.
// Never truncate a user's description; if the full text cannot fit a mostly
// straight visible route run, attach a compact multi-line marker to that route.
function labelTurnDiff(a,b){let d=(a-b+540)%360-180;return Math.abs(d)}
let roadLabelMeasureContext=null;
function roadLabelWidth(text,isTime=false){
 if(!roadLabelMeasureContext){const canvas=document.createElement('canvas');roadLabelMeasureContext=canvas.getContext('2d')}
 if(!roadLabelMeasureContext)return [...String(text)].length*(isTime?8:10);
 roadLabelMeasureContext.font=isTime?'900 12px Calibri,Arial,sans-serif':'900 14px Calibri,Arial,sans-serif';
 return roadLabelMeasureContext.measureText(String(text)).width;
}
function clipMapLabelSegment(a,b,size){
 // Liang–Barsky clipping keeps the label geometry inside the map's visible area.
 // In particular, a very long offscreen route can no longer win over a visible run.
 const margin=34,box={left:margin,top:margin,right:Math.max(margin,size.x-margin),bottom:Math.max(margin,size.y-margin)};
 const dx=b.x-a.x,dy=b.y-a.y;
 let t0=0,t1=1;
 for(const [p,q] of [[-dx,a.x-box.left],[dx,box.right-a.x],[-dy,a.y-box.top],[dy,box.bottom-a.y]]){
  if(Math.abs(p)<1e-9){if(q<0)return null;continue}
  const t=q/p;
  if(p<0)t0=Math.max(t0,t);else t1=Math.min(t1,t);
  if(t0>t1)return null;
 }
 const start={x:a.x+dx*t0,y:a.y+dy*t0},end={x:a.x+dx*t1,y:a.y+dy*t1};
 const len=Math.hypot(end.x-start.x,end.y-start.y);
 return len>=2?{start,end,lengthPx:len,angle:Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI}:null;
}
function visibleRouteLabelRuns(coords){
 if(!map||!Array.isArray(coords)||coords.length<2)return [];
 const size=map.getSize(),runs=[];
 let run=null;
 const flush=()=>{if(run&&run.lengthPx>4)runs.push(run);run=null};
 for(let i=1;i<coords.length;i++){
  const a=map.latLngToContainerPoint(coords[i-1]),b=map.latLngToContainerPoint(coords[i]);
  const seg=clipMapLabelSegment(a,b,size);
  if(!seg){flush();continue}
  const joined=run&&Math.hypot(run.end.x-seg.start.x,run.end.y-seg.start.y)<5&&labelTurnDiff(run.angle,seg.angle)<=23;
  if(!joined)flush();
  if(!run)run={points:[seg.start,seg.end],lengthPx:seg.lengthPx,angle:seg.angle,end:seg.end};
  else{run.points.push(seg.end);run.lengthPx+=seg.lengthPx;run.end=seg.end}
 }
 flush();
 const viewCenter={x:size.x/2,y:size.y/2};
 for(const r of runs){
  let half=r.lengthPx/2;
  let center=r.points[Math.floor(r.points.length/2)];
  for(let i=1;i<r.points.length;i++){
   const a=r.points[i-1],b=r.points[i],d=Math.hypot(b.x-a.x,b.y-a.y);
   if(half<=d){const f=d?half/d:0;center={x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f};break}
   half-=d;
  }
  r.centerPx=center;
  r.centerDistance=Math.hypot(center.x-viewCenter.x,center.y-viewCenter.y);
  r.coords=r.points.map(pt=>{const ll=map.containerPointToLatLng(pt);return [ll.lat,ll.lng]});
  if(r.points[0].x>r.points[r.points.length-1].x)r.coords.reverse();
 }
 return runs;
}
function routeLabelCandidate(runs,requiredWidth=0){
 const fitting=runs.filter(r=>r.lengthPx>=requiredWidth+20);
 const candidates=fitting.length?fitting:runs;
 let best=null;
 for(const r of candidates){
  const overlap=legTextOccupied.some(p=>Math.abs(p.x-r.centerPx.x)<((p.w||180)+180)/2&&Math.abs(p.y-r.centerPx.y)<((p.h||26)+58)/2);
  const score=r.centerDistance*.40-Math.min(r.lengthPx,560)*.36+(overlap?700:0);
  if(!best||score<best.score)best={...r,score};
 }
 return best;
}
function estimateCaptionLines(text,widthPx,isTime=false){
 const usable=Math.max(64,widthPx-6);
 const measured=roadLabelWidth(text,isTime);
 return Math.max(1,Math.ceil(measured/usable));
}
function routeCaptionOrientation(angle){
 const a=Math.abs(normalizeLegAngle(angle||0));
 if(a>=58)return 'side';
 if(a<=18)return 'horizontal';
 return 'angled';
}
function routeCaptionPosition(centerPx,text,isTime=false,angle=0){
 if(!map||!centerPx)return 'below';
 const size=map.getSize();
 const width=Math.min(isTime?160:260,Math.max(isTime?70:64,roadLabelWidth(text,isTime)+8));
 const lines=estimateCaptionLines(text,width,isTime);
 const height=(isTime?18:20)+(lines-1)*(isTime?16:20);
 const orient=routeCaptionOrientation(angle);
 const placements=[
  {key:'above',x:centerPx.x-width/2,y:centerPx.y-height-12},
  {key:'below',x:centerPx.x-width/2,y:centerPx.y+12},
  {key:'left',x:centerPx.x-width-12,y:centerPx.y-height/2},
  {key:'right',x:centerPx.x+12,y:centerPx.y-height/2}
 ];
 // Prefer open areas, and avoid covering existing waypoint pins with the text.
 const mapRect=map.getContainer().getBoundingClientRect();
 const pins=Array.from(map.getContainer().querySelectorAll('.leaflet-marker-icon:not(.ronny-route-caption-holder)'))
   .slice(0,350).map(el=>el.getBoundingClientRect()).filter(r=>r.width>3&&r.height>3)
   .map(r=>({x:r.left-mapRect.left,y:r.top-mapRect.top,w:r.width,h:r.height}));
 let ordered=placements;
 if(isTime)ordered=[placements[1],placements[0],placements[3],placements[2]];
 else if(orient==='side')ordered=[placements[3],placements[2],placements[0],placements[1]];
 else if(centerPx.y<size.y*.28)ordered=[placements[1],placements[3],placements[2],placements[0]];
 else if(centerPx.y>size.y*.72)ordered=[placements[0],placements[3],placements[2],placements[1]];
 let best=null;
 for(const p of ordered){
  const overflow=Math.max(0,20-p.x)+Math.max(0,(p.x+width)-(size.x-20))+Math.max(0,18-p.y)+Math.max(0,(p.y+height)-(size.y-18));
  const overlap=legTextOccupied.some(o=>!(p.x+width<o.x-o.w/2-18||p.x>o.x+o.w/2+18||p.y+height<o.y-o.h/2-14||p.y>o.y+o.h/2+14));
  const axisPenalty=((p.key==='left'||p.key==='right')&&orient==='horizontal'?40:0)+((p.key==='above'||p.key==='below')&&orient==='side'?80:0);
  const pinOverlap=pins.some(r=>p.x<r.x+r.w+5&&p.x+width>r.x-5&&p.y<r.y+r.h+5&&p.y+height>r.y-5);
  const score=overflow*40+(overlap?180:0)+(pinOverlap?300:0)+axisPenalty;
  if(!best||score<best.score)best={...p,score,width,height};
 }
 return best?.key||'below';
}
function routeFallbackAnchor(runs,text='',isTime=false){
 // If there is no readable straight run, still show the *full* description on
 // the visible portion of the route closest to the map center.
 const r=routeLabelCandidate(runs,0);
 if(!r)return null;
 const anchor=map.containerPointToLatLng(r.centerPx);
 const pos=routeCaptionPosition(r.centerPx,text,isTime,r.angle||0);
 const width=Math.min(isTime?160:260,Math.max(isTime?70:64,roadLabelWidth(text,isTime)+8));
 const lines=estimateCaptionLines(text,width,isTime);
 const height=(isTime?18:20)+(lines-1)*(isTime?16:20);
 return {latlng:[anchor.lat,anchor.lng],centerPx:r.centerPx,lengthPx:r.lengthPx,angle:r.angle||0,pos,width,height};
}
function readablePathLabelRun(run,text,isTime=false){
 if(!run||!text)return false;
 const width=roadLabelWidth(text,isTime);
 const angle=Math.abs(normalizeLegAngle(run.angle||0));
 const tooSteep=angle>42;
 const tooShort=run.lengthPx<width+22;
 return !tooSteep&&!tooShort;
}
function addCurvedLegLabel(run,text,isTime=false,targetLayer=null){
 if(!run||!text||!legTextSvgRenderer||!map)return false;
 const group=targetLayer||legLabelLayer;if(!group)return false;
 const layer=L.polyline(run.coords,{renderer:legTextSvgRenderer,color:'transparent',opacity:0,weight:1,interactive:false,className:'leg-text-guide'}).addTo(group);
 const path=layer._path,root=legTextSvgRenderer._rootGroup;
 if(!path||!root){group.removeLayer(layer);return false}
 const id='ronny-road-label-'+(++legTextId);path.setAttribute('id',id);
 const ns='http://www.w3.org/2000/svg';
 const node=document.createElementNS(ns,'text');node.setAttribute('class',isTime?'ronny-road-time':'ronny-road-label');
 node.setAttribute('text-anchor','middle');node.setAttribute('dy',isTime?'15':'-7');
 const line=document.createElementNS(ns,'textPath');line.setAttribute('href','#'+id);
 line.setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','#'+id);
 line.setAttribute('startOffset','50%');line.setAttribute('text-anchor','middle');
 node.style.direction=/[\u0590-\u05ff]/.test(text)?'rtl':'ltr';
 node.setAttribute('aria-label',text);line.textContent=text;
 node.appendChild(line);root.appendChild(node);
 layer.on('remove',()=>node.remove());
 return true;
}
function addFullRouteCaption(spot,text,isTime=false,targetLayer=null){
 if(!spot||!text||!map)return false;
 const group=targetLayer||legLabelLayer;if(!group)return false;
 const posClass=spot.pos?` pos-${spot.pos}`:'';
 // The anchor is map-geographical and moves with the route during dragging.
 const marker=L.marker(spot.latlng,{keyboard:false,interactive:false,icon:L.divIcon({className:'ronny-route-caption-holder',iconSize:[0,0],iconAnchor:[0,0],html:`<div class="ronny-route-caption${isTime?' time':''}${posClass}" title="${esc(text)}">${esc(text)}</div>`})});
 marker.addTo(group);return true;
}
function drawRouteAnnotations(index,coords,arr=stops(),targetLayer){
 if(!Array.isArray(coords)||coords.length<2)return;
 const conf=legAt(index,arr),label=String(conf.label||'').trim().replace(/\s+/g,' '),times=routeTimeTextForLeg(index,arr);
 const showLabel=!!label&&layerOn('routeLabels'),showTime=!!times&&viewScope!=='all'&&layerOn('routeTimes');
 if(!showLabel&&!showTime)return;
 const runs=visibleRouteLabelRuns(coords);if(!runs.length)return;
 let occupied=false;
 if(showLabel){
  const pathRun=routeLabelCandidate(runs,roadLabelWidth(label));
  const onLine=readablePathLabelRun(pathRun,label,false)&&addCurvedLegLabel(pathRun,label,false,targetLayer);
  if(!onLine){const anchor=routeFallbackAnchor(runs,label,false);if(anchor)addFullRouteCaption(anchor,label,false,targetLayer),legTextOccupied.push({x:anchor.centerPx.x,y:anchor.centerPx.y,w:anchor.width,h:anchor.height});}
  else if(pathRun)legTextOccupied.push({x:pathRun.centerPx.x,y:pathRun.centerPx.y,w:Math.max(110,Math.min(240,roadLabelWidth(label))),h:26});
  occupied=true;
 }
 if(showTime){
  const pathRun=routeLabelCandidate(runs,roadLabelWidth(times,true));
  const onLine=readablePathLabelRun(pathRun,times,true)&&addCurvedLegLabel(pathRun,times,true,targetLayer);
  if(!onLine){const anchor=routeFallbackAnchor(runs,times,true);if(anchor)addFullRouteCaption(anchor,times,true,targetLayer),legTextOccupied.push({x:anchor.centerPx.x,y:anchor.centerPx.y,w:anchor.width,h:anchor.height});}
  else if(pathRun)legTextOccupied.push({x:pathRun.centerPx.x,y:pathRun.centerPx.y,w:Math.max(88,Math.min(160,roadLabelWidth(times,true))),h:22});
  occupied=true;
 }
 if(!occupied)return;
}
function drawLegLabel(index,coords){drawRouteAnnotations(index,coords,stops(),legLabelLayer||routeLayer)}

function clearLegSpotlight(){
 if(legSpotlightLayer&&map){map.removeLayer(legSpotlightLayer);legSpotlightLayer=null}
 activeLegSpotlight=null;
 document.querySelectorAll('.leg-open.leg-spotlit').forEach(b=>b.classList.remove('leg-spotlit'));
}
function spotlightLeg(index,show=true){
 if(!show){if(activeLegSpotlight===index)clearLegSpotlight();return}
 if(viewScope!=='day'||!map||index<1||index>=stops().length)return;
 if(activeLegSpotlight===index)return;
 clearLegSpotlight();
 activeLegSpotlight=index;
 document.querySelectorAll(`.leg-open[data-leg-index="${index}"]`).forEach(el=>el.classList.add('leg-spotlit'));
 const coords=paintedLegCoordinates.get(index)||legCoords(index);
 if(coords?.length>1){
  legSpotlightLayer=L.polyline(coords,{color:'#ffe99e',weight:14,opacity:.82,lineCap:'round',lineJoin:'round',interactive:false}).addTo(map);
  if(legSpotlightLayer.bringToFront)legSpotlightLayer.bringToFront();
 }
}
// Match the routed geometry with its ordered waypoints; do not use aerial lines
// when highlighting an actual road segment.
function splitRoutedLegs(coords,waypoints){return RouteGeometry.splitRoutedLegs(coords,waypoints,kmBetween)}
function segmentOfPathNearest(coords,latlng){return RouteGeometry.segmentOfPathNearest(coords,latlng)}
function addDrawPointOnLine(index,location){
 const leg=getLegMutable(index);if(!leg||leg.mode!=='draw')return;
 const at=segmentOfPathNearest(legCoords(index),location);
 leg.path.splice(at,0,[+location.lat.toFixed(6),+location.lng.toFixed(6)]);
 save();drawRoute();renderViaHandles();toast('נוספה נקודת שרטוט. גרור אותה כדי לדייק את התוואי.');
}
function ronnyRetraceShift(coords,pixels=3.4){
 if(!map||!Array.isArray(coords)||coords.length<2)return coords;
 return coords.map((point,i)=>{
  const prev=coords[Math.max(0,i-1)],next=coords[Math.min(coords.length-1,i+1)];
  const p=map.latLngToLayerPoint(point),a=map.latLngToLayerPoint(prev),b=map.latLngToLayerPoint(next);
  const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1;
  const shifted=map.layerPointToLatLng(L.point(p.x-dy*pixels/length,p.y+dx*pixels/length));
  return [shifted.lat,shifted.lng];
 });
}
function drawLegLine(coords,mode,index,unavailable=false,retraceRole=null){
 const current=stops(),point=current[index];
 if(point?.type==='walkStart')return;
 const walkingAccess=point?.type==='walkStart';const unverified=!!unavailable||!!point?.leg?.walkRetraceUnverified;
 if(!Array.isArray(coords)||coords.length<2)return;
 if(retraceRole)coords=ronnyRetraceShift(coords);
 const color=retraceRole==='outbound'?'#2d8071':retraceRole==='return'?'#c38b47':routeDisplayColor(pointColor(point,selectedDay),index),showLine=layerOn('routeLines');
 paintedLegCoordinates.set(index,coords);
 if(showLine){
  const options={color:unverified?'#998d77':color,weight:unverified?3:mode==='straight'?3:5,opacity:unverified?.72:.98,dashArray:unverified?'4 9':walkingAccess?'5 8':mode==='straight'?'7 9':undefined,lineCap:'round',interactive:false,className:'leg-map-path'+(unverified?' leg-route-unverified':'')+(retraceRole?' ronny-retrace-'+retraceRole:'')};
  L.polyline(coords,{color:'#fff8ec',weight:mode==='straight'?6:9,opacity:.94,interactive:false}).addTo(routeLayer);
  L.polyline(coords,options).addTo(routeLayer);
  const hit=L.polyline(coords,{color:'#ffffff',weight:34,opacity:0.002,lineCap:'round',lineJoin:'round',interactive:true,bubblingMouseEvents:false,className:'leg-hit-target'}).addTo(routeLayer);
  hit.on('mouseover',()=>spotlightLeg(index));
  hit.on('mouseout',()=>spotlightLeg(index,false));
  hit.on('click',e=>{
   if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);
   if(pointMoveModeId){cancelPointMove();}
   if(drawLegSession&&drawLegSession.day===selectedDay){addDrawVertex(e.latlng.lat,e.latlng.lng);return;}
   if(forcedPointSession?.index===index&&forcedPointSession.day===selectedDay)addForcedPoint(e.latlng);
   else if(['draw','pencil'].includes(mode)&&activeDrawEditLeg===index&&$('leg-editor')?.classList.contains('open'))addDrawPointOnLine(index,e.latlng);
   else openLegEditor(index,e.latlng);
  });
 }
 drawLegLabel(index,coords);
}
function manualLeg(index,arr=stops()){return RouteGeometry.manualLeg(index,arr,{legAt,legCoords,routeLegMinutes,distanceOfCoords})}
function closeLegEditor(){const el=$('leg-editor');if(el){el.classList.remove('open');delete el.dataset.index}forcedHandleLayer?.clearLayers();if(activeDrawEditLeg!==null){activeDrawEditLeg=null;renderViaHandles()}}
function stopLegDrawing(){drawLegSession=null;$('leg-draw-banner')?.classList.remove('active');updateMapHint();renderViaHandles()}
function startLegDrawing(index,mode='draw'){
 activeDrawEditLeg=null;const leg=getLegMutable(index);if(!leg)return;leg.mode=mode==='pencil'?'pencil':'draw';leg.path=Array.isArray(leg.path)?leg.path:[];drawLegSession={index,day:selectedDay};closeLegEditor();hidePointQuick();hideContext();save();drawRoute();renderSchedule();renderViaHandles();updateMapHint();toast(mode==='pencil'?'עיפרון חופשי: הוסף נקודות בזו אחר זו. הקו מחובר רק לנקודת המוצא.':'לחץ לאורך תוואי המעבר כדי לשרטט. לחץ ״סיום שרטוט״ כשתסיים.');
}
function renderDrawBanner(){const bar=$('leg-draw-banner');if(!bar)return;if(!drawLegSession){bar.classList.remove('active');return}
 const idx=drawLegSession.index,leg=legAt(idx);bar.innerHTML=`<strong>${leg.mode==='pencil'?'עיפרון חופשי':'שרטוט מקטע'} • ${Array.isArray(leg.path)?leg.path.length:0} נקודות</strong><button type="button" id="leg-undo">ביטול אחרונה</button><button type="button" id="leg-finish">סיום שרטוט</button>`;bar.classList.add('active');
 $('leg-undo').onclick=()=>{const l=getLegMutable(idx);l?.path?.pop();save();drawRoute();renderViaHandles();renderDrawBanner()};$('leg-finish').onclick=()=>{stopLegDrawing();openLegEditor(idx);toast('התוואי נשמר. ניתן להוסיף כיתוב ומשך מעבר.')};
}
function addDrawVertex(lat,lng){
 if(!drawLegSession||drawLegSession.day!==selectedDay)return false;
 const leg=getLegMutable(drawLegSession.index);if(!leg)return false;
 if(leg.path.length>=120){toast('ניתן לשרטט עד 120 נקודות ביניים למקטע');return true}
 leg.path.push([+lat.toFixed(6),+lng.toFixed(6)]);save();drawRoute();renderViaHandles();renderDrawBanner();return true;
}
function renderDrawVertices(){
 const idx=drawLegSession?.day===selectedDay?drawLegSession.index:activeDrawEditLeg;
 if(idx===null||idx===undefined||viewScope!=='day')return;
 const leg=legAt(idx),path=leg.path||[];
 path.forEach((xy,j)=>{const m=L.marker(xy,{draggable:true,autoPan:true,title:'גרור לשינוי התוואי; לחיצה ימנית למחיקה',icon:L.divIcon({className:'',html:'<div class="leg-draw-vertex"></div>',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(viaLayer);
 let lastDragSave=0;
 m.on('drag',e=>{const v=e.target.getLatLng(),l=getLegMutable(idx);if(!l?.path)return;l.path[j]=[+v.lat.toFixed(6),+v.lng.toFixed(6)];if(Date.now()-lastDragSave>350){save();lastDragSave=Date.now()}});
 m.on('dragend',e=>{const v=e.target.getLatLng();const l=getLegMutable(idx);if(l?.path){l.path[j]=[+v.lat.toFixed(6),+v.lng.toFixed(6)];save();drawRoute();renderViaHandles()}});
 m.on('contextmenu',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);const l=getLegMutable(idx);l.path.splice(j,1);save();drawRoute();renderViaHandles();renderDrawBanner()});
 });
 if(activeDrawEditLeg===idx&&!drawLegSession){
  const coords=legCoords(idx);
  for(let j=0;j<coords.length-1;j++){
   const mid=[(coords[j][0]+coords[j+1][0])/2,(coords[j][1]+coords[j+1][1])/2];
   const icon=L.divIcon({className:'',html:'<div class="leg-insert-vertex">+</div>',iconSize:[20,20],iconAnchor:[10,10]});
   const m=L.marker(mid,{icon,title:'לחץ להוספת נקודת שרטוט'}).addTo(viaLayer);
   m.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);const l=getLegMutable(idx);l.path.splice(j,0,mid);save();drawRoute();renderViaHandles()});
  }
 }
}

// RONNY 25 — choose an uncluttered map position, not merely the nearest screen edge.
 // Coordinates below are relative to .map-pane, so they work while its sidebars are resized.
 function mapPopupMargin(pane){return pane.clientWidth<460||pane.clientHeight<520?16:32}
 function popupSafeRect(pane,el){
  const paneRect=pane.getBoundingClientRect(), margin=mapPopupMargin(pane);
  return {paneRect,margin,w:Math.min(el.offsetWidth||344,Math.max(40,pane.clientWidth-2*margin)),h:Math.min(el.offsetHeight||320,Math.max(40,pane.clientHeight-2*margin))};
 }
 function popupOccupiedAreas(pane,el,paneRect){
  // Search, map tools, zoom buttons, visible labels and other currently open popovers.
  const selectors=['.map-search','.map-quick-views','.map-tools-side','.map-controls','.leaflet-control-zoom','.map-utility','.route-card','.leaflet-tooltip','.leaflet-popup','.map-floating-popup.open'];
  const areas=[];
  for(const selector of selectors){
   for(const node of pane.querySelectorAll(selector)){
    if(node===el||node.contains(el)||el.contains(node))continue;
    if(!node.getClientRects().length||getComputedStyle(node).visibility==='hidden'||getComputedStyle(node).display==='none')continue;
    const rect=node.getBoundingClientRect();
    if(rect.width<3||rect.height<3)continue;
    areas.push({x:rect.left-paneRect.left,y:rect.top-paneRect.top,w:rect.width,h:rect.height,weight:selector==='.leaflet-tooltip'?0.010:0.035});
   }
  }
  return areas;
 }
 function mapPopupFeatures(pane,el,paneRect){
  const markers=[];
  for(const node of pane.querySelectorAll('.leaflet-marker-icon')){
   if(!node.getClientRects().length||el.contains(node))continue;
   const r=node.getBoundingClientRect();
   if(r.width<2||r.height<2)continue;
   markers.push({x:r.left-paneRect.left+r.width/2,y:r.top-paneRect.top+r.height/2});
  }
  // Sample the drawn paths rather than using their oversized SVG bounding boxes.
  // Their penalty is deliberately smaller than the penalty for obscuring a map marker.
  const routePoints=[];
  if(map&&routeLayer?.eachLayer){
   const addCoords=(latlngs)=>{
    if(!Array.isArray(latlngs))return;
    if(latlngs.length&&Array.isArray(latlngs[0])){for(const group of latlngs)addCoords(group);return}
    const step=Math.max(1,Math.ceil(latlngs.length/110));
    for(let j=0;j<latlngs.length;j+=step){
     const ll=latlngs[j];if(!ll||!Number.isFinite(ll.lat)||!Number.isFinite(ll.lng))continue;
     const p=map.latLngToContainerPoint(ll);
     routePoints.push({x:p.x,y:p.y});
    }
   };
   const readLayer=(layer)=>{if(routePoints.length>=650)return;if(typeof layer.getLatLngs==='function')addCoords(layer.getLatLngs());else if(typeof layer.eachLayer==='function')layer.eachLayer(readLayer)};
   routeLayer.eachLayer(readLayer);
  }
  return {markers,routePoints};
 }
 function popupOverlap(a,b){
  return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
 }
 function positionMapPopover(el,point){
  const pane=document.querySelector('.map-pane');if(!pane||!el)return;
  const {paneRect,margin,w,h}=popupSafeRect(pane,el);
  const width=pane.clientWidth,height=pane.clientHeight;
  const maxX=Math.max(margin,width-w-margin),maxY=Math.max(margin,height-h-margin);
  const xClick=Number.isFinite(+point?.x)?+point.x:width/2;
  const yClick=Number.isFinite(+point?.y)?+point.y:height/2;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const near=26;
  const xValues=[xClick+near,xClick-w-near,xClick-w/2,margin,maxX,(width-w)/2,width*.31-w/2,width*.69-w/2];
  const yValues=[yClick+near,yClick-h-near,yClick-h/2,margin,maxY,(height-h)/2,height*.33-h/2];
  const areas=popupOccupiedAreas(pane,el,paneRect),features=mapPopupFeatures(pane,el,paneRect);
  const candidates=new Map();
  const include=(x,y)=>{x=clamp(x,margin,maxX);y=clamp(y,margin,maxY);candidates.set(Math.round(x)+','+Math.round(y),{x,y,w,h})};
  include(xClick+near,yClick+near);include(xClick-w-near,yClick-h-near);
  for(const x of xValues)for(const y of yValues)include(x,y);
  let best=null,bestCost=Infinity;
  for(const r of candidates.values()){
   // Distance is only a tie-breaker: visible points and controls have priority.
   const nearestX=clamp(xClick,r.x,r.x+w),nearestY=clamp(yClick,r.y,r.y+h);
   const distance=Math.hypot(xClick-nearestX,yClick-nearestY);
   let cost=distance*.08+Math.hypot((r.x+w/2)-xClick,(r.y+h/2)-yClick)*.008;
   if(distance<14)cost+=180; // Don't hide the clicked location itself.
   for(const area of areas)cost+=popupOverlap(r,area)*area.weight;
   for(const p of features.markers){
    if(p.x>r.x-14&&p.x<r.x+w+14&&p.y>r.y-14&&p.y<r.y+h+14)cost+=145;
   }
   for(const p of features.routePoints){if(p.x>r.x&&p.x<r.x+w&&p.y>r.y&&p.y<r.y+h)cost+=2.7}
   if(cost<bestCost){bestCost=cost;best=r}
  }
  if(!best)best={x:margin,y:margin};
  el.style.left=Math.round(best.x)+'px';el.style.top=Math.round(best.y)+'px';
 }
 // Do not automatically re-optimize an already open, manually moved editor.
 // Only clamp it after resizing or expanding its contents.
 function keepMapPopoverVisible(el){
  if(!el?.classList.contains('open'))return;
  const pane=document.querySelector('.map-pane');if(!pane)return;
  const {margin,w,h}=popupSafeRect(pane,el);
  const maxX=Math.max(margin,pane.clientWidth-w-margin),maxY=Math.max(margin,pane.clientHeight-h-margin);
  const x=Math.max(margin,Math.min(maxX,parseFloat(el.style.left)||margin));
  const y=Math.max(margin,Math.min(maxY,parseFloat(el.style.top)||margin));
  el.style.left=x+'px';el.style.top=y+'px';
 }
// Delegation survives content re-rendering (for example on mode changes).
function enableMapPopupDragging(){
 for(const el of [$('leg-editor'),$('point-quick'),$('map-context')]){
  if(!el||el.dataset.popupDragBound==='1')continue;
  el.dataset.popupDragBound='1';el.classList.add('map-floating-popup');
  let drag=null;
  el.addEventListener('pointerdown',e=>{
   const handle=e.target.closest('.popup-drag-handle');
   if(!handle||!el.classList.contains('open')||e.button!==0)return;
   const pane=document.querySelector('.map-pane');if(!pane)return;
   drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:parseFloat(el.style.left)||0,top:parseFloat(el.style.top)||0};
   el.classList.add('is-dragging');
   try{handle.setPointerCapture(e.pointerId)}catch(err){}
   e.preventDefault();e.stopPropagation();
  });
  el.addEventListener('pointermove',e=>{
   if(!drag||e.pointerId!==drag.id)return;
   const pane=document.querySelector('.map-pane');if(!pane)return;
   const {margin,w,h}=popupSafeRect(pane,el);
   const left=Math.max(margin,Math.min(Math.max(margin,pane.clientWidth-w-margin),drag.left+e.clientX-drag.x));
   const top=Math.max(margin,Math.min(Math.max(margin,pane.clientHeight-h-margin),drag.top+e.clientY-drag.y));
   el.style.left=left+'px';el.style.top=top+'px';el.dataset.wasMoved='yes';
   e.preventDefault();e.stopPropagation();
  });
  const release=e=>{if(!drag||e.pointerId!==drag.id)return;drag=null;el.classList.remove('is-dragging');e.stopPropagation()};
  el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);
  el.addEventListener('keydown',e=>{
   if(!e.target.closest('.popup-drag-handle')||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
   e.preventDefault();e.stopPropagation();
   const n=e.shiftKey?30:12;
   const delta={ArrowUp:[0,-n],ArrowDown:[0,n],ArrowLeft:[-n,0],ArrowRight:[n,0]}[e.key];
   el.style.left=((parseFloat(el.style.left)||8)+delta[0])+'px';
   el.style.top=((parseFloat(el.style.top)||8)+delta[1])+'px';
   keepMapPopoverVisible(el);el.dataset.wasMoved='yes';
  });
  if(window.L){L.DomEvent.disableClickPropagation(el);L.DomEvent.disableScrollPropagation(el)}
 }
}

const OUTLINE_GUIDE_DEFAULTS=Object.freeze({enabled:true,color:'#577a65',weight:4,opacity:.8,dash:'dashed',endpoints:true});
const OUTLINE_GUIDE_PALETTE=['#577a65','#547b9f','#8d6598','#b0785a','#7a789d','#545d67'];
function outlineGuidePrefs(){
 state.settings=state.settings||{};
 const raw=state.settings.outlineGuideStyle||{};
 const clamp=(v,lo,hi,def)=>Number.isFinite(+v)?Math.max(lo,Math.min(hi,+v)):def;
 const validColor=/^#[0-9a-f]{6}$/i.test(String(raw.color||''));
 const prefs={enabled:raw.enabled!==false,color:validColor?raw.color:OUTLINE_GUIDE_DEFAULTS.color,
  weight:clamp(raw.weight,1.5,8,OUTLINE_GUIDE_DEFAULTS.weight),opacity:clamp(raw.opacity,.2,1,OUTLINE_GUIDE_DEFAULTS.opacity),
  dash:['dashed','solid','dotted'].includes(raw.dash)?raw.dash:OUTLINE_GUIDE_DEFAULTS.dash,
  endpoints:raw.endpoints!==false};
 state.settings.outlineGuideStyle=prefs;
 return prefs;
}
function outlineDashPattern(style){return style==='solid'?undefined:style==='dotted'?'1 9':'9 8'}
function redrawOutlineGuideOnly(){if(planningResolution==='day'&&map&&outlineLayer)renderOutlineStageGuide()}
function guidePreview(panel,prefs){
 const line=panel.querySelector('[data-guide-preview-line]');if(!line)return;
 line.setAttribute('stroke',prefs.color);line.setAttribute('stroke-width',String(Math.max(1.8,prefs.weight*.8)));
 line.setAttribute('stroke-opacity',String(prefs.opacity));
 const dash=outlineDashPattern(prefs.dash);if(dash)line.setAttribute('stroke-dasharray',dash);else line.removeAttribute('stroke-dasharray');
}
function guideControlsMarkup(){
 const p=outlineGuidePrefs();const dashLabels={dashed:'מקווקו',solid:'רציף',dotted:'מנוקד'};
 return `<section class="ronny-guide-controls" aria-label="עיצוב קווי המתאר בתכנון היומי">
  <div class="ronny-guide-head"><div><strong>קווי המתאר בתכנון היומי</strong><small>הקווים שמחברים בין עוגני המתאר</small></div>
   <label class="ronny-guide-toggle"><input type="checkbox" id="ronny-guide-enabled" ${p.enabled?'checked':''}> הצג</label></div>
  <div class="ronny-guide-body ${p.enabled?'':'is-disabled'}" id="ronny-guide-body">
   <div class="ronny-guide-two"><div class="ronny-guide-field"><label for="ronny-guide-weight">עובי <output id="ronny-guide-weight-value">${p.weight.toFixed(1)}</output></label>
    <input type="range" id="ronny-guide-weight" class="ronny-guide-range" min="1.5" max="8" step=".5" value="${p.weight}"></div>
    <div class="ronny-guide-field"><label for="ronny-guide-opacity">שקיפות <output id="ronny-guide-opacity-value">${Math.round(p.opacity*100)}%</output></label>
    <input type="range" id="ronny-guide-opacity" class="ronny-guide-range" min="20" max="100" step="5" value="${Math.round(p.opacity*100)}"></div></div>
   <div class="ronny-guide-field"><label for="ronny-guide-dash">סגנון</label>
    <select id="ronny-guide-dash">${Object.entries(dashLabels).map(([key,label])=>`<option value="${key}" ${p.dash===key?'selected':''}>${label}</option>`).join('')}</select></div>
   <div class="ronny-guide-field"><label>צבע הקו</label><div class="ronny-guide-colors">${OUTLINE_GUIDE_PALETTE.map(c=>`<button type="button" class="ronny-guide-swatch" style="--swatch:${c}" data-guide-swatch="${c}" title="${c}" aria-label="צבע קו ${c}" aria-pressed="${p.color.toLowerCase()===c}"></button>`).join('')}
    <label class="ronny-guide-custom">אחר <input type="color" id="ronny-guide-color" value="${p.color}" aria-label="צבע קו מותאם אישית"></label></div></div>
   <label class="ronny-guide-toggle"><input type="checkbox" id="ronny-guide-endpoints" ${p.endpoints?'checked':''}> הצג סימוני קצה של מקטעים</label>
   <div class="ronny-guide-preview" aria-label="תצוגה מקדימה של קו המתאר"><svg aria-hidden="true" viewBox="0 0 250 20" preserveAspectRatio="none"><path data-guide-preview-line d="M 7 10 L 243 10" fill="none" stroke-linecap="round" /></svg></div>
  </div><div class="ronny-guide-footer"><small>העיצוב נשמר בטיול זה בלבד</small><button type="button" class="ronny-guide-reset" id="ronny-guide-reset">איפוס</button></div>
 </section>`;
}
function wireGuideControls(panel){
 const p=outlineGuidePrefs();guidePreview(panel,p);
 const commit=(field,value,{persist=true}={})=>{p[field]=value;state.settings.outlineGuideStyle={...p};
  redrawOutlineGuideOnly();guidePreview(panel,p);if(persist)save()};
 const enabled=panel.querySelector('#ronny-guide-enabled');enabled.onchange=()=>{
  panel.querySelector('#ronny-guide-body')?.classList.toggle('is-disabled',!enabled.checked);commit('enabled',enabled.checked)};
 const weight=panel.querySelector('#ronny-guide-weight');weight.oninput=()=>{panel.querySelector('#ronny-guide-weight-value').textContent=Number(weight.value).toFixed(1);commit('weight',+weight.value,{persist:false})};weight.onchange=()=>commit('weight',+weight.value);
 const opacity=panel.querySelector('#ronny-guide-opacity');opacity.oninput=()=>{panel.querySelector('#ronny-guide-opacity-value').textContent=opacity.value+'%';commit('opacity',+opacity.value/100,{persist:false})};opacity.onchange=()=>commit('opacity',+opacity.value/100);
 panel.querySelector('#ronny-guide-dash').onchange=e=>commit('dash',e.target.value);
 const picker=panel.querySelector('#ronny-guide-color');const refreshSwatches=()=>panel.querySelectorAll('[data-guide-swatch]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.guideSwatch.toLowerCase()===p.color.toLowerCase())));
 picker.oninput=()=>{commit('color',picker.value,{persist:false});refreshSwatches()};picker.onchange=()=>{commit('color',picker.value);refreshSwatches()};
 panel.querySelectorAll('[data-guide-swatch]').forEach(b=>b.onclick=()=>{picker.value=b.dataset.guideSwatch;commit('color',picker.value);refreshSwatches()});
 panel.querySelector('#ronny-guide-endpoints').onchange=e=>commit('endpoints',e.target.checked);
 panel.querySelector('#ronny-guide-reset').onclick=()=>{state.settings.outlineGuideStyle={...OUTLINE_GUIDE_DEFAULTS};save();redrawOutlineGuideOnly();renderLayerFilterPanel()};
}
let ronnyLayerPanelMode='layers';
function renderLayerFilterPanel(){
 const el=$('layer-filter-panel');if(!el)return;
 const guide=ronnyLayerPanelMode==='contours', visibility=layerVisibility();
 el.innerHTML=`<div class="layer-filter-panel-head"><div><strong>${guide?'קווי מתאר':'שכבות במפה'}</strong><small>${guide?'עיצוב קווי המתאר המחברים בין עוגני התכנון':'בחירת שכבות ותוויות לתצוגה'}</small></div><button type="button" id="layer-filter-close" aria-label="סגירת חלונית">${icon('x','small-icon')}</button></div>`+
 (guide?guideControlsMarkup():`<div class="layer-filter-list">${LAYER_FILTER_DEFS.map(item=>`<label class="layer-filter-row"><span><strong>${item.label}</strong><small>${item.hint}</small></span><input class="layer-filter-switch" type="checkbox" data-layer-key="${item.key}" ${visibility[item.key]?'checked':''}></label>`).join('')}</div><div class="layer-filter-presets"><button type="button" id="layer-preset-all">הכול</button><button type="button" id="layer-preset-clean">מסלול נקי</button></div>`);
 if(guide)wireGuideControls(el);
 else{
  el.querySelectorAll('[data-layer-key]').forEach(input=>input.onchange=()=>{const key=input.dataset.layerKey;layerVisibility()[key]=!!input.checked;save();renderMap()});
  $('layer-preset-all').onclick=()=>{state.settings.layerVisibility={...DEFAULT_LAYER_VISIBILITY,routeTimes:true};save();renderMap();renderLayerFilterPanel()};
  $('layer-preset-clean').onclick=()=>{state.settings.layerVisibility={...DEFAULT_LAYER_VISIBILITY,poiLinks:false,routeLabels:false,routeTimes:false,photos:false};save();renderMap();renderLayerFilterPanel()};
 }
 $('layer-filter-close').onclick=closeLayerFilterPanel;refreshIcons();
}
function closeLayerFilterPanel(){
 const el=$('layer-filter-panel');if(!el)return;el.classList.remove('open');
 $('layer-filter-toggle')?.setAttribute('aria-pressed','false');
 $('map-outline-guide-toggle')?.setAttribute('aria-pressed','false');
}
function openLayerFilterPanel(mode='layers'){
 closeLegEditor();hidePointQuick();hideContext();
 ronnyLayerPanelMode=mode==='contours'?'contours':'layers';
 const el=$('layer-filter-panel');if(!el)return;
 renderLayerFilterPanel();el.classList.add('open');
 const btn=$(ronnyLayerPanelMode==='contours'?'map-outline-guide-toggle':'layer-filter-toggle');
 $('layer-filter-toggle')?.setAttribute('aria-pressed',String(ronnyLayerPanelMode==='layers'));
 $('map-outline-guide-toggle')?.setAttribute('aria-pressed',String(ronnyLayerPanelMode==='contours'));
 const pane=document.querySelector('.map-pane');if(!pane||!btn)return;
 const paneRect=pane.getBoundingClientRect(),box=btn.getBoundingClientRect();
 // Place this menu to the RIGHT of the fixed icon rail. A general map-popup
 // collision algorithm may otherwise cover the very next toolbar icon.
 const left=Math.max(12,Math.min(pane.clientWidth-el.offsetWidth-12,box.right-paneRect.left+14));
 const top=Math.max(12,Math.min(pane.clientHeight-el.offsetHeight-12,box.top-paneRect.top-14));
 el.style.left=Math.round(left)+'px';
 el.style.top=Math.round(top)+'px';
}
function toggleLayerFilterPanel(mode='layers'){
 const el=$('layer-filter-panel');if(!el)return;
 if(el.classList.contains('open')&&ronnyLayerPanelMode===mode)closeLayerFilterPanel();
 else openLayerFilterPanel(mode);
}

function chooseForcedWaypointAction(number){
 const pane=document.querySelector('.map-pane');if(!pane)return Promise.resolve(null);
 if(currentMapDialogFinish)currentMapDialogFinish(null);
 return new Promise(resolve=>{
  const overlay=document.createElement('div');overlay.className='map-confirm-overlay waypoint-actions-overlay';overlay.setAttribute('role','presentation');
  overlay.innerHTML=`<div class="map-confirm-card" role="dialog" aria-modal="true" aria-labelledby="waypoint-actions-title" aria-describedby="waypoint-actions-message"><h3 id="waypoint-actions-title">מעבר הכרחי ${number}</h3><p id="waypoint-actions-message">בחר פעולה עבור נקודת המעבר</p><div class="map-confirm-actions"><button type="button" class="map-confirm-change-location">${icon('map-pin','small-icon')} שנה מיקום</button><button type="button" class="map-confirm-approve">${icon('trash-2','small-icon')} הסר מעבר</button><button type="button" class="map-confirm-cancel">ביטול</button></div></div>`;
  const previous=document.activeElement;
  pane.append(overlay);overlay.addEventListener('pointerdown',e=>e.stopPropagation());
  const finish=choice=>{if(currentMapDialogFinish!==finish)return;currentMapDialogFinish=null;document.removeEventListener('keydown',onKey,true);overlay.remove();if(previous?.isConnected)previous.focus?.();resolve(choice)};
  const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();finish(null)}};
  currentMapDialogFinish=finish;document.addEventListener('keydown',onKey,true);
  overlay.querySelector('.map-confirm-change-location').onclick=()=>finish('move');
  overlay.querySelector('.map-confirm-approve').onclick=()=>finish('delete');
  overlay.querySelector('.map-confirm-cancel').onclick=()=>finish(null);
  overlay.addEventListener('click',e=>{if(e.target===overlay)finish(null)});
  overlay.querySelector('.map-confirm-change-location').focus();refreshIcons();
 });
}
function cancelForcedRelocate(){if(!forcedRelocateSession)return;forcedRelocateSession=null;renderForcedHandles();updateMapHint()}
function relocateForcedWaypoint(latlng){
 const session=forcedRelocateSession;if(!session)return;
 forcedRelocateSession=null;
 if(session.day!==selectedDay){renderForcedHandles();updateMapHint();return}
 const leg=getLegMutable(session.index);
 if(!leg||!Array.isArray(leg.viaPoints)||!leg.viaPoints[session.j]){renderForcedHandles();updateMapHint();notifyOnMap('המעבר כבר אינו קיים');return}
 leg.viaPoints[session.j]=[+latlng.lat.toFixed(6),+latlng.lng.toFixed(6)];
 save();invalidate();retimeAfterOrderChange(selectedDay);drawRoute();renderSchedule();renderForcedHandles();updateMapHint();
 notifyOnMap(`מיקום מעבר הכרחי ${session.j+1} עודכן`);
}
async function openForcedWaypointActions(index,j){
 const leg=legAt(index,stops());if(!leg?.viaPoints?.[j])return;
 const choice=await chooseForcedWaypointAction(j+1);
 if(choice==='move'){
  if(forcedPointSession)stopForcedWaypointMode();
  if(drawLegSession)stopLegDrawing();
  cancelPointMove();hideContext();hidePointQuick();closeLegEditor();
  forcedRelocateSession={day:selectedDay,index,j};
  renderForcedHandles();updateMapHint();notifyOnMap(`לחץ על המפה לבחירת מיקום חדש למעבר ${j+1} · Esc לביטול`);
  return;
 }
 if(choice==='delete'){
  const current=getLegMutable(index);if(!current?.viaPoints?.[j])return;
  current.viaPoints.splice(j,1);save();invalidate();retimeAfterOrderChange(selectedDay);
  drawRoute();renderSchedule();renderForcedHandles();
  if($('leg-editor')?.classList.contains('open'))openLegEditor(index);
  notifyOnMap(`מעבר הכרחי ${j+1} הוסר`);
 }
}
function renderForcedHandles(){
 if(!forcedHandleLayer)return;forcedHandleLayer.clearLayers();
 if(viewScope!=='day'||googleMode)return;
 const activeIndex=forcedPointSession?.day===selectedDay?forcedPointSession.index:($('leg-editor')?.classList.contains('open')?Number($('leg-editor').dataset.index):null);
 const arr=stops();
 for(let idx=1;idx<arr.length;idx++){
  const leg=legAt(idx,arr);
  if(leg.mode!=='auto'||!Array.isArray(leg.viaPoints))continue;
  leg.viaPoints.forEach((p,j)=>{
   const targetRelocation=forcedRelocateSession?.day===selectedDay&&forcedRelocateSession.index===idx&&forcedRelocateSession.j===j;
   const editing=activeIndex===idx||targetRelocation;
   const ico=L.divIcon({className:'',html:`<div class="forced-route-handle ${editing?'':'is-readonly'} ${targetRelocation?'relocating':''}" aria-label="מעבר הכרחי ${j+1}">${j+1}</div>`,iconSize:[28,28],iconAnchor:[14,14]});
   const m=L.marker(p,{icon:ico,draggable:editing,autoPan:true,title:`מעבר הכרחי ${j+1} · ${targetRelocation?'גרור או בחר מיקום חדש':editing?'גרור · לחיצה ימנית לפעולות':'לחץ לעריכת המקטע'}`}).addTo(forcedHandleLayer);
   m.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);if(targetRelocation)return;if(!editing)openLegEditor(idx)});
   m.on('contextmenu',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);openForcedWaypointActions(idx,j)});
   if(!editing)return;
   m.on('dragend',e=>{const xy=e.target.getLatLng();if(targetRelocation){relocateForcedWaypoint(xy);return}const l=getLegMutable(idx);if(!l?.viaPoints?.[j])return;l.viaPoints[j]=[+xy.lat.toFixed(6),+xy.lng.toFixed(6)];save();invalidate();retimeAfterOrderChange(selectedDay);drawRoute();renderSchedule();renderForcedHandles();notifyOnMap('מעבר הכרחי '+(j+1)+' עודכן')});
   
  });
 }
}
function stopForcedWaypointMode(){forcedPointSession=null;const bar=$('leg-draw-banner');if(!drawLegSession)bar?.classList.remove('active');renderForcedHandles();updateMapHint()}
function startForcedWaypointMode(index){
 if(drawLegSession)stopLegDrawing();const leg=getLegMutable(index);if(!leg||leg.mode!=='auto')return;
 forcedPointSession={index,day:selectedDay};closeLegEditor();renderForcedHandles();updateMapHint();
 const bar=$('leg-draw-banner');bar.innerHTML='<strong>מעברים הכרחיים — לחץ על המפה</strong><button type="button" id="forced-finish">סיום</button>';bar.classList.add('active');
 $('forced-finish').onclick=()=>{const i=index;stopForcedWaypointMode();openLegEditor(i)};
}
function addForcedPoint(p){
 if(!forcedPointSession||forcedPointSession.day!==selectedDay)return;
 const leg=getLegMutable(forcedPointSession.index);if(!leg||leg.mode!=='auto')return;
 if(!Array.isArray(leg.viaPoints))leg.viaPoints=[];
 if(leg.viaPoints.length>=16){toast('מקסימום 16 מעברי אילוץ במקטע');return}
 leg.viaPoints.push([+p.lat.toFixed(6),+p.lng.toFixed(6)]);
 save();invalidate();retimeAfterOrderChange(selectedDay);drawRoute();renderSchedule();renderForcedHandles();notifyOnMap('מעבר הכרחי '+leg.viaPoints.length+' נוסף ונשמר');
}
function updateLegDurationPreview(){
 const el=$('leg-editor');if(!el?.classList.contains('open'))return;
 const index=Number(el.dataset.index),arr=stops();if(index<1||index>=arr.length)return;
 const leg=legAt(index,arr),manual=el.querySelector('#leg-duration'),metrics=el.querySelector('#leg-time-metrics'),hint=el.querySelector('#leg-time-hint');
 if(!manual||!metrics||!hint)return;
 const raw=manual.value.trim(),input=raw===''?null:Math.max(0,Number(raw)||0);
 const known=cachedLegBaseSeconds(index,arr);
 const fallback=approximateLegs(arr)[index-1];
 const base=known!==null?known:fallback?.baseDuration;
 if(leg.mode!=='auto'){
  metrics.innerHTML=`<div class="leg-time-total" style="grid-column:1/-1"><small>משך מעבר ידני</small><strong>${input===null?'לא הוגדר':minsFmt(input)}</strong></div>`;
  hint.textContent='בשרטוט ידני או בקו אווירי אין משך נסיעה אוטומטי. יש להזין את משך המעבר הכולל.';return;
 }
 if(!Number.isFinite(base)){
  metrics.textContent='מחושב זמן הדרך...';hint.textContent='ניסיון לקבל זמן בסיס משירות הניתוב.';return;
 }
 const mode=el.querySelector('input[name="leg-time-mode"]:checked')?.value||legTimingMode(leg);
 const final=input===null?base/60:mode==='extra'?base/60+input:input;
 const added=final-base/60;
 const changeLabel=added>0?'+'+minsFmt(added):added<0?'−'+minsFmt(-added):'ללא שינוי';
 metrics.innerHTML=`<div><small>ללא תוספת</small><strong>${minsFmt(base/60)}</strong></div><div><small>התאמה ידנית</small><strong>${changeLabel}</strong></div><div class="leg-time-total"><small>זמן כולל</small><strong>${minsFmt(final)}</strong></div>`;
 hint.textContent=known!==null?'זמן הבסיס התקבל מנתיב מחושב. שינויים ידניים אינם מחליפים את מרחק הכביש.':'זמן הבסיס הוא אומדן זמני בלבד; הוא יתעדכן כשהנתיב יחושב.';
}
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
function ronnyMeasureMeters(points=ronnyMeasure.points){return RouteGeometry.ronnyMeasureMeters(points,kmBetween)}
function ronnyMeasureFormat(m){
 return m>=1000?(m/1000).toLocaleString('he-IL',{maximumFractionDigits:2,minimumFractionDigits:2})+' ק״מ':Math.round(m).toLocaleString('he-IL')+' מ׳';
}
function ronnyMeasureDraw(){
 if(!map||!ronnyMeasureLayer)return;
 ronnyMeasureLayer.clearLayers();
 const pts=ronnyMeasure.points;
 if(pts.length>1){
  L.polyline(pts,{color:'#fffdf6',weight:9,opacity:.92,interactive:false,lineJoin:'round',lineCap:'round'}).addTo(ronnyMeasureLayer);
  L.polyline(pts,{color:'#527e65',weight:4.5,opacity:1,interactive:false,lineJoin:'round',lineCap:'round'}).addTo(ronnyMeasureLayer);
 }
 if(pts.length){
  L.circleMarker(pts[0],{radius:5,color:'#fffdf6',weight:2,fillColor:'#547d64',fillOpacity:1,interactive:false}).addTo(ronnyMeasureLayer);
  L.circleMarker(pts[pts.length-1],{radius:5.5,color:'#fffdf6',weight:2,fillColor:'#527e65',fillOpacity:1,interactive:false}).addTo(ronnyMeasureLayer);
  const label=L.divIcon({className:'ronny-measure-tip-host',html:`<div class="ronny-measure-tip">${ronnyMeasureFormat(ronnyMeasureMeters())}</div>`,iconSize:[0,0],iconAnchor:[0,0]});
  L.marker(pts[pts.length-1],{icon:label,keyboard:false,interactive:false,zIndexOffset:5000}).addTo(ronnyMeasureLayer);
 }
 if(ronnyMeasure.active&&pts.length&&ronnyMeasure.hover&&!ronnyMeasure.dragging){
  L.polyline([pts[pts.length-1],ronnyMeasure.hover],{color:'#759a81',weight:2,opacity:.63,dashArray:'5 7',interactive:false}).addTo(ronnyMeasureLayer);
 }
 const total=ronnyMeasureMeters();
 const value=$('ronny-measure-value');if(value)value.textContent=ronnyMeasureFormat(total);
 const message=$('ronny-measure-detail');
 if(message)message.textContent=pts.length?`${pts.length} נקודות שרטוט · ${ronnyMeasureFormat(total)} · גלגלת העכבר משנה זום. סיום משאיר את הקו על המפה.`:'לחץ במפה להוספת נקודות, או לחץ וגרור לשרטוט חופשי. המדידה גאוגרפית לאורך הקו, לא לפי רשת הכבישים.';
 const undo=$('ronny-measure-undo'),clear=$('ronny-measure-clear');
 if(undo)undo.disabled=!ronnyMeasure.undoLengths.length;
 if(clear)clear.disabled=!pts.length;
}
function ronnyMeasureAppend(latlng,dragging=false){
 const p=[+latlng.lat,+latlng.lng];
 const prev=ronnyMeasure.points.at(-1);
 if(prev){
  if(dragging&&map.latLngToContainerPoint(prev).distanceTo(map.latLngToContainerPoint(p))<7)return;
  if(kmBetween(prev,p)<.15)return;
 }
 if(ronnyMeasure.points.length>=1400)return;
 ronnyMeasure.points.push(p);ronnyMeasure.hover=null;
 ronnyMeasureDraw();
}
function ronnyMeasureDeactivate(){
 if(!ronnyMeasure.active)return;
 ronnyMeasure.active=false;ronnyMeasure.dragging=false;ronnyMeasure.pointerId=null;ronnyMeasure.hover=null;
 if(map){if(ronnyMeasure.prevDragEnabled)map.dragging.enable();if(ronnyMeasure.prevDblClickEnabled)map.doubleClickZoom.enable();map.getContainer().classList.remove('ronny-measuring')}
 const button=$('map-distance-measure');if(button){button.setAttribute('aria-pressed','false');button.title='מדידת אורך קו על המפה'}
 const panel=$('ronny-measure-panel');if(panel)panel.hidden=true;
 ronnyMeasureDraw();updateMapHint();
}
function ronnyMeasureToggle(){
 if(ronnyMeasure.active){ronnyMeasureDeactivate();return}
 if(!map){toast('המפה עדיין לא נטענה');return}
 if(googleMode){toast('עבור לתצוגת המפה הרגילה כדי למדוד');return}
 if(savedPinPlacementId||outlineMoveModeId||newTripSetupDraft||forcedRelocateSession||pointMoveModeId||drawLegSession||forcedPointSession||homePickMode||photoPlacement){toast('סיים תחילה את הפעולה הפעילה במפה');return}
 ronnyMeasure.active=true;ronnyMeasure.hover=null;ronnyMeasure.prevDragEnabled=map.dragging.enabled();ronnyMeasure.prevDblClickEnabled=map.doubleClickZoom.enabled();map.dragging.disable();map.doubleClickZoom.disable();map.getContainer().classList.add('ronny-measuring');
 // Close the tools flyout immediately: its outside-click guard would eat the first map measurement.
 const pane=document.querySelector('.map-pane');
 if(pane?.classList.contains('map-tools-expanded')){
  pane.classList.remove('map-tools-expanded');
  $('map-tools-toggle')?.setAttribute('aria-expanded','false');
 }
 if(routeEdit){routeEdit=false;$('route-edit-toggle')?.setAttribute('aria-pressed','false');renderViaHandles()}
 if(quickStreetMode){quickStreetMode=false;$('street-link-mode')?.setAttribute('aria-pressed','false')}
 hideContext();hidePointQuick();closeLegEditor();
 const button=$('map-distance-measure');if(button){button.setAttribute('aria-pressed','true');button.title='סיים מדידה'}
 const panel=$('ronny-measure-panel');if(panel)panel.hidden=false;
 ronnyMeasureDraw();updateMapHint();
}
function ronnyMeasurePointerAllowed(e){
 if(!ronnyMeasure.active||e.isPrimary===false||(e.pointerType==='mouse'&&e.button!==0))return false;
 const blocked=e.target.closest?.('.leaflet-control,button,input,textarea,select,a,.ronny-measure-panel,.map-group-toggle,.map-tools-side,.map-context,.map-search');
 return !blocked;
}
function ronnyMeasureBindMapPointer(){
 if(!map)return;
 const container=map.getContainer();
 container.addEventListener('pointerdown',e=>{
  if(!ronnyMeasurePointerAllowed(e))return;
  e.preventDefault();e.stopPropagation();
  ronnyMeasure.pointerId=e.pointerId;ronnyMeasure.dragging=true;ronnyMeasure.hover=null;
  ronnyMeasure.undoLengths.push(ronnyMeasure.points.length);
  ronnyMeasureAppend(map.mouseEventToLatLng(e));
 },true);
 window.addEventListener('pointermove',e=>{
  if(!ronnyMeasure.active||!ronnyMeasure.dragging||ronnyMeasure.pointerId!==e.pointerId)return;
  const bounds=container.getBoundingClientRect();
  if(e.clientX<bounds.left||e.clientX>bounds.right||e.clientY<bounds.top||e.clientY>bounds.bottom)return;
  e.preventDefault();e.stopPropagation();
  ronnyMeasureAppend(map.mouseEventToLatLng(e),true);
 },true);
 const release=e=>{
  if(!ronnyMeasure.active||!ronnyMeasure.dragging||ronnyMeasure.pointerId!==e.pointerId)return;
  ronnyMeasure.dragging=false;ronnyMeasure.pointerId=null;ronnyMeasure.hover=null;
  ronnyMeasureDraw();e.preventDefault();e.stopPropagation();
 };
 window.addEventListener('pointerup',release,true);
 window.addEventListener('pointercancel',release,true);
 map.on('mousemove',e=>{if(!ronnyMeasure.active||ronnyMeasure.dragging||!ronnyMeasure.points.length)return;ronnyMeasure.hover=[e.latlng.lat,e.latlng.lng];ronnyMeasureDraw()});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&ronnyMeasure.active){e.preventDefault();e.stopPropagation();ronnyMeasureDeactivate()}},true);
}
function ronnyMeasureBindControls(){
 $('map-distance-measure')?.addEventListener('click',ronnyMeasureToggle);
 $('ronny-measure-end')?.addEventListener('click',ronnyMeasureDeactivate);
 $('ronny-measure-undo')?.addEventListener('click',()=>{
  const previous=ronnyMeasure.undoLengths.pop();if(previous===undefined)return;
  ronnyMeasure.points.length=previous;ronnyMeasure.hover=null;ronnyMeasureDraw();
 });
 $('ronny-measure-clear')?.addEventListener('click',()=>{
  ronnyMeasure.points.length=0;ronnyMeasure.undoLengths.length=0;ronnyMeasure.hover=null;ronnyMeasureDraw();
 });
}
function initMap(){if(!window.L){$('map').innerHTML='<div style="padding:90px 30px;text-align:center;direction:rtl">לא ניתן לטעון את רכיב המפה. בדוק חיבור אינטרנט ופתח מחדש.</div>';toast('ספריית המפה לא נטענה');return}map=L.map('map',{zoomControl:false,worldCopyJump:true,preferCanvas:true}).setView([mapPrefs.home.lat,mapPrefs.home.lng],mapPrefs.home.zoom);L.control.zoom({position:'topright'}).addTo(map);markerLayer=L.layerGroup().addTo(map);routeLayer=L.layerGroup().addTo(map);poiLinkLayer=L.layerGroup().addTo(map);map.createPane('ronnyPoiLinks');map.getPane('ronnyPoiLinks').style.zIndex='420';map.getPane('ronnyPoiLinks').style.pointerEvents='none';map.createPane('ronnyRouteLabels');map.getPane('ronnyRouteLabels').style.zIndex='490';map.getPane('ronnyRouteLabels').style.pointerEvents='none';legTextSvgRenderer=L.svg({pane:'ronnyRouteLabels',padding:1});legLabelLayer=L.layerGroup().addTo(map);photoLayer=L.layerGroup().addTo(map);viaLayer=L.layerGroup().addTo(map);forcedHandleLayer=L.layerGroup().addTo(map);outlineLayer=L.layerGroup().addTo(map);savedPlaceLayer=L.layerGroup().addTo(map);savedPlacePreviewLayer=L.layerGroup().addTo(map);ronnyMeasureLayer=L.layerGroup().addTo(map);setMapStyle(state.settings.mapStyle||'streets',false);map.on('click',e=>{if(ronnyMeasure.active||savedPreviewMode)return;if(Date.now()-ronnyMarkerDraggedAt<450)return;if(savedPinPlacementId){const p=savedPlaces.places.find(x=>x.id===savedPinPlacementId);savedPinPlacementId=null;if(p){p.lat=+e.latlng.lat.toFixed(6);p.lng=+e.latlng.lng.toFixed(6);p.positionSource='user-map';persistSavedPlaces();renderSavedPlaceMarkers();showSavedPlaceLibrary();toast('מיקום המקום נקבע ונשמר');}return;}if(outlineMoveModeId&&planningResolution!=='day'){const id=outlineMoveModeId;outlineMoveModeId=null;const p=currentOutline().points.find(x=>x.id===id);if(p){const old={...p};p.lat=+e.latlng.lat.toFixed(6);p.lng=+e.latlng.lng.toFixed(6);syncOutlineAnchors(id,old);save();renderAll();updateMapHint();toast('מיקום היעד עודכן')}return;}if(planningResolution!=='day'&&!newTripSetupDraft&&!forcedRelocateSession&&!pointMoveModeId&&!drawLegSession&&!forcedPointSession&&!homePickMode&&!photoPlacement&&!quickStreetMode){if($('map-context')?.classList.contains('open')){hideContext();return}addOutlinePoint(e.latlng);return;}if(newTripSetupDraft){const draft={...newTripSetupDraft,lat:+e.latlng.lat.toFixed(6),lng:+e.latlng.lng.toFixed(6),zoom:map.getZoom()};newTripSetupDraft=null;updateMapHint();createTrip(draft);return}if(forcedRelocateSession){relocateForcedWaypoint(e.latlng);return}if(pointMoveModeId){relocatePoint(pointMoveModeId,e.latlng);return}if(drawLegSession){addDrawVertex(e.latlng.lat,e.latlng.lng);return}if(forcedPointSession){addForcedPoint(e.latlng);return}if($('leg-editor')?.classList.contains('open')){closeLegEditor();return}if($('point-quick')?.classList.contains('open')){hidePointQuick();return}if(homePickMode){homePickMode=false;mapPrefs.home={lat:+e.latlng.lat.toFixed(6),lng:+e.latlng.lng.toFixed(6),zoom:map.getZoom()};saveMapPrefs();updateMapHint();toast('נקודת הפתיחה נשמרה. בפעם הבאה האתר ייפתח כאן.');return}if($('map-context').classList.contains('open')){hideContext();return}if(photoPlacement){photoPlacement={lat:e.latlng.lat,lng:e.latlng.lng};$('photo-file').click();return}if(quickStreetMode){openGoogleStreetView(e.latlng.lat,e.latlng.lng);return}currentContext={lat:e.latlng.lat,lng:e.latlng.lng};showContext(e.containerPoint.x,e.containerPoint.y)});map.getContainer().addEventListener('click',e=>{if(!savedPreviewMode||e.target.closest?.('.leaflet-control'))return;e.stopPropagation();e.preventDefault()},true);
 map.on('movestart',hideContext);map.on('moveend zoomend resize',queueLegTextRefresh);ronnyMeasureBindMapPointer();setTimeout(()=>map.invalidateSize(),250)}
const MAP_SAFE_ZOOM={streets:17,topo:16,'esri-topo':16,satellite:17,'satellite-labels':17};
function setMapStyle(style,persist=true){
 if(!map)return;
 style=mapPrefs.enabledMaps.includes(style)?style:mapPrefs.defaultStyle;
 const services={
  streets:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',maxZoom:17,attrib:'Tiles © Esri and contributors'},
  topo:{url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',maxZoom:16,attrib:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://opentopomap.org/">OpenTopoMap</a>'},
  'esri-topo':{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',maxZoom:16,attrib:'Tiles © Esri and contributors'},
  satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxZoom:17,attrib:'Tiles © Esri, Vantor and contributors'},
  'satellite-labels':{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',maxZoom:17,attrib:'Tiles © Esri, Vantor and contributors'}
 };
 if(tiles){map.removeLayer(tiles);tiles=null}
 if(labelsTile){map.removeLayer(labelsTile);labelsTile=null}
  if(roadsTile){map.removeLayer(roadsTile);roadsTile=null}
 const config=services[style];
 // All zoom interactions, including wheel, pinch, +/- and flyTo, respect the active layer.
 // Avoid requesting tiles at optimistic vendor levels with "Map data not yet available" placeholders.
 map.setMaxZoom(config.maxZoom);
 if(map.getZoom()>config.maxZoom)map.setZoom(config.maxZoom,{animate:false});
 const layer=L.tileLayer(config.url,{attribution:config.attrib,maxZoom:config.maxZoom,maxNativeZoom:config.maxZoom,subdomains:style==='topo'?'abc':''});
 tileErrorCount=0;
 layer.on('tileerror',()=>{
  if(layer!==tiles)return;
  tileErrorCount++;
  if(tileErrorCount===5){
   const fallback=style==='streets'||style==='topo'?'esri-topo':'streets';
   // Only one alternate provider attempt. Avoid endless fallback loops on full network outages.
   if(!window._roamFallbackAttempted){
    window._roamFallbackAttempted=true;
    toast('מפת הרקע לא נטענה. מנסה שכבה חלופית. בדוק גם את החיבור לאינטרנט.');
    setMapStyle(fallback,true);
   }else toast('מפות הרקע אינן זמינות. ודא חיבור אינטרנט ואפשר גישה לשירותי Esri.');
  }
 });
 layer.on('tileload',()=>{if(layer===tiles)window._roamFallbackAttempted=false});
 tiles=layer.addTo(map);tiles.bringToBack();
  if(style==='satellite-labels'){
   // An understated hybrid view: aerial imagery with translucent road geometry,
   // plus place/site labels. Keep both overlays beneath all RONNY markers.
   roadsTile=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',{attribution:'Roads © Esri and contributors',maxZoom:17,zIndex:8,opacity:.43}).addTo(map);
   labelsTile=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',{attribution:'Labels © Esri and contributors',maxZoom:17,zIndex:9,opacity:.84}).addTo(map);
  }
 $('map-style').value=style;
 state.settings.mapStyle=style;
 syncMapBaseSwitch();
 if(persist)save();
}
// The documented Maps URL opens a map viewport, not a Street View panorama.
// Street View coverage is not supported as a link-controlled Google Maps layer.
function googleMapsCurrentViewUrl(){
 if(!map)return null;
 const center=map.getCenter(),zoom=Math.min(21,Math.max(0,Math.round(map.getZoom())));
 if(!Number.isFinite(center.lat)||!Number.isFinite(center.lng)||!Number.isFinite(zoom))return null;
 const coordinates=encodeURIComponent(center.lat.toFixed(6)+','+center.lng.toFixed(6));
 const basemap=state.settings.mapStyle==='topo'?'terrain':'satellite';
 return 'https://www.google.com/maps/@?api=1&map_action=map&center='+coordinates+'&zoom='+zoom+'&basemap='+basemap;
}
function bindGoogleMapsCurrentView(){
 const link=$('map-google-view');if(!link)return;
 link.onclick=e=>{
  const url=googleMapsCurrentViewUrl();
  if(!url){e.preventDefault();toast('המפה עדיין לא זמינה');return}
  link.href=url;
  toast('כדי להציג קווי Street View כחולים בגוגל: שכבות ← Street View');
 };
}
const VIA_COLORS=['#7ea89a','#7d98c8','#c88d84','#9988c9','#caa061','#6fa8a9','#c27e9d','#a4b56d','#b98962','#889f7f','#6ea3c0','#c08fb6','#bca36b','#73a18e','#c47973','#878dbe'];
function autoViaColor(day,id){
 const ordinal=viaOrdinal(day,id)-1;
 if(ordinal<0)return VIA_COLORS[0];
 if(ordinal<VIA_COLORS.length)return VIA_COLORS[ordinal];
 const hue=(157+(ordinal-VIA_COLORS.length)*137.508)%360;
 return `hsl(${hue.toFixed(1)} 28% 66%)`;
}
function validCustomColor(value){return typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value)}
// A waypoint's auto color belongs to its identity, not to its order number.
// Assign once (also migrates pre-v12 saved trips) and persist with the trip.
function ronnyColorRGB(color){
 const h=String(color||'').trim();if(!/^#[a-f\d]{6}$/i.test(h))return null;
 return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
}
function ronnyColorDistance(a,b){
 const x=ronnyColorRGB(a),y=ronnyColorRGB(b);
 if(!x||!y)return String(a||'').toLowerCase()===String(b||'').toLowerCase()?0:300;
 // Approximate visual-distance metric rather than exact-hex equality alone.
 return Math.sqrt(.30*(x[0]-y[0])**2+.59*(x[1]-y[1])**2+.11*(x[2]-y[2])**2);
}
function ronnyTooClose(a,b){return !!a&&!!b&&ronnyColorDistance(a,b)<56}
function ronnyChooseDistinctColor(preferred,neighbors,palette,seed=0){
 const around=neighbors.filter(Boolean),choices=[...palette];
 for(let i=0;i<42;i++)choices.push(hslToHex((seed*47+i*137.508+151)%360,28+(i%3)*4,65+(i%4)*2));
 let best=choices[0],bestScore=-Infinity;
 for(const c of choices){
  const score=around.length?Math.min(...around.map(n=>ronnyColorDistance(c,n))):150;
  const proximity=ronnyColorDistance(c,preferred);
  const objective=score>49?1000-proximity*.06:score;
  if(objective>bestScore){best=c;bestScore=objective}
  if(score>72&&(!preferred||proximity<56))return c;
 }
 return best;
}
let ronnyPreferredColorEntity=null;
function reconcileNeighborColors(items,baseColor,palette,seed=0,autoField='autoColor'){
 if(!Array.isArray(items)||items.length<2)return false;
 let changed=false;
 for(let pass=0;pass<3;pass++){
  let problems=0;
  for(let i=1;i<items.length;i++){
   const prev=items[i-1],curr=items[i];
   const left=baseColor(prev,i-1),right=baseColor(curr,i);
   if(!ronnyTooClose(left,right))continue;
   problems++;
   // Explicit day color choices have priority; auto colors are changed around them.
   const prevLocked=!!(prev.dayId&&prev.manualDayColor),currLocked=!!(curr.dayId&&curr.manualDayColor);
   if(prevLocked&&currLocked)continue;
   const prevManual=validCustomColor(prev.color),currentManual=validCustomColor(curr.color);
   const changePrevious=currLocked&&!prevLocked?true:prevLocked&&!currLocked?false:(curr.id&&curr.id===ronnyPreferredColorEntity)?true:currentManual&&!prevManual;
   const index=changePrevious?i-1:i,item=items[index],old=baseColor(item,index);
   const neighbors=[index?baseColor(items[index-1],index-1):'',index+1<items.length?baseColor(items[index+1],index+1):''];
   const replacement=ronnyChooseDistinctColor(old,neighbors,palette,seed+index);
   if(validCustomColor(item.color))item.color=replacement;
   else item[autoField]=replacement;
   changed=true;
  }
  if(!problems)break;
 }
 return changed;
}
function ensureStableViaColors(){
 if(!Array.isArray(state?.days))return;
 // Day colors may have become adjacent after a day reorder or duplication.
 reconcileNeighborColors(state.days,(day,i)=>validDayColor(day.color)?day.color:DAY_ACCENTS[i%DAY_ACCENTS.length],DAY_ACCENTS,17,'color');
 state.days.forEach((day,di)=>{
  const ordered=Array.isArray(day.stops)?day.stops:[];
  // Avoid reshuffling previously saved colors on every render. Add colors only when needed.
  const baseColor=(stop)=>{
   if(validCustomColor(stop.color))return stop.color;
   if(validCustomColor(stop.autoColor))return stop.autoColor;
   if(stop.type==='via')return autoViaColor(di,stop.id);
   return types[stop.type]?.color||'#668b74';
  };
  reconcileNeighborColors(ordered,baseColor,VIA_COLORS,di*41);
 });
}

function hslToHex(h,s,l){
 s/=100;l/=100;
 const k=n=>(n+h/30)%12;
 const a=s*Math.min(l,1-l);
 const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,9-k(n),1));
 return '#'+[f(0),f(8),f(4)].map(x=>Math.round(x*255).toString(16).padStart(2,'0')).join('');
}
function hexToHsl(color){
 const rgb=ronnyColorRGB(color);if(!rgb)return null;
 let [r,g,b]=rgb.map(v=>v/255);
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 let h=0,s=0,l=(max+min)/2;
 if(d){
  s=d/(1-Math.abs(2*l-1));
  switch(max){
   case r:h=60*(((g-b)/d)%6);break;
   case g:h=60*(((b-r)/d)+2);break;
   default:h=60*(((r-g)/d)+4);break;
  }
 }
 if(h<0)h+=360;
 return {h,s:s*100,l:l*100};
}
function routeDisplayColor(base,variant=0){
 const hsl=hexToHsl(base);
 if(!hsl)return '#5d7f72';
 const sat=Math.min(66,Math.max(42,hsl.s+12));
 const light=Math.max(42,Math.min(54,hsl.l-10));
 const hue=(hsl.h+(variant%2?3:-3)+360)%360;
 return hslToHex(hue,sat,light);
}
function pointColor(s,day){
 if(s.type==='idea')return '#b78a08';
 if(validCustomColor(s.color))return s.color;
 if(validCustomColor(s.autoColor))return s.autoColor;
 if(s.type==='via')return autoViaColor(day,s.id);
 return types[s.type]?.color||'#668b74';
}
// The first click selects the marker. The next pointer-down can drag it directly.
// Avoid re-creating Leaflet markers between selection and the beginning of a drag.
function syncMarkerDragState(){
 if(!markerLayer)return;
 const popup=$('point-quick');
 const selectedId=popup?.classList.contains('open')?popup.dataset.id:null;
 markerLayer.eachLayer?.(m=>{
  if(!m.dragging||!m.options?.ronnyStopId)return;
  const selected=selectedId===m.options.ronnyStopId;
  // Direct repositioning is the default. Disable dragging only while another
  // map gesture (drawing, measuring, choosing a location) owns pointer input.
  const canDrag=!ronnyMeasure.active&&!drawLegSession&&!forcedPointSession&&!forcedRelocateSession&&!outlineMoveModeId&&!newTripSetupDraft&&(!pointMoveModeId||pointMoveModeId===m.options.ronnyStopId);
  if(canDrag&&!m.dragging.enabled())m.dragging.enable();
  else if(!canDrag&&m.dragging.enabled())m.dragging.disable();
  const marker=m.getElement?.()?.querySelector('.point-pin');
  marker?.classList.toggle('drag-marker',canDrag);
  marker?.classList.toggle('active',selected||selectedStop===m.options.ronnyStopId);
 });
}
function cancelPointMove(){
 if(!pointMoveModeId)return;
 pointMoveModeId=null;
 renderMarkers();updateMapHint();
}
function armPointMove(id){
 const existing=getStop(id);if(!existing||!map)return;
 hidePointQuick();closeLegEditor();hideContext();
 pointMoveModeId=id;selectedStop=id;
 renderMarkers();updateMapHint();
 toast('מצב הזזת נקודה: גרור את הסמן למיקום חדש, או לחץ על מיקום חדש במפה. Esc לביטול.');
}
function relocatePoint(id,latlng){
 const found=getStop(id);
 if(!found||!Number.isFinite(latlng?.lat)||!Number.isFinite(latlng?.lng))return;
 if(Math.abs(latlng.lat)>90||Math.abs(latlng.lng)>180)return;
 found.stop.lat=+latlng.lat.toFixed(6);found.stop.lng=+latlng.lng.toFixed(6);
 if(found.stop.type==='start'){found.stop.autoInheritedStart=false;delete found.stop.fromPreviousDayEnd}
 pointMoveModeId=null;
 if($('point-quick')?.classList.contains('open'))hidePointQuick();
 if(!isMapOnlyPoint(found.stop)){invalidate();retimeAfterOrderChange(found.day)}
 save();renderAll();updateMapHint();
 toast(isMapOnlyPoint(found.stop)?'מיקום הנקודה עודכן. קו החיבור לנקודת הדרך הקרובה התעדכן.':'מיקום הנקודה עודכן. נתיבי הדרך והזמנים מחושבים מחדש.');
}
// Highlight the planning entry matching a clicked map marker without recentering the map.
let ronnyMapRevealToken=0;
function revealPlanningCardFromMap(id,kind='day'){
 const token=++ronnyMapRevealToken;
 const outline=kind==='outline';
 // A collapsed planner must reopen when a map point is selected.
 if(window.innerWidth<=760){
  $('planner')?.classList.add('show-mobile');
  setRail('plan');
 }else if(document.querySelector('.app')?.classList.contains('planner-collapsed')){
  setPlannerCollapsed(false);
 }
 const container=outline?$('zoom-scroll'):$('schedule');
 const root=outline?$('zoom-content'):$('schedule');
 const selector=outline?'[data-zoom-card]':'[data-stop], [data-side-point]';
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches===true;
 const reveal=()=>{
  if(token!==ronnyMapRevealToken||!container||!root)return false;
  const target=[...root.querySelectorAll(selector)].find(el=>
   outline?el.dataset.zoomCard===id:(el.dataset.stop===id||el.dataset.sidePoint===id));
  if(!target)return false;
  root.querySelectorAll('.ronny-map-reveal').forEach(el=>el.classList.remove('ronny-map-reveal'));
  target.classList.add('ronny-map-reveal');
  if(target.matches('.stop'))target.classList.add('focused');
  const parentBounds=container.getBoundingClientRect(),targetBounds=target.getBoundingClientRect();
  const availableHeight=container.clientHeight;
  if(availableHeight>0){
   // Center when practical; large cards instead align near the top.
   const offset=targetBounds.top-parentBounds.top;
   const preferred=targetBounds.height>availableHeight-28?16:Math.max(18,(availableHeight-targetBounds.height)/2);
   const destination=Math.max(0,Math.min(container.scrollHeight-availableHeight,container.scrollTop+offset-preferred));
   container.scrollTo({top:destination,behavior:reduced?'auto':'smooth'});
  }
  window.setTimeout(()=>{if(token===ronnyMapRevealToken)target.classList.remove('ronny-map-reveal')},2400);
  return true;
 };
 // Wait for the panel to expand, avoiding scroll while its size is zero.
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  reveal();
  if(token===ronnyMapRevealToken&&container?.clientHeight<60){
   window.setTimeout(reveal,320);
  }
 }));
}

function renderMarkers(){
 if(!map)return;
 markerLayer.clearLayers();
 const palette=['#08a99c','#517bb9','#a269d3','#d08b38','#3b967c','#d36776','#64748b'];
 // Precompute route order and walking-loop endpoints once per visible day.
 // Without this, every map marker rescans every stop in its day.
 const routeIndexByDay=new Map(),walkingEndByDay=new Map();
 for(const di of ronnyVisibleDayIndices()){
  const indexes=new Map(),walkEnds=new Map();
  routeStopsForDay(di).forEach((p,index)=>{
   if(!indexes.has(p.id))indexes.set(p.id,index+1);
   if(p.type==='walkEnd'&&p.walkLoopSource&&!walkEnds.has(p.walkLoopSource))
    walkEnds.set(p.walkLoopSource,p);
  });
  routeIndexByDay.set(di,indexes);
  walkingEndByDay.set(di,walkEnds);
 }
 currentStopsForMap().forEach(({stop:s,di,si})=>{
   if(!validPoint(s)||!markerVisibleForStop(s)||s.autoLoopEnd||s.autoWalkEnd)return;
   const cls=types[s.type]?.cls||'';
   const override=viewScope==='all'?`style="background:${palette[di%palette.length]}"`:'';
   const routeOrder=isMapOnlyPoint(s)?null:(routeIndexByDay.get(di)?.get(s.id)??0);
   const tint=s.type==='idea'?'#b78a08':['start','end'].includes(s.type)?'#222b26':pointColor(s,di);const html=`<div class="marker point-pin ${s.type==='start'&&(state.days[di]?.loop||(di===0&&state.settings.tripLoop===true))?'ronny-loop-pin':''} ${cls} ${selectedStop===s.id?'active':''} ${(!ronnyMeasure.active&&!drawLegSession&&!forcedPointSession&&!forcedRelocateSession&&!outlineMoveModeId&&!newTripSetupDraft&&(!pointMoveModeId||pointMoveModeId===s.id))?'drag-marker':''} ${pointMoveModeId===s.id?'move-armed':''}" style="--pin-color:${tint}"><span class="point-pin-inner">${s.type==='via'?`<span class="via-number ronny-route-ordinal" aria-hidden="true">${routeOrder}</span>`:ronnyPointSymbol(s.type==='start'&&(state.days[di]?.loop||(di===0&&state.settings.tripLoop===true))?'loop':s.type,s)}</span></div>`;
   const walkFinish=s.type==='walkStart'?walkingEndByDay.get(di)?.get(s.id):null;
    const walkRange=walkFinish&&s.time&&walkFinish.time?s.time+'–'+walkFinish.time:s.time||'';
    const timeInfo=(viewScope==='all'||isMapOnlyPoint(s))?'':`<div class="map-time-badge" aria-label="${s.type==='walkStart'?'יציאה וחזרה מההליכה':s.type==='start'?'שעת יציאה':'שעת הגעה'}">${esc(s.type==='walkStart'?walkRange:s.time||'')}</div>`;
   const selectedQuick=$('point-quick')?.classList.contains('open')&&$('point-quick').dataset.id===s.id;
   const canDrag=!ronnyMeasure.active&&!drawLegSession&&!forcedPointSession&&!forcedRelocateSession&&!outlineMoveModeId&&!newTripSetupDraft&&(!pointMoveModeId||pointMoveModeId===s.id);
   const m=L.marker([+s.lat,+s.lng],{icon:L.divIcon({html:html+timeInfo,className:'',iconSize:[36,36],iconAnchor:[18,34]}),alt:routeOrder!==null?'נקודה '+routeOrder+' — '+s.name:s.name,ronnyStopId:s.id,ronnyRouteOrder:routeOrder,draggable:canDrag,autoPan:true,title:'גרור לשינוי מיקום · לחץ לעריכה'}).addTo(markerLayer);
   const element=m.getElement?.();if(element){element.dataset.ronnyStopId=s.id;if(routeOrder!==null)element.dataset.ronnyRouteOrder=String(routeOrder)}
   // Dragging requires no prior click. Hide an existing editor while moving,
   // and leave it closed afterwards so further adjustments are unobstructed.
   m.on('dragstart',()=>{
    ronnyMarkerDraggedAt=Date.now();
    const panel=$('point-quick');
    if(panel?.classList.contains('open')&&panel.dataset.id===s.id)
     panel.classList.add('ronny-point-drag-hidden');
   });
   m.on('dragend',e=>{
    ronnyMarkerDraggedAt=Date.now();
    const ll=e.target.getLatLng();
    // relocatePoint commits coordinates, rebuilds the route and closes an open editor.
    relocatePoint(s.id,ll);
   });
   m.on('click',e=>{
    if(Date.now()-ronnyMarkerDraggedAt<450)return;
    if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);
    if(drawLegSession)return;
    if(quickStreetMode){openGoogleStreetView(s.lat,s.lng);return}
    if(pointMoveModeId===s.id)return;
    if(pointMoveModeId)cancelPointMove();
    if(routeEdit)return;
    // A repeated tap simply keeps the editor open; dragging is armed on selection.
    if($('point-quick')?.classList.contains('open')&&$('point-quick').dataset.id===s.id){
      revealPlanningCardFromMap(s.id,'day');
      return;
    }
    openPointQuick(s.id);
    revealPlanningCardFromMap(s.id,'day');
    syncMarkerDragState();
   });const permanent=state.settings.showMapDescriptions!==false&&s.showMapDescription===true&&!!String(s.description||s.notes||'').trim();
   const tip=permanent?`<div class="ronny-permanent-point-name">${esc(s.name)}</div><div class="ronny-permanent-point-desc">${esc(String(s.description||s.notes).slice(0,240))}</div>`:`<div class="point-tip-title">${esc(s.name)}</div>${(s.description||s.notes)?`<div class="point-tip-description">${esc(s.description||s.notes)}</div>`:''}${(viewScope==='all'||isMapOnlyPoint(s))?'':`<div class="point-tip-time">${s.type==='start'?'יציאה · ':''}${esc((viewScope==='all'?'יום '+(di+1)+' · ':'')+(s.time||''))}</div>`}`;
   m.bindTooltip(tip,{direction:'top',offset:[0,permanent?-5:-15],opacity:1,permanent,className:permanent?'ronny-map-description point-info-tooltip':'point-info-tooltip'});
 });refreshIcons();
}
// Overview routing has its own cancellable lifecycle, independent of day routing.
// Do not portray a missing road geometry as a real straight-line driving route.
let overviewRoadController=null,overviewRoadGeneration=0;
const overviewRoadFailures=new Map();
function paintOverviewRoads(){
 routeLayer.clearLayers();legLabelLayer?.clearLayers();legTextOccupied=[];
 let missing=0;
 ronnyVisibleDayIndices().forEach(di=>{
  const arr=routeStopsForDay(di).filter(validPoint);
  const shapes=new Map(),unknown=new Set();
  for(let i=1;i<arr.length;i++){
   if(arr[i].type==='walkStart')continue;
   const leg=legAt(i,arr),profile=effectiveLegProfile(i,arr,di);
   if(leg.mode==='auto'){
    const shape=routedLegVisualCache.get(routedShapeKey(arr,i,profile));
    if(shape?.length>1)shapes.set(i,shape);
    else{unknown.add(i);missing++}
   }else shapes.set(i,legCoords(i,arr));
  }
  const retraces=RouteGeometry.walkRetraceSegments(arr,shapes);
  for(let i=1;i<arr.length;i++){
   if(arr[i].type==='walkStart')continue;
   const leg=legAt(i,arr),from=arr.findIndex(s=>s.id===arr[i].walkLoopSource&&s.type==='walkStart');
   // Do not manufacture a partial return path from missing outbound segments.
   const missingRetrace=retraces.returns.has(i)&&from>=0&&[...unknown].some(j=>j>from&&j<i);
   if(missingRetrace)continue;
   const coords=retraces.returns.get(i)||shapes.get(i);
   if(!coords||coords.length<2)continue;
   const role=retraces.returns.has(i)?'return':retraces.outbound.has(i)?'outbound':null;
   drawLegLineOverview(coords,leg.mode,di,i,role);
   drawRouteAnnotations(i,coords,arr,legLabelLayer||routeLayer);
  }
 });
 return missing;
}
function overviewRoadMessage(missing,loading=false){
 $('route-msg').textContent=loading
  ?'מחשב תוואי כבישים עבור '+missing+' מקטעים. מקטע לא מחושב יופיע כשהנתיב יהיה מוכן.'
  :missing?'לא התקבל תוואי כביש עבור '+missing+' מקטעים. לא מוצג קו ישר כאילו הוא כביש; אפשר לבחור יום או לנסות שוב בהמשך.'
  :'סקירת כל הטיול: נתיבי כביש מחושבים ותוואי שרטוט ידני מוצגים בצורתם האמיתית.';
}
function loadOverviewRoads(generation){
 if(!layerOn('routeLines'))return;
 const tasks=[];
 const now=Date.now();
 ronnyVisibleDayIndices().forEach(di=>{
  const arr=routeStopsForDay(di).filter(validPoint);
  if(arr.length<2)return;
  const {groups}=RoutePlan.build(arr,{legAt,effectiveLegProfile,kmBetween,manualLeg});
  for(const group of groups){
   let missing=false;
   for(let i=group.start+1;i<=group.end;i++){
    if(!routedLegVisualCache.has(routedShapeKey(arr,i,group.profile))){missing=true;break}
   }
   if(!missing)continue;
   const key=JSON.stringify([group.profile,group.stops.map(p=>[p.lat,p.lng])]);
   if(now-(overviewRoadFailures.get(key)||0)<45000)continue;
   tasks.push({arr,group,key});
  }
 });
 if(!tasks.length){overviewRoadMessage(paintOverviewRoads(),false);return}
 const controller=new AbortController();overviewRoadController=controller;
 const timeout=setTimeout(()=>controller.abort(),65000);
 let next=0;
 const repaint=()=>{
  if(controller.signal.aborted||generation!==overviewRoadGeneration||viewScope!=='all'||planningResolution!=='day')return;
  overviewRoadMessage(paintOverviewRoads(),true);
 };
 const worker=async()=>{
  while(next<tasks.length&&!controller.signal.aborted&&generation===overviewRoadGeneration){
   const {arr,group,key}=tasks[next++];
   try{
    let result=routeCache.get(key);
    if(!result){
     result=await requestRoute(group.stops,group.profile,controller.signal);
     if(routeCache.size>35)routeCache.delete(routeCache.keys().next().value);
     routeCache.set(key,result);
    }
    if(controller.signal.aborted||generation!==overviewRoadGeneration)break;
    const coords=result.geometry?.coordinates?.map(p=>[p[1],p[0]])||[];
    const sections=splitRoutedLegs(coords,arr.slice(group.start,group.end+1));
    if(sections.length!==group.end-group.start)throw Error('Invalid routed geometry');
    for(let i=group.start+1;i<=group.end;i++){
     const part=sections[i-group.start-1];
     if(!part||part.length<2)continue;
     rememberRoutedShape(arr,i,group.profile,part);
     const base=group.forced?result.legs.reduce((sum,leg)=>sum+(+leg.duration||0),0):result.legs[i-group.start-1]?.duration;
     if(Number.isFinite(base))routedLegDurationCache.set(routedShapeKey(arr,i,group.profile),base);
    }
    overviewRoadFailures.delete(key);
    repaint();
   }catch(err){
    if(!controller.signal.aborted)overviewRoadFailures.set(key,Date.now());
   }
  }
 };
 Promise.all(Array.from({length:Math.min(2,tasks.length)},worker)).finally(()=>{
  clearTimeout(timeout);
  if(overviewRoadController===controller)overviewRoadController=null;
  if(generation===overviewRoadGeneration&&viewScope==='all'&&planningResolution==='day'){
   overviewRoadMessage(paintOverviewRoads(),false);
  }
 });
}
function showOverview(){
 if(!map)return;
 overviewRoadGeneration++;
 overviewRoadController?.abort();overviewRoadController=null;
 routeToken++;clearTimeout(routeDebounce);routeController?.abort();routeController=null;
 routeData=null;clearLegSpotlight();paintedLegCoordinates.clear();
 const missing=paintOverviewRoads();
 $('route-stops').textContent=ronnyVisibleDayIndices().reduce((n,di)=>n+state.days[di].stops.length,0);
 $('route-distance').textContent='—';$('route-duration').textContent='—';
 $('route-card').querySelector('.route-kicker').textContent='סקירת מסלול • '+ronnyGroupCaption();
 overviewRoadMessage(missing,missing>0);
 renderSchedule();
 if(missing)loadOverviewRoads(overviewRoadGeneration);
}
function drawLegLineOverview(coords,mode,di,index,retraceRole=null){
 if(state.days[di]?.stops[index]?.type==='walkStart'||!Array.isArray(coords)||coords.length<2)return;
 const color=retraceRole==='outbound'?'#2d8071':retraceRole==='return'?'#c38b47':routeDisplayColor(pointColor(state.days[di]?.stops[index],di),di*11+index);
 const visual=retraceRole?ronnyRetraceShift(coords):coords;
 if(layerOn('routeLines')){
  L.polyline(visual,{color:'#fff8ec',weight:8,opacity:.9,interactive:false}).addTo(routeLayer);
  L.polyline(visual,{color,weight:4.6,dashArray:mode==='straight'?'8 9':mode==='auto'?'7 8':undefined,opacity:.94,interactive:false,className:retraceRole?'ronny-retrace-'+retraceRole:''}).addTo(routeLayer);
  const hit=L.polyline(visual,{color:'#ffffff',weight:34,opacity:.002,interactive:true,bubblingMouseEvents:false,className:'leg-hit-target'}).addTo(routeLayer);
  hit.on('click',e=>{
   if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);
   selectedDay=di;viewScope='day';$('map-scope').value='day';selectedStop=null;
   cancelPointMove();renderAll();openLegEditor(index,e.latlng);
  });
 }
}
async function requestRoute(list,profile,signal){return RoutingService.requestRoute(list,profile,signal,fetch)}
function drawRoute(){
 if(!map)return;if(viewScope==='all'){showOverview();return}
 overviewRoadGeneration++;overviewRoadController?.abort();overviewRoadController=null;
 if(syncWalkingLoops(state.days[selectedDay]))save();
 invalidate();clearLegSpotlight();paintedLegCoordinates.clear();routeLayer.clearLayers();legLabelLayer?.clearLayers();legTextOccupied=[];const arr=stops(),day=selectedDay;
 $('route-card').querySelector('.route-kicker').textContent='סקירת מסלול • יום '+(day+1);$('route-stops').textContent=arr.length;
 $('route-distance').textContent='—';$('route-duration').textContent='—';
 if(arr.length<2){forcedHandleLayer?.clearLayers();$('route-msg').textContent='הוסף שתי נקודות לפחות לחישוב מסלול';return}
 const token=++routeToken,{ids,results,groups}=RoutePlan.build(arr,{legAt,effectiveLegProfile,kmBetween,manualLeg});
 // Pre-draw manual geometry immediately, while public routing is being requested.
 const paint=(withResults=false)=>{
  if(token!==routeToken)return;
  routeLayer.clearLayers();legLabelLayer?.clearLayers();legTextOccupied=[];
  if(withResults){
   for(const group of groups){
    if(!group.result?.geometry?.coordinates?.length)continue;
    const coords=group.result.geometry.coordinates.map(pt=>[pt[1],pt[0]]);
    const sections=splitRoutedLegs(coords,arr.slice(group.start,group.end+1));
    for(let i=group.start+1;i<=group.end;i++)rememberRoutedShape(arr,i,group.profile,sections[i-group.start-1]||legCoords(i,arr));
   }
   if(syncWalkingLoops(state.days[day]))save();
  }
  const shapes=new Map(),uncertain=new Set();
  for(let i=1;i<arr.length;i++){
   if(arr[i].type==='walkStart')continue;
   const conf=legAt(i,arr);
   if(conf.mode==='auto'){
    const shape=routedLegVisualCache.get(routedShapeKey(arr,i,effectiveLegProfile(i,arr,day)));
    if(!shape)uncertain.add(i);
    shapes.set(i,shape||[[+arr[i-1].lat,+arr[i-1].lng],...(conf.viaPoints||[]),[+arr[i].lat,+arr[i].lng]]);
   }else shapes.set(i,legCoords(i,arr));
  }
  const retraces=RouteGeometry.walkRetraceSegments(arr,shapes);
  for(let i=1;i<arr.length;i++){
   if(arr[i].type==='walkStart')continue;
   const destination=arr[i],conf=legAt(i,arr);
   const geometry=retraces.returns.get(i)||shapes.get(i);
   if(retraces.returns.has(i)){
    for(let j=arr.findIndex(p=>p.id===destination.walkLoopSource)+1;j<i;j++)if(uncertain.has(j))uncertain.add(i);
   }
   const role=retraces.returns.has(i)?'return':retraces.outbound.has(i)?'outbound':null;
   drawLegLine(geometry,conf.mode,i,uncertain.has(i),role);
  }
 };
 paint();
 const finalize=()=>{
  if(token!==routeToken||day!==selectedDay||viewScope!=='day')return;
  let unavailable=false;
  for(let j=0;j<results.length;j++)if(!results[j]){results[j]=approximateLegs(arr,day)[j];results[j].estimated=true;unavailable=true}
  paint(true);
  for(let j=1;j<arr.length;j++)if(arr[j].leg?.walkAutoRetrace)results[j-1]=manualLeg(j,arr);
  const totalDistance=results.reduce((n,l)=>n+(+l.distance||0),0),totalSeconds=results.reduce((n,l)=>n+(+l.duration||0),0),manualMissing=results.some(l=>l.manualMissing);
  routeData={day,ids,legs:results,distance:totalDistance,duration:totalSeconds,source:'נתיב משולב'};
  if(ronnyDistanceSnapshot.key){ronnyDistanceSnapshot.key='';ronnyDistanceController?.abort();ronnyDistanceState();ronnyPaintDashboardDistance();}
  if(pendingRetimes.has(day)){applyItineraryTimes(day,results,pendingRetimes.get(day),manualMissing?'incomplete':unavailable?'estimated':'routed');pendingRetimes.delete(day);save();renderMarkers()}
  $('route-distance').textContent=(totalDistance/1000).toLocaleString('he-IL',{maximumFractionDigits:1})+' ק״מ';
  $('route-duration').textContent=manualMissing?'חלקי':minsFmt(totalSeconds/60);
  $('route-msg').textContent=manualMissing?'יש מקטע ידני ללא משך מעבר. הזן דקות כדי לחשב שעות מדויקות.':unavailable?'חלק מנתיבי ההליכה או הנסיעה לא חושבו: הקו המקווקו אינו תוואי מאומת. אפשר לשרטט דרך ידנית.':'מקטעים מחושבים בנפרד. משכי מעבר ידניים מוצגים לפי ההזנה שלך.';
  renderSchedule();renderViaHandles();renderForcedHandles();
  if($('leg-editor')?.classList.contains('open'))updateLegDurationPreview();
 };
 if(!groups.length){finalize();return}
 routeDebounce=setTimeout(async()=>{
  const controller=new AbortController();routeController=controller;const timeout=setTimeout(()=>controller.abort(),17000);
  await Promise.all(groups.map(async group=>{
   const key=JSON.stringify([group.profile,group.stops.map(p=>[p.lat,p.lng])]);
   try{let r=routeCache.get(key);if(!r){r=await requestRoute(group.stops,group.profile,controller.signal);if(routeCache.size>35)routeCache.delete(routeCache.keys().next().value);routeCache.set(key,r)}
    group.result=r;
    if(group.forced){
     const position=group.end,base=r.legs.reduce((t,x)=>t+(+x.duration||0),0);
     results[group.start]={...legTimingSnapshot(legAt(position,arr),base),distance:r.legs.reduce((t,x)=>t+(+x.distance||0),0),mode:'auto'};
     routedLegDurationCache.set(routedShapeKey(arr,position,group.profile),base);
    }else for(let i=0;i<r.legs.length;i++){
     const position=group.start+i+1,base=r.legs[i].duration;
     results[group.start+i]={...legTimingSnapshot(legAt(position,arr),base),distance:r.legs[i].distance,mode:'auto'};
     routedLegDurationCache.set(routedShapeKey(arr,position,group.profile),base);
    }
   }catch(e){group.result=null}
  }));clearTimeout(timeout);if(routeController===controller)routeController=null;finalize();
 },300);
}
function renderPoiLinks(){
 if(!map||!poiLinkLayer)return;
 poiLinkLayer.clearLayers();
 if(!layerOn('poiLinks')&&!layerOn('routeLines'))return;
 const days=ronnyVisibleDayIndices();
 for(const di of days){
  const route=routeStopsForDay(di);
  for(let i=0;i<route.length;i++){
   const start=route[i];if(start.type!=='walkStart'||!validPoint(start)||!layerOn('routeLines'))continue;
   const previous=[...route.slice(0,i)].reverse().find(p=>!WALK_TYPES.has(p.type)&&validPoint(p));
   if(!previous)continue;
   const coords=[[+previous.lat,+previous.lng],[+start.lat,+start.lng]];
   if(kmBetween(coords[0],coords[1])<1)continue;
   L.polyline(coords,{pane:'ronnyPoiLinks',color:'#fffdf6',weight:4,dashArray:'3 9',opacity:.9,interactive:false}).addTo(poiLinkLayer);
   L.polyline(coords,{pane:'ronnyPoiLinks',color:'#568973',weight:2.3,dashArray:'3 9',opacity:.95,interactive:false,className:'ronny-walk-access-link'}).addTo(poiLinkLayer);
  }
  if(!layerOn('poiLinks'))continue;
  for(const {point,nearest} of poiLinksForDay(di)){
    if((point.type==='note'&&!layerOn('notes'))||(point.type!=='note'&&!layerOn('poi'))||(!layerOn('routeStops')&&!layerOn('routeLines')))continue;
    const coords=[[+point.lat,+point.lng],[+nearest.lat,+nearest.lng]];
    // A pale thin halo keeps the dashed association visible over satellite imagery.
    L.polyline(coords,{pane:'ronnyPoiLinks',color:'#fffdf6',opacity:.78,weight:3.6,dashArray:'4 7',lineCap:'round',interactive:false,className:'poi-reference-link poi-reference-halo'}).addTo(poiLinkLayer);
    L.polyline(coords,{pane:'ronnyPoiLinks',color:pointColor(point,di),opacity:.94,weight:2.1,dashArray:'4 7',lineCap:'round',interactive:false,className:'poi-reference-link'}).addTo(poiLinkLayer);
  }
 }
}

/* Macro planner: outline -> stage -> days; it never destroys detailed days. */
const OUTLINE_COLORS=['#638a70','#6b87a8','#b18368','#8c779b','#a39559','#6c9c93','#a7717b','#869867'];
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

function renderAll(){ronnyRenderGroupBar();const modelChanged=TripStateCommands.synchronizeForRender(state,planningResolution==='day',{syncWalkingLoops,synchronizeLoopDays,synchronizeDayStarts,synchronizeChronologicalEndpointNames});ensureStableViaColors();applyDayTheme();renderDays();renderSchedule();renderPlanningResolution();renderMap();renderTripDashboard();refreshIcons();if(modelChanged)save();ronnyRememberWorkspace()}
function dayMissingEndpoint(d){return TripQueries.dayMissingEndpoint(d)}
function dayExcludedFromTotals(d){return TripQueries.dayExcludedFromTotals(d)}
function selectDay(i){if(i<0||i>=state.days.length)return;
 wholeTripFocusSeq++;
 if(i!==selectedDay&&dayMissingEndpoint(state.days[selectedDay])){
  if(!window.confirm('לא נקבעה נקודת סיום\n\nנתוני היום לא ייספרו עד לקביעת סיום. להמשיך?'))return;
  state.days[selectedDay].excludedUntilEnd=true;save();
 }
 ronnyBulkStops.clear();ronnyBulkMode=false;planningResolution='day';cancelForcedRelocate();stopForcedWaypointMode();cancelPointMove();stopLegDrawing();closeLegEditor();selectedDay=i;selectedStop=null;viewScope='day';$('map-scope').value='day';hideContext();renderAll();fitMap();if(window.innerWidth<=760){$('planner').classList.remove('show-mobile');setRail(null)}}
// The first day and the first stage can contain distant, unscheduled ideas.
// Keep ALL planned route stops and manually drawn geometry in the fit, but don't
// let a remote map-only pin shrink the initial entity into a tiny map footprint.
function firstEntityFocusPositions(days){
 const planned=[],mapOnly=[];
 const add=(target,p)=>{
  const q=Array.isArray(p)?{lat:p[0],lng:p[1]}:p;
  if(validPoint(q))target.push([+q.lat,+q.lng]);
 };
 for(const di of days)for(const stop of state.days[di]?.stops||[]){
  if(!validPoint(stop))continue;
  if(isMapOnlyPoint(stop))mapOnly.push([+stop.lat,+stop.lng]);
  else{
   add(planned,stop);
   for(const field of ['path','viaPoints'])if(Array.isArray(stop.leg?.[field]))stop.leg[field].forEach(p=>add(planned,p));
  }
 }
 if(!planned.length)return TripQueries.focusMapPositions(state,days);
 const minLat=Math.min(...planned.map(p=>p[0])),maxLat=Math.max(...planned.map(p=>p[0]));
 const minLng=Math.min(...planned.map(p=>p[1])),maxLng=Math.max(...planned.map(p=>p[1]));
 const spread=kmBetween([minLat,minLng],[maxLat,maxLng]);
 const nearbyLimitKm=Math.max(35,Math.min(100,spread*1.5));
 return planned.concat(mapOnly.filter(p=>planned.some(anchor=>kmBetween(anchor,p)<=nearbyLimitKm)));
}
function fitMap(){
 if(!map)return;
 if(planningResolution!=='day'){fitOutlineMap();return}
 // All other days, stages and the full-trip view retain their existing fit.
 const days=ronnyVisibleDayIndices(),firstGroup=ronnyDayGroups()[0];
 const isFirstEntity=(viewScope==='day'&&selectedDay===0)||
  (viewScope==='all'&&!!firstGroup&&ronnyActiveDayGroupId===firstGroup.id);
 const coords=isFirstEntity?firstEntityFocusPositions(days):TripQueries.focusMapPositions(state,days);
 if(!coords.length){const home=state.settings.startCenter||mapPrefs.home;map.flyTo([home.lat,home.lng],home.zoom,{duration:.65});return}
 if(coords.length===1){map.flyTo(coords[0],15,{duration:.65});return}
 map.fitBounds(L.latLngBounds(coords),{padding:[38,44],maxZoom:16,animate:true,duration:.65});
}
let activeQuickCommit=null;
function hidePointQuick(){if(activeQuickCommit){const flush=activeQuickCommit;activeQuickCommit=null;flush()}const el=$('point-quick');if(el){el.classList.remove('ronny-point-drag-hidden');const wasOpen=el.classList.contains('open');el.classList.remove('open');if(wasOpen&&!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches){el.classList.add('ronny-quick-exiting');setTimeout(()=>{if(!el.classList.contains('open'))el.classList.remove('ronny-quick-exiting')},175)}else el.classList.remove('ronny-quick-exiting');el.dataset.id='';el.dataset.mode=''}syncMarkerDragState()}
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
function changeExistingPointType(id,nextType){
 const obj=getStop(id);
 if(!obj||!types[nextType]||nextType===obj.stop.type)return;
 const oldType=obj.stop.type,stop=obj.stop,day=state.days[obj.day];
 // Flush edits that are already in the floating editor before changing its structure.
 hidePointQuick();
 const prevDefault=types[oldType]?.name||'';
 const genericName=stop.name===prevDefault||(/^נקודת מעבר\s*\d+$/.test(String(stop.name||''))&&oldType==='via')||(['start','end'].includes(oldType)&&(stop.autoChronoName||ronnyIsAutoEndpointName(stop.name)));
 stop.type=nextType;
 if(genericName){stop.name=types[nextType].name;stop.autoPlaceName=false;stop.autoViaName=false;stop.autoChronoName=false}
 if(!validCustomColor(stop.color))delete stop.autoColor;
 enforceRouteEndpoints(day,stop);
 positionRouteEndpoints(day);syncWalkingLoops(day);
 ensureStableViaColors();
 // Points of interest do not participate in route calculations or itinerary timing.
 if(!isMapOnlyPoint({type:oldType})||!isMapOnlyPoint({type:nextType})){
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
 if(obj.day!==selectedDay||viewScope==='all'){
  selectedDay=obj.day;viewScope='day';$('map-scope').value='day';renderAll();
 }
 selectedStop=id;
 const s=obj.stop,el=$('point-quick'),pt=map.latLngToContainerPoint([+s.lat,+s.lng]);
 const actualColor=pointColor(s,obj.day);
 const hexColor=validCustomColor(actualColor)?actualColor:(types[s.type]?.color||'#668b74');
 const colorSwatches=VIA_COLORS.slice(0,12);
 if(!colorSwatches.includes(hexColor))colorSwatches.push(hexColor);
 el.innerHTML=`<div class="point-quick-header"><div class="point-quick-top"><span style="color:${hexColor}">${ronnyPointSymbol(s.type,s)}</span><div class="point-quick-heading"><strong>${esc(types[s.type]?.name||'נקודה')}</strong><small>${esc(dayDate(obj.day))}</small></div><span class="popup-drag-handle" role="button" tabindex="0" title="גרור כדי להזיז את החלונית" aria-label="ידית לגרירת החלונית">${icon('grip-horizontal','small-icon')}</span><button type="button" data-quick-close aria-label="סגירה">${icon('x','small-icon')}</button></div></div>
 <div class="point-quick-form"><div class="quick-field quick-type-field"><label for="quick-type">סוג נקודה</label><select id="quick-type" aria-label="שינוי סוג הנקודה">${pointGroups.map(g=>`<optgroup label="${esc(g.label)}">${g.types.filter(t=>t===s.type||endpointChoiceAllowed(t,obj.day,s.id)).map(t=>`<option value="${t}" ${s.type===t?'selected':''}>${esc(types[t].name)}</option>`).join('')}</optgroup>`).join('')}${types[s.type]?.legacy?`<optgroup label="סוג ישן"><option value="${esc(s.type)}" selected>${esc(types[s.type].name)}</option></optgroup>`:''}</select></div><div class="quick-field"><label for="quick-name">שם הנקודה</label><input id="quick-name" maxlength="110" value="${esc(s.name)}" placeholder="שם הנקודה"></div>
 <div class="quick-field"><label for="quick-description">תיאור</label><textarea id="quick-description" maxlength="2500" placeholder="תיאור">${esc(s.description||s.notes||'')}</textarea></div>
 <label class="ronny-description-choice"><input id="quick-show-description" type="checkbox" ${s.showMapDescription?'checked':''}><span>${icon('message-square-text','small-icon')} הצג את התיאור באופן קבוע על המפה</span></label>
 ${ronnyIconPickerMarkup(s)}
 <fieldset class="quick-colors"><legend>צבע הנקודה</legend><div class="quick-color-row">${colorSwatches.map(c=>`<button type="button" class="quick-swatch ${c.toLowerCase()===hexColor.toLowerCase()?'selected':''}" style="background:${c}" data-quick-color="${c}" aria-label="צבע ${c}" aria-pressed="${c.toLowerCase()===hexColor.toLowerCase()}"></button>`).join('')}<label class="quick-color-native" title="בחירת צבע חופשי"><input id="quick-color-custom" type="color" value="${hexColor}"> צבע נוסף</label><button type="button" class="quick-color-reset" data-quick-color-auto>אוטומטי</button></div></fieldset>
 <div class="quick-two ${s.type==='start'?'start-departure-only':''}"><div class="quick-field"><label for="quick-time">${s.type==='walkStart'?'שעת יציאה להליכה':s.type==='start'?'שעת יציאה':'שעת הגעה'}</label><div class="ronny-time-control"><input id="quick-time" class="ronny-time-input" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="5" pattern="[0-2][0-9]:[0-5][0-9]" aria-label="שעה בפורמט 24 שעות" title="פורמט 24 שעות, למשל 14:30" value="${esc(s.time||(s.type==='start'?tripDefaultDepartureTime():'09:00'))}"><button type="button" class="ronny-time-trigger" aria-label="פתח בורר שעות (24 שעות)" title="בחירת שעה, 24 שעות">${icon('clock','small-icon')}</button></div></div>${['start','end'].includes(s.type)?'':`<div class="quick-field"><label for="quick-duration">${s.type==='walkStart'?'משך ההליכה הכולל':s.type==='rest'?'משך עצירה':'משך שהייה'} (בדקות)</label><input id="quick-duration" type="number" min="0" max="3000" step="5" value="${Math.max(0,Number(s.duration)||0)}"></div>`}</div>
 ${['start','end','walkStart'].includes(s.type)?'':`<div class="quick-field quick-departure-editor"><label for="quick-outbound">${s.type==='rest'?'שעת יציאה (מעדכנת את משך העצירה)':'שעת יציאה'}</label><div class="ronny-time-control"><input id="quick-outbound" class="ronny-time-input" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="5" pattern="[0-2][0-9]:[0-5][0-9]" aria-label="שעת יציאה בפורמט 24 שעות" value="${esc(quickEndTime(s.time,s.duration).slice(0,5))}"><button type="button" class="ronny-time-trigger" aria-label="בחירת שעת יציאה" title="בחירת שעת יציאה">${icon('clock','small-icon')}</button></div></div>`}
 <div class="quick-departure"><span>${s.type==='walkStart'?'יציאה להליכה · חזרה בסיום':s.type==='start'?'יציאה':s.type==='end'?'הגעה':'הגעה · עצירה · יציאה'}</span><span class="quick-save-state" id="quick-save-state">שמירה אוטומטית</span></div>
 ${s.type==='walkStart'?`<section class="walk-loop-options" aria-label="${s.walkRetrace?'מסלול הלוך חזור':'מסלול הליכה מעגלי'}"><div class="walk-loop-head"><div><strong>${s.walkRetrace?'מסלול הלוך חזור':'מסלול רגלי מעגלי'}</strong><small>נקודת היציאה היא גם נקודת הסיום, בלי סיכה כפולה</small></div><span class="walk-loop-badge">קבוע</span></div><label class="walk-retrace-switch"><input id="walk-retrace-check" type="checkbox" ${s.walkRetrace?'checked':''}><span class="walk-retrace-track" aria-hidden="true"></span><span class="walk-retrace-copy"><strong>הלוך וחזור באותו התוואי</strong><small>כבוי: ניתן לצייר שביל חזרה נפרד</small></span></label><div class="ronny-walk-clock-grid"><label>הגעה לנקודת הסיבוב<input id="ronny-walk-turn-time" type="time" value="${esc(s.walkTurnClock||'')}" aria-label="שעת הגעה לנקודת הסיבוב; ריק לחישוב"></label><label>חזרה לנקודת ההתחלה<input id="ronny-walk-finish-time" type="time" value="${esc(s.walkFinishClock||'')}" aria-label="שעת סיום ההליכה; ריק לחישוב"></label></div><small class="ronny-walk-clock-hint">השאר שדה ריק לחישוב אוטומטי. משך ההליכה הכולל מתחלק שווה סביב נקודת הסיבוב, אלא אם נקבעה שעה ידנית. זמן הסיום הידני גובר על המשך.</small><div class="walk-loop-foot"><span class="walk-loop-note">נקודת סיבוב אינה מחייבת חזרה באותו תוואי.</span><div class="walk-loop-route-actions"><button type="button" class="walk-loop-route" id="walk-edit-first-leg">${icon("pencil-line","small-icon")} שרטוט רגיל</button><button type="button" class="walk-loop-route" id="walk-edit-pencil-leg">${icon("pencil","small-icon")} עיפרון חופשי</button></div></div></section>`:''}
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
 addPointSection('colors','צבע הנקודה','palette',[quickForm.querySelector('.quick-colors')]);
 const timingNodes=['.quick-two','.quick-departure-editor','.quick-departure','.walk-loop-options'].map(selector=>quickForm.querySelector(selector));
 addPointSection('timing',s.type==='walkStart'?'זמנים ופרטי ההליכה':'זמנים ושהייה','clock-3',timingNodes,
  String(s.time||(s.type==='start'?tripDefaultDepartureTime():'09:00')).slice(0,5));
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
  if(name){if(name!==stop.name){stop.autoPlaceName=false;stop.autoViaName=false;stop.autoChronoName=false;}stop.name=name;}
  else f.name.value=stop.name;
  stop.description=f.description.value;
  const validClock=value=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  const arrivalChanged=validClock(f.time.value)&&f.time.value!==oldTime;
  const duration=Number(f.duration?.value??0);
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
   if(t===''||validClock(t))stop.walkTurnClock=t;
   if(z===''||validClock(z))stop.walkFinishClock=z;
  }
  const walkClockChanged=oldTurn!==(stop.walkTurnClock||'')||oldFinish!==(stop.walkFinishClock||'');
  const durationChanged=oldDuration!==stop.duration;
  let newAnchor=null;
  const route=routeStopsForDay(target.day),start=route[0];
  const anchoredToStart=day.timeAnchor?.kind==='departure'&&day.timeAnchor.stopId===start?.id;
  let arrivalAdjustedLeg=false;
  if(!isMapOnlyPoint(stop)&&arrivalChanged&&timeEditIntent!=='departure'){
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
  else if(arrivalChanged&&validClock(f.time.value)&&timeEditIntent!=='departure'&&!arrivalAdjustedLeg)stop.time=f.time.value;
  const timingChanged=!!newAnchor||durationChanged||arrivalAdjustedLeg||walkClockChanged;
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
 };
 activeQuickCommit=commit;
 const queue=()=>{const label=el.querySelector('#quick-save-state');if(label)label.textContent='שומר…';clearTimeout(pending);pending=setTimeout(commit,280)};
 Object.values(fields()).filter(Boolean).forEach(field=>{field.addEventListener('input',()=>{if(field.id==='quick-time')timeEditIntent='arrival';else if(field.id==='quick-outbound')timeEditIntent='departure';queue()});field.addEventListener('change',commit)});
  el.querySelector('#quick-show-description')?.addEventListener('change',e=>{const obj=getStop(id);if(!obj)return;commit();obj.stop.showMapDescription=e.target.checked;if(e.target.checked)state.settings.showMapDescriptions=true;save();renderMap();refreshIcons();toast(e.target.checked?'התיאור מוצג על המפה':'התיאור הוסתר מהמפה')});
 el.querySelector('#quick-type').addEventListener('change',e=>changeExistingPointType(id,e.target.value));
 el.querySelectorAll('[data-ronny-icon]').forEach(btn=>btn.addEventListener('click',()=>{commit();const target=getStop(id);if(!target)return;const value=btn.dataset.ronnyIcon;if(value)target.stop.iconId=value;else delete target.stop.iconId;save();renderMarkers();renderSchedule();el.querySelectorAll('[data-ronny-icon]').forEach(item=>item.classList.toggle('selected',item.dataset.ronnyIcon===(target.stop.iconId||'')));const summary=el.querySelector('.ronny-icon-editor summary');if(summary)summary.innerHTML='אייקון הנקודה '+ronnyPointSymbol(target.stop.type,target.stop);refreshIcons()}));
 el.querySelector('#quick-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();commit();hidePointQuick()}});
 // Colors take effect instantly, unlike text changes which are debounced.
 const setColor=c=>{commit();const target=getStop(id);if(!target)return;target.stop.color=c;ronnyPreferredColorEntity=target.stop.id;try{ensureStableViaColors()}finally{ronnyPreferredColorEntity=null}save();renderMarkers();renderSchedule();el.querySelectorAll('[data-quick-color]').forEach(b=>{const selected=b.dataset.quickColor.toLowerCase()===pointColor(target.stop,target.day).toLowerCase();b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected))});const input=el.querySelector('#quick-color-custom');if(input&&validCustomColor(c))input.value=c;el.querySelector('#quick-save-state').textContent='הצבע נשמר'};
 el.querySelectorAll('[data-quick-color]').forEach(b=>b.addEventListener('click',()=>setColor(b.dataset.quickColor)));
 el.querySelector('#quick-color-custom').addEventListener('input',e=>setColor(e.target.value));
 el.querySelector('[data-quick-color-auto]').onclick=()=>{commit();const target=getStop(id);if(!target)return;delete target.stop.color;delete target.stop.autoColor;ensureStableViaColors();save();renderMarkers();renderSchedule();const c=pointColor(target.stop,target.day);el.querySelectorAll('[data-quick-color]').forEach(b=>b.classList.toggle('selected',b.dataset.quickColor.toLowerCase()===c.toLowerCase()));el.querySelector('#quick-save-state').textContent='הצבע האוטומטי נשמר'};
 el.querySelectorAll('[data-point-leg]').forEach(btn=>btn.addEventListener('click',()=>{const index=+btn.dataset.pointLeg;hidePointQuick();openLegEditor(index)}));
 el.querySelector('[data-quick-close]').onclick=()=>hidePointQuick();
 el.querySelector('[data-quick-delete]').onclick=async()=>{if(!await confirmOnMap('למחוק את הנקודה ״'+s.name+'״?',{title:'מחיקת נקודה',accept:'מחק נקודה'}))return;clearTimeout(pending);const target=getStop(id);if(!target)return;await animatePlannerRemoval([id],'day');state.days[target.day].stops=state.days[target.day].stops.filter(x=>x.id!==id);positionRouteEndpoints(state.days[target.day]);selectedStop=null;hidePointQuick();if(!isMapOnlyPoint(target.stop)){invalidate();retimeAfterOrderChange(target.day)}save();renderAll();toast('הנקודה נמחקה')};
 el.querySelector('[data-quick-move]').onclick=()=>armPointMove(id);
 el.querySelector('[data-quick-street-view]').onclick=()=>{const target=getStop(id);if(target&&validPoint(target.stop))openGoogleStreetView(+target.stop.lat,+target.stop.lng);};
 el.querySelector('[data-quick-details]').onclick=()=>{hidePointQuick();openStopForm(id)};
 syncMarkerDragState();
 refreshIcons();
}
function focusStop(id){
 const obj=getStop(id);if(!obj||!map)return;
 hidePointQuick();closeLegEditor();hideContext();
 if(obj.day!==selectedDay||viewScope!=='day'){
  selectedDay=obj.day;viewScope='day';$('map-scope').value='day';renderAll();
 }
 selectedStop=id;renderMarkers();renderSchedule();
 if(window.innerWidth<=760)showMap();
 const target=[+obj.stop.lat,+obj.stop.lng];
 const zoom=Math.max(11,map.getZoom());
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 map.flyTo(target,zoom,{duration:reduced?0:.65,animate:!reduced});
 const idToPulse=id;
 window.setTimeout(()=>{
  markerLayer?.eachLayer?.(m=>{
   if(m.options?.ronnyStopId!==idToPulse)return;
   const badge=m.getElement?.()?.querySelector('.point-pin');
   if(badge?.animate&&!reduced)badge.animate([
    {transform:'scale(1)',filter:'brightness(1)'},
    {transform:'scale(1.24)',filter:'brightness(1.2)',offset:.47},
    {transform:'scale(1)',filter:'brightness(1)'}
   ],{duration:570,easing:'ease-out'});
  });
 },reduced?0:250);
}
// Drawer history retains DOM elements, listeners, form state, and scroll offset.
const ronnyDrawerHistory=[];
function ronnyBackState(){const btn=$('ronny-rail-back');if(!btn)return;const available=ronnyDrawerHistory.length>0&&!!$('drawer')?.classList.contains('open');btn.disabled=!available;btn.hidden=!available}
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
 const toggle=()=>setMapStyle(state.settings.mapStyle==='topo'?'satellite':'topo');
 // Click anywhere on the capsule, including the already selected half.
 wrapper.onclick=toggle;
 wrapper.querySelectorAll('[data-map-base]').forEach(btn=>{
  btn.onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();toggle();wrapper.querySelector('[aria-checked="true"]')?.focus()};
 });
 syncMapBaseSwitch();
}
function initMapQuickPickers(){
 const dayTrigger=$('map-day-trigger'),dayMenu=$('map-day-menu');initMapBaseSwitch();bindGoogleMapsCurrentView();if(!dayTrigger||!dayMenu)return;
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
 const normalized=q.toLocaleLowerCase();
 const local=state.days.flatMap(d=>d.stops).filter(p=>validPoint(p)&&p.name?.toLocaleLowerCase().includes(normalized)).slice(0,5).map(p=>({name:p.name,description:'נקודה מהטיול שלך',lat:+p.lat,lng:+p.lng}));
 if(q.length<2){if(local.length)paintSearchResults(local,q);else{$('search-results').innerHTML='<div class="search-state">המשך להקליד כדי לראות הצעות למקומות.</div>';$('search-results').classList.add('open')}return}
 searchChoices=[];$('search-results').innerHTML='<div class="search-state search-loading">מחפש מקומות…</div>'+externalSearchMarkup(q);$('search-results').classList.add('open');
 searchDebounce=setTimeout(()=>searchPlaces(q,local),420);
}
async function searchPlaces(overrideQuery=null,local=[]){
 const q=(overrideQuery??$('place-search').value).trim();if(q.length<2)return;
 const seq=++searchSeq;searchController?.abort();searchController=new AbortController();
 try{
  // Photon search is center-biased; text-only caching returns stale places after moving the map.
  const near=map?.getCenter();
  const bucket=near&&Number.isFinite(near.lat)&&Number.isFinite(near.lng)
   ?Math.round(near.lat*5)/5+','+Math.round(near.lng*5)/5:'global';
  const cacheKey=q.toLocaleLowerCase()+'|'+bucket;
  let results=searchCache.get(cacheKey);
  if(!results){
   const params=new URLSearchParams({q,limit:'7',lang:'he'});
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
   searchCache.set(cacheKey,results);
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
function ronnyReleaseNotes(r){
 return '<ul class="ronny-release-notes">'+(r.notes||[]).map(n=>'<li>'+esc(String(n))+'</li>').join('')+'</ul>';
}
async function ronnyLoadPatchNotes(){
 if(ronnyPatchNotesCache)return ronnyPatchNotesCache;
 if(ronnyPatchNotesPromise)return ronnyPatchNotesPromise;
 ronnyPatchNotesPromise=(async()=>{
  const response=await fetch(RONNY_PATCH_INDEX_URL,{cache:'no-cache'});
  if(!response.ok)throw new Error('לא ניתן לטעון את אינדקס הגרסאות');
  const manifest=await response.json();
  if(!Array.isArray(manifest.files)||!manifest.files.length)throw new Error('אינדקס הגרסאות ריק או אינו תקין');
  const filenames=manifest.files;
  if(filenames.some(n=>typeof n!=='string'||!/^\d+\.json$/.test(n)))throw new Error('שמות קובצי גרסה לא תקינים');
  const releases=await Promise.all(filenames.map(async(filename)=>{
   const response=await fetch('./PATCH%20NOTES/'+encodeURIComponent(filename),{cache:'no-cache'});
   if(!response.ok)throw new Error('קובץ גרסה חסר: '+filename);
   const entry=await response.json();
   if(!entry||!/^\d+(?:\.\d+)?$/.test(String(entry.version))||!Array.isArray(entry.notes)||entry.notes.some(n=>typeof n!=='string'))throw new Error('תוכן קובץ גרסה אינו תקין: '+filename);
   if(String(parseInt(filename,10))!==String(parseInt(entry.version,10)))throw new Error('מספר קובץ גרסה אינו תואם: '+filename);
   return entry;
  }));
  releases.sort((a,b)=>Number(b.version)-Number(a.version));
  ronnyPatchNotesCache=releases;
  return releases;
 })();
 try{return await ronnyPatchNotesPromise}finally{ronnyPatchNotesPromise=null}
}
async function ronnyRenderPatchNotes(){
 const target=document.getElementById('ronny-patch-content');
 if(!target)return;
 try{
  const releases=await ronnyLoadPatchNotes();
  if(!target.isConnected)return;
  const current=releases[0];
  const archive=releases.slice(1).map(r=>'<details class="ronny-about-archive-entry"><summary>גרסה '+esc(String(r.version))+' <span>'+esc(String(r.date||''))+'</span></summary>'+ronnyReleaseNotes(r)+'</details>').join('');
  target.innerHTML='<div class="ronny-about-version-stats"><div><small>גרסה נוכחית</small><strong dir="ltr">'+esc(String(current.version))+'</strong></div><div><small>מספר פאצ׳ים</small><strong>'+esc(String(current.version))+'</strong></div></div><h3>הערות עדכון — גרסה '+esc(String(current.version))+'</h3>'+ronnyReleaseNotes(current)+'<h3>ארכיון גרסאות</h3>'+archive;
 }catch(error){
  if(target.isConnected)target.innerHTML='<p class="footnote" role="alert">לא ניתן לטעון את היסטוריית הגרסאות: '+esc(String(error.message||''))+'</p><button type="button" class="btn" id="ronny-patch-retry">נסה שוב</button>';
  const retry=document.getElementById('ronny-patch-retry');
  if(retry)retry.onclick=()=>{target.textContent='טוען גרסאות…';ronnyRenderPatchNotes()};
 }
}
function help(){const body=`<div class="ronny-about-root"><details class="ronny-about-section"><summary>עזרה</summary><div class="ronny-about-content"><div class="shortcut-note"><strong>תכנון מפה ויומן</strong><p>חפש יעד ובחר תוצאה כדי ליצור עצירה. אפשר גם ללחוץ ישירות על המפה, להוסיף קואורדינטות, להגדיר שעה, משך שהייה והוצאה ולשמור.</p><strong>הנסיעות</strong><p>לחץ על שורת הדרך בין שתי עצירות או על הקו במפה כדי לבחור ״מצא נתיב״, ״שרטט נתיב״ או ״קו אווירי״. במצב שרטוט בוחרים נקודות ביניים ישירות על המפה. אפשר להוסיף כיתוב על הקו ומשך מעבר ידני, למשל לרכבל.</p><p>לאחר הוספת שתי נקודות, האתר מחשב זמן ומרחק באמצעות שירותי ניתוב ציבוריים. ניתן לגרור עצירות כדי לשנות את הסדר וללחוץ על "תזמון אוטומטי" לחישוב שעות משוער.</p><strong>מפות ותצוגת רחוב</strong><p>לחץ על ״סטריט ויו״ בסרגל המפה ולאחר מכן על נקודה כדי לפתוח את גוגל בטאב חדש — ללא מפתח API. בתפריט הפעולות של נקודה יש גם קיצור דרך ישיר. שכבת ״כיסוי (API)״ היא אפשרות מתקדמת שדורשת מפתח Google. אפשר לבחור בין תצוגת יום לתצוגת כל הטיול, ולהחליף מפות רגילות, טופוגרפיות ולוויין. סקירת כל הטיול מציגה קווים סכמטיים; בעת בחירת יום יחושב נתיב בדרך. פתיחה של Street View בטאב חדש אינה דורשת מפתח, והטמעה בתוך האתר דורשת מפתח Google בלבד.</p><strong>שמירה</strong><p>הכל נשמר אוטומטית בדפדפן, וניתן לייצא ולייבא קובץ JSON בלי מפתחות השירות. נדרש חיבור לאינטרנט לטעינת מפות, לחיפוש ולחישוב מסלולים. בפתיחה מקומית של HTML ייתכן שמפתחות המוגבלים לדומיין לא יעבדו.</p></div></div></details><details class="ronny-about-section" open><summary>גרסאות</summary><div class="ronny-about-content" id="ronny-patch-content" aria-live="polite">טוען גרסאות…</div></details></div>`;openDrawer('אודות','ABOUT RONNY','מדריך שימוש והיסטוריית גרסאות',body,'<button class="btn btn-primary" id="help-close">סגור</button>');$('help-close').onclick=closeDrawer;ronnyRenderPatchNotes()}


/* RONNY 35.7 — geographic outline / day assignment + integrated dashboard */
const RONNY_COUNTRY_SHAPES=[["FJ",[[[180.0,-16.07],[180.0,-16.56],[178.73,-17.01],[178.6,-16.64],[180.0,-16.07]],[[177.67,-17.38],[178.72,-17.63],[178.55,-18.15],[177.38,-18.16],[177.67,-17.38]],[[-180.0,-16.07],[-179.92,-16.5],[-180.0,-16.56],[-180.0,-16.07]]]],["TZ",[[[33.9,-0.95],[37.7,-3.1],[37.77,-3.68],[39.2,-4.68],[38.74,-5.91],[38.8,-6.48],[39.44,-6.84],[39.19,-8.49],[40.32,-10.32],[39.52,-10.9],[36.51,-11.72],[34.56,-11.52],[33.74,-9.42],[30.74,-8.34],[29.62,-6.52],[29.34,-4.5],[30.75,-3.36],[30.47,-2.41],[30.82,-1.7],[30.42,-1.13],[33.9,-0.95]]]],["EH",[[[-8.67,27.66],[-8.69,25.88],[-11.97,25.93],[-11.94,23.37],[-12.87,23.28],[-12.93,21.33],[-16.85,21.33],[-17.06,21.0],[-17.02,21.42],[-14.75,21.5],[-13.89,23.69],[-12.5,24.77],[-12.03,26.03],[-11.39,26.88],[-8.79,27.12],[-8.67,27.66]]]],["CA",[[[-122.84,49.0],[-125.62,50.42],[-127.44,50.83],[-127.99,51.72],[-127.85,52.33],[-129.13,52.76],[-129.31,53.56],[-130.51,54.29],[-130.01,55.92],[-131.71,56.55],[-133.36,58.41],[-135.48,59.79],[-137.45,58.91],[-139.04,60.0],[-141.0,60.31],[-140.99,69.71],[-136.5,68.9],[-134.41,69.63],[-132.93,69.51],[-129.79,70.19],[-129.11,69.78],[-128.14,70.48],[-125.76,69.48],[-124.42,70.16],[-124.29,69.4],[-121.47,69.8],[-115.25,68.91],[-113.9,68.4],[-115.3,67.9],[-113.5,67.69],[-109.95,67.98],[-108.88,67.38],[-107.79,67.89],[-108.81,68.31],[-108.17,68.65],[-106.15,68.8],[-104.34,68.02],[-101.45,67.65],[-98.44,67.78],[-98.56,68.4],[-97.67,68.58],[-96.12,68.24],[-96.13,67.29],[-95.49,68.09],[-94.69,68.06],[-94.23,69.07],[-96.47,70.09],[-96.39,71.19],[-95.21,71.92],[-92.88,71.32],[-91.52,70.19],[-92.41,69.7],[-90.55,69.5],[-90.55,68.47],[-89.22,69.26],[-88.02,68.62],[-88.32,67.87],[-87.35,67.2],[-85.58,68.78],[-85.52,69.88],[-82.62,69.66],[-81.28,69.16],[-81.22,68.67],[-81.96,68.13],[-81.26,67.6],[-81.39,67.11],[-83.34,66.41],[-85.77,66.56],[-87.32,64.78],[-88.48,64.1],[-90.7,63.61],[-90.77,62.96],[-91.93,62.84],[-94.24,60.9],[-94.68,58.95],[-93.22,58.78],[-92.3,57.09],[-90.9,57.28],[-85.01,55.3],[-82.27,55.15],[-82.13,53.28],[-81.4,52.16],[-79.91,51.21],[-79.14,51.53],[-78.6,52.56],[-79.12,54.14],[-79.83,54.67],[-78.23,55.14],[-76.54,56.53],[-77.3,58.05],[-78.52,58.8],[-77.34,59.85],[-78.11,62.32],[-73.84,62.44],[-71.37,61.14],[-69.59,61.06],[-69.29,58.96],[-67.65,58.21],[-66.2,58.77],[-64.58,60.34],[-61.4,56.97],[-61.8,56.34],[-59.57,55.2],[-57.33,54.63],[-56.94,53.78],[-55.76,53.27],[-55.68,52.15],[-60.03,50.24],[-66.4,50.23],[-68.51,49.07],[-71.1,46.82],[-70.26,46.99],[-68.65,48.3],[-66.55,49.13],[-65.06,49.23],[-64.17,48.74],[-65.12,48.07],[-64.47,46.24],[-63.17,45.74],[-61.52,45.88],[-60.52,47.01],[-60.45,46.28],[-59.8,45.92],[-65.36,43.55],[-66.12,43.62],[-66.16,44.47],[-64.43,45.29],[-67.14,45.14],[-67.79,45.7],[-67.79,47.07],[-69.24,47.45],[-70.66,45.46],[-71.51,45.01],[-74.87,45.0],[-76.82,43.63],[-78.72,43.63],[-79.17,43.47],[-78.94,42.86],[-82.44,41.68],[-83.14,41.98],[-82.14,43.57],[-82.55,45.35],[-84.88,46.9],[-88.38,48.3],[-91.64,48.14],[-94.33,48.67],[-94.82,49.39],[-95.16,49.0],[-122.84,49.0]],[[-83.99,62.45],[-83.25,62.91],[-81.88,62.9],[-83.07,62.16],[-83.99,62.45]],[[-79.78,72.8],[-80.88,73.33],[-80.83,73.69],[-78.06,73.65],[-76.25,72.83],[-79.78,72.8]],[[-80.32,62.09],[-79.93,62.39],[-79.27,62.16],[-79.66,61.63],[-80.32,62.09]],[[-93.61,74.98],[-94.16,74.59],[-96.82,74.93],[-94.85,75.65],[-93.61,74.98]],[[-93.84,77.52],[-96.17,77.56],[-96.44,77.83],[-94.42,77.82],[-93.84,77.52]],[[-98.63,78.87],[-95.56,78.42],[-95.83,78.06],[-97.31,77.85],[-98.12,78.08],[-98.63,78.87]],[[-88.15,74.39],[-92.42,74.84],[-92.89,75.88],[-93.89,76.32],[-97.12,76.75],[-96.75,77.16],[-91.61,76.78],[-90.74,76.45],[-90.97,76.07],[-89.19,75.61],[-81.13,75.71],[-79.83,74.92],[-81.95,74.44],[-88.15,74.39]],[[-113.53,77.73],[-109.85,78.0],[-112.05,77.41],[-113.53,77.73]],[[-111.5,78.85],[-109.66,78.6],[-112.54,78.41],[-111.5,78.85]],[[-55.41,51.59],[-56.8,49.81],[-56.14,50.15],[-55.47,49.94],[-55.82,49.59],[-53.48,49.25],[-53.79,48.52],[-53.09,48.69],[-52.65,47.54],[-53.07,46.66],[-54.18,46.81],[-53.96,47.63],[-54.24,47.75],[-55.4,46.88],[-56.0,46.92],[-55.29,47.39],[-56.25,47.63],[-59.27,47.6],[-59.42,47.9],[-58.8,48.25],[-59.23,48.52],[-57.36,50.72],[-55.87,51.63],[-55.41,51.59]],[[-85.88,65.74],[-81.64,64.46],[-81.55,63.98],[-80.1,63.73],[-80.99,63.41],[-83.11,64.1],[-85.52,63.05],[-85.87,63.64],[-87.22,63.54],[-86.35,64.04],[-85.88,65.74]],[[-80.75,72.06],[-77.82,72.75],[-74.23,71.77],[-74.1,71.33],[-72.24,71.56],[-71.2,70.92],[-68.79,70.53],[-66.97,69.19],[-68.81,68.72],[-64.86,67.85],[-63.42,66.93],[-61.85,66.86],[-62.16,66.16],[-63.92,65.0],[-66.72,66.39],[-68.02,66.26],[-68.14,65.69],[-65.32,64.38],[-64.67,63.39],[-65.01,62.67],[-68.78,63.75],[-66.17,61.93],[-68.88,62.33],[-74.83,64.68],[-74.82,64.39],[-77.71,64.23],[-78.56,64.57],[-77.9,65.31],[-73.96,65.45],[-74.29,65.81],[-73.94,66.31],[-72.65,67.28],[-73.31,68.07],[-76.87,68.89],[-76.23,69.15],[-78.96,70.17],[-81.31,69.74],[-88.68,70.41],[-89.51,70.76],[-88.47,71.22],[-89.89,71.22],[-90.21,72.24],[-89.44,73.13],[-88.41,73.54],[-85.83,73.8],[-86.56,73.16],[-85.77,72.53],[-84.85,73.34],[-82.32,73.75],[-80.6,72.72],[-80.75,72.06]],[[-94.5,74.13],[-92.42,74.1],[-90.51,73.86],[-94.27,72.02],[-95.41,72.06],[-96.02,73.44],[-94.5,74.13]],[[-122.85,76.12],[-119.1,77.51],[-116.2,77.65],[-116.34,76.88],[-117.11,76.53],[-121.5,75.9],[-122.85,76.12]],[[-133.18,54.17],[-131.75,54.12],[-132.05,52.98],[-131.18,52.18],[-133.05,53.41],[-133.18,54.17]],[[-105.49,79.3],[-100.83,78.8],[-99.67,77.91],[-105.18,78.38],[-104.21,78.68],[-105.42,78.92],[-105.49,79.3]],[[-123.51,48.51],[-125.66,48.83],[-127.03,49.81],[-128.06,49.99],[-128.36,50.77],[-125.76,50.3],[-123.51,48.51]],[[-124.92,74.29],[-117.56,74.19],[-115.51,73.48],[-119.22,72.52],[-120.46,71.82],[-120.46,71.38],[-123.09,70.9],[-125.93,71.87],[-123.94,73.68],[-124.92,74.29]],[[-107.82,75.85],[-105.88,75.97],[-105.7,75.48],[-106.31,75.01],[-112.22,74.42],[-113.74,74.39],[-113.87,74.72],[-111.79,75.16],[-117.71,75.22],[-115.4,76.48],[-109.07,75.47],[-110.5,76.43],[-109.58,76.79],[-108.55,76.68],[-107.82,75.85]],[[-108.4,73.09],[-105.4,72.67],[-104.46,70.99],[-100.98,70.02],[-101.09,69.58],[-102.73,69.5],[-102.09,69.12],[-102.43,68.75],[-105.96,69.18],[-113.31,68.54],[-113.85,69.01],[-116.11,69.17],[-117.34,69.96],[-112.42,70.37],[-117.9,70.54],[-118.43,70.91],[-116.11,71.31],[-119.4,71.56],[-117.87,72.71],[-115.19,73.31],[-114.17,73.12],[-114.67,72.65],[-112.44,72.96],[-111.05,72.45],[-109.92,72.96],[-109.01,72.63],[-108.19,71.65],[-107.69,72.07],[-108.4,73.09]],[[-100.44,72.71],[-101.54,73.36],[-100.36,73.84],[-97.38,73.76],[-97.12,73.47],[-98.05,72.99],[-96.54,72.56],[-96.72,71.66],[-98.36,71.27],[-102.5,72.51],[-102.48,72.83],[-100.44,72.71]],[[-106.94,73.46],[-105.26,73.64],[-104.5,73.42],[-105.38,72.76],[-106.94,73.46]],[[-98.5,76.72],[-97.74,76.26],[-98.16,75.0],[-99.81,74.9],[-100.88,75.06],[-100.86,75.64],[-102.5,75.56],[-102.57,76.34],[-98.5,76.72]],[[-96.71,80.16],[-94.3,80.98],[-94.74,81.21],[-92.41,81.26],[-91.13,80.72],[-87.81,80.32],[-85.81,79.34],[-89.04,78.29],[-92.88,78.34],[-93.95,78.75],[-93.94,79.11],[-93.15,79.38],[-94.97,79.37],[-96.71,80.16]],[[-91.59,81.89],[-85.5,82.65],[-83.18,82.32],[-82.42,82.86],[-79.31,83.13],[-72.83,83.23],[-61.85,82.63],[-67.66,81.5],[-65.48,81.51],[-69.47,80.62],[-71.18,79.8],[-76.91,79.32],[-75.53,79.2],[-76.22,79.02],[-75.39,78.53],[-79.76,77.21],[-77.89,76.78],[-80.56,76.18],[-89.49,76.47],[-89.62,76.95],[-87.77,77.18],[-88.26,77.9],[-84.98,77.54],[-87.96,78.37],[-85.09,79.35],[-86.51,79.74],[-86.93,80.25],[-83.41,80.1],[-81.85,80.46],[-87.6,80.52],[-91.59,81.89]],[[-75.22,67.44],[-76.99,67.1],[-77.24,67.59],[-76.81,68.15],[-75.9,68.29],[-75.11,68.01],[-75.22,67.44]],[[-98.22,70.14],[-95.65,69.11],[-96.27,68.76],[-99.8,69.4],[-98.22,70.14]],[[-64.52,49.87],[-62.86,49.71],[-61.81,49.11],[-63.59,49.4],[-64.52,49.87]],[[-64.01,47.04],[-63.66,46.55],[-62.01,46.44],[-62.87,45.97],[-64.14,46.39],[-64.39,46.73],[-64.01,47.04]]]],["US",[[[-122.84,49.0],[-95.16,49.0],[-94.82,49.39],[-94.33,48.67],[-91.64,48.14],[-88.38,48.3],[-84.88,46.9],[-82.55,45.35],[-82.14,43.57],[-83.12,42.08],[-82.69,41.68],[-78.94,42.86],[-79.17,43.47],[-78.72,43.63],[-76.82,43.63],[-74.87,45.0],[-71.51,45.01],[-70.66,45.46],[-69.24,47.45],[-67.79,47.07],[-67.79,45.7],[-66.96,44.81],[-70.12,43.68],[-70.82,42.33],[-70.49,41.81],[-70.08,41.78],[-70.19,42.15],[-69.88,41.92],[-69.97,41.64],[-73.71,40.93],[-71.94,40.93],[-73.95,40.75],[-74.18,39.71],[-74.91,38.94],[-75.53,39.5],[-75.06,38.4],[-75.94,37.22],[-75.72,37.94],[-76.23,38.32],[-76.35,39.15],[-76.33,38.08],[-76.99,38.24],[-76.3,37.92],[-75.73,35.55],[-76.36,34.81],[-79.06,33.49],[-81.34,31.44],[-81.31,30.04],[-80.06,26.88],[-80.38,25.21],[-81.17,25.2],[-81.71,25.87],[-82.86,27.89],[-82.65,28.55],[-83.71,29.94],[-85.11,29.64],[-86.4,30.4],[-89.59,30.16],[-89.41,29.16],[-93.23,29.78],[-94.69,29.48],[-97.14,27.83],[-97.14,25.87],[-97.53,25.84],[-99.02,26.37],[-100.96,29.38],[-102.48,29.76],[-103.11,28.97],[-103.94,29.27],[-106.51,31.75],[-111.02,31.33],[-114.72,32.72],[-117.13,32.54],[-118.52,34.03],[-120.62,34.61],[-124.4,40.31],[-124.21,42.0],[-124.53,42.77],[-123.9,45.52],[-124.69,48.18],[-123.12,48.04],[-122.59,47.1],[-122.34,47.36],[-122.84,49.0]],[[-155.86,20.27],[-154.81,19.51],[-155.69,18.92],[-156.07,19.7],[-155.86,20.27]],[[-156.0,20.76],[-156.41,20.57],[-156.71,20.93],[-156.61,21.01],[-156.0,20.76]],[[-157.25,21.22],[-156.79,21.07],[-157.33,21.1],[-157.25,21.22]],[[-158.03,21.72],[-157.65,21.32],[-157.71,21.26],[-158.13,21.31],[-158.03,21.72]],[[-159.6,22.24],[-159.46,21.88],[-159.8,22.07],[-159.6,22.24]],[[-167.46,60.21],[-165.67,60.29],[-165.58,59.91],[-167.46,60.21]],[[-153.23,57.97],[-152.14,57.59],[-154.01,56.73],[-154.52,56.99],[-154.67,57.46],[-153.23,57.97]],[[-140.99,69.71],[-141.0,60.31],[-139.04,60.0],[-137.45,58.91],[-135.48,59.79],[-133.36,58.41],[-131.71,56.55],[-130.01,55.92],[-129.98,55.29],[-130.54,54.8],[-131.97,55.5],[-132.25,56.37],[-133.54,57.18],[-134.08,58.12],[-136.63,58.21],[-139.87,59.54],[-143.96,60.0],[-147.11,60.88],[-148.22,60.67],[-148.02,59.98],[-151.72,59.16],[-151.41,60.73],[-150.35,61.03],[-150.62,61.28],[-154.02,59.35],[-153.29,58.86],[-154.23,58.15],[-156.31,57.42],[-158.43,55.99],[-163.07,54.69],[-164.94,54.57],[-158.68,57.02],[-157.72,57.57],[-157.04,58.92],[-159.06,58.42],[-159.71,58.93],[-159.98,58.57],[-160.36,59.07],[-161.97,58.67],[-161.87,59.63],[-162.52,59.99],[-163.82,59.8],[-165.35,60.51],[-165.35,61.07],[-166.12,61.5],[-165.73,62.07],[-164.56,63.15],[-163.07,63.06],[-160.77,63.77],[-161.52,64.4],[-160.78,64.79],[-162.76,64.34],[-164.96,64.45],[-166.43,64.69],[-168.11,65.67],[-164.47,66.58],[-163.65,66.58],[-163.79,66.08],[-161.68,66.12],[-165.39,68.04],[-166.76,68.36],[-166.2,68.88],[-164.43,68.92],[-161.91,70.33],[-156.58,71.36],[-154.34,70.7],[-152.21,70.83],[-140.99,69.71]],[[-171.73,63.78],[-170.49,63.69],[-168.69,63.3],[-169.53,62.98],[-171.55,63.32],[-171.73,63.78]]]],["KZ",[[[87.36,49.21],[86.6,48.55],[85.77,48.46],[85.72,47.45],[85.16,47.0],[83.18,47.33],[82.46,45.54],[79.97,44.92],[80.87,43.18],[80.18,42.92],[80.26,42.35],[79.14,42.86],[75.64,42.88],[74.21,43.3],[73.65,43.09],[73.49,42.5],[71.19,42.7],[69.07,41.38],[68.63,40.67],[67.99,41.14],[66.71,41.17],[66.51,41.99],[66.02,41.99],[66.1,43.0],[64.9,43.73],[62.01,43.5],[61.06,44.41],[58.5,45.59],[55.93,45.0],[55.97,41.31],[55.46,41.26],[54.08,42.32],[52.5,41.78],[52.5,42.79],[51.34,43.13],[50.31,44.61],[51.28,44.51],[51.32,45.25],[53.04,45.26],[53.04,46.85],[51.19,47.05],[49.1,46.4],[48.59,46.56],[48.69,47.08],[48.06,47.74],[47.32,47.72],[46.47,48.39],[47.55,50.45],[48.58,49.87],[48.7,50.61],[50.77,51.69],[52.33,51.72],[55.72,50.62],[56.78,51.04],[58.36,51.06],[59.64,50.55],[61.34,50.8],[61.59,51.27],[59.97,51.96],[60.93,52.45],[60.74,52.72],[61.7,52.98],[60.98,53.66],[61.44,54.01],[65.18,54.35],[69.07,55.39],[70.87,55.17],[71.18,54.13],[72.22,54.38],[73.51,54.04],[73.43,53.49],[76.89,54.49],[76.53,54.18],[77.8,53.4],[80.04,50.86],[80.57,51.39],[81.95,50.81],[83.38,51.07],[85.54,49.69],[86.83,49.83],[87.36,49.21]]]],["UZ",[[[55.97,41.31],[55.93,45.0],[58.5,45.59],[61.06,44.41],[62.01,43.5],[64.9,43.73],[66.1,43.0],[66.02,41.99],[66.51,41.99],[66.71,41.17],[67.99,41.14],[68.26,40.66],[70.96,42.27],[71.26,42.17],[70.42,41.52],[73.06,40.87],[71.77,40.15],[70.6,40.22],[70.67,40.96],[69.33,40.73],[68.54,39.53],[67.7,39.58],[67.44,39.14],[68.18,38.9],[68.39,38.16],[67.83,37.14],[66.52,37.36],[66.55,37.97],[64.17,38.89],[62.37,40.05],[61.88,41.08],[60.47,41.22],[59.98,42.22],[58.63,42.75],[56.93,41.83],[57.1,41.32],[55.97,41.31]]]],["PG",[[[141.0,-2.6],[144.58,-3.86],[145.83,-4.88],[145.98,-5.47],[147.65,-6.08],[147.89,-6.61],[146.97,-6.72],[147.19,-7.39],[148.73,-9.1],[149.31,-9.07],[149.27,-9.51],[150.8,-10.29],[150.69,-10.58],[147.91,-10.13],[146.05,-8.07],[144.74,-7.63],[143.29,-8.25],[143.41,-8.98],[142.63,-9.33],[141.03,-9.12],[141.0,-2.6]],[[152.64,-3.66],[153.14,-4.5],[152.83,-4.77],[152.41,-3.79],[150.66,-2.74],[150.94,-2.5],[152.64,-3.66]],[[151.3,-5.84],[149.71,-6.32],[148.32,-5.75],[148.4,-5.44],[149.85,-5.51],[150.14,-5.0],[150.24,-5.53],[150.81,-5.46],[151.65,-4.76],[151.54,-4.17],[152.14,-4.15],[152.32,-4.87],[151.3,-5.84]],[[154.51,-5.14],[156.02,-6.54],[155.88,-6.82],[155.17,-6.54],[154.51,-5.14]]]],["ID",[[[141.0,-2.6],[141.03,-9.12],[140.14,-8.3],[137.61,-8.41],[138.67,-7.32],[137.93,-5.39],[133.66,-3.54],[132.98,-4.11],[132.75,-3.31],[131.99,-2.82],[133.78,-2.48],[133.7,-2.21],[132.23,-2.21],[130.52,-0.94],[132.38,-0.37],[133.99,-0.78],[134.42,-2.77],[135.46,-3.37],[136.29,-2.31],[137.44,-1.7],[141.0,-2.6]],[[124.97,-8.89],[125.09,-9.39],[124.44,-10.14],[123.46,-10.24],[123.98,-9.29],[124.97,-8.89]],[[134.21,-6.9],[134.11,-6.14],[134.5,-5.45],[134.72,-6.21],[134.21,-6.9]],[[117.88,4.14],[117.31,3.23],[118.05,2.29],[117.88,1.83],[119.0,0.9],[117.81,0.78],[117.52,-0.8],[116.56,-1.49],[116.15,-4.01],[116.0,-3.66],[114.86,-4.11],[114.47,-3.5],[113.26,-3.12],[112.07,-3.48],[111.7,-2.99],[110.22,-2.93],[110.07,-1.59],[109.09,-0.46],[108.95,0.42],[109.07,1.34],[109.66,2.01],[110.51,0.77],[112.86,1.5],[113.81,1.22],[114.62,1.43],[115.87,4.31],[117.88,4.14]],[[128.14,-2.84],[130.47,-3.09],[130.83,-3.86],[129.99,-3.45],[127.9,-3.39],[128.14,-2.84]],[[126.87,-3.79],[126.18,-3.61],[125.99,-3.18],[127.0,-3.13],[127.25,-3.46],[126.87,-3.79]],[[127.93,2.17],[128.0,1.63],[128.59,1.54],[128.69,1.13],[128.64,0.26],[128.12,0.36],[127.97,-0.25],[128.38,-0.78],[128.1,-0.9],[127.4,1.01],[127.93,2.17]],[[122.93,0.88],[125.24,1.42],[124.44,0.43],[123.69,0.24],[120.18,0.24],[120.04,-0.52],[120.94,-1.41],[121.48,-0.96],[123.34,-0.62],[123.26,-1.08],[122.82,-0.93],[121.51,-1.9],[122.45,-3.19],[122.27,-3.53],[123.17,-4.68],[123.16,-5.34],[122.63,-5.63],[122.24,-5.28],[122.72,-4.46],[121.74,-4.85],[121.49,-4.57],[121.62,-4.19],[120.9,-3.6],[120.97,-2.63],[120.31,-2.93],[120.43,-5.53],[119.8,-5.67],[119.37,-5.38],[119.5,-3.49],[119.08,-3.49],[118.77,-2.8],[119.83,0.15],[120.89,1.31],[122.93,0.88]],[[120.3,-10.26],[118.97,-9.56],[119.9,-9.36],[120.78,-9.97],[120.3,-10.26]],[[120.72,-8.24],[122.01,-8.46],[122.9,-8.09],[122.76,-8.65],[119.92,-8.81],[119.92,-8.44],[120.72,-8.24]],[[117.9,-8.1],[118.88,-8.28],[119.13,-8.71],[116.74,-9.03],[117.9,-8.1]],[[108.49,-6.42],[108.62,-6.78],[110.54,-6.88],[110.76,-6.47],[112.61,-6.95],[112.98,-7.59],[115.71,-8.37],[114.56,-8.75],[108.28,-7.77],[105.37,-6.85],[106.05,-5.9],[108.49,-6.42]],[[104.37,-1.08],[104.89,-2.34],[105.62,-2.43],[106.11,-3.06],[105.82,-5.85],[104.71,-5.87],[102.58,-4.22],[99.26,0.18],[98.6,1.82],[95.38,4.97],[95.29,5.48],[97.48,5.25],[100.64,2.1],[101.66,2.08],[102.5,1.4],[103.84,0.1],[103.44,-0.71],[104.37,-1.08]]]],["AR",[[[-68.63,-52.64],[-67.75,-53.85],[-65.05,-54.7],[-65.5,-55.2],[-66.45,-55.25],[-66.96,-54.9],[-68.63,-54.87],[-68.63,-52.64]],[[-57.63,-30.22],[-58.5,-34.43],[-57.23,-35.29],[-57.36,-35.98],[-56.74,-36.41],[-56.79,-36.9],[-57.75,-38.18],[-59.23,-38.72],[-62.34,-38.83],[-62.15,-40.68],[-62.75,-41.03],[-65.12,-41.06],[-64.98,-42.06],[-64.3,-42.36],[-63.76,-42.04],[-63.46,-42.56],[-65.18,-43.5],[-65.57,-45.04],[-66.51,-45.04],[-67.29,-45.55],[-67.58,-46.3],[-65.64,-47.24],[-65.99,-48.13],[-67.17,-48.7],[-67.82,-49.87],[-69.14,-50.73],[-68.82,-51.77],[-68.15,-52.35],[-71.91,-52.01],[-72.31,-50.68],[-73.33,-50.38],[-73.42,-49.32],[-72.33,-48.24],[-71.66,-44.97],[-71.22,-44.78],[-71.79,-44.21],[-71.46,-43.79],[-72.15,-42.25],[-71.75,-42.05],[-71.92,-40.83],[-71.41,-38.92],[-70.81,-38.55],[-71.12,-36.66],[-70.36,-36.01],[-70.39,-35.17],[-69.82,-34.19],[-70.54,-31.37],[-69.92,-30.34],[-69.66,-28.46],[-68.3,-26.9],[-68.59,-26.51],[-68.42,-24.52],[-67.33,-24.03],[-67.11,-22.74],[-66.27,-21.83],[-64.96,-22.08],[-64.38,-22.8],[-63.99,-21.99],[-62.85,-22.03],[-60.85,-23.88],[-57.78,-25.16],[-57.63,-25.6],[-58.62,-27.12],[-55.7,-27.39],[-54.13,-25.55],[-53.63,-26.12],[-53.65,-26.92],[-57.63,-30.22]]]],["CL",[[[-68.63,-52.64],[-68.63,-54.87],[-66.96,-54.9],[-68.15,-55.61],[-71.01,-55.05],[-74.66,-52.84],[-71.11,-54.07],[-70.27,-52.93],[-68.63,-52.64]],[[-69.59,-17.58],[-68.44,-19.41],[-68.76,-20.37],[-67.83,-22.87],[-66.99,-22.99],[-67.33,-24.03],[-68.42,-24.52],[-68.59,-26.51],[-68.3,-26.9],[-69.66,-28.46],[-69.92,-30.34],[-70.54,-31.37],[-69.82,-34.19],[-70.39,-35.17],[-70.36,-36.01],[-71.12,-36.66],[-70.81,-38.55],[-71.41,-38.92],[-71.92,-40.83],[-71.75,-42.05],[-72.15,-42.25],[-71.46,-43.79],[-71.79,-44.21],[-71.22,-44.78],[-71.66,-44.97],[-72.33,-48.24],[-73.42,-49.32],[-73.33,-50.38],[-72.31,-50.68],[-71.91,-52.01],[-68.57,-52.3],[-70.85,-52.9],[-71.01,-53.83],[-71.43,-53.86],[-74.95,-52.26],[-75.61,-48.67],[-75.18,-47.71],[-74.13,-46.94],[-75.64,-46.65],[-74.69,-45.76],[-74.35,-44.1],[-73.24,-44.45],[-72.72,-42.38],[-73.39,-42.12],[-73.7,-43.37],[-74.33,-43.22],[-73.22,-39.26],[-73.59,-37.16],[-73.17,-37.12],[-71.44,-32.42],[-71.49,-28.86],[-70.91,-27.64],[-70.09,-21.39],[-70.37,-18.35],[-69.59,-17.58]]]],["CD",[[[29.02,-2.84],[29.62,-6.52],[30.74,-8.34],[28.73,-8.53],[28.37,-11.79],[29.62,-12.18],[29.7,-13.26],[28.93,-13.25],[27.16,-11.61],[26.55,-11.92],[24.31,-11.26],[24.26,-10.95],[22.16,-11.08],[21.73,-7.29],[20.51,-7.3],[20.6,-6.94],[20.09,-6.94],[19.42,-7.16],[19.02,-7.99],[17.47,-8.07],[16.33,-5.88],[12.32,-6.1],[12.18,-5.79],[12.63,-4.99],[13.6,-4.5],[14.58,-4.97],[16.01,-3.54],[16.41,-1.74],[17.64,-0.42],[18.54,4.2],[19.47,5.03],[22.41,4.03],[22.84,4.71],[25.65,5.26],[27.37,5.23],[28.43,4.29],[29.72,4.6],[30.83,3.51],[30.77,2.34],[31.17,2.2],[29.88,0.6],[29.02,-2.84]]]],["SO",[[[41.59,-1.68],[40.99,-0.86],[40.98,2.78],[42.13,4.23],[43.66,4.96],[44.96,5.0],[48.94,9.45],[48.95,11.41],[51.11,12.02],[50.55,9.2],[48.59,5.34],[46.56,2.86],[43.14,0.29],[41.59,-1.68]]]],["KE",[[[39.2,-4.68],[37.77,-3.68],[37.7,-3.1],[33.9,-0.95],[33.89,0.11],[35.04,1.91],[34.01,4.25],[35.3,5.51],[35.82,5.34],[36.16,4.45],[36.86,4.45],[38.12,3.6],[39.56,3.42],[40.77,4.26],[41.86,3.92],[40.98,2.78],[40.99,-0.86],[41.59,-1.68],[40.26,-2.57],[39.2,-4.68]]]],["SD",[[[24.57,8.23],[23.81,8.67],[23.46,8.95],[23.55,10.09],[22.29,12.65],[21.94,12.59],[23.02,15.68],[23.89,15.61],[23.85,20.0],[25.0,20.0],[25.0,22.0],[36.87,22.0],[37.48,18.61],[38.41,18.0],[36.85,16.96],[36.27,13.56],[34.26,10.63],[33.97,8.68],[33.72,10.33],[33.21,10.72],[33.21,12.18],[32.74,12.25],[32.07,11.97],[32.4,11.08],[31.35,9.81],[30.84,9.71],[30.0,10.29],[28.97,9.4],[26.75,9.47],[25.79,10.41],[25.07,10.27],[24.54,8.92],[23.89,8.62],[24.57,8.23]]]],["TD",[[[23.84,19.58],[23.89,15.61],[23.02,15.68],[21.94,12.59],[22.29,12.65],[22.86,11.14],[21.72,10.57],[21.0,9.48],[18.81,8.98],[18.91,8.63],[17.96,7.89],[15.28,7.42],[14.98,8.8],[13.95,9.55],[14.17,10.02],[15.47,9.98],[14.92,10.89],[14.6,13.33],[13.95,13.35],[13.54,14.37],[13.97,15.68],[15.25,16.63],[15.9,20.39],[15.1,21.31],[14.85,22.86],[15.86,23.41],[23.84,19.58]]]],["HT",[[[-71.71,19.71],[-71.71,18.04],[-74.46,18.34],[-74.37,18.66],[-72.33,18.67],[-72.78,19.48],[-73.42,19.64],[-73.19,19.92],[-71.71,19.71]]]],["DO",[[[-71.4,17.6],[-71.95,18.62],[-71.59,19.88],[-69.95,19.65],[-68.32,18.61],[-68.69,18.21],[-70.67,18.43],[-71.4,17.6]]]],["RU",[[[178.73,71.1],[180.0,71.52],[180.0,70.83],[178.9,70.78],[178.73,71.1]],[[49.1,46.4],[46.68,44.61],[48.58,41.81],[47.82,41.15],[45.47,42.5],[39.96,43.43],[36.68,45.24],[38.23,46.24],[37.67,46.64],[39.15,47.04],[38.22,47.1],[38.26,47.55],[39.74,47.9],[40.07,49.6],[35.36,50.58],[35.02,51.21],[34.22,51.26],[34.39,51.77],[33.75,52.34],[31.79,52.1],[31.31,53.07],[32.69,53.35],[30.76,54.81],[30.87,55.55],[28.18,56.17],[27.77,57.24],[27.29,57.47],[27.72,57.79],[27.42,58.72],[29.12,60.03],[28.07,60.5],[31.52,62.87],[30.04,63.55],[30.44,64.2],[29.54,64.95],[30.22,65.81],[29.05,66.94],[29.98,67.7],[28.45,68.36],[28.59,69.06],[32.13,69.91],[33.78,69.3],[36.51,69.06],[41.06,67.46],[41.13,66.79],[38.38,66.0],[33.18,66.63],[34.81,65.9],[34.94,64.41],[37.01,63.85],[37.14,64.33],[36.54,64.76],[37.18,65.14],[39.59,64.52],[40.44,64.76],[39.76,65.5],[42.09,66.48],[43.95,66.07],[44.53,66.76],[43.7,67.35],[44.19,67.95],[43.45,68.57],[46.25,68.25],[46.82,67.69],[45.56,67.57],[45.56,67.01],[46.35,66.67],[47.89,66.88],[48.14,67.52],[53.72,68.86],[54.47,68.81],[53.49,68.2],[54.73,68.1],[58.8,68.88],[59.94,68.28],[61.08,68.94],[60.03,69.52],[60.55,69.85],[63.5,69.55],[68.51,68.09],[69.18,68.62],[68.14,69.36],[66.93,69.45],[67.26,69.93],[66.69,71.03],[69.94,73.04],[72.59,72.78],[72.8,72.22],[71.85,71.41],[72.79,70.39],[72.56,69.02],[73.67,68.41],[71.28,66.32],[72.42,66.17],[75.05,67.76],[74.47,68.33],[74.94,68.99],[73.84,69.07],[73.6,69.63],[74.4,70.63],[73.1,71.45],[74.89,72.12],[74.66,72.83],[75.68,72.3],[75.29,71.34],[76.36,71.15],[75.9,71.87],[77.58,72.27],[79.65,72.32],[81.5,71.75],[80.61,72.58],[80.51,73.65],[86.82,73.94],[86.01,74.46],[87.17,75.12],[93.23,76.05],[96.68,75.92],[100.76,76.43],[101.99,77.29],[104.35,77.7],[106.07,77.37],[104.71,77.13],[106.97,76.97],[107.24,76.48],[111.08,76.71],[114.13,75.85],[113.89,75.33],[109.4,74.18],[113.02,73.98],[113.53,73.34],[115.57,73.75],[118.78,73.59],[119.02,73.12],[123.2,72.97],[123.26,73.74],[126.98,73.57],[128.59,73.04],[129.05,72.4],[128.46,71.98],[131.29,70.79],[132.25,71.84],[133.86,71.39],[139.87,71.49],[139.15,72.42],[140.47,72.85],[149.5,72.2],[152.97,70.84],[159.0,70.87],[159.83,70.45],[159.71,69.72],[160.94,69.44],[167.84,69.58],[169.58,68.69],[170.82,69.01],[170.01,69.65],[170.45,70.1],[175.72,69.88],[180.0,68.96],[180.0,64.98],[177.41,64.61],[179.37,62.98],[179.23,62.3],[177.36,62.52],[173.68,61.65],[170.33,59.88],[168.9,60.57],[166.29,59.79],[165.84,60.16],[164.88,59.73],[163.54,59.87],[162.02,58.24],[162.05,57.84],[163.19,57.62],[163.06,56.16],[162.13,56.12],[161.7,55.29],[162.12,54.86],[160.37,54.34],[160.02,53.2],[158.53,52.96],[158.23,51.94],[156.79,51.01],[155.43,55.38],[155.91,56.77],[156.76,57.36],[156.81,57.83],[158.36,58.06],[163.67,61.14],[164.47,62.55],[163.26,62.47],[162.66,61.64],[160.12,60.54],[159.3,61.77],[156.72,61.43],[154.22,59.76],[155.04,59.14],[151.27,58.78],[151.34,59.5],[149.78,59.66],[148.54,59.16],[142.2,59.04],[135.13,54.73],[136.7,54.6],[137.19,53.98],[138.16,53.76],[138.8,54.25],[139.9,54.19],[141.35,53.09],[140.06,48.45],[134.87,43.4],[133.54,42.81],[132.28,43.28],[130.78,42.22],[130.63,42.9],[131.14,42.93],[131.29,44.11],[131.03,44.97],[131.88,45.32],[133.1,45.14],[135.03,48.48],[130.99,47.79],[130.58,48.73],[129.4,49.44],[127.66,49.76],[125.95,52.79],[123.57,53.46],[121.0,53.25],[120.18,52.75],[120.73,52.52],[120.74,51.96],[119.28,50.58],[119.29,50.14],[117.88,49.51],[114.36,50.25],[110.66,49.13],[108.48,49.28],[106.89,50.27],[103.68,50.09],[102.26,50.51],[102.07,51.26],[98.86,52.05],[97.83,51.01],[98.23,50.42],[97.26,49.73],[92.23,50.8],[87.36,49.21],[86.83,49.83],[85.54,49.69],[83.38,51.07],[81.95,50.81],[80.57,51.39],[80.04,50.86],[77.8,53.4],[76.53,54.18],[76.89,54.49],[73.43,53.49],[73.51,54.04],[72.22,54.38],[71.18,54.13],[70.87,55.17],[69.07,55.39],[65.18,54.35],[61.44,54.01],[60.98,53.66],[61.7,52.98],[60.74,52.72],[60.93,52.45],[59.97,51.96],[61.59,51.27],[61.34,50.8],[59.64,50.55],[58.36,51.06],[56.78,51.04],[55.72,50.62],[52.33,51.72],[50.77,51.69],[48.7,50.61],[48.58,49.87],[47.55,50.45],[46.47,48.39],[47.32,47.72],[48.06,47.74],[48.69,47.08],[48.59,46.56],[49.1,46.4]],[[91.18,80.34],[95.94,81.25],[100.19,79.78],[99.94,78.88],[97.76,78.76],[93.31,79.43],[92.55,80.14],[91.18,80.34]],[[101.26,79.23],[105.37,78.71],[105.08,78.31],[99.44,77.92],[101.26,79.23]],[[137.51,75.95],[141.47,76.09],[145.09,75.56],[144.3,74.82],[138.96,74.61],[136.97,75.26],[137.51,75.95]],[[146.36,75.5],[150.73,75.08],[149.58,74.69],[146.12,75.17],[146.36,75.5]],[[139.86,73.37],[142.06,73.86],[143.6,73.21],[142.09,73.21],[139.86,73.37]],[[44.85,80.59],[48.32,80.78],[48.52,80.51],[50.04,80.92],[51.52,80.7],[47.59,80.01],[46.5,80.25],[47.07,80.56],[44.85,80.59]],[[22.73,54.33],[20.89,54.31],[19.66,54.43],[19.89,54.87],[21.27,55.19],[22.76,54.86],[22.73,54.33]],[[53.51,73.75],[55.9,74.63],[55.63,75.08],[61.17,76.25],[68.16,76.94],[68.85,76.54],[61.58,75.26],[58.48,74.31],[55.42,72.37],[55.62,71.54],[57.54,70.72],[53.68,70.76],[53.41,71.21],[51.6,71.47],[51.46,72.01],[52.48,72.23],[52.44,72.77],[54.43,73.63],[53.51,73.75]],[[142.65,54.37],[143.24,51.76],[144.65,48.98],[143.17,49.31],[142.56,47.86],[143.53,46.84],[143.51,46.14],[142.75,46.74],[142.09,45.97],[142.18,50.95],[141.59,51.94],[141.68,53.3],[142.61,53.76],[142.21,54.23],[142.65,54.37]],[[-174.93,67.21],[-175.01,66.58],[-174.34,66.34],[-174.57,67.06],[-171.86,66.91],[-169.9,65.98],[-172.53,65.44],[-172.56,64.46],[-172.96,64.25],[-175.98,64.92],[-176.21,65.36],[-178.36,65.39],[-178.9,65.74],[-178.69,66.11],[-179.88,65.87],[-179.43,65.4],[-180.0,64.98],[-180.0,68.96],[-174.93,67.21]],[[-177.58,71.27],[-180.0,70.83],[-180.0,71.52],[-177.58,71.27]],[[32.45,45.33],[33.7,46.22],[35.51,45.41],[36.53,45.47],[33.88,44.36],[33.33,44.56],[33.55,45.03],[32.45,45.33]]]],["BS",[[[-78.98,26.79],[-77.85,26.84],[-77.82,26.58],[-78.91,26.42],[-78.98,26.79]],[[-77.79,27.04],[-77.0,26.59],[-77.17,25.88],[-77.34,26.53],[-77.79,27.04]],[[-78.41,24.58],[-77.89,25.17],[-77.53,23.76],[-78.41,24.58]]]],["FK",[[[-61.2,-51.85],[-58.55,-51.1],[-57.75,-51.55],[-59.4,-52.2],[-59.85,-51.85],[-60.7,-52.3],[-61.2,-51.85]]]],["GL",[[[-46.76,82.63],[-38.62,83.55],[-27.1,83.52],[-20.85,82.73],[-22.69,82.34],[-31.9,82.2],[-24.84,81.79],[-22.9,82.09],[-22.07,81.73],[-23.17,81.15],[-15.77,81.91],[-12.77,81.72],[-12.21,81.29],[-16.85,80.35],[-20.05,80.18],[-17.73,80.13],[-19.7,78.75],[-19.67,77.64],[-18.47,76.99],[-21.68,76.63],[-19.83,76.1],[-19.6,75.25],[-20.67,75.16],[-19.37,74.3],[-21.59,74.22],[-20.43,73.82],[-20.76,73.46],[-23.57,73.31],[-22.31,72.63],[-22.3,72.18],[-24.28,72.6],[-24.79,72.33],[-22.13,71.47],[-21.75,70.66],[-23.54,70.47],[-25.54,71.43],[-25.2,70.75],[-26.36,70.23],[-22.35,70.13],[-27.75,68.47],[-31.78,68.12],[-34.2,66.68],[-39.81,65.46],[-40.67,64.84],[-41.19,63.48],[-42.82,62.68],[-42.42,61.9],[-43.38,60.1],[-44.79,60.04],[-46.26,60.85],[-48.26,60.86],[-51.63,63.63],[-52.28,65.18],[-53.66,66.1],[-53.3,66.84],[-53.97,67.19],[-52.98,68.36],[-51.48,68.73],[-50.87,69.93],[-53.46,69.28],[-54.68,69.61],[-54.36,70.82],[-51.39,70.57],[-54.0,71.55],[-55.83,71.65],[-54.72,72.59],[-57.32,74.71],[-58.6,75.1],[-58.59,75.52],[-61.27,76.1],[-68.5,76.06],[-71.4,77.01],[-66.76,77.38],[-73.3,78.04],[-73.16,78.43],[-65.71,79.39],[-65.32,79.76],[-68.02,80.12],[-62.23,81.32],[-62.65,81.77],[-57.21,82.19],[-53.04,81.89],[-50.39,82.44],[-44.52,81.66],[-46.9,82.2],[-46.76,82.63]]]],["TF",[[[68.94,-48.63],[70.53,-49.07],[70.56,-49.26],[70.28,-49.71],[68.75,-49.78],[68.94,-48.63]]]],["TL",[[[124.97,-8.89],[125.95,-8.43],[127.34,-8.4],[125.09,-9.39],[124.97,-8.89]]]],["ZA",[[[16.34,-28.58],[16.82,-28.08],[17.39,-28.78],[18.46,-29.05],[19.89,-28.46],[19.9,-24.77],[20.76,-25.87],[20.89,-26.83],[21.61,-26.73],[23.31,-25.27],[24.21,-25.67],[25.66,-25.49],[27.12,-23.57],[29.43,-22.09],[31.19,-22.25],[31.93,-24.37],[31.84,-25.84],[31.04,-25.73],[30.69,-26.74],[31.28,-27.29],[32.83,-26.74],[32.2,-28.75],[28.22,-32.77],[25.78,-33.94],[22.57,-33.86],[20.07,-34.8],[18.38,-34.14],[17.93,-32.61],[18.22,-31.66],[16.34,-28.58]]]],["LS",[[[28.07,-28.85],[29.33,-29.26],[28.11,-30.55],[27.75,-30.65],[27.0,-29.88],[28.07,-28.85]]]],["MX",[[[-117.13,32.54],[-114.72,32.72],[-111.02,31.33],[-106.51,31.75],[-103.94,29.27],[-103.11,28.97],[-102.48,29.76],[-101.66,29.78],[-99.52,27.54],[-99.02,26.37],[-97.14,25.87],[-97.87,22.44],[-97.19,20.64],[-95.9,18.83],[-94.43,18.14],[-91.41,18.88],[-90.77,19.28],[-90.28,21.0],[-87.05,21.54],[-86.85,20.85],[-87.62,19.65],[-87.84,18.26],[-88.49,18.49],[-88.85,17.88],[-91.0,17.82],[-91.0,17.25],[-91.45,17.25],[-90.46,16.07],[-91.75,16.07],[-92.23,14.54],[-93.88,15.94],[-94.69,16.2],[-96.56,15.65],[-103.5,18.29],[-105.49,19.95],[-105.73,20.43],[-105.4,20.53],[-105.27,21.42],[-106.03,22.77],[-109.26,25.58],[-109.29,26.44],[-110.39,27.16],[-110.64,27.86],[-112.23,28.95],[-113.15,31.17],[-114.78,31.8],[-114.94,31.39],[-114.67,30.16],[-111.62,26.66],[-110.66,24.3],[-110.17,24.27],[-109.41,23.36],[-109.85,22.82],[-112.18,24.74],[-112.3,26.01],[-115.06,27.72],[-114.57,27.74],[-114.16,28.57],[-115.52,29.56],[-117.13,32.54]]]],["UY",[[[-57.63,-30.22],[-56.98,-30.11],[-53.79,-32.05],[-53.21,-32.73],[-53.81,-34.4],[-54.94,-34.95],[-56.22,-34.86],[-57.82,-34.46],[-58.43,-33.91],[-57.63,-30.22]]]],["BR",[[[-53.37,-33.77],[-53.65,-33.2],[-53.21,-32.73],[-53.79,-32.05],[-56.98,-30.11],[-57.63,-30.22],[-53.65,-26.92],[-53.63,-26.12],[-54.13,-25.55],[-54.63,-25.74],[-54.29,-24.02],[-55.4,-23.96],[-55.8,-22.36],[-57.94,-22.09],[-58.17,-20.18],[-57.5,-18.17],[-58.28,-17.27],[-58.24,-16.3],[-60.16,-16.26],[-60.5,-13.78],[-64.32,-12.46],[-65.4,-11.57],[-65.34,-9.76],[-66.65,-9.93],[-68.27,-11.01],[-70.55,-11.01],[-70.48,-9.49],[-71.3,-10.08],[-72.18,-10.05],[-72.56,-9.52],[-73.23,-9.46],[-73.02,-9.03],[-73.99,-7.52],[-73.12,-6.63],[-72.89,-5.27],[-70.79,-4.25],[-69.89,-4.3],[-69.42,-1.12],[-70.02,0.54],[-69.25,0.6],[-69.22,0.99],[-69.8,1.09],[-69.82,1.71],[-67.87,1.69],[-67.54,2.04],[-67.07,1.13],[-65.55,0.79],[-63.37,2.2],[-64.27,2.5],[-64.37,3.8],[-64.82,4.06],[-63.09,3.77],[-60.97,4.54],[-60.73,5.2],[-59.98,5.01],[-60.11,4.57],[-59.54,3.96],[-59.97,2.76],[-59.03,1.32],[-57.34,1.95],[-56.0,1.82],[-55.97,2.51],[-52.94,2.12],[-51.32,4.2],[-50.51,1.9],[-49.97,1.74],[-49.95,1.05],[-50.7,0.22],[-50.39,-0.08],[-48.62,-0.24],[-48.58,-1.24],[-47.82,-0.58],[-44.91,-1.55],[-44.42,-2.14],[-44.58,-2.69],[-43.42,-2.38],[-39.98,-2.87],[-37.22,-4.82],[-35.6,-5.15],[-34.73,-7.34],[-35.13,-9.0],[-38.67,-13.06],[-39.27,-17.87],[-40.94,-21.94],[-41.75,-22.37],[-41.99,-22.97],[-44.65,-23.35],[-47.65,-24.89],[-48.5,-25.88],[-48.89,-28.67],[-53.37,-33.77]]]],["BO",[[[-69.53,-10.95],[-68.27,-11.01],[-66.65,-9.93],[-65.34,-9.76],[-65.4,-11.57],[-64.32,-12.46],[-60.5,-13.78],[-60.16,-16.26],[-58.24,-16.3],[-58.28,-17.27],[-57.5,-18.17],[-57.85,-19.97],[-58.17,-20.18],[-59.12,-19.36],[-61.79,-19.63],[-62.69,-22.25],[-63.99,-21.99],[-64.38,-22.8],[-64.96,-22.08],[-66.27,-21.83],[-67.11,-22.74],[-67.83,-22.87],[-68.76,-20.37],[-68.44,-19.41],[-69.59,-17.58],[-68.96,-16.5],[-69.34,-14.95],[-68.67,-12.56],[-69.53,-10.95]]]],["PE",[[[-69.89,-4.3],[-70.79,-4.25],[-72.89,-5.27],[-73.12,-6.63],[-73.99,-7.52],[-73.02,-9.03],[-73.23,-9.46],[-72.56,-9.52],[-72.18,-10.05],[-71.3,-10.08],[-70.48,-9.49],[-70.55,-11.01],[-69.53,-10.95],[-68.67,-12.56],[-69.34,-14.95],[-68.96,-16.5],[-70.37,-18.35],[-76.01,-14.65],[-76.26,-13.54],[-79.76,-7.19],[-81.25,-6.14],[-80.93,-5.69],[-81.41,-4.74],[-80.3,-3.4],[-80.44,-4.43],[-79.62,-4.45],[-79.21,-4.96],[-78.64,-4.55],[-77.84,-3.0],[-76.64,-2.61],[-75.54,-1.56],[-75.11,-0.06],[-73.66,-1.26],[-73.07,-2.31],[-70.81,-2.26],[-70.05,-2.73],[-70.69,-3.74],[-69.89,-4.3]]]],["CO",[[[-66.88,1.25],[-67.54,2.04],[-67.87,1.69],[-69.82,1.71],[-69.8,1.09],[-69.22,0.99],[-69.25,0.6],[-70.02,0.54],[-69.42,-1.12],[-69.89,-4.3],[-70.69,-3.74],[-70.05,-2.73],[-70.81,-2.26],[-73.07,-2.31],[-73.66,-1.26],[-75.11,-0.06],[-77.42,0.4],[-78.99,1.69],[-77.13,3.85],[-77.5,4.09],[-77.32,5.85],[-77.88,7.22],[-77.24,7.94],[-77.47,8.52],[-75.67,9.44],[-75.48,10.62],[-74.91,11.08],[-73.41,11.23],[-71.4,12.38],[-71.33,11.78],[-71.97,11.61],[-72.91,10.45],[-73.3,9.15],[-72.79,9.09],[-72.44,7.42],[-71.96,6.99],[-70.09,6.96],[-69.39,6.1],[-67.34,6.1],[-67.82,4.5],[-67.3,3.32],[-67.81,2.82],[-66.88,1.25]]]],["PA",[[[-77.35,8.67],[-77.24,7.94],[-77.88,7.22],[-78.43,8.05],[-78.18,8.32],[-79.12,9.0],[-80.38,8.3],[-80.0,7.55],[-80.89,7.22],[-81.06,7.82],[-81.52,7.71],[-81.72,8.11],[-82.85,8.07],[-82.93,9.48],[-81.44,8.79],[-79.02,9.55],[-77.35,8.67]]]],["CR",[[[-82.55,9.57],[-82.93,9.48],[-82.97,8.23],[-84.98,10.09],[-85.11,9.56],[-85.66,9.93],[-85.94,10.9],[-85.56,11.22],[-83.66,10.94],[-82.55,9.57]]]],["NI",[[[-83.66,10.94],[-85.71,11.09],[-87.67,12.91],[-86.73,13.26],[-86.76,13.75],[-85.8,13.84],[-84.92,14.79],[-83.15,15.0],[-83.66,10.94]]]],["HN",[[[-83.15,15.0],[-84.92,14.79],[-85.8,13.84],[-86.76,13.75],[-86.73,13.26],[-87.32,12.98],[-87.86,13.89],[-88.5,13.85],[-89.35,14.42],[-89.15,15.07],[-87.9,15.86],[-84.98,16.0],[-83.15,15.0]]]],["SV",[[[-89.35,14.42],[-87.72,13.79],[-87.9,13.15],[-90.1,13.74],[-89.35,14.42]]]],["GT",[[[-92.23,14.54],[-91.75,16.07],[-90.46,16.07],[-91.45,17.25],[-91.0,17.25],[-91.0,17.82],[-89.14,17.81],[-89.23,15.89],[-88.23,15.73],[-89.15,15.07],[-89.35,14.42],[-90.1,13.74],[-92.23,14.54]]]],["BZ",[[[-89.14,17.81],[-88.49,18.49],[-88.11,18.35],[-88.36,16.53],[-88.93,15.89],[-89.23,15.89],[-89.14,17.81]]]],["VE",[[[-60.73,5.2],[-60.97,4.54],[-63.09,3.77],[-64.82,4.06],[-64.37,3.8],[-64.27,2.5],[-63.37,2.2],[-65.55,0.79],[-66.33,0.72],[-67.81,2.82],[-67.3,3.32],[-67.82,4.5],[-67.34,6.1],[-69.39,6.1],[-70.09,6.96],[-71.96,6.99],[-72.44,7.42],[-72.79,9.09],[-73.3,9.15],[-72.91,10.45],[-71.97,11.61],[-71.33,11.78],[-71.95,11.42],[-71.63,10.45],[-72.07,9.87],[-71.7,9.07],[-71.26,9.14],[-71.04,9.86],[-71.4,10.97],[-70.16,11.38],[-69.94,12.16],[-69.58,11.46],[-68.88,11.44],[-68.19,10.55],[-66.23,10.65],[-64.89,10.08],[-64.32,10.64],[-61.88,10.72],[-62.73,10.42],[-60.83,9.38],[-60.67,8.58],[-59.76,8.37],[-60.55,7.78],[-60.3,7.04],[-61.16,6.7],[-61.41,5.96],[-60.73,5.2]]]],["GY",[[[-56.54,1.9],[-57.34,1.95],[-58.54,1.27],[-59.65,1.79],[-59.97,2.76],[-59.54,3.96],[-60.11,4.57],[-59.98,5.01],[-61.41,5.96],[-61.16,6.7],[-60.3,7.04],[-60.55,7.78],[-59.76,8.37],[-57.15,5.97],[-58.04,4.06],[-56.54,1.9]]]],["SR",[[[-54.52,2.31],[-55.97,2.51],[-56.0,1.82],[-56.54,1.9],[-57.6,3.33],[-58.04,4.06],[-57.15,5.97],[-53.96,5.76],[-54.48,4.9],[-54.01,3.62],[-54.52,2.31]]]],["EC",[[[-75.37,-0.15],[-75.54,-1.56],[-76.64,-2.61],[-77.84,-3.0],[-78.64,-4.55],[-79.21,-4.96],[-79.62,-4.45],[-80.44,-4.43],[-79.77,-2.66],[-79.99,-2.22],[-80.37,-2.69],[-80.97,-2.25],[-80.93,-1.06],[-80.09,0.77],[-78.86,1.38],[-77.42,0.4],[-76.29,0.42],[-75.37,-0.15]]]],["PR",[[[-67.1,18.52],[-65.59,18.23],[-67.18,17.95],[-67.1,18.52]]]],["JM",[[[-78.34,18.23],[-76.9,18.4],[-76.2,17.89],[-77.21,17.7],[-78.34,18.23]]]],["CU",[[[-83.78,22.79],[-80.62,23.11],[-79.28,22.4],[-78.35,22.51],[-76.52,21.21],[-75.6,21.02],[-75.67,20.74],[-74.18,20.28],[-74.96,19.92],[-77.76,19.86],[-77.09,20.41],[-78.14,20.74],[-78.72,21.6],[-82.17,22.39],[-81.8,22.64],[-82.78,22.69],[-84.05,21.91],[-84.97,21.9],[-83.78,22.79]]]],["ZW",[[[31.19,-22.25],[28.02,-21.49],[27.72,-20.5],[26.16,-19.29],[25.26,-17.74],[27.04,-17.94],[28.95,-16.04],[30.27,-15.51],[30.34,-15.88],[31.17,-15.86],[32.85,-16.71],[32.66,-20.3],[31.19,-22.25]]]],["BW",[[[29.43,-22.09],[27.12,-23.57],[25.66,-25.49],[24.21,-25.67],[23.31,-25.27],[21.61,-26.73],[20.89,-26.83],[20.76,-25.87],[19.9,-24.77],[19.9,-21.85],[20.88,-21.81],[20.91,-18.25],[23.2,-17.87],[23.58,-18.28],[25.26,-17.74],[26.16,-19.29],[27.72,-20.5],[28.02,-21.49],[29.43,-22.09]]]],["NA",[[[19.9,-21.85],[19.89,-28.46],[18.46,-29.05],[17.39,-28.78],[16.82,-28.08],[16.34,-28.58],[15.21,-27.09],[14.26,-22.11],[11.79,-18.07],[11.73,-17.3],[13.46,-16.97],[14.06,-17.42],[18.26,-17.31],[18.96,-17.79],[21.38,-17.93],[24.03,-17.3],[25.08,-17.58],[23.58,-18.28],[23.2,-17.87],[20.91,-18.25],[20.88,-21.81],[19.9,-21.85]]]],["SN",[[[-16.71,13.59],[-17.63,14.73],[-16.12,16.46],[-14.58,16.6],[-13.44,16.04],[-12.17,14.62],[-11.51,12.44],[-16.68,12.38],[-16.84,13.15],[-13.84,13.51],[-15.08,13.88],[-16.71,13.59]]]],["ML",[[[-11.46,12.08],[-12.17,14.62],[-11.67,15.39],[-10.65,15.13],[-9.55,15.49],[-5.54,15.5],[-5.32,16.2],[-6.45,24.96],[-4.92,24.97],[3.15,19.69],[3.16,19.06],[4.27,19.16],[4.27,16.85],[3.64,15.57],[1.39,15.32],[1.02,14.97],[-1.07,14.97],[-3.1,13.54],[-4.01,13.47],[-5.22,11.71],[-5.4,10.37],[-8.03,10.21],[-9.13,12.31],[-10.17,11.84],[-11.46,12.08]]]],["MR",[[[-17.06,21.0],[-16.85,21.33],[-12.93,21.33],[-12.87,23.28],[-11.94,23.37],[-11.97,25.93],[-8.69,25.88],[-8.68,27.4],[-4.92,24.97],[-6.45,24.96],[-5.32,16.2],[-5.54,15.5],[-9.55,15.49],[-10.65,15.13],[-11.67,15.39],[-12.17,14.62],[-13.44,16.04],[-14.58,16.6],[-16.46,16.14],[-16.28,20.09],[-17.06,21.0]]]],["BJ",[[[2.69,6.26],[1.87,6.14],[1.66,9.13],[0.77,10.47],[1.45,11.55],[2.85,12.24],[3.61,11.66],[3.8,10.73],[2.72,8.51],[2.69,6.26]]]],["NE",[[[14.85,22.86],[15.1,21.31],[15.9,20.39],[15.25,16.63],[13.97,15.68],[13.54,14.37],[13.95,13.35],[14.6,13.33],[14.18,12.48],[13.08,13.6],[12.3,13.04],[10.99,13.39],[9.01,12.83],[7.8,13.34],[6.82,13.12],[5.44,13.87],[4.11,13.53],[3.61,11.66],[2.85,12.24],[2.15,11.94],[2.18,12.63],[1.02,12.85],[0.37,14.93],[3.64,15.57],[4.27,16.85],[4.27,19.16],[5.68,19.6],[12.0,23.47],[13.58,23.04],[14.14,22.49],[14.85,22.86]]]],["NG",[[[2.69,6.26],[2.72,8.51],[3.71,10.06],[3.68,12.55],[4.37,13.75],[5.44,13.87],[6.82,13.12],[7.8,13.34],[9.01,12.83],[10.99,13.39],[12.3,13.04],[13.08,13.6],[14.58,12.09],[11.75,6.98],[11.06,6.64],[10.12,7.04],[9.23,6.44],[8.5,4.77],[5.9,4.26],[4.33,6.27],[2.69,6.26]]]],["CM",[[[14.5,12.86],[15.47,9.98],[14.17,10.02],[13.95,9.55],[14.98,8.8],[15.44,7.69],[14.54,6.23],[14.48,4.73],[15.86,3.01],[15.94,1.73],[14.34,2.23],[9.65,2.28],[9.8,3.07],[8.49,4.5],[8.76,5.48],[9.23,6.44],[10.12,7.04],[11.06,6.64],[11.75,6.98],[13.57,10.8],[14.42,11.57],[14.58,12.09],[14.18,12.48],[14.5,12.86]]]],["TG",[[[0.9,11.0],[0.77,10.47],[1.66,9.13],[1.87,6.14],[1.06,5.93],[0.57,6.91],[0.37,10.19],[-0.05,10.71],[0.02,11.02],[0.9,11.0]]]],["GH",[[[0.02,11.02],[0.71,8.31],[0.57,6.91],[1.06,5.93],[-1.96,4.71],[-2.86,4.99],[-3.24,6.25],[-2.56,8.22],[-2.94,10.96],[0.02,11.02]]]],["CI",[[[-8.03,10.21],[-6.85,10.14],[-6.21,10.52],[-6.05,10.1],[-5.4,10.37],[-4.33,9.61],[-3.51,9.9],[-2.83,9.64],[-2.56,8.22],[-3.24,6.25],[-2.86,4.99],[-4.65,5.17],[-7.71,4.36],[-7.57,5.71],[-8.6,6.47],[-8.3,8.32],[-7.83,8.58],[-8.31,9.79],[-8.03,10.21]]]],["GN",[[[-13.7,12.59],[-11.51,12.44],[-11.46,12.08],[-10.17,11.84],[-9.13,12.31],[-8.03,10.21],[-8.31,9.79],[-7.83,8.58],[-8.3,8.32],[-8.28,7.69],[-9.21,7.31],[-9.76,8.54],[-10.51,8.35],[-11.12,10.05],[-12.43,9.84],[-13.25,8.9],[-15.13,11.04],[-13.74,11.81],[-13.7,12.59]]]],["GW",[[[-16.68,12.38],[-13.7,12.59],[-13.74,11.81],[-15.13,11.04],[-16.09,11.52],[-16.68,12.38]]]],["LR",[[[-8.44,7.69],[-8.6,6.47],[-7.57,5.71],[-7.71,4.36],[-9.0,4.83],[-11.44,6.79],[-10.23,8.41],[-9.76,8.54],[-9.21,7.31],[-8.44,7.69]]]],["SL",[[[-13.25,8.9],[-12.43,9.84],[-11.12,10.05],[-10.51,8.35],[-10.23,8.41],[-11.44,6.79],[-12.95,7.8],[-13.25,8.9]]]],["BF",[[[-5.4,10.37],[-5.22,11.71],[-4.28,13.23],[-3.1,13.54],[-1.07,14.97],[0.37,14.93],[1.02,12.85],[2.18,12.63],[1.94,11.64],[0.9,11.0],[-2.94,10.96],[-2.83,9.64],[-3.51,9.9],[-4.33,9.61],[-5.4,10.37]]]],["CF",[[[27.37,5.23],[24.41,5.11],[22.84,4.71],[22.41,4.03],[19.47,5.03],[18.54,4.2],[18.45,3.5],[17.13,3.73],[16.01,2.27],[15.86,3.01],[14.48,4.73],[14.46,5.45],[15.28,7.42],[17.96,7.89],[18.91,8.63],[18.81,8.98],[21.0,9.48],[21.72,10.57],[22.86,11.14],[23.55,10.09],[23.46,8.95],[25.11,7.83],[27.37,5.23]]]],["CG",[[[18.45,3.5],[17.64,-0.42],[16.41,-1.74],[16.01,-3.54],[14.58,-4.97],[14.14,-4.51],[13.26,-4.88],[12.62,-4.44],[11.91,-5.04],[11.09,-3.98],[11.86,-3.43],[11.48,-2.77],[12.5,-2.39],[12.58,-1.95],[13.11,-2.43],[13.99,-2.47],[14.43,-1.33],[13.84,0.04],[14.28,1.2],[13.28,1.31],[13.08,2.27],[15.94,1.73],[17.13,3.73],[18.45,3.5]]]],["GA",[[[11.28,2.26],[12.95,2.32],[13.28,1.31],[14.28,1.2],[13.84,0.04],[14.43,-1.33],[13.99,-2.47],[13.11,-2.43],[12.58,-1.95],[12.5,-2.39],[11.48,-2.77],[11.86,-3.43],[11.09,-3.98],[8.8,-1.11],[9.49,1.01],[11.29,1.06],[11.28,2.26]]]],["GQ",[[[9.65,2.28],[11.28,2.26],[11.29,1.06],[9.49,1.01],[9.65,2.28]]]],["ZM",[[[30.74,-8.34],[33.23,-9.68],[33.31,-12.44],[32.69,-13.71],[33.21,-13.97],[30.18,-14.8],[30.27,-15.51],[28.95,-16.04],[27.04,-17.94],[24.68,-17.35],[23.22,-17.52],[21.89,-16.08],[21.93,-12.9],[24.02,-12.91],[23.91,-10.93],[25.42,-11.33],[25.75,-11.78],[27.16,-11.61],[28.93,-13.25],[29.7,-13.26],[29.62,-12.18],[28.37,-11.79],[28.45,-9.16],[29.0,-8.41],[30.74,-8.34]]]],["MW",[[[32.76,-9.23],[33.74,-9.42],[34.28,-10.16],[34.56,-13.58],[35.69,-14.61],[35.77,-15.9],[35.03,-16.8],[34.38,-16.18],[34.46,-14.61],[32.69,-13.71],[33.31,-12.44],[33.11,-11.61],[33.49,-10.53],[32.76,-9.23]]]],["MZ",[[[34.56,-11.52],[37.47,-11.57],[40.32,-10.32],[40.78,-14.69],[39.45,-16.72],[37.41,-17.59],[34.79,-19.78],[34.7,-20.5],[35.56,-22.09],[35.46,-24.12],[33.01,-25.36],[32.57,-25.73],[32.83,-26.74],[32.07,-26.73],[31.93,-24.37],[31.19,-22.25],[32.66,-20.3],[32.85,-16.71],[31.17,-15.86],[30.34,-15.88],[30.18,-14.8],[33.21,-13.97],[34.46,-14.61],[34.38,-16.18],[35.03,-16.8],[35.77,-15.9],[35.69,-14.61],[34.56,-13.58],[34.28,-12.28],[34.56,-11.52]]]],["SZ",[[[32.07,-26.73],[31.28,-27.29],[30.69,-26.74],[31.04,-25.73],[31.84,-25.84],[32.07,-26.73]]]],["AO",[[[13.0,-4.78],[12.63,-4.99],[12.18,-5.79],[11.91,-5.04],[12.62,-4.44],[13.0,-4.78]],[[12.32,-6.1],[16.33,-5.88],[17.47,-8.07],[19.02,-7.99],[19.42,-7.16],[20.09,-6.94],[20.6,-6.94],[20.51,-7.3],[21.73,-7.29],[22.16,-11.08],[23.46,-10.87],[24.02,-11.24],[24.02,-12.91],[21.93,-12.9],[21.89,-16.08],[23.22,-17.52],[21.38,-17.93],[18.96,-17.79],[18.26,-17.31],[14.06,-17.42],[13.46,-16.97],[11.73,-17.3],[12.18,-14.45],[13.74,-11.3],[12.88,-9.17],[13.24,-8.56],[12.32,-6.1]]]],["BI",[[[30.47,-2.41],[30.75,-3.36],[29.34,-4.5],[29.02,-2.84],[30.47,-2.41]]]],["IL",[[[35.72,32.71],[35.18,32.53],[34.97,31.87],[35.23,31.75],[34.93,31.35],[35.4,31.49],[35.42,31.1],[34.92,29.5],[34.27,31.22],[35.1,33.08],[35.82,33.28],[35.72,32.71]]]],["LB",[[[35.82,33.28],[35.13,33.09],[36.0,34.64],[36.45,34.59],[36.61,34.2],[35.82,33.28]]]],["MG",[[[49.19,-12.04],[50.38,-15.71],[50.2,-16.0],[49.86,-15.41],[49.67,-15.71],[49.77,-16.88],[47.1,-24.94],[45.41,-25.6],[44.04,-24.99],[43.35,-22.78],[43.43,-21.34],[43.89,-21.16],[44.46,-19.44],[43.96,-17.41],[44.45,-16.22],[46.31,-15.78],[47.71,-14.59],[47.87,-13.66],[48.29,-13.78],[49.19,-12.04]]]],["PS",[[[35.4,31.49],[34.93,31.35],[35.18,32.53],[35.55,32.39],[35.4,31.49]]]],["GM",[[[-16.71,13.59],[-15.08,13.88],[-13.84,13.51],[-16.84,13.15],[-16.71,13.59]]]],["TN",[[[9.48,30.31],[9.06,32.1],[7.61,33.34],[7.52,34.1],[8.14,34.66],[8.42,36.95],[9.51,37.35],[10.21,37.23],[10.18,36.72],[11.03,37.09],[10.6,36.41],[10.81,34.83],[10.15,34.33],[10.34,33.79],[11.49,33.14],[11.43,32.37],[9.95,31.38],[9.97,30.54],[9.48,30.31]]]],["DZ",[[[-8.68,27.4],[-8.67,28.84],[-5.24,30.0],[-3.69,30.9],[-3.65,31.64],[-1.31,32.26],[-1.12,32.65],[-2.17,35.17],[-1.21,35.71],[1.47,36.61],[5.32,36.72],[6.26,37.11],[8.42,36.95],[8.14,34.66],[7.52,34.1],[7.61,33.34],[9.06,32.1],[9.81,29.42],[9.72,26.51],[9.32,26.09],[10.3,24.38],[10.77,24.56],[12.0,23.47],[5.68,19.6],[3.16,19.06],[3.15,19.69],[-8.68,27.4]]]],["JO",[[[34.92,29.5],[35.72,32.71],[36.83,32.31],[38.79,33.38],[39.2,32.16],[37.0,31.51],[38.0,30.51],[36.07,29.2],[34.92,29.5]]]],["AE",[[[51.58,24.25],[54.01,24.12],[56.07,26.06],[56.26,25.71],[56.4,24.92],[55.89,24.92],[55.98,24.13],[55.53,23.93],[55.01,22.5],[52.0,23.0],[51.58,24.25]]]],["QA",[[[50.81,24.75],[50.74,25.48],[51.29,26.11],[51.61,25.22],[51.39,24.63],[50.81,24.75]]]],["KW",[[[47.97,29.98],[48.42,28.55],[46.57,29.1],[47.3,30.06],[47.97,29.98]]]],["IQ",[[[39.2,32.16],[38.79,33.38],[41.01,34.42],[41.29,36.36],[42.78,37.39],[44.77,37.17],[45.42,35.98],[46.08,35.68],[46.15,35.09],[45.42,33.97],[46.11,33.02],[47.33,32.47],[47.85,31.71],[47.69,30.98],[48.57,29.93],[47.3,30.06],[46.57,29.1],[44.71,29.18],[41.89,31.19],[39.2,32.16]]]],["OM",[[[55.21,22.71],[55.53,23.93],[55.98,24.13],[55.89,24.92],[56.4,24.92],[57.4,23.88],[58.73,23.57],[59.81,22.31],[58.49,20.43],[57.83,20.24],[57.69,18.94],[56.61,18.57],[56.28,17.88],[55.66,17.88],[54.79,16.95],[53.11,16.65],[52.0,19.0],[55.0,20.0],[55.67,22.0],[55.21,22.71]],[[56.26,25.71],[56.07,26.06],[56.36,26.4],[56.49,26.31],[56.26,25.71]]]],["VU",[[[167.22,-15.89],[167.84,-16.47],[167.52,-16.6],[167.22,-15.89]],[[167.27,-15.74],[166.65,-15.39],[166.63,-14.63],[167.11,-14.93],[167.27,-15.74]]]],["KH",[[[103.5,10.63],[102.35,13.39],[102.99,14.23],[104.28,14.42],[106.04,13.88],[106.5,14.57],[107.38,14.2],[107.61,13.54],[107.49,12.34],[105.81,11.57],[106.25,10.96],[103.5,10.63]]]],["TH",[[[105.22,14.27],[102.99,14.23],[102.35,13.39],[102.58,12.19],[100.83,12.63],[100.98,13.41],[100.1,13.41],[99.22,9.24],[99.87,9.21],[100.46,7.43],[102.14,6.22],[101.15,5.69],[101.08,6.2],[100.09,6.46],[98.5,8.38],[98.34,7.79],[98.15,8.35],[99.59,11.89],[99.1,13.83],[98.19,15.12],[98.9,16.18],[97.38,18.45],[98.25,19.71],[100.12,20.42],[100.61,19.51],[101.28,19.46],[101.06,17.51],[103.2,18.31],[103.96,18.24],[104.72,17.43],[104.78,16.44],[105.59,15.57],[105.22,14.27]]]],["LA",[[[107.38,14.2],[106.5,14.57],[106.04,13.88],[105.22,14.27],[105.59,15.57],[103.96,18.24],[102.11,18.11],[101.06,17.51],[101.28,19.46],[100.61,19.51],[100.12,20.42],[101.18,21.44],[101.8,21.17],[101.65,22.32],[102.17,22.46],[103.2,20.77],[104.44,20.76],[104.82,19.89],[103.9,19.27],[105.09,18.67],[107.31,15.91],[107.38,14.2]]]],["MM",[[[100.12,20.42],[98.25,19.71],[97.38,18.45],[98.9,16.18],[98.19,15.12],[99.1,13.83],[99.59,11.89],[98.55,9.93],[98.51,13.12],[97.16,16.93],[95.37,15.71],[94.19,16.04],[94.53,17.28],[94.32,18.21],[93.66,19.73],[92.37,20.67],[92.3,21.48],[92.65,21.32],[92.67,22.04],[93.17,22.28],[93.33,24.08],[94.11,23.85],[95.12,26.57],[96.42,27.26],[97.13,27.08],[97.33,28.26],[97.91,28.34],[98.68,27.51],[98.67,25.92],[97.72,25.08],[97.6,23.9],[98.66,24.06],[98.9,23.14],[99.53,22.95],[99.24,22.12],[100.42,21.56],[101.15,21.85],[101.18,21.44],[100.12,20.42]]]],["VN",[[[104.33,10.49],[106.25,10.96],[105.81,11.57],[107.49,12.34],[107.56,15.2],[105.09,18.67],[103.9,19.27],[104.82,19.89],[104.44,20.76],[103.2,20.77],[102.17,22.46],[104.48,22.82],[105.33,23.35],[106.73,22.79],[106.57,22.22],[107.04,21.81],[108.05,21.55],[106.72,20.7],[105.66,19.06],[108.88,15.28],[109.34,13.43],[109.2,11.67],[105.16,8.6],[104.8,9.24],[105.08,9.92],[104.33,10.49]]]],["KP",[[[130.78,42.22],[130.78,42.22],[130.78,42.22],[130.78,42.22]],[[130.64,42.4],[129.67,41.6],[129.71,40.88],[127.53,39.76],[127.39,39.21],[128.35,38.61],[128.21,38.37],[125.28,37.67],[124.71,38.11],[125.39,39.39],[124.27,39.93],[125.08,40.57],[126.87,41.82],[128.21,41.47],[128.05,41.99],[129.6,42.42],[129.99,42.99],[130.64,42.4]]]],["KR",[[[126.17,37.75],[128.35,38.61],[129.46,36.78],[129.09,35.08],[126.49,34.39],[126.56,35.68],[126.12,36.73],[126.86,36.89],[126.17,37.75]]]],["MN",[[[87.75,49.3],[92.23,50.8],[97.26,49.73],[98.23,50.42],[97.83,51.01],[98.86,52.05],[102.07,51.26],[102.26,50.51],[103.68,50.09],[106.89,50.27],[108.48,49.28],[110.66,49.13],[114.36,50.25],[115.49,49.81],[116.68,49.89],[115.49,48.14],[115.74,47.73],[118.06,48.07],[119.77,47.05],[119.66,46.69],[117.42,46.67],[113.46,44.81],[111.87,45.1],[111.35,44.46],[111.83,43.74],[110.41,42.87],[104.96,41.6],[100.85,42.66],[96.35,42.73],[95.31,44.24],[93.48,44.98],[90.95,45.29],[90.59,45.72],[90.97,46.89],[90.28,47.69],[88.01,48.6],[87.75,49.3]]]],["IN",[[[97.33,28.26],[97.13,27.08],[96.42,27.26],[95.12,26.57],[94.11,23.85],[93.33,24.08],[93.17,22.28],[92.67,22.04],[92.15,23.63],[91.71,22.99],[91.16,23.5],[92.38,24.98],[89.92,25.27],[89.83,25.97],[88.56,26.45],[88.21,25.77],[88.93,25.24],[88.08,24.5],[88.7,24.23],[88.89,21.69],[86.98,21.5],[87.03,20.74],[86.5,20.15],[85.06,19.48],[82.19,17.02],[82.19,16.56],[80.32,15.9],[79.86,10.36],[79.34,10.31],[78.89,9.55],[79.19,9.22],[78.28,8.93],[77.54,7.97],[76.59,8.9],[74.86,12.74],[74.44,14.62],[73.53,15.99],[72.63,21.36],[71.18,20.76],[70.47,20.88],[69.16,22.09],[69.64,22.45],[69.35,22.84],[68.18,23.69],[68.84,24.36],[71.04,24.36],[70.17,26.49],[69.51,26.94],[70.62,27.99],[71.78,27.91],[74.42,30.98],[74.41,31.69],[75.26,32.27],[74.45,32.76],[73.75,34.32],[74.24,34.75],[76.87,34.65],[77.84,35.49],[78.91,34.32],[78.81,33.51],[79.21,32.99],[79.18,32.48],[78.46,32.62],[78.74,31.52],[81.11,30.18],[80.09,28.79],[83.3,27.36],[88.06,26.41],[88.12,27.88],[88.73,28.09],[88.84,27.1],[89.74,26.72],[92.03,26.84],[92.1,27.45],[91.7,27.77],[92.5,27.9],[94.57,29.28],[95.4,29.03],[96.12,29.45],[96.59,28.83],[96.25,28.41],[97.33,28.26]]]],["BD",[[[92.67,22.04],[92.37,20.67],[91.42,22.77],[90.5,22.81],[90.27,21.84],[89.03,22.06],[88.7,24.23],[88.08,24.5],[88.93,25.24],[88.21,25.77],[88.56,26.45],[89.83,25.97],[89.92,25.27],[92.38,24.98],[91.16,23.5],[91.71,22.99],[92.15,23.63],[92.67,22.04]]]],["BT",[[[90.02,28.3],[92.1,27.45],[92.03,26.84],[89.74,26.72],[88.84,27.1],[90.02,28.3]]]],["NP",[[[88.12,27.88],[88.06,26.41],[87.23,26.4],[83.3,27.36],[80.09,28.79],[80.48,29.73],[81.53,30.42],[85.82,28.2],[88.12,27.88]]]],["PK",[[[77.84,35.49],[76.87,34.65],[74.24,34.75],[73.75,34.32],[74.45,32.76],[75.26,32.27],[74.41,31.69],[74.42,30.98],[71.78,27.91],[70.62,27.99],[69.51,26.94],[70.17,26.49],[71.04,24.36],[68.84,24.36],[68.18,23.69],[67.44,23.94],[66.37,25.43],[61.5,25.08],[61.87,26.24],[63.32,26.76],[62.76,27.38],[62.73,28.26],[61.77,28.7],[60.87,29.83],[62.55,29.32],[66.35,29.89],[66.38,30.74],[66.94,31.3],[69.32,31.9],[69.26,32.5],[70.32,33.36],[69.93,34.02],[70.88,33.99],[71.61,35.15],[71.26,36.07],[71.85,36.51],[75.16,37.13],[75.9,36.67],[76.19,35.9],[77.84,35.49]]]],["AF",[[[65.75,37.66],[69.2,37.15],[70.81,38.49],[71.35,38.26],[71.45,37.07],[71.84,36.74],[73.26,37.5],[75.16,37.13],[71.85,36.51],[71.26,36.07],[71.61,35.15],[70.88,33.99],[69.93,34.02],[70.32,33.36],[69.26,32.5],[69.32,31.9],[66.94,31.3],[66.38,30.74],[66.35,29.89],[62.55,29.32],[60.87,29.83],[61.78,30.74],[61.7,31.38],[60.94,31.55],[60.54,32.98],[60.96,33.53],[60.53,33.68],[61.21,35.65],[62.98,35.4],[63.19,35.86],[64.55,36.31],[64.75,37.11],[65.75,37.66]]]],["TJ",[[[67.83,37.14],[68.39,38.16],[68.18,38.9],[67.44,39.14],[67.7,39.58],[68.54,39.53],[69.33,40.73],[70.67,40.96],[70.46,40.5],[71.01,40.24],[70.65,39.94],[69.56,40.1],[69.46,39.53],[73.68,39.43],[73.93,38.51],[74.86,38.38],[74.98,37.42],[73.26,37.5],[71.84,36.74],[71.45,37.07],[71.35,38.26],[70.81,38.49],[69.2,37.15],[67.83,37.14]]]],["KG",[[[70.96,42.27],[71.84,42.85],[73.49,42.5],[73.65,43.09],[74.21,43.3],[75.64,42.88],[79.14,42.86],[80.26,42.35],[78.19,41.19],[76.9,41.07],[76.53,40.43],[74.78,40.37],[73.68,39.43],[69.46,39.53],[69.56,40.1],[71.77,40.15],[73.06,40.87],[70.42,41.52],[71.26,42.17],[70.96,42.27]]]],["TM",[[[52.5,41.78],[54.08,42.32],[55.46,41.26],[57.1,41.32],[56.93,41.83],[58.63,42.75],[59.98,42.22],[60.47,41.22],[61.88,41.08],[62.37,40.05],[64.17,38.89],[66.55,37.97],[66.52,37.36],[65.75,37.66],[64.75,37.11],[64.55,36.31],[62.23,35.27],[61.21,35.65],[61.12,36.49],[57.33,38.03],[55.51,37.96],[53.92,37.2],[53.88,38.95],[53.1,39.29],[53.36,39.98],[52.69,40.03],[52.92,40.88],[53.86,40.63],[54.74,40.95],[53.72,42.12],[52.92,41.87],[52.81,41.14],[52.5,41.78]]]],["IR",[[[48.57,29.93],[47.69,30.98],[47.85,31.71],[47.33,32.47],[46.11,33.02],[45.42,33.97],[46.15,35.09],[46.08,35.68],[45.42,35.98],[44.23,37.97],[44.11,39.43],[44.79,39.71],[45.46,38.87],[46.14,38.74],[48.06,39.58],[48.36,39.29],[48.01,38.79],[48.88,38.32],[49.2,37.58],[50.84,36.87],[53.83,36.97],[55.51,37.96],[56.62,38.12],[61.12,36.49],[60.53,33.68],[60.96,33.53],[60.54,32.98],[60.94,31.55],[61.7,31.38],[61.78,30.74],[60.87,29.83],[61.77,28.7],[62.73,28.26],[62.76,27.38],[63.32,26.76],[61.87,26.24],[61.5,25.08],[57.4,25.74],[56.97,26.97],[56.49,27.14],[54.72,26.48],[53.49,26.81],[51.52,27.87],[50.12,30.15],[48.94,30.32],[48.57,29.93]]]],["SY",[[[35.72,32.71],[36.07,33.82],[36.61,34.2],[36.0,34.64],[35.91,35.41],[36.74,36.82],[39.52,36.72],[42.35,37.23],[41.29,36.36],[41.01,34.42],[36.83,32.31],[35.72,32.71]]]],["AM",[[[46.51,38.77],[46.14,38.74],[45.74,39.47],[43.66,40.25],[43.58,41.09],[44.97,41.25],[45.56,40.81],[45.36,40.56],[45.89,40.22],[45.61,39.9],[46.48,39.46],[46.51,38.77]]]],["SE",[[[11.03,58.86],[12.3,60.12],[12.63,61.29],[11.99,61.8],[11.93,63.13],[12.58,64.07],[13.57,64.05],[13.92,64.45],[13.56,64.79],[16.77,68.01],[17.73,68.01],[17.99,68.57],[19.88,68.41],[20.03,69.07],[20.65,69.11],[23.54,67.94],[23.9,66.01],[22.18,65.72],[21.21,65.03],[21.37,64.41],[17.85,62.75],[17.12,61.34],[18.79,60.08],[17.87,58.95],[16.83,58.72],[15.88,56.1],[14.67,56.2],[14.1,55.41],[12.94,55.36],[11.03,58.86]]]],["BY",[[[28.18,56.17],[30.87,55.55],[30.76,54.81],[32.69,53.35],[31.31,53.07],[31.79,52.1],[30.93,52.04],[30.56,51.32],[25.33,51.91],[23.53,51.58],[23.2,52.49],[23.8,52.69],[23.48,53.91],[25.54,54.28],[25.77,54.85],[26.59,55.17],[26.49,55.62],[28.18,56.17]]]],["UA",[[[30.93,52.04],[33.75,52.34],[34.39,51.77],[34.22,51.26],[35.02,51.21],[35.36,50.58],[40.07,49.6],[39.74,47.9],[38.77,47.83],[38.22,47.1],[34.96,46.27],[35.01,45.74],[31.74,46.33],[31.68,46.71],[30.75,46.58],[29.6,45.29],[28.68,45.3],[28.23,45.49],[28.86,46.44],[30.02,46.42],[28.67,48.12],[27.52,48.47],[24.87,47.74],[22.71,47.88],[22.09,48.42],[22.78,49.03],[22.52,49.48],[23.92,50.42],[23.53,51.58],[25.33,51.91],[30.56,51.32],[30.93,52.04]]]],["PL",[[[23.48,53.91],[23.8,52.69],[23.2,52.49],[24.03,50.71],[22.52,49.48],[22.78,49.03],[21.61,49.47],[19.83,49.22],[17.55,50.36],[16.18,50.42],[16.24,50.7],[15.02,51.11],[14.07,52.98],[14.35,53.25],[14.12,53.76],[17.62,54.85],[18.7,54.44],[22.73,54.33],[23.48,53.91]]]],["AT",[[[16.96,48.6],[16.9,47.71],[16.34,47.71],[16.01,46.68],[14.63,46.43],[12.38,46.77],[12.15,47.12],[11.05,46.75],[9.48,47.1],[9.9,47.58],[12.93,47.47],[12.88,48.29],[13.6,48.88],[14.34,48.56],[15.25,49.04],[16.5,48.79],[16.96,48.6]]]],["HU",[[[22.09,48.42],[22.71,47.88],[22.1,47.67],[21.02,46.32],[18.46,45.76],[16.2,46.85],[16.34,47.71],[16.9,47.71],[16.98,48.12],[17.86,47.76],[20.8,48.62],[22.09,48.42]]]],["MD",[[[26.62,48.22],[27.52,48.47],[28.67,48.12],[30.02,46.42],[28.86,46.44],[28.23,45.49],[28.13,46.81],[26.62,48.22]]]],["RO",[[[28.23,45.49],[29.6,45.29],[28.84,44.91],[28.56,43.71],[27.24,44.18],[25.57,43.69],[22.94,43.82],[22.47,44.41],[22.71,44.58],[21.56,44.77],[20.22,46.13],[21.02,46.32],[22.1,47.67],[23.14,48.1],[24.87,47.74],[26.62,48.22],[28.13,46.81],[28.23,45.49]]]],["LT",[[[26.49,55.62],[26.59,55.17],[25.77,54.85],[25.54,54.28],[23.48,53.91],[22.73,54.33],[22.76,54.86],[21.27,55.19],[21.06,56.03],[24.86,56.37],[26.49,55.62]]]],["LV",[[[25.16,57.97],[27.77,57.24],[28.18,56.17],[26.49,55.62],[24.86,56.37],[21.06,56.03],[21.58,57.41],[22.52,57.75],[23.32,57.01],[24.12,57.03],[24.31,57.79],[25.16,57.97]]]],["EE",[[[27.98,59.48],[27.42,58.72],[27.72,57.79],[27.29,57.47],[25.16,57.97],[24.31,57.79],[24.43,58.38],[23.43,58.61],[23.34,59.19],[25.86,59.61],[27.98,59.48]]]],["DE",[[[14.12,53.76],[14.35,53.25],[14.07,52.98],[15.02,51.11],[12.24,50.27],[12.52,49.55],[13.6,48.88],[12.88,48.29],[12.93,47.47],[7.47,47.62],[8.1,49.02],[6.66,49.2],[6.04,50.13],[5.99,51.85],[6.84,52.23],[7.1,53.69],[8.12,53.53],[8.8,54.02],[8.53,54.96],[9.92,54.98],[9.94,54.6],[10.95,54.36],[10.94,54.01],[12.52,54.47],[14.12,53.76]]]],["BG",[[[22.66,44.23],[22.94,43.82],[25.57,43.69],[27.24,44.18],[28.56,43.71],[27.67,42.58],[28.0,42.01],[26.12,41.83],[26.11,41.33],[22.95,41.34],[22.88,42.0],[22.38,42.32],[22.99,43.21],[22.5,43.64],[22.66,44.23]]]],["GR",[[[26.29,35.3],[24.72,34.92],[23.51,35.28],[23.7,35.71],[26.29,35.3]],[[22.95,41.34],[26.11,41.33],[26.12,41.83],[26.6,41.56],[26.06,40.82],[23.71,40.69],[24.41,40.12],[22.63,40.26],[23.35,39.19],[22.97,38.97],[24.03,38.22],[24.04,37.66],[23.12,37.92],[23.41,37.41],[22.77,37.31],[23.15,36.42],[22.49,36.41],[21.67,36.84],[20.15,39.62],[21.02,40.84],[22.95,41.34]]]],["TR",[[[44.77,37.17],[42.78,37.39],[39.52,36.72],[36.74,36.82],[36.15,35.82],[35.78,36.27],[36.16,36.65],[34.71,36.8],[34.03,36.22],[32.51,36.11],[31.7,36.64],[30.62,36.68],[29.7,36.14],[28.73,36.68],[27.64,36.66],[26.32,38.21],[26.8,38.99],[26.17,39.46],[27.28,40.42],[28.82,40.46],[29.24,41.22],[31.15,41.09],[33.51,42.02],[35.17,42.04],[38.35,40.95],[42.62,41.58],[43.58,41.09],[43.66,40.25],[44.79,39.71],[44.11,39.43],[44.23,37.97],[44.77,37.17]],[[26.12,41.83],[28.0,42.01],[28.99,41.3],[27.62,41.0],[26.36,40.15],[26.06,40.82],[26.6,41.56],[26.12,41.83]]]],["AL",[[[21.02,40.84],[20.15,39.62],[19.41,40.25],[19.3,42.2],[19.74,42.69],[20.52,42.22],[20.61,41.09],[21.02,40.84]]]],["HR",[[[16.56,46.5],[17.63,45.95],[18.83,45.91],[19.39,45.24],[19.01,44.86],[15.96,45.23],[15.75,44.82],[18.45,42.48],[16.02,43.51],[14.9,45.08],[14.26,45.23],[13.95,44.8],[13.66,45.14],[13.72,45.5],[15.33,45.45],[15.77,46.24],[16.56,46.5]]]],["CH",[[[9.59,47.53],[9.48,47.1],[10.44,46.89],[10.36,46.48],[7.27,45.78],[6.5,46.43],[6.02,46.27],[6.74,47.54],[8.52,47.83],[9.59,47.53]]]],["LU",[[[5.78,50.09],[6.19,49.46],[5.67,49.53],[5.78,50.09]]]],["BE",[[[6.16,50.8],[5.67,49.53],[4.29,49.91],[2.51,51.15],[4.97,51.48],[6.16,50.8]]]],["NL",[[[6.91,53.48],[6.84,52.23],[5.99,51.85],[6.16,50.8],[4.97,51.48],[3.31,51.35],[4.71,53.09],[6.91,53.48]]]],["PT",[[[-9.03,41.88],[-8.26,42.28],[-8.01,41.79],[-6.67,41.88],[-6.39,41.38],[-6.85,41.11],[-7.07,39.71],[-7.5,39.63],[-7.03,38.08],[-7.86,36.84],[-8.9,36.87],[-8.84,38.27],[-9.53,38.74],[-8.77,40.76],[-9.03,41.88]]]],["ES",[[[-7.45,37.1],[-7.03,38.08],[-7.5,39.63],[-7.07,39.71],[-6.85,41.11],[-6.39,41.38],[-6.67,41.88],[-8.01,41.79],[-8.26,42.28],[-9.03,41.88],[-8.98,42.59],[-9.39,43.03],[-7.98,43.75],[-1.9,43.42],[0.34,42.58],[2.99,42.47],[3.04,41.89],[2.09,41.23],[0.81,41.01],[-0.28,39.31],[0.11,38.74],[-0.68,37.64],[-2.15,36.67],[-4.37,36.68],[-5.38,35.95],[-6.52,36.94],[-7.45,37.1]]]],["IE",[[[-6.2,53.87],[-6.03,53.15],[-6.79,52.26],[-8.56,51.67],[-9.98,51.82],[-9.17,52.86],[-9.69,53.88],[-7.57,55.13],[-7.57,54.06],[-6.2,53.87]]]],["NC",[[[164.03,-20.11],[167.12,-22.16],[166.74,-22.4],[165.47,-21.68],[164.03,-20.11]]]],["SB",[[[161.32,-10.2],[162.4,-10.83],[161.7,-10.82],[161.32,-10.2]],[[160.92,-8.32],[161.53,-9.78],[160.58,-8.32],[160.92,-8.32]],[[160.85,-9.87],[159.85,-9.79],[159.7,-9.24],[160.36,-9.4],[160.85,-9.87]],[[158.36,-7.32],[159.92,-8.54],[158.21,-7.42],[158.36,-7.32]],[[157.14,-7.02],[157.54,-7.35],[156.54,-6.6],[157.14,-7.02]]]],["NZ",[[[177.21,-39.15],[176.01,-41.29],[175.24,-41.69],[174.65,-41.28],[175.23,-40.46],[174.9,-39.91],[173.82,-39.51],[174.57,-38.8],[174.7,-37.38],[172.64,-34.53],[174.33,-35.27],[175.34,-37.21],[175.36,-36.53],[175.81,-36.8],[175.96,-37.56],[177.44,-37.96],[178.52,-37.7],[177.97,-39.17],[177.21,-39.15]],[[167.05,-45.11],[171.13,-42.51],[172.8,-40.49],[173.25,-41.33],[173.96,-40.93],[174.25,-41.35],[172.71,-43.37],[173.08,-43.85],[171.45,-44.24],[170.62,-45.91],[169.33,-46.64],[166.68,-46.22],[166.51,-45.85],[167.05,-45.11]]]],["AU",[[[146.36,-41.14],[148.29,-40.88],[147.91,-43.21],[147.56,-42.94],[146.87,-43.63],[146.05,-43.55],[144.74,-40.7],[146.36,-41.14]],[[126.15,-32.22],[124.22,-32.96],[123.66,-33.89],[119.89,-33.98],[118.02,-35.06],[116.63,-35.03],[115.03,-34.2],[115.05,-33.62],[115.71,-33.26],[115.8,-32.21],[115.04,-29.46],[113.34,-26.12],[113.78,-26.55],[113.44,-25.62],[114.23,-26.3],[113.39,-24.38],[113.74,-22.48],[114.15,-21.76],[114.23,-22.52],[114.65,-21.83],[116.71,-20.7],[120.86,-19.68],[122.24,-18.2],[122.31,-17.25],[123.01,-16.41],[123.43,-17.27],[123.86,-17.07],[123.5,-16.6],[123.82,-16.11],[124.26,-16.33],[124.38,-15.57],[125.69,-14.23],[127.07,-13.82],[128.36,-14.87],[129.62,-14.97],[129.41,-14.42],[130.62,-12.54],[132.58,-12.11],[132.56,-11.6],[131.82,-11.27],[132.36,-11.13],[135.3,-12.25],[136.49,-11.86],[136.95,-12.35],[135.96,-13.32],[135.5,-15.0],[140.22,-17.71],[140.88,-17.37],[141.27,-16.39],[141.7,-15.04],[141.69,-12.41],[142.52,-10.67],[143.92,-14.55],[144.56,-14.17],[145.37,-14.98],[146.39,-18.96],[148.85,-20.39],[149.68,-22.34],[150.73,-22.4],[150.9,-23.46],[152.86,-25.27],[153.57,-28.11],[152.89,-31.64],[150.33,-35.67],[150.0,-37.43],[148.3,-37.81],[146.32,-39.04],[144.88,-38.42],[145.03,-37.9],[143.61,-38.81],[140.64,-38.02],[139.57,-36.14],[138.12,-35.61],[138.45,-35.13],[138.21,-34.38],[137.72,-35.08],[136.83,-35.26],[137.89,-33.64],[137.81,-32.9],[135.99,-34.89],[135.21,-34.48],[135.24,-33.95],[134.09,-32.85],[134.27,-32.62],[131.33,-31.5],[126.15,-32.22]]]],["LK",[[[81.79,7.52],[81.64,6.48],[80.35,5.97],[79.7,8.2],[80.15,9.82],[81.79,7.52]]]],["CN",[[[109.48,18.2],[108.66,18.51],[108.63,19.37],[109.12,19.82],[110.79,20.08],[111.01,19.7],[110.34,18.68],[109.48,18.2]],[[80.26,42.35],[80.18,42.92],[80.87,43.18],[79.97,44.92],[82.46,45.54],[83.18,47.33],[85.16,47.0],[85.72,47.45],[85.77,48.46],[87.75,49.3],[88.01,48.6],[90.28,47.69],[90.97,46.89],[90.59,45.72],[90.95,45.29],[93.48,44.98],[95.31,44.24],[96.35,42.73],[100.85,42.66],[104.96,41.6],[106.13,42.13],[109.24,42.52],[111.83,43.74],[111.35,44.46],[111.87,45.1],[113.46,44.81],[117.42,46.67],[119.66,46.69],[119.77,47.05],[118.06,48.07],[115.74,47.73],[115.49,48.14],[116.68,49.89],[117.88,49.51],[119.29,50.14],[119.28,50.58],[120.74,51.96],[120.73,52.52],[120.18,52.75],[122.25,53.43],[125.95,52.79],[127.66,49.76],[129.4,49.44],[130.58,48.73],[130.99,47.79],[135.03,48.48],[133.1,45.14],[131.88,45.32],[131.03,44.97],[131.14,42.93],[130.63,42.9],[130.64,42.4],[129.99,42.99],[129.6,42.42],[128.05,41.99],[128.21,41.47],[126.87,41.82],[124.27,39.93],[121.05,38.9],[122.17,40.42],[121.64,40.95],[117.53,38.74],[119.7,37.16],[120.82,37.87],[122.36,37.45],[122.52,36.93],[121.1,36.65],[119.15,34.91],[120.23,34.36],[121.91,31.69],[121.89,30.95],[121.26,30.68],[122.09,29.83],[121.68,28.23],[121.13,28.14],[118.66,24.55],[115.89,22.78],[114.15,22.22],[113.81,22.55],[113.24,22.05],[110.79,21.4],[110.44,20.34],[109.89,20.28],[109.86,21.4],[107.04,21.81],[106.57,22.22],[106.73,22.79],[105.33,23.35],[104.48,22.82],[101.65,22.32],[101.8,21.17],[101.27,21.2],[101.15,21.85],[100.42,21.56],[99.24,22.12],[99.53,22.95],[98.9,23.14],[98.66,24.06],[97.6,23.9],[97.72,25.08],[98.67,25.92],[98.68,27.51],[97.91,28.34],[96.25,28.41],[96.59,28.83],[96.12,29.45],[95.4,29.03],[94.57,29.28],[92.5,27.9],[90.02,28.3],[88.81,27.3],[88.73,28.09],[85.82,28.2],[78.74,31.52],[78.46,32.62],[79.18,32.48],[79.21,32.99],[78.81,33.51],[78.91,34.32],[77.84,35.49],[76.19,35.9],[74.98,37.42],[74.86,38.38],[73.93,38.51],[73.68,39.43],[74.78,40.37],[76.53,40.43],[76.9,41.07],[78.19,41.19],[80.26,42.35]]]],["TW",[[[121.95,25.0],[121.18,22.79],[120.75,21.97],[120.11,23.56],[121.5,25.3],[121.95,25.0]]]],["IT",[[[10.44,46.89],[12.15,47.12],[13.81,46.51],[13.94,45.59],[12.33,45.38],[12.59,44.09],[15.14,41.96],[15.93,41.96],[16.17,41.74],[15.89,41.54],[18.38,40.36],[18.29,39.81],[16.87,40.44],[16.45,39.8],[17.17,39.42],[17.05,38.9],[15.68,37.91],[16.11,38.96],[15.41,40.05],[11.19,42.36],[10.51,42.93],[10.2,43.92],[8.89,44.37],[7.44,43.69],[7.55,44.13],[7.01,44.25],[6.75,45.03],[7.1,45.33],[6.84,45.99],[8.97,46.04],[9.18,46.44],[10.36,46.48],[10.44,46.89]],[[12.57,38.13],[15.52,38.23],[15.1,36.62],[12.43,37.61],[12.57,38.13]],[[8.16,40.95],[9.21,41.21],[9.81,40.5],[9.67,39.18],[8.81,38.91],[8.43,39.17],[8.16,40.95]]]],["DK",[[[9.92,54.98],[8.53,54.96],[8.09,56.54],[8.54,57.11],[10.58,57.73],[10.25,56.89],[10.91,56.46],[9.65,55.47],[9.92,54.98]],[[12.37,56.11],[12.69,55.61],[12.09,54.8],[11.04,55.36],[10.9,55.78],[12.37,56.11]]]],["GB",[[[-6.2,53.87],[-7.57,54.06],[-7.57,55.13],[-6.73,55.17],[-5.66,54.55],[-6.2,53.87]],[[-3.09,53.4],[-2.95,53.98],[-3.63,54.62],[-5.08,55.06],[-4.72,55.51],[-5.05,55.78],[-5.59,55.31],[-5.64,56.28],[-6.15,56.79],[-5.01,58.63],[-3.01,58.64],[-4.07,57.55],[-1.96,57.68],[-3.12,55.97],[-2.09,55.91],[-1.11,54.62],[-0.43,54.46],[0.47,52.93],[1.68,52.74],[1.05,51.81],[1.45,51.29],[0.55,50.77],[-2.96,50.7],[-3.62,50.23],[-5.78,50.16],[-3.41,51.43],[-4.98,51.59],[-5.27,51.99],[-4.22,52.3],[-4.77,52.84],[-4.58,53.5],[-3.09,53.4]]]],["IS",[[[-14.51,66.46],[-14.74,65.81],[-13.61,65.13],[-14.91,64.36],[-18.66,63.5],[-22.76,63.96],[-21.78,64.4],[-23.96,64.89],[-22.18,65.08],[-22.23,65.38],[-24.33,65.61],[-23.65,66.26],[-22.13,66.41],[-20.58,65.73],[-19.06,66.28],[-17.8,65.99],[-16.17,66.53],[-14.51,66.46]]]],["AZ",[[[46.15,41.72],[47.82,41.15],[48.58,41.81],[49.62,40.57],[50.39,40.26],[49.57,40.18],[48.88,38.32],[48.01,38.79],[48.36,39.29],[48.06,39.58],[46.51,38.77],[46.48,39.46],[45.61,39.9],[45.89,40.22],[44.97,41.25],[46.5,41.06],[46.15,41.72]],[[46.14,38.74],[45.46,38.87],[44.79,39.71],[45.74,39.47],[46.14,38.74]]]],["GE",[[[39.96,43.43],[45.47,42.5],[46.4,41.86],[46.15,41.72],[46.64,41.18],[45.22,41.41],[43.58,41.09],[42.62,41.58],[41.55,41.54],[41.45,42.65],[39.96,43.43]]]],["PH",[[[121.26,12.21],[120.32,13.47],[121.53,13.07],[121.26,12.21]],[[122.38,9.71],[122.95,10.88],[123.5,10.94],[123.34,10.27],[124.08,11.23],[123.98,10.28],[123.0,9.02],[122.38,9.71]],[[126.22,9.29],[126.54,7.19],[126.2,6.27],[125.83,7.29],[125.36,6.79],[125.68,6.05],[125.4,5.58],[124.22,6.16],[123.94,6.89],[124.24,7.36],[123.61,7.83],[122.09,6.9],[121.92,7.19],[122.31,8.03],[123.49,8.69],[123.84,8.24],[124.76,8.96],[125.47,8.99],[125.41,9.76],[126.22,9.29]],[[119.69,10.55],[117.17,8.37],[119.51,11.37],[119.69,10.55]],[[122.34,18.22],[122.52,17.09],[122.25,16.26],[121.66,15.93],[121.73,14.33],[123.95,13.78],[124.08,12.54],[122.93,13.55],[122.67,13.19],[122.03,13.78],[120.63,13.86],[120.99,14.53],[120.69,14.76],[120.56,14.4],[119.92,15.41],[119.88,16.36],[120.29,16.03],[120.72,18.51],[122.34,18.22]],[[122.0,10.44],[121.88,11.89],[123.12,11.58],[123.1,11.17],[122.0,10.44]],[[125.23,12.54],[125.78,11.05],[125.01,11.31],[125.28,10.36],[124.8,10.13],[124.3,11.5],[124.89,11.42],[124.88,11.79],[124.27,12.56],[125.23,12.54]]]],["MY",[[[100.09,6.46],[101.08,6.2],[101.15,5.69],[102.14,6.22],[102.96,5.52],[103.38,4.86],[103.5,2.79],[104.23,1.29],[103.52,1.23],[101.39,2.76],[100.2,5.31],[100.09,6.46]],[[117.88,4.14],[115.87,4.31],[114.62,1.43],[112.86,1.5],[110.51,0.77],[109.83,1.34],[109.66,2.01],[110.4,1.66],[111.17,1.85],[111.37,2.7],[113.0,3.1],[114.2,4.53],[114.66,4.01],[115.35,4.32],[115.45,5.45],[116.73,6.92],[117.13,6.93],[117.69,5.99],[119.18,5.41],[119.11,5.02],[118.44,4.97],[118.62,4.48],[117.88,4.14]]]],["BN",[[[115.45,5.45],[115.35,4.32],[114.66,4.01],[114.2,4.53],[115.45,5.45]]]],["SI",[[[13.81,46.51],[16.2,46.85],[16.56,46.5],[15.77,46.24],[15.33,45.45],[13.72,45.5],[13.81,46.51]]]],["FI",[[[29.02,69.77],[28.45,68.36],[29.98,67.7],[29.05,66.94],[30.22,65.81],[29.54,64.95],[30.44,64.2],[30.04,63.55],[31.52,62.87],[31.14,62.36],[28.07,60.5],[22.87,59.85],[21.32,60.72],[21.54,61.71],[21.06,62.61],[21.54,63.19],[25.4,65.11],[25.29,65.53],[23.57,66.4],[23.54,67.94],[20.65,69.11],[21.24,69.37],[22.36,68.84],[24.74,68.65],[26.18,69.83],[27.73,70.16],[29.02,69.77]]]],["SK",[[[22.56,49.09],[21.87,48.32],[20.8,48.62],[17.86,47.76],[16.88,48.47],[18.55,49.5],[19.83,49.22],[21.61,49.47],[22.56,49.09]]]],["CZ",[[[15.02,51.11],[16.72,50.22],[17.55,50.36],[18.85,49.5],[16.96,48.6],[15.25,49.04],[14.34,48.56],[12.52,49.55],[12.24,50.27],[15.02,51.11]]]],["ER",[[[36.43,14.42],[36.85,16.96],[38.41,18.0],[39.27,15.92],[43.08,12.7],[42.35,12.54],[40.03,14.52],[38.51,14.51],[37.91,14.96],[37.59,14.21],[36.43,14.42]]]],["JP",[[[141.88,39.18],[140.96,38.17],[140.77,35.84],[140.25,35.14],[137.22,34.61],[135.79,33.46],[135.12,33.85],[135.08,34.6],[130.99,33.89],[132.0,33.15],[131.33,31.45],[130.69,31.03],[130.2,31.42],[130.45,32.32],[129.41,33.3],[130.35,33.6],[132.62,35.43],[135.68,35.53],[136.72,37.3],[137.39,36.83],[139.43,38.22],[140.31,41.2],[141.37,41.38],[141.88,39.18]],[[144.61,43.96],[145.32,44.38],[145.54,43.26],[144.06,42.99],[143.18,42.0],[141.61,42.68],[141.07,41.58],[139.96,41.57],[139.82,42.56],[140.31,43.33],[141.38,43.39],[141.97,45.55],[143.14,44.51],[144.61,43.96]],[[132.37,33.46],[133.9,34.36],[134.77,33.81],[134.2,33.2],[133.79,33.52],[133.28,33.29],[133.01,32.7],[132.36,32.99],[132.37,33.46]]]],["PY",[[[-58.17,-20.18],[-57.94,-22.09],[-55.8,-22.36],[-55.4,-23.96],[-54.29,-24.02],[-54.79,-26.62],[-55.7,-27.39],[-58.62,-27.12],[-57.63,-25.6],[-57.78,-25.16],[-60.85,-23.88],[-62.69,-22.25],[-61.79,-19.63],[-59.12,-19.36],[-58.17,-20.18]]]],["YE",[[[52.0,19.0],[53.11,16.65],[52.39,16.38],[52.17,15.6],[49.57,14.71],[48.68,14.0],[45.63,13.29],[44.99,12.7],[43.48,12.64],[42.6,15.21],[43.38,17.58],[46.75,17.28],[47.0,16.95],[49.12,18.62],[52.0,19.0]]]],["SA",[[[34.96,29.36],[36.07,29.2],[37.5,30.0],[38.0,30.51],[37.0,31.51],[39.2,32.16],[41.89,31.19],[44.71,29.18],[47.46,29.0],[47.71,28.53],[48.42,28.55],[48.81,27.69],[50.15,26.69],[50.24,25.61],[50.81,24.75],[51.39,24.63],[52.0,23.0],[55.21,22.71],[55.67,22.0],[55.0,20.0],[52.0,19.0],[49.12,18.62],[47.0,16.95],[46.75,17.28],[43.38,17.58],[42.78,16.35],[40.94,19.49],[39.14,21.29],[39.07,22.58],[38.49,23.69],[37.48,24.29],[35.13,28.06],[34.63,28.06],[34.96,29.36]]]],["AQ",[[[-48.66,-78.05],[-46.66,-77.83],[-43.92,-78.48],[-43.33,-80.03],[-50.48,-81.03],[-54.16,-80.63],[-53.99,-80.22],[-50.99,-79.61],[-48.66,-78.05]],[[-66.29,-80.26],[-61.88,-80.39],[-60.61,-79.63],[-59.57,-80.04],[-60.16,-81.0],[-64.49,-80.92],[-66.29,-80.26]],[[-75.01,-71.66],[-72.07,-71.19],[-71.74,-69.51],[-70.25,-68.88],[-68.33,-71.41],[-68.78,-72.17],[-71.08,-72.5],[-72.39,-72.48],[-71.9,-72.09],[-74.19,-72.37],[-74.95,-72.07],[-75.01,-71.66]],[[-102.33,-71.89],[-96.79,-71.95],[-96.2,-72.52],[-100.78,-72.5],[-102.33,-71.89]],[[-122.62,-73.66],[-122.41,-73.32],[-118.72,-73.48],[-120.23,-74.09],[-122.62,-73.66]],[[-127.28,-73.46],[-126.56,-73.25],[-124.03,-73.87],[-125.91,-73.74],[-127.28,-73.46]],[[-163.71,-78.6],[-163.11,-78.22],[-161.25,-78.38],[-159.48,-79.05],[-159.21,-79.5],[-161.13,-79.63],[-163.71,-78.6]],[[180.0,-84.71],[180.0,-90.0],[-180.0,-90.0],[-180.0,-84.71],[-179.06,-84.14],[-177.26,-84.45],[-175.83,-84.12],[-174.38,-84.53],[-169.95,-83.88],[-167.02,-84.57],[-158.07,-85.37],[-155.19,-85.1],[-148.53,-85.61],[-143.11,-85.04],[-142.89,-84.57],[-150.06,-84.3],[-153.59,-83.69],[-152.67,-82.45],[-152.86,-82.04],[-156.84,-81.1],[-152.1,-81.0],[-150.65,-81.34],[-146.42,-80.34],[-146.77,-79.93],[-149.53,-79.36],[-155.33,-79.06],[-158.05,-78.03],[-158.37,-76.89],[-156.97,-77.3],[-153.74,-77.07],[-152.92,-77.5],[-151.33,-77.4],[-146.1,-76.48],[-146.5,-75.73],[-146.2,-75.38],[-144.91,-75.2],[-144.32,-75.54],[-135.21,-74.3],[-121.07,-74.52],[-117.47,-74.03],[-116.22,-74.24],[-113.94,-73.71],[-112.3,-74.71],[-111.26,-74.42],[-107.56,-75.18],[-104.88,-74.95],[-100.65,-75.3],[-100.12,-74.87],[-101.25,-74.19],[-102.55,-74.11],[-103.68,-72.62],[-99.14,-72.91],[-97.69,-73.56],[-96.34,-73.62],[-92.44,-73.17],[-90.09,-73.32],[-89.23,-72.56],[-88.42,-73.01],[-81.47,-73.85],[-80.3,-73.13],[-76.22,-73.97],[-74.89,-73.87],[-67.37,-72.48],[-67.25,-71.64],[-68.54,-69.72],[-67.43,-68.15],[-67.74,-67.33],[-63.63,-64.9],[-57.81,-63.27],[-57.22,-63.53],[-59.05,-64.37],[-60.61,-64.31],[-62.02,-64.8],[-62.65,-65.48],[-62.12,-66.19],[-63.75,-66.5],[-65.67,-67.95],[-63.2,-69.23],[-61.81,-70.72],[-60.69,-73.17],[-60.83,-73.7],[-64.35,-75.26],[-70.6,-76.63],[-77.24,-76.71],[-76.93,-77.1],[-73.66,-77.91],[-77.93,-78.38],[-78.02,-79.18],[-75.36,-80.26],[-59.69,-82.38],[-58.22,-83.22],[-49.76,-81.73],[-42.81,-82.08],[-40.77,-81.36],[-28.55,-80.34],[-29.69,-79.63],[-29.69,-79.26],[-35.64,-79.46],[-35.78,-78.34],[-28.88,-76.67],[-22.46,-76.11],[-17.52,-75.13],[-15.7,-74.5],[-15.41,-74.11],[-16.47,-73.87],[-15.45,-73.15],[-12.29,-72.4],[-10.3,-71.27],[-7.42,-71.7],[-6.87,-70.93],[-4.34,-71.46],[-0.66,-71.23],[-0.23,-71.64],[7.74,-69.89],[9.53,-70.01],[10.82,-70.83],[13.42,-69.97],[14.73,-70.03],[15.13,-70.4],[15.95,-70.03],[19.26,-69.89],[21.45,-70.07],[22.57,-70.7],[27.09,-70.46],[31.99,-69.66],[33.87,-68.5],[38.65,-69.78],[41.96,-68.6],[46.5,-67.6],[47.44,-67.72],[50.75,-66.88],[51.79,-66.25],[54.53,-65.82],[56.36,-65.97],[58.74,-67.29],[61.43,-67.95],[64.05,-67.41],[68.89,-67.93],[69.67,-69.23],[69.56,-69.68],[67.81,-70.31],[67.95,-70.7],[69.07,-70.68],[67.95,-71.85],[69.87,-72.26],[71.02,-72.09],[73.86,-69.87],[77.64,-69.46],[79.11,-68.33],[82.78,-67.21],[86.75,-67.15],[87.99,-66.21],[89.67,-67.15],[95.78,-67.39],[99.72,-67.25],[102.83,-65.56],[106.18,-66.93],[110.24,-66.7],[113.6,-65.88],[115.6,-66.7],[119.83,-67.27],[123.22,-66.48],[128.8,-66.76],[134.76,-66.21],[135.07,-65.31],[136.62,-66.78],[137.46,-66.95],[145.49,-66.92],[146.65,-67.9],[148.84,-68.39],[152.5,-68.87],[154.28,-68.56],[156.81,-69.38],[159.18,-69.6],[161.57,-70.58],[167.31,-70.83],[171.21,-71.7],[169.29,-73.66],[166.09,-74.38],[163.57,-76.24],[163.49,-77.07],[164.74,-78.18],[166.6,-78.32],[167.0,-78.75],[161.77,-79.16],[159.79,-80.95],[163.71,-82.4],[168.9,-83.34],[169.4,-83.83],[173.22,-84.41],[175.99,-84.16],[180.0,-84.71]]]],["CY",[[[32.26,35.1],[33.38,35.16],[34.0,34.98],[32.98,34.57],[32.26,35.1]]]],["MA",[[[-2.17,35.17],[-1.12,32.65],[-1.31,32.26],[-3.65,31.64],[-3.69,30.9],[-5.24,30.0],[-8.67,28.84],[-8.79,27.12],[-11.39,26.88],[-12.5,24.77],[-13.89,23.69],[-14.75,21.5],[-17.02,21.42],[-14.44,26.25],[-12.62,28.04],[-11.69,28.15],[-9.56,29.93],[-9.81,31.18],[-8.66,33.24],[-6.91,34.11],[-5.93,35.76],[-2.17,35.17]]]],["EG",[[[36.87,22.0],[25.0,22.0],[25.0,29.24],[24.7,30.04],[25.16,31.57],[26.5,31.59],[28.91,30.87],[30.98,31.56],[31.69,31.43],[31.96,30.93],[32.19,31.26],[33.77,30.97],[34.27,31.22],[34.92,29.5],[34.15,27.82],[33.92,27.65],[33.14,28.42],[32.32,29.76],[34.1,26.14],[35.69,23.93],[35.53,23.1],[36.87,22.0]]]],["LY",[[[24.92,31.9],[25.0,20.0],[23.85,20.0],[23.84,19.58],[15.86,23.41],[14.14,22.49],[13.58,23.04],[12.0,23.47],[10.77,24.56],[10.3,24.38],[9.32,26.09],[9.72,26.51],[9.86,28.96],[9.48,30.31],[9.97,30.54],[9.95,31.38],[11.43,32.37],[11.49,33.14],[15.25,32.27],[15.71,31.38],[19.09,30.27],[20.05,30.99],[19.82,31.75],[20.85,32.71],[22.9,32.64],[23.24,32.19],[24.92,31.9]]]],["ET",[[[47.79,8.0],[44.96,5.0],[43.66,4.96],[41.86,3.92],[40.77,4.26],[39.56,3.42],[36.16,4.45],[34.71,6.59],[33.57,7.71],[32.95,7.78],[33.29,8.35],[33.83,8.38],[34.26,10.63],[35.86,12.58],[36.43,14.42],[37.59,14.21],[37.91,14.96],[38.51,14.51],[40.03,14.52],[41.6,13.45],[42.35,12.54],[41.66,11.63],[41.76,11.05],[42.78,10.93],[42.56,10.57],[43.68,9.18],[47.79,8.0]]]],["DJ",[[[42.35,12.54],[43.08,12.7],[43.32,12.39],[42.72,11.74],[43.15,11.46],[42.78,10.93],[41.76,11.05],[41.66,11.63],[42.35,12.54]]]],["UG",[[[33.9,-0.95],[29.58,-1.34],[29.88,0.6],[31.17,2.2],[30.77,2.34],[30.83,3.51],[31.25,3.78],[33.39,3.79],[34.01,4.25],[34.48,3.56],[35.04,1.91],[33.89,0.11],[33.9,-0.95]]]],["RW",[[[30.42,-1.13],[30.76,-2.29],[29.02,-2.84],[29.29,-1.62],[30.42,-1.13]]]],["BA",[[[18.56,42.65],[16.46,44.04],[15.75,44.82],[15.96,45.23],[19.37,44.86],[19.12,44.42],[19.6,44.04],[19.45,43.57],[18.71,43.2],[18.56,42.65]]]],["MK",[[[22.38,42.32],[22.88,42.0],[22.95,41.34],[21.02,40.84],[20.61,41.09],[20.76,42.05],[22.38,42.32]]]],["RS",[[[18.83,45.91],[20.22,46.13],[21.56,44.77],[22.71,44.58],[22.41,44.01],[22.99,43.21],[22.55,42.46],[21.58,42.25],[21.78,42.68],[20.81,43.27],[20.26,42.81],[19.22,43.52],[19.6,44.04],[19.12,44.42],[19.39,45.24],[18.83,45.91]]]],["ME",[[[20.34,42.9],[19.74,42.69],[19.37,41.88],[18.45,42.48],[19.22,43.52],[20.34,42.9]]]],["TT",[[[-61.68,10.76],[-60.9,10.86],[-60.94,10.11],[-61.95,10.09],[-61.68,10.76]]]],["SS",[[[30.83,3.51],[29.72,4.6],[27.98,4.41],[25.11,7.83],[23.89,8.62],[24.54,8.92],[25.07,10.27],[25.79,10.41],[26.75,9.47],[28.97,9.4],[30.0,10.29],[30.84,9.71],[31.35,9.81],[32.4,11.08],[32.07,11.97],[33.21,12.18],[33.21,10.72],[33.72,10.33],[33.97,8.68],[32.95,7.78],[34.08,7.23],[35.3,5.51],[33.39,3.79],[30.83,3.51]]]]];
function ronnyPolyContains(lng,lat,polygon){return CoreGeo.ronnyPolyContains(lng,lat,polygon)}
function ronnyCountryAt(lat,lng){for(const [iso,parts] of RONNY_COUNTRY_SHAPES)for(const coords of parts)if(ronnyPolyContains(lng,lat,coords))return iso;return null}
function ronnyFlag(iso){if(!/^[A-Z]{2}$/.test(iso||''))return '';return [...iso].map(c=>String.fromCodePoint(c.charCodeAt(0)-65+0x1F1E6)).join('')}
let ronnyCountryKey='',ronnyCountryCached=[];
function ronnyVisitedCountries(){const outline=currentOutline().points;
 const source=outline.length>=2?outline:state.days.flatMap(d=>(d.stops||[]).filter(s=>validPoint(s)&&!isMapOnlyPoint(s)));
 const cacheKey=source.map(p=>`${Number(p.lat).toFixed(4)}:${Number(p.lng).toFixed(4)}`).join('|');if(cacheKey===ronnyCountryKey)return ronnyCountryCached;
 const result=[];const add=(a,b)=>{const km=kmBetween([a.lat,a.lng],[b.lat,b.lng])/1000,steps=Math.max(1,Math.min(28,Math.ceil(km/75)));for(let i=0;i<=steps;i++){const t=i/steps,code=ronnyCountryAt(+a.lat+(+b.lat- +a.lat)*t,+a.lng+(+b.lng- +a.lng)*t);if(code&&!result.includes(code))result.push(code)}};
 source.forEach((p,i)=>{if(!i){const iso=ronnyCountryAt(+p.lat,+p.lng);if(iso&&!result.includes(iso))result.push(iso)}else add(source[i-1],p)});ronnyCountryKey=cacheKey;ronnyCountryCached=result.slice(0,16);return ronnyCountryCached
}
/* RONNY 35.13 — road-distance total: do not substitute aerial estimates for routing. */
let ronnyDistanceSnapshot={key:'',status:'idle',meters:null,reason:''};
let ronnyDistanceController=null;
const ronnyDistanceFmt=x=>Number(x).toLocaleString('he-IL',{maximumFractionDigits:1});
function ronnyDistanceKey(){
 return JSON.stringify([activeTripId,state.days.map((d,di)=>[
  d.dayId||di,dayExcludedFromTotals(d)?'excluded':dayDefaultProfile(di),dayExcludedFromTotals(d)?[]:routeStopsForDay(di).filter(validPoint).map((p,i,arr)=>{
   const leg=i?legAt(i,arr):null;
   return [p.id,+p.lat,+p.lng,leg?.mode||'auto',leg?.profile||'',leg?.viaPoints||[],leg?.path||[]];
  })
 ])]);
}
function ronnyDistanceResultUI(){
 const stateNow=ronnyDistanceSnapshot;
 if(stateNow.status==='done')return {value:ronnyDistanceFmt(stateNow.meters/1000),label:'סה״כ ק״מ',title:'סכום מרחקי הדרך המחושבים בכל ימי הטיול; קטעים משורטטים נמדדים לאורך השרטוט. אינו כולל נסיעות שלא הוזנו.'};
 if(stateNow.status==='loading')return {value:stateNow.meters>0?ronnyDistanceFmt(stateNow.meters/1000):'…',label:stateNow.meters>0?'ק״מ שחושבו · מחשב…':'מחשב ק״מ',title:'מחשב את מרחקי הדרך של כל הימים; מציג בינתיים רק מקטעים שכבר חושבו בפועל'};
 if(stateNow.status==='empty')return {value:'—',label:'ק״מ בטיול',title:'נדרשות לפחות שתי נקודות דרך מחוברות באחד הימים כדי לחשב מרחק נסיעה'};
 if(stateNow.status==='partial')return {value:stateNow.meters>0?ronnyDistanceFmt(stateNow.meters/1000):'—',label:stateNow.meters>0?'ק״מ מחושבים · חלקי':'דרכים לא חושבו',title:'חלק ממקטעי הדרך טרם חושבו (או שהם מוגדרים כקו אווירי). המספר המוצג הוא רק סך מקטעי הדרך שחושבו. לחץ לניסיון חוזר.'};
 return {value:'—',label:'ק״מ בטיול',title:'סך קילומטרי הדרך יחושב על בסיס נתיבי הנסיעה בתכנון היומי'};
}
function ronnyPaintDashboardDistance(){
 const el=document.getElementById('ronny-dashboard-distance');if(!el)return;
 const d=ronnyDistanceResultUI();
 el.querySelector('strong').textContent=d.value;
 el.querySelector('small').textContent=d.label;
 el.title=d.title;
 el.setAttribute('aria-label',d.title);
}
function ronnyDistanceState(){
 const key=ronnyDistanceKey();
 if(ronnyDistanceSnapshot.key!==key){
  ronnyDistanceController?.abort();
  const hasLeg=state.days.some((d,i)=>!dayExcludedFromTotals(d)&&routeStopsForDay(i).filter(validPoint).length>=2);
  ronnyDistanceSnapshot={key,status:hasLeg?'loading':'empty',meters:null,reason:''};
  if(hasLeg)Promise.resolve().then(()=>ronnyComputeRoadTotal(key));
 }
 return ronnyDistanceSnapshot;
}
async function ronnyComputeRoadTotal(key){
 if(ronnyDistanceSnapshot.key!==key)return;
 ronnyDistanceController?.abort();
 const controller=new AbortController();ronnyDistanceController=controller;
 // Reuse every verified routed leg already computed in the daily planner,
 // and ask the router only for legs not represented by known road geometry.
 const jobs=[];let meters=0,missing=false;
 for(let di=0;di<state.days.length;di++){
  const arr=dayExcludedFromTotals(state.days[di])?[]:routeStopsForDay(di).filter(validPoint);
  for(let i=1;i<arr.length;){
   if(arr[i].type==='walkStart'){results[i-1]={duration:0,baseDuration:0,distance:0,mode:'association',estimated:false,manualMissing:false};i++;continue;}
   const conf=legAt(i,arr);
   if(conf.mode==='straight'){missing=true;i++;continue;}
   if(conf.mode==='draw'||conf.mode==='pencil'){
    if((conf.path||[]).length>=(conf.mode==='pencil'?1:2))meters+=distanceOfCoords(legCoords(i,arr));
    else missing=true;
    i++;continue;
   }
   const profile=effectiveLegProfile(i,arr,di);
   const cachedShape=routedLegVisualCache.get(routedShapeKey(arr,i,profile));
   if(cachedShape?.length>=2){meters+=distanceOfCoords(cachedShape);i++;continue;}
   const via=Array.isArray(conf.viaPoints)?conf.viaPoints:[];
   if(via.length){jobs.push({profile,day:di,arr,from:i-1,to:i,stops:[arr[i-1],...via.map(([lat,lng])=>({lat,lng})),arr[i]]});i++;continue;}
   const from=i-1;
   i++;
   // Group uncached neighbouring segments of the same travel mode into one request.
   while(i<arr.length&&i-from<24){
    const next=legAt(i,arr);
    if(next.mode!=='auto'||next.viaPoints?.length||effectiveLegProfile(i,arr,di)!==profile)break;
    const saved=routedLegVisualCache.get(routedShapeKey(arr,i,profile));
    if(saved?.length>=2)break;
    i++;
   }
   jobs.push({profile,day:di,arr,from,to:i-1,stops:arr.slice(from,i)});
  }
 }
 const updateProgress=()=>{
  if(controller.signal.aborted||ronnyDistanceSnapshot.key!==key)return;
  ronnyDistanceSnapshot.meters=meters;
  ronnyPaintDashboardDistance();
 };
 updateProgress();
 let cursor=0;
 const work=async()=>{
  while(cursor<jobs.length&&!controller.signal.aborted){
   const job=jobs[cursor++];
   const cacheKey=JSON.stringify([job.profile,job.stops.map(p=>[p.lat,p.lng])]);
   try{
    let result=routeCache.get(cacheKey);
    if(!result){
     const timeout=AbortSignal.timeout(17000);
     const signal=AbortSignal.any?.([controller.signal,timeout])||controller.signal;
     result=await requestRoute(job.stops,job.profile,signal);
     if(!controller.signal.aborted){
      if(routeCache.size>120)routeCache.delete(routeCache.keys().next().value);
      routeCache.set(cacheKey,result);
     }
    }
    if(!Number.isFinite(+result?.distance)){missing=true;continue;}
    meters+=+result.distance;
    const geometry=result.geometry?.coordinates;
    if(Array.isArray(geometry)&&geometry.length>=2){
     const coords=geometry.map(c=>[+c[1],+c[0]]);
     if(job.from+1===job.to)rememberRoutedShape(job.arr,job.to,job.profile,coords);
     else{
      const pieces=splitRoutedLegs(coords,job.arr.slice(job.from,job.to+1));
      for(let i=job.from+1;i<=job.to;i++){
       const part=pieces[i-job.from-1];
       if(part?.length>=2)rememberRoutedShape(job.arr,i,job.profile,part);
      }
     }
    }
    updateProgress();
   }catch(e){if(!controller.signal.aborted)missing=true;}
  }
 };
 await Promise.all(Array.from({length:Math.min(2,jobs.length)},work));
 if(controller.signal.aborted||ronnyDistanceSnapshot.key!==key)return;
 ronnyDistanceSnapshot={key,meters,status:missing?'partial':'done',reason:missing?'routing unavailable or straight segment':''};
 ronnyPaintDashboardDistance();
 // If viewing all days, replace approximate line segments with real routed geometry as it arrives.
 if(planningResolution==='day'&&viewScope==='all'&&map)showOverview();
}

function ronnyTripMetrics(){const out=currentOutline().points,days=state.days;
 const useful=days.filter(d=>!dayExcludedFromTotals(d)&&((d.stops||[]).length||d.outlineStageId||d.outlineDayMapped));
 const points=days.reduce((a,d)=>a+(dayExcludedFromTotals(d)?0:(d.stops||[]).length),0);
 const climb=state.dashboardElevation?.key===ronnyElevationKey()?state.dashboardElevation?.up:null;
 ronnyDistanceState();
 return {days:useful.length,points:points||out.length,climb,flags:ronnyVisitedCountries()};
}
function ronnyElevationKey(){return [...currentOutline().points,...state.days.flatMap(d=>(d.stops||[]).filter(s=>validPoint(s)&&!isMapOnlyPoint(s)))].map(p=>`${(+p.lat).toFixed(4)},${(+p.lng).toFixed(4)}`).join('|')}
function renderTripDashboard(){const el=$('ronny-trip-dashboard');if(!el)return;const m=ronnyTripMetrics();
 const fmt=x=>Math.round(x).toLocaleString('he-IL');
 el.innerHTML=`<span class="ronny-dash-stat" title="ימי תכנון שהוגדרו"><i data-lucide="calendar-days"></i><strong>${fmt(m.days)}</strong><small>ימים</small></span><button type="button" class="ronny-dash-stat" id="ronny-dashboard-distance" title="מרחק דרך מחושב של כל ימי הטיול" aria-label="חשב מחדש את מרחק הנסיעה"><i data-lucide="route"></i><strong>${ronnyDistanceResultUI().value}</strong><small>${ronnyDistanceResultUI().label}</small></button><span class="ronny-dash-stat" title="נקודות בתכנון"><i data-lucide="map-pin"></i><strong>${fmt(m.points)}</strong><small>נקודות</small></span><button type="button" class="ronny-dash-stat ronny-elevation-trigger" id="ronny-elevation-trigger" title="אומדן טיפוס על פי דגימות גובה בקו ישר בין הנקודות — אינו מייצג מסלול הליכה או נסיעה בפועל"><i data-lucide="mountain"></i><strong>${m.climb!==null?fmt(m.climb):'—'}</strong><small>${m.climb!==null?'מ׳ טיפוס (אומדן)':'חשב טיפוס'}</small></button>`;
 el.querySelector('#ronny-elevation-trigger')?.addEventListener('click',estimateRouteClimb);
 const dist=el.querySelector('#ronny-dashboard-distance');
 if(dist){dist.style.cursor='pointer';dist.addEventListener('click',()=>{
  ronnyDistanceController?.abort();ronnyDistanceSnapshot.key='';ronnyDistanceState();ronnyPaintDashboardDistance();
 });ronnyPaintDashboardDistance();}
 
}

async function estimateRouteClimb(){const btn=$('ronny-elevation-trigger');if(btn?.dataset.busy)return;let base=currentOutline().points; if(base.length<2)base=state.days.flatMap(d=>routeStopsForDay(state.days.indexOf(d)).filter(validPoint));if(base.length<2){toast('נדרשות לפחות שתי נקודות עם מיקום כדי לחשב אומדן טיפוס');return}
 // Sample the straight line in manageable batches; this is NOT an actual-route elevation profile.
 const samples=[];for(let i=1;i<base.length;i++){const a=base[i-1],b=base[i],km=kmBetween([a.lat,a.lng],[b.lat,b.lng])/1000,n=Math.max(1,Math.min(24,Math.ceil(km/8)));for(let j=0;j<n;j++){const t=j/n;samples.push([+a.lat+(+b.lat- +a.lat)*t,+a.lng+(+b.lng- +a.lng)*t])}}samples.push([+base.at(-1).lat,+base.at(-1).lng]);
 const reduced=samples.length>180?samples.filter((_,i)=>i%Math.ceil(samples.length/180)===0||i===samples.length-1):samples;
 try{btn.dataset.busy='1';btn.querySelector('small').textContent='מחשב…';let result=[];for(let i=0;i<reduced.length;i+=65){const group=reduced.slice(i,i+65);const endpoint='https://api.open-meteo.com/v1/elevation?latitude='+group.map(p=>p[0].toFixed(5)).join(',')+'&longitude='+group.map(p=>p[1].toFixed(5)).join(',');const response=await fetch(endpoint,{signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('שירות הגבהים אינו זמין');const data=await response.json();if(!Array.isArray(data.elevation)||data.elevation.length!==group.length)throw new Error('נתוני גובה חסרים');result.push(...data.elevation)}
 let up=0;for(let i=1;i<result.length;i++)if(Number.isFinite(result[i])&&Number.isFinite(result[i-1]))up+=Math.max(0,result[i]-result[i-1]);state.dashboardElevation={key:ronnyElevationKey(),up:Math.round(up)};save();toast('חושב אומדן טיפוס לפי קו גאוגרפי ישר, לא לפי תוואי הדרך בפועל');}
 catch(e){toast('חישוב הגובה נכשל: '+e.message)}finally{if(btn)delete btn.dataset.busy;renderTripDashboard()}
}
function initDayNavigation(){const strip=$('days');if(!strip||strip.dataset.scrollReady)return;strip.dataset.scrollReady='true';
 strip.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)||!e.deltaY)return; if(strip.scrollWidth<=strip.clientWidth+2)return;e.preventDefault();strip.scrollLeft+=e.deltaY},{passive:false});
 $('day-prev').onclick=()=>selectDay(selectedDay-1);$('day-next').onclick=()=>selectDay(selectedDay+1);
 
}
function openOutlineDayAssignment(){const points=currentOutline().points;if(!points.length){toast('ראשית הוסף עוגנים למתאר');return}
 document.getElementById('ronny-anchor-dialog')?.remove();const oldDays=state.days.filter(d=>(d.stops||[]).length||d.outlineDayMapped||d.outlineStageId);const hasExisting=oldDays.length>0;
 const dlg=document.createElement('div');dlg.id='ronny-anchor-dialog';dlg.className='ronny-anchor-shade';dlg.setAttribute('role','presentation');
 dlg.innerHTML=`<section class="ronny-anchor-dialog" role="dialog" aria-modal="true" aria-labelledby="anchor-wizard-title" dir="rtl"><header class="ronny-anchor-header"><div><span>מעבר מהמתאר לתכנון היומי</span><h2 id="anchor-wizard-title">שיוך יעדים לימי הטיול</h2><p>העוגנים מסודרים גאוגרפית. הגדר ימים ושייך לכל יום את המקומות הרצויים, בלי להניח שהעוגנים הם תחילת יום, סוף יום או לינה.</p></div><button class="ronny-anchor-close" type="button" aria-label="סגור" data-anchor-close>${icon('x')}</button></header><div class="ronny-anchor-controls"><label>מספר ימי הטיול <input id="ronny-anchor-count" type="number" min="1" max="30" step="1" value="${Math.min(30,Math.max(1,hasExisting?oldDays.length:Math.ceil(points.length/3)))}"></label>${hasExisting?`<label>אופן השיוך <select id="ronny-anchor-mode"><option value="existing">שייך לימים שכבר תכננתי</option><option value="new">צור ימי תכנון חדשים</option></select></label>`:''}</div><div class="ronny-anchor-note">אפשר לשייך כמה עוגנים לאותו יום, להשאיר עוגן ללא שיוך, ולשנות את המסלול היומי אחר כך. אין יצירת לינות או שעות אוטומטית.</div><div id="ronny-anchor-rows" class="ronny-anchor-rows"></div><footer><button type="button" class="btn" data-anchor-close>ביטול</button><button type="button" class="btn btn-primary" id="ronny-anchor-apply">${icon('check','small-icon')} שמירה ומעבר לתכנון</button></footer></section>`;
 document.body.append(dlg);const count=dlg.querySelector('#ronny-anchor-count'),mode=dlg.querySelector('#ronny-anchor-mode');
 const render=()=>{const existing=mode?.value!=='new'&&hasExisting;count.disabled=existing;const n=existing?oldDays.length:Math.max(1,Math.min(30,+count.value||1));const rows=dlg.querySelector('#ronny-anchor-rows');const selected=Array.from(rows.querySelectorAll('[data-anchor-id]')).map(s=>[s.dataset.anchorId,s.value]);const selectedMap=new Map(selected);
 rows.innerHTML=points.map((p,i)=>`<div class="ronny-anchor-row"><span class="ronny-anchor-index">${i+1}</span><strong>${esc(p.name)}</strong><select data-anchor-id="${esc(p.id)}" aria-label="שיוך ${esc(p.name)} ליום"><option value="">ללא שיוך</option>${Array.from({length:n},(_,j)=>`<option value="${j+1}">יום ${j+1}${existing?' · '+esc(oldDays[j]?.label||''):''}</option>`).join('')}</select></div>`).join('');
 rows.querySelectorAll('select').forEach((s,i)=>{const value=selectedMap.has(s.dataset.anchorId)?selectedMap.get(s.dataset.anchorId):String(Math.min(n,Math.floor(i*n/points.length)+1));s.value=Number(value)>n?'':value});
 };count.addEventListener('change',render);mode?.addEventListener('change',render);render();
 const close=()=>{dlg.classList.add('is-closing');setTimeout(()=>dlg.remove(),180)};dlg.querySelectorAll('[data-anchor-close]').forEach(x=>x.onclick=close);dlg.addEventListener('click',e=>{if(e.target===dlg)close()});const onKey=e=>{if(e.key==='Escape'){e.preventDefault();close();document.removeEventListener('keydown',onKey)}};document.addEventListener('keydown',onKey);
 dlg.querySelector('#ronny-anchor-apply').onclick=()=>{const existing=mode?.value!=='new'&&hasExisting;const n=existing?oldDays.length:Math.max(1,Math.min(30,+count.value||1));const selected=Array.from(dlg.querySelectorAll('[data-anchor-id]')).map(s=>({id:s.dataset.anchorId,day:+s.value})).filter(x=>x.day>0);
 if(!selected.length){toast('בחר לפחות עוגן אחד לשיוך');return}if(!existing&&state.days.length+n>100){const blank=state.days.length===1&&!state.days[0].stops.length;if(!blank||n>100){toast('לא ניתן לחרוג מ־100 ימי תכנון');return}}
 let targets=[];const priorAnchors=new Map();if(existing){targets=oldDays;for(const d of targets){for(const stop of d.stops||[])if(stop.outlineAnchorId&&points.some(p=>p.id===stop.outlineAnchorId))priorAnchors.set(stop.outlineAnchorId,stop);d.stops=d.stops.filter(stop=>!stop.outlineAnchorId||!points.some(p=>p.id===stop.outlineAnchorId))}}else{const pristine=state.days.length===1&&!state.days[0].stops.length&&!state.days[0].outlineDayMapped;if(pristine)state.days=[];const initial=state.days.length;for(let i=0;i<n;i++){const day={label:'יום '+(initial+i+1),dayId:uid(),color:DAY_ACCENTS[(initial+i)%DAY_ACCENTS.length],description:'',travelMode:'',segments:[],stops:[],scheduleEnabled:false,outlineDayMapped:true};state.days.push(day);targets.push(day)}}
 for(const t of selected){const p=points.find(v=>v.id===t.id),day=targets[t.day-1];if(!p||!day)continue;if((day.stops||[]).some(s=>s.outlineAnchorId===p.id))continue;
 day.stops.push({...priorAnchors.get(p.id),id:priorAnchors.get(p.id)?.id||uid(),name:priorAnchors.get(p.id)?.name||p.name,type:'via',lat:priorAnchors.get(p.id)?.lat??p.lat,lng:priorAnchors.get(p.id)?.lng??p.lng,time:priorAnchors.get(p.id)?.time||'09:00',duration:0,cost:0,description:p.description||'',notes:'',outlineAnchorId:p.id,outlineLastSynced:{lat:p.lat,lng:p.lng,name:p.name},autoViaName:false});day.outlineDayMapped=true;
 }
 if(!existing)targets.forEach(day=>{const linked=day.stops.filter(p=>p.outlineAnchorId);if(linked.length&&day.label.startsWith('יום '))day.label=linked.length===1?linked[0].name:linked[0].name+' · '+linked.at(-1).name});
 selectedDay=state.days.indexOf(targets[0]);if(selectedDay<0)selectedDay=0;planningResolution='day';state.settings.planningResolution='day';viewScope='all';$('map-scope').value='all';selectedStop=null;save();renderAll();fitMap();close();document.removeEventListener('keydown',onKey);toast('העוגנים שויכו לימים. אפשר להוסיף בכל יום עצירות, דרכים ולינות בנפרד');
 };
 dlg.querySelector('#ronny-anchor-count')?.focus();refreshIcons();
}

function bind(){
initResolutionUI();initDayNavigation();
 const descToggle=$('map-description-toggle');if(descToggle){const sync=()=>{const on=state.settings.showMapDescriptions!==false;descToggle.setAttribute('aria-pressed',String(on));descToggle.title=on?'הסתר תיאורים קבועים':'הצג תיאורים שסומנו';};sync();descToggle.addEventListener('click',()=>{state.settings.showMapDescriptions=state.settings.showMapDescriptions===false;sync();save();if(planningResolution==='outline')renderOutlineMap();else renderMarkers()})}
$('trip-name').value=state.title;$('trip-name').onchange=()=>{state.title=$('trip-name').value.trim()||'הטיול שלי';save();renderTripDashboard()};$('trip-name').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();state.title=$('trip-name').value.trim()||'הטיול שלי';$('trip-name').value=state.title;save();$('trip-name').blur();toast('שם הטיול נשמר')}});$('start-date').value=state.startDate;$('start-date-trigger').onclick=()=>{const field=$('start-date');try{field.showPicker()}catch(e){field.focus();field.click()}};$('start-date').onchange=()=>{state.startDate=$('start-date').value||state.startDate;save();renderDays()};$('travel-mode').value=state.settings.travelMode;$('travel-mode').onchange=()=>{closeLegEditor();stopLegDrawing();state.settings.travelMode=$('travel-mode').value;invalidate();retimeAfterOrderChange(selectedDay);save();drawRoute();renderSchedule();renderMarkers()};rebuildMapOptions();
initMapSelectClickTargets();$('map-scope').onchange=()=>{if(drawLegSession)stopLegDrawing();closeLegEditor();const requested=$('map-scope').value;wholeTripFocusSeq++;ronnyActiveDayGroupId=null;if(planningResolution!=='day')setPlanningResolution('day',{fit:false});viewScope=requested;selectedStop=null;renderAll();fitMap()};$('map-style').onchange=()=>setMapStyle($('map-style').value);$('top-add').onclick=$('panel-add').onclick=()=>openStopForm();$('map-add').onclick=()=>{const c=map?.getCenter();if(!c)return;if(planningResolution!=='day')addOutlinePoint(c);else openStopForm(null,{lat:c.lat,lng:c.lng})};$('fit-route').onclick=()=>{ronnyActiveDayGroupId=null;if(planningResolution!=='day')setPlanningResolution('day',{fit:false});viewScope='all';$('map-scope').value='all';selectedStop=null;closeLegEditor();hidePointQuick();renderAll();fitMap();};$('auto-time').onclick=autoSchedule;$('close-drawer').onclick=$('drawer-backdrop').onclick=closeDrawer;$('close-planner').onclick=showMap;
$('search-btn').onclick=()=>searchPlaces(null,[]);$('place-search').addEventListener('input',schedulePlaceSearch);$('segments-btn').onclick=manageSegments;$('layer-filter-toggle').onclick=()=>toggleLayerFilterPanel('layers');$('map-outline-guide-toggle').onclick=()=>toggleLayerFilterPanel('contours');ronnyMeasureBindControls();$('photo-add').onclick=()=>{photoPlacement=null;$('photo-file').click()};$('photo-file').onchange=async e=>{const files=Array.from(e.target.files||[]);if(!files.length)return;await handlePhotos(files,photoPlacement);e.target.value='';photoPlacement=null;updateMapHint()};$('route-edit-toggle').onclick=()=>{cancelPointMove();routeEdit=!routeEdit;document.querySelector('.map-pane')?.classList.remove('map-tools-expanded');$('map-tools-toggle')?.setAttribute('aria-expanded','false');if(routeEdit){quickStreetMode=false;$('street-link-mode').setAttribute('aria-pressed','false')}viewScope='day';$('map-scope').value='day';$('route-edit-toggle').setAttribute('aria-pressed',String(routeEdit));updateMapHint();renderMap()};$('street-link-mode').onclick=()=>{quickStreetMode=!quickStreetMode;hideContext();if(quickStreetMode&&googleMode)toggleGoogleCoverage();if(quickStreetMode&&routeEdit){routeEdit=false;$('route-edit-toggle').setAttribute('aria-pressed','false');renderMap()}$('street-link-mode').setAttribute('aria-pressed',String(quickStreetMode));updateMapHint();toast(quickStreetMode?'כעת לחיצה על כל נקודה במפה פותחת את Google Street View בטאב חדש — ללא מפתח API':'מצב Street View הסתיים')};$('google-coverage-toggle').onclick=toggleGoogleCoverage;$('place-search').addEventListener('keydown',searchKeydown);document.addEventListener('pointerdown',e=>{if(document.getElementById('ronny-time-dialog')?.open)return;// Allow the Leaflet map-click handler to consume the first outside click as dismissal.
// Hiding the editor here on pointerdown would make the subsequent click create an unwanted new point.
if(!e.target.closest('#point-quick')&&!e.target.closest('.leaflet-marker-icon')&&!e.target.closest('#map')&&!e.target.closest('[data-zoom-card]'))hidePointQuick();if(!e.target.closest('#leg-editor')&&!e.target.closest('#map')&&!e.target.closest('.leg-open'))closeLegEditor();if(!e.target.closest('#layer-filter-panel')&&!e.target.closest('#layer-filter-toggle')&&!e.target.closest('#map-outline-guide-toggle'))closeLayerFilterPanel();if(!e.target.closest('#search-box'))$('search-results').classList.remove('open');if(!e.target.closest('#map-context')&&!e.target.closest('#map'))hideContext()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&savedPinPlacementId){savedPinPlacementId=null;toast('בחירת מיקום בוטלה');return}if(e.key==='Escape'&&newTripSetupDraft){newTripSetupDraft=null;updateMapHint();toast('בחירת מיקום לטיול בוטלה');return}if(e.key==='Escape'&&forcedRelocateSession){cancelForcedRelocate();return}if(e.key==='Escape'){outlineMoveModeId=null;hidePointQuick();cancelPointMove();updateMapHint();if(drawLegSession)stopLegDrawing();closeLegEditor();closeLayerFilterPanel();closeDrawer();hideContext();photoPlacement=null;homePickMode=false;updateMapHint();$('search-results').classList.remove('open')}});
initPointTree();
document.querySelector('.rail')?.addEventListener('click',e=>{if(!e.target.closest('.rail-btn'))return;hideContext();hidePointQuick();closeOutlineMapAdd()},true);
document.querySelector('.rail')?.addEventListener('click',e=>{
 const button=e.target.closest('.rail-btn');if(!button)return;
 if($('drawer')?.classList.contains('open')&&button.classList.contains('active')){
  e.preventDefault();e.stopImmediatePropagation();closeDrawer();
 }
},true);
$('rail-plan').onclick=showPlan;$('rail-settings').onclick=()=>{openSettings();setRail('settings')};$('rail-budget').onclick=()=>{showBudget();setRail('budget')};$('rail-lodging').onclick=()=>{showLodging();setRail('lodging')};$('rail-photos').onclick=()=>{showPhotos();setRail('photos')};$('rail-pdf').onclick=()=>{openPrintDialog();setRail('pdf')};$('rail-help').onclick=()=>{help();setRail('help')};
 $('data-transfer-btn').onclick=showTransferCenter;$('import-file').onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  const btn=$('import-btn');if(btn)btn.disabled=true;
  try{
   if(!/\.json$/i.test(f.name))throw Error('ייבוא טיול דורש קובץ JSON. לרשימות Google Takeout יש לבחור את האפשרות הנפרדת.');
   if(f.size>35e6)throw Error('קובץ גדול מדי (מעל 35MB)');
   let payload;try{payload=JSON.parse((await f.text()).replace(/^\uFEFF/,''))}catch(_){throw Error('הקובץ אינו JSON תקין')}
   const candidate=payload?.trip&&Array.isArray(payload.trip.days)?payload.trip:payload;
   const imported=prepareTrip(validateTrip(candidate));
   await saveQueue;
   const previousState=state,previousId=activeTripId;
   state=imported;activeTripId=uid();save();
   const newId=activeTripId;
   if(!await saveQueue){library.delete(newId);state=previousState;activeTripId=previousId;throw Error('שמירת הטיול נכשלה. בדוק מקום פנוי באחסון הדפדפן. הטיול הקודם לא הוחלף.')}
   closeDrawer();applyCurrentTrip();
   toast('הטיול יובא ונשמר בספרייה. הטיולים האחרים נשארו ללא שינוי.');
  }catch(err){console.error('RONNY import failed',err);toast('לא ניתן לייבא: '+(err?.message||'שגיאה לא ידועה'))}
  finally{if(btn?.isConnected)btn.disabled=false;e.target.value=''}
 };
 $('new-trip').onclick=()=>createTrip();
 $('rail-library').onclick=()=>{showLibrary();setRail('library')};$('rail-saved-places').onclick=()=>{showSavedPlaceLibrary();setRail('saved-places')};
 const navRail=document.querySelector('.rail');
 navRail?.querySelectorAll('.rail-btn').forEach(button=>{
  button.dataset.railTooltip=button.getAttribute('title')||button.getAttribute('aria-label')||'';
  button.removeAttribute('title');
 });
 if(navRail){let lastFrame=0;
  navRail.addEventListener('pointermove',e=>{
   if(e.pointerType==='touch'||lastFrame)return;
   const box=navRail.getBoundingClientRect(),x=e.clientX-box.left,y=e.clientY-box.top;
   lastFrame=requestAnimationFrame(()=>{navRail.style.setProperty('--rail-hover-x',x+'px');navRail.style.setProperty('--rail-hover-y',y+'px');navRail.classList.add('is-pointer-active');lastFrame=0});
  },{passive:true});
  navRail.addEventListener('pointerleave',()=>{navRail.classList.remove('is-pointer-active')});
 }
 $('planner-ribbon-open')?.addEventListener('click',()=>setPlannerCollapsed(false));

}
// ---- RONNY 3: timeline sections ----
const segmentPalette=['#0cae9e','#6380c4','#c08447','#aa68b9','#db6a80','#507f71','#63758b'];
function segmentFor(s,dayIndex=selectedDay){
 const segs=state.days[dayIndex]?.segments||[];
 if(s.segmentId){const manual=segs.find(seg=>seg.id===s.segmentId);if(manual)return manual}
 return segs.find(seg=>s.time&&s.time>=seg.start&&s.time<seg.end)||null;
}
function renderSegmentChips(){
 const el=$('segment-chips');if(!el)return;
 const segs=state.days[selectedDay]?.segments||[];
 el.innerHTML=segs.length?segs.map(seg=>`<span class="segment-chip" title="${esc(seg.start)}–${esc(seg.end)}"><i style="background:${seg.color}"></i>${esc(seg.label)} ${esc(seg.start)}–${esc(seg.end)}</span>`).join(''):'';
}
function manageSegments(){
 const day=state.days[selectedDay];let parts=(day.segments||[]).map(v=>({...v}));
 const body='<div class="footnote">הגדר חלונות שעות ליום. עצירות משויכות אוטומטית לפי שעת ההגעה, או ידנית מתוך עריכת העצירה. צבע המקטע מסומן גם במפה.</div><div id="segment-editor"></div><button class="btn btn-soft" id="segment-add">+ הוספת מקטע</button>';
 openDrawer('מקטעי הזמן של יום '+(selectedDay+1),'TIME SEGMENTS','חלוקה לפי שעות, כולל צבע על המפה',body,'<button class="btn btn-primary" id="segment-save">שמירת המקטעים</button>');
 const redraw=()=>{
  $('segment-editor').innerHTML=parts.map((seg,i)=>`<div class="segment-row" data-seg="${i}"><div style="display:flex;align-items:center;gap:6px"><span class="segment-swatch" style="background:${esc(seg.color)}"></span><input aria-label="שם המקטע" class="seg-label" maxlength="45" value="${esc(seg.label)}"></div><div class="ronny-time-control"><input type="text" class="ronny-time-input seg-start" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="5" pattern="[0-2][0-9]:[0-5][0-9]" aria-label="שעת התחלה בפורמט 24 שעות" value="${esc(seg.start)}"><button type="button" class="ronny-time-trigger" aria-label="פתח בורר שעות (24 שעות)" title="בחירת שעה, 24 שעות">${icon('clock','small-icon')}</button></div><div class="ronny-time-control"><input type="text" class="ronny-time-input seg-end" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="5" pattern="[0-2][0-9]:[0-5][0-9]" aria-label="שעת סיום בפורמט 24 שעות" value="${esc(seg.end)}"><button type="button" class="ronny-time-trigger" aria-label="פתח בורר שעות (24 שעות)" title="בחירת שעה, 24 שעות">${icon('clock','small-icon')}</button></div><button class="micro seg-remove" aria-label="הסר מקטע">${icon('x')}</button></div>`).join('')||'<div class="footnote">לא הוגדרו עדיין מקטעי זמן.</div>';
  $('segment-editor').querySelectorAll('[data-seg]').forEach(el=>{const i=+el.dataset.seg;el.querySelector('.seg-label').oninput=e=>parts[i].label=e.target.value;el.querySelector('.seg-start').oninput=e=>parts[i].start=e.target.value;el.querySelector('.seg-end').oninput=e=>parts[i].end=e.target.value;el.querySelector('.seg-remove').onclick=()=>{parts.splice(i,1);redraw()}});refreshIcons();
 };
 $('segment-add').onclick=()=>{if(parts.length>=15){toast('מקסימום 15 מקטעים ליום');return}const i=parts.length;parts.push({id:uid(),label:['בוקר','צהריים','אחר הצהריים','ערב'][i]||'מקטע '+(i+1),start:['08:00','12:00','16:00','19:00'][i]||'09:00',end:['12:00','16:00','19:00','23:00'][i]||'12:00',color:segmentPalette[i%segmentPalette.length]});redraw()};
 $('segment-save').onclick=()=>{if(parts.some(seg=>!seg.label.trim()||!seg.start||!seg.end||seg.end<=seg.start)){toast('כל מקטע חייב שם ושעת סיום מאוחרת משעת ההתחלה');return}parts.sort((a,b)=>a.start.localeCompare(b.start));day.segments=parts;for(const s of day.stops){if(s.segmentId&&!parts.some(seg=>seg.id===s.segmentId))s.segmentId=''}save();closeDrawer();renderAll();toast('מקטעי היום נשמרו')};
 redraw();
}
function updateMapHint(){const el=$('map-hint');if(ronnyMeasure.active){el.hidden=false;el.textContent='מדידה: לחץ להוספת נקודה, גרור לשרטוט חופשי, או לחץ סיום. Esc לסיום.'}else if(outlineMoveModeId){el.hidden=false;el.textContent='הזזת יעד במתאר: לחץ על המיקום החדש במפה. Esc לביטול.'}else if(newTripSetupDraft){el.hidden=false;el.textContent='טיול חדש: לחץ על המפה לבחירת מרכז הטיול, או Esc לביטול.'}else if(forcedRelocateSession){el.hidden=false;el.textContent='שינוי מיקום מעבר הכרחי: לחץ על מיקום חדש במפה, או גרור את סמן האילוץ. Esc לביטול.'}else if(forcedPointSession){el.hidden=false;el.textContent='סמן מעברי אילוץ על המפה. נקודות אלה אינן עצירות והניווט יעבור דרכן לפי הסדר.'}else if(pointMoveModeId){el.hidden=false;el.textContent='הזזת נקודה: גרור את הסמן המודגש או לחץ על מיקום חדש במפה. Esc לביטול.'}else if(drawLegSession){el.hidden=false;el.textContent='שרטט תוואי: לחץ על המפה להוספת נקודות ביניים. סיים בסרגל התחתון.'}else if(homePickMode){el.hidden=false;el.textContent='בחר נקודת פתיחה: לחץ על המפה כדי לשמור מיקום פתיחה; Escape לביטול.'}else if(photoPlacement){el.hidden=false;el.textContent='לחץ על הנקודה במפה שבה ברצונך להצמיד את התמונה. Escape לביטול.'}else if(routeEdit){el.hidden=false;el.textContent='גרור סיכות, או את עיגולי + שבין העצירות כדי לעצב את הנתיב. לחיצה על קו תוסיף נקודת מעבר.'}else if(quickStreetMode){el.hidden=false;el.textContent='מצב Street View פעיל: לחץ על מקום במפה לפתיחת Google בטאב חדש. לחץ שוב על ״סטריט ויו״ לסיום.'}else el.hidden=true}
// ---- RONNY 3: route reshaping ----
function nearestLegIndex(lat,lng){const pts=stops();if(pts.length<2)return Math.max(0,pts.length-1);let best=Infinity,at=0;for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1],x=lng*Math.cos(lat*Math.PI/180),y=lat,x1=+a.lng*Math.cos(lat*Math.PI/180),y1=+a.lat,x2=+b.lng*Math.cos(lat*Math.PI/180),y2=+b.lat;const t=Math.max(0,Math.min(1,((x-x1)*(x2-x1)+(y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2||1)));const dist=(x-(x1+t*(x2-x1)))**2+(y-(y1+t*(y2-y1)))**2;if(dist<best){best=dist;at=i}}return at}
function minutesOf(time){const [h,m]=String(time||'09:00').split(':').map(Number);return (Number.isFinite(h)?h:9)*60+(Number.isFinite(m)?m:0)}
function timeOf(m){const t=Math.max(0,Math.min(1439,Math.round(m)));return `${String(Math.floor(t/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`}
function addViaPoint(lat,lng,afterIndex=null){if(viewScope==='all'){toast('בחר יום לעריכת המסלול');return}const arr=stops();const index=afterIndex===null?nearestLegIndex(lat,lng):afterIndex;const anchor=arr[index];const next=arr[index+1];const midpoint=next?Math.round((minutesOf(anchor.time)+minutesOf(next.time))/2):minutesOf(anchor?.time)+5;
 arr.splice(index+1,0,{id:uid(),name:'נקודת מעבר',autoViaName:true,type:'via',lat:+lat.toFixed(6),lng:+lng.toFixed(6),time:timeOf(midpoint),duration:0,cost:0,notes:'',segmentId:anchor?.segmentId||''});commitRouteOrder(selectedDay,arr);positionRouteEndpoints(state.days[selectedDay]);invalidate();retimeAfterOrderChange(selectedDay);save();renderAll();toast('נוספה נקודת מעבר. הנתיב מתעדכן לפי מיקומה')}
function renderViaHandles(){if(!viaLayer)return;viaLayer.clearLayers();if(drawLegSession||activeDrawEditLeg!==null){renderDrawVertices();if(drawLegSession)renderDrawBanner();return}if(!routeEdit||viewScope!=='day'||googleMode)return;const arr=stops();
 for(let i=0;i<arr.length-1;i++){
  const a=arr[i],b=arr[i+1],lat=(+a.lat+(+b.lat))/2,lng=(+a.lng+(+b.lng))/2;
  const ico=L.divIcon({html:'<div class="via-handle">+</div>',className:'',iconSize:[20,20],iconAnchor:[10,10]});
  const m=L.marker([lat,lng],{icon:ico,draggable:true,autoPan:true,title:'גרור כדי לשנות את מסלול הנסיעה'}).addTo(viaLayer);
  m.on('dragend',e=>{const p=e.target.getLatLng();addViaPoint(p.lat,p.lng,i)});
  m.bindTooltip('גרור דרך נקודת ביניים',{direction:'top'});
  const line=L.polyline([[+a.lat,+a.lng],[+b.lat,+b.lng]],{color:'#0b9990',opacity:0.06,weight:18}).addTo(viaLayer);
  line.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);addViaPoint(e.latlng.lat,e.latlng.lng,i)});
 }
}
// ---- RONNY 3: local photo journal ----
function scaledPhoto(file){return new Promise((resolve,reject)=>{if(!file.type.startsWith('image/')){reject(Error('לא מדובר בקובץ תמונה'));return}if(file.size>18*1024*1024){reject(Error('תמונה גדולה מ־18MB'));return}const blobUrl=URL.createObjectURL(file),img=new Image();img.onload=()=>{try{const w=img.naturalWidth,h=img.naturalHeight,ratio=Math.min(1,850/Math.max(w,h));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(w*ratio));canvas.height=Math.max(1,Math.round(h*ratio));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const data=canvas.toDataURL('image/jpeg',.69);resolve(data)}catch(e){reject(e)}finally{URL.revokeObjectURL(blobUrl)}};img.onerror=()=>{URL.revokeObjectURL(blobUrl);reject(Error('לא ניתן לפתוח את התמונה'))};img.src=blobUrl})}
async function handlePhotos(files,point){let added=0;for(const f of files.slice(0,15)){try{const data=await scaledPhoto(f);if(data.length>580000)throw Error('התמונה גדולה מדי גם לאחר דחיסה');const center=point||map?.getCenter()||{lat:46.75,lng:8.12};const photo={id:uid(),name:f.name.slice(0,80),caption:'',day:selectedDay,lat:+center.lat,lng:+center.lng,data};if(usingFallback&&JSON.stringify({...state,photos:[...state.photos,photo]}).length>3800000)throw Error('האחסון המקומי הגיע למגבלה. ייצא גיבוי וצמצם תמונות.');state.photos.push(photo);added++}catch(e){toast('תמונה לא נוספה: '+e.message);break}}
 if(added){save();renderPhotos();toast(added+' תמונות נוספו למפה. ניתן לגרור כל תמונה למקום הרצוי')} }
function renderPhotos(){if(!photoLayer||!map)return;photoLayer.clearLayers();if(!layerOn('photos'))return;state.photos.filter(p=>ronnyVisibleDayIndices().includes(p.day)).forEach(p=>{if(!validPoint(p))return;const img=L.divIcon({html:`<div class="photo-pin"><img src="${p.data}" alt=""></div>`,className:'',iconSize:[57,61],iconAnchor:[27,60]});const m=L.marker([p.lat,p.lng],{icon:img,draggable:true,autoPan:true}).addTo(photoLayer);
 m.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);openPhoto(p.id)});
 m.on('dragend',e=>{const xy=e.target.getLatLng();p.lat=+xy.lat.toFixed(6);p.lng=+xy.lng.toFixed(6);save();renderPhotos();toast('התמונה הוצמדה למיקום החדש')});m.bindTooltip(esc(p.caption||p.name),{direction:'top'})})}
function openPhoto(id){const p=state.photos.find(x=>x.id===id);if(!p)return;openDrawer('תמונה מהטיול','PHOTO JOURNAL',`יום ${p.day+1} · ${dayDate(p.day)}`,`<img src="${p.data}" alt="" style="width:100%;border-radius:14px;max-height:330px;object-fit:contain;background:#f0f5f7"><div class="field" style="margin-top:18px"><label>כיתוב ותיעוד</label><textarea id="photo-caption" maxlength="300">${esc(p.caption||'')}</textarea></div><div class="field"><label>יום בטיול</label><select id="photo-day">${state.days.map((d,i)=>`<option value="${i}" ${i===p.day?'selected':''}>יום ${i+1} · ${esc(d.label)}</option>`).join('')}</select></div><div class="footnote">גרור את סיכת התמונה על המפה כדי לשנות מיקום. התמונות נשמרות מקומית וייכללו בגיבוי JSON.</div>`,`<button class="btn danger-btn" id="photo-delete">מחיקה</button><button class="btn btn-primary" id="photo-save">שמירה</button>`);
 $('photo-save').onclick=()=>{p.caption=$('photo-caption').value.slice(0,300);p.day=+$('photo-day').value;save();closeDrawer();renderPhotos();toast('התמונה עודכנה')};$('photo-delete').onclick=async()=>{if(!await confirmOnMap('למחוק את התמונה מהמפה?',{title:'מחיקת תמונה',accept:'מחק תמונה'}))return;state.photos=state.photos.filter(x=>x.id!==id);save();closeDrawer();renderPhotos();toast('התמונה נמחקה')};}
function showPhotos(){const list=state.photos;openDrawer('אלבום טיול','PHOTO JOURNAL','תמונות שמוצמדות למיקום על המפה',`<p class="footnote">ניתן לגרור ולשחרר תמונות על המפה, להדביק באמצעות Ctrl+V או להעלות מקובץ. לחיצה על סיכת תמונה פותחת פרטים.</p>${list.map(p=>`<button class="photo-row" style="width:100%;background:white;text-align:right" data-ph="${esc(p.id)}"><img src="${p.data}" alt=""><span><strong style="display:block;font-size:12px">${esc(p.caption||p.name)}</strong><small>יום ${p.day+1}</small></span></button>`).join('')||'<div class="no-stops">עדיין אין תמונות בטיול</div>'}`,`<button class="btn btn-primary" id="gallery-add">הוספת תמונות</button>`);
 $('gallery-add').onclick=()=>{$('photo-file').click()};$('drawer-body').querySelectorAll('[data-ph]').forEach(b=>b.onclick=()=>openPhoto(b.dataset.ph))}
function activatePhotoInput(){document.addEventListener('paste',async e=>{if(e.target.closest('input,textarea,[contenteditable]'))return;const files=Array.from(e.clipboardData?.files||[]).filter(f=>f.type.startsWith('image/'));if(files.length){e.preventDefault();await handlePhotos(files,null)}});
 const pane=document.querySelector('.map-pane');pane.addEventListener('dragover',e=>{if(Array.from(e.dataTransfer?.types||[]).includes('Files')){e.preventDefault();e.dataTransfer.dropEffect='copy'}});pane.addEventListener('drop',async e=>{const files=Array.from(e.dataTransfer?.files||[]).filter(f=>f.type.startsWith('image/'));if(!files.length)return;e.preventDefault();const rect=$('map').getBoundingClientRect();const xy=map?.containerPointToLatLng([e.clientX-rect.left,e.clientY-rect.top]);await handlePhotos(files,xy||null)});
}
// ---- RONNY 3: two adjustable panel widths ----
function setupResizers(){const root=document.documentElement;const setWidth=(which,n)=>{const rail=which==='rail';const max=rail?76:Math.min(740,window.innerWidth-(+state.settings.railWidth||54)-260);const val=Math.max(rail?50:315,Math.min(max,Math.round(n)));state.settings[rail?'railWidth':'plannerWidth']=val;root.style.setProperty(rail?'--rail-width':'--planner-width',val+'px')};
 if(+state.settings.railWidth===72)state.settings.railWidth=54;setWidth('rail',+state.settings.railWidth||54);setWidth('planner',+state.settings.plannerWidth||430);
 for(const which of ['rail','planner']){const el=$(which+'-resizer');let pointer=null,startX=0,startW=0,wasCollapsed=false,didDrag=false;
 el.addEventListener('pointerdown',e=>{if(innerWidth<=760)return;pointer=e.pointerId;startX=e.clientX;startW=+state.settings[which+'Width'];wasCollapsed=which==='planner'&&document.querySelector('.app').classList.contains('planner-collapsed');didDrag=false;document.body.classList.add('resizing');el.classList.add('dragging');el.setPointerCapture(pointer);e.preventDefault()});
 el.addEventListener('pointermove',e=>{if(pointer!==e.pointerId)return;const delta=e.clientX-startX;if(Math.abs(delta)>5)didDrag=true;if(wasCollapsed&&which==='planner')return;if(!didDrag)return;setWidth(which,startW+(which==='rail'?delta:-delta));map?.invalidateSize();if(googleMode&&window.google&&googleMap)google.maps.event.trigger(googleMap,'resize')});
 const end=e=>{if(pointer===null)return;const click=!didDrag&&which==='planner'&&e.type==='pointerup';pointer=null;document.body.classList.remove('resizing');el.classList.remove('dragging');if(click)setPlannerCollapsed(!document.querySelector('.app').classList.contains('planner-collapsed'));else if(didDrag){save();map?.invalidateSize()}};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);el.addEventListener('lostpointercapture',end);
 if(which==='rail')el.addEventListener('dblclick',()=>{setWidth(which,54);save();map?.invalidateSize()});
 el.addEventListener('keydown',e=>{if(which==='planner'&&['Enter',' '].includes(e.key)){e.preventDefault();setPlannerCollapsed(!document.querySelector('.app').classList.contains('planner-collapsed'));return}if(!['ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();if(which==='planner'&&document.querySelector('.app').classList.contains('planner-collapsed'))setPlannerCollapsed(false);setWidth(which,+state.settings[which+'Width']+(which==='rail'?(e.key==='ArrowRight'?12:-12):(e.key==='ArrowLeft'?12:-12)));save();map?.invalidateSize()});
 }
 const drawerHandle=$('drawer-resizer');let drawerStartX=0,drawerStartWidth=0,drawerPointer=null;
 document.documentElement.style.setProperty('--drawer-width',(+state.settings.drawerWidth||440)+'px');
 drawerHandle.addEventListener('pointerdown',e=>{if(innerWidth<=760)return;drawerPointer=e.pointerId;drawerStartX=e.clientX;drawerStartWidth=+state.settings.drawerWidth||440;drawerHandle.setPointerCapture(drawerPointer);document.body.classList.add('resizing');e.preventDefault()});
 drawerHandle.addEventListener('pointermove',e=>{if(e.pointerId!==drawerPointer)return;const next=Math.min(740,Math.max(330,drawerStartWidth+e.clientX-drawerStartX));state.settings.drawerWidth=Math.round(next);document.documentElement.style.setProperty('--drawer-width',next+'px')});
 const stopDrawerResize=()=>{drawerPointer=null;document.body.classList.remove('resizing');save()};drawerHandle.addEventListener('pointerup',stopDrawerResize);drawerHandle.addEventListener('pointercancel',stopDrawerResize);
 drawerHandle.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();state.settings.drawerWidth=Math.min(740,Math.max(330,(+state.settings.drawerWidth||440)+(e.key==='ArrowRight'?16:-16)));document.documentElement.style.setProperty('--drawer-width',state.settings.drawerWidth+'px');save()}});
 window.addEventListener('resize',()=>{if(innerWidth>760){setWidth('rail',+state.settings.railWidth||54);setWidth('planner',+state.settings.plannerWidth||430)}map?.invalidateSize()})
}
// ---- RONNY 3: real Google Street View coverage (Google map, not OSM overlay) ----
function loadGoogleApi(key){if(window.google?.maps)return Promise.resolve();if(googleScriptLoading)return googleScriptLoading;googleScriptLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');const timer=setTimeout(()=>reject(Error('טעינת Google Maps התארכה. בדוק אינטרנט ומפתח API.')),15000);script.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(key)+'&v=weekly&libraries=streetView&loading=async';script.async=true;script.onload=()=>{clearTimeout(timer);window.google?.maps?resolve():reject(Error('Google Maps לא נטען'))};script.onerror=()=>{clearTimeout(timer);reject(Error('החיבור ל-Google Maps נכשל'))};document.head.append(script)});return googleScriptLoading}
async function toggleGoogleCoverage(){if(googleMode){googleMode=false;document.querySelector('.map-pane').classList.remove('google-mode');$('google-coverage-toggle').setAttribute('aria-pressed','false');map?.invalidateSize();return}
 const key=state.settings.googleKey?.trim();if(!key){openSettings('google');toast('נדרש מפתח Google עם Maps JavaScript API ו־Maps Embed API');return}
 $('google-coverage-toggle').disabled=true;try{await loadGoogleApi(key);googleApiKeyLoaded=key;const center=map?.getCenter()||{lat:46.75,lng:8.12};if(!googleMap){googleMap=new google.maps.Map($('google-coverage-map'),{center:{lat:center.lat,lng:center.lng},zoom:Math.max(2,map?.getZoom()||9),streetViewControl:true,fullscreenControl:true,mapTypeControl:true});const svLib=await google.maps.importLibrary('streetView');googleCoverage=new svLib.StreetViewCoverageLayer();googleCoverage.setMap(googleMap);googleMap.addListener('click',e=>{if(e.latLng)openStreetView(e.latLng.lat(),e.latLng.lng())})}
 googleMode=true;document.querySelector('.map-pane').classList.add('google-mode');$('google-coverage-toggle').setAttribute('aria-pressed','true');google.maps.event.trigger(googleMap,'resize');googleMap.setCenter({lat:center.lat,lng:center.lng});googleMap.setZoom(Math.max(2,map?.getZoom()||9));updateGoogleMap();toast('קווי Street View הזמינים מסומנים בכחול במפת Google. ניתן להשתמש גם באיש הצהוב.')
 }catch(e){toast(e.message||'מפת הכיסוי לא נטענה')}finally{$('google-coverage-toggle').disabled=false}}
function updateGoogleMap(){if(!googleMap||!window.google)return;googleMarkers.forEach(m=>m.setMap(null));googleMarkers=[];const rows=currentStopsForMap().filter(x=>validPoint(x.stop));for(const {stop:s,di} of rows){const m=new google.maps.Marker({map:googleMap,position:{lat:+s.lat,lng:+s.lng},title:(di+1)+'. '+s.name});m.addListener('click',()=>focusStop(s.id));googleMarkers.push(m)}
 for(const d of (viewScope==='all'?state.days:[state.days[selectedDay]])){const route=d.stops.filter(s=>!isMapOnlyPoint(s)&&validPoint(s));if(route.length<2)continue;const pts=route.map(s=>({lat:+s.lat,lng:+s.lng}));const poly=new google.maps.Polyline({map:googleMap,path:pts,strokeColor:'#089f93',strokeOpacity:.92,strokeWeight:4});googleMarkers.push(poly)} }
// ---- RONNY 3: printable maps & timetable — browser PDF printing ----
function openPrintDialog(){const body=`<div class="api-intro"><strong>ייצוא PDF בעזרת הדפדפן</strong><p>נפתח דף הדפסה מעוצב עם מפה אינטראקטיבית ו/או לוח הזמנים. בחר ״שמירה כ־PDF״ בחלון ההדפסה. המפה דורשת אינטרנט כדי לטעון את אריחי הרקע.</p></div><div class="field"><label>פריסת המסמך</label><select id="print-layout"><option value="both-vertical">מפה מעל לו״ז — לאורך</option><option value="both-horizontal">מפה ולו״ז זה לצד זה — לרוחב</option><option value="map">מפה בלבד</option><option value="schedule">לו״ז בלבד</option></select></div><div class="field"><label>תכולת המסמך</label><select id="print-scope"><option value="day">היום הנבחר בלבד</option><option value="all">כל ימי הטיול — עמוד לכל יום</option></select></div><p class="footnote">נקודות המעבר, מקטעי השעות, התמונות והסדר המעודכן נכללים בתוצר. זמני הנסיעה מבוססים על ההערכות שנשמרו בתכנון, ואינם הבטחת זמן אמת.</p>`;
 openDrawer('ייצוא מפה ולוח זמנים','PDF / PRINT','בחר פריסה ותוכן',body,`<button class="btn btn-primary" id="print-generate">הצג והדפס ל־PDF</button>`);
 $('print-generate').onclick=()=>{const layout=$('print-layout').value,scope=$('print-scope').value;buildPrintable(layout,scope)};
}
function printHtmlEscape(s){return esc(s)}
function buildPrintable(layout,scope){const w=window.open('','_blank');if(!w){toast('חלון ההדפסה נחסם. אפשר חלונות קופצים ונסה שוב.');return}
 const days=scope==='all'?state.days.map((d,i)=>({d,i})):[{d:state.days[selectedDay],i:selectedDay}];const isMap=layout!=='schedule',isSchedule=layout!=='map';const layoutCls=layout==='both-horizontal'?'horizontal':'vertical';
 const sections=days.map(({d,i})=>{const rows=d.stops.filter(s=>!isMapOnlyPoint(s)).map((s,idx)=>{const seg=segmentFor(s,i);return `<tr><td>${printHtmlEscape(s.time||'')}</td><td><strong>${printHtmlEscape(s.name)}</strong>${idx>0&&s.leg&&s.leg.fromId===d.stops[idx-1].id&&s.leg.label?`<div class="seg">דרך: ${printHtmlEscape(s.leg.label)}</div>`:''}${seg?`<div class="seg">${printHtmlEscape(seg.label)}</div>`:''}</td><td>${printHtmlEscape(types[s.type]?.name||'עצירה')}</td><td>${s.duration?minsFmt(+s.duration):'—'}</td><td>${money(s.cost)}</td></tr>`}).join('');const photos=state.photos.filter(p=>p.day===i);return `<section class="page"><header class="page-header"><strong class="brand">RONNY.</strong><div><h1>${printHtmlEscape(state.title)} — יום ${i+1}</h1><p>${printHtmlEscape(dayDate(i))} · ${printHtmlEscape(d.label||'')} · ${d.stops.length} נקודות</p></div></header><div class="report-grid ${layoutCls}">${isMap?`<article class="map-card"><div class="subhead">מפת מסלול · יום ${i+1}</div><div class="export-map" id="print-map-${i}"></div><div class="map-caption">מפת רקע על בסיס שירות המפות הפעיל, והמסלול מצויר בין נקודות התכנון. קווים אינם בהכרח נתיבי כביש.</div></article>`:''}${isSchedule?`<article class="schedule-card"><div class="subhead">לוח זמנים מפורט</div><table><thead><tr><th>שעה</th><th>מקום</th><th>סוג</th><th>משך</th><th>עלות</th></tr></thead><tbody>${rows||'<tr><td colspan="5">לא תוכננו עצירות ליום זה</td></tr>'}</tbody></table>${photos.length?`<div class="photo-strip">${photos.slice(0,5).map(p=>`<figure><img src="${p.data}" alt=""><figcaption>${printHtmlEscape(p.caption||p.name)}</figcaption></figure>`).join('')}</div>`:''}</article>`:''}</div><footer>נוצר באמצעות RONNY · ${new Date().toLocaleDateString('he-IL')} · הערכות בלבד</footer></section>`}).join('');
   let tileUrl='https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',tileMax=19,attrib='Tiles © Esri and contributors';
  const style=normalizeMapStyle(state.settings.mapStyle);let printLabelsUrl='';
  if(style==='topo'){tileUrl='https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png';tileMax=17;attrib='© OpenStreetMap contributors · © OpenTopoMap'}
  else if(style==='esri-topo'){tileUrl='https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}';attrib='Tiles © Esri and contributors'}
  else if(style==='satellite'||style==='satellite-labels'){tileUrl='https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';attrib='Tiles © Esri and contributors';if(style==='satellite-labels')printLabelsUrl='https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'}
const payload={printRoadsUrl:style==='satellite-labels'?'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}':'',days:days.map(({d,i})=>({i,points:d.stops.filter(validPoint).map(s=>({lat:+s.lat,lng:+s.lng,name:s.name,type:s.type,seg:pointColor(s,i),id:s.id})),legs:routeStopsForDay(i).slice(1).map((s,j)=>({mode:legAt(j+1,routeStopsForDay(i)).mode,label:legAt(j+1,routeStopsForDay(i)).label||'',color:pointColor(s,i),points:(i===selectedDay&&paintedLegCoordinates.get(j+1))||([[+routeStopsForDay(i)[j].lat,+routeStopsForDay(i)[j].lng],...(legAt(j+1,routeStopsForDay(i)).mode==='auto'?legAt(j+1,routeStopsForDay(i)).viaPoints||[]:legAt(j+1,routeStopsForDay(i)).path||[]),[+s.lat,+s.lng]])})),poiLinks:poiLinksForDay(i).map(({point,nearest})=>({a:[+point.lat,+point.lng],b:[+nearest.lat,+nearest.lng],color:pointColor(point,i)})),photos:state.photos.filter(p=>p.day===i).map(p=>({lat:+p.lat,lng:+p.lng,data:p.data}))})),tileUrl,tileMax,attrib,printLabelsUrl};
 const safeJSON=JSON.stringify(payload).replace(/</g,'\\u003c');const printCss=`*{box-sizing:border-box}body{direction:rtl;font-family:Calibri,Carlito,Arial,sans-serif;margin:0;background:#eef2f5;color:#182e40}#toolbar{position:sticky;top:0;z-index:2000;display:flex;gap:15px;align-items:center;padding:12px 22px;background:#152c3e;color:white}#toolbar button{border:0;border-radius:9px;background:#0daf9c;color:white;font:700 14px Calibri,Arial;padding:10px 17px;cursor:pointer}#toolbar small{color:#cae3e5}.page{background:white;width:min(1180px,96%);min-height:720px;margin:22px auto;padding:22px 26px;box-shadow:0 8px 34px #0001;break-after:page;page-break-after:always}.page-header{display:flex;align-items:center;gap:23px;border-bottom:2px solid #dce9ed;padding-bottom:12px}.brand{font-size:25px;color:#0aab9d;letter-spacing:2px}.page h1{font-size:20px;margin:0}.page p{font-size:12px;color:#667c8e;margin:5px 0}.report-grid{display:grid;gap:20px;margin-top:18px}.report-grid.vertical{grid-template-columns:1fr}.report-grid.horizontal{grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);direction:ltr}.report-grid.horizontal>*{direction:rtl}.subhead{font-size:15px;font-weight:800;margin-bottom:9px}.export-map{width:100%;height:400px;border-radius:12px;overflow:hidden;background:#dae5e9;direction:ltr}.horizontal .export-map{height:570px}.map-caption{color:#7d8c98;font-size:10px;margin-top:8px}.schedule-card{min-width:0}table{width:100%;border-collapse:collapse;font-size:12px}th{text-align:right;background:#e9f5f2;padding:10px 7px}td{border-bottom:1px solid #e7eef1;padding:10px 7px;vertical-align:top}td:first-child{direction:ltr;text-align:right;font-weight:800;color:#087d78}.seg{font-size:10px;color:#68809a;margin-top:4px}.photo-strip{display:flex;gap:9px;margin-top:12px}.photo-strip figure{margin:0;flex:1;min-width:0}.photo-strip img{height:82px;width:100%;object-fit:cover;border-radius:6px}.photo-strip figcaption{font-size:10px;color:#536b7e}footer{margin-top:18px;font-size:10px;color:#93a3b0;text-align:center}@media print{@page{size:A4 ${layout==='both-horizontal'||layout==='map'?'landscape':'portrait'};margin:10mm}body{background:white!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}#toolbar{display:none}.page{width:100%;padding:0;margin:0;min-height:0;box-shadow:none}.export-map{height:${layout==='both-horizontal'?'145mm':layout==='map'?'160mm':'97mm'}!important}.report-grid.horizontal{grid-template-columns:1.05fr 1fr}.map-card,.schedule-card{break-inside:avoid}th{background:#e9f5f2!important}.leaflet-control-container{font-size:9px}}`;
 const doc='<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><title>RONNY — '+printHtmlEscape(state.title)+'</title><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>'+printCss+'</style></head><body><div id="toolbar"><button onclick="window.print()">הדפס / שמור כ־PDF</button><small>בתיבת ההדפסה בחר ״שמירה כ־PDF״. יש לוודא שהמפה נטענה לפני ההדפסה.</small></div>'+sections+'<scr'+'ipt src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><'+'/script><scr'+'ipt>const EXPORT='+safeJSON+';function setup(){if(!window.L){document.querySelectorAll(".export-map").forEach(el=>el.textContent="לא ניתן לטעון את מפת הרקע. נדרש חיבור אינטרנט.");return}for(const day of EXPORT.days){const el=document.getElementById("print-map-"+day.i);if(!el)continue;const m=L.map(el,{zoomControl:false,scrollWheelZoom:false,dragging:false,attributionControl:true});L.tileLayer(EXPORT.tileUrl,{maxZoom:EXPORT.tileMax,attribution:EXPORT.attrib,subdomains:"abc"}).addTo(m);if(EXPORT.printRoadsUrl)L.tileLayer(EXPORT.printRoadsUrl,{maxZoom:19,attribution:"Roads © Esri and contributors",zIndex:8,opacity:.43}).addTo(m);if(EXPORT.printLabelsUrl)L.tileLayer(EXPORT.printLabelsUrl,{maxZoom:19,attribution:"Labels © Esri and contributors",zIndex:9,opacity:.84}).addTo(m);const pts=day.points;for(const p of pts)L.circleMarker([p.lat,p.lng],{radius:6,color:"#fff",weight:2,fillColor:p.seg,fillOpacity:1}).addTo(m).bindTooltip(p.name,{permanent:false});for(const connection of day.poiLinks||[])L.polyline([connection.a,connection.b],{color:connection.color,opacity:.52,weight:1.4,dashArray:"3 8",interactive:false}).addTo(m);for(const leg of day.legs||[]){const style=leg.mode==="draw"?{color:leg.color,weight:4}:leg.mode==="straight"?{color:leg.color,weight:3,dashArray:"8 8"}:{color:leg.color,weight:4,dashArray:"8 5"};L.polyline(leg.points,style).addTo(m);if(leg.label&&leg.points?.length>=2){const pts=leg.points,mid=pts[Math.floor(pts.length/2)];L.marker(mid,{interactive:false,icon:L.divIcon({className:"",html:"<span style=\"white-space:nowrap;background:#fff9ec;border:1px solid #a9ad98;padding:3px 6px;border-radius:6px;font:700 11px Calibri,Arial\">"+leg.label.replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))+"</span>",iconSize:[0,0]})}).addTo(m)}}for(const p of day.photos)L.marker([p.lat,p.lng],{icon:L.divIcon({html:"<div style=\\"width:35px;height:40px;background:#fff;padding:3px;box-shadow:0 1px 10px #2228\\"><img style=\\"width:100%;height:100%;object-fit:cover\\" src=\\""+p.data+"\\"></div>",className:"",iconSize:[35,40]})}).addTo(m);if(pts.length===1)m.setView([pts[0].lat,pts[0].lng],12);else if(pts.length)m.fitBounds(pts.map(p=>[p.lat,p.lng]),{padding:[25,25]});else m.setView([46.75,8.12],7);setTimeout(()=>m.invalidateSize(),200)}}document.addEventListener("DOMContentLoaded",setup);<'+'/script></body></html>';
 w.document.open();w.document.write(doc);w.document.close();closeDrawer();}


// RONNY 29.1 — locale-independent, 24-hour clock selector
function ronnyValidate24(s){return CoreTime.ronnyValidate24(s)}
function ronnyNormalize24(s){return CoreTime.ronnyNormalize24(s)}
function ronnyCloseTimeDialog(){const p=document.getElementById('ronny-time-dialog');if(p){if(p.open)p.close();p.remove()}}
function ronnyOpenTimeDialog(input){
 if(!input)return;ronnyCloseTimeDialog();
 const current=ronnyNormalize24(input.value)||ronnyValidate24(input.dataset.lastValid)||'09:00';const [hr,mi]=current.split(':');
 const pad=i=>String(i).padStart(2,'0');
 const hourOptions=Array.from({length:24},(_,i)=>`<option value="${pad(i)}" ${pad(i)===hr?'selected':''}>${pad(i)}</option>`).join('');
 const minOptions=Array.from({length:60},(_,i)=>`<option value="${pad(i)}" ${pad(i)===mi?'selected':''}>${pad(i)}</option>`).join('');
 const picker=document.createElement('dialog');picker.id='ronny-time-dialog';picker.className='ronny-time-dialog';
 picker.innerHTML=`<div class="ronny-time-heading"><span>בחירת שעה</span><span style="color:#758b79;font-size:12px;font-weight:700">24 שעות</span></div><div class="ronny-time-format">שעות ודקות · ללא AM/PM</div><div class="ronny-time-selects"><select id="ronny-hour" aria-label="שעה">${hourOptions}</select><span class="colon">:</span><select id="ronny-minute" aria-label="דקות">${minOptions}</select></div><div class="ronny-time-dialog-actions"><button class="ronny-time-apply" type="button">אישור</button><button class="ronny-time-cancel" type="button">ביטול</button></div>`;
 document.body.appendChild(picker);picker.addEventListener('close',()=>picker.remove(),{once:true});
 picker.querySelector('.ronny-time-apply').addEventListener('click',()=>{
   if(input.isConnected){const value=picker.querySelector('#ronny-hour').value+':'+picker.querySelector('#ronny-minute').value;input.value=value;input.dataset.lastValid=value;input.setAttribute('aria-invalid','false');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}
   ronnyCloseTimeDialog();
 });
 picker.querySelector('.ronny-time-cancel').addEventListener('click',ronnyCloseTimeDialog);
 picker.addEventListener('click',e=>{if(e.target===picker)ronnyCloseTimeDialog()});
 if(typeof picker.showModal==='function')picker.showModal();else picker.setAttribute('open','');
 picker.querySelector('#ronny-hour').focus();
}
// Delegation works also when the point editor and time segments are reconstructed.
document.addEventListener('click',e=>{const btn=e.target.closest('.ronny-time-trigger');if(!btn)return;e.preventDefault();e.stopPropagation();ronnyOpenTimeDialog(btn.closest('.ronny-time-control')?.querySelector('.ronny-time-input'))});
document.addEventListener('focusin',e=>{if(e.target.matches('.ronny-time-input'))e.target.dataset.lastValid=ronnyValidate24(e.target.value)||'09:00'});
document.addEventListener('input',e=>{if(!e.target.matches('.ronny-time-input'))return;if(ronnyValidate24(e.target.value)){e.target.dataset.lastValid=e.target.value;e.target.setAttribute('aria-invalid','false')}else e.stopImmediatePropagation()},true);
document.addEventListener('change',e=>{if(!e.target.matches('.ronny-time-input'))return;const normal=ronnyNormalize24(e.target.value);e.target.value=normal||e.target.dataset.lastValid||'09:00';e.target.dataset.lastValid=e.target.value;e.target.setAttribute('aria-invalid',normal?'false':'true')},true);
document.addEventListener('focusout',e=>{if(!e.target.matches('.ronny-time-input'))return;const normal=ronnyNormalize24(e.target.value);if(normal&&normal!==e.target.value){e.target.value=normal;e.target.dispatchEvent(new Event('change',{bubbles:true}))}else if(!normal){e.target.value=e.target.dataset.lastValid||'09:00';e.target.setAttribute('aria-invalid','false')}},true);
document.addEventListener('keydown',e=>{if(document.getElementById('ronny-time-dialog')?.open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();ronnyCloseTimeDialog()}},true);

// RONNY 33 — independent, privacy-preserving personal place library.
const PLACE_DB_NAME='ronny-personal-places-v1',PLACE_DB_STORE='snapshots',PLACE_BACKUP_KEY='ronny-places-local-backup-v1';
const PLACE_COLORS=['#678c75','#6f88b0','#b38357','#9378a4','#b46f79','#658e96','#a68f4f','#7c8e5e','#826b58','#5e8894'];
let savedPinPlacementId=null,savedPlaceDb=null,savedPlaces={lists:[],places:[]},savedPlaceLayer=null,savedPlacePreviewLayer=null,savedPreviewMode=false,selectedSavedList='all',savedPlaceFilter='',savedPlaceBusy=false,savedPlaceSaveQueue=Promise.resolve();
const validSavedLatLng=p=>p&&p.lat!==null&&p.lat!==undefined&&p.lat!==''&&p.lng!==null&&p.lng!==undefined&&p.lng!==''&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lng)&&Math.abs(+p.lat)<=90&&Math.abs(+p.lng)<=180;
function normalizeSavedPlaceData(obj){
 const lists=Array.isArray(obj?.lists)?obj.lists.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string').slice(0,250).map(x=>({id:x.id,name:x.name.slice(0,130),visible:x.visible!==false})):[];
 const ids=new Set(lists.map(l=>l.id));
 const places=Array.isArray(obj?.places)?obj.places.filter(x=>x&&ids.has(x.listId)&&typeof x.name==='string').slice(0,12000).map(x=>({id:String(x.id),listId:x.listId,name:x.name.slice(0,250),note:String(x.note||'').slice(0,2500),url:/^https:\/\//i.test(String(x.url||''))?String(x.url).slice(0,2500):'',lat:validSavedLatLng(x)?+x.lat:null,lng:validSavedLatLng(x)?+x.lng:null,positionSource:String(x.positionSource||'').slice(0,30)})):[];
 return {lists,places};
}
async function initSavedPlaces(){
 try{
  const db=await new Promise((resolve,reject)=>{
   if(!window.indexedDB)return reject(Error('IndexedDB לא זמין'));
   const q=indexedDB.open(PLACE_DB_NAME,1);
   q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(PLACE_DB_STORE))q.result.createObjectStore(PLACE_DB_STORE,{keyPath:'id'})};
   q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error||Error('שגיאת אחסון'));
  });
  savedPlaceDb=db;
  const record=await new Promise((resolve,reject)=>{
   const request=db.transaction(PLACE_DB_STORE,'readonly').objectStore(PLACE_DB_STORE).get('places');
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  if(record?.data)savedPlaces=normalizeSavedPlaceData(record.data);
  else {try{savedPlaces=normalizeSavedPlaceData(JSON.parse(localStorage.getItem(PLACE_BACKUP_KEY)||'{}'))}catch(e){}}
 }catch(e){try{savedPlaces=normalizeSavedPlaceData(JSON.parse(localStorage.getItem(PLACE_BACKUP_KEY)||'{}'))}catch(_){} }
}
function persistSavedPlaces(){
 const snapshot=JSON.parse(JSON.stringify(savedPlaces));
 savedPlaceSaveQueue=savedPlaceSaveQueue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
  if(!savedPlaceDb){try{localStorage.setItem(PLACE_BACKUP_KEY,JSON.stringify(snapshot));resolve()}catch(e){reject(e)};return}
  const tx=savedPlaceDb.transaction(PLACE_DB_STORE,'readwrite');tx.objectStore(PLACE_DB_STORE).put({id:'places',data:snapshot});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 })).catch(()=>toast('שמירת ספריית המקומות נכשלה — נא לגבות את נתוני הדפדפן'));
 return savedPlaceSaveQueue;
}
function csvRows(text){
 const src=String(text||'').replace(/^\uFEFF/,'');
 const firstLine=src.split(/\r?\n/).find(x=>x.trim())||'';
 const delim=['\t',',',';'].map(c=>({c,n:(firstLine.match(new RegExp(c==='\t'?'\\t':c===';'?';':',','g'))||[]).length})).sort((a,b)=>b.n-a.n)[0].c;
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(c==='"'){
   if(quoted&&src[i+1]==='"'){cell+='"';i++}else quoted=!quoted;
  }else if(c===delim&&!quoted){row.push(cell);cell=''}
  else if((c==='\r'||c==='\n')&&!quoted){row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';if(c==='\r'&&src[i+1]==='\n')i++}
  else cell+=c;
 }
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
function parseCoordinatePair(raw){return CoreGeo.parseCoordinatePair(raw)}
function googleMapCoordinates(url){
 const value=String(url||'');if(!/^https?:\/\//i.test(value))return null;
 let decoded=value;try{decoded=decodeURIComponent(value)}catch(e){}
 // Google's `!3d...!4d...` denotes a place's geographical coordinates.
 const exact=decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
 const exactReverse=decoded.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i);
 if(!exact&&exactReverse){const xy=parseCoordinatePair(exactReverse[2]+','+exactReverse[1]);if(xy)return {...xy,positionSource:'google-data'}}
 const atExplicit=decoded.match(/(?:[?&](?:q|query|destination|daddr)=|geo:)(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i);
 if(!exact&&atExplicit){const xy=parseCoordinatePair(atExplicit[1]+','+atExplicit[2]);if(xy)return {...xy,positionSource:'google-query'}}
 if(exact){const coords=parseCoordinatePair(exact[1]+','+exact[2]);if(coords)return {...coords,positionSource:'google-place'}}
 try{
  const u=new URL(value);
  for(const key of ['query','q','destination','daddr','ll']){
   const pair=parseCoordinatePair(u.searchParams.get(key)||'');
   if(pair)return {...pair,positionSource:'google-query'};
  }
 }catch(e){}
 // @lat,lng frequently identifies Google's viewport rather than the pin; deliberately skip it.
 return null;
}
function csvCollectionName(path){
 const name=String(path||'').split('/').pop().replace(/\.csv$/i,'').trim();
 return name.replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, '').replace(/[_]+/g,' ').trim().slice(0,130)||'רשימה מיובאת';
}
function normalizeCSVKey(key){return String(key||'').toLowerCase().replace(/\uFEFF/g,'').replace(/[\s_\-]+/g,'').replace(/[^a-z0-9\u0590-\u05ff]/g,'')}
function parseGoogleCSV(text,path){
 const allRows=csvRows(text);if(allRows.length<2)return [];
 // Official Google Saved exports may begin with collection_description and a blank line.
 const headerRow=allRows.findIndex(r=>r.map(normalizeCSVKey).some(h=>['title','name','placename'].includes(h))&&r.map(normalizeCSVKey).some(h=>['itemcontenturl','url','mapsurl','link'].includes(h)));
 if(headerRow<0)return [];const rows=allRows.slice(headerRow);
 const headings=rows[0].map(normalizeCSVKey);
 const index=(...aliases)=>headings.findIndex(x=>aliases.includes(x));
 const title=index('title','name','placename','שם','כותרת');
 const url=index('url','link','mapsurl','googlemapsurl','itemcontenturl','קישור');
 const note=index('note','notes','comment','description','collectiondescription','הערה','תיאור');
 const listIndex=index('collectiontitle','collectionname','listname','list','collection','רשימה');
 const latitude=index('latitude','lat','קו רוחב');const longitude=index('longitude','lng','lon','קו אורך');
 if(title<0||(url<0&&latitude<0))return [];
 const output=[];
 for(let i=1;i<rows.length&&i<14000;i++){
  const row=rows[i],name=String(row[title]||'').trim().slice(0,250),link=String(row[url]||'').trim();
  if(!name||/^(title|name)$/i.test(name))continue;
  const listName=(listIndex>=0?String(row[listIndex]||'').trim():'')||csvCollectionName(path);
  let geo=googleMapCoordinates(link);
  const lat=latitude>=0?Number(row[latitude]):NaN,lng=longitude>=0?Number(row[longitude]):NaN;
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&String(row[latitude]||'').trim()&&String(row[longitude]||'').trim())geo={lat,lng,positionSource:'csv'};
  output.push({name,note:note>=0?String(row[note]||'').trim().slice(0,2500):'',url:link,listName:listName.slice(0,130),lat:geo?.lat??null,lng:geo?.lng??null,positionSource:geo?.positionSource||''});
 }
 return output;
}
async function unzipTakeoutCSV(file){
 // Central directory supports ZIP exports that use local data descriptors.
 const data=new DataView(await file.arrayBuffer()),bytes=new Uint8Array(data.buffer),len=bytes.length;
 if(len>100*1024*1024)throw Error('הקובץ גדול מדי; חלץ את הארכיון וייבא את קובצי CSV');
 let eocd=-1;
 for(let i=len-22;i>=Math.max(0,len-65558);i--)if(data.getUint32(i,true)===0x06054b50){eocd=i;break}
 if(eocd<0)throw Error('ארכיון ZIP אינו תקין');
 const count=data.getUint16(eocd+10,true),offset=data.getUint32(eocd+16,true);if(count>1000)throw Error('יותר מדי קבצים בארכיון');
 let cursor=offset;const found=[];const decoder=new TextDecoder('utf-8');
 for(let i=0;i<count;i++){
  if(data.getUint32(cursor,true)!==0x02014b50)throw Error('טבלת ZIP אינה תקינה');
  const method=data.getUint16(cursor+10,true),packed=data.getUint32(cursor+20,true),raw=data.getUint32(cursor+24,true);
  const fn=data.getUint16(cursor+28,true),ex=data.getUint16(cursor+30,true),comment=data.getUint16(cursor+32,true),localOffset=data.getUint32(cursor+42,true);
  const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+fn));cursor+=46+fn+ex+comment;
  if(!/\.csv$/i.test(name)||!/(^|\/)(saved|lists|collections)\/|\.csv$/i.test(name))continue;
  if(packed>10*1024*1024||raw>25*1024*1024)continue;
  if(data.getUint32(localOffset,true)!==0x04034b50)continue;
  const start=localOffset+30+data.getUint16(localOffset+26,true)+data.getUint16(localOffset+28,true);
  if(start+packed>len)continue;
  const compressed=bytes.slice(start,start+packed);
  let output;
  if(method===0)output=compressed;
  else if(method===8&&typeof DecompressionStream==='function'){
   try{const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));output=new Uint8Array(await new Response(stream).arrayBuffer())}
   catch(e){throw Error('דחיסת ZIP אינה נתמכת בדפדפן הזה. חלץ את הארכיון וייבא את קובצי CSV')}
  }else throw Error('סוג דחיסת ZIP אינו נתמך. חלץ את הארכיון וייבא את קובצי CSV');
  found.push({name,text:decoder.decode(output)});
 }
 return found;
}
async function importSavedPlacesFiles(files){
 if(savedPlaceBusy)return;
 const list=Array.from(files||[]);if(!list.length)return;
 savedPlaceBusy=true;
 const button=$('saved-places-import');if(button)button.disabled=true;
 try{
  const batches=[];
  for(const file of list.slice(0,120)){
   if(/\.csv$/i.test(file.name)){if(file.size>25*1024*1024)throw Error('קובץ CSV גדול מדי');batches.push({name:file.name,text:await file.text()})}
   else if(/\.zip$/i.test(file.name))batches.push(...await unzipTakeoutCSV(file));
   else if(/\.json$/i.test(file.name)){
    // Google Maps' starred places often arrive as GeoJSON.
    const json=JSON.parse(await file.text());
    const features=Array.isArray(json.features)?json.features:[];
    const added=features.filter(f=>f.geometry?.type==='Point'&&Array.isArray(f.geometry.coordinates)).map(f=>({name:String(f.properties?.name||f.properties?.Title||'מקום שמור'),note:String(f.properties?.description||''),url:'',listName:csvCollectionName(file.name),lat:+f.geometry.coordinates[1],lng:+f.geometry.coordinates[0],positionSource:'geojson'}));
    batches.push({name:file.name,features:added});
   }
  }
  const imported=batches.flatMap(b=>b.features||parseGoogleCSV(b.text,b.name));
  if(!imported.length)throw Error('לא זוהו רשימות שמורות. יש לבחור ייצוא Saved מתוך Google Takeout');
  const existing=new Map(savedPlaces.places.map(p=>[p.listId+'|'+(p.url||p.name.toLowerCase()),p]));
  let added=0,resolved=0,duplicates=0,upgraded=0;
  for(const item of imported){
   if(savedPlaces.places.length>=12000)break;
   const name=item.listName||'רשימה מיובאת';
   let bucket=savedPlaces.lists.find(l=>l.name===name);
   if(!bucket){bucket={id:uid(),name,visible:true};savedPlaces.lists.push(bucket)}
   const key=bucket.id+'|'+(item.url||item.name.toLowerCase());if(existing.has(key)){
    const old=existing.get(key);
    if(!validSavedLatLng(old)&&validSavedLatLng(item)){old.lat=item.lat;old.lng=item.lng;old.positionSource=item.positionSource||'reimport';upgraded++;}
    else duplicates++;
    continue;
   }
   existing.set(key,item);
   savedPlaces.places.push({id:uid(),listId:bucket.id,name:item.name,note:item.note||'',url:/^https:\/\//i.test(item.url||'')?item.url:'',lat:validSavedLatLng(item)?item.lat:null,lng:validSavedLatLng(item)?item.lng:null,positionSource:item.positionSource||''});
   added++;if(validSavedLatLng(item))resolved++;
  }
  await persistSavedPlaces();renderSavedPlaceMarkers();showSavedPlaceLibrary();
  toast(`יובאו ${added} מקומות · ${resolved} עם מיקום · ${upgraded} מיקומים שוחזרו · ${duplicates} כפולים דולגו`);
 }catch(e){toast('ייבוא נכשל: '+e.message)}
 finally{savedPlaceBusy=false;const input=$('saved-places-file');if(input)input.value='';if(button)button.disabled=false}
}
async function repairSavedPlaceCoordinates(){
 if(savedPlaceBusy)return;
 savedPlaceBusy=true;const btn=$('saved-places-repair');if(btn)btn.disabled=true;
 try{
  let repaired=0;
  for(const p of savedPlaces.places){if(validSavedLatLng(p))continue;
   const found=googleMapCoordinates(p.url);
   if(found){p.lat=found.lat;p.lng=found.lng;p.positionSource=found.positionSource;repaired++;}
  }
  if(repaired){await persistSavedPlaces();renderSavedPlaceMarkers();}
  showSavedPlaceLibrary();toast(repaired?`שוחזרו ${repaired} מיקומים מדויקים מקישורי Google`:'לא נמצאו קואורדינטות בקישורים. ניתן לחפש ולאשר כל מקום ידנית.');
 }finally{savedPlaceBusy=false}
}
function savedPlaceBucket(place){return savedPlaces.lists.find(l=>l.id===place.listId)}
function manuallyPinSavedPlace(id){
 if(!map||!window.L){toast('המפה עדיין לא זמינה. ודא שיש חיבור אינטרנט');return}
 const p=savedPlaces.places.find(x=>x.id===id);if(!p)return;
 savedPinPlacementId=id;closeDrawer();toast('לחץ על המיקום המדויק במפה עבור '+p.name+' · Esc לביטול');
}
// Search proposals are intentionally never saved without the user's confirmation.
let savedPlaceBatchAbort=null;
async function previewMissingSavedPlaces(){
 if(savedPlaceBusy)return;
 const pending=savedPlaces.places.filter(p=>!validSavedLatLng(p)).slice(0,10);
 if(!pending.length){toast('כל המקומות כבר ממוקמים');return}
 savedPlaceBusy=true;
 savedPlaceBatchAbort=new AbortController();
 const cards=pending.map((p,i)=>`<section class="saved-place-batch-row" data-batch-id="${esc(p.id)}"><div class="saved-batch-title"><strong>${i+1}. ${esc(p.name)}</strong><button type="button" class="saved-batch-manual" data-batch-manual="${esc(p.id)}">${icon('map-pin','small-icon')} מקם במפה</button></div><div class="saved-batch-results">ממתין לחיפוש...</div></section>`).join('');
 openDrawer('איתור מיקומים בקבוצות','מיקומים חסרים','אישור מדויק של תוצאות חיפוש',`<p class="footnote">נאתר עד 10 מקומות בכל פעם לפי שמות והקשר גאוגרפי של הסיכות הקיימות. כל תוצאה חייבת אישור מפורש לפני שמירה.</p><div id="saved-place-batch-list">${cards}</div><p class="footnote">החיפוש מתבצע באמצעות שירות Photon (נתוני OpenStreetMap), ותוצאותיו עשויות להיות חלקיות.</p>`,`<button class="btn" id="batch-back">חזרה לספרייה</button>`);
 $('batch-back').onclick=()=>{savedPlaceBatchAbort?.abort();showSavedPlaceLibrary()};
 $('drawer-body').querySelectorAll('[data-batch-manual]').forEach(b=>b.onclick=()=>{savedPlaceBatchAbort?.abort();manuallyPinSavedPlace(b.dataset.batchManual)});
 refreshIcons();
 const signal=savedPlaceBatchAbort.signal;
 try{
  for(const p of pending){
   if(signal.aborted)break;
   const row=Array.from(document.querySelectorAll('[data-batch-id]')).find(x=>x.dataset.batchId===p.id);
   if(!row)break;
   const node=row.querySelector('.saved-batch-results');node.textContent='מחפש…';
   try{
    const rank=await smartGeoSearchCandidates(p,{signal});
    const candidates=rank.candidates.slice(0,5);
    if(!candidates.length)node.textContent='לא נמצאו תוצאות. ניתן לבחור מיקום ידנית במפה.';
    else{
     node.innerHTML=`<p class="footnote">${esc(rank.hint)} · בחירת תוצאה אינה מבוצעת ללא אישור.</p>`+candidates.map((c,i)=>savedPlaceCandidateHTML(c,i,'batch')).join('');
     node.querySelectorAll('[data-batch-preview]').forEach(btn=>btn.onclick=()=>previewSavedPlaceCandidate(p.id,candidates[Number(btn.dataset.batchPreview)]));
     node.querySelectorAll('[data-batch-choice]').forEach(btn=>btn.onclick=async()=>{
      const c=candidates[Number(btn.dataset.batchChoice)];if(!c||!Number.isFinite(c.lat)||!Number.isFinite(c.lng))return;
      p.lat=c.lat;p.lng=c.lng;p.positionSource='user-confirmed';
      await persistSavedPlaces();renderSavedPlaceMarkers();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();
      node.innerHTML='<span class="saved-batch-completed">המיקום אושר ונשמר</span>';
      toast('המיקום של '+p.name+' נשמר');
     });
    }
   }catch(err){if(signal.aborted)break;node.textContent='החיפוש נכשל. ניתן לבחור מיקום ידנית במפה.';}
   // Respect the public geocoding service; avoid a flood of concurrent requests.
   await new Promise(resolve=>setTimeout(resolve,1150));
  }
 }finally{savedPlaceBusy=false;savedPlaceBatchAbort=null}
}
function setSavedPreviewMode(on){
 savedPreviewMode=!!on;
 $('drawer-backdrop')?.classList.toggle('ronny-preview-backdrop',savedPreviewMode);
 $('drawer')?.classList.toggle('ronny-preview-mode',savedPreviewMode);
}
function previewSavedPlaceCandidate(id,candidate){
 const place=savedPlaces.places.find(p=>p.id===id);
 if(!place||!map||!savedPlacePreviewLayer||!Number.isFinite(candidate?.lat)||!Number.isFinite(candidate?.lng))return;
 savedPlacePreviewLayer.clearLayers();setSavedPreviewMode(true);
 const pos=[candidate.lat,candidate.lng];
 L.circleMarker(pos,{radius:15,color:'#286d75',weight:3,fillColor:'#c6eff0',fillOpacity:.6,className:'ronny-saved-preview-ring'}).addTo(savedPlacePreviewLayer);
 L.circleMarker(pos,{radius:4,color:'#fff',weight:2,fillColor:'#286d75',fillOpacity:1}).addTo(savedPlacePreviewLayer);
 L.marker(pos,{interactive:false,icon:L.divIcon({className:'ronny-preview-tag',html:`<div class="ronny-preview-label">תצוגה מקדימה בלבד · לא נשמר<br><strong>${esc(candidate.name||place.name)}</strong></div>`,iconSize:[1,1],iconAnchor:[0,35]})}).addTo(savedPlacePreviewLayer);
 map.flyTo(pos,Math.max(11,Math.min(14,map.getZoom())),{duration:.55});
 toast('מוצגת תוצאה לבדיקה על המפה. המיקום עדיין לא נשמר.');
}
function savedPlaceCandidateHTML(item,index,prefix){
 return `<div class="ronny-saved-candidate"><strong>${esc(item.name||'מיקום')}</strong><small>${esc(item.area||item.context||'אין פרטי אזור')}</small>${item.reason?`<small class="ronny-geo-reason">${esc(item.reason)}</small>`:''}<div class="ronny-candidate-actions"><button type="button" data-${prefix}-preview="${index}">${icon('eye','small-icon')} הצג במפה</button><button type="button" data-${prefix}-choose="${index}">${icon('check','small-icon')} אשר ושמור</button></div></div>`;
}
async function clearSavedPlaceLocation(id){
 const place=savedPlaces.places.find(p=>p.id===id);if(!place)return;
 if(!await confirmOnMap(`להסיר את המיקום של ״${place.name}״? המקום יישאר ברשימה ויהיה ניתן לאתר אותו מחדש.`,{title:'הסרת מיקום',accept:'הסר מיקום'}))return;
 place.lat=null;place.lng=null;place.positionSource='';map?.closePopup();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();
 const visited=smartGeoVisited();visited.delete(id);smartGeoSaveVisited(visited);smartGeoSuggestions.delete(id);smartGeoPersistSuggestions();
 await persistSavedPlaces();renderSavedPlaceMarkers();if($('saved-place-collections'))showSavedPlaceLibrary();toast('המיקום הוסר. המקום נשאר בספרייה.');
}
async function deleteSavedPlace(id){
 const place=savedPlaces.places.find(p=>p.id===id);if(!place)return;
 if(!await confirmOnMap(`למחוק את ״${place.name}״ מספריית המקומות?`,{title:'מחיקת מקום שמור',accept:'מחק מהספרייה'}))return;
 savedPlaces.places=savedPlaces.places.filter(p=>p.id!==id);savedPlaceSelected.delete(id);const visited=smartGeoVisited();visited.delete(id);smartGeoSaveVisited(visited);smartGeoSuggestions.delete(id);smartGeoPersistSuggestions();map?.closePopup();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();
 await persistSavedPlaces();renderSavedPlaceMarkers();if($('drawer')?.classList.contains('open'))showSavedPlaceLibrary();toast('המקום הוסר מספריית המקומות.');
}
function renderSavedPlaceMarkers(){
 if(!savedPlaceLayer||!map)return;
 savedPlaceLayer.clearLayers();
 for(const place of savedPlaces.places){
  const index=savedPlaces.lists.findIndex(l=>l.id===place.listId);if(index<0||!savedPlaces.lists[index].visible||!validSavedLatLng(place))continue;
  const color=PLACE_COLORS[index%PLACE_COLORS.length];
  const node=L.marker([place.lat,place.lng],{icon:L.divIcon({className:'ronny-saved-marker-wrapper',html:`<span class="ronny-saved-marker" style="--saved-color:${color}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg></span>`,iconSize:[27,34],iconAnchor:[13,32]}),title:place.name,alt:place.name});
  node.addTo(savedPlaceLayer);
  node.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);openSavedPlacePopup(place.id,node)});
 }
}
function openSavedPlacePopup(id,marker){
 const place=savedPlaces.places.find(p=>p.id===id);if(!place||!map)return;
 const list=savedPlaceBucket(place);
 const body=document.createElement('div');body.className='ronny-saved-popup';
 body.innerHTML=`<strong>${esc(place.name)}</strong><small>${esc(list?.name||'מקומות שמורים')}</small>${place.note?`<p>${esc(place.note)}</p>`:''}<div class="ronny-saved-popup-actions"><button type="button" data-action="add-day">הוסף ליום</button><button type="button" data-action="add-outline">הוסף למתאר</button>${place.url?`<a href="${esc(place.url)}" target="_blank" rel="noopener noreferrer">גוגל מפות</a>`:''}<button type="button" data-action="correct-location">תקן מיקום</button><button type="button" data-action="clear-location" class="danger">הסר מיקום</button><button type="button" data-action="delete-place" class="danger">מחק מהספרייה</button></div>`;
 body.querySelector('[data-action="add-day"]').onclick=()=>{map.closePopup();useSavedPlace(id,'day')};
 body.querySelector('[data-action="add-outline"]').onclick=()=>{map.closePopup();useSavedPlace(id,'outline')};
 body.querySelector('[data-action="correct-location"]').onclick=()=>{map.closePopup();searchPlaceCandidates(id)};
 body.querySelector('[data-action="clear-location"]').onclick=()=>clearSavedPlaceLocation(id);
 body.querySelector('[data-action="delete-place"]').onclick=()=>deleteSavedPlace(id);
 marker.bindPopup(body,{minWidth:220,maxWidth:270,autoPan:true}).openPopup();
}
function useSavedPlace(id,target){
 const place=savedPlaces.places.find(p=>p.id===id);if(!validSavedLatLng(place)){toast('יש לקבוע מיקום לפני הוספה לטיול');return}
 if(target==='outline'){
  const outline=currentOutline();if(outline.points.length>=90){toast('המתאר מלא');return}
  const point={id:uid(),name:place.name,type:'attraction',lat:+place.lat,lng:+place.lng};outline.points.push(point);
  planningResolution='outline';selectedOutlineId=point.id;save();renderAll();toast('המקום נוסף למתאר הטיול');
 }else{
  const day=state.days[selectedDay];if(!day)return;
  day.stops.push({id:uid(),name:place.name,type:'poi',description:place.note||'',notes:'',time:'09:00',duration:0,cost:0,lat:+place.lat,lng:+place.lng,sourceSavedPlaceId:id});
  planningResolution='day';save();renderAll();toast('המקום נוסף כנקודת עניין ליום '+(selectedDay+1));
 }
}
function fitSavedPlaceList(listId){
 if(!map)return;const points=savedPlaces.places.filter(p=>p.listId===listId&&validSavedLatLng(p));
 if(!points.length){toast('אין ברשימה הזו מיקומים מזוהים להצגה');return}
 if(points.length===1)map.flyTo([points[0].lat,points[0].lng],11,{duration:.5});
 else map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lng])),{padding:[75,75],maxZoom:12,animate:true,duration:.55});
}
function searchPlaceCandidates(id){
 const place=savedPlaces.places.find(p=>p.id===id);if(!place)return;
 openDrawer('איתור מיקום','SAVED PLACE',place.name,
 `<p class="footnote">המערכת תעדיף תוצאות התואמות לסיכות האחרות ולרמזים בשם הרשימה, אך תשמור רק לאחר אישורך.</p><div class="field"><label for="saved-place-query">חיפוש</label><input id="saved-place-query" value="${esc(place.name)}"></div><button class="btn btn-soft" id="saved-place-search">${icon('search','small-icon')} חפש</button><div id="saved-place-results" class="saved-place-results"></div>${place.url?`<p><a class="drawer-link" href="${esc(place.url)}" target="_blank" rel="noopener noreferrer">פתח בגוגל מפות</a></p>`:''}`,
 `<button class="btn" id="saved-place-manual">${icon('map-pin','small-icon')} בחירה ידנית במפה</button><button class="btn" id="saved-place-back">חזרה לרשימות</button>`);
 $('saved-place-manual').onclick=()=>manuallyPinSavedPlace(id);$('saved-place-back').onclick=showSavedPlaceLibrary;
 const lookup=async()=>{
  const q=$('saved-place-query').value.trim();if(q.length<3)return;
  const results=$('saved-place-results');results.textContent='מחפש…';
  try{
   const rank=await smartGeoSearchCandidates(place,{query:q});
   const candidates=rank.candidates;
   results.innerHTML=`<p class="footnote">${esc(rank.hint)} · הצג במפה לפני אישור.</p>`+(candidates.map((item,i)=>savedPlaceCandidateHTML(item,i,'candidate')).join('')||'<p class="footnote">לא נמצאו תוצאות. נסה שם אחר או היעזר בקישור לגוגל מפות.</p>');
   results.querySelectorAll('[data-candidate-preview]').forEach(b=>b.onclick=()=>previewSavedPlaceCandidate(id,candidates[+b.dataset.candidatePreview]));
    results.querySelectorAll('[data-candidate-choose]').forEach(b=>b.onclick=async()=>{
    const item=candidates[+b.dataset.candidateChoose];if(!item)return;
    place.lat=item.lat;place.lng=item.lng;place.positionSource='user-confirmed';await persistSavedPlaces();renderSavedPlaceMarkers();showSavedPlaceLibrary();map?.flyTo([item.lat,item.lng],12,{duration:.55});toast('המיקום אושר ונשמר');
   });
  }catch(e){results.textContent='שירות החיפוש אינו זמין כרגע';}
 };
 $('saved-place-search').onclick=lookup;$('saved-place-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookup()}});
}
const savedPlaceSelected=new Set();
const savedExpandedLists=new Set();
const savedExpandedGroups=new Set();
const savedGroupLimits=new Map();
let savedPlaceStatusFilter='all';
const savedGroupKey=(id,type)=>String(id)+'|'+type;
function savedPlaceMatches(p){
 return (!savedPlaceFilter||[p.name,p.note||'',savedPlaceBucket(p)?.name||''].join(' ').toLocaleLowerCase().includes(savedPlaceFilter.toLocaleLowerCase()))&&
 (savedPlaceStatusFilter==='all'||(savedPlaceStatusFilter==='located'?validSavedLatLng(p):savedPlaceStatusFilter==='missing'?!validSavedLatLng(p):savedPlaceStatusFilter==='photon'?validSavedLatLng(p)&&String(p.positionSource||'').startsWith('photon'):true));
}
function savedPlaceRowHTML(p){
 const located=validSavedLatLng(p);
 return `<article class="saved-place-row ronny-entity is-clickable ${savedPlaceSelected.has(p.id)?'ronny-saved-selected':''}" data-saved-row="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.name)} — ${located?'התמקד במפה':'אתר מיקום'}"><label class="ronny-saved-select" title="בחר נקודה לפעולה קבוצתית"><input type="checkbox" data-saved-select="${esc(p.id)}" ${savedPlaceSelected.has(p.id)?'checked':''} aria-label="בחר את ${esc(p.name)}"></label><div><strong>${esc(p.name)}</strong>${p.note?`<p>${esc(p.note)}</p>`:''}<span class="saved-place-status ${located?'ok':''}">${located?'מיקום מזוהה':'מיקום דורש אישור'}${p.positionSource==='photon-auto'?' · אותר אוטומטית':''}</span></div><div class="saved-place-row-actions"><button type="button" data-saved-edit="${esc(p.id)}" title="שנה שם" aria-label="שנה שם מקום">${icon('pencil','small-icon')}</button>${located?`<button type="button" data-saved-clear="${esc(p.id)}" title="הסר מיקום שגוי (שמור את המקום)" aria-label="הסר מיקום של ${esc(p.name)}">${icon('map-pin-off','small-icon')}</button><button type="button" data-saved-add="${esc(p.id)}" title="הוסף לטיול">${icon('plus','small-icon')}</button>`:''}<button type="button" class="ronny-row-danger" data-saved-delete="${esc(p.id)}" title="מחק נקודה מהספרייה" aria-label="מחק את ${esc(p.name)}">${icon('trash-2','small-icon')}</button>${p.url?`<a href="${esc(p.url)}" title="פתח בגוגל מפות" target="_blank" rel="noopener noreferrer" aria-label="פתח בגוגל מפות">${icon('external-link','small-icon')}</a>`:''}</div><div class="ronny-rename-row" data-saved-editor="${esc(p.id)}" hidden><input data-saved-name="${esc(p.id)}" value="${esc(p.name)}" maxlength="250" aria-label="שם מקום חדש"><button type="button" data-saved-save="${esc(p.id)}" title="שמור שם">${icon('check','small-icon')}</button><button type="button" data-saved-cancel="${esc(p.id)}" title="ביטול">${icon('x','small-icon')}</button></div></article>`;
}
function savedPlaceGroupHTML(list,kind,places,searching){
 const key=savedGroupKey(list.id,kind),subset=places.filter(p=>kind==='located'?validSavedLatLng(p):!validSavedLatLng(p));
 if(!subset.length)return '';
 const open=searching||savedExpandedGroups.has(key);
 const cap=savedGroupLimits.get(key)||30;
 const shown=open?subset.slice(0,cap):[];
 return `<section class="ronny-place-group ${open?'expanded':''}"><button type="button" class="ronny-place-group-toggle" data-saved-group="${esc(key)}" aria-expanded="${open}"><span>${kind==='located'?'מיקומים מזוהים':'ממתינים לאישור מיקום'} <b>${subset.length}</b></span>${icon(open?'chevron-up':'chevron-down','small-icon')}</button>${open?`<div class="ronny-place-group-items">${shown.map(savedPlaceRowHTML).join('')}${subset.length>shown.length?`<button type="button" class="ronny-place-more" data-saved-more="${esc(key)}">הצג עוד ${Math.min(30,subset.length-shown.length)} מקומות (${shown.length}/${subset.length})</button>`:''}</div>`:''}</section>`;
}
function savedPlaceCollectionsHTML(){
 const lists=savedPlaces.lists,places=savedPlaces.places,searching=!!savedPlaceFilter.trim();
 const counts=new Map(),searchResults=new Map();
 for(const list of lists){counts.set(list.id,{total:0,known:0,missing:0});searchResults.set(list.id,[])}
 for(const place of places){const cnt=counts.get(place.listId);if(!cnt)continue;cnt.total++;validSavedLatLng(place)?cnt.known++:cnt.missing++;if(savedPlaceMatches(place))searchResults.get(place.listId).push(place)}
 const shownLists=lists.filter(list=>!searching||searchResults.get(list.id).length);
 return `<div class="saved-place-lists">${shownLists.map((list,i)=>{
  const globalIndex=lists.indexOf(list),color=PLACE_COLORS[globalIndex%PLACE_COLORS.length],count=counts.get(list.id),found=searchResults.get(list.id),expanded=searching||savedExpandedLists.has(list.id);
  return `<section class="ronny-place-collection ${expanded?'expanded':''}" data-saved-collection="${esc(list.id)}" style="--place-color:${color}"><div class="saved-place-list-row"><label class="ronny-list-select" title="בחר את כל המקומות המסוננים ברשימה"><input type="checkbox" data-saved-select-list="${esc(list.id)}" ${found.length&&found.every(p=>savedPlaceSelected.has(p.id))?'checked':''} aria-label="בחר נקודות מרשימת ${esc(list.name)}"></label><button type="button" class="saved-list-visibility" data-saved-visible="${esc(list.id)}" aria-pressed="${!!list.visible}" title="${list.visible?'הסתר':'הצג'} את ${esc(list.name)} במפה" aria-label="${list.visible?'הסתר':'הצג'} את ${esc(list.name)} במפה">${icon(list.visible?'eye':'eye-off','small-icon')}</button><button type="button" class="ronny-list-toggle" data-saved-list-toggle="${esc(list.id)}" aria-expanded="${expanded}"><span class="ronny-list-text"><b>${esc(list.name)}</b><small>${count.known} ממוקמים · ${count.missing} ממתינים לאישור</small></span>${icon(expanded?'chevron-up':'chevron-down','small-icon')}</button><button type="button" class="ronny-list-edit" data-saved-list-edit="${esc(list.id)}" title="שנה שם רשימה" aria-label="שנה שם רשימה">${icon('pencil','small-icon')}</button></div><div class="ronny-rename-row" data-saved-list-editor="${esc(list.id)}" hidden><input data-saved-list-name="${esc(list.id)}" value="${esc(list.name)}" maxlength="130" aria-label="שם רשימה חדש"><button type="button" data-saved-list-save="${esc(list.id)}" title="שמור שם רשימה" aria-label="שמור שם רשימה">${icon('check','small-icon')}</button><button type="button" data-saved-list-cancel="${esc(list.id)}" title="ביטול" aria-label="ביטול">${icon('x','small-icon')}</button></div>${expanded?`<div class="ronny-place-collection-body">${savedPlaceGroupHTML(list,'located',found,searching)}${savedPlaceGroupHTML(list,'missing',found,searching)}${!found.length?'<p class="footnote">אין התאמות לסינון.</p>':''}</div>`:''}</section>`}).join('')||'<div class="library-empty">לא נמצאו רשימות מתאימות.</div>'}</div>`;
}
function refreshSavedCollections(preserveFocus=false){
 const pane=$('saved-place-collections');if(!pane)return;const oldScroll=$('drawer-body').scrollTop;
 pane.innerHTML=savedPlaceCollectionsHTML();
 bindSavedPlaceCollectionActions(pane);
 $('drawer-body').scrollTop=oldScroll;
 if(!preserveFocus)refreshIcons();
}
function savedPlaceSelectionUI(){
 const status=$('saved-place-selected-count'),count=savedPlaceSelected.size;
 if(status)status.textContent=`נבחרו ${count} נקודות${count?' · הסרת מיקום משאירה את המקומות ברשימה':''}`;
 document.querySelectorAll('[data-saved-selected-action]').forEach(b=>b.disabled=!count);
 document.querySelectorAll('[data-saved-select-list]').forEach(ch=>{
  const matching=savedPlaces.places.filter(p=>p.listId===ch.dataset.savedSelectList&&savedPlaceMatches(p));
  const n=matching.filter(p=>savedPlaceSelected.has(p.id)).length;
  ch.checked=matching.length>0&&n===matching.length;
  ch.indeterminate=n>0&&n<matching.length;
 });
}
function savedPlaceSelectMatching(mode){
 if(mode==='clear'){savedPlaceSelected.clear()}
 else {
  const visible=savedPlaces.places.filter(savedPlaceMatches);
  if(mode==='filtered')visible.forEach(p=>savedPlaceSelected.add(p.id));
  if(mode==='photon')visible.filter(p=>String(p.positionSource||'').startsWith('photon')).forEach(p=>savedPlaceSelected.add(p.id));
 }
 refreshSavedCollections();savedPlaceSelectionUI();
}
async function savedPlaceBulkEdit(kind){
 const ids=new Set([...savedPlaceSelected].filter(id=>savedPlaces.places.some(p=>p.id===id)));
 const affected=savedPlaces.places.filter(p=>ids.has(p.id)&&(kind==='delete'||validSavedLatLng(p)));
 if(!affected.length){toast(kind==='clear'?'אין מיקומים להסרה מבין הנבחרות':'לא נבחרו נקודות למחיקה');return}
 const removing=kind==='delete',num=affected.length;
 const text=removing?`למחוק לצמיתות ${num} מקומות מספריית המקומות? פעולה זו לא תסיר נקודות שכבר נוספו לימי הטיול.`:`להסיר את המיקום של ${num} נקודות? שמות המקומות והרשימות יישארו, וניתן יהיה לאתר אותן שוב.`;
 if(!await confirmOnMap(text,{title:removing?'מחיקת נקודות בקבוצה':'איפוס מיקומים בקבוצה',accept:removing?'מחק נקודות':'הסר מיקומים'}))return;
 const changed=new Set(affected.map(p=>p.id));
 if(removing)savedPlaces.places=savedPlaces.places.filter(p=>!changed.has(p.id));
 else affected.forEach(p=>{p.lat=null;p.lng=null;p.positionSource=''});
 const visited=smartGeoVisited();for(const id of changed){visited.delete(id);smartGeoSuggestions.delete(id);savedPlaceSelected.delete(id)}
 smartGeoSaveVisited(visited);smartGeoPersistSuggestions();
 map?.closePopup();await persistSavedPlaces();renderSavedPlaceMarkers();
 showSavedPlaceLibrary();toast(removing?`נמחקו ${num} מקומות`:`הוסרו ${num} מיקומים; המקומות נשמרו`);
}
function savedPlaceBulkAction(action){
 const lists=savedPlaces.lists;
 if(action==='select'||action==='deselect'){
  const visible=action==='select';lists.forEach(x=>x.visible=visible);
  persistSavedPlaces();renderSavedPlaceMarkers();refreshSavedCollections();
 }else if(action==='expand'||action==='collapse'){
  const open=action==='expand';savedExpandedLists.clear();savedExpandedGroups.clear();
  if(open)lists.forEach(x=>{savedExpandedLists.add(x.id);savedExpandedGroups.add(savedGroupKey(x.id,'located'));savedExpandedGroups.add(savedGroupKey(x.id,'missing'))});
  refreshSavedCollections();
 }
}
function bindSavedPlaceCollectionActions(scope){
 const toggleRename=(containerAttr,id)=>{
  const editor=[...scope.querySelectorAll('['+containerAttr+']')].find(x=>x.dataset[containerAttr.slice(5).replace(/-([a-z])/g,(_,l)=>l.toUpperCase())]===id);
  if(!editor)return;
  scope.querySelectorAll('.ronny-rename-row').forEach(x=>{if(x!==editor)x.hidden=true});
  editor.hidden=!editor.hidden;
  if(!editor.hidden){editor.querySelector('input')?.focus();editor.querySelector('input')?.select()}
 };
 const commitSavedPlaceName=async id=>{
  const place=savedPlaces.places.find(p=>p.id===id);
  const editor=[...scope.querySelectorAll('[data-saved-editor]')].find(x=>x.dataset.savedEditor===id);
  const next=editor?.querySelector('input')?.value.trim().slice(0,250);
  if(!place||!next){toast('נא להזין שם מקום');return}
  place.name=next;await persistSavedPlaces();renderSavedPlaceMarkers();refreshSavedCollections();toast('שם המקום נשמר');
 };
 const commitSavedListName=async id=>{
  const list=savedPlaces.lists.find(x=>x.id===id);
  const editor=[...scope.querySelectorAll('[data-saved-list-editor]')].find(x=>x.dataset.savedListEditor===id);
  const next=editor?.querySelector('input')?.value.trim().slice(0,130);
  if(!list||!next){toast('נא להזין שם רשימה');return}
  list.name=next;await persistSavedPlaces();refreshSavedCollections();toast('שם הרשימה נשמר');
 };
 scope.querySelectorAll('[data-saved-row]').forEach(row=>{
  const act=()=>{const p=savedPlaces.places.find(x=>x.id===row.dataset.savedRow);if(!p)return;if(!validSavedLatLng(p)){searchPlaceCandidates(p.id);return}const l=savedPlaceBucket(p);if(l&&!l.visible){l.visible=true;persistSavedPlaces();renderSavedPlaceMarkers()}closeDrawer();map?.flyTo([p.lat,p.lng],12,{duration:.5})};
  row.addEventListener('click',e=>{if(e.target.closest('button,a,input,textarea,select,label,.ronny-rename-row'))return;act()});
  row.addEventListener('keydown',e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();act()}});
 });
 scope.querySelectorAll('[data-saved-select]').forEach(ch=>ch.onchange=()=>{
  ch.checked?savedPlaceSelected.add(ch.dataset.savedSelect):savedPlaceSelected.delete(ch.dataset.savedSelect);
  ch.closest('.saved-place-row')?.classList.toggle('ronny-saved-selected',ch.checked);
  savedPlaceSelectionUI();
 });
 scope.querySelectorAll('[data-saved-select-list]').forEach(ch=>ch.onchange=()=>{
  savedPlaces.places.filter(p=>p.listId===ch.dataset.savedSelectList&&savedPlaceMatches(p)).forEach(p=>ch.checked?savedPlaceSelected.add(p.id):savedPlaceSelected.delete(p.id));
  refreshSavedCollections();savedPlaceSelectionUI();
 });
 scope.querySelectorAll('[data-saved-clear]').forEach(b=>b.onclick=()=>clearSavedPlaceLocation(b.dataset.savedClear));
 scope.querySelectorAll('[data-saved-delete]').forEach(b=>b.onclick=()=>deleteSavedPlace(b.dataset.savedDelete));
 savedPlaceSelectionUI();
 scope.querySelectorAll('[data-saved-edit]').forEach(b=>b.onclick=()=>toggleRename('data-saved-editor',b.dataset.savedEdit));
 scope.querySelectorAll('[data-saved-cancel]').forEach(b=>b.onclick=()=>b.closest('.ronny-rename-row').hidden=true);
 scope.querySelectorAll('[data-saved-save]').forEach(b=>b.onclick=()=>commitSavedPlaceName(b.dataset.savedSave));
 scope.querySelectorAll('[data-saved-name]').forEach(inp=>inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitSavedPlaceName(inp.dataset.savedName)}if(e.key==='Escape'){inp.closest('.ronny-rename-row').hidden=true}});
 scope.querySelectorAll('[data-saved-list-edit]').forEach(b=>b.onclick=()=>toggleRename('data-saved-list-editor',b.dataset.savedListEdit));
 scope.querySelectorAll('[data-saved-list-cancel]').forEach(b=>b.onclick=()=>b.closest('.ronny-rename-row').hidden=true);
 scope.querySelectorAll('[data-saved-list-save]').forEach(b=>b.onclick=()=>commitSavedListName(b.dataset.savedListSave));
 scope.querySelectorAll('[data-saved-list-name]').forEach(inp=>inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitSavedListName(inp.dataset.savedListName)}if(e.key==='Escape'){inp.closest('.ronny-rename-row').hidden=true}});
 scope.querySelectorAll('[data-saved-list-toggle]').forEach(el=>el.onclick=()=>{const id=el.dataset.savedListToggle;savedExpandedLists.has(id)?savedExpandedLists.delete(id):savedExpandedLists.add(id);refreshSavedCollections()});
 scope.querySelectorAll('[data-saved-group]').forEach(el=>el.onclick=()=>{const key=el.dataset.savedGroup;savedExpandedGroups.has(key)?savedExpandedGroups.delete(key):savedExpandedGroups.add(key);refreshSavedCollections()});
 scope.querySelectorAll('[data-saved-more]').forEach(el=>el.onclick=()=>{const key=el.dataset.savedMore;savedGroupLimits.set(key,(savedGroupLimits.get(key)||30)+30);refreshSavedCollections()});
 scope.querySelectorAll('[data-saved-visible]').forEach(el=>el.onclick=()=>{const list=savedPlaces.lists.find(x=>x.id===el.dataset.savedVisible);if(list){list.visible=!list.visible;persistSavedPlaces();renderSavedPlaceMarkers();el.setAttribute('aria-pressed',String(list.visible));el.setAttribute('aria-label',(list.visible?'הסתר':'הצג')+' את '+list.name+' במפה');el.title=(list.visible?'הסתר':'הצג')+' את '+list.name+' במפה';el.innerHTML=icon(list.visible?'eye':'eye-off','small-icon');refreshIcons()}});
 scope.querySelectorAll('[data-saved-add]').forEach(el=>el.onclick=()=>useSavedPlace(el.dataset.savedAdd,planningResolution==='day'?'day':'outline'));
 scope.querySelectorAll('[data-saved-resolve]').forEach(el=>el.onclick=()=>searchPlaceCandidates(el.dataset.savedResolve));
 refreshIcons();
}

/* RONNY 35.16 — free, careful Google Takeout coordinate recovery using Photon.
   Public demo: capped batches, one request at a time, pause and human review. */
const GEO_REPAIR_ATTEMPTS_KEY='ronny-photon-reviewed-context-v2';
const GEO_COUNTRIES={
 'איטליה':'IT','italy':'IT','שוויץ':'CH','switzerland':'CH','slovakia':'SK','סלובקיה':'SK',
 'אלבניה':'AL','albania':'AL','פולין':'PL','poland':'PL','צכיה':'CZ','צ׳כיה':'CZ','czech':'CZ',
 'אנגליה':'GB','scotland':'GB','סקוטלנד':'GB','britain':'GB','united kingdom':'GB',
 'ספרד':'ES','spain':'ES','ניו זילנד':'NZ','new zealand':'NZ','מונטנגרו':'ME','montenegro':'ME',
 'כרתים':'GR','crete':'GR','greece':'GR','יוון':'GR','קזחסטן':'KZ','kazakhstan':'KZ',
 'ארהב':'US','usa':'US','united states':'US','צרפת':'FR','france':'FR','אוסטריה':'AT','austria':'AT',
 'גרמניה':'DE','germany':'DE','אוסטרליה':'AU','australia':'AU','אירלנד':'IE','ireland':'IE','ישראל':'IL','israel':'IL','הונגריה':'HU','hungary':'HU',
 'קרואטיה':'HR','croatia':'HR','סלובניה':'SI','slovenia':'SI','פורטוגל':'PT','portugal':'PT'
};
const GEO_COUNTRY_EN={IT:'Italy',CH:'Switzerland',SK:'Slovakia',AL:'Albania',PL:'Poland',CZ:'Czechia',GB:'United Kingdom',ES:'Spain',NZ:'New Zealand',ME:'Montenegro',GR:'Greece',KZ:'Kazakhstan',US:'United States',FR:'France',AT:'Austria',DE:'Germany',AU:'Australia',IE:'Ireland',IL:'Israel',HU:'Hungary',HR:'Croatia',SI:'Slovenia',PT:'Portugal'};
let smartGeoBusy=false,smartGeoAbort=null,smartGeoRunStatus='',smartGeoRunProgress={done:0,total:0},smartGeoAutoApprove=true;
const SMART_GEO_SUGGESTIONS_KEY='ronny-photon-review-v38';
function smartGeoLoadSuggestions(){
 try{return new Map(JSON.parse(localStorage.getItem(SMART_GEO_SUGGESTIONS_KEY)||'[]'))}catch(e){return new Map()}
}
const smartGeoSuggestions=smartGeoLoadSuggestions();
function smartGeoPersistSuggestions(){
 try{const data=[...smartGeoSuggestions].slice(-300).map(([id,rank])=>[id,{reliable:rank.reliable,hint:rank.hint,candidates:rank.candidates.slice(0,5)}]);localStorage.setItem(SMART_GEO_SUGGESTIONS_KEY,JSON.stringify(data))}catch(e){}
}
function smartGeoVisited(){try{return new Set(JSON.parse(localStorage.getItem(GEO_REPAIR_ATTEMPTS_KEY)||'[]'))}catch(e){return new Set()}}
function smartGeoSaveVisited(set){try{localStorage.setItem(GEO_REPAIR_ATTEMPTS_KEY,JSON.stringify([...set].slice(-12000)))}catch(e){}}
function smartGeoNormalize(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f\u0591-\u05bd\u05bf-\u05c7]/g,'').toLocaleLowerCase().replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
/* RONNY 37 — locality-aware geocoding. All location hints are derived from
   this trip or the saved pins; Photon remains the only remote lookup service. */
function smartGeoContainsPhrase(value,phrase){
 const s=' '+smartGeoNormalize(value)+' ',p=' '+smartGeoNormalize(phrase)+' ';
 return p.trim().length>1&&s.includes(p);
}
function smartGeoCountryFromText(label){
 const matches=Object.entries(GEO_COUNTRIES).filter(([word])=>smartGeoContainsPhrase(label,word));
 return matches.length?matches.sort((a,b)=>smartGeoNormalize(b[0]).length-smartGeoNormalize(a[0]).length)[0][1]:null;
}
function smartGeoCountryHint(place){
 return smartGeoCountryFromText(place.name)||smartGeoCountryFromText(savedPlaceBucket(place)?.name||'');
}
function smartGeoRegionHint(place){
 const txt=[place.name,savedPlaceBucket(place)?.name||''].join(' ');
 for(const [key,terms] of Object.entries({scotland:['scotland','סקוטלנד'],england:['england','אנגליה'],wales:['wales','וויילס'],sicily:['sicily','סיציליה'],sardinia:['sardinia','סרדיניה']}))
  if(terms.some(t=>smartGeoContainsPhrase(txt,t)))return key;
 return null;
}
function smartGeoSimilarity(a,b){
 const s=smartGeoNormalize(a),t=smartGeoNormalize(b);
 if(!s||!t)return 0;
 if(s===t)return 1;
 const aa=new Set(s.split(' ').filter(x=>x.length>1)),bb=new Set(t.split(' ').filter(x=>x.length>1));
 const union=new Set([...aa,...bb]).size,inter=[...aa].filter(x=>bb.has(x)).length;
 const jaccard=union?inter/union:0;
 // Slightly reward an exact full phrase contained in a longer OSM name.
 const contained=(s.length>=5&&(' '+t+' ').includes(' '+s+' '))||(t.length>=5&&(' '+s+' ').includes(' '+t+' '));
 return Math.min(.96,Math.max(jaccard,contained?.78:0));
}
function smartGeoCountryMatches(properties,iso){
 if(!iso)return false;
 const cc=String(properties.countrycode||properties.country_code||'').toUpperCase();
 if(cc)return cc===iso;
 const country=smartGeoNormalize(properties.country),expected=smartGeoNormalize(GEO_COUNTRY_EN[iso]||'');
 return !!country&&!!expected&&(country===expected||(iso==='GB'&&['england','scotland','wales','united kingdom','great britain'].includes(country)));
}
function smartGeoDistanceKm(a,b){
 const rad=Math.PI/180,lat1=+a.lat*rad,lat2=+b.lat*rad,dLat=lat2-lat1,dLon=(+b.lng- +a.lng)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
function smartGeoLocatedTripPoints(){
 const points=[...(state.outline?.points||[]),...(state.days||[]).flatMap(d=>d.stops||[])];
 return points.filter(p=>validSavedLatLng(p)).map(p=>({lat:+p.lat,lng:+p.lng}));
}
function smartGeoMedoid(points){
 if(!points.length)return null;
 // A real pin is safer than the arithmetic average (which may land in the sea).
 const sampled=points.slice(0,70);
 return sampled.reduce((best,p)=>{
  const cost=sampled.reduce((sum,x)=>sum+Math.min(750,smartGeoDistanceKm(p,x)),0);
  return !best||cost<best.cost?{cost,lat:+p.lat,lng:+p.lng}:best;
 },null);
}
function smartGeoContext(place){
 const all=(savedPlaces.places||[]).filter(p=>p.id!==place.id&&validSavedLatLng(p));
 const sameList=all.filter(p=>p.listId===place.listId);
 const trip=smartGeoLocatedTripPoints();
 const explicitCountry=smartGeoCountryHint(place);
 const tripTitleCountry=trip.length>=2?smartGeoCountryFromText(state.title||''):null;
 const country=explicitCountry||tripTitleCountry||null;
 let source='none',anchors=[];
 if(sameList.length){anchors=sameList;source='list';}
 else {
  const similarList=all.filter(p=>{
   const bucket=savedPlaceBucket(p)?.name||'';
   return explicitCountry&&smartGeoCountryFromText(bucket)===explicitCountry;
  });
  if(similarList.length>=2){anchors=similarList;source='matching-lists';}
  else if(trip.length>=2){anchors=trip;source='trip';}
  else if(similarList.length){anchors=similarList;source='matching-lists';}
  else if(all.length>=3){
   // A globally coherent set of saved pins can guide searches, but never auto-approve.
   const points=all.slice(0,100),mid=smartGeoMedoid(points);
   const near=mid?points.filter(p=>smartGeoDistanceKm(p,mid)<=300):[];
   if(near.length>=3&&near.length>=Math.ceil(points.length*.8)){anchors=near;source='library';}
  }
  // Do not use unrelated saved lists when the library spans multiple regions.
 }
 const limited=anchors.slice(0,100).map(p=>({lat:+p.lat,lng:+p.lng}));
 const center=smartGeoMedoid(limited);
 const nearbyCenterCount=center?limited.filter(p=>smartGeoDistanceKm(p,center)<=240).length:0;
 const cohesive=limited.length>=2&&nearbyCenterCount>=Math.max(2,Math.ceil(limited.length*.6));
 return {anchors:limited,source,center,cohesive,country,explicitCountry,region:smartGeoRegionHint(place)};
}
function smartGeoScore(place,feature,ctx){
 const p=feature?.properties||{},sim=smartGeoSimilarity(place.name,p.name||p.street||'');
 const countryMatches=ctx.country?smartGeoCountryMatches(p,ctx.country):false;
 const countryMismatch=!!ctx.country&&!!(p.countrycode||p.country)&&!countryMatches;
 const region=ctx.region,area=smartGeoNormalize([p.state,p.city,p.country].filter(Boolean).join(' '));
 const regionMatches=!!region&&area.includes(region);
 const regionMismatch=!!region&&!regionMatches&&(['scotland','england','wales'].includes(region)&&['scotland','england','wales'].some(x=>area.includes(x)));
 const location={lat:+feature.geometry.coordinates[1],lng:+feature.geometry.coordinates[0]};
 const d=ctx.anchors.length?Math.min(...ctx.anchors.map(pt=>smartGeoDistanceKm(location,pt))):null;
 const neighborCount=d===null?0:ctx.anchors.filter(pt=>smartGeoDistanceKm(location,pt)<=85).length;
 const weight=ctx.source==='list'?1:ctx.source==='matching-lists'?.8:ctx.source==='trip'?.6:.45;
 let locality=0;
 if(d!==null){
  if(d<=5)locality=43;
  else if(d<=25)locality=37;
  else if(d<=85)locality=30;
  else if(d<=220)locality=20;
  else if(d<=450)locality=8;
  else if(d>1400)locality=-45;
  else if(d>750)locality=-25;
  if(neighborCount>=2)locality+=8;
  locality*=weight;
 }
 const score=sim*105+locality+(countryMatches?30:0)-(countryMismatch?(ctx.explicitCountry?115:60):0)+(regionMatches?20:0)-(regionMismatch?75:0);
 const distanceKm=d===null?null:Math.round(d);
 const localityDescription=d===null?'':(ctx.source==='list'?'מאותה רשימה':ctx.source==='matching-lists'?'מרשימות באותה מדינה':ctx.source==='library'?'מסיכות הספרייה':'מנקודות הטיול');
 const reasons=[distanceKm!==null?`כ־${distanceKm.toLocaleString('he-IL')} ק״מ מסיכה ${localityDescription}`:'',countryMatches?'מדינה תואמת':'',regionMatches?'אזור תואם':'',countryMismatch?'אזהרה: מדינה אחרת':'',regionMismatch?'אזהרה: אזור אחר':''].filter(Boolean);
 return {score,sim,countryMatches,countryMismatch,regionMatches,regionMismatch,distanceKm,neighborCount,localitySource:ctx.source,reason:reasons.join(' · ')};
}
function smartGeoRank(place,features,ctx=smartGeoContext(place)){
 const seen=new Set();
 const candidates=(features||[]).filter(f=>f?.geometry?.type==='Point'&&Array.isArray(f.geometry.coordinates)&&f.geometry.coordinates.length===2).map(f=>{
  const lon=Number(f.geometry.coordinates[0]),lat=Number(f.geometry.coordinates[1]);
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)return null;
  const p=f.properties||{},key=[p.osm_type||'',p.osm_id||'',lat.toFixed(5),lon.toFixed(5)].join(':');
  if(seen.has(key))return null;seen.add(key);
  return {lat,lng:lon,name:String(p.name||p.street||place.name),context:[p.street,p.city,p.state,p.country].filter(Boolean).join(' · '),...smartGeoScore(place,f,ctx)};
 }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,7);
 const first=candidates[0],second=candidates[1];
 const separated=!second||(first.score-second.score>=36);
 const localEvidence=ctx.cohesive&&(ctx.source==='list'||ctx.source==='matching-lists')&&first?.neighborCount>=2&&first?.distanceKm<=65;
 const namedCountry=!!ctx.explicitCountry&&first?.countryMatches&&!first?.countryMismatch&&
  (first?.regionMatches||(ctx.anchors.length>=1&&first?.distanceKm<=75));
 // Auto-save only with exact names, clear margin and independently consistent geography.
 // A lone nearest pin or a country inferred only from the current map cannot authorize it.
 const reliable=!!first&&first.sim===1&&!first.regionMismatch&&!first.countryMismatch&&separated&&
  (localEvidence||namedCountry)&&(namedCountry||localEvidence&&first.distanceKm<=65)&&
  (!ctx.region||first.regionMatches)&&(!ctx.country||first.countryMatches);
 const hint=ctx.source==='list'?'דירוג לפי סיכות מאותה רשימה':ctx.source==='matching-lists'?'דירוג לפי רשימות באותה מדינה':ctx.source==='trip'?'דירוג לפי נקודות הטיול':ctx.source==='library'?'דירוג לפי ריכוז הסיכות בספרייה':ctx.country?'דירוג לפי מדינה בשם המקום או הרשימה':'לא נמצא הקשר גאוגרפי; יש לאשר ידנית';
 return {candidates,reliable,hint,context:ctx};
}
function smartGeoWithoutTrailingGeography(value){
 let out=String(value||'').trim();
 const words=[...Object.keys(GEO_COUNTRIES),'scotland','england','wales','sicily','sardinia'].sort((a,b)=>b.length-a.length);
 for(const word of words){
  const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const next=out.replace(new RegExp('(?:[\\s,\\-–]+)'+escaped+'\\s*$','iu'),'').trim();
  if(next.length>=3&&next!==out){out=next;break;}
 }
 return out;
}
async function smartGeoSearchCandidates(place,options={}){
 const q=String(options.query??place.name).trim(),signal=options.signal;
 const context=smartGeoContext({...place,name:q});
 if(q.length<2)return {candidates:[],reliable:false,hint:'יש להזין שם מקום'};
 const fetchFeatures=async(biased,query)=>{
  const params=new URLSearchParams({q:query,limit:'12',lang:'en'});
  if(biased&&context.center){params.set('lat',context.center.lat.toFixed(5));params.set('lon',context.center.lng.toFixed(5));params.set('zoom','8');}
  const response=await fetch('https://photon.komoot.io/api/?'+params,{signal,headers:{Accept:'application/json'}});
  if(response.status===429||response.status===503){const err=Error('השירות הציבורי מגביל עומס');err.rateLimited=true;throw err;}
  if(!response.ok)throw Error('שירות החיפוש אינו זמין');
  return (await response.json()).features||[];
 };
 let found=await fetchFeatures(!!context.center,q);
 let rank=smartGeoRank({...place,name:q},found,context);
 const best=rank.candidates[0];
 // One controlled fallback if locality bias failed or Photon found only unrelated names.
 if(context.center&&(!best||best.sim<.7||best.countryMismatch||(best.distanceKm!==null&&best.distanceKm>500))){
  try{
   const bare=smartGeoWithoutTrailingGeography(q);
   const more=await fetchFeatures(false,bare);
   const existing=new Set(found.map(f=>JSON.stringify(f.geometry?.coordinates)));
   for(const f of more){const key=JSON.stringify(f.geometry?.coordinates);if(!existing.has(key)){found.push(f);existing.add(key)}}
   rank=smartGeoRank({...place,name:bare},found,context);
  }catch(err){if(err.name==='AbortError'||err.rateLimited)throw err;/* Retain initial results when fallback is unavailable. */}
 }
 return rank;
}
function smartGeoMarkup(){
 const pending=savedPlaces.places.filter(p=>!validSavedLatLng(p));
 const visited=smartGeoVisited();
 return `<div class="saved-place-intro"><strong>תיקון מיקומים ללא תשלום</strong><p>חיפוש דרך Photon ללא מפתח API. התוצאות מדורגות לפי התאמה לשם, סיכות מאותה רשימה, נקודות הטיול ורמזי מדינה ואזור. רק התאמה חד־משמעית הנתמכת בראיות גאוגרפיות תאושר אוטומטית; אחרת תידרש בחירה ידנית.</p><div class="saved-place-counts"><span>${pending.length} ללא מיקום</span><span>${pending.filter(p=>!visited.has(p.id)).length} טרם נבדקו</span></div></div>
 <div class="ronny-geo-options"><label><input type="checkbox" id="ronny-geo-auto" checked> אשר אוטומטית רק התאמות חד־משמעיות</label><p>בלחיצה אחת נסרקות ברצף עד 120 נקודות שטרם נבדקו, בקצב מתון כדי לכבד את שירות Photon הציבורי. אפשר לעצור בכל שלב. רק התאמות ודאיות יישמרו אוטומטית.</p></div>
 <div class="ronny-geo-actions"><button class="btn btn-primary" type="button" id="ronny-geo-next">${icon('search','small-icon')} הפעל מנגנון איתור</button><button class="btn" type="button" id="ronny-geo-stop" disabled>${icon('pause','small-icon')} עצור</button><button class="btn btn-soft" type="button" id="ronny-geo-review">${icon('check-check','small-icon')} אשר התאמות בטוחות</button></div>
 <div class="ronny-geo-progress"><div class="ronny-geo-progress-bar" id="ronny-geo-bar"></div></div><p role="status" aria-live="polite" id="ronny-geo-status">מוכן להתחיל. השירות פועל דרך האינטרנט ואינו מבטיח למצוא כל סיכה.</p>
 <div id="ronny-geo-results" class="ronny-geo-results"></div>
 <button class="btn btn-ghost" type="button" id="ronny-geo-reset">אפשר לבדוק שוב מקומות ללא מיקום</button><p class="footnote">השרת הציבורי Photon מיועד לשימוש סביר בלבד ועלול להגביל עומס. התאמות חסרות או שמות דומים מחייבים אישור ידני. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>`;
}
function smartGeoStatus(msg){smartGeoRunStatus=msg;const e=$('ronny-geo-status');if(e)e.textContent=msg;}
function smartGeoProgress(done,total){smartGeoRunProgress={done,total};const e=$('ronny-geo-bar');if(e)e.style.width=(total?Math.min(100,Math.round(done/total*100)):0)+'%';}
function smartGeoAddRow(place,rank){
 const root=$('ronny-geo-results');if(!root)return;
 const row=document.createElement('section');row.className='ronny-geo-row';row.dataset.geoPlace=place.id;
 const badge=rank.reliable?'<span class="ronny-geo-cert safe">התאמה בטוחה יחסית</span>':'<span class="ronny-geo-cert">דורש אישור</span>';
 const candidates=rank.candidates.map((c,i)=>savedPlaceCandidateHTML(c,i,'geo')).join('');
 row.innerHTML=`<div class="ronny-geo-head"><strong>${esc(place.name)}</strong>${badge}</div><small class="ronny-geo-list">${esc(savedPlaceBucket(place)?.name||'')} · ${esc(rank.hint||'')}</small><div class="ronny-geo-candidates">${candidates||'<p class="footnote">לא נמצאה התאמה. ניתן למקם ידנית.</p>'}</div><div class="ronny-geo-row-foot"><button class="btn btn-soft" type="button" data-geo-manual="${esc(place.id)}">${icon('map-pin','small-icon')} הצב במפה</button>${place.url?`<a class="ronny-geo-maplink" href="${esc(place.url)}" target="_blank" rel="noopener noreferrer">בדוק בגוגל מפות</a>`:''}</div>`;
 root.append(row);
 row.querySelectorAll('[data-geo-preview]').forEach(b=>b.onclick=()=>previewSavedPlaceCandidate(place.id,rank.candidates[Number(b.dataset.geoPreview)]));
 row.querySelectorAll('[data-geo-choose]').forEach(b=>b.onclick=()=>smartGeoApprove(place.id,Number(b.dataset.geoChoose)));
 row.querySelector('[data-geo-manual]').onclick=()=>{smartGeoAbort?.abort();manuallyPinSavedPlace(place.id)};
 refreshIcons();
}
async function smartGeoApprove(id,index=0,isAutomatic=false){
 const place=savedPlaces.places.find(p=>p.id===id);const data=smartGeoSuggestions.get(id),pick=data?.candidates[index];
 if(!place||!pick||validSavedLatLng(place))return false;
 place.lat=pick.lat;place.lng=pick.lng;place.positionSource=isAutomatic?'photon-auto':'photon-confirmed';
 await persistSavedPlaces();renderSavedPlaceMarkers();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();
 const row=Array.from(document.querySelectorAll('[data-geo-place]')).find(r=>r.dataset.geoPlace===id);
 if(row){row.innerHTML=`<span class="saved-batch-completed">${icon('check-circle','small-icon')} אושר ונשמר · ${esc(place.name)}</span>`;refreshIcons()}
 smartGeoSuggestions.delete(id);smartGeoPersistSuggestions();return true;
}
async function smartGeoApproveReliable(){
 let n=0;for(const [id,rank] of Array.from(smartGeoSuggestions.entries()))if(rank.reliable)if(await smartGeoApprove(id))n++;
 smartGeoStatus(n?`נשמרו ${n} התאמות בעלות רמת ודאות גבוהה.`:'אין התאמות בטוחות נוספות לאישור. ניתן לבחור מקום מתוך התוצאות.');
}
async function smartGeoScan(){
 if(smartGeoBusy)return;
 const visited=smartGeoVisited(),pending=savedPlaces.places.filter(p=>!validSavedLatLng(p)&&!visited.has(p.id)).slice(0,120);
 if(!pending.length){smartGeoStatus('אין עוד מקומות שלא נבדקו. אפשר לאשר תוצאות קיימות או לאפס את היסטוריית הבדיקה.');return}
 const ctl=new AbortController();smartGeoAbort=ctl;smartGeoBusy=true;smartGeoAutoApprove=$('ronny-geo-auto')?.checked!==false;
 $('ronny-geo-next').disabled=true;$('ronny-geo-stop').disabled=false;
 smartGeoProgress(0,pending.length);
 let checked=0,confirmed=0,errors=0,consecutiveErrors=0,rateLimited=false;
 try{
  for(const place of pending){
   if(ctl.signal.aborted)break;
   smartGeoStatus(`מחפש ${checked+1} מתוך ${pending.length}: ${place.name}`);
   try{
    const rank=await smartGeoSearchCandidates(place,{signal:ctl.signal});
    smartGeoSuggestions.set(place.id,rank);smartGeoPersistSuggestions();
    visited.add(place.id);smartGeoSaveVisited(visited);consecutiveErrors=0;
    smartGeoAddRow(place,rank);
    if(rank.reliable&&smartGeoAutoApprove){if(await smartGeoApprove(place.id,0,true))confirmed++}
   }catch(err){if(ctl.signal.aborted)break;if(err.rateLimited){rateLimited=true;smartGeoStatus('השירות הציבורי מגביל עומס. הסריקה נעצרה בלי לסמן את הנקודות שלא נבדקו.');break}errors++;consecutiveErrors++;if(consecutiveErrors>=3){smartGeoStatus('האיתור הופסק לאחר שלוש שגיאות רצופות. נסה שוב כשהחיבור יתייצב.');break}smartGeoAddRow(place,{candidates:[],reliable:false,hint:'שגיאת רשת — לא סומן כבדוק'});}
   checked++;smartGeoProgress(checked,pending.length);
   // One modest sequential request at a time, with time to read and cancel.
   if(checked<pending.length&&!ctl.signal.aborted)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(!ctl.signal.aborted&&checked&&!rateLimited&&consecutiveErrors<3){
   const left=savedPlaces.places.filter(p=>!validSavedLatLng(p)&&!visited.has(p.id)).length;
   const review=savedPlaces.places.filter(p=>!validSavedLatLng(p)&&visited.has(p.id)).length;
   smartGeoStatus(`נבדקו ${checked} מקומות · ${confirmed} אושרו אוטומטית · ${errors} נכשלו · ${left} ממתינים לסריקה · ${review} עדיין ללא מיקום. תוצאות לא ודאיות מופיעות כאן לבדיקה. ${left?'ניתן להמשיך בעוד לחיצה להרצה נוספת.':'הסריקה הושלמה.'}`);
  }
 }finally{
  smartGeoBusy=false;smartGeoAbort=null;
  if($('ronny-geo-next'))$('ronny-geo-next').disabled=false;
  if($('ronny-geo-stop'))$('ronny-geo-stop').disabled=true;
 }
}
function openSmartPlaceRepair(autoStart=false){
 if(savedPlaceBusy)return;
 // Extract any precise coordinates before spending requests.
 let direct=0;for(const p of savedPlaces.places){if(validSavedLatLng(p))continue;const exact=googleMapCoordinates(p.url);if(exact){p.lat=exact.lat;p.lng=exact.lng;p.positionSource=exact.positionSource;direct++}}
 if(direct){persistSavedPlaces();renderSavedPlaceMarkers()}
 // Previously found candidates remain reviewable after reopening the drawer.
 openDrawer('תיקון סיכות Google','ללא מפתח API','איתור מיקומים מדורג ובטוח',smartGeoMarkup(),`<button class="btn" type="button" id="ronny-geo-back">חזרה לספריית המקומות</button>`);
 $('ronny-geo-next').onclick=smartGeoScan;
 if(smartGeoBusy){$('ronny-geo-next').disabled=true;$('ronny-geo-stop').disabled=false;$('ronny-geo-auto').checked=smartGeoAutoApprove;}
 if(smartGeoRunStatus)smartGeoStatus(smartGeoRunStatus);
 smartGeoProgress(smartGeoRunProgress.done,smartGeoRunProgress.total);
 for(const [id,rank] of smartGeoSuggestions){const p=savedPlaces.places.find(x=>x.id===id);if(p&&!validSavedLatLng(p))smartGeoAddRow(p,rank)}
 $('ronny-geo-stop').onclick=()=>{smartGeoAbort?.abort();smartGeoStatus('הסריקה נעצרה. התוצאות שכבר נמצאו נשמרו במסך זה.')};
 $('ronny-geo-review').onclick=smartGeoApproveReliable;
 $('ronny-geo-reset').onclick=()=>{if(smartGeoBusy)return;smartGeoSaveVisited(new Set());smartGeoStatus('היסטוריית החיפוש אופסה. כעת אפשר לבדוק שוב מקומות שטרם מוקמו.');};
 $('ronny-geo-back').onclick=()=>ronnyGoBack();
 if(direct)smartGeoStatus(`שוחזרו ${direct} מיקומים מדויקים מקישורים. אפשר להתחיל באיתור הנותרים.`);
 refreshIcons();
 if(autoStart)smartGeoScan();
}

function showSavedPlaceLibrary(){
 const lists=savedPlaces.lists,places=savedPlaces.places;
 const known=places.filter(validSavedLatLng).length;
 const body=`<div class="saved-place-intro"><strong>ספריית המקומות שלי</strong><p>כל רשימה ניתנת לפתיחה בנפרד. אייקון העין מציג או מסתיר את הסיכות שלה במפה; רשימות סגורות אינן מציגות מאות שורות.</p><div class="saved-place-counts"><span>${lists.length} רשימות</span><span>${places.length} מקומות</span><span>${known} ממוקמים</span><span>${places.length-known} ממתינים לאישור</span></div></div><div class="saved-place-import"><button class="btn btn-primary" id="saved-places-import">${icon('upload')} ייבוא Google Takeout</button><input id="saved-places-file" type="file" accept=".zip,.csv,.json" multiple hidden><button type="button" class="btn btn-soft" id="saved-places-repair">${icon('map-pin-check','small-icon')} שחזר מיקומים מקישורי Google</button><button type="button" class="btn btn-soft" id="saved-places-lookup">${icon('search','small-icon')} הפעל מנגנון איתור</button><small>לחיצה אחת מפעילה איתור רציף ושמירה אוטומטית של התאמות בטוחות בלבד. תוצאות לא ודאיות יישארו לבדיקה.</small></div><div class="ronny-library-toolbar" role="toolbar" aria-label="פעולות ספריית המקומות"><button type="button" data-saved-bulk="select">הצג את כל הרשימות</button><button type="button" data-saved-bulk="deselect">הסתר את כל הרשימות</button><button type="button" data-saved-bulk="expand">פתח הכול</button><button type="button" data-saved-bulk="collapse">סגור הכול</button><span class="ronny-library-selection-status" id="saved-place-selected-count" role="status">נבחרו 0 נקודות</span><button type="button" data-saved-select-action="filtered">בחר את המסוננות</button><button type="button" data-saved-select-action="photon">בחר תוצאות Photon</button><button type="button" data-saved-select-action="clear">בטל בחירת נקודות</button><button type="button" class="ronny-bulk-danger" data-saved-selected-action="clear" disabled>הסר מיקום מהנבחרות</button><button type="button" class="ronny-bulk-danger" data-saved-selected-action="delete" disabled>מחק נקודות נבחרות</button></div><div class="ronny-saved-search"><input id="saved-place-filter" placeholder="חיפוש בכל הרשימות…" value="${esc(savedPlaceFilter)}" aria-label="חיפוש מקומות"/><select id="saved-place-status" aria-label="סנן לפי אישור מיקום"><option value="all" ${savedPlaceStatusFilter==='all'?'selected':''}>כל המקומות</option><option value="located" ${savedPlaceStatusFilter==='located'?'selected':''}>מיקומים מזוהים</option><option value="missing" ${savedPlaceStatusFilter==='missing'?'selected':''}>ממתינים לאישור</option><option value="photon" ${savedPlaceStatusFilter==='photon'?'selected':''}>תוצאות איתור Photon</option></select></div><div id="saved-place-collections">${savedPlaceCollectionsHTML()}</div>`;
 openDrawer('ספריית המקומות','GOOGLE SAVED PLACES','רשימות אישיות ושכבות במפה',body,`<button class="btn" id="saved-places-close">סיום</button>`);
 $('saved-places-close').onclick=closeDrawer;
 $('saved-places-repair').onclick=repairSavedPlaceCoordinates;$('saved-places-lookup').onclick=()=>openSmartPlaceRepair(true);$('saved-places-import').onclick=()=>$('saved-places-file').click();$('saved-places-file').onchange=e=>importSavedPlacesFiles(e.target.files);
 $('drawer-body').querySelectorAll('[data-saved-bulk]').forEach(el=>el.onclick=()=>savedPlaceBulkAction(el.dataset.savedBulk));
 $('drawer-body').querySelectorAll('[data-saved-select-action]').forEach(el=>el.onclick=()=>savedPlaceSelectMatching(el.dataset.savedSelectAction));
 $('drawer-body').querySelectorAll('[data-saved-selected-action]').forEach(el=>el.onclick=()=>savedPlaceBulkEdit(el.dataset.savedSelectedAction));
 $('saved-place-filter').oninput=e=>{savedPlaceFilter=e.target.value;refreshSavedCollections(true)};
 $('saved-place-status').onchange=e=>{savedPlaceStatusFilter=e.target.value;refreshSavedCollections()};
 bindSavedPlaceCollectionActions($('saved-place-collections'));
 refreshIcons();
}

(async()=>{
 try{await initTripLibrary()}catch(e){state=prepareTrip(demo());activeTripId=uid();libraryReady=true;save();toast('טעינת הספרייה נכשלה. ניתן לייצא קובץ גיבוי.')}
 await initSavedPlaces();$('ronny-rail-back').onclick=ronnyGoBack;planningResolution=state.settings.planningResolution==='outline'?'outline':'day';const startupWorkspace=ronnyReadWorkspace();ronnyApplyWorkspaceSelection(startupWorkspace);repairExistingSchedules();initMap();map?.on('moveend zoomend',ronnyRememberWorkspace);enableMapPopupDragging();initDaysManager();initOutsideDismissal();
 window.addEventListener('resize',()=>{for(const id of ['leg-editor','point-quick','map-context','layer-filter-panel'])keepMapPopoverVisible($(id))});
 bind();setupResizers();initializePlannerVerticalResize();activatePhotoInput();renderAll();initMapGroupToggles();initMapQuickPickers();
 // Restore an existing view without animation. For a new workspace, keep the
 // original deferred fit so map controls and gestures are not competing with an
 // animated flyTo at the instant the initial UI appears.
 if(startupWorkspace){ronnyRestoreWorkspaceViewport(startupWorkspace)}
 else{
  ronnyWorkspaceReady=true;
  const startupTrip=activeTripId,startupSeq=++wholeTripFocusSeq;
  const stopForUserMove=()=>{if(activeTripId===startupTrip&&wholeTripFocusSeq===startupSeq)wholeTripFocusSeq++};
  map?.once('movestart',stopForUserMove);
  setTimeout(()=>{
   map?.off('movestart',stopForUserMove);
   if(activeTripId===startupTrip&&wholeTripFocusSeq===startupSeq)focusLoadedTrip();
  },360);
 }
 const wasCollapsed=(()=>{try{return localStorage.getItem('ronny-planner-collapsed-v1')==='true'}catch(e){return false}})();
 if(wasCollapsed)setPlannerCollapsed(true);
})().catch(e=>{$('map').textContent='אירעה שגיאה בהפעלת האתר. '+e.message});
})();
