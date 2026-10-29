'use strict';
const { test, expect } = require('@playwright/test');

test('the real Leaflet map paints a walking loop as legs separate from the final drive', async ({ page }) => {
  const stop = (id, type, name, lat, lng) => ({ id, type, name, lat, lng, time: '09:00', duration: 0, cost: 0 });
  const data = {
    version: 3, title: 'בדיקת ציור מפה', startDate: '2026-10-29',
    settings: { travelMode: 'driving', mapStyle: 'streets', planningResolution: 'day' },
    days: [{ label: 'יום הליכה ונסיעה', stops: [
      stop('car','start','חניה',32,34),
      { ...stop('walk','walkStart','תחילת הליכה',32.01,34.01), duration: 120, walkRetrace: true },
      { ...stop('turn','walkTurn','סיבוב',32.02,34.02), leg: { fromId:'walk', mode:'draw', path:[[32.015,34.017]], minutes:60 } },
      stop('hotel','end','מלון',32.04,34.06)
    ] }]
  };
  await page.addInitScript(trip => {
    if (location.hostname === '127.0.0.1' && !localStorage.getItem('ronny-fixture-map')) {
      localStorage.setItem('roam-trip-v2', JSON.stringify(trip));
      localStorage.setItem('ronny-fixture-map', '1');
    }
  }, data);
  await page.goto('/index.html', { waitUntil:'domcontentloaded' });
  await expect(page.locator('#map.leaflet-container')).toBeVisible();
  await expect(page.locator('#trip-name')).toHaveValue('בדיקת ציור מפה');
  // This select is visually mirrored by the quick-map menu. Trigger the actual change handler.
  await page.locator('#map-scope').evaluate(select => {
    select.value = 'day';
    select.dispatchEvent(new Event('change', { bubbles:true }));
  });
  await expect(page.locator('#route-stops')).toHaveText('5');
  await expect(page.locator('#schedule')).toContainText('סיבוב');
  // The map is configured with preferCanvas; verify painted vector pixels.
  await expect.poll(() => page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('#map .leaflet-overlay-pane canvas'));
    return canvases.filter(c => {
      const ctx = c.getContext('2d');
      if (!ctx || !c.width || !c.height) return false;
      const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
      let visible = 0;
      for (let i = 3; i < pixels.length; i += 64) {
        if (pixels[i] > 0 && ++visible >= 10) return true;
      }
      return false;
    }).length;
  })).toBeGreaterThanOrEqual(1);
  await expect(page.locator('#map')).not.toContainText('אירעה שגיאה בהפעלת האתר');
});

test('whole-trip overview requests missing road shapes and repaints them without a leg click',async({page})=>{
 const s=(id,type,lat,lng)=>({id,type,name:id,lat,lng,time:'09:00',duration:0,cost:0});
 const trip={
  version:3,title:'בדיקת חישוב כבישים בסקירה',startDate:'2026-10-29',
  settings:{travelMode:'driving',mapStyle:'satellite',planningResolution:'day'},
  days:[
   {label:'יום ראשון',stops:[s('start1','start',46.0,7.8),s('end1','end',46.01,7.81)]},
   {label:'יום שני',stops:[s('start2','start',46.01,7.81),s('end2','end',46.04,7.95)]}
  ]
 };
 const requests=[];
 await page.route('https://router.project-osrm.org/route/v1/driving/**',async route=>{
  const url=route.request().url();requests.push(url);
  const path=decodeURIComponent(new URL(url).pathname.split('/route/v1/driving/')[1]);
  const pts=path.split(';').map(v=>v.split(',').map(Number));
  const coords=[];
  for(let i=0;i<pts.length;i++){
   if(i){const a=pts[i-1],b=pts[i];coords.push([(a[0]+b[0])/2+.006,(a[1]+b[1])/2+.005])}
   coords.push(pts[i]);
  }
  if(url.includes('7.950000,46.040000'))await new Promise(done=>setTimeout(done,500));
  const result={code:'Ok',routes:[{distance:(pts.length-1)*8000,duration:(pts.length-1)*900,
   legs:pts.slice(1).map(()=>({distance:8000,duration:900})),
   geometry:{type:'LineString',coordinates:coords}}]};
  await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(result)}).catch(()=>{});
 });
 await page.addInitScript(value=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-overview-road-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(value));
   localStorage.setItem('ronny-overview-road-fixture','yes');
  }
 },trip);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#map-scope').evaluate(select=>{
  select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}));
 });
 await expect(page.locator('#route-msg')).toContainText('מחשב תוואי כבישים');
 await expect.poll(()=>requests.some(s=>s.includes('7.950000,46.040000'))).toBe(true);
 await expect(page.locator('#route-msg')).toContainText('נתיבי כביש מחושבים',{timeout:30000});
 await expect(page.locator('#map')).not.toContainText('אירעה שגיאה בהפעלת האתר');
 // Both days' routings are now cached; opening day 2 no longer needs a new request.
 const count=requests.length;
 await page.locator('[data-day="1"].day-pill').click();
 await expect(page.locator('#map-scope')).toHaveValue('day');
 await page.waitForTimeout(1100);
 expect(requests.length).toBe(count);
});
