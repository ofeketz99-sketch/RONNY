// Pure CoreFormat logic: no DOM, network, trip state, or map dependencies.
const CoreFormat=(()=>{
function money(n){return '₪'+(Number(n)||0).toLocaleString('he-IL',{maximumFractionDigits:0})}
function minsFmt(m){if(!Number.isFinite(m))return '—';const total=Math.round(m),h=Math.floor(total/60);return h?`${h} ש׳ ${total-h*60} ד׳`:`${total} ד׳`}
return Object.freeze({money, minsFmt});
})();
