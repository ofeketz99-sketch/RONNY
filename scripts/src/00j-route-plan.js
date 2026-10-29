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
