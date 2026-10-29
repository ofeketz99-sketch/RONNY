'use strict';
const { test, expect } = require('@playwright/test');

const stop = (id, type, lat, lng, leg) => ({
  id, type, name: id, lat, lng, duration: 0, time: '09:00', cost: 0,
  ...(leg ? { leg } : {})
});
const fixture = (mode='straight', viaCount=0) => ({
  version: 3, title: 'בדיקת סיום עבודה במחשב', startDate: '2026-10-29',
  settings: { travelMode: 'driving', mapStyle: 'streets', planningResolution: 'day' },
  days: [{ label: 'יום בדיקה',
    stops: viaCount ? [
      stop('origin','start',46.04,7.8),
      ...Array.from({length:viaCount},(_,i)=>stop('via'+i,'via',46.04+i*.0003,7.8+i*.0003,
        {fromId:i?'via'+(i-1):'origin',mode:'straight',path:[],minutes:3})),
      stop('finish','end',46.07,7.85,{fromId:'via'+(viaCount-1),mode:'straight',path:[],minutes:3})
    ] : [
      stop('origin','start',46.04,7.8),
      stop('finish','end',46.06,7.82,mode==='auto'?undefined:{fromId:'origin',mode,path:[],minutes:25})
    ]
  }]
});
async function open(page,mode='straight',viaCount=0){
  await page.addInitScript(data=>{
    if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-final-fixture')){
      localStorage.setItem('roam-trip-v2',JSON.stringify(data));
      localStorage.setItem('ronny-final-fixture','yes');
    }
  },fixture(mode,viaCount));
  await page.goto('/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#trip-name')).toHaveValue('בדיקת סיום עבודה במחשב');
  await page.locator('#map-scope').evaluate(select=>{
    select.value='day';
    select.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await expect(page.locator('#route-stops')).toHaveText(String(viaCount?viaCount+2:2));
}
async function saved(page){
  return page.evaluate(async()=>{
    const db=await new Promise((resolve,reject)=>{
      const r=indexedDB.open('ronny-trip-library-v1',1);
      r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
    });
    try{
      const entries=await new Promise((resolve,reject)=>{
        const r=db.transaction('trips','readonly').objectStore('trips').getAll();
        r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);
      });
      return entries.find(x=>x.id===localStorage.getItem('ronny-active-trip-v1'))?.trip;
    }finally{db.close()}
  });
}
async function move(page,box,dx,dy){
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+dx,y+dy,{steps:12});
  await page.mouse.up();
}
async function clickMap(page,x,y){
  const box=await page.locator('#map').boundingBox();
  expect(box).toBeTruthy();
  await page.mouse.click(box.x+box.width*x,box.y+box.height*y);
}

test('dragging a route marker in edit mode persists the position after reload',async({page})=>{
  await open(page);
  await page.locator('#fit-route').click();
  if(!(await page.locator('#route-edit-toggle').isVisible()))await page.locator('#map-tools-toggle').click();
  await page.locator('#route-edit-toggle').click();
  await expect(page.locator('#route-edit-toggle')).toHaveAttribute('aria-pressed','true');
  const marker=page.locator('.leaflet-marker-icon[data-ronny-stop-id="finish"]');
  await expect(marker).toBeVisible();
  // The new tight fit animates for 650ms; do not drag while Leaflet is moving markers.
  await page.waitForTimeout(800);
  const before=(await saved(page)).days[0].stops[1];
  const bounds=await marker.boundingBox();
  expect(bounds).toBeTruthy();
  await move(page,bounds,50,-34);
  await expect.poll(async()=>{
    const p=(await saved(page))?.days?.[0]?.stops?.[1];
    return !!p&&Math.abs(p.lng-before.lng)+Math.abs(p.lat-before.lat)>0.00001;
  }).toBeTruthy();
  const moved=(await saved(page)).days[0].stops[1];
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect.poll(async()=>{
    const p=(await saved(page))?.days?.[0]?.stops?.[1];
    return p?.lat===moved.lat&&p?.lng===moved.lng;
  }).toBeTruthy();
});

test('a day point can be repositioned by direct drag without entering edit mode',async({page})=>{
  await open(page);
  await expect(page.locator('#route-edit-toggle')).toHaveAttribute('aria-pressed','false');
  const marker=page.locator('.leaflet-marker-icon[data-ronny-stop-id="finish"]');
  await expect(marker).toBeVisible();
  await page.waitForTimeout(800);
  const before=(await saved(page)).days[0].stops[1];
  const box=await marker.boundingBox();
  expect(box).toBeTruthy();
  await move(page,box,48,-38);
  await expect.poll(async()=>{
    const p=(await saved(page))?.days?.[0]?.stops?.[1];
    return !!p&&Math.abs(p.lng-before.lng)+Math.abs(p.lat-before.lat)>0.00001;
  }).toBeTruthy();
  await expect(page.locator('#point-quick')).not.toHaveClass(/open/);
});

test('ordinary route drawing supports vertex drag and survives reload',async({page})=>{
  await open(page);
  await page.locator('.leg-open[data-leg-index="1"]').click();
  await expect(page.locator('#leg-editor')).toHaveClass(/open/);
  await page.locator('[data-leg-mode="draw"]').click();
  await expect(page.locator('#leg-draw-banner')).toHaveClass(/active/);
  await clickMap(page,.35,.54);
  await clickMap(page,.61,.65);
  await expect(page.locator('#leg-draw-banner strong')).toContainText('2 נקודות');
  const vertices=page.locator('.leg-draw-vertex');
  await expect(vertices).toHaveCount(2);
  const from=(await saved(page)).days[0].stops[1].leg.path[0];
  const box=await vertices.first().boundingBox();
  expect(box).toBeTruthy();
  await move(page,box,25,-18);
  await expect.poll(async()=>{
    const current=(await saved(page))?.days?.[0]?.stops?.[1]?.leg?.path?.[0];
    return !!current&&(Math.abs(current[0]-from[0])+Math.abs(current[1]-from[1])>.000001);
  }).toBeTruthy();
  await page.locator('#leg-finish').click();
  const shape=(await saved(page)).days[0].stops[1].leg;
  expect(shape.mode).toBe('draw');
  expect(shape.path).toHaveLength(2);
  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  expect((await saved(page)).days[0].stops[1].leg.path).toEqual(shape.path);
});

test('changing a leg cancels obsolete in-flight routing and preserves manual data',async({page})=>{
  let requests=0,release;
  const hold=new Promise(resolve=>{release=resolve});
  await page.route('**/route/v1/**',async route=>{
    requests++;
    await hold;
    try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
      code:'Ok',routes:[{distance:250000,duration:5000,
        geometry:{coordinates:[[7.8,46.04],[7.82,46.06]]},
        legs:[{distance:250000,duration:5000}]}]})})}catch{}
  });
  try{
    await open(page,'auto');
    await expect.poll(()=>requests).toBeGreaterThan(0);
    await page.locator('.leg-open[data-leg-index="1"]').click();
    await page.locator('[data-leg-mode="straight"]').click();
    await page.locator('#leg-duration').fill('25');
    await page.locator('#leg-duration').press('Tab');
    await expect.poll(async()=>(await saved(page))?.days?.[0]?.stops?.[1]?.leg?.mode).toBe('straight');
  }finally{release()}
  await expect(page.locator('#route-msg')).toContainText('מקטעים מחושבים');
  const manual=(await saved(page)).days[0].stops[1].leg;
  expect(manual.mode).toBe('straight');
  await page.reload({waitUntil:'domcontentloaded'});
  expect((await saved(page)).days[0].stops[1].leg.mode).toBe('straight');
});

test('desktop route planner handles 50 local stops without blocking normal controls',async({page})=>{
  const started=Date.now();
  await open(page,'straight',50);
  await expect(page.locator('#schedule [data-stop]')).toHaveCount(52);
  await expect(page.locator('#route-duration')).not.toHaveText('—');
  const renderMs=Date.now()-started;
  console.info('RONNY desktop 52-stop startup and render, ms:',renderMs);
  expect(renderMs).toBeLessThan(20000);
  await page.locator('#rail-help').click();
  await expect(page.locator('#drawer')).toHaveClass(/open/);
  await page.locator('#close-drawer').click();
  await expect(page.locator('#drawer')).not.toHaveClass(/open/);
});
