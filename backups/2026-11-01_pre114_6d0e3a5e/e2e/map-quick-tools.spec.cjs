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
 for(const id of ['map-distance-measure','layer-filter-toggle','map-outline-guide-toggle','map-google-view'])await expect(page.locator('#'+id)).toBeVisible();
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
 for(const id of ['map-distance-measure','layer-filter-toggle','map-outline-guide-toggle','map-google-view']){
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

test('switch uses two icons only and every click toggles even on the active half',async({page})=>{
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 const capsule=page.locator('#map-base-switch');
 await expect(capsule.locator('span')).toHaveCount(0);
 await expect(capsule.locator('svg')).toHaveCount(2);
 const initial=await capsule.getAttribute('data-style');
 await capsule.locator('[aria-checked="true"]').click();
 await expect(capsule).toHaveAttribute('data-style',initial==='topo'?'satellite':'topo');
 await capsule.locator('[aria-checked="true"]').click();
 await expect(capsule).toHaveAttribute('data-style',initial);
 const rect=await capsule.boundingBox();
 await capsule.click({position:{x:rect.width/2,y:rect.height/2}});
 await expect(capsule).toHaveAttribute('data-style',initial==='topo'?'satellite':'topo');
});
test('Google Maps quick button transfers currently displayed center zoom and type',async({page})=>{
 await page.goto('/index.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#map.leaflet-container')).toBeVisible();
 const link=page.locator('#map-google-view');
 const url=()=>link.evaluate(el=>{
  el.addEventListener('click',e=>e.preventDefault(),{once:true});
  el.click();
  return el.href;
 });
 const first=new URL(await url());
 expect(first.hostname).toBe('www.google.com');
 expect(first.searchParams.get('map_action')).toBe('map');
 expect(first.searchParams.has('viewpoint')).toBe(false);
 expect(first.searchParams.get('center')).toMatch(/^-?\d+\.\d+,-?\d+\.\d+$/);
 const zoom=+first.searchParams.get('zoom');
 expect(zoom).toBeGreaterThan(0);
 await page.locator('.leaflet-control-zoom-in').click();
 const second=new URL(await url());
 expect(+second.searchParams.get('zoom')).toBe(zoom+1);
 await page.locator('#map-base-switch [aria-checked="true"]').click();
 const third=new URL(await url());
 expect(third.searchParams.get('basemap')).not.toBe(second.searchParams.get('basemap'));
 await expect(link).toHaveAttribute('target','_blank');
 await expect(link).toHaveAttribute('rel',/noopener/);
});
