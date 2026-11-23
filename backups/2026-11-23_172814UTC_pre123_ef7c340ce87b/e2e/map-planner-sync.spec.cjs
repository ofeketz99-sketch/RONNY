'use strict';
const {test,expect}=require('@playwright/test');
const trip={
 version:3,title:'בדיקת סנכרון מפה ולוח זמנים',startDate:'2026-11-01',
 settings:{travelMode:'driving',mapStyle:'osm',planningResolution:'day'},
 days:[{label:'יום בדיקה',stops:[
  {id:'origin',name:'נקודת התחלה',type:'start',lat:46.040,lng:7.800,time:'09:00',duration:0,cost:0},
  {id:'via',name:'עצירת ביניים',type:'via',lat:46.041,lng:7.801,time:'10:00',duration:30,cost:0,leg:{fromId:'origin',mode:'straight',minutes:5,path:[]}},
  {id:'finish',name:'סיום',type:'end',lat:46.042,lng:7.802,time:'11:00',duration:0,cost:0,leg:{fromId:'via',mode:'straight',minutes:5,path:[]}}
 ]}]
};
test('clicking map markers keeps exactly one matching schedule card highlighted',async({page})=>{
 await page.addInitScript(data=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-marker-sync-test')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(data));
   localStorage.setItem('ronny-marker-sync-test','1');
  }
 },trip);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 const via=page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="via"]');
 const origin=page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="origin"]');
 await expect(via).toBeVisible();
 await via.click();
 await expect(page.locator('#point-quick')).toHaveClass(/open/);
 await expect(page.locator('#schedule .stop.focused')).toHaveCount(1);
 await expect(page.locator('#schedule [data-stop="via"]')).toHaveClass(/focused/);
 await origin.click();
 await expect(page.locator('#schedule .stop.focused')).toHaveCount(1);
 await expect(page.locator('#schedule [data-stop="origin"]')).toHaveClass(/focused/);
 await expect(page.locator('#schedule [data-stop="via"]')).not.toHaveClass(/focused/);
 await page.locator('#schedule [data-stop="via"]').click();
 await expect(page.locator('#schedule .stop.focused')).toHaveCount(1);
 await expect(page.locator('#schedule [data-stop="via"]')).toHaveClass(/focused/);
 await expect(page.locator('#point-quick')).not.toHaveClass(/open/);
});
