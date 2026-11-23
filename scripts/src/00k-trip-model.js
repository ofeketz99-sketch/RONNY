// Role/category and overnight model (patch 126). Pure: no DOM, map or global state.
// `type` stays the saved category. `role` is stored only when it differs from the
// category's natural role, so trips that never use it are saved exactly as before.
const TripModel=(()=>{
const ANCHOR_TYPES=new Set(['start','end']);
const WALK_TYPES=new Set(['walkStart','walkTurn','walkEnd']);
const SIDE_TYPES=new Set(['poi','note','nature','viewpoint','dining','fuel','other']);
const SWITCHABLE_ROLES=['stop','side','idea'];
const ROLE_LABELS=Object.freeze({anchor:'עוגן מסלול',stop:'עצירה בלו״ז',side:'נקודת צד',idea:'רעיון',walk:'מסלול הליכה'});
const ROLE_SHORT=Object.freeze({anchor:'עוגן',stop:'בלו״ז',side:'צד',idea:'רעיון',walk:'הליכה'});
const ROLE_ICONS=Object.freeze({anchor:'anchor',stop:'calendar-clock',side:'map-pinned',idea:'lightbulb',walk:'footprints'});
const TRANSFER_KINDS=Object.freeze({
 flight:Object.freeze({label:'טיסה',icon:'plane'}),
 ferry:Object.freeze({label:'מעבורת לילה',icon:'ship'}),
 train:Object.freeze({label:'רכבת',icon:'train-front'}),
 car:Object.freeze({label:'החזרת רכב',icon:'car-front'}),
 other:Object.freeze({label:'מעבר אחר',icon:'unlink-2'})
});
const GENERIC_VIA=/^(?:נקודת מעבר(?:\s*\d+)?|מעבר דרך נקודה)$/u;
const GENERIC_SIDE_NAME='נקודת עניין';

function defaultRole(type){
 if(ANCHOR_TYPES.has(type))return 'anchor';
 if(WALK_TYPES.has(type))return 'walk';
 if(type==='idea')return 'idea';
 return SIDE_TYPES.has(type)?'side':'stop';
}
function roleOf(stop){
 const natural=defaultRole(stop?.type);
 if(natural==='anchor'||natural==='walk')return natural;
 return SWITCHABLE_ROLES.includes(stop?.role)?stop.role:natural;
}
function canSwitchRole(stop){const natural=defaultRole(stop?.type);return natural!=='anchor'&&natural!=='walk'&&!stop?.autoLoopEnd&&!stop?.autoWalkEnd}
function storeRole(stop,role){if(role===defaultRole(stop.type))delete stop.role;else stop.role=role}
// Changes only the role. Name, coordinates, icon, cost, notes and legs stay on the point.
function setRole(stop,role){
 if(!canSwitchRole(stop)||!SWITCHABLE_ROLES.includes(role)||roleOf(stop)===role)return false;
 if(role==='stop'){
  if(stop.viaBeforeRole===true&&stop.type==='poi'){
   stop.type='via';delete stop.viaBeforeRole;
   if(stop.viaGenericName===true&&stop.name===GENERIC_SIDE_NAME)stop.name='נקודת מעבר';
   delete stop.viaGenericName;
  }
  if(!(Number(stop.duration)>0)&&stop.type!=='via'){stop.duration=stop.type==='parking'?15:60;stop.autoRoleDuration=stop.duration}
 }else{
  // A numbered pass-through has no meaning off the route, so it rests as a general place.
  if(stop.type==='via'){
   stop.type='poi';stop.viaBeforeRole=true;
   if(GENERIC_VIA.test(String(stop.name||'').trim())){stop.viaGenericName=true;stop.name=GENERIC_SIDE_NAME}
  }
  if(stop.autoRoleDuration!==undefined){if(Number(stop.duration)===stop.autoRoleDuration)stop.duration=0;delete stop.autoRoleDuration}
 }
 storeRole(stop,role);
 return true;
}
// A category change keeps the role, except choosing a pass-through, which is a route stop by definition.
function keepRoleAfterCategoryChange(stop,previousRole){
 if(!canSwitchRole(stop)){return}
 if(stop.type==='via'){delete stop.role;return}
 if(SWITCHABLE_ROLES.includes(previousRole))storeRole(stop,previousRole);
}
function normalizeStop(stop){
 if(!stop||typeof stop!=='object')return;
 if(Object.hasOwn(stop,'role')){
  if(!SWITCHABLE_ROLES.includes(stop.role))delete stop.role;
  else if(stop.type==='via'&&stop.role!=='stop'){const role=stop.role;delete stop.role;setRole(stop,role)}
  else if(canSwitchRole(stop)&&stop.role===defaultRole(stop.type))delete stop.role;
 }
 if(Object.hasOwn(stop,'dayTransfer')){
  const t=stop.dayTransfer;
  if(!t||typeof t!=='object'||!TRANSFER_KINDS[t.kind])delete stop.dayTransfer;
  else{stop.dayTransfer={kind:t.kind,note:String(t.note||'').slice(0,120),fromDayId:typeof t.fromDayId==='string'?t.fromDayId:''};if(stop.type==='start')stop.startDetached=true}
 }
}
// Cheapest detour between route units. A walking loop is never split, and the
// point never lands before the day's start or after its finish.
function insertionIndex(route,point,distance,routeUnits){
 if(!route.length)return 0;
 const units=routeUnits(route),coord=p=>[Number(p.lat),Number(p.lng)];
 const low=route[0].type==='start'?1:0,high=Math.max(low,units.length-(route.at(-1).type==='end'&&units.length>low?1:0));
 const span=(a,b)=>{const d=distance(coord(a),coord(b));return Number.isFinite(d)?d:0};
 let best=high,bestCost=Infinity;
 for(let gap=low;gap<=high;gap++){
  const before=gap>0?route[units[gap-1].to]:null,after=gap<units.length?route[units[gap].from]:null;
  const cost=(before?span(before,point):0)+(after?span(point,after):0)-(before&&after?span(before,after):0);
  if(cost<bestCost){bestCost=cost;best=gap}
 }
 return best<units.length?units[best].from:route.length;
}

function endpointOfDay(day,valid){return (day?.stops||[]).find(s=>(s.type==='end'||(day.loop&&s.type==='start'))&&valid(s))||null}
function startOfDay(day){return (day?.stops||[]).find(s=>s.type==='start')||null}
function samePlace(a,b){return Number(a?.lat)===Number(b?.lat)&&Number(a?.lng)===Number(b?.lng)}
// The link between day i and day i+1: one shared night, a real transfer, or not yet defined.
function dayLink(trip,i,valid){
 const from=trip?.days?.[i],to=trip?.days?.[i+1];if(!from||!to)return null;
 const ending=endpointOfDay(from,valid),start=startOfDay(to);
 if(!ending||!start||ending===start)return {index:i,state:'open',ending,start};
 const t=start.dayTransfer,labelled=!!(t&&TRANSFER_KINDS[t.kind]&&t.fromDayId===from.dayId);
 const inherited=start.fromPreviousDayEnd||start.autoInheritedStart===true;
 if(start.startDetached===true||labelled||(!inherited&&!samePlace(ending,start))){
  return {index:i,state:'transfer',ending,start,kind:labelled?t.kind:null,note:labelled?t.note||'':''};
 }
 return {index:i,state:'night',ending,start};
}
// Consecutive circular days reuse one base, so several nights form one place.
function nightIndex(trip,valid){
 const groups=[],byStop=new Map();let open=null;
 for(let i=0;i<(trip?.days?.length||0)-1;i++){
  const link=dayLink(trip,i,valid);
  if(link?.state!=='night'){open=null;continue}
  if(open&&open.members.at(-1).stop===link.ending){
   open.members.push({stop:link.start,day:i+1});open.nights.push(i);
  }else{
   open={id:link.ending.id,owner:link.ending,members:[{stop:link.ending,day:i},{stop:link.start,day:i+1}],nights:[i]};
   groups.push(open);
  }
 }
 for(const group of groups)for(const member of group.members)byStop.set(member.stop.id,group);
 return {groups,byStop};
}
// Equal amounts on one night are one payment. Different amounts are kept and flagged.
function nightCost(group){
 const values=[...new Set(group.members.map(m=>Math.max(0,Number(m.stop.cost)||0)).filter(v=>v>0))];
 return {total:values.reduce((sum,v)=>sum+v,0),conflict:values.length>1,values};
}
function costsFromIndex(index){
 const counted=new Map();
 for(const group of index.groups){
  const {total}=nightCost(group);
  group.members.forEach((member,i)=>counted.set(member.stop.id,i===0?total:0));
 }
 return counted;
}
function countedCosts(trip,valid){return costsFromIndex(nightIndex(trip,valid))}
function setNightCost(group,value){
 const amount=Math.max(0,Number(value)||0);
 group.members.forEach((member,i)=>{member.stop.cost=i===0?amount:0});
}
function setNightName(group,name){
 const clean=String(name||'').trim();if(!clean)return;
 group.members.forEach((member,i)=>{
  const stop=member.stop;
  if(i>0&&!stop.nightNameInherited&&stop.name!==clean&&String(stop.name||'').trim()&&!stop.autoChronoName&&stop.preNightName===undefined)stop.preNightName=stop.name;
  stop.name=clean;stop.autoPlaceName=false;stop.autoViaName=false;stop.autoChronoName=false;
  if(i===0)delete stop.nightNameInherited;else stop.nightNameInherited=true;
 });
}
// Shows a user-given night name on both days. A copied name is flagged so it can be
// removed safely if the days are later separated.
function syncNightNames(trip,valid,isAutoName){
 let changed=false;
 const index=nightIndex(trip,valid);
 for(const group of index.groups){
  const source=group.members.find(m=>!m.stop.nightNameInherited&&String(m.stop.name||'').trim()&&!isAutoName(m.stop.name));
  if(!source)continue;
  for(const member of group.members){
   if(member===source)continue;
   const stop=member.stop,auto=!String(stop.name||'').trim()||isAutoName(stop.name);
   if(!auto&&!stop.nightNameInherited)continue;
   if(stop.name!==source.stop.name){stop.name=source.stop.name;changed=true}
   if(!stop.nightNameInherited){stop.nightNameInherited=true;changed=true}
   if(stop.autoChronoName){stop.autoChronoName=false;changed=true}
  }
 }
 for(const day of trip.days||[])for(const stop of day.stops||[]){
  if(!stop.nightNameInherited||index.byStop.has(stop.id))continue;
  delete stop.nightNameInherited;
  if(typeof stop.preNightName==='string'){stop.name=stop.preNightName;delete stop.preNightName;stop.autoChronoName=false}
  else{stop.name='';stop.autoChronoName=true}
  changed=true;
 }
 return changed;
}
function setTransfer(trip,i,{kind=null,note=''}={}){
 const from=trip?.days?.[i],start=startOfDay(trip?.days?.[i+1]);if(!from||!start)return false;
 start.startDetached=true;start.autoInheritedStart=false;delete start.fromPreviousDayEnd;
 if(TRANSFER_KINDS[kind])start.dayTransfer={kind,note:String(note||'').slice(0,120),fromDayId:from.dayId};
 else delete start.dayTransfer;
 return true;
}
return Object.freeze({ROLE_LABELS,ROLE_SHORT,ROLE_ICONS,SWITCHABLE_ROLES:Object.freeze([...SWITCHABLE_ROLES]),TRANSFER_KINDS,defaultRole,roleOf,canSwitchRole,setRole,keepRoleAfterCategoryChange,normalizeStop,insertionIndex,endpointOfDay,startOfDay,dayLink,nightIndex,nightCost,costsFromIndex,countedCosts,setNightCost,setNightName,syncNightNames,setTransfer});
})();
