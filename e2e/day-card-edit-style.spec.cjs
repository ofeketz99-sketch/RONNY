'use strict';
const {test,expect}=require('@playwright/test');
const pt=(id,type,lat,lng)=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0});
const trip={version:3,title:'בדיקת עיפרון שקוף',startDate:'2026-10-29',settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day'},days:[
 {label:'יום ראשון',stops:[pt('s1','start',46,7),pt('e1','end',46.01,7.01)]},
 {label:'יום שני',stops:[pt('s2','start',46.01,7.01),pt('e2','end',46.02,7.02)]}
]};
test('day edit pencil inherits card text contrast and darkens softly on hover',async({page})=>{
 await page.addInitScript(data=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-day-edit-style-test')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(data));
   localStorage.setItem('ronny-day-edit-style-test','1');
  }
 },trip);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 const active=page.locator('[data-day="0"].day-pill');
 const inactive=page.locator('[data-day="1"].day-pill');
 const first=page.locator('[data-day-edit="0"]'),second=page.locator('[data-day-edit="1"]');
 await expect(first).toBeVisible();
 for(const [card,button] of [[active,first],[inactive,second]]){
  const info=await page.evaluate(([selectorCard,selectorButton])=>{
   const c=getComputedStyle(document.querySelector(selectorCard)),b=getComputedStyle(document.querySelector(selectorButton));
   return {text:c.color,pencil:b.color,background:b.backgroundColor,border:b.borderTopWidth};
  },[await card.evaluate(e=>'.day-pill[data-day="'+e.dataset.day+'"]'),await button.evaluate(e=>'[data-day-edit="'+e.dataset.dayEdit+'"]')]);
  expect(info.pencil).toBe(info.text);
  expect(info.background).toBe('rgba(0, 0, 0, 0)');
  expect(info.border).toBe('0px');
 }
 await first.hover();
 await expect.poll(()=>first.evaluate(e=>getComputedStyle(e).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
 await first.click();
 await expect(page.locator('#drawer')).toHaveClass(/open/);
});
