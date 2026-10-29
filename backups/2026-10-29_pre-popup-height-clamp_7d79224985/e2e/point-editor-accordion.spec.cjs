
'use strict';
const {test,expect}=require('@playwright/test');
const point=(id,type,name,lat,lng,time,duration)=>({id,type,name,lat,lng,time,duration,cost:0});
const trip={version:3,title:'בדיקת תפריטי נקודה',startDate:'2026-10-29',
 settings:{travelMode:'driving',mapStyle:'streets',planningResolution:'day'},
 days:[{label:'יום בדיקת חלונית',stops:[
 point('test-start','start','תחילת יום',46.04,7.8,'09:00',0),
 point('test-rest','via','עצירת בדיקה',46.05,7.805,'09:40',90),
 point('test-end','end','סוף יום',46.06,7.82,'11:20',0)]}]};

test('point editing keeps advanced menus collapsed, scrollable and inside the map',async({page})=>{
 await page.setViewportSize({width:1420,height:730});
 await page.addInitScript(value=>{
  if(location.hostname==='127.0.0.1'&&!localStorage.getItem('ronny-accordion-fixture')){
   localStorage.setItem('roam-trip-v2',JSON.stringify(value));
   localStorage.setItem('ronny-accordion-fixture','yes');
  }
 },trip);
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await page.locator('#map-scope').evaluate(select=>{select.value='day';select.dispatchEvent(new Event('change',{bubbles:true}))});
 const marker=page.locator('.leaflet-marker-icon[data-ronny-stop-id="test-rest"]');
 await expect(marker).toBeAttached();
 await marker.evaluate(node=>node.click());
 const popup=page.locator('#point-quick[data-mode="day"]');
 await expect(popup).toHaveClass(/open/);
 // Large desktop maps must not trigger the old 738px two-column popup.
 const popupSize=await popup.evaluate(node=>({width:node.getBoundingClientRect().width,
   maxWidth:node.closest('.map-pane').clientWidth}));
 expect(popupSize.width).toBeLessThanOrEqual(338);
 expect(popupSize.width).toBeGreaterThanOrEqual(Math.min(300,popupSize.maxWidth-26));
 await expect(popup.locator('.point-quick-actions button')).toHaveCount(4);
 for(const action of await popup.locator('.point-quick-actions button').all()){
  expect(await action.evaluate(btn=>btn.getBoundingClientRect().width)).toBeGreaterThan(85);
 }

 await expect(popup.locator('#quick-name')).toHaveValue('עצירת בדיקה');
 const menus=popup.locator('details[name="ronny-point-details"]');
 await expect(menus).toHaveCount(4);
 await expect(popup.locator('details[open]')).toHaveCount(0);
 await popup.locator('details[data-ronny-point-section="icons"]>summary').click();
 await expect(popup.locator('.ronny-icon-grid')).toBeVisible();
 const inside=await popup.evaluate(node=>{
  const p=node.getBoundingClientRect(),container=node.closest('.map-pane').getBoundingClientRect();
  return {left:p.left-container.left,right:container.right-p.right,top:p.top-container.top,bottom:container.bottom-p.bottom,
   scrollable:node.querySelector('.point-quick-form').scrollHeight>node.querySelector('.point-quick-form').clientHeight};
 });
 expect(inside.left).toBeGreaterThanOrEqual(-2);
 expect(inside.right).toBeGreaterThanOrEqual(-2);
 expect(inside.top).toBeGreaterThanOrEqual(-2);
 expect(inside.bottom).toBeGreaterThanOrEqual(-2);
 await popup.locator('[data-ronny-icon="glencairn"]').click();
 await expect(popup.locator('.ronny-icon-editor>summary img.ronny-glencairn-icon')).toHaveCount(1);
 await popup.locator('details[data-ronny-point-section="colors"]>summary').click();
 await expect(popup.locator('details[data-ronny-point-section="icons"]')).not.toHaveAttribute('open','');
 await popup.locator('details[data-ronny-point-section="timing"]>summary').click();
 await expect(popup.locator('#quick-duration')).toBeVisible();
 await popup.locator('details[data-ronny-point-section="routes"]>summary').click();
 await expect(popup.locator('[data-point-leg]').first()).toBeVisible();
 await expect(popup.locator('[data-quick-close]')).toBeVisible();

 // Expand near the lower edge: the panel must re-clamp as its height grows.
 await popup.locator('details[data-ronny-point-section="routes"]>summary').click();
 await expect(popup.locator('details[open]')).toHaveCount(0);
 const lowerEdge=await popup.evaluate(node=>{
  const parent=node.closest('.map-pane');
  const bottomY=parent.clientHeight-node.getBoundingClientRect().height-12;
  node.style.top=bottomY+'px';
  return bottomY;
 });
 await popup.locator('details[data-ronny-point-section="icons"]>summary').click();
 await expect.poll(()=>popup.evaluate(node=>{
  const pane=node.closest('.map-pane').getBoundingClientRect();
  return pane.bottom-node.getBoundingClientRect().bottom;
 })).toBeGreaterThanOrEqual(8);
 await expect(popup.locator('[data-quick-delete]')).toBeVisible();

});
