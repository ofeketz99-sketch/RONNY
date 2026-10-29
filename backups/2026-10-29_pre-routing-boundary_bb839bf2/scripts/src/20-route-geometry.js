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
function legCoords(index,arr=stops()){
 const a=arr[index-1],b=arr[index],leg=legAt(index,arr);
 const start=[+a.lat,+a.lng],path=Array.isArray(leg.path)?leg.path.filter(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)):[];
 if(leg.mode==='pencil')return [start,...path];
 return [start,...(leg.mode==='draw'?path:[]),[+b.lat,+b.lng]];
}
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
function splitRoutedLegs(coords,waypoints){
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
function addDrawPointOnLine(index,location){
 const leg=getLegMutable(index);if(!leg||leg.mode!=='draw')return;
 const at=segmentOfPathNearest(legCoords(index),location);
 leg.path.splice(at,0,[+location.lat.toFixed(6),+location.lng.toFixed(6)]);
 save();drawRoute();renderViaHandles();toast('נוספה נקודת שרטוט. גרור אותה כדי לדייק את התוואי.');
}
function drawLegLine(coords,mode,index,unavailable=false){
 const current=stops(),point=current[index];
 if(point?.type==='walkStart')return;
 const walkingAccess=point?.type==='walkStart';const unverified=!!unavailable||!!point?.leg?.walkRetraceUnverified;
 if(point?.leg?.walkAutoRetrace&&point.walkLoopSource&&coords?.length>1&&map){
  coords=coords.map((coord,i)=>{
   const prev=coords[Math.max(0,i-1)],next=coords[Math.min(coords.length-1,i+1)];
   const a=map.latLngToLayerPoint(prev),b=map.latLngToLayerPoint(next),p=map.latLngToLayerPoint(coord);
   const scale=4/(Math.hypot(b.x-a.x,b.y-a.y)||1);
   const ll=map.layerPointToLatLng(L.point(p.x-(b.y-a.y)*scale,p.y+(b.x-a.x)*scale));
   return [ll.lat,ll.lng];
  });
 }

 if(!Array.isArray(coords)||coords.length<2)return;
 const baseColor=pointColor(stops()[index],selectedDay),color=routeDisplayColor(baseColor,index),showLine=layerOn('routeLines');
 paintedLegCoordinates.set(index,coords);
 if(showLine){
  const options={color:unverified?'#998d77':color,weight:unverified?3:mode==='straight'?3:5,opacity:unverified?.72:.98,dashArray:unverified?'4 9':walkingAccess?'5 8':mode==='straight'?'7 9':undefined,lineCap:'round',interactive:false,className:unverified?'leg-map-path leg-route-unverified':'leg-map-path'};
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
function manualLeg(index,arr=stops()){
 const leg=legAt(index,arr),coords=legCoords(index,arr),minutes=routeLegMinutes(leg);
 return {duration:(minutes??0)*60,distance:distanceOfCoords(coords),mode:leg.mode,baseDuration:null,manualMissing:minutes===null};
}
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
function renderLayerFilterPanel(){
 const el=$('layer-filter-panel');if(!el)return;
 const visibility=layerVisibility();
 el.innerHTML=`<div class="layer-filter-panel-head"><div><strong>שכבות במפה</strong><small>אפשר לבחור אילו שכבות ותוויות יוצגו כעת</small></div><button type="button" id="layer-filter-close" aria-label="סגירת חלונית שכבות">${icon('x','small-icon')}</button></div>${guideControlsMarkup()}<div class="layer-filter-list">${LAYER_FILTER_DEFS.map(item=>`<label class="layer-filter-row"><span><strong>${item.label}</strong><small>${item.hint}</small></span><input class="layer-filter-switch" type="checkbox" data-layer-key="${item.key}" ${visibility[item.key]?'checked':''}></label>`).join('')}</div><div class="layer-filter-presets"><button type="button" id="layer-preset-all">הכול</button><button type="button" id="layer-preset-clean">מסלול נקי</button></div>`;
 wireGuideControls(el);
 $('layer-filter-close').onclick=closeLayerFilterPanel;
 el.querySelectorAll('[data-layer-key]').forEach(input=>input.onchange=()=>{const key=input.dataset.layerKey;layerVisibility()[key]=!!input.checked;save();renderMap();renderLayerFilterPanel()});
 $('layer-preset-all').onclick=()=>{state.settings.layerVisibility={...DEFAULT_LAYER_VISIBILITY,routeTimes:true};save();renderMap();renderLayerFilterPanel()};
 $('layer-preset-clean').onclick=()=>{state.settings.layerVisibility={...DEFAULT_LAYER_VISIBILITY,poiLinks:false,routeLabels:false,routeTimes:false,photos:false};save();renderMap();renderLayerFilterPanel()};
 refreshIcons();
}
function closeLayerFilterPanel(){const el=$('layer-filter-panel');if(!el)return;el.classList.remove('open');$('layer-filter-toggle')?.setAttribute('aria-pressed','false')}
function openLayerFilterPanel(){
 closeLegEditor();hidePointQuick();hideContext();
 const el=$('layer-filter-panel');if(!el)return;renderLayerFilterPanel();el.classList.add('open');$('layer-filter-toggle')?.setAttribute('aria-pressed','true');
 const pane=document.querySelector('.map-pane'),btn=$('layer-filter-toggle');if(!pane||!btn)return;
 const paneRect=pane.getBoundingClientRect(),box=btn.getBoundingClientRect();
 positionMapPopover(el,{x:box.left-paneRect.left+box.width/2,y:box.top-paneRect.top+box.height/2});
}
function toggleLayerFilterPanel(){const el=$('layer-filter-panel');if(!el)return;el.classList.contains('open')?closeLayerFilterPanel():openLayerFilterPanel()}

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
