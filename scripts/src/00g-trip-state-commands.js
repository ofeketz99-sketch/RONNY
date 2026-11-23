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
function synchronizeForRender(trip,isDayView,{syncWalkingLoops,synchronizeLoopDays,synchronizeDayStarts,synchronizeChronologicalEndpointNames}){const walkingLinked=trip.days.some(day=>syncWalkingLoops(day));const linked=isDayView?synchronizeDayStarts():false;const loopLinked=synchronizeLoopDays();const chronoLinked=synchronizeChronologicalEndpointNames();return !!(linked||loopLinked||walkingLinked||chronoLinked)}
return Object.freeze({ronnyIsAutoEndpointName,ronnyEndpointDayName,synchronizeChronologicalEndpointNames,positionRouteEndpoints,enforceRouteEndpoints,commitRouteOrder,routeUnits,planRouteSwap,planRouteStep,renumberGenericDayLabels,synchronizeForRender});
})();
