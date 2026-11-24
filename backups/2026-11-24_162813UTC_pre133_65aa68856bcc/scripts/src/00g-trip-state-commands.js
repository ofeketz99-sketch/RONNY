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
const WALK_POINT_TYPES=new Set(['walkStart','walkTurn','walkEnd']);
const WALK_INNER_MESSAGE='נקודות בתוך מסלול הליכה נשארות בין תחילת ההליכה לסיומה. כדי להזיז את כל ההליכה יש להזיז את נקודת תחילת ההליכה.';
// A complete walking loop moves as one block; every other route point is its own unit.
function routeUnits(arr){
 const units=[];
 for(let i=0;i<arr.length;i++){
  const point=arr[i];
  if(point.type==='walkStart'){
   let end=-1;
   for(let j=i+1;j<arr.length;j++){
    if(arr[j].type==='walkStart')break;
    if(arr[j].type==='walkEnd'&&arr[j].walkLoopSource===point.id){end=j;break}
   }
   if(end>i){units.push({from:i,to:end,walk:true});i=end;continue}
  }
  units.push({from:i,to:i,walk:false});
 }
 return units;
}
function planRouteSwap(arr,fromId,toId){
 const a=arr.findIndex(p=>p.id===fromId),b=arr.findIndex(p=>p.id===toId);
 if(a<0||b<0||a===b)return null;
 if(arr[a].autoLoopEnd||arr[b].autoLoopEnd)return {error:'נקודת הסיום של יום מעגלי נגזרת מההתחלה ואינה זזה בנפרד.'};
 const units=routeUnits(arr),inUnit=i=>units.find(u=>i>=u.from&&i<=u.to),ua=inUnit(a),ub=inUnit(b);
 if(ua===ub){
  if(!ua.walk)return null;
  if([a,b].some(i=>i===ua.from||i===ua.to))return {error:WALK_INNER_MESSAGE};
  const ordered=[...arr];[ordered[a],ordered[b]]=[ordered[b],ordered[a]];
  return {ordered,moved:[fromId,toId]};
 }
 if(ua.walk&&a!==ua.from)return {error:WALK_INNER_MESSAGE};
 const next=[...units],ia=units.indexOf(ua),ib=units.indexOf(ub);next[ia]=ub;next[ib]=ua;
 const ordered=next.flatMap(u=>arr.slice(u.from,u.to+1));
 if(arr.some(p=>p.type==='start')&&WALK_POINT_TYPES.has(ordered[0]?.type))return {error:'מסלול הליכה לא יכול להתחיל לפני נקודת ההתחלה של היום.'};
 if(arr.some(p=>p.type==='end')&&WALK_POINT_TYPES.has(ordered.at(-1)?.type))return {error:'מסלול הליכה לא יכול להסתיים אחרי נקודת הסיום של היום.'};
 return {ordered,moved:[...arr.slice(ua.from,ua.to+1),...arr.slice(ub.from,ub.to+1)].map(p=>p.id)};
}
// Drag-and-drop: move one unit so it lands right before `beforeId` (null = at the end).
// A walk moves as a block; a point inside a walk moves only between its own walk's start and finish.
function planRouteMove(arr,fromId,beforeId){
 const a=arr.findIndex(p=>p.id===fromId);if(a<0)return null;
 if(arr[a].autoLoopEnd)return {error:'נקודת הסיום של יום מעגלי נגזרת מההתחלה ואינה זזה בנפרד.'};
 const units=routeUnits(arr),ua=units.find(u=>a>=u.from&&a<=u.to);
 const b=beforeId==null?-1:arr.findIndex(p=>p.id===beforeId);
 if(beforeId!=null&&b<0)return null;
 if(ua.walk&&a!==ua.from){
  if(a===ua.to||b<=ua.from||b>ua.to)return {error:WALK_INNER_MESSAGE};
  if(b===a||b===a+1)return null;
  const ordered=[...arr],[moved]=ordered.splice(a,1);ordered.splice(b>a?b-1:b,0,moved);
  return {ordered,moved:[fromId]};
 }
 const own=units.indexOf(ua),rest=units.filter(u=>u!==ua);
 let pos=rest.length;
 if(b>=0){const ub=units.find(u=>b>=u.from&&b<=u.to);if(ub===ua)return null;if(b!==ub.from)return {error:WALK_INNER_MESSAGE};pos=rest.indexOf(ub)}
 // A circular day's derived finish always stays last.
 while(pos>0&&arr[rest[pos-1].from].autoLoopEnd)pos--;
 if(pos===own)return null;
 const next=[...rest];next.splice(pos,0,ua);
 const ordered=next.flatMap(u=>arr.slice(u.from,u.to+1));
 if(arr.some(p=>p.type==='start')&&WALK_POINT_TYPES.has(ordered[0]?.type))return {error:'מסלול הליכה לא יכול להתחיל לפני נקודת ההתחלה של היום.'};
 if(arr.some(p=>p.type==='end')&&WALK_POINT_TYPES.has(ordered.at(-1)?.type))return {error:'מסלול הליכה לא יכול להסתיים אחרי נקודת הסיום של היום.'};
 return {ordered,moved:arr.slice(ua.from,ua.to+1).map(p=>p.id)};
}
// Patch 130: a manually typed arrival time decides where the point goes in the day.
// minuteOf(p) → absolute arrival minutes (or null); dwellOf(p) → stay in minutes.
// Returns where to insert it and whether it overlaps the activity before or after.
function planTimedPlacement(arr,id,requested,{minuteOf,dwellOf}){
 const a=arr.findIndex(p=>p.id===id);if(a<0||!Number.isFinite(requested))return null;
 const all=routeUnits(arr),own=all.find(u=>a>=u.from&&a<=u.to);
 if(!own||own.walk)return null;
 const units=all.filter(u=>u!==own);
 let k=units.findIndex(u=>{const p=arr[u.from];if(p.type==='start')return false;const m=minuteOf(p);return m!=null&&m>requested});
 if(k<0){k=units.length;while(k>0&&(arr[units[k-1].from].type==='end'||arr[units[k-1].from].autoLoopEnd))k--}
 if(k===0&&units.length&&arr[units[0].from].type==='start')k=1;
 const prevUnit=units[k-1]||null,nextUnit=units[k]||null;
 const prev=prevUnit?arr[prevUnit.to]:null,next=nextUnit?arr[nextUnit.from]:null;
 const prevArrival=prev?minuteOf(prev):null;
 const prevDeparture=prevArrival==null?null:prevArrival+(['start','walkStart'].includes(prev.type)?0:Math.max(0,dwellOf(prev)||0));
 const nextArrival=next?minuteOf(next):null;
 const ownEnd=requested+Math.max(0,dwellOf(arr[a])||0);
 return {
  beforeId:next?next.id:null,index:k,
  moves:(next?next.id:null)!==(arr[own.to+1]?.id??null),
  prev,next,prevArrival,prevDeparture,nextArrival,
  overlapPrev:prevDeparture!=null&&prevDeparture>requested,
  overlapNext:nextArrival!=null&&nextArrival<ownEnd
 };
}
function planRouteStep(arr,id,delta){
 const index=arr.findIndex(p=>p.id===id);if(index<0)return null;
 const units=routeUnits(arr),unitIndex=units.findIndex(u=>index>=u.from&&index<=u.to),unit=units[unitIndex];
 if(unit.walk&&index!==unit.from){const target=arr[index+delta];return target?planRouteSwap(arr,id,target.id):null}
 const neighbor=units[unitIndex+delta];
 return neighbor?planRouteSwap(arr,id,arr[neighbor.from].id):null;
}
function renumberGenericDayLabels(trip){
 trip.days.forEach((d,i)=>{if(/^יום\s+\d+$/u.test(String(d.label||'')))d.label='יום '+(i+1)});
}
function synchronizeForRender(trip,isDayView,{syncWalkingLoops,synchronizeLoopDays,synchronizeDayStarts,synchronizeChronologicalEndpointNames,synchronizeNightIdentity}){const walkingLinked=trip.days.some(day=>syncWalkingLoops(day));const linked=isDayView?synchronizeDayStarts():false;const loopLinked=synchronizeLoopDays();const nightLinked=isDayView&&synchronizeNightIdentity?synchronizeNightIdentity():false;const chronoLinked=synchronizeChronologicalEndpointNames();return !!(linked||loopLinked||walkingLinked||nightLinked||chronoLinked)}
return Object.freeze({ronnyIsAutoEndpointName,ronnyEndpointDayName,synchronizeChronologicalEndpointNames,positionRouteEndpoints,enforceRouteEndpoints,commitRouteOrder,routeUnits,planRouteSwap,planRouteMove,planTimedPlacement,planRouteStep,renumberGenericDayLabels,synchronizeForRender});
})();
