// Pure CoreLegTiming logic: no DOM, network, trip state, or map dependencies.
const CoreLegTiming=(()=>{
function routeModeName(mode){return {auto:'מצא נתיב',draw:'שרטט נתיב',pencil:'עיפרון חופשי',straight:'קו אווירי'}[mode]||'מצא נתיב'}
function routeLegMinutes(leg){return leg.minutes!==null&&leg.minutes!==undefined&&leg.minutes!==''&&Number.isFinite(+leg.minutes)?Math.max(0,+leg.minutes):null}
function legTimingMode(leg){return leg?.mode==='auto'&&leg?.minutesMode==='extra'?'extra':'total'}
function resolveLegDuration(leg,baseSeconds){
 const seconds=Math.max(0,Number(baseSeconds)||0),override=routeLegMinutes(leg);
 return override===null?seconds:legTimingMode(leg)==='extra'?seconds+override*60:override*60;
}
function legTimingSnapshot(leg,baseSeconds){
 const base=Math.max(0,Number(baseSeconds)||0),duration=resolveLegDuration(leg,base);
 return {duration,baseDuration:base,adjustmentMinutes:(duration-base)/60,manualOverride:routeLegMinutes(leg)!==null,minutesMode:legTimingMode(leg)};
}
return Object.freeze({routeModeName, routeLegMinutes, legTimingMode, resolveLegDuration, legTimingSnapshot});
})();
