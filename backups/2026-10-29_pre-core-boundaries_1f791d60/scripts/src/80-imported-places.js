function csvRows(text){
 const src=String(text||'').replace(/^\uFEFF/,'');
 const firstLine=src.split(/\r?\n/).find(x=>x.trim())||'';
 const delim=['\t',',',';'].map(c=>({c,n:(firstLine.match(new RegExp(c==='\t'?'\\t':c===';'?';':',','g'))||[]).length})).sort((a,b)=>b.n-a.n)[0].c;
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<src.length;i++){
  const c=src[i];
  if(c==='"'){
   if(quoted&&src[i+1]==='"'){cell+='"';i++}else quoted=!quoted;
  }else if(c===delim&&!quoted){row.push(cell);cell=''}
  else if((c==='\r'||c==='\n')&&!quoted){row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';if(c==='\r'&&src[i+1]==='\n')i++}
  else cell+=c;
 }
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
function parseCoordinatePair(raw){
 if(typeof raw!=='string')return null;
 const m=raw.trim().match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)(?:\s|$)/);
 if(!m)return null;
 const lat=+m[1],lng=+m[2];return Math.abs(lat)<=90&&Math.abs(lng)<=180?{lat,lng}:null;
}
function googleMapCoordinates(url){
 const value=String(url||'');if(!/^https?:\/\//i.test(value))return null;
 let decoded=value;try{decoded=decodeURIComponent(value)}catch(e){}
 // Google's `!3d...!4d...` denotes a place's geographical coordinates.
 const exact=decoded.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
 const exactReverse=decoded.match(/!2d(-?\d+(?:\.\d+)?)!3d(-?\d+(?:\.\d+)?)/i);
 if(!exact&&exactReverse){const xy=parseCoordinatePair(exactReverse[2]+','+exactReverse[1]);if(xy)return {...xy,positionSource:'google-data'}}
 const atExplicit=decoded.match(/(?:[?&](?:q|query|destination|daddr)=|geo:)(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/i);
 if(!exact&&atExplicit){const xy=parseCoordinatePair(atExplicit[1]+','+atExplicit[2]);if(xy)return {...xy,positionSource:'google-query'}}
 if(exact){const coords=parseCoordinatePair(exact[1]+','+exact[2]);if(coords)return {...coords,positionSource:'google-place'}}
 try{
  const u=new URL(value);
  for(const key of ['query','q','destination','daddr','ll']){
   const pair=parseCoordinatePair(u.searchParams.get(key)||'');
   if(pair)return {...pair,positionSource:'google-query'};
  }
 }catch(e){}
 // @lat,lng frequently identifies Google's viewport rather than the pin; deliberately skip it.
 return null;
}
function csvCollectionName(path){
 const name=String(path||'').split('/').pop().replace(/\.csv$/i,'').trim();
 return name.replace(/^\d{4}-\d{2}-\d{2}[-_ ]*/, '').replace(/[_]+/g,' ').trim().slice(0,130)||'רשימה מיובאת';
}
function normalizeCSVKey(key){return String(key||'').toLowerCase().replace(/\uFEFF/g,'').replace(/[\s_\-]+/g,'').replace(/[^a-z0-9\u0590-\u05ff]/g,'')}
function parseGoogleCSV(text,path){
 const allRows=csvRows(text);if(allRows.length<2)return [];
 // Official Google Saved exports may begin with collection_description and a blank line.
 const headerRow=allRows.findIndex(r=>r.map(normalizeCSVKey).some(h=>['title','name','placename'].includes(h))&&r.map(normalizeCSVKey).some(h=>['itemcontenturl','url','mapsurl','link'].includes(h)));
 if(headerRow<0)return [];const rows=allRows.slice(headerRow);
 const headings=rows[0].map(normalizeCSVKey);
 const index=(...aliases)=>headings.findIndex(x=>aliases.includes(x));
 const title=index('title','name','placename','שם','כותרת');
 const url=index('url','link','mapsurl','googlemapsurl','itemcontenturl','קישור');
 const note=index('note','notes','comment','description','collectiondescription','הערה','תיאור');
 const listIndex=index('collectiontitle','collectionname','listname','list','collection','רשימה');
 const latitude=index('latitude','lat','קו רוחב');const longitude=index('longitude','lng','lon','קו אורך');
 if(title<0||(url<0&&latitude<0))return [];
 const output=[];
 for(let i=1;i<rows.length&&i<14000;i++){
  const row=rows[i],name=String(row[title]||'').trim().slice(0,250),link=String(row[url]||'').trim();
  if(!name||/^(title|name)$/i.test(name))continue;
  const listName=(listIndex>=0?String(row[listIndex]||'').trim():'')||csvCollectionName(path);
  let geo=googleMapCoordinates(link);
  const lat=latitude>=0?Number(row[latitude]):NaN,lng=longitude>=0?Number(row[longitude]):NaN;
  if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=90&&Math.abs(lng)<=180&&String(row[latitude]||'').trim()&&String(row[longitude]||'').trim())geo={lat,lng,positionSource:'csv'};
  output.push({name,note:note>=0?String(row[note]||'').trim().slice(0,2500):'',url:link,listName:listName.slice(0,130),lat:geo?.lat??null,lng:geo?.lng??null,positionSource:geo?.positionSource||''});
 }
 return output;
}
async function unzipTakeoutCSV(file){
 // Central directory supports ZIP exports that use local data descriptors.
 const data=new DataView(await file.arrayBuffer()),bytes=new Uint8Array(data.buffer),len=bytes.length;
 if(len>100*1024*1024)throw Error('הקובץ גדול מדי; חלץ את הארכיון וייבא את קובצי CSV');
 let eocd=-1;
 for(let i=len-22;i>=Math.max(0,len-65558);i--)if(data.getUint32(i,true)===0x06054b50){eocd=i;break}
 if(eocd<0)throw Error('ארכיון ZIP אינו תקין');
 const count=data.getUint16(eocd+10,true),offset=data.getUint32(eocd+16,true);if(count>1000)throw Error('יותר מדי קבצים בארכיון');
 let cursor=offset;const found=[];const decoder=new TextDecoder('utf-8');
 for(let i=0;i<count;i++){
  if(data.getUint32(cursor,true)!==0x02014b50)throw Error('טבלת ZIP אינה תקינה');
  const method=data.getUint16(cursor+10,true),packed=data.getUint32(cursor+20,true),raw=data.getUint32(cursor+24,true);
  const fn=data.getUint16(cursor+28,true),ex=data.getUint16(cursor+30,true),comment=data.getUint16(cursor+32,true),localOffset=data.getUint32(cursor+42,true);
  const name=decoder.decode(bytes.subarray(cursor+46,cursor+46+fn));cursor+=46+fn+ex+comment;
  if(!/\.csv$/i.test(name)||!/(^|\/)(saved|lists|collections)\/|\.csv$/i.test(name))continue;
  if(packed>10*1024*1024||raw>25*1024*1024)continue;
  if(data.getUint32(localOffset,true)!==0x04034b50)continue;
  const start=localOffset+30+data.getUint16(localOffset+26,true)+data.getUint16(localOffset+28,true);
  if(start+packed>len)continue;
  const compressed=bytes.slice(start,start+packed);
  let output;
  if(method===0)output=compressed;
  else if(method===8&&typeof DecompressionStream==='function'){
   try{const stream=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate-raw'));output=new Uint8Array(await new Response(stream).arrayBuffer())}
   catch(e){throw Error('דחיסת ZIP אינה נתמכת בדפדפן הזה. חלץ את הארכיון וייבא את קובצי CSV')}
  }else throw Error('סוג דחיסת ZIP אינו נתמך. חלץ את הארכיון וייבא את קובצי CSV');
  found.push({name,text:decoder.decode(output)});
 }
 return found;
}
async function importSavedPlacesFiles(files){
 if(savedPlaceBusy)return;
 const list=Array.from(files||[]);if(!list.length)return;
 savedPlaceBusy=true;
 const button=$('saved-places-import');if(button)button.disabled=true;
 try{
  const batches=[];
  for(const file of list.slice(0,120)){
   if(/\.csv$/i.test(file.name)){if(file.size>25*1024*1024)throw Error('קובץ CSV גדול מדי');batches.push({name:file.name,text:await file.text()})}
   else if(/\.zip$/i.test(file.name))batches.push(...await unzipTakeoutCSV(file));
   else if(/\.json$/i.test(file.name)){
    // Google Maps' starred places often arrive as GeoJSON.
    const json=JSON.parse(await file.text());
    const features=Array.isArray(json.features)?json.features:[];
    const added=features.filter(f=>f.geometry?.type==='Point'&&Array.isArray(f.geometry.coordinates)).map(f=>({name:String(f.properties?.name||f.properties?.Title||'מקום שמור'),note:String(f.properties?.description||''),url:'',listName:csvCollectionName(file.name),lat:+f.geometry.coordinates[1],lng:+f.geometry.coordinates[0],positionSource:'geojson'}));
    batches.push({name:file.name,features:added});
   }
  }
  const imported=batches.flatMap(b=>b.features||parseGoogleCSV(b.text,b.name));
  if(!imported.length)throw Error('לא זוהו רשימות שמורות. יש לבחור ייצוא Saved מתוך Google Takeout');
  const existing=new Map(savedPlaces.places.map(p=>[p.listId+'|'+(p.url||p.name.toLowerCase()),p]));
  let added=0,resolved=0,duplicates=0,upgraded=0;
  for(const item of imported){
   if(savedPlaces.places.length>=12000)break;
   const name=item.listName||'רשימה מיובאת';
   let bucket=savedPlaces.lists.find(l=>l.name===name);
   if(!bucket){bucket={id:uid(),name,visible:true};savedPlaces.lists.push(bucket)}
   const key=bucket.id+'|'+(item.url||item.name.toLowerCase());if(existing.has(key)){
    const old=existing.get(key);
    if(!validSavedLatLng(old)&&validSavedLatLng(item)){old.lat=item.lat;old.lng=item.lng;old.positionSource=item.positionSource||'reimport';upgraded++;}
    else duplicates++;
    continue;
   }
   existing.set(key,item);
   savedPlaces.places.push({id:uid(),listId:bucket.id,name:item.name,note:item.note||'',url:/^https:\/\//i.test(item.url||'')?item.url:'',lat:validSavedLatLng(item)?item.lat:null,lng:validSavedLatLng(item)?item.lng:null,positionSource:item.positionSource||''});
   added++;if(validSavedLatLng(item))resolved++;
  }
  await persistSavedPlaces();renderSavedPlaceMarkers();showSavedPlaceLibrary();
  toast(`יובאו ${added} מקומות · ${resolved} עם מיקום · ${upgraded} מיקומים שוחזרו · ${duplicates} כפולים דולגו`);
 }catch(e){toast('ייבוא נכשל: '+e.message)}
 finally{savedPlaceBusy=false;const input=$('saved-places-file');if(input)input.value='';if(button)button.disabled=false}
}
async function repairSavedPlaceCoordinates(){
 if(savedPlaceBusy)return;
 savedPlaceBusy=true;const btn=$('saved-places-repair');if(btn)btn.disabled=true;
 try{
  let repaired=0;
  for(const p of savedPlaces.places){if(validSavedLatLng(p))continue;
   const found=googleMapCoordinates(p.url);
   if(found){p.lat=found.lat;p.lng=found.lng;p.positionSource=found.positionSource;repaired++;}
  }
  if(repaired){await persistSavedPlaces();renderSavedPlaceMarkers();}
  showSavedPlaceLibrary();toast(repaired?`שוחזרו ${repaired} מיקומים מדויקים מקישורי Google`:'לא נמצאו קואורדינטות בקישורים. ניתן לחפש ולאשר כל מקום ידנית.');
 }finally{savedPlaceBusy=false}
}
function savedPlaceBucket(place){return savedPlaces.lists.find(l=>l.id===place.listId)}
function manuallyPinSavedPlace(id){
 if(!map||!window.L){toast('המפה עדיין לא זמינה. ודא שיש חיבור אינטרנט');return}
 const p=savedPlaces.places.find(x=>x.id===id);if(!p)return;
 savedPinPlacementId=id;closeDrawer();toast('לחץ על המיקום המדויק במפה עבור '+p.name+' · Esc לביטול');
}
// Search proposals are intentionally never saved without the user's confirmation.
let savedPlaceBatchAbort=null;
async function previewMissingSavedPlaces(){
 if(savedPlaceBusy)return;
 const pending=savedPlaces.places.filter(p=>!validSavedLatLng(p)).slice(0,10);
 if(!pending.length){toast('כל המקומות כבר ממוקמים');return}
 savedPlaceBusy=true;
 savedPlaceBatchAbort=new AbortController();
 const cards=pending.map((p,i)=>`<section class="saved-place-batch-row" data-batch-id="${esc(p.id)}"><div class="saved-batch-title"><strong>${i+1}. ${esc(p.name)}</strong><button type="button" class="saved-batch-manual" data-batch-manual="${esc(p.id)}">${icon('map-pin','small-icon')} מקם במפה</button></div><div class="saved-batch-results">ממתין לחיפוש...</div></section>`).join('');
 openDrawer('איתור מיקומים בקבוצות','מיקומים חסרים','אישור מדויק של תוצאות חיפוש',`<p class="footnote">נאתר עד 10 מקומות בכל פעם לפי שמות והקשר גאוגרפי של הסיכות הקיימות. כל תוצאה חייבת אישור מפורש לפני שמירה.</p><div id="saved-place-batch-list">${cards}</div><p class="footnote">החיפוש מתבצע באמצעות שירות Photon (נתוני OpenStreetMap), ותוצאותיו עשויות להיות חלקיות.</p>`,`<button class="btn" id="batch-back">חזרה לספרייה</button>`);
 $('batch-back').onclick=()=>{savedPlaceBatchAbort?.abort();showSavedPlaceLibrary()};
 $('drawer-body').querySelectorAll('[data-batch-manual]').forEach(b=>b.onclick=()=>{savedPlaceBatchAbort?.abort();manuallyPinSavedPlace(b.dataset.batchManual)});
 refreshIcons();
 const signal=savedPlaceBatchAbort.signal;
 try{
  for(const p of pending){
   if(signal.aborted)break;
   const row=Array.from(document.querySelectorAll('[data-batch-id]')).find(x=>x.dataset.batchId===p.id);
   if(!row)break;
   const node=row.querySelector('.saved-batch-results');node.textContent='מחפש…';
   try{
    const rank=await smartGeoSearchCandidates(p,{signal});
    const candidates=rank.candidates.slice(0,5);
    if(!candidates.length)node.textContent='לא נמצאו תוצאות. ניתן לבחור מיקום ידנית במפה.';
    else{
     node.innerHTML=`<p class="footnote">${esc(rank.hint)} · בחירת תוצאה אינה מבוצעת ללא אישור.</p>`+candidates.map((c,i)=>savedPlaceCandidateHTML(c,i,'batch')).join('');
     node.querySelectorAll('[data-batch-preview]').forEach(btn=>btn.onclick=()=>previewSavedPlaceCandidate(p.id,candidates[Number(btn.dataset.batchPreview)]));
     node.querySelectorAll('[data-batch-choice]').forEach(btn=>btn.onclick=async()=>{
      const c=candidates[Number(btn.dataset.batchChoice)];if(!c||!Number.isFinite(c.lat)||!Number.isFinite(c.lng))return;
      p.lat=c.lat;p.lng=c.lng;p.positionSource='user-confirmed';
      await persistSavedPlaces();renderSavedPlaceMarkers();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();
      node.innerHTML='<span class="saved-batch-completed">המיקום אושר ונשמר</span>';
      toast('המיקום של '+p.name+' נשמר');
     });
    }
   }catch(err){if(signal.aborted)break;node.textContent='החיפוש נכשל. ניתן לבחור מיקום ידנית במפה.';}
   // Respect the public geocoding service; avoid a flood of concurrent requests.
   await new Promise(resolve=>setTimeout(resolve,1150));
  }
 }finally{savedPlaceBusy=false;savedPlaceBatchAbort=null}
}
function setSavedPreviewMode(on){
 savedPreviewMode=!!on;
 $('drawer-backdrop')?.classList.toggle('ronny-preview-backdrop',savedPreviewMode);
 $('drawer')?.classList.toggle('ronny-preview-mode',savedPreviewMode);
}
function previewSavedPlaceCandidate(id,candidate){
 const place=savedPlaces.places.find(p=>p.id===id);
 if(!place||!map||!savedPlacePreviewLayer||!Number.isFinite(candidate?.lat)||!Number.isFinite(candidate?.lng))return;
 savedPlacePreviewLayer.clearLayers();setSavedPreviewMode(true);
 const pos=[candidate.lat,candidate.lng];
 L.circleMarker(pos,{radius:15,color:'#286d75',weight:3,fillColor:'#c6eff0',fillOpacity:.6,className:'ronny-saved-preview-ring'}).addTo(savedPlacePreviewLayer);
 L.circleMarker(pos,{radius:4,color:'#fff',weight:2,fillColor:'#286d75',fillOpacity:1}).addTo(savedPlacePreviewLayer);
 L.marker(pos,{interactive:false,icon:L.divIcon({className:'ronny-preview-tag',html:`<div class="ronny-preview-label">תצוגה מקדימה בלבד · לא נשמר<br><strong>${esc(candidate.name||place.name)}</strong></div>`,iconSize:[1,1],iconAnchor:[0,35]})}).addTo(savedPlacePreviewLayer);
 map.flyTo(pos,Math.max(11,Math.min(14,map.getZoom())),{duration:.55});
 toast('מוצגת תוצאה לבדיקה על המפה. המיקום עדיין לא נשמר.');
}
function savedPlaceCandidateHTML(item,index,prefix){
 return `<div class="ronny-saved-candidate"><strong>${esc(item.name||'מיקום')}</strong><small>${esc(item.area||item.context||'אין פרטי אזור')}</small>${item.reason?`<small class="ronny-geo-reason">${esc(item.reason)}</small>`:''}<div class="ronny-candidate-actions"><button type="button" data-${prefix}-preview="${index}">${icon('eye','small-icon')} הצג במפה</button><button type="button" data-${prefix}-choose="${index}">${icon('check','small-icon')} אשר ושמור</button></div></div>`;
}
async function clearSavedPlaceLocation(id){
 const place=savedPlaces.places.find(p=>p.id===id);if(!place)return;
 if(!await confirmOnMap(`להסיר את המיקום של ״${place.name}״? המקום יישאר ברשימה ויהיה ניתן לאתר אותו מחדש.`,{title:'הסרת מיקום',accept:'הסר מיקום'}))return;
 place.lat=null;place.lng=null;place.positionSource='';map?.closePopup();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();
 const visited=smartGeoVisited();visited.delete(id);smartGeoSaveVisited(visited);smartGeoSuggestions.delete(id);smartGeoPersistSuggestions();
 await persistSavedPlaces();renderSavedPlaceMarkers();if($('saved-place-collections'))showSavedPlaceLibrary();toast('המיקום הוסר. המקום נשאר בספרייה.');
}
async function deleteSavedPlace(id){
 const place=savedPlaces.places.find(p=>p.id===id);if(!place)return;
 if(!await confirmOnMap(`למחוק את ״${place.name}״ מספריית המקומות?`,{title:'מחיקת מקום שמור',accept:'מחק מהספרייה'}))return;
 savedPlaces.places=savedPlaces.places.filter(p=>p.id!==id);savedPlaceSelected.delete(id);const visited=smartGeoVisited();visited.delete(id);smartGeoSaveVisited(visited);smartGeoSuggestions.delete(id);smartGeoPersistSuggestions();map?.closePopup();setSavedPreviewMode(false);savedPlacePreviewLayer?.clearLayers();
 await persistSavedPlaces();renderSavedPlaceMarkers();if($('drawer')?.classList.contains('open'))showSavedPlaceLibrary();toast('המקום הוסר מספריית המקומות.');
}
function renderSavedPlaceMarkers(){
 if(!savedPlaceLayer||!map)return;
 savedPlaceLayer.clearLayers();
 for(const place of savedPlaces.places){
  const index=savedPlaces.lists.findIndex(l=>l.id===place.listId);if(index<0||!savedPlaces.lists[index].visible||!validSavedLatLng(place))continue;
  const color=PLACE_COLORS[index%PLACE_COLORS.length];
  const node=L.marker([place.lat,place.lng],{icon:L.divIcon({className:'ronny-saved-marker-wrapper',html:`<span class="ronny-saved-marker" style="--saved-color:${color}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h12v18l-6-4-6 4z"/></svg></span>`,iconSize:[27,34],iconAnchor:[13,32]}),title:place.name,alt:place.name});
  node.addTo(savedPlaceLayer);
  node.on('click',e=>{if(e.originalEvent)L.DomEvent.stopPropagation(e.originalEvent);openSavedPlacePopup(place.id,node)});
 }
}
function openSavedPlacePopup(id,marker){
 const place=savedPlaces.places.find(p=>p.id===id);if(!place||!map)return;
 const list=savedPlaceBucket(place);
 const body=document.createElement('div');body.className='ronny-saved-popup';
 body.innerHTML=`<strong>${esc(place.name)}</strong><small>${esc(list?.name||'מקומות שמורים')}</small>${place.note?`<p>${esc(place.note)}</p>`:''}<div class="ronny-saved-popup-actions"><button type="button" data-action="add-day">הוסף ליום</button><button type="button" data-action="add-outline">הוסף למתאר</button>${place.url?`<a href="${esc(place.url)}" target="_blank" rel="noopener noreferrer">גוגל מפות</a>`:''}<button type="button" data-action="correct-location">תקן מיקום</button><button type="button" data-action="clear-location" class="danger">הסר מיקום</button><button type="button" data-action="delete-place" class="danger">מחק מהספרייה</button></div>`;
 body.querySelector('[data-action="add-day"]').onclick=()=>{map.closePopup();useSavedPlace(id,'day')};
 body.querySelector('[data-action="add-outline"]').onclick=()=>{map.closePopup();useSavedPlace(id,'outline')};
 body.querySelector('[data-action="correct-location"]').onclick=()=>{map.closePopup();searchPlaceCandidates(id)};
 body.querySelector('[data-action="clear-location"]').onclick=()=>clearSavedPlaceLocation(id);
 body.querySelector('[data-action="delete-place"]').onclick=()=>deleteSavedPlace(id);
 marker.bindPopup(body,{minWidth:220,maxWidth:270,autoPan:true}).openPopup();
}
function useSavedPlace(id,target){
 const place=savedPlaces.places.find(p=>p.id===id);if(!validSavedLatLng(place)){toast('יש לקבוע מיקום לפני הוספה לטיול');return}
 if(target==='outline'){
  const outline=currentOutline();if(outline.points.length>=90){toast('המתאר מלא');return}
  const point={id:uid(),name:place.name,type:'attraction',lat:+place.lat,lng:+place.lng};outline.points.push(point);
  planningResolution='outline';selectedOutlineId=point.id;save();renderAll();toast('המקום נוסף למתאר הטיול');
 }else{
  const day=state.days[selectedDay];if(!day)return;
  day.stops.push({id:uid(),name:place.name,type:'poi',description:place.note||'',notes:'',time:'09:00',duration:0,cost:0,lat:+place.lat,lng:+place.lng,sourceSavedPlaceId:id});
  planningResolution='day';save();renderAll();toast('המקום נוסף כנקודת עניין ליום '+(selectedDay+1));
 }
}
function fitSavedPlaceList(listId){
 if(!map)return;const points=savedPlaces.places.filter(p=>p.listId===listId&&validSavedLatLng(p));
 if(!points.length){toast('אין ברשימה הזו מיקומים מזוהים להצגה');return}
 if(points.length===1)map.flyTo([points[0].lat,points[0].lng],11,{duration:.5});
 else map.fitBounds(L.latLngBounds(points.map(p=>[p.lat,p.lng])),{padding:[75,75],maxZoom:12,animate:true,duration:.55});
}
function searchPlaceCandidates(id){
 const place=savedPlaces.places.find(p=>p.id===id);if(!place)return;
 openDrawer('איתור מיקום','SAVED PLACE',place.name,
 `<p class="footnote">המערכת תעדיף תוצאות התואמות לסיכות האחרות ולרמזים בשם הרשימה, אך תשמור רק לאחר אישורך.</p><div class="field"><label for="saved-place-query">חיפוש</label><input id="saved-place-query" value="${esc(place.name)}"></div><button class="btn btn-soft" id="saved-place-search">${icon('search','small-icon')} חפש</button><div id="saved-place-results" class="saved-place-results"></div>${place.url?`<p><a class="drawer-link" href="${esc(place.url)}" target="_blank" rel="noopener noreferrer">פתח בגוגל מפות</a></p>`:''}`,
 `<button class="btn" id="saved-place-manual">${icon('map-pin','small-icon')} בחירה ידנית במפה</button><button class="btn" id="saved-place-back">חזרה לרשימות</button>`);
 $('saved-place-manual').onclick=()=>manuallyPinSavedPlace(id);$('saved-place-back').onclick=showSavedPlaceLibrary;
 const lookup=async()=>{
  const q=$('saved-place-query').value.trim();if(q.length<3)return;
  const results=$('saved-place-results');results.textContent='מחפש…';
  try{
   const rank=await smartGeoSearchCandidates(place,{query:q});
   const candidates=rank.candidates;
   results.innerHTML=`<p class="footnote">${esc(rank.hint)} · הצג במפה לפני אישור.</p>`+(candidates.map((item,i)=>savedPlaceCandidateHTML(item,i,'candidate')).join('')||'<p class="footnote">לא נמצאו תוצאות. נסה שם אחר או היעזר בקישור לגוגל מפות.</p>');
   results.querySelectorAll('[data-candidate-preview]').forEach(b=>b.onclick=()=>previewSavedPlaceCandidate(id,candidates[+b.dataset.candidatePreview]));
    results.querySelectorAll('[data-candidate-choose]').forEach(b=>b.onclick=async()=>{
    const item=candidates[+b.dataset.candidateChoose];if(!item)return;
    place.lat=item.lat;place.lng=item.lng;place.positionSource='user-confirmed';await persistSavedPlaces();renderSavedPlaceMarkers();showSavedPlaceLibrary();map?.flyTo([item.lat,item.lng],12,{duration:.55});toast('המיקום אושר ונשמר');
   });
  }catch(e){results.textContent='שירות החיפוש אינו זמין כרגע';}
 };
 $('saved-place-search').onclick=lookup;$('saved-place-query').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookup()}});
}
const savedPlaceSelected=new Set();
const savedExpandedLists=new Set();
const savedExpandedGroups=new Set();
const savedGroupLimits=new Map();
let savedPlaceStatusFilter='all';
const savedGroupKey=(id,type)=>String(id)+'|'+type;
function savedPlaceMatches(p){
 return (!savedPlaceFilter||[p.name,p.note||'',savedPlaceBucket(p)?.name||''].join(' ').toLocaleLowerCase().includes(savedPlaceFilter.toLocaleLowerCase()))&&
 (savedPlaceStatusFilter==='all'||(savedPlaceStatusFilter==='located'?validSavedLatLng(p):savedPlaceStatusFilter==='missing'?!validSavedLatLng(p):savedPlaceStatusFilter==='photon'?validSavedLatLng(p)&&String(p.positionSource||'').startsWith('photon'):true));
}
function savedPlaceRowHTML(p){
 const located=validSavedLatLng(p);
 return `<article class="saved-place-row ronny-entity is-clickable ${savedPlaceSelected.has(p.id)?'ronny-saved-selected':''}" data-saved-row="${esc(p.id)}" role="button" tabindex="0" aria-label="${esc(p.name)} — ${located?'התמקד במפה':'אתר מיקום'}"><label class="ronny-saved-select" title="בחר נקודה לפעולה קבוצתית"><input type="checkbox" data-saved-select="${esc(p.id)}" ${savedPlaceSelected.has(p.id)?'checked':''} aria-label="בחר את ${esc(p.name)}"></label><div><strong>${esc(p.name)}</strong>${p.note?`<p>${esc(p.note)}</p>`:''}<span class="saved-place-status ${located?'ok':''}">${located?'מיקום מזוהה':'מיקום דורש אישור'}${p.positionSource==='photon-auto'?' · אותר אוטומטית':''}</span></div><div class="saved-place-row-actions"><button type="button" data-saved-edit="${esc(p.id)}" title="שנה שם" aria-label="שנה שם מקום">${icon('pencil','small-icon')}</button>${located?`<button type="button" data-saved-clear="${esc(p.id)}" title="הסר מיקום שגוי (שמור את המקום)" aria-label="הסר מיקום של ${esc(p.name)}">${icon('map-pin-off','small-icon')}</button><button type="button" data-saved-add="${esc(p.id)}" title="הוסף לטיול">${icon('plus','small-icon')}</button>`:''}<button type="button" class="ronny-row-danger" data-saved-delete="${esc(p.id)}" title="מחק נקודה מהספרייה" aria-label="מחק את ${esc(p.name)}">${icon('trash-2','small-icon')}</button>${p.url?`<a href="${esc(p.url)}" title="פתח בגוגל מפות" target="_blank" rel="noopener noreferrer" aria-label="פתח בגוגל מפות">${icon('external-link','small-icon')}</a>`:''}</div><div class="ronny-rename-row" data-saved-editor="${esc(p.id)}" hidden><input data-saved-name="${esc(p.id)}" value="${esc(p.name)}" maxlength="250" aria-label="שם מקום חדש"><button type="button" data-saved-save="${esc(p.id)}" title="שמור שם">${icon('check','small-icon')}</button><button type="button" data-saved-cancel="${esc(p.id)}" title="ביטול">${icon('x','small-icon')}</button></div></article>`;
}
function savedPlaceGroupHTML(list,kind,places,searching){
 const key=savedGroupKey(list.id,kind),subset=places.filter(p=>kind==='located'?validSavedLatLng(p):!validSavedLatLng(p));
 if(!subset.length)return '';
 const open=searching||savedExpandedGroups.has(key);
 const cap=savedGroupLimits.get(key)||30;
 const shown=open?subset.slice(0,cap):[];
 return `<section class="ronny-place-group ${open?'expanded':''}"><button type="button" class="ronny-place-group-toggle" data-saved-group="${esc(key)}" aria-expanded="${open}"><span>${kind==='located'?'מיקומים מזוהים':'ממתינים לאישור מיקום'} <b>${subset.length}</b></span>${icon(open?'chevron-up':'chevron-down','small-icon')}</button>${open?`<div class="ronny-place-group-items">${shown.map(savedPlaceRowHTML).join('')}${subset.length>shown.length?`<button type="button" class="ronny-place-more" data-saved-more="${esc(key)}">הצג עוד ${Math.min(30,subset.length-shown.length)} מקומות (${shown.length}/${subset.length})</button>`:''}</div>`:''}</section>`;
}
function savedPlaceCollectionsHTML(){
 const lists=savedPlaces.lists,places=savedPlaces.places,searching=!!savedPlaceFilter.trim();
 const counts=new Map(),searchResults=new Map();
 for(const list of lists){counts.set(list.id,{total:0,known:0,missing:0});searchResults.set(list.id,[])}
 for(const place of places){const cnt=counts.get(place.listId);if(!cnt)continue;cnt.total++;validSavedLatLng(place)?cnt.known++:cnt.missing++;if(savedPlaceMatches(place))searchResults.get(place.listId).push(place)}
 const shownLists=lists.filter(list=>!searching||searchResults.get(list.id).length);
 return `<div class="saved-place-lists">${shownLists.map((list,i)=>{
  const globalIndex=lists.indexOf(list),color=PLACE_COLORS[globalIndex%PLACE_COLORS.length],count=counts.get(list.id),found=searchResults.get(list.id),expanded=searching||savedExpandedLists.has(list.id);
  return `<section class="ronny-place-collection ${expanded?'expanded':''}" data-saved-collection="${esc(list.id)}" style="--place-color:${color}"><div class="saved-place-list-row"><label class="ronny-list-select" title="בחר את כל המקומות המסוננים ברשימה"><input type="checkbox" data-saved-select-list="${esc(list.id)}" ${found.length&&found.every(p=>savedPlaceSelected.has(p.id))?'checked':''} aria-label="בחר נקודות מרשימת ${esc(list.name)}"></label><button type="button" class="saved-list-visibility" data-saved-visible="${esc(list.id)}" aria-pressed="${!!list.visible}" title="${list.visible?'הסתר':'הצג'} את ${esc(list.name)} במפה" aria-label="${list.visible?'הסתר':'הצג'} את ${esc(list.name)} במפה">${icon(list.visible?'eye':'eye-off','small-icon')}</button><button type="button" class="ronny-list-toggle" data-saved-list-toggle="${esc(list.id)}" aria-expanded="${expanded}"><span class="ronny-list-text"><b>${esc(list.name)}</b><small>${count.known} ממוקמים · ${count.missing} ממתינים לאישור</small></span>${icon(expanded?'chevron-up':'chevron-down','small-icon')}</button><button type="button" class="ronny-list-edit" data-saved-list-edit="${esc(list.id)}" title="שנה שם רשימה" aria-label="שנה שם רשימה">${icon('pencil','small-icon')}</button></div><div class="ronny-rename-row" data-saved-list-editor="${esc(list.id)}" hidden><input data-saved-list-name="${esc(list.id)}" value="${esc(list.name)}" maxlength="130" aria-label="שם רשימה חדש"><button type="button" data-saved-list-save="${esc(list.id)}" title="שמור שם רשימה" aria-label="שמור שם רשימה">${icon('check','small-icon')}</button><button type="button" data-saved-list-cancel="${esc(list.id)}" title="ביטול" aria-label="ביטול">${icon('x','small-icon')}</button></div>${expanded?`<div class="ronny-place-collection-body">${savedPlaceGroupHTML(list,'located',found,searching)}${savedPlaceGroupHTML(list,'missing',found,searching)}${!found.length?'<p class="footnote">אין התאמות לסינון.</p>':''}</div>`:''}</section>`}).join('')||'<div class="library-empty">לא נמצאו רשימות מתאימות.</div>'}</div>`;
}
function refreshSavedCollections(preserveFocus=false){
 const pane=$('saved-place-collections');if(!pane)return;const oldScroll=$('drawer-body').scrollTop;
 pane.innerHTML=savedPlaceCollectionsHTML();
 bindSavedPlaceCollectionActions(pane);
 $('drawer-body').scrollTop=oldScroll;
 if(!preserveFocus)refreshIcons();
}
function savedPlaceSelectionUI(){
 const status=$('saved-place-selected-count'),count=savedPlaceSelected.size;
 if(status)status.textContent=`נבחרו ${count} נקודות${count?' · הסרת מיקום משאירה את המקומות ברשימה':''}`;
 document.querySelectorAll('[data-saved-selected-action]').forEach(b=>b.disabled=!count);
 document.querySelectorAll('[data-saved-select-list]').forEach(ch=>{
  const matching=savedPlaces.places.filter(p=>p.listId===ch.dataset.savedSelectList&&savedPlaceMatches(p));
  const n=matching.filter(p=>savedPlaceSelected.has(p.id)).length;
  ch.checked=matching.length>0&&n===matching.length;
  ch.indeterminate=n>0&&n<matching.length;
 });
}
function savedPlaceSelectMatching(mode){
 if(mode==='clear'){savedPlaceSelected.clear()}
 else {
  const visible=savedPlaces.places.filter(savedPlaceMatches);
  if(mode==='filtered')visible.forEach(p=>savedPlaceSelected.add(p.id));
  if(mode==='photon')visible.filter(p=>String(p.positionSource||'').startsWith('photon')).forEach(p=>savedPlaceSelected.add(p.id));
 }
 refreshSavedCollections();savedPlaceSelectionUI();
}
async function savedPlaceBulkEdit(kind){
 const ids=new Set([...savedPlaceSelected].filter(id=>savedPlaces.places.some(p=>p.id===id)));
 const affected=savedPlaces.places.filter(p=>ids.has(p.id)&&(kind==='delete'||validSavedLatLng(p)));
 if(!affected.length){toast(kind==='clear'?'אין מיקומים להסרה מבין הנבחרות':'לא נבחרו נקודות למחיקה');return}
 const removing=kind==='delete',num=affected.length;
 const text=removing?`למחוק לצמיתות ${num} מקומות מספריית המקומות? פעולה זו לא תסיר נקודות שכבר נוספו לימי הטיול.`:`להסיר את המיקום של ${num} נקודות? שמות המקומות והרשימות יישארו, וניתן יהיה לאתר אותן שוב.`;
 if(!await confirmOnMap(text,{title:removing?'מחיקת נקודות בקבוצה':'איפוס מיקומים בקבוצה',accept:removing?'מחק נקודות':'הסר מיקומים'}))return;
 const changed=new Set(affected.map(p=>p.id));
 if(removing)savedPlaces.places=savedPlaces.places.filter(p=>!changed.has(p.id));
 else affected.forEach(p=>{p.lat=null;p.lng=null;p.positionSource=''});
 const visited=smartGeoVisited();for(const id of changed){visited.delete(id);smartGeoSuggestions.delete(id);savedPlaceSelected.delete(id)}
 smartGeoSaveVisited(visited);smartGeoPersistSuggestions();
 map?.closePopup();await persistSavedPlaces();renderSavedPlaceMarkers();
 showSavedPlaceLibrary();toast(removing?`נמחקו ${num} מקומות`:`הוסרו ${num} מיקומים; המקומות נשמרו`);
}
function savedPlaceBulkAction(action){
 const lists=savedPlaces.lists;
 if(action==='select'||action==='deselect'){
  const visible=action==='select';lists.forEach(x=>x.visible=visible);
  persistSavedPlaces();renderSavedPlaceMarkers();refreshSavedCollections();
 }else if(action==='expand'||action==='collapse'){
  const open=action==='expand';savedExpandedLists.clear();savedExpandedGroups.clear();
  if(open)lists.forEach(x=>{savedExpandedLists.add(x.id);savedExpandedGroups.add(savedGroupKey(x.id,'located'));savedExpandedGroups.add(savedGroupKey(x.id,'missing'))});
  refreshSavedCollections();
 }
}
function bindSavedPlaceCollectionActions(scope){
 const toggleRename=(containerAttr,id)=>{
  const editor=[...scope.querySelectorAll('['+containerAttr+']')].find(x=>x.dataset[containerAttr.slice(5).replace(/-([a-z])/g,(_,l)=>l.toUpperCase())]===id);
  if(!editor)return;
  scope.querySelectorAll('.ronny-rename-row').forEach(x=>{if(x!==editor)x.hidden=true});
  editor.hidden=!editor.hidden;
  if(!editor.hidden){editor.querySelector('input')?.focus();editor.querySelector('input')?.select()}
 };
 const commitSavedPlaceName=async id=>{
  const place=savedPlaces.places.find(p=>p.id===id);
  const editor=[...scope.querySelectorAll('[data-saved-editor]')].find(x=>x.dataset.savedEditor===id);
  const next=editor?.querySelector('input')?.value.trim().slice(0,250);
  if(!place||!next){toast('נא להזין שם מקום');return}
  place.name=next;await persistSavedPlaces();renderSavedPlaceMarkers();refreshSavedCollections();toast('שם המקום נשמר');
 };
 const commitSavedListName=async id=>{
  const list=savedPlaces.lists.find(x=>x.id===id);
  const editor=[...scope.querySelectorAll('[data-saved-list-editor]')].find(x=>x.dataset.savedListEditor===id);
  const next=editor?.querySelector('input')?.value.trim().slice(0,130);
  if(!list||!next){toast('נא להזין שם רשימה');return}
  list.name=next;await persistSavedPlaces();refreshSavedCollections();toast('שם הרשימה נשמר');
 };
 scope.querySelectorAll('[data-saved-row]').forEach(row=>{
  const act=()=>{const p=savedPlaces.places.find(x=>x.id===row.dataset.savedRow);if(!p)return;if(!validSavedLatLng(p)){searchPlaceCandidates(p.id);return}const l=savedPlaceBucket(p);if(l&&!l.visible){l.visible=true;persistSavedPlaces();renderSavedPlaceMarkers()}closeDrawer();map?.flyTo([p.lat,p.lng],12,{duration:.5})};
  row.addEventListener('click',e=>{if(e.target.closest('button,a,input,textarea,select,label,.ronny-rename-row'))return;act()});
  row.addEventListener('keydown',e=>{if(e.target===row&&(e.key==='Enter'||e.key===' ')){e.preventDefault();act()}});
 });
 scope.querySelectorAll('[data-saved-select]').forEach(ch=>ch.onchange=()=>{
  ch.checked?savedPlaceSelected.add(ch.dataset.savedSelect):savedPlaceSelected.delete(ch.dataset.savedSelect);
  ch.closest('.saved-place-row')?.classList.toggle('ronny-saved-selected',ch.checked);
  savedPlaceSelectionUI();
 });
 scope.querySelectorAll('[data-saved-select-list]').forEach(ch=>ch.onchange=()=>{
  savedPlaces.places.filter(p=>p.listId===ch.dataset.savedSelectList&&savedPlaceMatches(p)).forEach(p=>ch.checked?savedPlaceSelected.add(p.id):savedPlaceSelected.delete(p.id));
  refreshSavedCollections();savedPlaceSelectionUI();
 });
 scope.querySelectorAll('[data-saved-clear]').forEach(b=>b.onclick=()=>clearSavedPlaceLocation(b.dataset.savedClear));
 scope.querySelectorAll('[data-saved-delete]').forEach(b=>b.onclick=()=>deleteSavedPlace(b.dataset.savedDelete));
 savedPlaceSelectionUI();
 scope.querySelectorAll('[data-saved-edit]').forEach(b=>b.onclick=()=>toggleRename('data-saved-editor',b.dataset.savedEdit));
 scope.querySelectorAll('[data-saved-cancel]').forEach(b=>b.onclick=()=>b.closest('.ronny-rename-row').hidden=true);
 scope.querySelectorAll('[data-saved-save]').forEach(b=>b.onclick=()=>commitSavedPlaceName(b.dataset.savedSave));
 scope.querySelectorAll('[data-saved-name]').forEach(inp=>inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitSavedPlaceName(inp.dataset.savedName)}if(e.key==='Escape'){inp.closest('.ronny-rename-row').hidden=true}});
 scope.querySelectorAll('[data-saved-list-edit]').forEach(b=>b.onclick=()=>toggleRename('data-saved-list-editor',b.dataset.savedListEdit));
 scope.querySelectorAll('[data-saved-list-cancel]').forEach(b=>b.onclick=()=>b.closest('.ronny-rename-row').hidden=true);
 scope.querySelectorAll('[data-saved-list-save]').forEach(b=>b.onclick=()=>commitSavedListName(b.dataset.savedListSave));
 scope.querySelectorAll('[data-saved-list-name]').forEach(inp=>inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitSavedListName(inp.dataset.savedListName)}if(e.key==='Escape'){inp.closest('.ronny-rename-row').hidden=true}});
 scope.querySelectorAll('[data-saved-list-toggle]').forEach(el=>el.onclick=()=>{const id=el.dataset.savedListToggle;savedExpandedLists.has(id)?savedExpandedLists.delete(id):savedExpandedLists.add(id);refreshSavedCollections()});
 scope.querySelectorAll('[data-saved-group]').forEach(el=>el.onclick=()=>{const key=el.dataset.savedGroup;savedExpandedGroups.has(key)?savedExpandedGroups.delete(key):savedExpandedGroups.add(key);refreshSavedCollections()});
 scope.querySelectorAll('[data-saved-more]').forEach(el=>el.onclick=()=>{const key=el.dataset.savedMore;savedGroupLimits.set(key,(savedGroupLimits.get(key)||30)+30);refreshSavedCollections()});
 scope.querySelectorAll('[data-saved-visible]').forEach(el=>el.onclick=()=>{const list=savedPlaces.lists.find(x=>x.id===el.dataset.savedVisible);if(list){list.visible=!list.visible;persistSavedPlaces();renderSavedPlaceMarkers();el.setAttribute('aria-pressed',String(list.visible));el.setAttribute('aria-label',(list.visible?'הסתר':'הצג')+' את '+list.name+' במפה');el.title=(list.visible?'הסתר':'הצג')+' את '+list.name+' במפה';el.innerHTML=icon(list.visible?'eye':'eye-off','small-icon');refreshIcons()}});
 scope.querySelectorAll('[data-saved-add]').forEach(el=>el.onclick=()=>useSavedPlace(el.dataset.savedAdd,planningResolution==='day'?'day':'outline'));
 scope.querySelectorAll('[data-saved-resolve]').forEach(el=>el.onclick=()=>searchPlaceCandidates(el.dataset.savedResolve));
 refreshIcons();
}

/* RONNY 35.16 — free, careful Google Takeout coordinate recovery using Photon.
   Public demo: capped batches, one request at a time, pause and human review. */
const GEO_REPAIR_ATTEMPTS_KEY='ronny-photon-reviewed-context-v2';
const GEO_COUNTRIES={
 'איטליה':'IT','italy':'IT','שוויץ':'CH','switzerland':'CH','slovakia':'SK','סלובקיה':'SK',
 'אלבניה':'AL','albania':'AL','פולין':'PL','poland':'PL','צכיה':'CZ','צ׳כיה':'CZ','czech':'CZ',
 'אנגליה':'GB','scotland':'GB','סקוטלנד':'GB','britain':'GB','united kingdom':'GB',
 'ספרד':'ES','spain':'ES','ניו זילנד':'NZ','new zealand':'NZ','מונטנגרו':'ME','montenegro':'ME',
 'כרתים':'GR','crete':'GR','greece':'GR','יוון':'GR','קזחסטן':'KZ','kazakhstan':'KZ',
 'ארהב':'US','usa':'US','united states':'US','צרפת':'FR','france':'FR','אוסטריה':'AT','austria':'AT',
 'גרמניה':'DE','germany':'DE','אוסטרליה':'AU','australia':'AU','אירלנד':'IE','ireland':'IE','ישראל':'IL','israel':'IL','הונגריה':'HU','hungary':'HU',
 'קרואטיה':'HR','croatia':'HR','סלובניה':'SI','slovenia':'SI','פורטוגל':'PT','portugal':'PT'
};
const GEO_COUNTRY_EN={IT:'Italy',CH:'Switzerland',SK:'Slovakia',AL:'Albania',PL:'Poland',CZ:'Czechia',GB:'United Kingdom',ES:'Spain',NZ:'New Zealand',ME:'Montenegro',GR:'Greece',KZ:'Kazakhstan',US:'United States',FR:'France',AT:'Austria',DE:'Germany',AU:'Australia',IE:'Ireland',IL:'Israel',HU:'Hungary',HR:'Croatia',SI:'Slovenia',PT:'Portugal'};
let smartGeoBusy=false,smartGeoAbort=null,smartGeoRunStatus='',smartGeoRunProgress={done:0,total:0},smartGeoAutoApprove=true;
const SMART_GEO_SUGGESTIONS_KEY='ronny-photon-review-v38';
