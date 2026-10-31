'use strict';
const {test,expect}=require('@playwright/test');
const pt=(id,type,lat,lng,opts={})=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0,...opts});
const fixture={
 version:3,title:'בדיקת ביטול וסיכום יום',startDate:'2026-10-29',
 settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day'},
 extraExpenses:[{id:'fuel',name:'דלק',amount:30,dayId:'day-u'}],
 days:[{dayId:'day-u',label:'יום נסיעה',stops:[
  pt('home','start',46.04,7.8),
  pt('rest','rest',46.05,7.81,{duration:45,cost:12,leg:{fromId:'home',mode:'straight',path:[],minutes:15}}),
  pt('finish','end',46.06,7.82,{time:'12:00',leg:{fromId:'rest',mode:'straight',path:[],minutes:25}})
 ]}]
};
async function open(page){
 await page.addInitScript(trip=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-ux92-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(trip));
   localStorage.setItem('ronny-ux92-fixture','1');
  }
 },fixture);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await expect(page.locator('#trip-name')).toHaveValue(fixture.title);
}
async function position(page,id){
 return page.evaluate(async id=>{
  const db=await new Promise((ok,bad)=>{
   const req=indexedDB.open('ronny-trip-library-v1',1);
   req.onsuccess=()=>ok(req.result);req.onerror=()=>bad(req.error);
  });
  try{
   const records=await new Promise((ok,bad)=>{
    const req=db.transaction('trips','readonly').objectStore('trips').getAll();
    req.onsuccess=()=>ok(req.result);req.onerror=()=>bad(req.error);
   });
   return records.find(r=>r.id===localStorage.getItem('ronny-active-trip-v1'))?.trip?.days?.[0]?.stops?.find(s=>s.id===id);
  }finally{db.close()}
 },id);
}
test('day summary shows costs, dwell and times without any new popup',async({page})=>{
 await open(page);
 const summary=page.locator('#ronny-day-summary');
 await expect(summary).toContainText('09:00–12:00');
 await expect(summary).toContainText('שהייה');
 await expect(summary).toContainText('45');
 await expect(summary).toContainText('42');
 await expect(page.locator('#ronny-undo')).toBeDisabled();
});
test('undo restores a dragged point, including persisted location',async({page})=>{
 await open(page);
 await page.locator('#fit-route').click();
 const marker=page.locator('.leaflet-marker-icon[data-ronny-stop-id="finish"]');
 await expect(marker).toBeVisible();
 await page.waitForTimeout(900);
 const before=await position(page,'finish');
 const b=await marker.boundingBox();expect(b).toBeTruthy();
 await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
 await page.mouse.down();
 await page.mouse.move(b.x+b.width/2+42,b.y+b.height/2-24,{steps:12});
 await page.mouse.up();
 await expect.poll(async()=>{
  const next=await position(page,'finish');
  return next&&Math.hypot(next.lat-before.lat,next.lng-before.lng)>0.00001;
 }).toBeTruthy();
 await expect(page.locator('#ronny-undo')).toBeEnabled();
 await page.locator('#ronny-undo').click();
 await expect.poll(async()=>{
  const next=await position(page,'finish');
  return next&&Math.abs(next.lat-before.lat)<0.000001&&Math.abs(next.lng-before.lng)<0.000001;
 }).toBeTruthy();
 await expect(page.locator('#ronny-undo')).toBeDisabled();
});
