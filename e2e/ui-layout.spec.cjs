'use strict';
const {test,expect}=require('@playwright/test');
const stop=(id,type,name,lat,lng)=>({id,type,name,lat,lng,time:'09:00',duration:15,cost:0,description:'',notes:''});
const trip={version:3,title:'בדיקת פריסה',startDate:'2027-05-10',settings:{googleKey:'',mapStyle:'osm',travelMode:'driving',plannerUpperHeight:646},photos:[],days:[
 {dayId:'d1',label:'יום ראשון',stops:[stop('a','start','A',46,8),stop('b','via','B',46.02,8.02),stop('c','via','C',46.04,8.04),stop('d','via','D',46.06,8.06),stop('e','end','E',46.08,8.08)]},
 {dayId:'d2',label:'יום שני',stops:[stop('f','start','E',46.08,8.08),stop('g','end','G',46.1,8.1)]}
]};
async function boot(page,size){
 await page.setViewportSize(size);
 await page.route(/router\.project-osrm|routing\.openstreetmap/,route=>route.fulfill({status:503,body:'stub'}));
 await page.addInitScript(value=>{if(!localStorage.getItem('ronny-active-trip-v1'))localStorage.setItem('roam-trip-v2',value)},JSON.stringify(trip));
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('[data-day="0"].day-pill').click();
 await expect(page.locator('#schedule .stop')).toHaveCount(5);
}
const inside=(a,b)=>a.x>=b.x-1&&a.y>=b.y-1&&a.x+a.width<=b.x+b.width+1&&a.y+a.height<=b.y+b.height+1;
for(const size of [{width:1440,height:900},{width:1366,height:768}]){
 test(`schedule is the main planner area at ${size.width}x${size.height}, even with an old saved height`,async({page})=>{
  await boot(page,size);
  const r=await page.evaluate(()=>{
   const s=document.getElementById('schedule').getBoundingClientRect();
   return {schedule:s.height,planner:document.getElementById('planner').getBoundingClientRect().height,full:[...document.querySelectorAll('#schedule .stop')].filter(c=>{const b=c.getBoundingClientRect();return b.top>=s.top-1&&b.bottom<=s.bottom+1}).length};
  });
  expect(r.schedule/r.planner).toBeGreaterThan(.42);
  expect(r.full).toBeGreaterThanOrEqual(3);
 });
}
test('point and route editors open fully inside the map',async({page})=>{
 await boot(page,{width:1440,height:900});
 const pane=await page.locator('.map-pane').boundingBox();
 await page.locator('#schedule .stop[data-stop="b"]').hover();
 await page.locator('#schedule [data-edit="b"]').click();
 await expect(page.locator('#point-quick')).toHaveClass(/open/);
 await page.waitForTimeout(260);
 expect(inside(await page.locator('#point-quick').boundingBox(),pane)).toBe(true);
 await page.keyboard.press('Escape');
 await page.locator('[data-leg-index="1"]').click();
 await expect(page.locator('#leg-editor')).toHaveClass(/open/);
 await page.waitForTimeout(260);
 const leg=await page.locator('#leg-editor').boundingBox();
 expect(inside(leg,pane)).toBe(true);
 expect(leg.width).toBeLessThanOrEqual(380);
 const overlaps=await page.locator('#leg-editor').evaluate(root=>{const boxes=[...root.children].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect());let hits=0;boxes.forEach((a,i)=>boxes.slice(i+1).forEach(b=>{if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)hits++}));return hits});
 expect(overlaps).toBe(0);
});
test('outline mode keeps the level switch and date visible',async({page})=>{
 await boot(page,{width:1440,height:900});
 await page.locator('[data-plan-level="outline"]').click();
 await expect(page.locator('#zoom-workspace')).toBeVisible();
 await expect(page.locator('[data-plan-level="day"]')).toBeVisible();
 await expect(page.locator('#start-date')).toBeVisible();
 await expect(page.locator('#schedule')).toBeHidden();
 await page.locator('[data-plan-level="day"]').click();
 await expect(page.locator('#schedule')).toBeVisible();
});
