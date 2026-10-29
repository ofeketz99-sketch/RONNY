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
function synchronizeForRender(trip,isDayView,{syncWalkingLoops,synchronizeLoopDays,synchronizeDayStarts,synchronizeChronologicalEndpointNames}){const walkingLinked=trip.days.some(day=>syncWalkingLoops(day));const linked=isDayView?synchronizeDayStarts():false;const loopLinked=synchronizeLoopDays();const chronoLinked=synchronizeChronologicalEndpointNames();return !!(linked||loopLinked||walkingLinked||chronoLinked)}
return Object.freeze({ronnyIsAutoEndpointName,ronnyEndpointDayName,synchronizeChronologicalEndpointNames,positionRouteEndpoints,enforceRouteEndpoints,commitRouteOrder,renumberGenericDayLabels,synchronizeForRender});
})();
