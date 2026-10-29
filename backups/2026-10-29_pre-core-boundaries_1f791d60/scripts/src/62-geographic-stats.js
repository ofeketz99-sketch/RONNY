function ronnyPolyContains(lng,lat,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const [ax,ay]=polygon[i],[bx,by]=polygon[j];if(((ay>lat)!==(by>lat))&&lng<(bx-ax)*(lat-ay)/(by-ay)+ax)inside=!inside}return inside}
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
