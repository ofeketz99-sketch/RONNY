'use strict';
const {test,expect}=require('@playwright/test');
const stop=(id,type,time,lat,lng,other={})=>({id,type,name:id,time,lat,lng,duration:0,cost:0,...other});
const trip={version:3,title:'בדיקת יום ללא שעות',startDate:'2026-10-31',settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day'},
 days:[{label:'טיול ללא תזמון',scheduleEnabled:false,stops:[
  stop('origin','start','10:20',32,34),
  stop('pause','rest','11:10',32.01,34.01,{duration:30,leg:{fromId:'origin',mode:'straight',minutes:50}}),
  stop('finish','end','12:10',32.02,34.02,{leg:{fromId:'pause',mode:'straight',minutes:30}})
 ]}]};
async function load(page){
 await page.setViewportSize({width:850,height:820});
 await page.addInitScript(value=>{if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-untimed-e2e')){localStorage.setItem('roam-trip-v2',JSON.stringify(value));localStorage.setItem('ronny-untimed-e2e','1')}},trip);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#map-scope').evaluate(el=>{el.value='day';el.dispatchEvent(new Event('change',{bubbles:true}))});
}
async function open(page,id){
 const marker=page.locator('.leaflet-marker-icon[data-ronny-stop-id="'+id+'"]');
 await expect(marker).toBeAttached();await marker.evaluate(el=>el.click());
 const popup=page.locator('#point-quick[data-mode="day"]');
 await expect(popup).toHaveClass(/open/);return popup;
}
async function saved(page){return page.evaluate(async()=>{
 const request=indexedDB.open('ronny-trip-library-v1',1);
 const db=await new Promise((ok,bad)=>{request.onsuccess=()=>ok(request.result);request.onerror=()=>bad(request.error)});
 try{const q=db.transaction('trips','readonly').objectStore('trips').getAll();
  const rows=await new Promise((ok,bad)=>{q.onsuccess=()=>ok(q.result);q.onerror=()=>bad(q.error)});
  return rows.find(x=>x.id===localStorage.getItem('ronny-active-trip-v1'))?.trip;
 }finally{db.close()}
})}
test('untimed day shows actual start clock fields and an explicit enable action',async({page})=>{
 await load(page);
 await expect(page.locator('body')).toHaveClass(/ronny-no-times/);
 const popup=await open(page,'origin');
 const section=popup.locator('details[data-ronny-point-section="timing"]');
 await expect(section).toHaveAttribute('open','');
 await expect(section.locator('#quick-time')).toBeVisible();
 await expect(section.locator('.ronny-time-trigger')).toBeVisible();
 await expect(section.locator('.ronny-time-schedule-note')).toContainText('התזמון היומי כבוי');
 await section.locator('[data-quick-enable-schedule]').click();
 await expect(page.locator('body')).not.toHaveClass(/ronny-no-times/);
 await expect.poll(async()=>(await saved(page))?.days?.[0]?.scheduleEnabled).toBe(true);
 await expect(popup.locator('#quick-time')).toBeVisible();
});
test('editing a clock on an untimed day activates scheduling and survives a reload',async({page})=>{
 await load(page);
 const popup=await open(page,'origin');
 await popup.locator('#quick-time').locator('..').locator('.ronny-time-trigger').click();
 const dialog=page.locator('#ronny-time-dialog');
 await expect(dialog).toBeVisible();
 await dialog.locator('#ronny-hour').selectOption('08');
 await dialog.locator('#ronny-minute').selectOption('45');
 await dialog.locator('.ronny-time-apply').click();
 await expect.poll(async()=>{const t=await saved(page);return [t?.days?.[0]?.scheduleEnabled,t?.days?.[0]?.stops?.[0]?.time]}).toEqual([true,'08:45']);
 await expect(page.locator('body')).not.toHaveClass(/ronny-no-times/);
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 const again=await open(page,'origin');
 await expect(again.locator('#quick-time')).toHaveValue('08:45');
});
test('untimed intermediate stop shows arrival, departure and dwell fields',async({page})=>{
 await load(page);
 const popup=await open(page,'pause');
 const section=popup.locator('details[data-ronny-point-section="timing"]');
 await expect(section).toHaveAttribute('open','');
 await expect(section.locator('#quick-time')).toBeVisible();
 await expect(section.locator('#quick-outbound')).toBeVisible();
 await expect(section.locator('#quick-duration')).toBeVisible();
});
