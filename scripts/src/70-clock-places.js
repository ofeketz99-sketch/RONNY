function ronnyValidate24(s){return CoreTime.ronnyValidate24(s)}
function ronnyNormalize24(s){return CoreTime.ronnyNormalize24(s)}
function ronnyCloseTimeDialog(){const p=document.getElementById('ronny-time-dialog');if(p){if(p.open)p.close();p.remove()}}
function ronnyOpenTimeDialog(input){
 if(!input)return;ronnyCloseTimeDialog();
 const current=ronnyNormalize24(input.value)||ronnyValidate24(input.dataset.lastValid)||'09:00';const [hr,mi]=current.split(':');
 const pad=i=>String(i).padStart(2,'0');
 const hourOptions=Array.from({length:24},(_,i)=>`<option value="${pad(i)}" ${pad(i)===hr?'selected':''}>${pad(i)}</option>`).join('');
 const minOptions=Array.from({length:60},(_,i)=>`<option value="${pad(i)}" ${pad(i)===mi?'selected':''}>${pad(i)}</option>`).join('');
 const picker=document.createElement('dialog');picker.id='ronny-time-dialog';picker.className='ronny-time-dialog';
 picker.innerHTML=`<div class="ronny-time-heading"><span>בחירת שעה</span><span style="color:#758b79;font-size:12px;font-weight:700">24 שעות</span></div><div class="ronny-time-format">שעות ודקות · ללא AM/PM</div><div class="ronny-time-selects"><select id="ronny-hour" aria-label="שעה">${hourOptions}</select><span class="colon">:</span><select id="ronny-minute" aria-label="דקות">${minOptions}</select></div><div class="ronny-time-dialog-actions"><button class="ronny-time-apply" type="button">אישור</button><button class="ronny-time-cancel" type="button">ביטול</button></div>`;
 document.body.appendChild(picker);picker.addEventListener('close',()=>picker.remove(),{once:true});
 picker.querySelector('.ronny-time-apply').addEventListener('click',()=>{
   if(input.isConnected){const value=picker.querySelector('#ronny-hour').value+':'+picker.querySelector('#ronny-minute').value;input.value=value;input.dataset.lastValid=value;input.setAttribute('aria-invalid','false');input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))}
   ronnyCloseTimeDialog();
 });
 picker.querySelector('.ronny-time-cancel').addEventListener('click',ronnyCloseTimeDialog);
 picker.addEventListener('click',e=>{if(e.target===picker)ronnyCloseTimeDialog()});
 if(typeof picker.showModal==='function')picker.showModal();else picker.setAttribute('open','');
 picker.querySelector('#ronny-hour').focus();
}
// Delegation works also when the point editor and time segments are reconstructed.
document.addEventListener('click',e=>{const btn=e.target.closest('.ronny-time-trigger');if(!btn)return;e.preventDefault();e.stopPropagation();ronnyOpenTimeDialog(btn.closest('.ronny-time-control')?.querySelector('.ronny-time-input'))});
document.addEventListener('focusin',e=>{if(e.target.matches('.ronny-time-input'))e.target.dataset.lastValid=ronnyValidate24(e.target.value)||'09:00'});
document.addEventListener('input',e=>{if(!e.target.matches('.ronny-time-input'))return;if(ronnyValidate24(e.target.value)){e.target.dataset.lastValid=e.target.value;e.target.setAttribute('aria-invalid','false')}else e.stopImmediatePropagation()},true);
document.addEventListener('change',e=>{if(!e.target.matches('.ronny-time-input'))return;const normal=ronnyNormalize24(e.target.value);e.target.value=normal||e.target.dataset.lastValid||'09:00';e.target.dataset.lastValid=e.target.value;e.target.setAttribute('aria-invalid',normal?'false':'true')},true);
document.addEventListener('focusout',e=>{if(!e.target.matches('.ronny-time-input'))return;const normal=ronnyNormalize24(e.target.value);if(normal&&normal!==e.target.value){e.target.value=normal;e.target.dispatchEvent(new Event('change',{bubbles:true}))}else if(!normal){e.target.value=e.target.dataset.lastValid||'09:00';e.target.setAttribute('aria-invalid','false')}},true);
document.addEventListener('keydown',e=>{if(document.getElementById('ronny-time-dialog')?.open&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();ronnyCloseTimeDialog()}},true);

// RONNY 33 — independent, privacy-preserving personal place library.
const PLACE_DB_NAME='ronny-personal-places-v1',PLACE_DB_STORE='snapshots',PLACE_BACKUP_KEY='ronny-places-local-backup-v1';
const PLACE_COLORS=['#678c75','#6f88b0','#b38357','#9378a4','#b46f79','#658e96','#a68f4f','#7c8e5e','#826b58','#5e8894'];
let savedPinPlacementId=null,savedPlaceDb=null,savedPlaces={lists:[],places:[]},savedPlaceLayer=null,savedPlacePreviewLayer=null,savedPreviewMode=false,selectedSavedList='all',savedPlaceFilter='',savedPlaceBusy=false,savedPlaceSaveQueue=Promise.resolve();
const validSavedLatLng=p=>p&&p.lat!==null&&p.lat!==undefined&&p.lat!==''&&p.lng!==null&&p.lng!==undefined&&p.lng!==''&&Number.isFinite(+p.lat)&&Number.isFinite(+p.lng)&&Math.abs(+p.lat)<=90&&Math.abs(+p.lng)<=180;
function normalizeSavedPlaceData(obj){
 const lists=Array.isArray(obj?.lists)?obj.lists.filter(x=>x&&typeof x.id==='string'&&typeof x.name==='string').slice(0,250).map(x=>({id:x.id,name:x.name.slice(0,130),visible:x.visible!==false})):[];
 const ids=new Set(lists.map(l=>l.id));
 const places=Array.isArray(obj?.places)?obj.places.filter(x=>x&&ids.has(x.listId)&&typeof x.name==='string').slice(0,12000).map(x=>({id:String(x.id),listId:x.listId,name:x.name.slice(0,250),note:String(x.note||'').slice(0,2500),url:/^https:\/\//i.test(String(x.url||''))?String(x.url).slice(0,2500):'',lat:validSavedLatLng(x)?+x.lat:null,lng:validSavedLatLng(x)?+x.lng:null,positionSource:String(x.positionSource||'').slice(0,30)})):[];
 return {lists,places};
}
async function initSavedPlaces(){
 try{
  const db=await new Promise((resolve,reject)=>{
   if(!window.indexedDB)return reject(Error('IndexedDB לא זמין'));
   const q=indexedDB.open(PLACE_DB_NAME,1);
   q.onupgradeneeded=()=>{if(!q.result.objectStoreNames.contains(PLACE_DB_STORE))q.result.createObjectStore(PLACE_DB_STORE,{keyPath:'id'})};
   q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error||Error('שגיאת אחסון'));
  });
  savedPlaceDb=db;
  const record=await new Promise((resolve,reject)=>{
   const request=db.transaction(PLACE_DB_STORE,'readonly').objectStore(PLACE_DB_STORE).get('places');
   request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  if(record?.data)savedPlaces=normalizeSavedPlaceData(record.data);
  else {try{savedPlaces=normalizeSavedPlaceData(JSON.parse(localStorage.getItem(PLACE_BACKUP_KEY)||'{}'))}catch(e){}}
 }catch(e){try{savedPlaces=normalizeSavedPlaceData(JSON.parse(localStorage.getItem(PLACE_BACKUP_KEY)||'{}'))}catch(_){} }
}
function persistSavedPlaces(){
 const snapshot=JSON.parse(JSON.stringify(savedPlaces));
 savedPlaceSaveQueue=savedPlaceSaveQueue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
  if(!savedPlaceDb){try{localStorage.setItem(PLACE_BACKUP_KEY,JSON.stringify(snapshot));resolve()}catch(e){reject(e)};return}
  const tx=savedPlaceDb.transaction(PLACE_DB_STORE,'readwrite');tx.objectStore(PLACE_DB_STORE).put({id:'places',data:snapshot});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
 })).catch(()=>toast('שמירת ספריית המקומות נכשלה — נא לגבות את נתוני הדפדפן'));
 return savedPlaceSaveQueue;
}
