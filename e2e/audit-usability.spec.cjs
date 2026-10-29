'use strict';
const {test,expect}=require('@playwright/test');

test('map search refreshes geographic results after switching areas while preserving prior matches locally',async({page})=>{
 const p=(id,type,lat,lng,leg)=>({id,name:id,type,lat,lng,time:'09:00',duration:0,cost:0,...(leg?{leg}:{})});
 const data={version:3,title:'בדיקת חיפוש לפי אזור',startDate:'2026-10-29',
  settings:{travelMode:'driving',mapStyle:'satellite',planningResolution:'day'},
  days:[
   {label:'יום ראשון',stops:[p('a','start',46.02,7.79),p('b','end',46.03,7.8,{fromId:'a',mode:'straight',minutes:10,path:[]})]},
   {label:'יום שני',stops:[p('c','start',48.05,9.5),p('d','end',48.06,9.51,{fromId:'c',mode:'straight',minutes:10,path:[]})]}
  ]};
 const requested=[];
 await page.route('https://photon.komoot.io/api/**',async route=>{
  const url=new URL(route.request().url());
  requested.push({q:url.searchParams.get('q'),lat:+url.searchParams.get('lat'),lon:+url.searchParams.get('lon')});
  const response={features:[{geometry:{type:'Point',coordinates:[+url.searchParams.get('lon'),+url.searchParams.get('lat')]},properties:{name:'castle',city:'mock town'}}]};
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(response)});
 });
 await page.addInitScript(trip=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-audit-search-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(trip));localStorage.setItem('ronny-audit-search-fixture','1');
  }
 },data);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('[data-day="0"].day-pill').click();
 await page.waitForTimeout(800);
 await page.locator('#place-search').fill('castle');
 await expect.poll(()=>requested.length).toBe(1);
 const first=requested[0];
 await expect(page.locator('#search-results')).toContainText('castle');
 await page.locator('#place-search').fill('');
 await page.locator('[data-day="1"].day-pill').click();
 await page.waitForTimeout(800);
 await page.locator('#place-search').fill('castle');
 await expect.poll(()=>requested.length).toBe(2);
 const second=requested[1];
 expect(Math.abs(second.lat-first.lat)).toBeGreaterThan(1);
 expect(Math.abs(second.lon-first.lon)).toBeGreaterThan(1);
 await expect(page.locator('#search-results')).toContainText('castle');
});

test('map-only ideas stay visible and route-marker order does not change with overview optimization',async({page})=>{
 const p=(id,type,lat,lng,leg)=>({id,name:id,type,lat,lng,time:'09:00',duration:0,cost:0,...(leg?{leg}:{})});
 const data={version:3,title:'בדיקת סימון מסלול',startDate:'2026-10-29',
  settings:{travelMode:'driving',mapStyle:'satellite',planningResolution:'day'},
  days:[{label:'יום ראשון',stops:[
   p('origin','start',46.04,7.8),
   p('idea1','idea',46.045,7.81),
   p('via','via',46.05,7.82,{fromId:'origin',mode:'straight',minutes:10,path:[]}),
   p('end','end',46.06,7.83,{fromId:'via',mode:'straight',minutes:10,path:[]})
  ]}]};
 await page.addInitScript(trip=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-audit-markers-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(trip));localStorage.setItem('ronny-audit-markers-fixture','1');
  }
 },data);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('[data-day="0"].day-pill').click();
 await expect(page.locator('.leaflet-marker-icon[data-ronny-stop-id="idea1"]')).toHaveCount(1);
 await expect(page.locator('.leaflet-marker-icon[data-ronny-stop-id="via"]')).toHaveAttribute('data-ronny-route-order','2');
 await expect(page.locator('.leaflet-marker-icon[data-ronny-stop-id="end"]')).toHaveAttribute('data-ronny-route-order','3');
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('.leaflet-marker-icon[data-ronny-stop-id="via"]')).toHaveAttribute('data-ronny-route-order','2');
});
