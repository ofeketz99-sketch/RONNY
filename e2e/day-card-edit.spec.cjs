'use strict';
const {test,expect}=require('@playwright/test');
const pt=(id,type,lat,lng)=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0});
const fixture={version:3,title:'בדיקת עריכת כרטיס יום',startDate:'2026-10-29',settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day'},days:[
 {label:'טיול ראשון',stops:[pt('s0','start',46.0,7.0),pt('e0','end',46.01,7.01)]},
 {label:'טיול שני',stops:[pt('s1','start',46.01,7.01),pt('e1','end',46.02,7.02)]}
]};
test('day card pencil opens existing day editor without changing card selection behavior',async({page})=>{
 await page.addInitScript(trip=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-card-edit-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(trip));
   localStorage.setItem('ronny-card-edit-fixture','1');
  }
 },fixture);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await expect(page.locator('.day-pill')).toHaveCount(2);
 await expect(page.locator('[data-day-edit]')).toHaveCount(2);
 await page.locator('[data-day="1"].day-pill').click();
 await expect(page.locator('[data-day="1"].day-pill')).toHaveClass(/active/);
 await expect(page.locator('#drawer')).not.toHaveClass(/open/);
 await page.locator('[data-day-edit="0"]').click();
 await expect(page.locator('[data-day="0"].day-pill')).toHaveClass(/active/);
 await expect(page.locator('#drawer')).toHaveClass(/open/);
 await expect(page.locator('#d-label')).toHaveValue('טיול ראשון');
 await expect(page.locator('[data-day="0"].day-pill')).toHaveAttribute('draggable','true');
});
