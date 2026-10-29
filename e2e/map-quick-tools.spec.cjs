'use strict';
const {test,expect}=require('@playwright/test');
test('standalone map tools open measure and independent layers/contours',async({page})=>{
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 await expect(page.locator('#map-tools-toggle')).toHaveCount(0);
 await expect(page.locator('#map-tools-side')).toBeHidden();
 await expect(page.locator('#map-top')).toHaveCount(0);
 for(const selector of ['.map-top','#point-quick','#map-quick-views']){
  await expect(page.locator('.map-pane '+selector)).toHaveCount(1);
 }
 const pane=await page.locator('.map-pane').boundingBox();
 const calendar=await page.locator('#map-day-trigger').boundingBox();
 const switchRect=await page.locator('#map-base-switch').boundingBox();
 expect(calendar.x-pane.x).toBeLessThan(90);
 expect(switchRect.x).toBeGreaterThan(calendar.x+calendar.width);
 expect(Math.abs(switchRect.y-calendar.y)).toBeLessThan(6);
 for(const id of ['map-distance-measure','layer-filter-toggle','map-outline-guide-toggle'])await expect(page.locator('#'+id)).toBeVisible();
 await page.locator('#layer-filter-toggle').click();
 await expect(page.locator('#layer-filter-panel [data-layer-key="routeLines"]')).toBeAttached();
 const outlineBox=await page.locator('#map-outline-guide-toggle').boundingBox();
 const openedLayerBox=await page.locator('#layer-filter-panel').boundingBox();
 expect(openedLayerBox.x).toBeGreaterThan(outlineBox.x+outlineBox.width);
 await page.locator('#map-outline-guide-toggle').click();
 await expect(page.locator('#ronny-guide-enabled')).toBeVisible();
 await expect(page.locator('#layer-filter-panel [data-layer-key]')).toHaveCount(0);
 await page.locator('#map-outline-guide-toggle').click();
 await expect(page.locator('#layer-filter-panel')).not.toHaveClass(/open/);
 for(const id of ['map-distance-measure','layer-filter-toggle','map-outline-guide-toggle']){
  const tool=await page.locator('#'+id).boundingBox();
  expect(Math.abs(tool.x-calendar.x)).toBeLessThan(4);
 }
 await page.locator('#map-distance-measure').click();
 await expect(page.locator('#ronny-measure-panel')).toBeVisible();
 await page.locator('#ronny-measure-end').click();
 await expect(page.locator('#ronny-measure-panel')).toBeHidden();
});
test('aerial / topographic switch is exclusive and saves the chosen style',async({page})=>{
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 const group=page.locator('#map-base-switch'),aerial=group.locator('[data-map-base="satellite"]'),topo=group.locator('[data-map-base="topo"]');
 await topo.click();
 await expect(group).toHaveAttribute('data-style','topo');
 await expect(topo).toHaveAttribute('aria-checked','true');
 await expect(aerial).toHaveAttribute('aria-checked','false');
 await aerial.click();
 await expect(group).toHaveAttribute('data-style','satellite');
 await expect(aerial).toHaveAttribute('aria-checked','true');
 await expect(topo).toHaveAttribute('aria-checked','false');
 await expect(page.locator('#ronny-local-save-status')).toHaveAttribute('data-status','saved');
 await page.reload({waitUntil:'domcontentloaded'});
 await expect(group).toHaveAttribute('data-style','satellite');
});
