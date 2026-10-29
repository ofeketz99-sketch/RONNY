'use strict';
const {test,expect}=require('@playwright/test');
const p=(id,type,lat,lng,leg)=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0,...(leg?{leg}:{})});
const trip={version:3,title:'מבחן צבעי מקטעים',startDate:'2026-10-29',settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day',dayGroups:[
 {id:'g1',name:'מקטע נופי',fromDayId:'d1',toDayId:'d2',color:'#72947b'},
 {id:'g2',name:'מקטע חופי',fromDayId:'d3',toDayId:'d3',color:'#bd977a'}]},
 days:[1,2,3].map((i)=>({dayId:'d'+i,label:'יום '+i,stops:[p('start'+i,'start',46+i*.1,7+i*.1),p('end'+i,'end',46+i*.1+.02,7+i*.1+.02,{fromId:'start'+i,mode:'straight',minutes:20,path:[]})]}))};
test('stage overview has only day starts, colored roads, stage summary, and day edit restores pins',async({page})=>{
 await page.addInitScript(data=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-stage-color-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(data));localStorage.setItem('ronny-stage-color-fixture','yes');
  }
 },trip);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await expect(page.locator('#days .ronny-in-stage')).toHaveCount(3);
 await page.locator('[data-ronny-group-view="g1"]').click();
 await expect(page.locator('#ronny-stage-summary')).toContainText('מקטע נופי');
 await expect(page.locator('#ronny-stage-summary')).toContainText('2 ימים');
 await expect(page.locator('#ronny-stage-summary')).toContainText('ק״מ');
 await expect(page.locator('#map-scope')).toHaveValue('all');
 await expect(page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="start1"]')).toHaveCount(1);
 await expect(page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="start2"]')).toHaveCount(1);
 await expect(page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="end1"]')).toHaveCount(0);
 await expect(page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="start3"]')).toHaveCount(0);
 const colors=()=>page.evaluate(()=>[...document.querySelectorAll('#map .leaflet-overlay-pane path')].map(p=>p.getAttribute('stroke')?.toLowerCase()));
 await expect.poll(colors).toContain('#72947b');
 await page.locator('[data-ronny-group-view=""]').click();
 await expect.poll(colors).toContain('#bd977a');
 await expect(page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="start3"]')).toHaveCount(1);
 await page.locator('[data-day="0"].day-pill').click();
 await expect(page.locator('#map-scope')).toHaveValue('day');
 await expect(page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="end1"]')).toHaveCount(1);
 await expect(page.locator('#ronny-stage-summary')).toBeHidden();
});
