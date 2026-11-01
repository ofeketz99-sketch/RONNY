'use strict';
const {test,expect}=require('@playwright/test');
const s=(id,type,lat,lng,leg)=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0,...(leg?{leg}:{})});
const journey=()=>({
 version:3,title:'בדיקת בורר מקטעים',startDate:'2026-10-29',
 settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day',
  dayGroups:[{id:'stage1',name:'מקטע אלפיני',fromDayId:'day1',toDayId:'day2',color:'#72947b'},
             {id:'stage2',name:'מקטע אגמים',fromDayId:'day3',toDayId:'day3',color:'#bd977a'}]},
 days:[
  {dayId:'day1',label:'יום ראשון',stops:[s('a','start',46.04,7.8),s('b','end',46.043,7.803,{fromId:'a',mode:'straight',minutes:15,path:[]})]},
  {dayId:'day2',label:'יום שני',stops:[s('c','start',47,8.5),s('d','end',47.01,8.51,{fromId:'c',mode:'straight',minutes:15,path:[]})]},
  {dayId:'day3',label:'יום שלישי',stops:[s('e','start',48,9.4),s('f','end',48.02,9.42,{fromId:'e',mode:'straight',minutes:15,path:[]})]}
 ]
});
async function boot(page,trip){
 await page.addInitScript(data=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-focus-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(data));
   localStorage.setItem('ronny-focus-fixture','yes');
  }
 },trip);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
}
test('stage selector arrows navigate all, first and last stage',async({page})=>{
 await boot(page,journey());
 const bar=page.locator('#ronny-day-groups-bar');
 await expect(bar.locator('[data-group-step="-1"]')).toHaveCount(1);
 await expect(bar.locator('[data-group-step="1"]')).toHaveCount(1);
 await bar.locator('[data-group-step="1"]').click();
 await expect(bar.locator('[data-ronny-group-view="stage1"]')).toHaveClass(/selected/);
 await bar.locator('[data-group-step="1"]').click();
 await expect(bar.locator('[data-ronny-group-view="stage2"]')).toHaveClass(/selected/);
 await expect(bar.locator('[data-group-step="1"]')).toBeDisabled();
 await bar.locator('[data-group-step="-1"]').click();
 await expect(bar.locator('[data-ronny-group-view="stage1"]')).toHaveClass(/selected/);
 await bar.locator('[data-group-step="-1"]').click();
 await expect(bar.locator('[data-ronny-group-view=""]')).toHaveClass(/selected/);
});
test('choosing a compact day fits the map more closely than the former zoom limit',async({page})=>{
 await boot(page,journey());
 await page.locator('[data-day="0"].day-pill').click();
 await expect(page.locator('#map-scope')).toHaveValue('day');
 await expect.poll(async()=>page.evaluate(()=>{
  const sources=[...document.querySelectorAll('#map .leaflet-tile-pane img.leaflet-tile')].map(i=>i.src);
  const levels=sources.map(url=>Number(url.match(/\/tile\/(\d+)\//)?.[1])).filter(Number.isFinite);
  return levels.length?Math.max(...levels):0;
 })).toBeGreaterThan(12);
});
test('day focus ignores distant ideas from another day',async({page})=>{
 const data=journey();
 data.days[2].stops.push(s('distant-idea','idea',60,-5));
 await boot(page,data);
 await page.locator('[data-day="0"].day-pill').click();
 await expect(page.locator('#map-scope')).toHaveValue('day');
 await expect.poll(async()=>page.evaluate(()=>{
  const levels=[...document.querySelectorAll('#map .leaflet-tile-pane img.leaflet-tile')].map(i=>Number(i.src.split('/tile/')[1]?.split('/')[0])).filter(Number.isFinite);
  return levels.length?Math.max(...levels):0;
 })).toBeGreaterThan(12);
});
test('stage focus ignores distant ideas outside the stage',async({page})=>{
 const data=journey();
 data.days[2].stops.push(s('distant-idea','idea',60,-5));
 await boot(page,data);
 await page.locator('[data-ronny-group-view="stage1"]').click();
 await expect(page.locator('[data-ronny-group-view="stage1"]')).toHaveClass(/selected/);
 await expect.poll(async()=>page.evaluate(()=>{
  const levels=[...document.querySelectorAll('#map .leaflet-tile-pane img.leaflet-tile')].map(i=>Number(i.src.split('/tile/')[1]?.split('/')[0])).filter(Number.isFinite);
  return levels.length?Math.max(...levels):0;
 })).toBeGreaterThan(6);
});
test('retrace mode is named out-and-back on the walking route editor',async({page})=>{
 const data=journey();
 data.settings.dayGroups=[];
 data.days=[{dayId:'day1',label:'יום הליכה',stops:[
  s('a','start',46.04,7.8),
  {...s('walk','walkStart',46.045,7.805),walkRetrace:true,duration:90},
  s('turn','walkTurn',46.05,7.813,{fromId:'walk',mode:'draw',path:[[46.047,7.81]],minutes:45}),
  s('hotel','end',46.06,7.82,{fromId:'turn',mode:'straight',path:[],minutes:20})
 ]}];
 await boot(page,data);
 await page.locator('[data-day="0"].day-pill').click();
 const marker=page.locator('#map .leaflet-marker-icon[data-ronny-stop-id="walk"]');
 await expect(marker).toBeVisible();
 await marker.click();
 await expect(page.locator('#point-quick')).toHaveClass(/open/);
 await expect(page.locator('#point-quick .walk-loop-head strong')).toHaveText('מסלול הלוך חזור');
 await expect(page.locator('#walk-retrace-check')).toBeChecked();
});

test('first day and first stage ignore remote map-only pins without changing other fit modes',async({page})=>{
 const fixture=journey();
 fixture.days[0].stops.push(s('remote-idea-first-day','idea',60,-5));
 fixture.days[1].stops=[
  s('c','start',46.06,7.85),
  s('d','end',46.07,7.88,{fromId:'c',mode:'straight',minutes:15,path:[]})
 ];
 await boot(page,fixture);
 const zoom=()=>page.evaluate(()=>{
  const urls=[...document.querySelectorAll('#map .leaflet-tile-pane img.leaflet-tile')].map(i=>i.src);
  const levels=urls.map(u=>Number(u.split('/tile/')[1]?.split('/')[0])).filter(n=>Number.isFinite(n));
  return levels.length?Math.max(...levels):0;
 });
 // The faraway idea should still be counted in the true whole-trip overview.
 await page.locator('[data-ronny-group-view=""]').click();
 await expect.poll(zoom).toBeLessThan(10);
 // Only the first day and first group use the focused first-entity correction.
 await page.locator('[data-day="0"].day-pill').click();
 await expect.poll(zoom).toBeGreaterThan(10);
 await page.locator('[data-ronny-group-view="stage1"]').click();
 await expect.poll(zoom).toBeGreaterThan(8);
 await page.locator('[data-ronny-group-view="stage2"]').click();
 await expect.poll(zoom).toBeGreaterThan(9);
});
