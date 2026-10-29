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
