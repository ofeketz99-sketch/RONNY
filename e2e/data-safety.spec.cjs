'use strict';
const {test,expect}=require('@playwright/test');
const stop=(id,type,name,lat,lng,extra={})=>({id,type,name,lat,lng,time:'09:00',duration:0,cost:0,description:'',notes:'',...extra});
const trip=(extra={})=>({version:3,title:'בדיקת בטיחות נתונים',startDate:'2026-12-01',settings:{googleKey:'',mapStyle:'osm',travelMode:'driving',...(extra.settings||{})},photos:extra.photos||[],days:extra.days||[
 {dayId:'d1',label:'יום 1',stops:[stop('a','start','A',47,8),stop('b','end','B',47.1,8.1)]},
 {dayId:'d2',label:'יום 2',stops:[stop('c','start','C',47.1,8.1),stop('d','end','D',47.2,8.2)]},
 {dayId:'d3',label:'יום 3',stops:[stop('e','start','E',47.2,8.2),stop('f','end','F',47.3,8.3)]}
]});
async function stub(context){
 await context.route(/router\.project-osrm|routing\.openstreetmap/,route=>route.fulfill({status:503,body:'stub'}));
 await context.route(/tile|arcgisonline/,route=>route.fulfill({status:200,contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')}));
}
async function boot(page,data,{stubNetwork=true}={}){
 if(stubNetwork)await stub(page.context());
 await page.addInitScript(value=>{if(!localStorage.getItem('ronny-active-trip-v1'))localStorage.setItem('roam-trip-v2',value)},JSON.stringify(data));
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await expect(page.locator('#trip-name')).toHaveValue(data.title);
}
const savedTrip=page=>page.evaluate(async()=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('ronny-trip-library-v1',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
 try{
  const rows=await new Promise((resolve,reject)=>{const r=db.transaction('trips').objectStore('trips').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
  const active=localStorage.getItem('ronny-active-trip-v1');
  return (rows.find(x=>x.id===active)||rows[0])?.trip;
 }finally{db.close()}
});

test('keeping route direction while moving a day never rewrites coordinates',async({page})=>{
 await boot(page,trip());
 await page.locator('#manage-days-trigger').click();
 await page.locator('[data-day-down="d1"]').click();
 await page.locator('[data-order-mode="preserve"]').click();
 await expect.poll(async()=>(await savedTrip(page))?.days?.[0]?.dayId).toBe('d2');
 const saved=await savedTrip(page);
 const first=saved.days.find(d=>d.dayId==='d1').stops.find(s=>s.id==='a');
 expect([first.lat,first.lng]).toEqual([47,8]);
 await expect(page.locator('#ronny-undo')).toBeEnabled();
});

test('a stale second tab cannot erase work saved by the first tab',async({page,context})=>{
 await boot(page,trip());
 const second=await context.newPage();
 await second.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(second.locator('#trip-name')).toHaveValue('בדיקת בטיחות נתונים');
 await page.bringToFront();
 await page.locator('#add-day').click();
 await expect.poll(async()=>(await savedTrip(page))?.days?.length).toBe(4);
 await second.bringToFront();
 await second.locator('#trip-name').fill('שינוי מטאב ישן');
 await second.locator('#trip-name').press('Tab');
 await expect(second.locator('.map-confirm-card')).toContainText('עודכן בטאב אחר');
 const saved=await savedTrip(page);
 expect(saved.days).toHaveLength(4);
 expect(saved.title).toBe('בדיקת בטיחות נתונים');
});

test('a trip with a walk reaches a final total distance without a page error',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await boot(page,trip({days:[{dayId:'w',label:'הליכה',stops:[stop('s','start','S',47,8),stop('ws','walkStart','WS',47.01,8.01,{duration:60,walkLoop:true,leg:{fromId:'s',mode:'straight',path:[],viaPoints:[],minutes:5}}),stop('wt','walkTurn','T',47.02,8.02,{leg:{fromId:'ws',mode:'straight',path:[],viaPoints:[],minutes:30}}),stop('we','walkEnd','E',47.01,8.01,{walkLoopSource:'ws',autoWalkEnd:true,leg:{fromId:'wt',mode:'straight',path:[],viaPoints:[],minutes:30}}),stop('z','end','Z',47.03,8.03,{leg:{fromId:'we',mode:'straight',path:[],viaPoints:[],minutes:5}})]}]}));
 await page.waitForTimeout(800);
 expect(errors).toEqual([]);
});

test('PDF is prepared at paper size and opens the print dialog once the map is drawn',async({page})=>{
 // Real network: request interception keeps scripts inside the print document from loading.
 await page.addInitScript(()=>{window.print=function(){(window.top.__printed=window.top.__printed||[]).push(location.href)}});
 await boot(page,trip(),{stubNetwork:false});
 await page.locator('#data-transfer-btn').click();
 await expect(page.locator('#data-transfer-btn')).toContainText('קובץ');
 await expect(page.locator('#drawer')).toContainText('PDF להדפסה');
 await page.locator('#file-pdf-btn').click();
 await page.locator('#print-layout').selectOption('both-horizontal');
 await page.locator('#print-generate').click();
 await expect.poll(()=>page.evaluate(()=>window.__printed||[]),{timeout:25000}).toEqual(['about:srcdoc']);
 const frame=page.frames().find(f=>f.url()==='about:srcdoc');
 const shape=await frame.evaluate(()=>({map:!!document.querySelector('.export-map.leaflet-container'),lines:document.querySelectorAll('.export-map path').length,width:Math.round(document.body.getBoundingClientRect().width)}));
 expect(shape.map).toBe(true);expect(shape.lines).toBeGreaterThan(0);
 expect(shape.width).toBe(Math.round(277*96/25.4));
 await expect(page.locator('#print-status')).toContainText('שמירה כ־PDF');
 expect(page.context().pages()).toHaveLength(1);
});

test('an imported trip does not inherit the open trip structure',async({page})=>{
 await boot(page,trip({settings:{tripLoop:true,dayGroups:[{id:'g',name:'מקטע',fromDayId:'d1',toDayId:'d2',color:'#2f6f8f'}]}}));
 const incoming=trip();incoming.title='קובץ מיובא';
 await page.locator('#import-file').setInputFiles({name:'trip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(incoming))});
 await expect(page.locator('#trip-name')).toHaveValue('קובץ מיובא');
 await expect.poll(async()=>(await savedTrip(page))?.title).toBe('קובץ מיובא');
 const saved=await savedTrip(page);
 expect(saved.settings.tripLoop).toBeFalsy();
 expect(saved.settings.dayGroups||[]).toHaveLength(0);
});
