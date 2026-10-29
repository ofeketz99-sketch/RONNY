// Pure CoreFormat logic: no DOM, network, trip state, or map dependencies.
const CoreFormat=(()=>{
function money(n){return '₪'+(Number(n)||0).toLocaleString('he-IL',{maximumFractionDigits:0})}
function minsFmt(m){if(!Number.isFinite(m))return '—';const h=Math.floor(m/60);return h?`${h} ש׳ ${Math.round(m%60)} ד׳`:`${Math.round(m)} ד׳`}
return Object.freeze({money, minsFmt});
})();
