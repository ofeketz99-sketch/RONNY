'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const stop=(id,type,name,lat,lng,extra={})=>({id,type,name,lat,lng,time:'09:00',duration:0,cost:0,description:'',notes:'',...extra});
const baseTrip=()=>({version:3,title:'בדיקת תפקידים ולילות',startDate:'2026-12-01',settings:{googleKey:'',mapStyle:'osm',travelMode:'driving'},photos:[],extraExpenses:[],days:[
 {dayId:'d1',label:'יום 1',stops:[stop('a','start','בית',47,8),stop('m','via','מעבר',47.05,8.05),stop('b','end','מלון אלפים',47.1,8.1,{cost:500}),stop('food','dining','מסעדת האגם',47.06,8.07,{cost:180,notes:'להזמין מראש',iconId:'glencairn'}),stop('idea','idea','רעיון רחוק',47.2,8.3)]},
 {dayId:'d2',label:'יום 2',stops:[stop('c','start','נקודת יציאה יום 2',47.1,8.1,{fromPreviousDayEnd:'b',autoInheritedStart:true,autoChronoName:true,cost:500}),stop('d','end','מלון שני',47.2,8.2)]},
 {dayId:'d3',label:'יום 3',stops:[stop('e','start','נקודת יציאה יום 3',47.2,8.2,{fromPreviousDayEnd:'d',autoInheritedStart:true,autoChronoName:true}),stop('f','end','סוף',47.3,8.3)]}
]});
async function stub(context){
 await context.route(/router\.project-osrm|routing\.openstreetmap/,route=>route.fulfill({status:503,body:'stub'}));
 await context.route(/photon\.komoot/,route=>route.fulfill({status:200,contentType:'application/json',body:'{"features":[]}'}));
 await context.route(/tile|arcgisonline|opentopomap|openmaps/,route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')}));
}
async function boot(page,data=baseTrip()){
 await stub(page.context());
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
const findStop=(trip,id)=>trip?.days?.flatMap(d=>d.stops).find(s=>s.id===id);
const routeIds=page=>page.locator('#schedule .stop[data-stop]').evaluateAll(list=>list.map(el=>el.dataset.stop));

test('a restaurant moves into the schedule and back in one click, keeping its data',async({page})=>{
 await boot(page);
 expect(await routeIds(page)).toEqual(['a','m','b']);
 const row=page.locator('[data-side-point="food"]');
 await expect(row.locator('.ronny-role-chip')).toContainText('צד');
 await row.locator('[data-side-schedule]').click();
 await expect(page.locator('.stop[data-stop="food"]')).toBeVisible();
 expect(await routeIds(page)).toEqual(['a','m','food','b']);
 await expect(page.locator('.stop[data-stop="food"] .ronny-role-chip')).toContainText('בלו״ז');
 await expect.poll(async()=>findStop(await savedTrip(page),'food')?.role).toBe('stop');
 const scheduled=findStop(await savedTrip(page),'food');
 expect(scheduled).toMatchObject({name:'מסעדת האגם',type:'dining',lat:47.06,lng:8.07,cost:180,notes:'להזמין מראש',iconId:'glencairn',duration:60});
 await page.locator('.stop[data-stop="food"]').hover();
 await page.locator('.stop[data-stop="food"] [data-role-toggle]').click();
 await expect(page.locator('[data-side-point="food"]')).toBeVisible();
 expect(await routeIds(page)).toEqual(['a','m','b']);
 await expect.poll(async()=>Object.hasOwn(findStop(await savedTrip(page),'food'),'role')).toBe(false);
 expect(findStop(await savedTrip(page),'food').duration).toBe(0);
 await page.locator('#ronny-undo').click();
 await expect(page.locator('.stop[data-stop="food"]')).toBeVisible();
 expect(page.ronnyErrors).toEqual([]);
});

test('the point editor shows role and category and changes role in place',async({page})=>{
 await boot(page);
 await page.locator('[data-side-edit="food"]').click();
 const editor=page.locator('#point-quick');
 await expect(editor.locator('[data-point-role="side"]')).toHaveAttribute('aria-checked','true');
 await expect(editor.locator('label[for="quick-type"]')).toHaveText('קטגוריה');
 await editor.locator('[data-point-role="stop"]').click();
 await expect(page.locator('#point-quick [data-point-role="stop"]')).toHaveAttribute('aria-checked','true');
 await expect(page.locator('.stop[data-stop="food"]')).toBeVisible();
 await page.locator('#point-quick [data-point-role="idea"]').click();
 await expect(page.locator('#point-quick [data-point-role="idea"]')).toHaveAttribute('aria-checked','true');
 await expect.poll(async()=>findStop(await savedTrip(page),'food')?.role).toBe('idea');
 expect(findStop(await savedTrip(page),'food').type).toBe('dining');
 await page.locator('#point-quick [data-quick-close]').click();
 await expect(page.locator('[data-side-point="food"] .ronny-role-chip')).toContainText('רעיון');
});

test('the add-point menu creates a scheduled restaurant directly',async({page})=>{
 await boot(page);
 await page.evaluate(()=>document.querySelector('#panel-add').click());
 const menu=page.locator('#map-context');
 await expect(menu).toHaveClass(/open/);
 await menu.locator('[data-tree-role="stop"]').click();
 await expect(menu.locator('[data-tree-role="stop"]')).toHaveAttribute('aria-pressed','true');
 await menu.locator('[data-tree-toggle="activity"]').click();
 await menu.locator('[data-tree-type="dining"]').click();
 await expect.poll(async()=>(await savedTrip(page)).days[0].stops.find(s=>s.type==='dining'&&s.id!=='food')?.role).toBe('stop');
 const route=await routeIds(page);expect(route.length).toBe(4);expect(route[0]).toBe('a');expect(route.at(-1)).toBe('b');
});

test('a night is one place: one marker, one name, one cost',async({page})=>{
 await boot(page);
 await expect(page.locator('#days .ronny-day-link.is-night')).toHaveCount(2);
 await expect(page.locator('.stop[data-stop="b"] .ronny-role-chip')).toContainText('לינה');
 await page.locator('#days [data-day="1"]').click();
 await expect(page.locator('.stop[data-stop="c"] .stop-title')).toHaveText('מלון אלפים');
 await expect(page.locator('.stop[data-stop="c"] .stop-secondary')).toContainText('נספר ביום 1');
 await expect(page.locator('#day-budget')).toHaveText('₪0');
 await page.locator('.stop[data-stop="c"] [data-edit="c"]').evaluate(el=>el.click());
 const editor=page.locator('#point-quick');
 await expect(editor.locator('.ronny-night-card')).toContainText('יום 1');
 await expect(editor.locator('#quick-night-cost')).toHaveValue('500');
 await editor.locator('#quick-name').fill('מלון מתוקן');
 await editor.locator('#quick-night-cost').fill('640');
 await editor.locator('#quick-night-cost').blur();
 await editor.locator('[data-quick-close]').click();
 await expect.poll(async()=>findStop(await savedTrip(page),'b')?.name).toBe('מלון מתוקן');
 const saved=await savedTrip(page);
 expect(findStop(saved,'c').name).toBe('מלון מתוקן');
 expect([findStop(saved,'b').cost,findStop(saved,'c').cost]).toEqual([640,0]);
 await page.locator('#rail-budget').click();
 await expect(page.locator('#drawer-body')).toContainText('₪820');
 await page.locator('#budget-close').click();
 await page.locator('#rail-lodging').click();
 await expect(page.locator('#drawer-body [data-lodge="b"]')).toBeVisible();
 await expect(page.locator('#drawer-body [data-lodge="c"]')).toHaveCount(0);
 await page.locator('#close-drawer').click();
 await page.locator('#fit-route').click();
 const pinsAtNight=await page.evaluate(()=>[...document.querySelectorAll('.leaflet-marker-icon[data-ronny-stop-id]')].map(el=>el.dataset.ronnyStopId));
 expect(pinsAtNight).toContain('b');expect(pinsAtNight).not.toContain('c');
 expect(page.ronnyErrors).toEqual([]);
});

test('moving the night from the next day moves the one shared place',async({page})=>{
 await boot(page);
 await page.locator('#days [data-day="1"]').click();
 await page.locator('.stop[data-stop="c"] [data-edit="c"]').evaluate(el=>el.click());
 await page.locator('#point-quick [data-quick-details]').click();
 await page.locator('#s-lat').fill('47.15');
 await page.locator('#s-lat').blur();
 await page.locator('#finish-stop').click();
 await expect.poll(async()=>findStop(await savedTrip(page),'b')?.lat).toBe(47.15);
 const saved=await savedTrip(page);
 expect(findStop(saved,'c').lat).toBe(47.15);expect(findStop(saved,'c').startDetached).toBeUndefined();
});

test('a transfer between days is visible, editable, kept in place and reversible',async({page})=>{
 await boot(page);
 await page.locator('#days .ronny-day-link').first().click();
 await page.locator('#point-quick [data-night-transfer]').click();
 const card=page.locator('#point-quick .ronny-transfer-card');
 await expect(card).toBeVisible();
 await expect(page.locator('#days .ronny-day-link.is-transfer')).toHaveCount(1);
 await card.locator('#quick-transfer-kind').selectOption('flight');
 await card.locator('#quick-transfer-note').fill('LY 345');
 await card.locator('#quick-transfer-note').blur();
 await expect.poll(async()=>findStop(await savedTrip(page),'c')?.dayTransfer?.kind).toBe('flight');
 await page.evaluate(()=>{document.querySelector('[data-quick-close]').click()});
 await expect(page.locator('#schedule .ronny-link-band')).toContainText('טיסה');
 await expect(page.locator('#schedule .ronny-link-band')).toContainText('LY 345');
 await page.locator('#days [data-day="0"]').click();
 await page.locator('#days [data-day="1"]').click();
 await page.waitForTimeout(150);
 let saved=await savedTrip(page);
 expect(findStop(saved,'c').startDetached).toBe(true);
 await page.locator('#schedule .ronny-link-band').click();
 await page.locator('#point-quick [data-relink-start]').click();
 await expect(page.locator('#days .ronny-day-link.is-transfer')).toHaveCount(0);
 await expect.poll(async()=>findStop(await savedTrip(page),'c')?.dayTransfer).toBeUndefined();
 saved=await savedTrip(page);
 expect(findStop(saved,'c').startDetached).toBeUndefined();
 expect(page.ronnyErrors).toEqual([]);
});

for(const mode of ['preserve','adapt']){
 test(`reordering days (${mode}) keeps coordinates and shows the new gaps`,async({page})=>{
  await boot(page);
  const before=await savedTrip(page).then(t=>t||baseTrip());
  const coords=new Map(baseTrip().days.flatMap(d=>d.stops).map(s=>[s.id,[s.lat,s.lng]]));
  await page.locator('#manage-days-trigger').click();
  await page.locator('[data-day-down="d1"]').click();
  await page.locator(`[data-order-mode="${mode}"]`).click();
  await expect.poll(async()=>(await savedTrip(page))?.days?.[0]?.dayId).toBe('d2');
  const saved=await savedTrip(page);
  for(const s of saved.days.flatMap(d=>d.stops)){if(coords.has(s.id))expect([s.lat,s.lng]).toEqual(coords.get(s.id))}
  await page.locator('#days-manager-close').click();
  await expect(page.locator('#days .ronny-day-link.is-transfer').first()).toBeVisible();
  await page.locator('#ronny-undo').click();
  await expect.poll(async()=>(await savedTrip(page))?.days?.[0]?.dayId).toBe('d1');
  expect(before).toBeTruthy();
 });
}

test('deleting a day exposes the gap rather than moving the next start',async({page})=>{
 await boot(page);
 await page.locator('#manage-days-trigger').click();
 await page.locator('[data-day-row="d2"] [data-day-delete], [data-day-row="d2"] [data-delete-day]').first().click();
 await page.locator('.map-confirm-card button').filter({hasText:'מחק יום'}).click();
 await expect.poll(async()=>(await savedTrip(page))?.days?.length).toBe(2);
 const saved=await savedTrip(page);
 expect([findStop(saved,'e').lat,findStop(saved,'e').lng]).toEqual([47.2,8.2]);
 expect(findStop(saved,'e').startDetached).toBe(true);
});

test('export and import keep roles, nights and transfers',async({page})=>{
 const data=baseTrip();
 data.days[0].stops.find(s=>s.id==='food').role='stop';
 Object.assign(data.days[1].stops[0],{startDetached:true,fromPreviousDayEnd:undefined,lat:40,lng:20,dayTransfer:{kind:'ferry',note:'לילה',fromDayId:'d1'}});
 await page.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));
 await boot(page,data);
 await expect(page.locator('.stop[data-stop="food"]')).toBeVisible();
 await expect(page.locator('#ronny-local-save-status')).toHaveAttribute('data-status','saved');
 await page.locator('#data-transfer-btn').click();
 await expect(page.locator('#drawer')).toHaveClass(/open/);
 const pending=page.waitForEvent('download');
 await page.locator('#export-btn').click();
 const exported=JSON.parse(fs.readFileSync(await (await pending).path(),'utf8'));
 expect(findStop(exported,'food').role).toBe('stop');
 expect(findStop(exported,'c').dayTransfer).toMatchObject({kind:'ferry',note:'לילה',fromDayId:'d1'});
 expect([findStop(exported,'c').lat,findStop(exported,'c').lng]).toEqual([40,20]);
 await page.locator('#import-file').setInputFiles({name:'trip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
 await expect(page.locator('#toast')).toContainText('הטיול יובא ונשמר');
 await expect(page.locator('#ronny-local-save-status')).toHaveAttribute('data-status','saved');
 const shape=trip=>trip.days.map(d=>({dayId:d.dayId,loop:!!d.loop,stops:d.stops.map(s=>({id:s.id,type:s.type,role:s.role,name:s.name,lat:s.lat,lng:s.lng,cost:s.cost,duration:s.duration,time:s.time,iconId:s.iconId,notes:s.notes,startDetached:s.startDetached,dayTransfer:s.dayTransfer}))}));
 await expect.poll(async()=>shape(await savedTrip(page))).toEqual(shape(exported));
 expect(page.ronnyErrors).toEqual([]);
});

test('legacy types load unchanged and keep their old behaviour',async({page})=>{
 const legacy=baseTrip();
 legacy.days[0].stops=[stop('a','start','בית',47,8),stop('h','hike','שביל',47.01,8.01),stop('r','rest','מנוחה',47.02,8.02,{duration:15}),stop('at','attraction','מוזיאון',47.03,8.03,{duration:30}),stop('o','other','אחר',47.04,8.04),stop('ho','hotel','מלון ישן',47.05,8.05,{cost:300}),stop('b','end','סיום',47.1,8.1)];
 await boot(page,legacy);
 expect(await routeIds(page)).toEqual(['a','h','r','at','ho','b']);
 await expect(page.locator('[data-side-point="o"]')).toBeVisible();
 await expect.poll(async()=>(await savedTrip(page))?.days?.[0]?.stops?.length).toBe(7);
 const saved=await savedTrip(page);
 for(const id of ['h','r','at','o','ho'])expect(Object.hasOwn(findStop(saved,id),'role')).toBe(false);
 expect(findStop(saved,'h').type).toBe('hike');expect(findStop(saved,'ho').cost).toBe(300);
 expect(page.ronnyErrors).toEqual([]);
});
