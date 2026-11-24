'use strict';
const {test,expect}=require('@playwright/test');
const st=(id,type,lat,lng,extra={})=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0,description:'',notes:'',...extra});
const trip=(days,title='בדיקת בלוק הליכה')=>({version:3,title,startDate:'2026-12-01',settings:{googleKey:'',mapStyle:'osm',travelMode:'driving'},photos:[],extraExpenses:[],days:days.map((stops,i)=>({dayId:'d'+(i+1),label:'יום '+(i+1),stops}))});
const walkDay=(extra={})=>[st('s','start',46,7),st('p','parking',46.01,7.01),st('ws','walkStart',46.02,7.02,{name:'נקודת התחלה',walkRetrace:true,...extra}),st('wt','walkTurn',46.03,7.03),st('we','walkEnd',46.02,7.02,{walkLoopSource:'ws'}),st('v','via',46.05,7.05),st('e','end',46.1,7.1)];
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64');
async function stub(context,routing=true){
 await context.route(/router\.project-osrm|routing\.openstreetmap/,route=>{
  if(!routing)return route.fulfill({status:503,body:'stub'});
  const pts=decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()).split(';').map(v=>v.split(',').map(Number));
  const legs=pts.slice(1).map(()=>({distance:1000,duration:600}));
  return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({code:'Ok',routes:[{distance:legs.length*1000,duration:legs.length*600,legs,geometry:{type:'LineString',coordinates:pts}}]})});
 });
 await context.route(/photon\.komoot/,route=>route.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
 await context.route(/tile|arcgisonline|opentopomap|openmaps/,route=>route.fulfill({status:200,contentType:'image/png',body:PNG}));
}
async function boot(page,data,{routing=true}={}){
 await stub(page.context(),routing);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.ronnyErrors=errors;
 await page.addInitScript(value=>{if(!localStorage.getItem('ronny-active-trip-v1'))localStorage.setItem('roam-trip-v2',value)},JSON.stringify(data));
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await expect(page.locator('#trip-name')).toHaveValue(data.title);
 await page.locator('#days [data-day="0"]').click();
 await expect(page.locator('#schedule .stop').first()).toBeVisible();
}
const savedTrip=page=>page.evaluate(async()=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ronny-trip-library-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 try{
  const rows=await new Promise((resolve,reject)=>{const r=db.transaction('trips').objectStore('trips').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const active=localStorage.getItem('ronny-active-trip-v1');
  return (rows.find(x=>x.id===active)||rows[0])?.trip;
 }finally{db.close()}
});
const routeIds=page=>page.locator('#schedule .stop[data-stop]').evaluateAll(list=>list.map(el=>el.dataset.stop));

test('a walk is one block with sub-points and one continuous time line',async({page})=>{
 await boot(page,trip([walkDay()]));
 const block=page.locator('.ronny-walk-block');
 await expect(block).toHaveCount(1);
 await expect(block.locator('.ronny-walk-head')).toContainText('מסלול הליכה');
 await expect(block.locator('.ronny-walk-head')).toContainText('הלוך־חזור');
 const subs=await block.locator('.stop[data-stop]').evaluateAll(list=>list.map(el=>el.dataset.stop));
 expect(subs[0]).toBe('ws');expect(subs).toContain('wt');expect(subs.length).toBe(3);
 await expect(page.locator('.stop[data-stop="p"]')).toHaveCount(1);
 expect(await page.locator('.ronny-walk-block .stop[data-stop="p"]').count()).toBe(0);
 // Wait for the block's styles and layout to settle before measuring the line.
 await expect.poll(()=>block.evaluate(el=>parseFloat(getComputedStyle(el,'::before').width))).toBe(4);
 const line=await block.evaluate(el=>{const css=getComputedStyle(el,'::before'),box=el.getBoundingClientRect(),times=[...el.querySelectorAll('.ronny-time-chip')].map(x=>x.getBoundingClientRect());return {height:parseFloat(css.height),width:parseFloat(css.width),span:times.at(-1).top-times[0].top,box:box.height}});
 expect(line.width).toBe(4);
 expect(line.height).toBeGreaterThanOrEqual(line.span);
 expect(line.height).toBeLessThanOrEqual(line.box);
 expect(page.ronnyErrors).toEqual([]);
});

test('the block moves as a unit from its head and Undo restores it',async({page})=>{
 await boot(page,trip([walkDay()]));
 const before=await routeIds(page);
 const head=page.locator('.ronny-walk-head');
 await head.hover();
 await head.locator('[data-move="1"]').click();
 await expect.poll(()=>routeIds(page)).not.toEqual(before);
 const moved=await routeIds(page);
 expect(moved.indexOf('v')).toBeLessThan(moved.indexOf('ws'));
 expect(moved.indexOf('wt')).toBe(moved.indexOf('ws')+1);
 await page.locator('#ronny-undo').click();
 await expect.poll(()=>routeIds(page)).toEqual(before);
});

test('a same-trail return has a real duration and walking has its own summary',async({page})=>{
 await boot(page,trip([walkDay()]));
 await expect.poll(()=>page.locator('#route-duration').textContent()).not.toBe('—');
 await expect(page.locator('#route-duration')).not.toHaveText('חלקי');
 await expect(page.locator('#route-msg')).not.toContainText('ללא משך');
 await expect(page.locator('#ronny-day-summary')).toContainText('הליכה');
 await expect.poll(async()=>{
  const saved=await savedTrip(page),stops=saved?.days?.[0]?.stops||[],turn=stops.find(s=>s.id==='wt'),end=stops.find(s=>s.type==='walkEnd');
  return !!turn&&!!end&&end.time>turn.time;
 }).toBe(true);
});

test('rounding does not accumulate along the day',async({page})=>{
 const many=Array.from({length:12},(_,i)=>st('r'+i,i?(i===11?'end':'via'):'start',46+i*.001,7+i*.001));
 await stub(page.context());
 await page.route(/router\.project-osrm/,route=>{const pts=decodeURIComponent(new URL(route.request().url()).pathname.split('/').pop()).split(';').map(v=>v.split(',').map(Number)),legs=pts.slice(1).map(()=>({distance:100,duration:61}));return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({code:'Ok',routes:[{distance:100,duration:61,legs,geometry:{type:'LineString',coordinates:pts}}]})})});
 await page.addInitScript(value=>{if(!localStorage.getItem('ronny-active-trip-v1'))localStorage.setItem('roam-trip-v2',value)},JSON.stringify(trip([many],'עיגול')));
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#trip-name')).toHaveValue('עיגול');
 await page.locator('#days [data-day="0"]').click();
 await expect.poll(()=>page.locator('#route-duration').textContent()).not.toBe('—');
 await page.locator('#auto-time').click();
 await expect.poll(async()=>(await savedTrip(page))?.days?.[0]?.stops?.at(-1)?.time).toMatch(/^09:(10|15)$/);
});

test('a walk finish before its turn is refused with a message',async({page})=>{
 await boot(page,trip([walkDay({time:'12:00'})]));
 await page.locator('[data-walk-head="ws"] [data-edit="ws"]').evaluate(el=>el.click());
 const finish=page.locator('#ronny-walk-finish-time'),turn=page.locator('#ronny-walk-turn-time');
 await turn.evaluate(el=>{el.value='14:00';el.dispatchEvent(new Event('change',{bubbles:true}))});
 await finish.evaluate(el=>{el.value='13:00';el.dispatchEvent(new Event('change',{bubbles:true}))});
 await expect(page.locator('#toast')).toContainText('מוקדמת');
 await expect(finish).toHaveValue('');
 await expect.poll(async()=>(await savedTrip(page))?.days?.[0]?.stops?.find(s=>s.id==='ws')?.walkTurnClock).toBe('14:00');
 const saved=await savedTrip(page),walk=saved.days[0].stops.find(s=>s.id==='ws');
 expect(walk.walkFinishClock||'').toBe('');expect(walk.duration).toBeLessThan(720);
});

test('a failed route is marked as an estimate wherever its numbers appear',async({page})=>{
 await boot(page,trip([[st('s','start',46,7),st('m','via',46.2,7.2),st('e','end',46.4,7.4)]]),{routing:false});
 await expect(page.locator('#schedule .drive-note').first()).toContainText('אומדן',{timeout:25000});
 await expect(page.locator('#schedule .drive-note').first()).toContainText('~');
 await expect(page.locator('#ronny-day-summary')).toContainText('אומדן');
 await expect.poll(()=>page.locator('#route-duration').textContent()).toContain('~');
});

test('a distant idea does not zoom out any day',async({page})=>{
 await boot(page,trip([[st('a','start',46.4,7.4),st('b','end',46.5,7.5)],[st('c','start',46.5,7.5,{fromPreviousDayEnd:'b'}),st('d','end',46.52,7.52),st('far','idea',32,35)]]));
 await page.locator('#days [data-day="1"]').click();
 await expect.poll(()=>page.evaluate(()=>document.querySelector('.leaflet-tile-pane .leaflet-tile')?.src?.match(/\/(\d+)\/\d+\/\d+/)?.[1]||'0').then(Number),{timeout:15000}).toBeGreaterThan(10);
});

test('a drawing hidden by a new order is announced and kept',async({page})=>{
 const data=trip([[st('s','start',46,7),st('a','via',46.01,7.01),st('b','via',46.02,7.02,{leg:{fromId:'a',mode:'draw',path:[[46.015,7.03]],viaPoints:[],minutes:10}}),st('e','end',46.03,7.03)]]);
 await boot(page,data);
 const row=page.locator('.stop[data-stop="a"]');await row.hover();await row.locator('[data-move="1"]').click();
 await expect(page.locator('#toast')).toContainText('שרטוט ידני שמור');
 await expect(page.locator('#schedule')).toContainText('שרטוט שמור לסדר הקודם');
 await expect.poll(async()=>(await savedTrip(page))?.days?.[0]?.stops?.find(s=>s.id==='b')?.leg?.path?.length).toBe(1);
});

test('imported duplicate ids and impossible times are repaired',async({page})=>{
 await boot(page,trip([walkDay()]));
 const bad=trip([[st('x','start',47,8,{time:'25:99'}),st('x','end',47.1,8.1)],[st('y','start',47.1,8.1),st('z','end',47.2,8.2)]],'קובץ כפול');bad.days[1].dayId='d1';
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});
 await expect(page.locator('#trip-name')).toHaveValue('קובץ כפול');
 await expect.poll(async()=>(await savedTrip(page))?.title).toBe('קובץ כפול');
 const saved=await savedTrip(page),ids=saved.days.flatMap(d=>d.stops.map(s=>s.id)),days=saved.days.map(d=>d.dayId);
 expect(new Set(ids).size).toBe(ids.length);expect(new Set(days).size).toBe(days.length);
 expect(saved.days[0].stops[0].time).toMatch(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
});

test('leaving a day without a finish uses the product dialog',async({page})=>{
 let nativeDialog=false;page.on('dialog',d=>{nativeDialog=true;d.dismiss()});
 await boot(page,trip([[st('a','start',46,7),st('m','via',46.1,7.1)],[st('c','start',46.2,7.2),st('d','end',46.3,7.3)]]));
 await page.locator('#days [data-day="1"]').click();
 const card=page.locator('.map-confirm-card');
 await expect(card).toContainText('לא נקבעה נקודת סיום');
 await card.locator('button').filter({hasText:'המשך בלי סיום'}).click();
 await expect(page.locator('#days [data-day="1"]')).toHaveAttribute('aria-pressed','true');
 expect(nativeDialog).toBe(false);
});
