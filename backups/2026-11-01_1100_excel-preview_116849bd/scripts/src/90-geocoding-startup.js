function smartGeoLoadSuggestions(){
 try{return new Map(JSON.parse(localStorage.getItem(SMART_GEO_SUGGESTIONS_KEY)||'[]'))}catch(e){return new Map()}
}
const smartGeoSuggestions=smartGeoLoadSuggestions();
function smartGeoPersistSuggestions(){
 try{const data=[...smartGeoSuggestions].slice(-300).map(([id,rank])=>[id,{reliable:rank.reliable,hint:rank.hint,candidates:rank.candidates.slice(0,5)}]);localStorage.setItem(SMART_GEO_SUGGESTIONS_KEY,JSON.stringify(data))}catch(e){}
}
function smartGeoVisited(){try{return new Set(JSON.parse(localStorage.getItem(GEO_REPAIR_ATTEMPTS_KEY)||'[]'))}catch(e){return new Set()}}
function smartGeoSaveVisited(set){try{localStorage.setItem(GEO_REPAIR_ATTEMPTS_KEY,JSON.stringify([...set].slice(-12000)))}catch(e){}}
function smartGeoNormalize(value){return String(value||'').normalize('NFKD').replace(/[\u0300-\u036f\u0591-\u05bd\u05bf-\u05c7]/g,'').toLocaleLowerCase().replace(/[\u200e\u200f\u202a-\u202e]/g,'').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
/* RONNY 37 — locality-aware geocoding. All location hints are derived from
   this trip or the saved pins; Photon remains the only remote lookup service. */
function smartGeoContainsPhrase(value,phrase){
 const s=' '+smartGeoNormalize(value)+' ',p=' '+smartGeoNormalize(phrase)+' ';
 return p.trim().length>1&&s.includes(p);
}
function smartGeoCountryFromText(label){
 const matches=Object.entries(GEO_COUNTRIES).filter(([word])=>smartGeoContainsPhrase(label,word));
 return matches.length?matches.sort((a,b)=>smartGeoNormalize(b[0]).length-smartGeoNormalize(a[0]).length)[0][1]:null;
}
function smartGeoCountryHint(place){
 return smartGeoCountryFromText(place.name)||smartGeoCountryFromText(savedPlaceBucket(place)?.name||'');
}
function smartGeoRegionHint(place){
 const txt=[place.name,savedPlaceBucket(place)?.name||''].join(' ');
 for(const [key,terms] of Object.entries({scotland:['scotland','סקוטלנד'],england:['england','אנגליה'],wales:['wales','וויילס'],sicily:['sicily','סיציליה'],sardinia:['sardinia','סרדיניה']}))
  if(terms.some(t=>smartGeoContainsPhrase(txt,t)))return key;
 return null;
}
function smartGeoSimilarity(a,b){
 const s=smartGeoNormalize(a),t=smartGeoNormalize(b);
 if(!s||!t)return 0;
 if(s===t)return 1;
 const aa=new Set(s.split(' ').filter(x=>x.length>1)),bb=new Set(t.split(' ').filter(x=>x.length>1));
 const union=new Set([...aa,...bb]).size,inter=[...aa].filter(x=>bb.has(x)).length;
 const jaccard=union?inter/union:0;
 // Slightly reward an exact full phrase contained in a longer OSM name.
 const contained=(s.length>=5&&(' '+t+' ').includes(' '+s+' '))||(t.length>=5&&(' '+s+' ').includes(' '+t+' '));
 return Math.min(.96,Math.max(jaccard,contained?.78:0));
}
function smartGeoCountryMatches(properties,iso){
 if(!iso)return false;
 const cc=String(properties.countrycode||properties.country_code||'').toUpperCase();
 if(cc)return cc===iso;
 const country=smartGeoNormalize(properties.country),expected=smartGeoNormalize(GEO_COUNTRY_EN[iso]||'');
 return !!country&&!!expected&&(country===expected||(iso==='GB'&&['england','scotland','wales','united kingdom','great britain'].includes(country)));
}
function smartGeoDistanceKm(a,b){
 const rad=Math.PI/180,lat1=+a.lat*rad,lat2=+b.lat*rad,dLat=lat2-lat1,dLon=(+b.lng- +a.lng)*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
 return 12742*Math.asin(Math.min(1,Math.sqrt(h)));
}
function smartGeoLocatedTripPoints(){
 const points=[...(state.outline?.points||[]),...(state.days||[]).flatMap(d=>d.stops||[])];
 return points.filter(p=>validSavedLatLng(p)).map(p=>({lat:+p.lat,lng:+p.lng}));
}
function smartGeoMedoid(points){
 if(!points.length)return null;
 // A real pin is safer than the arithmetic average (which may land in the sea).
 const sampled=points.slice(0,70);
 return sampled.reduce((best,p)=>{
  const cost=sampled.reduce((sum,x)=>sum+Math.min(750,smartGeoDistanceKm(p,x)),0);
  return !best||cost<best.cost?{cost,lat:+p.lat,lng:+p.lng}:best;
 },null);
}
function smartGeoContext(place){
 const all=(savedPlaces.places||[]).filter(p=>p.id!==place.id&&validSavedLatLng(p));
 const sameList=all.filter(p=>p.listId===place.listId);
 const trip=smartGeoLocatedTripPoints();
 const explicitCountry=smartGeoCountryHint(place);
 const tripTitleCountry=trip.length>=2?smartGeoCountryFromText(state.title||''):null;
 const country=explicitCountry||tripTitleCountry||null;
 let source='none',anchors=[];
 if(sameList.length){anchors=sameList;source='list';}
 else {
  const similarList=all.filter(p=>{
   const bucket=savedPlaceBucket(p)?.name||'';
   return explicitCountry&&smartGeoCountryFromText(bucket)===explicitCountry;
  });
  if(similarList.length>=2){anchors=similarList;source='matching-lists';}
  else if(trip.length>=2){anchors=trip;source='trip';}
  else if(similarList.length){anchors=similarList;source='matching-lists';}
  else if(all.length>=3){
   // A globally coherent set of saved pins can guide searches, but never auto-approve.
   const points=all.slice(0,100),mid=smartGeoMedoid(points);
   const near=mid?points.filter(p=>smartGeoDistanceKm(p,mid)<=300):[];
   if(near.length>=3&&near.length>=Math.ceil(points.length*.8)){anchors=near;source='library';}
  }
  // Do not use unrelated saved lists when the library spans multiple regions.
 }
 const limited=anchors.slice(0,100).map(p=>({lat:+p.lat,lng:+p.lng}));
 const center=smartGeoMedoid(limited);
 const nearbyCenterCount=center?limited.filter(p=>smartGeoDistanceKm(p,center)<=240).length:0;
 const cohesive=limited.length>=2&&nearbyCenterCount>=Math.max(2,Math.ceil(limited.length*.6));
 return {anchors:limited,source,center,cohesive,country,explicitCountry,region:smartGeoRegionHint(place)};
}
function smartGeoScore(place,feature,ctx){
 const p=feature?.properties||{},sim=smartGeoSimilarity(place.name,p.name||p.street||'');
 const countryMatches=ctx.country?smartGeoCountryMatches(p,ctx.country):false;
 const countryMismatch=!!ctx.country&&!!(p.countrycode||p.country)&&!countryMatches;
 const region=ctx.region,area=smartGeoNormalize([p.state,p.city,p.country].filter(Boolean).join(' '));
 const regionMatches=!!region&&area.includes(region);
 const regionMismatch=!!region&&!regionMatches&&(['scotland','england','wales'].includes(region)&&['scotland','england','wales'].some(x=>area.includes(x)));
 const location={lat:+feature.geometry.coordinates[1],lng:+feature.geometry.coordinates[0]};
 const d=ctx.anchors.length?Math.min(...ctx.anchors.map(pt=>smartGeoDistanceKm(location,pt))):null;
 const neighborCount=d===null?0:ctx.anchors.filter(pt=>smartGeoDistanceKm(location,pt)<=85).length;
 const weight=ctx.source==='list'?1:ctx.source==='matching-lists'?.8:ctx.source==='trip'?.6:.45;
 let locality=0;
 if(d!==null){
  if(d<=5)locality=43;
  else if(d<=25)locality=37;
  else if(d<=85)locality=30;
  else if(d<=220)locality=20;
  else if(d<=450)locality=8;
  else if(d>1400)locality=-45;
  else if(d>750)locality=-25;
  if(neighborCount>=2)locality+=8;
  locality*=weight;
 }
 const score=sim*105+locality+(countryMatches?30:0)-(countryMismatch?(ctx.explicitCountry?115:60):0)+(regionMatches?20:0)-(regionMismatch?75:0);
 const distanceKm=d===null?null:Math.round(d);
 const localityDescription=d===null?'':(ctx.source==='list'?'מאותה רשימה':ctx.source==='matching-lists'?'מרשימות באותה מדינה':ctx.source==='library'?'מסיכות הספרייה':'מנקודות הטיול');
 const reasons=[distanceKm!==null?`כ־${distanceKm.toLocaleString('he-IL')} ק״מ מסיכה ${localityDescription}`:'',countryMatches?'מדינה תואמת':'',regionMatches?'אזור תואם':'',countryMismatch?'אזהרה: מדינה אחרת':'',regionMismatch?'אזהרה: אזור אחר':''].filter(Boolean);
 return {score,sim,countryMatches,countryMismatch,regionMatches,regionMismatch,distanceKm,neighborCount,localitySource:ctx.source,reason:reasons.join(' · ')};
}
function smartGeoRank(place,features,ctx=smartGeoContext(place)){
 const seen=new Set();
 const candidates=(features||[]).filter(f=>f?.geometry?.type==='Point'&&Array.isArray(f.geometry.coordinates)&&f.geometry.coordinates.length===2).map(f=>{
  const lon=Number(f.geometry.coordinates[0]),lat=Number(f.geometry.coordinates[1]);
  if(!Number.isFinite(lat)||Math.abs(lat)>90||!Number.isFinite(lon)||Math.abs(lon)>180)return null;
  const p=f.properties||{},key=[p.osm_type||'',p.osm_id||'',lat.toFixed(5),lon.toFixed(5)].join(':');
  if(seen.has(key))return null;seen.add(key);
  return {lat,lng:lon,name:String(p.name||p.street||place.name),context:[p.street,p.city,p.state,p.country].filter(Boolean).join(' · '),...smartGeoScore(place,f,ctx)};
 }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,7);
 const first=candidates[0],second=candidates[1];
 const separated=!second||(first.score-second.score>=36);
 const localEvidence=ctx.cohesive&&(ctx.source==='list'||ctx.source==='matching-lists')&&first?.neighborCount>=2&&first?.distanceKm<=65;
 const namedCountry=!!ctx.explicitCountry&&first?.countryMatches&&!first?.countryMismatch&&
  (first?.regionMatches||(ctx.anchors.length>=1&&first?.distanceKm<=75));
 // Auto-save only with exact names, clear margin and independently consistent geography.
 // A lone nearest pin or a country inferred only from the current map cannot authorize it.
 const reliable=!!first&&first.sim===1&&!first.regionMismatch&&!first.countryMismatch&&separated&&
  (localEvidence||namedCountry)&&(namedCountry||localEvidence&&first.distanceKm<=65)&&
  (!ctx.region||first.regionMatches)&&(!ctx.country||first.countryMatches);
 const hint=ctx.source==='list'?'דירוג לפי סיכות מאותה רשימה':ctx.source==='matching-lists'?'דירוג לפי רשימות באותה מדינה':ctx.source==='trip'?'דירוג לפי נקודות הטיול':ctx.source==='library'?'דירוג לפי ריכוז הסיכות בספרייה':ctx.country?'דירוג לפי מדינה בשם המקום או הרשימה':'לא נמצא הקשר גאוגרפי; יש לאשר ידנית';
 return {candidates,reliable,hint,context:ctx};
}
function smartGeoWithoutTrailingGeography(value){
 let out=String(value||'').trim();
 const words=[...Object.keys(GEO_COUNTRIES),'scotland','england','wales','sicily','sardinia'].sort((a,b)=>b.length-a.length);
 for(const word of words){
  const escaped=word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const next=out.replace(new RegExp('(?:[\\s,\\-–]+)'+escaped+'\\s*$','iu'),'').trim();
  if(next.length>=3&&next!==out){out=next;break;}
 }
 return out;
}
async function smartGeoSearchCandidates(place,options={}){
 const q=String(options.query??place.name).trim(),signal=options.signal;
 const context=smartGeoContext({...place,name:q});
 if(q.length<2)return {candidates:[],reliable:false,hint:'יש להזין שם מקום'};
 const fetchFeatures=async(biased,query)=>{
  const params=new URLSearchParams({q:query,limit:'12',lang:'en'});
  if(biased&&context.center){params.set('lat',context.center.lat.toFixed(5));params.set('lon',context.center.lng.toFixed(5));params.set('zoom','8');}
  const response=await fetch('https://photon.komoot.io/api/?'+params,{signal,headers:{Accept:'application/json'}});
  if(response.status===429||response.status===503){const err=Error('השירות הציבורי מגביל עומס');err.rateLimited=true;throw err;}
  if(!response.ok)throw Error('שירות החיפוש אינו זמין');
  return (await response.json()).features||[];
 };
 let found=await fetchFeatures(!!context.center,q);
 let rank=smartGeoRank({...place,name:q},found,context);
 const best=rank.candidates[0];
 // One controlled fallback if locality bias failed or Photon found only unrelated names.
 if(context.center&&(!best||best.sim<.7||best.countryMismatch||(best.distanceKm!==null&&best.distanceKm>500))){
  try{
   const bare=smartGeoWithoutTrailingGeography(q);
   const more=await fetchFeatures(false,bare);
   const existing=new Set(found.map(f=>JSON.stringify(f.geometry?.coordinates)));
   for(const f of more){const key=JSON.stringify(f.geometry?.coordinates);if(!existing.has(key)){found.push(f);existing.add(key)}}
   rank=smartGeoRank({...place,name:bare},found,context);
  }catch(err){if(err.name==='AbortError'||err.rateLimited)throw err;/* Retain initial results when fallback is unavailable. */}
 }
 return rank;
}
function smartGeoMarkup(){
 const pending=savedPlaces.places.filter(p=>!validSavedLatLng(p));
 const visited=smartGeoVisited();
 return `<div class="saved-place-intro"><strong>תיקון מיקומים ללא תשלום</strong><p>חיפוש דרך Photon ללא מפתח API. התוצאות מדורגות לפי התאמה לשם, סיכות מאותה רשימה, נקודות הטיול ורמזי מדינה ואזור. רק התאמה חד־משמעית הנתמכת בראיות גאוגרפיות תאושר אוטומטית; אחרת תידרש בחירה ידנית.</p><div class="saved-place-counts"><span>${pending.length} ללא מיקום</span><span>${pending.filter(p=>!visited.has(p.id)).length} טרם נבדקו</span></div></div>
 <div class="ronny-geo-options"><label><input type="checkbox" id="ronny-geo-auto" checked> אשר אוטומטית רק התאמות חד־משמעיות</label><p>בלחיצה אחת נסרקות ברצף עד 120 נקודות שטרם נבדקו, בקצב מתון כדי לכבד את שירות Photon הציבורי. אפשר לעצור בכל שלב. רק התאמות ודאיות יישמרו אוטומטית.</p></div>
 <div class="ronny-geo-actions"><button class="btn btn-primary" type="button" id="ronny-geo-next">${icon('search','small-icon')} הפעל מנגנון איתור</button><button class="btn" type="button" id="ronny-geo-stop" disabled>${icon('pause','small-icon')} עצור</button><button class="btn btn-soft" type="button" id="ronny-geo-review">${icon('check-check','small-icon')} אשר התאמות בטוחות</button></div>
 <div class="ronny-geo-progress"><div class="ronny-geo-progress-bar" id="ronny-geo-bar"></div></div><p role="status" aria-live="polite" id="ronny-geo-status">מוכן להתחיל. השירות פועל דרך האינטרנט ואינו מבטיח למצוא כל סיכה.</p>
 <div id="ronny-geo-results" class="ronny-geo-results"></div>
 <button class="btn btn-ghost" type="button" id="ronny-geo-reset">אפשר לבדוק שוב מקומות ללא מיקום</button><p class="footnote">השרת הציבורי Photon מיועד לשימוש סביר בלבד ועלול להגביל עומס. התאמות חסרות או שמות דומים מחייבים אישור ידני. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></p>`;
}
function smartGeoStatus(msg){smartGeoRunStatus=msg;const e=$('ronny-geo-status');if(e)e.textContent=msg;}
function smartGeoProgress(done,total){smartGeoRunProgress={done,total};const e=$('ronny-geo-bar');if(e)e.style.width=(total?Math.min(100,Math.round(done/total*100)):0)+'%';}
function smartGeoAddRow(place,rank){
 const root=$('ronny-geo-results');if(!root)return;
 const row=document.createElement('section');row.className='ronny-geo-row';row.dataset.geoPlace=place.id;
 const badge=rank.reliable?'<span class="ronny-geo-cert safe">התאמה בטוחה יחסית</span>':'<span class="ronny-geo-cert">דורש אישור</span>';
 const candidates=rank.candidates.map((c,i)=>savedPlaceCandidateHTML(c,i,'geo')).join('');
 row.innerHTML=`<div class="ronny-geo-head"><strong>${esc(place.name)}</strong>${badge}</div><small class="ronny-geo-list">${esc(savedPlaceBucket(place)?.name||'')} · ${esc(rank.hint||'')}</small><div class="ronny-geo-candidates">${candidates||'<p class="footnote">לא נמצאה התאמה. ניתן למקם ידנית.</p>'}</div><div class="ronny-geo-row-foot"><button class="btn btn-soft" type="button" data-geo-manual="${esc(place.id)}">${icon('map-pin','small-icon')} הצב במפה</button>${place.url?`<a class="ronny-geo-maplink" href="${esc(place.url)}" target="_blank" rel="noopener noreferrer">בדוק בגוגל מפות</a>`:''}</div>`;
 root.append(row);
 row.querySelectorAll('[data-geo-preview]').forEach(b=>b.onclick=()=>previewSavedPlaceCandidate(place.id,rank.candidates[Number(b.dataset.geoPreview)]));
 row.querySelectorAll('[data-geo-choose]').forEach(b=>b.onclick=()=>smartGeoApprove(place.id,Number(b.dataset.geoChoose)));
 row.querySelector('[data-geo-manual]').onclick=()=>{smartGeoAbort?.abort();manuallyPinSavedPlace(place.id)};
 refreshIcons();
}
async function smartGeoApprove(id,index=0,isAutomatic=false){
 const place=savedPlaces.places.find(p=>p.id===id);const data=smartGeoSuggestions.get(id),pick=data?.candidates[index];
 if(!place||!pick||validSavedLatLng(place))return false;
 place.lat=pick.lat;place.lng=pick.lng;place.positionSource=isAutomatic?'photon-auto':'photon-confirmed';
 await persistSavedPlaces();renderSavedPlaceMarkers();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();
 const row=Array.from(document.querySelectorAll('[data-geo-place]')).find(r=>r.dataset.geoPlace===id);
 if(row){row.innerHTML=`<span class="saved-batch-completed">${icon('check-circle','small-icon')} אושר ונשמר · ${esc(place.name)}</span>`;refreshIcons()}
 smartGeoSuggestions.delete(id);smartGeoPersistSuggestions();return true;
}
async function smartGeoApproveReliable(){
 let n=0;for(const [id,rank] of Array.from(smartGeoSuggestions.entries()))if(rank.reliable)if(await smartGeoApprove(id))n++;
 smartGeoStatus(n?`נשמרו ${n} התאמות בעלות רמת ודאות גבוהה.`:'אין התאמות בטוחות נוספות לאישור. ניתן לבחור מקום מתוך התוצאות.');
}
async function smartGeoScan(){
 if(smartGeoBusy)return;
 const visited=smartGeoVisited(),pending=savedPlaces.places.filter(p=>!validSavedLatLng(p)&&!visited.has(p.id)).slice(0,120);
 if(!pending.length){smartGeoStatus('אין עוד מקומות שלא נבדקו. אפשר לאשר תוצאות קיימות או לאפס את היסטוריית הבדיקה.');return}
 const ctl=new AbortController();smartGeoAbort=ctl;smartGeoBusy=true;smartGeoAutoApprove=$('ronny-geo-auto')?.checked!==false;
 $('ronny-geo-next').disabled=true;$('ronny-geo-stop').disabled=false;
 smartGeoProgress(0,pending.length);
 let checked=0,confirmed=0,errors=0,consecutiveErrors=0,rateLimited=false;
 try{
  for(const place of pending){
   if(ctl.signal.aborted)break;
   smartGeoStatus(`מחפש ${checked+1} מתוך ${pending.length}: ${place.name}`);
   try{
    const rank=await smartGeoSearchCandidates(place,{signal:ctl.signal});
    smartGeoSuggestions.set(place.id,rank);smartGeoPersistSuggestions();
    visited.add(place.id);smartGeoSaveVisited(visited);consecutiveErrors=0;
    smartGeoAddRow(place,rank);
    if(rank.reliable&&smartGeoAutoApprove){if(await smartGeoApprove(place.id,0,true))confirmed++}
   }catch(err){if(ctl.signal.aborted)break;if(err.rateLimited){rateLimited=true;smartGeoStatus('השירות הציבורי מגביל עומס. הסריקה נעצרה בלי לסמן את הנקודות שלא נבדקו.');break}errors++;consecutiveErrors++;if(consecutiveErrors>=3){smartGeoStatus('האיתור הופסק לאחר שלוש שגיאות רצופות. נסה שוב כשהחיבור יתייצב.');break}smartGeoAddRow(place,{candidates:[],reliable:false,hint:'שגיאת רשת — לא סומן כבדוק'});}
   checked++;smartGeoProgress(checked,pending.length);
   // One modest sequential request at a time, with time to read and cancel.
   if(checked<pending.length&&!ctl.signal.aborted)await new Promise(resolve=>setTimeout(resolve,2000));
  }
  if(!ctl.signal.aborted&&checked&&!rateLimited&&consecutiveErrors<3){
   const left=savedPlaces.places.filter(p=>!validSavedLatLng(p)&&!visited.has(p.id)).length;
   const review=savedPlaces.places.filter(p=>!validSavedLatLng(p)&&visited.has(p.id)).length;
   smartGeoStatus(`נבדקו ${checked} מקומות · ${confirmed} אושרו אוטומטית · ${errors} נכשלו · ${left} ממתינים לסריקה · ${review} עדיין ללא מיקום. תוצאות לא ודאיות מופיעות כאן לבדיקה. ${left?'ניתן להמשיך בעוד לחיצה להרצה נוספת.':'הסריקה הושלמה.'}`);
  }
 }finally{
  smartGeoBusy=false;smartGeoAbort=null;
  if($('ronny-geo-next'))$('ronny-geo-next').disabled=false;
  if($('ronny-geo-stop'))$('ronny-geo-stop').disabled=true;
 }
}
function openSmartPlaceRepair(autoStart=false){
 if(savedPlaceBusy)return;
 // Extract any precise coordinates before spending requests.
 let direct=0;for(const p of savedPlaces.places){if(validSavedLatLng(p))continue;const exact=googleMapCoordinates(p.url);if(exact){p.lat=exact.lat;p.lng=exact.lng;p.positionSource=exact.positionSource;direct++}}
 if(direct){persistSavedPlaces();renderSavedPlaceMarkers()}
 // Previously found candidates remain reviewable after reopening the drawer.
 openDrawer('תיקון סיכות Google','ללא מפתח API','איתור מיקומים מדורג ובטוח',smartGeoMarkup(),`<button class="btn" type="button" id="ronny-geo-back">חזרה לספריית המקומות</button>`);
 $('ronny-geo-next').onclick=smartGeoScan;
 if(smartGeoBusy){$('ronny-geo-next').disabled=true;$('ronny-geo-stop').disabled=false;$('ronny-geo-auto').checked=smartGeoAutoApprove;}
 if(smartGeoRunStatus)smartGeoStatus(smartGeoRunStatus);
 smartGeoProgress(smartGeoRunProgress.done,smartGeoRunProgress.total);
 for(const [id,rank] of smartGeoSuggestions){const p=savedPlaces.places.find(x=>x.id===id);if(p&&!validSavedLatLng(p))smartGeoAddRow(p,rank)}
 $('ronny-geo-stop').onclick=()=>{smartGeoAbort?.abort();smartGeoStatus('הסריקה נעצרה. התוצאות שכבר נמצאו נשמרו במסך זה.')};
 $('ronny-geo-review').onclick=smartGeoApproveReliable;
 $('ronny-geo-reset').onclick=()=>{if(smartGeoBusy)return;smartGeoSaveVisited(new Set());smartGeoStatus('היסטוריית החיפוש אופסה. כעת אפשר לבדוק שוב מקומות שטרם מוקמו.');};
 $('ronny-geo-back').onclick=()=>ronnyGoBack();
 if(direct)smartGeoStatus(`שוחזרו ${direct} מיקומים מדויקים מקישורים. אפשר להתחיל באיתור הנותרים.`);
 refreshIcons();
 if(autoStart)smartGeoScan();
}

function showSavedPlaceLibrary(){
 const lists=savedPlaces.lists,places=savedPlaces.places;
 const known=places.filter(validSavedLatLng).length;
 const body=`<div class="saved-place-intro"><strong>ספריית המקומות שלי</strong><p>כל רשימה ניתנת לפתיחה בנפרד. אייקון העין מציג או מסתיר את הסיכות שלה במפה; רשימות סגורות אינן מציגות מאות שורות.</p><div class="saved-place-counts"><span>${lists.length} רשימות</span><span>${places.length} מקומות</span><span>${known} ממוקמים</span><span>${places.length-known} ממתינים לאישור</span></div></div><div class="saved-place-import"><button class="btn btn-primary" id="saved-places-import">${icon('upload')} ייבוא Google Takeout</button><input id="saved-places-file" type="file" accept=".zip,.csv,.json" multiple hidden><button type="button" class="btn btn-soft" id="saved-places-repair">${icon('map-pin-check','small-icon')} שחזר מיקומים מקישורי Google</button><button type="button" class="btn btn-soft" id="saved-places-lookup">${icon('search','small-icon')} הפעל מנגנון איתור</button><small>לחיצה אחת מפעילה איתור רציף ושמירה אוטומטית של התאמות בטוחות בלבד. תוצאות לא ודאיות יישארו לבדיקה.</small></div><div class="ronny-library-toolbar" role="toolbar" aria-label="פעולות ספריית המקומות"><button type="button" data-saved-bulk="select">הצג את כל הרשימות</button><button type="button" data-saved-bulk="deselect">הסתר את כל הרשימות</button><button type="button" data-saved-bulk="expand">פתח הכול</button><button type="button" data-saved-bulk="collapse">סגור הכול</button><span class="ronny-library-selection-status" id="saved-place-selected-count" role="status">נבחרו 0 נקודות</span><button type="button" data-saved-select-action="filtered">בחר את המסוננות</button><button type="button" data-saved-select-action="photon">בחר תוצאות Photon</button><button type="button" data-saved-select-action="clear">בטל בחירת נקודות</button><button type="button" class="ronny-bulk-danger" data-saved-selected-action="clear" disabled>הסר מיקום מהנבחרות</button><button type="button" class="ronny-bulk-danger" data-saved-selected-action="delete" disabled>מחק נקודות נבחרות</button></div><div class="ronny-saved-search"><input id="saved-place-filter" placeholder="חיפוש בכל הרשימות…" value="${esc(savedPlaceFilter)}" aria-label="חיפוש מקומות"/><select id="saved-place-status" aria-label="סנן לפי אישור מיקום"><option value="all" ${savedPlaceStatusFilter==='all'?'selected':''}>כל המקומות</option><option value="located" ${savedPlaceStatusFilter==='located'?'selected':''}>מיקומים מזוהים</option><option value="missing" ${savedPlaceStatusFilter==='missing'?'selected':''}>ממתינים לאישור</option><option value="photon" ${savedPlaceStatusFilter==='photon'?'selected':''}>תוצאות איתור Photon</option></select></div><div id="saved-place-collections">${savedPlaceCollectionsHTML()}</div>`;
 openDrawer('ספריית המקומות','GOOGLE SAVED PLACES','רשימות אישיות ושכבות במפה',body,`<button class="btn" id="saved-places-close">סיום</button>`);
 $('saved-places-close').onclick=closeDrawer;
 $('saved-places-repair').onclick=repairSavedPlaceCoordinates;$('saved-places-lookup').onclick=()=>openSmartPlaceRepair(true);$('saved-places-import').onclick=()=>$('saved-places-file').click();$('saved-places-file').onchange=e=>importSavedPlacesFiles(e.target.files);
 $('drawer-body').querySelectorAll('[data-saved-bulk]').forEach(el=>el.onclick=()=>savedPlaceBulkAction(el.dataset.savedBulk));
 $('drawer-body').querySelectorAll('[data-saved-select-action]').forEach(el=>el.onclick=()=>savedPlaceSelectMatching(el.dataset.savedSelectAction));
 $('drawer-body').querySelectorAll('[data-saved-selected-action]').forEach(el=>el.onclick=()=>savedPlaceBulkEdit(el.dataset.savedSelectedAction));
 $('saved-place-filter').oninput=e=>{savedPlaceFilter=e.target.value;refreshSavedCollections(true)};
 $('saved-place-status').onchange=e=>{savedPlaceStatusFilter=e.target.value;refreshSavedCollections()};
 bindSavedPlaceCollectionActions($('saved-place-collections'));
 refreshIcons();
}

(async()=>{
 try{await initTripLibrary()}catch(e){state=prepareTrip(demo());activeTripId=uid();libraryReady=true;save();toast('טעינת הספרייה נכשלה. ניתן לייצא קובץ גיבוי.')}
 await initSavedPlaces();$('ronny-rail-back').onclick=ronnyGoBack;planningResolution=state.settings.planningResolution==='outline'?'outline':'day';const startupWorkspace=ronnyReadWorkspace();ronnyApplyWorkspaceSelection(startupWorkspace);repairExistingSchedules();initMap();map?.on('moveend zoomend',ronnyRememberWorkspace);enableMapPopupDragging();initDaysManager();initOutsideDismissal();
 window.addEventListener('resize',()=>{for(const id of ['leg-editor','point-quick','map-context','layer-filter-panel'])keepMapPopoverVisible($(id))});
 bind();setupResizers();initializePlannerVerticalResize();activatePhotoInput();renderAll();initMapGroupToggles();initMapQuickPickers();
 // Restore an existing view without animation. For a new workspace, keep the
 // original deferred fit so map controls and gestures are not competing with an
 // animated flyTo at the instant the initial UI appears.
 if(startupWorkspace){ronnyRestoreWorkspaceViewport(startupWorkspace)}
 else{
  ronnyWorkspaceReady=true;
  const startupTrip=activeTripId,startupSeq=++wholeTripFocusSeq;
  const stopForUserMove=()=>{if(activeTripId===startupTrip&&wholeTripFocusSeq===startupSeq)wholeTripFocusSeq++};
  map?.once('movestart',stopForUserMove);
  setTimeout(()=>{
   map?.off('movestart',stopForUserMove);
   if(activeTripId===startupTrip&&wholeTripFocusSeq===startupSeq)focusLoadedTrip();
  },360);
 }
 const wasCollapsed=(()=>{try{return localStorage.getItem('ronny-planner-collapsed-v1')==='true'}catch(e){return false}})();
 if(wasCollapsed)setPlannerCollapsed(true);
})().catch(e=>{$('map').textContent='אירעה שגיאה בהפעלת האתר. '+e.message});