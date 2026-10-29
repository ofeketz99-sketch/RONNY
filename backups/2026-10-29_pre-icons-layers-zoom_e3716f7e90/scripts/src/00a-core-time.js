// Pure CoreTime logic: no DOM, network, trip state, or map dependencies.
const CoreTime=(()=>{
function clockMinutes(value){const m=/^(\d{2}):(\d{2})$/.exec(String(value||''));return m?((+m[1])*60+(+m[2])):540}
function clockAt(total){const m=((Math.round(total)%1440)+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function ronnyValidate24(s){const m=String(s||'').trim().match(/^([01]\d|2[0-3]):([0-5]\d)$/);return m?m[1]+':'+m[2]:null}
function ronnyNormalize24(s){
 const t=String(s||'').trim();if(ronnyValidate24(t))return t;
 const compact=t.match(/^(\d{1,2}):(\d{1,2})$/)||t.match(/^(\d{1,2})(\d{2})$/);
 if(compact){const h=Number(compact[1]),m=Number(compact[2]);if(h>=0&&h<24&&m>=0&&m<60)return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')}
 if(/^\d{1,2}$/.test(t)&&Number(t)<24)return t.padStart(2,'0')+':00';
 return null;
}
return Object.freeze({clockMinutes, clockAt, ronnyValidate24, ronnyNormalize24});
})();
