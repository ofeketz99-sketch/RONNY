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
