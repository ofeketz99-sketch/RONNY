
'use strict';
const {test,expect}=require('@playwright/test');
const stop=(id,type,name,lat,lng,extras={})=>({id,type,name,lat,lng,time:'09:00',duration:0,cost:0,...extras});
async function fixture(page,trip,flag){
 await page.addInitScript(({trip,flag})=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem(flag)){
   localStorage.setItem('roam-trip-v2',JSON.stringify(trip));
   localStorage.setItem(flag,'yes');
  }
 },{trip,flag});
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
}
const workspaceTrip={version:3,title:'שחזור סביבת עבודה',startDate:'2026-10-29',settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day'},days:[
 {dayId:'ws-a',label:'יום 1',stops:[stop('a1','start','מוצא',45.95,7.3),stop('a2','end','סיום 1',45.96,7.31)]},
 {dayId:'ws-b',label:'יום 2',stops:[stop('b1','start','תחילת 2',45.96,7.31),stop('b2','end','סיום 2',46.1,7.45)]}
]};
test('refresh restores selected day and the manually adjusted map viewport',async({page})=>{
 await fixture(page,workspaceTrip,'ronny-workspace-fixture');
 await page.locator('.day-pill').nth(1).click();
 await expect(page.locator('.day-pill').nth(1)).toHaveClass(/active/);
 const plus=page.locator('.leaflet-control-zoom-in');
 await plus.click();
 const bounds=await page.locator('#map').boundingBox();
 await page.mouse.move(bounds.x+bounds.width*0.6,bounds.y+bounds.height*0.53);
 await page.mouse.down();
 await page.mouse.move(bounds.x+bounds.width*0.49,bounds.y+bounds.height*0.46,{steps:8});
 await page.mouse.up();
 const getWorkspace=()=>page.evaluate(()=>{
  const active=localStorage.getItem('ronny-active-trip-v1');
  return JSON.parse(localStorage.getItem('ronny-workspace-v1:'+active)||'null');
 });
 await expect.poll(async()=>{const s=await getWorkspace();return s?.dayId==='ws-b'&&s?.zoom>0;}).toBeTruthy();
 const before=await getWorkspace();
 expect(before.scope).toBe('day');
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(page.locator('.day-pill').nth(1)).toHaveClass(/active/);
 await expect(page.locator('#map-scope')).toHaveValue('day');
 await expect.poll(async()=>{const s=await getWorkspace();return Math.abs(s?.lat-before.lat)+Math.abs(s?.lng-before.lng)+Math.abs(s?.zoom-before.zoom);}).toBeLessThan(0.0002);
});
test('walking start offers pencil immediately without drawing first',async({page})=>{
 const trip={version:3,title:'בחירת עיפרון מראש',startDate:'2026-10-29',settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day'},days:[{label:'מסלול הליכה',stops:[
 stop('origin','start','חניה',32,34),
 stop('walk','walkStart','תחילת הליכה',32.01,34.01,{duration:120,walkRetrace:true}),
 stop('turn','walkTurn','נקודת סיבוב',32.02,34.02),
 stop('finish','end','מלון',32.04,34.06)
 ]}]};
 await fixture(page,trip,'ronny-pencil-fixture');
 await page.locator('#map-scope').evaluate(node=>{node.value='day';node.dispatchEvent(new Event('change',{bubbles:true}))});
 const marker=page.locator('.leaflet-marker-icon[data-ronny-stop-id="walk"]');
 await expect(marker).toBeAttached();
 await marker.evaluate(node=>node.click());
 const quick=page.locator('#point-quick[data-mode="day"]');
 await expect(quick).toHaveClass(/open/);
 await quick.locator('details[data-ronny-point-section="timing"]>summary').click();
 await expect(quick.locator('#walk-edit-pencil-leg')).toBeVisible();
 await quick.locator('#walk-edit-pencil-leg').click();
 await expect(page.locator('#leg-draw-banner')).toHaveClass(/active/);
 await expect(page.locator('#leg-draw-banner strong')).toContainText('עיפרון חופשי • 0 נקודות');
 const box=await page.locator('#map').boundingBox();
 await page.mouse.click(box.x+box.width*0.58,box.y+box.height*0.59);
 await expect(page.locator('#leg-draw-banner strong')).toContainText('1 נקודות');
 await page.locator('#leg-finish').click();
 await expect(page.locator('#leg-editor [data-leg-mode="pencil"]')).toHaveAttribute('aria-pressed','true');
});
