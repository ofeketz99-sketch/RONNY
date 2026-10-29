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
