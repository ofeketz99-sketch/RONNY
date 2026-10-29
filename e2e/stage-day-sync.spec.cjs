'use strict';
const {test,expect}=require('@playwright/test');
const stop=(id,type,lat,lng)=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0});
const trip={version:3,title:'בדיקת סנכרון מקטעים וימים',startDate:'2026-10-29',settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day',
 dayGroups:[{id:'segment-1',name:'מקטע ראשון',fromDayId:'day-1',toDayId:'day-2',color:'#72947b'}, {id:'segment-2',name:'מקטע שני',fromDayId:'day-7',toDayId:'day-8',color:'#bd977a'}]},
 days:Array.from({length:8},(_,i)=>({dayId:'day-'+(i+1),label:'יום '+(i+1),stops:[
  stop('s'+i,'start',47+i*.05,8+i*.05), stop('e'+i,'end',47+i*.05+.01,8+i*.05+.01)]}))};
test('choosing a segment scrolls day cards to its first day without narrowing the map',async({page})=>{
 await page.addInitScript(data=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-stage-scroll-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(data));localStorage.setItem('ronny-stage-scroll-fixture','1');
  }
 },trip);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('[data-ronny-group-view="segment-2"]').click();
 await expect(page.locator('[data-ronny-group-view="segment-2"]')).toHaveClass(/selected/);
 await expect(page.locator('[data-day="6"].day-pill')).toHaveClass(/active/);
 await expect(page.locator('#map-scope')).toHaveValue('all');
 await expect.poll(()=>page.evaluate(()=>{
  const strip=document.querySelector('#days'),card=strip?.querySelector('[data-day="6"]');
  if(!strip||!card)return false;
  const r=strip.getBoundingClientRect(),c=card.getBoundingClientRect();
  return c.left>=r.left-2&&c.right<=r.right+2;
 })).toBe(true);
 // The map is still the stage overview; it must contain stops from the next day too.
 await expect(page.locator('.leaflet-marker-icon[data-ronny-stop-id="s7"]')).toHaveCount(1);
});
